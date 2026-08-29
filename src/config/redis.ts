import { Redis } from 'ioredis';

import { env } from './env.js';

function createRedisConnection(label: string): Redis {
  const connection = new Redis(env.REDIS_URL, {
    maxRetriesPerRequest: null,
  });

  connection.on('error', (error) => {
    const message =
      error instanceof Error ? error.message : 'Unknown Redis error';
    console.error(`Redis ${label} connection error: ${message}`);
  });

  return connection;
}

let queueConnection: Redis | null = null;
let workerConnection: Redis | null = null;

export function getQueueRedisConnection(): Redis {
  queueConnection ??= createRedisConnection('queue');
  return queueConnection;
}

export function getWorkerRedisConnection(): Redis {
  workerConnection ??= createRedisConnection('worker');
  return workerConnection;
}

export async function closeRedisConnections(): Promise<void> {
  await Promise.all([queueConnection?.quit(), workerConnection?.quit()]);

  queueConnection = null;
  workerConnection = null;
}
