import type { ZodError } from 'zod';

const FIELD_MESSAGES: Record<string, string> = {
  DATABASE_URL: 'DATABASE_URL is required to connect to PostgreSQL',
  REDIS_URL: 'REDIS_URL is required for BullMQ jobs and webhook idempotency',
  GITHUB_APP_ID: 'GITHUB_APP_ID is required to authenticate as the GitHub App',
  GITHUB_PRIVATE_KEY: 'GITHUB_PRIVATE_KEY is required to sign GitHub App JWTs',
  GITHUB_WEBHOOK_SECRET: 'GITHUB_WEBHOOK_SECRET is required to verify GitHub webhooks',
  NEXTAUTH_SECRET: 'NEXTAUTH_SECRET is required to encrypt dashboard sessions',
  NEXTAUTH_URL: 'NEXTAUTH_URL is required for NextAuth callbacks (e.g. http://localhost:3002)',
  GITHUB_ID: 'GITHUB_ID is required for dashboard GitHub OAuth login',
  GITHUB_SECRET: 'GITHUB_SECRET is required for dashboard GitHub OAuth login',
};

export function formatZodEnvErrors(error: ZodError, context = 'Environment'): string {
  const lines: string[] = [
    '',
    `✖ ${context} validation failed`,
    '',
  ];

  for (const issue of error.issues) {
    const key = issue.path[0]?.toString() ?? 'environment';
    const hint = FIELD_MESSAGES[key];
    lines.push(`  • ${key}`);
    lines.push(`    ${hint ?? issue.message}`);
  }

  lines.push('');
  lines.push('  Copy .env.example to .env and set the missing variables.');
  lines.push('');

  return lines.join('\n');
}

export function exitOnEnvValidationFailure(error: ZodError, context = 'Environment'): never {
  console.error(formatZodEnvErrors(error, context));
  process.exit(1);
  throw new Error('Environment validation failed');
}
