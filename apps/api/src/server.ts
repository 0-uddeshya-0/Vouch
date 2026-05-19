/**
 * Vouch API Server
 * Fastify webhook server and API
 */

import { env } from '@vouch/config/env';
import Fastify from 'fastify';
import cors from '@fastify/cors';
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
  bodyLimit: 10 * 1024 * 1024,
});

async function registerPlugins(): Promise<void> {
  await registerRawBodyCapture(server);

  await server.register(cors, {
    origin: env.NODE_ENV === 'development',
    credentials: true,
  });

  await server.register(prismaPlugin);
  await server.register(githubAuthPlugin);
}

async function registerRoutes(): Promise<void> {
  await server.register(healthRoutes, { prefix: '' });

  server.addHook('preHandler', verifySignature);
  server.addHook('preHandler', checkIdempotency);
  await server.register(webhookRoutes, { prefix: '' });

  await server.register(installationRoutes, { prefix: '/api/v1' });
}

server.setErrorHandler((error, request, reply) => {
  server.log.error(error);

  const isDevelopment = env.NODE_ENV === 'development';

  reply.code(error.statusCode || 500).send({
    error: error.name,
    message: isDevelopment ? error.message : 'Internal server error',
    ...(isDevelopment && { stack: error.stack }),
  });
});

server.setNotFoundHandler((request, reply) => {
  reply.code(404).send({
    error: 'Not Found',
    message: `Route ${request.method} ${request.url} not found`,
  });
});

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

process.on('uncaughtException', (error) => {
  server.log.error(error, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  server.log.error(reason, 'Unhandled rejection');
  process.exit(1);
});

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
