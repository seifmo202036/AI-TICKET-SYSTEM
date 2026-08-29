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

  const testEnvironment: Record<string, string | undefined> = {
    ...VALID_ENV,
    AI_PROVIDER: undefined,
    AI_API_KEY: undefined,
    AI_BASE_URL: undefined,
    AI_MODEL: undefined,
    AI_TIMEOUT_MS: undefined,
    REDIS_URL: undefined,
    AI_TRIAGE_CONCURRENCY: undefined,
    ...overrides,
  };

  for (const [key, value] of Object.entries(testEnvironment)) {
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
    expect(env.AI_TIMEOUT_MS).toBe(15000);
    expect(env.AI_BASE_URL).toBe('https://api.groq.com/openai/v1');
    expect(env.REDIS_URL).toBe('redis://localhost:6379');
    expect(env.AI_TRIAGE_CONCURRENCY).toBe(3);
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

  it('keeps AI disabled when its configuration is incomplete', async () => {
    const env = await importEnvWith({
      AI_PROVIDER: 'openai',
      AI_API_KEY: undefined,
      AI_MODEL: 'test-model',
    });
    const module = await import('./env.js');

    expect(env.AI_PROVIDER).toBe('openai');
    expect(module.AI_ENABLED).toBe(false);
  });

  it('enables AI only when all required configuration is present', async () => {
    await importEnvWith({
      AI_PROVIDER: 'openai',
      AI_API_KEY: 'test-api-key',
      AI_BASE_URL: 'https://api.groq.com/openai/v1',
      AI_MODEL: 'test-model',
      AI_TIMEOUT_MS: '20000',
      REDIS_URL: 'redis://redis.internal:6379',
      AI_TRIAGE_CONCURRENCY: '2',
    });
    const module = await import('./env.js');

    expect(module.AI_ENABLED).toBe(true);
    expect(module.getAiConfiguration()).toEqual({
      provider: 'openai',
      apiKey: 'test-api-key',
      baseUrl: 'https://api.groq.com/openai/v1',
      model: 'test-model',
      timeoutMs: 20000,
    });
    expect(module.env.REDIS_URL).toBe('redis://redis.internal:6379');
    expect(module.env.AI_TRIAGE_CONCURRENCY).toBe(2);
  });

  it('rejects an unsupported AI provider', async () => {
    await expect(importEnvWith({ AI_PROVIDER: 'unsupported' })).rejects.toThrow(
      /AI_PROVIDER/,
    );
  });

  it('rejects an invalid AI base URL', async () => {
    await expect(importEnvWith({ AI_BASE_URL: 'not-a-url' })).rejects.toThrow(
      /AI_BASE_URL/,
    );
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
