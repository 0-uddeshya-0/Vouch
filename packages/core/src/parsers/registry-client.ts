/**
 * npm and PyPI registry clients with in-memory caching, optional pluggable cache,
 * exponential backoff, and native fetch (no axios).
 */

export const registryClientLogger = {
  warn(code: string, detail?: Record<string, unknown>): void {
    const payload = detail ? ` ${JSON.stringify(detail)}` : '';
    console.warn(`[vouch:registry-client:${code}]${payload}`);
  },
};

export interface RegistryCacheAdapter {
  get(key: string): Promise<string | null>;
  set(key: string, value: string, ttlMs: number): Promise<void>;
}

class InMemoryRegistryCache implements RegistryCacheAdapter {
  private readonly store = new Map<string, { value: string; expiresAt: number }>();

  async get(key: string): Promise<string | null> {
    const row = this.store.get(key);
    if (!row) {
      return null;
    }
    if (Date.now() > row.expiresAt) {
      this.store.delete(key);
      return null;
    }
    return row.value;
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    this.store.set(key, { value, expiresAt: Date.now() + ttlMs });
  }
}

export interface NpmPackageInfo {
  name: string;
  exists: boolean;
  /**
   * True when the registry gave a definitive answer (200 or 404). False when the
   * lookup failed (network error, 5xx) — in that case `exists: false` means
   * "unknown", and callers must NOT report the package as hallucinated.
   */
  verified: boolean;
  created?: string;
  description?: string;
  latestVersion?: string;
  license?: string;
}

export interface PypiPackageInfo {
  name: string;
  exists: boolean;
  /** Same semantics as NpmPackageInfo.verified */
  verified: boolean;
  /** ISO upload time for a release if present */
  created?: string;
  summary?: string;
  latestVersion?: string;
}

export interface RegistryClientOptions {
  /** @default 300_000 (5m) */
  cacheTtlMs?: number;
  /** @default 4 */
  maxRetries?: number;
  /** Initial backoff in ms (doubles each retry, ± jitter) @default 500 */
  initialBackoffMs?: number;
  npmRegistryBase?: string;
  pypiBase?: string;
  cache?: RegistryCacheAdapter;
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function parseRetryAfterMs(res: Response): number | undefined {
  const h = res.headers.get('retry-after');
  if (!h) {
    return undefined;
  }
  const sec = Number(h);
  if (!Number.isNaN(sec)) {
    return sec * 1000;
  }
  const when = Date.parse(h);
  if (!Number.isNaN(when)) {
    return Math.max(0, when - Date.now());
  }
  return undefined;
}

async function fetchWithBackoff(
  url: string,
  init: RequestInit | undefined,
  options: { maxRetries: number; initialBackoffMs: number }
): Promise<Response> {
  let attempt = 0;
  let backoff = options.initialBackoffMs;

  while (true) {
    const res = await fetch(url, init);
    if (res.status !== 429 && res.status !== 503) {
      return res;
    }
    if (attempt >= options.maxRetries) {
      return res;
    }
    const ra = parseRetryAfterMs(res);
    const jitter = Math.floor(Math.random() * 120);
    const waitMs = ra ?? backoff + jitter;
    registryClientLogger.warn('backoff', { url, status: res.status, attempt, waitMs });
    await sleep(waitMs);
    attempt++;
    backoff *= 2;
  }
}

function normalizePypiName(name: string): string {
  return name.trim().toLowerCase().replace(/_/g, '-');
}

/** Cached marker for definitive 404s so missing packages are not re-fetched every call. */
const NOT_FOUND_SENTINEL = '__vouch_not_found__';

type RegistryLookup =
  | { status: 'ok'; data: unknown }
  | { status: 'not_found' }
  | { status: 'error' };

export class RegistryClient {
  private readonly cacheTtlMs: number;

  private readonly maxRetries: number;

  private readonly initialBackoffMs: number;

  private readonly npmRegistryBase: string;

  private readonly pypiBase: string;

  private readonly cache: RegistryCacheAdapter;

