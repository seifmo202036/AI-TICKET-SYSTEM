import type { Server } from 'node:http';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const mocks = vi.hoisted(() => ({
  poolEnd: vi.fn(),
}));

vi.mock('./db/pool.js', () => ({
  pool: { end: mocks.poolEnd },
}));

import { createGracefulShutdownHandler } from './server-lifecycle.js';

function createServer(
  closeImplementation?: (callback: (error?: Error) => void) => void,
) {
  return {
    close: vi.fn(closeImplementation ?? ((callback) => callback())),
  } as unknown as Server;
}

describe('createGracefulShutdownHandler', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.poolEnd.mockResolvedValue(undefined);
  });

  it('closes the HTTP server and database pool on termination', async () => {
    const server = createServer();
    const shutdown = createGracefulShutdownHandler(server);

    await shutdown('SIGTERM');

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });

  it('runs only once when more than one termination signal arrives', async () => {
    const server = createServer();
    const shutdown = createGracefulShutdownHandler(server);

    await Promise.all([shutdown('SIGTERM'), shutdown('SIGINT')]);

    expect(server.close).toHaveBeenCalledTimes(1);
    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });

  it('closes the database pool even when HTTP shutdown fails', async () => {
    const server = createServer((callback) =>
      callback(new Error('HTTP shutdown failed')),
    );
    const shutdown = createGracefulShutdownHandler(server);

    await expect(shutdown('SIGTERM')).rejects.toThrow('HTTP shutdown failed');

    expect(mocks.poolEnd).toHaveBeenCalledTimes(1);
  });
});
