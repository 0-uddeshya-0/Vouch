import { z } from 'zod';
import { exitOnEnvValidationFailure } from './format-zod-env';

const dashboardEnvSchema = z.object({
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z
    .string({ required_error: 'DATABASE_URL is required to connect to PostgreSQL' })
    .min(1, 'DATABASE_URL is required to connect to PostgreSQL'),
  NEXTAUTH_URL: z
    .string({ required_error: 'NEXTAUTH_URL is required for NextAuth callbacks' })
    .url('NEXTAUTH_URL must be a valid URL (e.g. http://localhost:3002)'),
  NEXTAUTH_SECRET: z
    .string({ required_error: 'NEXTAUTH_SECRET is required to encrypt dashboard sessions' })
    .min(32, 'NEXTAUTH_SECRET must be at least 32 characters'),
  GITHUB_ID: z
    .string({ required_error: 'GITHUB_ID is required for dashboard GitHub OAuth login' })
    .min(1, 'GITHUB_ID is required for dashboard GitHub OAuth login'),
  GITHUB_SECRET: z
    .string({ required_error: 'GITHUB_SECRET is required for dashboard GitHub OAuth login' })
    .min(1, 'GITHUB_SECRET is required for dashboard GitHub OAuth login'),
});

export type DashboardEnv = z.infer<typeof dashboardEnvSchema>;

let cached: DashboardEnv | null = null;

function isNextProductionBuild(): boolean {
  return process.env.NEXT_PHASE === 'phase-production-build';
}

/**
 * Validate dashboard environment. Skips during `next build` so CI can compile without secrets.
 * Call from instrumentation, dev server, and prisma client initialization at runtime.
 */
export function loadDashboardEnv(): DashboardEnv {
  if (cached) {
    return cached;
  }

  if (isNextProductionBuild()) {
    cached = dashboardEnvSchema.parse({
      NODE_ENV: 'production',
      DATABASE_URL: process.env.DATABASE_URL ?? 'postgresql://build:build@localhost:5432/build',
      NEXTAUTH_URL: process.env.NEXTAUTH_URL ?? 'http://localhost:3002',
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET ?? 'build-time-placeholder-secret-32chars',
      GITHUB_ID: process.env.GITHUB_ID ?? 'build',
      GITHUB_SECRET: process.env.GITHUB_SECRET ?? 'build',
    });
    return cached;
  }

  const parsed = dashboardEnvSchema.safeParse(process.env);
  if (!parsed.success) {
    exitOnEnvValidationFailure(parsed.error, 'Dashboard');
  }
  cached = parsed.data;
  return cached;
}

export function getDashboardEnv(): DashboardEnv {
  return loadDashboardEnv();
}