  constructor(options: RegistryClientOptions = {}) {
    this.cacheTtlMs = options.cacheTtlMs ?? 300_000;
    this.maxRetries = options.maxRetries ?? 4;
    this.initialBackoffMs = options.initialBackoffMs ?? 500;
    this.npmRegistryBase = (options.npmRegistryBase ?? 'https://registry.npmjs.org').replace(/\/$/, '');
    this.pypiBase = (options.pypiBase ?? 'https://pypi.org').replace(/\/$/, '');
    this.cache = options.cache ?? new InMemoryRegistryCache();
  }

  private async cachedJson(url: string, cacheKey: string): Promise<RegistryLookup> {
    const hit = await this.cache.get(cacheKey);
    if (hit) {
      if (hit === NOT_FOUND_SENTINEL) {
        return { status: 'not_found' };
      }
      try {
        return { status: 'ok', data: JSON.parse(hit) as unknown };
      } catch {
        return { status: 'error' };
      }
    }

    let res: Response;
    try {
      res = await fetchWithBackoff(
        url,
        { headers: { Accept: 'application/json' } },
        { maxRetries: this.maxRetries, initialBackoffMs: this.initialBackoffMs }
      );
    } catch (err) {
      registryClientLogger.warn('fetch_failed', {
        url,
        message: err instanceof Error ? err.message : String(err),
      });
      return { status: 'error' };
    }

    if (res.status === 404) {
      await this.cache.set(cacheKey, NOT_FOUND_SENTINEL, this.cacheTtlMs);
      return { status: 'not_found' };
    }

    if (!res.ok) {
      registryClientLogger.warn('http_error', { url, status: res.status });
      return { status: 'error' };
    }

    const text = await res.text();
    await this.cache.set(cacheKey, text, this.cacheTtlMs);
    try {
      return { status: 'ok', data: JSON.parse(text) as unknown };
    } catch {
      return { status: 'error' };
    }
  }

  async getNpmPackage(packageName: string): Promise<NpmPackageInfo> {
    const encoded = encodeURIComponent(packageName);
    const url = `${this.npmRegistryBase}/${encoded}`;
    const cacheKey = `npm:${packageName}`;
    const lookup = await this.cachedJson(url, cacheKey);

    if (lookup.status === 'not_found') {
      return { name: packageName, exists: false, verified: true };
    }
    if (lookup.status === 'error') {
      return { name: packageName, exists: false, verified: false };
    }

    const data = lookup.data as
      | {
          name?: string;
          time?: { created?: string; [v: string]: string | undefined };
          description?: string;
          'dist-tags'?: { latest?: string };
          license?: string;
        }
      | null;

    if (!data || typeof data !== 'object') {
      return { name: packageName, exists: false, verified: false };
    }

    const created = data.time?.created;
    const latest = data['dist-tags']?.latest;

    return {
      name: data.name ?? packageName,
      exists: true,
      verified: true,
      created,
      description: data.description,
      latestVersion: latest,
      license: typeof data.license === 'string' ? data.license : undefined,
    };
  }

  async getPypiPackage(packageName: string): Promise<PypiPackageInfo> {
    const norm = normalizePypiName(packageName);
    const url = `${this.pypiBase}/pypi/${encodeURIComponent(norm)}/json`;
    const cacheKey = `pypi:${norm}`;
    const lookup = await this.cachedJson(url, cacheKey);

    if (lookup.status === 'not_found') {
      return { name: packageName, exists: false, verified: true };
    }
    if (lookup.status === 'error') {
      return { name: packageName, exists: false, verified: false };
    }

    const data = lookup.data as
      | {
          info?: { name?: string; summary?: string; version?: string };
          urls?: { upload_time?: string }[];
        }
      | null;

    if (!data || !data.info) {
      return { name: packageName, exists: false, verified: false };
    }

    const info = data.info;
    const upload = Array.isArray(data.urls) && data.urls[0]?.upload_time ? data.urls[0].upload_time : undefined;

    return {
      name: info.name ?? packageName,
      exists: true,
      verified: true,
      summary: info.summary,
      latestVersion: info.version,
      created: upload,
    };
  }
}

/** Shared default client (in-memory cache). Apps may construct their own for Redis-backed cache. */
export const defaultRegistryClient = new RegistryClient();
