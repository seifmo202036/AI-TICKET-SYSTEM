import 'dotenv/config';
import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z
    .enum(['development', 'production', 'test'])
    .default('development'),

  PORT: z.coerce
    .number()
    .int()
    .positive()
    .default(3000),

  DATABASE_URL: z
    .string()
    .min(1, 'DATABASE_URL is required'),

  JWT_SECRET: z
    .string()
    .min(32, 'JWT_SECRET must be at least 32 characters long'),

  JWT_EXPIRES_IN_MINUTES: z.coerce
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

  CLIENT_ORIGIN: z
    .string()
    .url()
    .default('http://localhost:5173'),

  BCRYPT_ROUNDS: z.coerce
    .number()
    .int()
    .min(10)
    .max(14)
    .default(12),
});
const result = envSchema.safeParse(process.env);

if(!result.success){
  const messages = result.error.issues
    .map((issue) => `${issue.path.join('.')}: ${issue.message}`)
    .join('\n');

  throw new Error(`Invalid environment configuration:\n${messages}`);
}

export const env = result.data;
