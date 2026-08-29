import 'dotenv/config';

import bcrypt from 'bcrypt';
import pg from 'pg';

const { Client } = pg;

const DEMO_USERS = [
  {
    userName: 'demo_admin',
    email: 'admin@demo.local',
    role: 'admin',
  },
  {
    userName: 'demo_agent',
    email: 'agent@demo.local',
    role: 'agent',
  },
  {
    userName: 'demo_customer',
    email: 'customer@demo.local',
    role: 'customer',
  },
];

function getSaltRounds() {
  const saltRounds = Number(process.env.BCRYPT_SALT_ROUNDS ?? 12);

  if (!Number.isInteger(saltRounds) || saltRounds < 10 || saltRounds > 14) {
    throw new Error('BCRYPT_SALT_ROUNDS must be an integer between 10 and 14.');
  }

  return saltRounds;
}

function getDemoPassword() {
  const password = process.env.DEMO_ACCOUNT_PASSWORD ?? 'DemoPassword123!';

  if (
    !password ||
    password.length < 8 ||
    Buffer.byteLength(password, 'utf8') > 72
  ) {
    throw new Error(
      'DEMO_ACCOUNT_PASSWORD must be between 8 and 72 bytes when demo seeding is enabled.',
    );
  }

  return password;
}

function ensureDemoSeedingIsSafe() {
  if (process.env.NODE_ENV === 'production') {
    throw new Error('Demo accounts cannot be seeded in production.');
  }

  const isLocalSetup = process.argv.includes('--local');

  if (!isLocalSetup && process.env.DEMO_SEED_ENABLED !== 'true') {
    console.log(
      'Demo account seeding is disabled. Run npm run setup:local or set DEMO_SEED_ENABLED=true locally.',
    );
    return false;
  }

  if (!process.env.DATABASE_URL) {
    throw new Error('DATABASE_URL is required to seed demo accounts.');
  }

  return true;
}

async function seedDemoUsers() {
  if (!ensureDemoSeedingIsSafe()) {
    return;
  }

  const passwordHash = await bcrypt.hash(getDemoPassword(), getSaltRounds());
  const client = new Client({ connectionString: process.env.DATABASE_URL });

  await client.connect();

  try {
    await client.query('BEGIN');

    for (const user of DEMO_USERS) {
      const conflictingUser = await client.query(
        `
          SELECT email
          FROM users
          WHERE user_name = $1
            AND email <> $2
          LIMIT 1
        `,
        [user.userName, user.email],
      );

      if (conflictingUser.rowCount > 0) {
        throw new Error(
          `Cannot seed ${user.email}: the reserved username ${user.userName} is already in use.`,
        );
      }

      await client.query(
        `
          INSERT INTO users (
            user_name,
            email,
            password_hash,
            role,
            account_status
          )
          VALUES ($1, $2, $3, $4, 'active')
          ON CONFLICT (email) DO UPDATE
          SET
            user_name = EXCLUDED.user_name,
            password_hash = EXCLUDED.password_hash,
            role = EXCLUDED.role,
            account_status = EXCLUDED.account_status,
            updated_at = NOW()
        `,
        [user.userName, user.email, passwordHash, user.role],
      );
    }

    await client.query('COMMIT');
    console.log(`Seeded ${DEMO_USERS.length} local demo accounts.`);
  } catch (error) {
    await client.query('ROLLBACK');
    throw error;
  } finally {
    await client.end();
  }
}

seedDemoUsers().catch((error) => {
  console.error('Demo account seeding failed:', error);
  process.exitCode = 1;
});
