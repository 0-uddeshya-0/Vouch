import type { Redis } from 'ioredis';
import type { RegistryCacheAdapter } from '@vouch/core';

const KEY_PREFIX = 'vouch:registry:';

/**
 * Redis-backed cache for {@link RegistryClient}. Misses and Redis errors are handled
 * without throwing so registry lookups still run against the network.
 */
export class RedisRegistryCacheAdapter implements RegistryCacheAdapter {
  constructor(private readonly redis: Redis) {}

  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(`${KEY_PREFIX}${key}`);
    } catch {
      return null;
    }
  }

  async set(key: string, value: string, ttlMs: number): Promise<void> {
    try {
      const ttlSec = Math.max(1, Math.ceil(ttlMs / 1000));
      await this.redis.set(`${KEY_PREFIX}${key}`, value, 'EX', ttlSec);
    } catch {
      /* ignore — cache is best-effort */
    }
  }
}
