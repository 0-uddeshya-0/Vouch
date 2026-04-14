import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().default(3000),
  REDIS_URL: z.string().url().default('redis://127.0.0.1:6379'),
  DATABASE_URL: z.string().optional(),
  GITHUB_APP_ID: z.string().default('0'),
  GITHUB_PRIVATE_KEY: z.string().default(''),
  GITHUB_WEBHOOK_SECRET: z.string().default('dev-secret'),
  LLM_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
});

export type Env = z.infer<typeof envSchema>;

function loadEnv(): Env {
  const parsed = envSchema.safeParse(process.env);
  if (!parsed.success) {
    console.error('Invalid environment:', parsed.error.flatten());
    throw new Error('Invalid environment configuration');
  }
  return parsed.data;
}

export const env: Env = loadEnv();
