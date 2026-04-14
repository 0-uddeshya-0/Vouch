import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken';
import { env } from '@vouch/config';

let cachedJWT: { token: string; expiresAt: number } | null = null;
const installationTokenCache = new Map<number, { token: string; expiresAt: number }>();
const TOKEN_EXPIRY_BUFFER = 5 * 60 * 1000;

function generateAppJWT(): string {
  const now = Math.floor(Date.now() / 1000);
  const payload = {
    iat: now,
    exp: now + 600,
    iss: env.GITHUB_APP_ID,
  };
  const token = jwt.sign(payload, env.GITHUB_PRIVATE_KEY, { algorithm: 'RS256' });
  cachedJWT = { token, expiresAt: (now + 600) * 1000 };
  return token;
}

function getAppJWT(): string {
  if (cachedJWT && cachedJWT.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER) {
    return cachedJWT.token;
  }
  return generateAppJWT();
}

async function getInstallationToken(installationId: number): Promise<string> {
  const cached = installationTokenCache.get(installationId);
  if (cached && cached.expiresAt > Date.now() + TOKEN_EXPIRY_BUFFER) {
    return cached.token;
  }

  const appJWT = getAppJWT();
  const octokit = new Octokit({ auth: appJWT });
  const { data } = await octokit.rest.apps.createInstallationAccessToken({
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
