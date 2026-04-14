/**
 * Vouch API Server
 * Fastify webhook server and API
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { env } from '@vouch/config';
import { verifySignature, checkIdempotency } from './middleware';
import { registerRawBodyCapture } from './middleware/raw-body';
import { githubAuthPlugin, prismaPlugin } from './plugins';
import { webhookRoutes, healthRoutes, installationRoutes } from './routes';

const server = Fastify({
  logger: {
    level: env.NODE_ENV === 'development' ? 'debug' : 'info',
    transport: env.NODE_ENV === 'development' 
      ? { target: 'pino-pretty', options: { colorize: true } }
      : undefined,
  },
  // Increase payload limit for large diffs
  bodyLimit: 10 * 1024 * 1024, // 10MB
  // Disable default JSON parsing - we'll handle it ourselves for raw body capture
  // This is CRITICAL for webhook signature verification
});

// Register plugins
async function registerPlugins(): Promise<void> {
  // CRITICAL: Register raw body capture FIRST, before any other parsers
  await registerRawBodyCapture(server);
  
  // CORS
  await server.register(cors, {
    origin: env.NODE_ENV === 'development',
    credentials: true,
  });
  
  // Custom plugins
  await server.register(prismaPlugin);
  await server.register(githubAuthPlugin);
}

// Register routes
async function registerRoutes(): Promise<void> {
  // Health checks (no auth required)
  await server.register(healthRoutes, { prefix: '' });
  
  // Webhook routes (with signature verification and idempotency)
  // These hooks run in order: verifySignature → checkIdempotency
  server.addHook('preHandler', verifySignature);
  server.addHook('preHandler', checkIdempotency);
  await server.register(webhookRoutes, { prefix: '' });
  
  // API routes (no signature verification, but needs auth)
  // Note: In production, add JWT/auth middleware here
  await server.register(installationRoutes, { prefix: '/api/v1' });
}

// Error handler
server.setErrorHandler((error, request, reply) => {
  server.log.error(error);
  
  // Don't leak internal errors in production
  const isDevelopment = env.NODE_ENV === 'development';
  
  reply.code(error.statusCode || 500).send({
    error: error.name,
    message: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack }),
  });
});

// Not found handler
server.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
  });
});

// Graceful shutdown
async function gracefulShutdown(signal: string): Promise<void> {
  server.log.info(`Received ${signal}. Starting graceful shutdown...`);
  
  server.server.close(() => {
    server.log.info('HTTP server closed');
  });
  
  await server.close();
  process.exit(0);
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  server.log.error(error, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  server.log.error(reason, 'Unhandled rejection');
  process.exit(1);
});

// Start server
async function start(): Promise<void> {
  try {
    await registerPlugins();
    await registerRoutes();
    
    const address = await server.listen({
      port: env.PORT,
      host: '0.0.0.0',
    });
    
    server.log.info(`Server listening at ${address}`);
    server.log.info(`Environment: ${env.NODE_ENV}`);
    server.log.info(`Webhook endpoint: ${address}/webhooks/github`);
    server.log.info(`Health check: ${address}/health`);
  } catch (error) {
    server.log.error(error);
    process.exit(1);
  }
}

start();
