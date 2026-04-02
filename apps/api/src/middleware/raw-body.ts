/**
 * Raw Body Capture for Webhook Verification
 * 
 * Fastify parses the body by default, but we need the raw body
 * for HMAC-SHA256 signature verification.
 * 
 * Solution: Register a custom content type parser that captures raw body
 * before JSON parsing.
 */

import type { FastifyRequest, FastifyReply } from 'fastify';

// Extend FastifyRequest to include rawBody
declare module 'fastify' {
  interface FastifyRequest {
    rawBody?: string;
  }
}

/**
 * Register raw body capture for specific content types
 * This MUST be called before other plugins
 */
export async function registerRawBodyCapture(fastify: any): Promise<void> {
  // Add custom content type parser for application/json
  fastify.addContentTypeParser(
    'application/json',
    { parseAs: 'string' },
    (request: FastifyRequest, body: string, done: (err: Error | null, body?: unknown) => void) => {
      // Store raw body for signature verification
      (request as FastifyRequest & { rawBody: string }).rawBody = body;
      
      try {
        const parsed = JSON.parse(body);
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Also handle application/vnd.github+json
  fastify.addContentTypeParser(
    'application/vnd.github+json',
    { parseAs: 'string' },
    (request: FastifyRequest, body: string, done: (err: Error | null, body?: unknown) => void) => {
      (request as FastifyRequest & { rawBody: string }).rawBody = body;
      
      try {
        const parsed = JSON.parse(body);
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );

  // Handle application/vnd.github.hookshot.preview+json
  fastify.addContentTypeParser(
    /application\/vnd\.github.*/,
    { parseAs: 'string' },
    (request: FastifyRequest, body: string, done: (err: Error | null, body?: unknown) => void) => {
      (request as FastifyRequest & { rawBody: string }).rawBody = body;
      
      try {
        const parsed = JSON.parse(body);
        done(null, parsed);
      } catch (err) {
        done(err as Error, undefined);
      }
    }
  );
}
