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
