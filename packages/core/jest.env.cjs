/** Minimal env for unit tests that transitively import @vouch/config/env */
process.env.DATABASE_URL ??= 'postgresql://test:test@localhost:5432/vouch_test';
process.env.REDIS_URL ??= 'redis://localhost:6379';
process.env.GITHUB_APP_ID ??= '1';
process.env.GITHUB_PRIVATE_KEY ??= '-----BEGIN RSA PRIVATE KEY-----\ntest\n-----END RSA PRIVATE KEY-----';
process.env.GITHUB_WEBHOOK_SECRET ??= 'test-webhook-secret';
