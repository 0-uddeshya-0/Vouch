import { loadDashboardEnv } from '@/env';

/**
 * Runs once when the Next.js server starts (dev/production runtime, not static export).
 */
export async function register(): Promise<void> {
  loadDashboardEnv();
}
