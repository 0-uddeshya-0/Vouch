import { PrismaClient } from '@prisma/client';
import { getDashboardEnv } from '@/env';

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export function getPrisma(): PrismaClient {
  if (!globalForPrisma.prisma) {
    const dashboardEnv = getDashboardEnv();
    globalForPrisma.prisma = new PrismaClient({
      log: dashboardEnv.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
    });
  }
  return globalForPrisma.prisma;
}
