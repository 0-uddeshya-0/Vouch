/**
 * Rate Limiting Middleware
 * Per-installation rate limiting
 */

import { Redis } from 'ioredis';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '@vouch/config';
import { auditLogger } from '@vouch/core';

const redis = new Redis(env.REDIS_URL);

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 100,
  windowSeconds: 60,
};

export function createRateLimiter(config: Partial<RateLimitConfig> = {}) {
  const { maxRequests, windowSeconds } = { ...DEFAULT_CONFIG, ...config };
  
  return async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<void> => {
    const installationId = request.params?.installationId || 'global';
    const key = `ratelimit:${installationId}`;
    
    try {
      const current = await redis.incr(key);
      
      if (current === 1) {
        // First request in window
        await redis.expire(key, windowSeconds);
      }
      
      const ttl = await redis.ttl(key);
      
      // Set rate limit headers
      reply.header('X-RateLimit-Limit', maxRequests);
      reply.header('X-RateLimit-Remaining', Math.max(0, maxRequests - current));
      reply.header('X-RateLimit-Reset', Date.now() + ttl * 1000);
      
      if (current > maxRequests) {
        auditLogger.log('rate_limit_hit', {
          installationId,
          current,
          max: maxRequests,
        });
        
        reply.code(429).send({
          error: 'Too Many Requests',
          message: `Rate limit exceeded. Try again in ${ttl} seconds.`,
          retryAfter: ttl,
        });
        return;
      }
      
    } catch (error) {
      // Redis error - fail open
      request.log.error(error, 'Redis error in rate limit check');
    }
  };
}

// Webhook-specific rate limiter (more permissive)
export const webhookRateLimiter = createRateLimiter({
  maxRequests: 1000,
  windowSeconds: 60,
});

// API rate limiter (more restrictive)
export const apiRateLimiter = createRateLimiter({
  maxRequests: 100,
  windowSeconds: 60,
});
