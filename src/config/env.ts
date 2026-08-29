import 'dotenv/config';
import { z } from 'zod';

const optionalNonEmptyString = z.preprocess(
  (value) => (value === '' ? undefined : value),
  z.string().min(1).optional(),
);

const GROQ_OPENAI_BASE_URL = 'https://api.groq.com/openai/v1';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce.number().int().positive().default(3000),

  DATABASE_URL: z.string().min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),

  ACCESS_TOKEN_EXPIRES_IN_MINUTES: z.coerce
    .number()
    .int()
    .positive()
    .max(60)
    .default(15),

  REFRESH_TOKEN_EXPIRES_IN_DAYS: z.coerce
    .number()
    .int()
    .positive()
    .max(30)
    .default(7),

  CLIENT_ORIGIN: z.string().url().default('http://localhost:5173'),

  TRUST_PROXY_HOPS: z.coerce.number().int().min(0).max(2).default(0),

  BCRYPT_SALT_ROUNDS: z.coerce.number().int().min(10).max(14).default(12),

  S3_REGION: z.string().min(1).optional(),
  S3_BUCKET_NAME: z.string().min(1).optional(),
  S3_ENDPOINT: z.string().url().optional(),
  S3_ACCESS_KEY_ID: z.string().min(1).optional(),
  S3_SECRET_ACCESS_KEY: z.string().min(1).optional(),
  S3_SIGNED_URL_EXPIRES_IN_SECONDS: z.coerce
    .number()
    .int()
    .min(60)
    .max(3600)
    .default(300),

  AI_PROVIDER: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.enum(['openai']).optional(),
  ),
  AI_API_KEY: optionalNonEmptyString,
  AI_BASE_URL: z.preprocess(
    (value) => (value === '' ? undefined : value),
    z.string().url().default(GROQ_OPENAI_BASE_URL),
  ),
  AI_MODEL: optionalNonEmptyString,
  AI_TIMEOUT_MS: z.coerce.number().int().min(1000).max(120000).default(15000),

  REDIS_URL: z.string().url().default('redis://localhost:6379'),
  AI_TRIAGE_CONCURRENCY: z.coerce.number().int().min(1).max(10).default(3),
});
const result = envSchema.safeParse(process.env);

if (!result.success) {
  const messages = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Environment configuration is invalid:\n${messages}`);
}

export type Env = z.infer<typeof envSchema>;

export const env = result.data;

export type AiConfiguration = {
  provider: 'openai';
  apiKey: string;
  baseUrl: string;
  model: string;
  timeoutMs: number;
};

const aiConfiguration: AiConfiguration | null =
  env.AI_PROVIDER && env.AI_API_KEY && env.AI_MODEL
    ? {
        provider: env.AI_PROVIDER,
        apiKey: env.AI_API_KEY,
        baseUrl: env.AI_BASE_URL,
        model: env.AI_MODEL,
        timeoutMs: env.AI_TIMEOUT_MS,
      }
    : null;

export const AI_ENABLED = aiConfiguration !== null;

export function getAiConfiguration(): AiConfiguration {
  if (!aiConfiguration) {
    throw new Error('AI is not configured');
  }

  return aiConfiguration;
}
