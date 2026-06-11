/**
 * GitHub Webhook Routes
 * Handles GitHub webhook events
 */

import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import { Queue } from 'bullmq';
import Redis from 'ioredis';
import { env } from '@vouch/config/env';
import { auditLogger } from '@vouch/core';
import type { PullRequestWebhookPayload } from '@vouch/types';

let analysisQueue: Queue | null = null;

function getAnalysisQueue(): Queue {
  if (!analysisQueue) {
    const connection = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null });
    analysisQueue = new Queue('pr-analysis', { connection });
  }
  return analysisQueue;
}

export async function webhookRoutes(fastify: FastifyInstance): Promise<void> {
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
        deliveryId: deliveryId ?? '',
        event,
        action: request.body.action,
      });

      return { status: 'ok', event };

    } catch (error) {
      fastify.log.error(error, 'Error processing webhook');

      auditLogger.log('webhook_failed', {
        deliveryId: deliveryId ?? '',
        event,
        error: error instanceof Error ? error.message : 'Unknown error',
      });

      reply.code(500);
      return {
        status: 'error',
        message: error instanceof Error ? error.message : 'Internal server error',
      };
    }
  });
}

async function handlePullRequestEvent(
  payload: PullRequestWebhookPayload,
  fastify: FastifyInstance
): Promise<void> {
  const { action, pull_request, repository, installation } = payload;

  if (!['opened', 'synchronize', 'reopened'].includes(action ?? '')) {
    return;
  }

  if (!installation?.account || !pull_request || !repository) {
    throw new Error('Missing installation, pull_request, or repository');
  }

  const inst = await fastify.prisma.installation.upsert({
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

  const repoRow = await fastify.prisma.repo.upsert({
    where: { githubId: repository.id },
    update: {
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch,
    },
    create: {
      installationId: inst.id,
      githubId: repository.id,
      fullName: repository.full_name,
      private: repository.private,
      defaultBranch: repository.default_branch,
    },
  });

  const analysis = await fastify.prisma.analysis.create({
    data: {
      repoId: repoRow.id,
      prNumber: pull_request.number,
      commitSha: pull_request.head.sha,
      status: 'pending',
    },
  });

  const queue = getAnalysisQueue();
  await queue.add('analyze-pr', {
    analysisId: analysis.id,
    installationId: installation.id,
    repoId: repoRow.id,
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
    repoId: repoRow.id,
    prNumber: pull_request.number,
  });
}

async function handleInstallationEvent(
  payload: PullRequestWebhookPayload & {
    installation?: { id: number; account?: { login: string; type: string } };
  },
  fastify: FastifyInstance
): Promise<void> {
  const { action, installation } = payload;

  if (!installation?.account) {
    throw new Error('Missing installation account');
  }

  if (action === 'created') {
    // Upsert: GitHub re-delivers events and users uninstall/reinstall, so a
    // bare create would crash on the unique githubId constraint.
    await fastify.prisma.installation.upsert({
      where: { githubId: installation.id },
      update: {
        accountLogin: installation.account.login,
        accountType: installation.account.type,
        status: 'active',
      },
      create: {
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
    await fastify.prisma.installation.updateMany({
      where: { githubId: installation.id },
      data: { status: 'inactive' },
    });
  }
}

async function handleInstallationRepositoriesEvent(
  payload: PullRequestWebhookPayload & {
    installation?: { id: number };
    repositories_added?: Array<{ id: number; full_name: string; private: boolean }>;
    repositories_removed?: Array<{ id: number }>;
  },
  fastify: FastifyInstance
): Promise<void> {
  const { action, installation, repositories_added, repositories_removed } = payload;

  if (!installation) {
    throw new Error('Missing installation');
  }

  const dbInstallation = await fastify.prisma.installation.findUnique({
    where: { githubId: installation.id },
  });

  if (!dbInstallation) {
    throw new Error('Installation not found in database');
  }

  if (action === 'added' && repositories_added) {
    for (const repo of repositories_added) {
      await fastify.prisma.repo.upsert({
        where: { githubId: repo.id },
        update: {
          fullName: repo.full_name,
        },
        create: {
          installationId: dbInstallation.id,
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
      // Delete children first: Finding -> Analysis -> Repo (no DB-level cascades).
      await fastify.prisma.$transaction([
        fastify.prisma.finding.deleteMany({
          where: { analysis: { repo: { githubId: repo.id } } },
        }),
        fastify.prisma.analysis.deleteMany({
          where: { repo: { githubId: repo.id } },
        }),
        fastify.prisma.repo.deleteMany({
          where: { githubId: repo.id },
        }),
      ]);
    }
  }
}
