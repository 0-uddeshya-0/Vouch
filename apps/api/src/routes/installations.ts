/**
 * Installation Routes
 * API endpoints for managing installations
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { apiRateLimiter } from '../middleware/rate-limit';

export async function installationRoutes(fastify: FastifyInstance): Promise<void> {
  // Apply rate limiting to all routes
  fastify.addHook('preHandler', apiRateLimiter);
  
  // List installations
  fastify.get('/installations', async (request: FastifyRequest, reply: FastifyReply) => {
    const installations = await fastify.prisma.installation.findMany({
      include: {
        _count: {
          select: { repos: true },
        },
      },
    });
    
    return installations.map(inst => ({
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
  
  // Get installation by ID
  fastify.get('/installations/:id', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const id = parseInt(request.params.id, 10);
    
    if (isNaN(id)) {
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
      repos: installation.repos.map(repo => ({
        id: repo.id,
        githubId: repo.githubId,
        fullName: repo.fullName,
        private: repo.private,
        defaultBranch: repo.defaultBranch,
      })),
    };
  });
  
  // Update installation plan
  fastify.patch('/installations/:id', async (
    request: FastifyRequest<{
      Params: { id: string };
      Body: { plan?: string };
    }>,
    reply: FastifyReply
  ) => {
    const id = parseInt(request.params.id, 10);
    
    if (isNaN(id)) {
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
  
  // Get installation usage
  fastify.get('/installations/:id/usage', async (
    request: FastifyRequest<{ Params: { id: string } }>,
    reply: FastifyReply
  ) => {
    const id = parseInt(request.params.id, 10);
    
    if (isNaN(id)) {
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
    
    const totals = analyses.reduce(
      (acc, curr) => ({
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
      daily: usage.map(u => ({
        date: u.date.toISOString(),
        prsAnalyzed: u.prsAnalyzed,
        llmTokensUsed: u.llmTokensUsed,
        estimatedCost: Number(u.estimatedCost),
      })),
      totals: {
        prsAnalyzed: usage.reduce((sum, u) => sum + u.prsAnalyzed, 0),
        llmTier1Calls: totals.llmTier1Calls,
        llmTier2Calls: totals.llmTier2Calls,
        estimatedCost: totals.estimatedCost,
      },
    };
  });
}
