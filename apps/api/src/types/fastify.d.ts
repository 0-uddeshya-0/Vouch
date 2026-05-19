import 'fastify';

declare module 'fastify' {
  interface FastifyRequest {
    /** Set after successful GitHub webhook signature verification */
    deliveryId?: string;
  }
}
