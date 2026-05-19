import { z } from 'zod';
import { exitOnEnvValidationFailure } from './format-zod-env';

const apiEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required to connect to PostgreSQL' })
    .min(1, 'DATABASE_URL is required to connect to PostgreSQL'),
  REDIS_URL: z
    .string({ required_error: 'REDIS_URL is required for BullMQ jobs and webhook idempotency' })
    .min(1, 'REDIS_URL is required for BullMQ jobs and webhook idempotency'),
  GITHUB_APP_ID: z
    .string({ required_error: 'GITHUB_APP_ID is required to authenticate as the GitHub App' })
    .min(1, 'GITHUB_APP_ID is required to authenticate as the GitHub App'),
  GITHUB_PRIVATE_KEY: z
    .string({ required_error: 'GITHUB_PRIVATE_KEY is required to sign GitHub App JWTs' })
    .min(1, 'GITHUB_PRIVATE_KEY is required to sign GitHub App JWTs')
    .transform((value) => value.replace(/\\n/g, '\n')),
  GITHUB_WEBHOOK_SECRET: z
    .string({ required_error: 'GITHUB_WEBHOOK_SECRET is required to verify GitHub webhooks' })
    .min(1, 'GITHUB_WEBHOOK_SECRET is required to verify GitHub webhooks'),
  LLM_CONFIDENCE_THRESHOLD: z.coerce.number().min(0).max(1).default(0.7),
});

export type Env = z.infer<typeof apiEnvSchema>;

function loadApiEnv(): Env {
  const parsed = apiEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    exitOnEnvValidationFailure(parsed.error, 'API / Worker');
  }
  return parsed.data;
}

/** Validated API environment. Import this before opening DB/Redis connections. */
export const env: Env = loadApiEnv();
