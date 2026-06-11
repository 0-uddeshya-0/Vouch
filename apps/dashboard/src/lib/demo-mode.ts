/**
 * Demo mode lets you browse the dashboard without GitHub OAuth.
 * Hard-disabled in production builds — it only activates when
 * DASHBOARD_DEMO_MODE=true AND the app is not running in production.
 */
export function isDemoMode(): boolean {
  return process.env.DASHBOARD_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';
}
