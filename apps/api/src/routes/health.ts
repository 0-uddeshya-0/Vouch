/**
 * Health Check Routes
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { checkRedisHealth } from '../middleware/idempotency';
import type { HealthCheckResponse } from '@vouch/types';

export async function healthRoutes(fastify: FastifyInstance): Promise<void> {
  // Basic health check
  fastify.get('/health', async (): Promise<HealthCheckResponse> => {
    const redisHealthy = await checkRedisHealth();
    
    let dbHealthy = false;
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      dbHealthy = true;
    } catch (error) {
      fastify.log.error(error, 'Database health check failed');
    }
    
    const healthy = redisHealthy && dbHealthy;
    
    return {
      status: healthy ? 'healthy' : 'unhealthy',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: dbHealthy ? 'connected' : 'disconnected',
        redis: redisHealthy ? 'connected' : 'disconnected',
      },
    };
  });
  
  // Readiness check
  fastify.get('/health/ready', async (
    request: FastifyRequest,
    reply: FastifyReply
  ): Promise<HealthCheckResponse | { status: string }> => {
    const redisHealthy = await checkRedisHealth();
    
    let dbHealthy = false;
    try {
      await fastify.prisma.$queryRaw`SELECT 1`;
      dbHealthy = true;
    } catch (error) {
      fastify.log.error(error, 'Database readiness check failed');
    }
    
    if (!redisHealthy || !dbHealthy) {
      reply.code(503);
      return {
        status: 'not ready',
        timestamp: new Date().toISOString(),
        version: process.env.npm_package_version || '1.0.0',
        services: {
          database: dbHealthy ? 'connected' : 'disconnected',
          redis: redisHealthy ? 'connected' : 'disconnected',
        },
      };
    }
    
    return {
      status: 'ready',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      services: {
        database: 'connected',
        redis: 'connected',
      },
    };
  });
  
  // Liveness check
  fastify.get('/health/live', async (): Promise<{ status: string; timestamp: string }> => {
    return {
      status: 'alive',
      timestamp: new Date().toISOString(),
    };
  });
}
