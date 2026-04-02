/**
 * Webhook Signature Verification
 * HMAC-SHA256 validation for GitHub webhooks with constant-time comparison
 */

import crypto from 'crypto';
import type { FastifyRequest, FastifyReply } from 'fastify';
import { env } from '@vouch/config';
import { auditLogger } from '@vouch/core';

const WEBHOOK_SECRET = env.GITHUB_WEBHOOK_SECRET;

/**
 * Verify GitHub webhook signature
 * Uses constant-time comparison to prevent timing attacks
 */
export async function verifySignature(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const signature = request.headers['x-hub-signature-256'] as string | undefined;
  const deliveryId = request.headers['x-github-delivery'] as string | undefined;
  
  // Check for signature presence
  if (!signature) {
    auditLogger.log('webhook_failed', {
      reason: 'missing_signature',
      ip: request.ip,
      path: request.url,
    }, { ip: request.ip });
    
    reply.code(401).send({ 
      error: 'Unauthorized',
      message: 'Missing X-Hub-Signature-256 header',
      documentation: 'https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries'
    });
    return;
  }
  
  // Check for delivery ID (required for idempotency)
  if (!deliveryId) {
    reply.code(400).send({
      error: 'Bad Request',
      message: 'Missing X-GitHub-Delivery header'
    });
    return;
  }
  
  // Get raw body (set by raw-body capture)
  const rawBody = request.rawBody;
  if (!rawBody) {
    reply.code(500).send({
      error: 'Internal Server Error',
      message: 'Raw body not captured - server configuration error'
    });
    return;
  }
  
  // Compute HMAC-SHA256
  const hmac = crypto.createHmac('sha256', WEBHOOK_SECRET);
  const digest = 'sha256=' + hmac.update(rawBody, 'utf8').digest('hex');
  
  // Constant-time comparison to prevent timing attacks
  const sigBuf = Buffer.from(signature, 'utf8');
  const digestBuf = Buffer.from(digest, 'utf8');
  
  // CRITICAL: Use timingSafeEqual to prevent timing attacks
  // NEVER use === for signature comparison
  if (sigBuf.length !== digestBuf.length || 
      !crypto.timingSafeEqual(sigBuf, digestBuf)) {
    
    auditLogger.log('webhook_failed', {
      reason: 'invalid_signature',
      ip: request.ip,
      deliveryId,
      // Log signature prefix for debugging (safe - not the full signature)
      signaturePrefix: signature.substring(0, 20) + '...',
    }, { ip: request.ip });
    
    reply.code(401).send({ 
      error: 'Unauthorized',
      message: 'Invalid signature - webhook payload may have been tampered with'
    });
    return;
  }
  
  // Attach delivery ID for idempotency check
  request.headers['x-github-delivery'] = deliveryId;
  
  auditLogger.log('webhook_signature_verified', {
    deliveryId,
    event: request.headers['x-github-event'],
    ip: request.ip,
  }, { ip: request.ip });
}

/**
 * Test helper: Generate a valid GitHub webhook signature
 * Use this for testing webhook handlers
 */
export function generateTestSignature(payload: string, secret: string = WEBHOOK_SECRET): string {
  const hmac = crypto.createHmac('sha256', secret);
  return 'sha256=' + hmac.update(payload, 'utf8').digest('hex');
}

/**
 * Test helper: Verify signature without throwing
 * Returns boolean for test assertions
 */
export function verifyTestSignature(payload: string, signature: string, secret: string = WEBHOOK_SECRET): boolean {
  const hmac = crypto.createHmac('sha256', secret);
  const digest = 'sha256=' + hmac.update(payload, 'utf8').digest('hex');
  
  const sigBuf = Buffer.from(signature, 'utf8');
  const digestBuf = Buffer.from(digest, 'utf8');
  
  return sigBuf.length === digestBuf.length && 
         crypto.timingSafeEqual(sigBuf, digestBuf);
}
