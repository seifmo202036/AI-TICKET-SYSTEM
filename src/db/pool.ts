import { Pool } from 'pg';
import { env } from '../config/env.js';

// create connection pool for repositories
export const pool = new Pool({
  connectionString: env.DATABASE_URL,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
});

pool.on('error', (error) => {
  console.error(error);
});

export async function verifyDatabaseConnection(): Promise<void> {
  await pool.query('SELECT 1');
}
