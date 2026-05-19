import { PrismaClient } from '@prisma/client';
import { getDashboardEnv } from '@/env';

const dashboardEnv = getDashboardEnv();

const globalForPrisma = globalThis as unknown as {
  prisma: PrismaClient | undefined;
};

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: dashboardEnv.NODE_ENV === 'development' ? ['error', 'warn'] : ['error'],
  });

if (dashboardEnv.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
}
