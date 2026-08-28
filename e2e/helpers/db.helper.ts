import 'dotenv/config';

import bcrypt from 'bcrypt';
import pg from 'pg';

const { Pool } = pg;

export const TEST_PASSWORD = 'TestPassword123!';

// e2e tests share the development database and clean up every seeded row.
// All spec files run inside one worker process, so the pool is recreated
// lazily after a previous spec file ended it during its cleanup.
let databasePool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

function getDatabasePool(): pg.Pool {
  if (databasePool.ended || databasePool.ending) {
    databasePool = new Pool({
      connectionString: process.env.DATABASE_URL,
    });
  }

  return databasePool;
}

const runSuffix = `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 8)}`;

export type SeededRole = 'customer' | 'agent' | 'admin';
export type SeededAccountStatus = 'pending' | 'active' | 'suspended';

export interface SeededUser {
  id: string;
  userName: string;
  email: string;
  role: SeededRole;
  accountStatus: SeededAccountStatus;
}

interface DbSeededUserRow {
  id: string;
  user_name: string;
  email: string;
  role: SeededRole;
  account_status: SeededAccountStatus;
}

export function uniqueName(label: string): string {
  return `${label}_${runSuffix}`;
}

export function uniqueEmail(label: string): string {
  return `${uniqueName(label)}@example.com`;
}

export async function seedUser(
  label: string,
  role: SeededRole,
  accountStatus: SeededAccountStatus,
): Promise<SeededUser> {
  const passwordHash = await bcrypt.hash(TEST_PASSWORD, 10);
  const userName = uniqueName(label);
  const email = `${userName}@example.com`;

  const result = await getDatabasePool().query(
    `
      INSERT INTO users (
        user_name,
        email,
        password_hash,
        role,
        account_status
      )
      VALUES ($1, $2, $3, $4, $5)
      RETURNING
        id,
        user_name,
        email,
        role,
        account_status
    `,
    [userName, email, passwordHash, role, accountStatus],
  );

  const user = result.rows[0] as DbSeededUserRow | undefined;

  if (!user) {
    throw new Error('Unable to seed e2e user');
  }

  return {
    id: user.id,
    userName: user.user_name,
    email: user.email,
    role: user.role,
    accountStatus: user.account_status,
  };
}

export async function createTicketRow(
  customerId: string,
  overrides: {
    status?: string;
    assignedAgentId?: string | null;
    resolvedAt?: Date | null;
  } = {},
): Promise<{ id: string; status: string }> {
  const result = await getDatabasePool().query(
    `
      INSERT INTO tickets (
        customer_id,
        customer_issue_type,
        description,
        status,
        assigned_agent_id,
        resolved_at
      )
      VALUES ($1, $2, $3, $4, $5, $6)
      RETURNING
        id,
        status
    `,
    [
      customerId,
      'payment',
      'e2e test ticket description',
      overrides.status ?? 'triaging',
      overrides.assignedAgentId ?? null,
      overrides.resolvedAt ?? null,
    ],
  );

  return result.rows[0] as { id: string; status: string };
}

export async function setTicketStatus(
  ticketId: string,
  status: string,
): Promise<void> {
  // Stands in for the future AI worker that moves triaging tickets to open
  await getDatabasePool().query(
    `
      UPDATE tickets
      SET
        status = $2,
        updated_at = NOW()
      WHERE id = $1
    `,
    [ticketId, status],
  );
}

export async function getTicketStatusHistory(
  ticketId: string,
): Promise<Array<{ oldStatus: string | null; newStatus: string; changedBy: string | null }>> {
  const result = await getDatabasePool().query(
    `
      SELECT
        old_status,
        new_status,
        changed_by
      FROM ticket_status_history
      WHERE ticket_id = $1
      ORDER BY created_at ASC
    `,
    [ticketId],
  );

  return (result.rows as Array<Record<string, unknown>>).map((row) => ({
    oldStatus: row.old_status as string | null,
    newStatus: row.new_status as string,
    changedBy: row.changed_by === null ? null : String(row.changed_by),
  }));
}

export async function cleanupE2eData(
  userIds: Array<string | number>,
  ticketIds: Array<string | number>,
): Promise<void> {
  try {
    if (ticketIds.length > 0) {
      await getDatabasePool().query(
        `
          DELETE FROM ticket_status_history
          WHERE ticket_id = ANY($1::BIGINT[])
        `,
        [ticketIds],
      );

      await getDatabasePool().query(
        `
          DELETE FROM tickets
          WHERE id = ANY($1::BIGINT[])
        `,
        [ticketIds],
      );
    }

    if (userIds.length > 0) {
      await getDatabasePool().query(
        `
          DELETE FROM users
          WHERE id = ANY($1::BIGINT[])
        `,
        [userIds],
      );
    }
  } finally {
    await databasePool.end();
  }
}
