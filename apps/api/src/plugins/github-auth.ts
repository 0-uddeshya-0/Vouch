/**
 * GitHub Authentication Plugin
 * Manages JWT and installation tokens
 */

import fp from 'fastify-plugin';
import jwt from 'jsonwebtoken';
import { Octokit } from '@octokit/rest';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { env } from '@vouch/config';

// GitHub App JWT cache
let cachedJWT: { token: string; expiresAt: number } | null = null;

// Installation token cache
const installationTokenCache = new Map<number, { token: string; expiresAt: number }>();

const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000; // 5 minutes before actual expiry

export function generateAppJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = (now + 600) * 1000; // 10 minutes
  
  const payload = {
    iat: now,
    exp: now + 600,
    iss: env.GITHUB_APP_ID,
  };
  
  const token = jwt.sign(payload, env.GITHUB_PRIVATE_KEY, { algorithm: 'RS256' });
  cachedJWT = { token, expiresAt };
  
  return token;
}

export function getAppJWT(): string {
  if (cachedJWT && cachedJWT.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER) {
    return cachedJWT.token;
  }
  
  return generateAppJWT();
}

export async function getInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  
  if (cached && cached.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER) {
    return cached.token;
  }
  
  const appJWT = getAppJWT();
  const octokit = new Octokit({ auth: appJWT });
  
  const { data } = await octokit.apps.createInstallationAccessToken({
    installation_id: installationId,
  });
  
  const expiresAt = new Date(data.expires_at).getTime();
  installationTokenCache.set(installationId, { token: data.token, expiresAt });
  
  return data.token;
}

export async function getInstallationOctokit(installationId: number): Promise<Octokit> {
  const token = await getInstallationToken(installationId);
  return new Octokit({ auth: token });
}

// Fastify plugin
const githubAuthPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  fastify.decorate('github', {
    getJWT: getAppJWT,
    getInstallationToken,
    getInstallationOctokit,
  });
};

export default fp(githubAuthPlugin, { name: 'github-auth' });

// Type declarations
declare module 'fastify' {
  interface FastifyInstance {
    github: {
      getJWT: typeof getAppJWT;
      getInstallationToken: typeof getInstallationToken;
      getInstallationOctokit: typeof getInstallationOctokit;
    };
  }
}
