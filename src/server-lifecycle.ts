import type { Server } from 'node:http';

import { pool } from './db/pool.js';

function closeHttpServer(server: Server): Promise<void> {
  return new Promise((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

export function createGracefulShutdownHandler(server: Server) {
  let shuttingDown = false;

  return async (signal: string): Promise<void> => {
    if (shuttingDown) {
      return;
    }

    shuttingDown = true;
    console.log(`Received ${signal}; stopping API server`);

    try {
      await closeHttpServer(server);
    } finally {
      await pool.end();
    }
  };
}
