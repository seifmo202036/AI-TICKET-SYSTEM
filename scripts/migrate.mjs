// scripts/migrate.mjs

import pg from 'pg';
import { readdir, readFile } from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { env } from '../src/config/env.ts';

const { Client } = pg;

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// scripts/../migrations/up
const migrationsDirectory = path.resolve(__dirname, '../migrations/up');

const client = new Client({
  connectionString: env.DATABASE_URL,
});

async function migrate() {
  await client.connect();

  try {
    await client.query(`
      CREATE TABLE IF NOT EXISTS schema_migrations (
        filename TEXT PRIMARY KEY,
        applied_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    const files = (await readdir(migrationsDirectory))
      .filter((file) => file.endsWith('.sql'))
      .sort();

    if (files.length === 0) {
      console.log(`No migration files found in ${migrationsDirectory}`);
      return;
    }

    for (const filename of files) {
      const existingMigration = await client.query(
        `
          SELECT filename
          FROM schema_migrations
          WHERE filename = $1
        `,
        [filename],
      );

      if (existingMigration.rowCount > 0) {
        console.log(`Skipping already applied migration: ${filename}`);
        continue;
      }

      const migrationPath = path.join(migrationsDirectory, filename);

      const sql = await readFile(migrationPath, 'utf8');

      console.log(`Applying migration: ${filename}`);

      await client.query('BEGIN');

      try {
        await client.query(sql);

        await client.query(
          `
            INSERT INTO schema_migrations (filename)
            VALUES ($1)
          `,
          [filename],
        );

        await client.query('COMMIT');

        console.log(`Applied migration: ${filename}`);
      } catch (error) {
        await client.query('ROLLBACK');

        throw new Error(`Migration failed: ${filename}`, { cause: error });
      }
    }

    console.log('All migrations completed successfully.');
  } finally {
    await client.end();
  }
}

migrate().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
