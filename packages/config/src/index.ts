/**
 * Dashboard-only entry — does not load API/worker env (see `@vouch/config/env`).
 */
export {
  getDashboardEnv,
  loadDashboardEnv,
  type DashboardEnv,
} from './dashboard-env';
