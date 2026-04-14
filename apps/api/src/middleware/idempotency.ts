/**
 * Idempotency Middleware
 * Prevents duplicate webhook processing using Redis
 */

import { Redis } from 'ioredis';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '@vouch/config';
import { auditLogger } from '@vouch/core';

const redis = new Redis(env.REDIS_URL);
const IDEMPOTENCY_TTL = 3600; // 1 hour

export async function checkIdempotency(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const deliveryId = request.deliveryId;
  
  if (!deliveryId) {
    reply.code(400).send({
      error: 'Bad Request',
      message: 'Missing delivery ID'
    });
    return;
  }
  
  const key = `webhook:${deliveryId}`;
  
  try {
    // Try to set the key with NX (only if not exists) and EX (expiration)
    const result = await redis.set(key, '1', 'EX', IDEMPOTENCY_TTL, 'NX');
    
    if (result === null) {
      // Key already exists - this is a duplicate
      auditLogger.log('webhook_failed', {
        reason: 'duplicate_delivery',
        deliveryId,
      });
      
      reply.code(200).send({
        status: 'ignored',
        message: 'Duplicate delivery - already processed'
      });
      return;
    }
    
    // Key was set - this is a new delivery
    auditLogger.log('webhook_received', {
      deliveryId,
      event: request.headers['x-github-event'],
    });
    
  } catch (error) {
    // Redis error - fail open to avoid blocking webhooks
    request.log.error(error, 'Redis error in idempotency check');
    auditLogger.log('webhook_failed', {
      reason: 'redis_error',
      deliveryId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
}

export async function cleanupIdempotency(deliveryId: string): Promise<void> {
  const key = `webhook:${deliveryId}`;
  try {
    await redis.del(key);
  } catch (error) {
    console.error('Failed to cleanup idempotency key:', error);
  }
}

// Health check for Redis
export async function checkRedisHealth(): Promise<boolean> {
  try {
    await redis.ping();
    return true;
  } catch {
    return false;
  }
}
