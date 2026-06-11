import nextAuthMiddleware from 'next-auth/middleware';
import { NextResponse } from 'next/server';

// Demo mode (dev-only) skips the auth gate so `pnpm demo` works without a
// GitHub OAuth app. process.env.NODE_ENV is 'production' in `next build`/
// `next start`, so this can never disable auth on a deployed dashboard.
const demoMode =
  process.env.DASHBOARD_DEMO_MODE === 'true' && process.env.NODE_ENV !== 'production';

export default demoMode ? () => NextResponse.next() : nextAuthMiddleware;

export const config = {
  matcher: ['/findings/:path*'],
};
