/**
 * All-in-one entry: runs the Fastify webhook server AND the BullMQ analysis
 * worker in a single process.
 *
 * This is the zero-cost deployment shape — one free dyno/instance hosts the
 * whole backend instead of paying for two services. For higher throughput,
 * deploy `server.js` and `worker.js` separately instead (see docs/DEPLOYMENT.md).
 *
 * Both modules self-start on import and register their own shutdown handlers.
 */
import './server';
import './worker';

console.log('[vouch] all-in-one mode: webhook server + analysis worker running in one process');
