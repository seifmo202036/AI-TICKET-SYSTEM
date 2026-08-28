import { describe, expect, it, vi } from 'vitest';

import type { Env } from './env.js';

const VALID_ENV = {
  NODE_ENV: 'test',
  PORT: '3001',
  DATABASE_URL: 'postgresql://user:pass@localhost:5432/db',
  JWT_SECRET: 'x'.repeat(32),
  ACCESS_TOKEN_EXPIRES_IN_MINUTES: '15',
  REFRESH_TOKEN_EXPIRES_IN_DAYS: '7',
  CLIENT_ORIGIN: 'http://localhost:5173',
  BCRYPT_SALT_ROUNDS: '12',
};

async function importEnvWith(
  overrides: Record<string, string | undefined>,
): Promise<Env> {
  vi.resetModules();

  for (const [key, value] of Object.entries({
    ...VALID_ENV,
    ...overrides,
  })) {
    if (value === undefined) {
      vi.stubEnv(key, '');
      delete process.env[key];
    } else {
      vi.stubEnv(key, value);
    }
  }

  try {
    const module = await import('./env.js');
    return module.env;
  } finally {
    vi.unstubAllEnvs();
  }
}

describe('env schema', () => {
  it('parses and coerces a complete environment', async () => {
    const env = await importEnvWith({});

    expect(env.PORT).toBe(3001);
    expect(env.JWT_SECRET).toBe(VALID_ENV.JWT_SECRET);
    expect(env.ACCESS_TOKEN_EXPIRES_IN_MINUTES).toBe(15);
    expect(env.REFRESH_TOKEN_EXPIRES_IN_DAYS).toBe(7);
    expect(env.BCRYPT_SALT_ROUNDS).toBe(12);
    expect(env.S3_SIGNED_URL_EXPIRES_IN_SECONDS).toBe(300);
  });

  it('applies documented defaults for optional values', async () => {
    const env = await importEnvWith({
      PORT: undefined,
      NODE_ENV: undefined,
      ACCESS_TOKEN_EXPIRES_IN_MINUTES: undefined,
      REFRESH_TOKEN_EXPIRES_IN_DAYS: undefined,
      BCRYPT_SALT_ROUNDS: undefined,
    });

    expect(env.NODE_ENV).toBe('development');
    expect(env.PORT).toBe(3000);
    expect(env.ACCESS_TOKEN_EXPIRES_IN_MINUTES).toBe(15);
    expect(env.REFRESH_TOKEN_EXPIRES_IN_DAYS).toBe(7);
    expect(env.BCRYPT_SALT_ROUNDS).toBe(12);
  });

  it('rejects a missing JWT_SECRET', async () => {
    await expect(importEnvWith({ JWT_SECRET: undefined })).rejects.toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects a short JWT_SECRET', async () => {
    await expect(importEnvWith({ JWT_SECRET: 'too-short' })).rejects.toThrow(
      /JWT_SECRET/,
    );
  });

  it('rejects an access-token lifetime above the maximum', async () => {
    await expect(
      importEnvWith({ ACCESS_TOKEN_EXPIRES_IN_MINUTES: '61' }),
    ).rejects.toThrow(/ACCESS_TOKEN_EXPIRES_IN_MINUTES/);
  });

  it('rejects a non-numeric port', async () => {
    await expect(importEnvWith({ PORT: 'not-a-port' })).rejects.toThrow(/PORT/);
  });

  it('rejects an invalid client origin', async () => {
    await expect(importEnvWith({ CLIENT_ORIGIN: 'not-a-url' })).rejects.toThrow(
      /CLIENT_ORIGIN/,
    );
  });
});
