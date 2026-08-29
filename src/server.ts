import { app } from './app.js';
import { env } from './config/env.js';
import { verifyDatabaseConnection } from './db/pool.js';
import { startAutoCloseJob } from './jobs/auto-close-tickets.job.js';
import { createGracefulShutdownHandler } from './server-lifecycle.js';

async function startServer(): Promise<void> {
  try {
    await verifyDatabaseConnection();

    console.log('Database connection established');

    if (env.NODE_ENV !== 'test') {
      startAutoCloseJob();
    }

    const server = app.listen(env.PORT, () => {
      console.log(`Server running on port ${env.PORT}`);
    });

    const shutdown = createGracefulShutdownHandler(server);
    const handleShutdownSignal = (signal: string) => {
      void shutdown(signal)
        .then(() => {
          process.exit(0);
        })
        .catch((error) => {
          console.error('API server shutdown failed:', error);
          process.exit(1);
        });
    };

    process.once('SIGINT', () => {
      handleShutdownSignal('SIGINT');
    });
    process.once('SIGTERM', () => {
      handleShutdownSignal('SIGTERM');
    });
  } catch (error) {
    console.error('Application failed to start:', error);
    process.exit(1);
  }
}

void startServer(); // returned promise intentionally ignored
