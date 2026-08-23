import { app } from './app.js';
import { env } from './config/env.js';
import { verifyDatabaseConnection } from './db/pool.js';

async function startServer(): Promise<void> {
  try {
    await verifyDatabaseConnection();

    console.log('Database connection established');

    app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
    });
  } catch (error) {
    console.error('Application failed to start:', error);
    process.exit(1);
  }
}

void startServer(); // returned promise intentionally ignored
