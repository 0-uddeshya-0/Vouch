/**
 * GitHub Webhook Routes
 * Handles GitHub webhook events
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import { env } from '@vouch/config';
import { auditLogger } from '@vouch/core';
import type { PullRequestWebhookPayload } from '@vouch/types';

// Analysis job queue
const analysisQueue = new Queue('pr-analysis', {
  connection: new (await import('ioredis')).default(env.REDIS_URL),
});

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
  // GitHub webhook endpoint
  fastify.post('/webhooks/github', async (
    request: FastifyRequest<{ Body: PullRequestWebhookPayload }>,
    reply: FastifyReply
  ) => {
    const event = request.headers['x-github-event'] as string;
    const deliveryId = request.deliveryId;
    
    fastify.log.info({ event, deliveryId }, 'Received GitHub webhook');
    
    try {
      switch (event) {
        case 'pull_request':
          await handlePullRequestEvent(request.body, fastify);
          break;
          
        case 'installation':
          await handleInstallationEvent(request.body, fastify);
          break;
          
        case 'installation_repositories':
          await handleInstallationRepositoriesEvent(request.body, fastify);
          break;
          
        default:
          fastify.log.debug({ event }, 'Unhandled webhook event');
      }
      
      auditLogger.log('webhook_processed', {
        deliveryId,
        event,
        action: request.body.action,
      });
      
      return { status: 'ok', event };
      
    } catch (error) {
      fastify.log.error(error, 'Error processing webhook');
      
      auditLogger.log('webhook_failed', {
        deliveryId,
        event,
        error: error instanceof Error ? error.message : 'Unknown error',
      });
      
      reply.code(500);
      return { 
        status: 'error', 
        message: error instanceof Error ? error.message : 'Internal server error'
      };
    }
  });
}

async function handlePullRequestEvent(
  payload: PullRequestWebhookPayload,
  fastify: FastifyInstance
): Promise<void> {
  const { action, pull_request, repository, installation } = payload;
  
  // Only process relevant actions
  if (!['opened', 'synchronize', 'reopened'].includes(action)) {
    return;
  }
  
  if (!installation) {
    throw new Error('Missing installation ID');
  }
  
  // Create or update installation record
  await fastify.prisma.installation.upsert({
    where: { githubId: installation.id },
    update: {
      accountLogin: installation.account.login,
      accountType: installation.account.type,
    },
    create: {
      githubId: installation.id,
      accountLogin: installation.account.login,
      accountType: installation.account.type,
      plan: 'free',
      status: 'active',
    },
  });
  
  // Create or update repo record
  await fastify.prisma.repo.upsert({
    where: { githubId: repository.id },
    update: {
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch,
    },
    create: {
      installationId: installation.id,
      githubId: repository.id,
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch,
    },
  });
  
  // Create analysis record
  const analysis = await fastify.prisma.analysis.create({
    data: {
      repoId: repository.id,
      prNumber: pull_request.number,
      commitSha: pull_request.head.sha,
      status: 'pending',
    },
  });
  
  // Queue analysis job
  await analysisQueue.add('analyze-pr', {
    analysisId: analysis.id,
    installationId: installation.id,
    repoId: repository.id,
    repoFullName: repository.full_name,
    prNumber: pull_request.number,
    commitSha: pull_request.head.sha,
    defaultBranch: repository.default_branch,
  }, {
    attempts: 3,
    backoff: {
      type: 'exponential',
      delay: 5000,
    },
    removeOnComplete: 100,
    removeOnFail: 50,
  });
  
  auditLogger.log('analysis_started', {
    analysisId: analysis.id,
    installationId: installation.id,
    repoId: repository.id,
    prNumber: pull_request.number,
  });
}

async function handleInstallationEvent(
  payload: any,
  fastify: FastifyInstance
): Promise<void> {
  const { action, installation } = payload;
  
  if (action === 'created') {
    await fastify.prisma.installation.create({
      data: {
        githubId: installation.id,
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        plan: 'free',
        status: 'active',
      },
    });
    
    auditLogger.log('installation_created', {
      installationId: installation.id,
      account: installation.account.login,
    });
  } else if (action === 'deleted') {
    await fastify.prisma.installation.update({
      where: { githubId: installation.id },
      data: { status: 'inactive' },
    });
  }
}

async function handleInstallationRepositoriesEvent(
  payload: any,
  fastify: FastifyInstance
): Promise<void> {
  const { action, installation, repositories_added, repositories_removed } = payload;
  
  if (action === 'added' && repositories_added) {
    for (const repo of repositories_added) {
      await fastify.prisma.repo.upsert({
        where: { githubId: repo.id },
        update: {
          fullName: repo.full_name,
        },
        create: {
          installationId: installation.id,
          githubId: repo.id,
          fullName: repo.full_name,
          private: repo.private,
          defaultBranch: 'main',
        },
      });
    }
  }
  
  if (action === 'removed' && repositories_removed) {
    for (const repo of repositories_removed) {
      await fastify.prisma.repo.deleteMany({
        where: { githubId: repo.id },
      });
    }
  }
}
