import type { NextAuthOptions } from 'next-auth';
import GithubProvider from 'next-auth/providers/github';
import { getDashboardEnv } from '@/env';

const dashboardEnv = getDashboardEnv();

export const authOptions: NextAuthOptions = {
  providers: [
    GithubProvider({
      clientId: dashboardEnv.GITHUB_ID,
      clientSecret: dashboardEnv.GITHUB_SECRET,
    }),
  ],
  secret: dashboardEnv.NEXTAUTH_SECRET,
  pages: {
    signIn: '/',
  },
  callbacks: {
    async signIn({ profile }) {
      const login =
        profile && 'login' in profile && typeof profile.login === 'string'
          ? profile.login.toLowerCase()
          : null;

      const allowlist = dashboardEnv.DASHBOARD_ALLOWED_LOGINS;

      if (allowlist.length > 0) {
        return login !== null && allowlist.includes(login);
      }

      // No allowlist configured: open in development, deny-by-default in
      // production — findings contain code snippets from private repos.
      if (dashboardEnv.NODE_ENV === 'production') {
        console.error(
          '[vouch:dashboard] Sign-in rejected: DASHBOARD_ALLOWED_LOGINS is not set. ' +
            'Set it to a comma-separated list of GitHub logins.'
        );
        return false;
      }
      return true;
    },
    async jwt({ token, profile }) {
      if (profile && 'login' in profile && typeof profile.login === 'string') {
        token.login = profile.login;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user) {
        session.user.login =
          typeof token.login === 'string' ? token.login : session.user.name ?? undefined;
      }
      return session;
    },
  },
};
