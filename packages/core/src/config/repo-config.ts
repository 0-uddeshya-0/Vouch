import type { Octokit } from '@octokit/rest';
import { z } from 'zod';
import { extractPackageName } from '../parsers/module-utils';

export const CONFIG_FILENAMES = ['vouch.json', '.vouchrc.json'] as const;

export const repoConfigFileSchema = z.object({
  ignoreScopes: z.array(z.string()).optional(),
  ignoreDependencies: z.array(z.string()).optional(),
  slopThreshold: z.number().min(0).max(1).optional(),
  /** Who the Maintainer Gate enforces on: external contributors (default), everyone, or nobody */
  gate: z.enum(['external', 'all', 'off']).optional(),
  requireTests: z.boolean().optional(),
  requireLinkedIssue: z.boolean().optional(),
});

export type RepoConfigFile = z.infer<typeof repoConfigFileSchema>;

export interface RepoConfig {
  ignoreScopes: string[];
  ignoreDependencies: string[];
  slopThreshold: number;
  gate: 'external' | 'all' | 'off';
  requireTests: boolean;
  requireLinkedIssue: boolean;
}

export const DEFAULT_REPO_CONFIG: RepoConfig = {
  ignoreScopes: [],
  ignoreDependencies: [],
  slopThreshold: 0.5,
  // Enforce the evidence gate on external contributors out of the box. The
  // fact-based checks (packages real, no high/critical secrets/CVEs) and the
  // near-universal "tests accompany code" norm are on by default; the
  // project-specific "must link an issue" policy is opt-in, since many repos
  // (personal sites, libraries) have no issue culture and blocking on it
  // would be friction without signal.
  gate: 'external',
  requireTests: true,
  requireLinkedIssue: false,
};

const SEVERITY_RANK: Record<string, number> = {
  low: 0.5,
  medium: 0.5,
  high: 0.75,
  critical: 1.0,
};

const CONFIG_CACHE_TTL_MS = 5 * 60 * 1000;
const configCache = new Map<string, { config: RepoConfig; expiresAt: number }>();

export function resolveRepoConfig(file: RepoConfigFile | undefined): RepoConfig {
  if (!file) {
    return { ...DEFAULT_REPO_CONFIG };
  }
  return {
    ignoreScopes: file.ignoreScopes ?? [],
    ignoreDependencies: file.ignoreDependencies ?? [],
    slopThreshold: file.slopThreshold ?? DEFAULT_REPO_CONFIG.slopThreshold,
    gate: file.gate ?? DEFAULT_REPO_CONFIG.gate,
    requireTests: file.requireTests ?? DEFAULT_REPO_CONFIG.requireTests,
    requireLinkedIssue: file.requireLinkedIssue ?? DEFAULT_REPO_CONFIG.requireLinkedIssue,
  };
}

export function shouldIgnorePackage(packageName: string, config: RepoConfig): boolean {
  const pkg = extractPackageName(packageName.trim());
  if (!pkg) {
    return false;
  }

  for (const dep of config.ignoreDependencies) {
    if (pkg === extractPackageName(dep)) {
      return true;
    }
  }

  for (const scope of config.ignoreScopes) {
    const normalized = scope.startsWith('@') ? scope : `@${scope}`;
    if (pkg === normalized || pkg.startsWith(`${normalized}/`)) {
      return true;
    }
  }

  return false;
}

export function meetsSlopThreshold(severity: 'low' | 'medium' | 'high' | 'critical', config: RepoConfig): boolean {
  return (SEVERITY_RANK[severity] ?? 0) >= config.slopThreshold;
}

function cacheKey(owner: string, repo: string, ref: string): string {
  return `${owner}/${repo}@${ref}`;
}

function getCachedConfig(key: string): RepoConfig | null {
  const entry = configCache.get(key);
  if (!entry) {
    return null;
  }
  if (Date.now() > entry.expiresAt) {
    configCache.delete(key);
    return null;
  }
  return entry.config;
}

function setCachedConfig(key: string, config: RepoConfig): void {
  configCache.set(key, { config, expiresAt: Date.now() + CONFIG_CACHE_TTL_MS });
}

function decodeGitHubContent(data: { content?: string; encoding?: string }): string | null {
  if (!data.content || data.encoding !== 'base64') {
    return null;
  }
  return Buffer.from(data.content, 'base64').toString('utf8');
}

function parseConfigContent(raw: string): RepoConfig {
  try {
    const json = JSON.parse(raw) as unknown;
    const parsed = repoConfigFileSchema.safeParse(json);
    if (!parsed.success) {
      return { ...DEFAULT_REPO_CONFIG };
    }
    return resolveRepoConfig(parsed.data);
  } catch {
    return { ...DEFAULT_REPO_CONFIG };
  }
}

async function fetchConfigFile(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string,
  path: string
): Promise<RepoConfig | null> {
  try {
    const { data } = await octokit.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    if (Array.isArray(data) || !('content' in data)) {
      return null;
    }

    const raw = decodeGitHubContent(data);
    if (!raw) {
      return null;
    }

    return parseConfigContent(raw);
  } catch (error: unknown) {
    const status = (error as { status?: number })?.status;
    if (status === 404) {
      return null;
    }
    throw error;
  }
}

/**
 * Load vouch.json / .vouchrc.json from the repository root. Missing or invalid files
 * fall back to defaults without failing analysis.
 */
export async function fetchRepoConfig(
  octokit: Octokit,
  owner: string,
  repo: string,
  ref: string
): Promise<RepoConfig> {
  const key = cacheKey(owner, repo, ref);
  const cached = getCachedConfig(key);
  if (cached) {
    return cached;
  }

  for (const filename of CONFIG_FILENAMES) {
    const config = await fetchConfigFile(octokit, owner, repo, ref, filename);
    if (config) {
      setCachedConfig(key, config);
      return config;
    }
  }

  const defaults = { ...DEFAULT_REPO_CONFIG };
  setCachedConfig(key, defaults);
  return defaults;
}

/** @internal — reset in-memory cache (tests only) */
export function clearRepoConfigCache(): void {
  configCache.clear();
}
