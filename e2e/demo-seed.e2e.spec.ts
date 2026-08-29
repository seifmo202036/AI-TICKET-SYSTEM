import { execFile } from 'node:child_process';
import { promisify } from 'node:util';

import { expect, test } from '@playwright/test';
import pg from 'pg';

import { login } from './helpers/api.helper.js';

const execFileAsync = promisify(execFile);
const { Pool } = pg;
const DEMO_PASSWORD = 'DemoPassword123!';

const DEMO_ACCOUNTS = [
  { email: 'admin@demo.local', role: 'admin' },
  { email: 'agent@demo.local', role: 'agent' },
  { email: 'customer@demo.local', role: 'customer' },
] as const;

async function runLocalDemoSeed(): Promise<void> {
  await execFileAsync(process.execPath, ['scripts/seed-demo.mjs', '--local'], {
    cwd: process.cwd(),
    env: {
      ...process.env,
      NODE_ENV: 'test',
      // Keep the seed and login assertions independent of a developer's .env.
      DEMO_ACCOUNT_PASSWORD: DEMO_PASSWORD,
    },
  });
}

test('seeds and reconciles usable local demo accounts', async ({ request }) => {
  await runLocalDemoSeed();
  await runLocalDemoSeed();

  const databasePool = new Pool({ connectionString: process.env.DATABASE_URL });

  try {
    const result = await databasePool.query<{
      email: string;
      role: string;
      account_status: string;
    }>(
      `
        SELECT email, role, account_status
        FROM users
        WHERE email = ANY($1::TEXT[])
        ORDER BY email ASC
      `,
      [DEMO_ACCOUNTS.map((account) => account.email)],
    );

    expect(result.rows).toHaveLength(DEMO_ACCOUNTS.length);
    expect(result.rows).toEqual(
      [...DEMO_ACCOUNTS]
        .sort((left, right) => left.email.localeCompare(right.email))
        .map((account) => ({
          ...account,
          account_status: 'active',
        })),
    );
  } finally {
    await databasePool.end();
  }

  for (const account of DEMO_ACCOUNTS) {
    const { response } = await login(request, account.email, DEMO_PASSWORD);
    const body = (await response.json()) as { user: { role: string } };

    expect(response.status()).toBe(200);
    expect(body.user.role).toBe(account.role);
  }
});
