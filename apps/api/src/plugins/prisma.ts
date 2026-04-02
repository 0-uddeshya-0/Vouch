/**
 * Prisma Plugin
 * Database connection management
 */

import fp from 'fastify-plugin';
import { PrismaClient } from '@prisma/client';
import type { FastifyInstance, FastifyPluginAsync } from 'fastify';

// Prisma client instance
let prisma: PrismaClient | null = null;

export function getPrisma(): PrismaClient {
  if (!prisma) {
    prisma = new PrismaClient({
      log: process.env.NODE_ENV === 'development' 
        ? ['query', 'info', 'warn', 'error']
        : ['error'],
    });
  }
  
  return prisma;
}

export async function disconnectPrisma(): Promise<void> {
  if (prisma) {
    await prisma.$disconnect();
    prisma = null;
  }
}

// Fastify plugin
const prismaPlugin: FastifyPluginAsync = async (fastify: FastifyInstance) => {
  const client = getPrisma();
  
  fastify.decorate('prisma', client);
  
  fastify.addHook('onClose', async () => {
    await disconnectPrisma();
  });
};

export default fp(prismaPlugin, { name: 'prisma' });

// Type declarations
declare module 'fastify' {
  interface FastifyInstance {
    prisma: PrismaClient;
  }
}
