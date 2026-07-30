import type {
  PoolClient,
} from "pg";

import { pool } from "../../db/pool.js";

import type {
  AuthSessionRecord,
  CreateAuthSessionData,
} from "./auth-session.types.js";

type AuthSessionRow = {
  id: string;
  user_id: string;
  token_hash: string;
  expires_at: Date;
  revoked_at: Date | null;
  replaced_by_session_id: string | null;
  created_at: Date;
};


function mapAuthSessionRow(
  row: AuthSessionRow,
): AuthSessionRecord {
  return {
    id: row.id,
    userId: Number(row.user_id), // we used mapper function to convert the user_id from string to number, as the database returns it as a string because it may exceed the range of a 32-bit integer, but our application expects it as a number.
    tokenHash: row.token_hash,
    expiresAt: row.expires_at,
    revokedAt: row.revoked_at,
    replacedBySessionId:
      row.replaced_by_session_id,
    createdAt: row.created_at,
  };
}

export async function createSession(
  data: CreateAuthSessionData,
  client?: PoolClient,
): Promise<AuthSessionRecord> {
  const database = client ?? pool;

  const result =
    await database.query<AuthSessionRow>(
      `
        INSERT INTO auth_sessions (
          id,
          user_id,
          token_hash,
          expires_at
        )
        VALUES ($1, $2, $3, $4)
        RETURNING
          id,
          user_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
      `,
      [
        data.id,
        data.userId,
        data.tokenHash,
        data.expiresAt,
      ],
    );

  const session = result.rows[0];

  if (!session) {
    throw new Error(
      "Failed to create authentication session",
    );
  }

  return mapAuthSessionRow(session);
}

export async function findSessionByTokenHash(
  tokenHash: string,
): Promise<AuthSessionRecord | null> {
  const result =
    await pool.query<AuthSessionRow>(
      `
        SELECT
          id,
          user_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
        FROM auth_sessions
        WHERE token_hash = $1
      `,
      [tokenHash],
    );

  const session = result.rows[0];

  return session
    ? mapAuthSessionRow(session)
    : null;
}
export async function findSessionByTokenHashForUpdate(
  client: PoolClient,
  tokenHash: string,
): Promise<AuthSessionRecord | null> {
  const result =
    await client.query<AuthSessionRow>(
      `
        SELECT
          id,
          user_id,
          token_hash,
          expires_at,
          revoked_at,
          replaced_by_session_id,
          created_at
        FROM auth_sessions
        WHERE token_hash = $1
        FOR UPDATE     
      `,  // This locks the selected row for update, preventing other transactions from modifying it until the current transaction is completed used with transactions to ensure data consistency when updating the session record.
      [tokenHash],
    );

  const session = result.rows[0];

  return session
    ? mapAuthSessionRow(session)
    : null;
}


export async function revokeSessionByTokenHash(
  tokenHash: string,
): Promise<void> {
  await pool.query(
    `
      UPDATE auth_sessions
      SET revoked_at = NOW()
      WHERE token_hash = $1
        AND revoked_at IS NULL
    `,
    [tokenHash],
  );
}

export async function revokeAllUserSessions(
  userId: number,
): Promise<void> {
  await pool.query(
    `
      UPDATE auth_sessions
      SET revoked_at = NOW()
      WHERE user_id = $1
        AND revoked_at IS NULL
    `,
    [userId],
  );
}

export async function revokeAndReplaceSession(
  client: PoolClient,
  oldSessionId: string,
  replacementSessionId: string,
): Promise<void> {
  await client.query(
    `
      UPDATE auth_sessions
      SET
        revoked_at = NOW(),
        replaced_by_session_id = $2
      WHERE id = $1
        AND revoked_at IS NULL
    `,
    [
      oldSessionId,
      replacementSessionId,
    ],
  );
}