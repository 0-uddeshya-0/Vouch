/**
 * Installation Routes
 * API endpoints for managing installations
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import type { Analysis, UsageRecord } from '@prisma/client';
import { apiRateLimiter } from '../middleware/rate-limit';

export async function installationRoutes(fastify: FastifyInstance): Promise<void> {
  fastify.addHook('preHandler', apiRateLimiter);

  fastify.get('/installations', async (_request: FastifyRequest, _reply: FastifyReply) => {
    const installations = await fastify.prisma.installation.findMany({
      include: {
        _count: {
          select: { repos: true },
        },
      },
    });

    return installations.map((inst) => ({
      id: inst.id,
      githubId: inst.githubId,
      accountLogin: inst.accountLogin,
      accountType: inst.accountType,
      plan: inst.plan,
      status: inst.status,
      createdAt: inst.createdAt.toISOString(),
      updatedAt: inst.updatedAt.toISOString(),
      repoCount: inst._count.repos,
    }));
  });

  fastify.get('/installations/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const id = parseInt(request.params.id, 10);

    if (Number.isNaN(id)) {
      reply.code(400);
      return { error: 'Invalid installation ID' };
    }

    const installation = await fastify.prisma.installation.findUnique({
      where: { id },
      include: {
        repos: true,
      },
    });

    if (!installation) {
      reply.code(404);
      return { error: 'Installation not found' };
    }

    return {
      id: installation.id,
      githubId: installation.githubId,
      accountLogin: installation.accountLogin,
      accountType: installation.accountType,
      plan: installation.plan,
      status: installation.status,
      createdAt: installation.createdAt.toISOString(),
      updatedAt: installation.updatedAt.toISOString(),
      repos: installation.repos.map((repo) => ({
        id: repo.id,
        githubId: repo.githubId,
        fullName: repo.fullName,
        private: repo.private,
        defaultBranch: repo.defaultBranch,
      })),
    };
  });

  fastify.patch('/installations/:id', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { plan?: string };
    }>,
    reply: FastifyReply
  ) => {
    const id = parseInt(request.params.id, 10);

    if (Number.isNaN(id)) {
      reply.code(400);
      return { error: 'Invalid installation ID' };
    }

    const { plan } = request.body;

    if (plan && !['free', 'pro', 'enterprise'].includes(plan)) {
      reply.code(400);
      return { error: 'Invalid plan. Must be free, pro, or enterprise' };
    }

    const installation = await fastify.prisma.installation.update({
      where: { id },
      data: { plan },
    });

    return {
      id: installation.id,
      githubId: installation.githubId,
      accountLogin: installation.accountLogin,
      plan: installation.plan,
      status: installation.status,
    };
  });

  fastify.get('/installations/:id/usage', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const id = parseInt(request.params.id, 10);

    if (Number.isNaN(id)) {
      reply.code(400);
      return { error: 'Invalid installation ID' };
    }

    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

    const [usage, analyses] = await Promise.all([
      fastify.prisma.usageRecord.findMany({
        where: {
          installationId: id,
          date: { gte: thirtyDaysAgo },
        },
        orderBy: { date: 'desc' },
      }),
      fastify.prisma.analysis.findMany({
        where: {
          repo: { installationId: id },
          startedAt: { gte: thirtyDaysAgo },
        },
        select: {
          llmTier1Calls: true,
          llmTier2Calls: true,
          estimatedCost: true,
        },
      }),
    ]);

    const totals = analyses.reduce<{
      llmTier1Calls: number;
      llmTier2Calls: number;
      estimatedCost: number;
    }>(
      (acc, curr: Pick<Analysis, 'llmTier1Calls' | 'llmTier2Calls' | 'estimatedCost'>) => ({
        llmTier1Calls: acc.llmTier1Calls + curr.llmTier1Calls,
        llmTier2Calls: acc.llmTier2Calls + curr.llmTier2Calls,
        estimatedCost: acc.estimatedCost + Number(curr.estimatedCost),
      }),
      { llmTier1Calls: 0, llmTier2Calls: 0, estimatedCost: 0 }
    );

    return {
      installationId: id,
      period: {
        start: thirtyDaysAgo.toISOString(),
        end: new Date().toISOString(),
      },
      daily: usage.map((u: UsageRecord) => ({
        date: u.date.toISOString(),
        prsAnalyzed: u.prsAnalyzed,
        llmTokensUsed: u.llmTokensUsed,
        estimatedCost: Number(u.estimatedCost),
      })),
      totals: {
        prsAnalyzed: usage.reduce((sum: number, u: UsageRecord) => sum + u.prsAnalyzed, 0),
        llmTier1Calls: totals.llmTier1Calls,
        llmTier2Calls: totals.llmTier2Calls,
        estimatedCost: totals.estimatedCost,
      },
    };
  });
}
