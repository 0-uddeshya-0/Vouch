# ADR 002: Security-First Design

## Status

Accepted

## Context

Vouch processes sensitive code from private repositories. Security must be built-in from day one.

## Decision

Implement defense in depth:

1. **Webhook Security**
   - HMAC-SHA256 signature verification
   - Constant-time comparison (timingSafeEqual)
   - IP allowlisting for GitHub sources

2. **Data Handling**
   - No code persistence (process in-memory)
   - Log only metadata
   - Private key rotation automation

3. **Access Control**
   - Per-installation rate limiting
   - Idempotency for webhook deduplication

## Consequences

### Positive

- Protection against replay attacks
- No sensitive data in logs
- Clear audit trail

### Negative

- More complex webhook handling
- Need for Redis (idempotency)

## Implementation

```typescript
// Constant-time signature comparison
const sigBuf = Buffer.from(signature, 'utf8');
const digestBuf = Buffer.from(digest, 'utf8');

if (sigBuf.length !== digestBuf.length || 
    !crypto.timingSafeEqual(sigBuf, digestBuf)) {
  throw new Error('Invalid signature');
}
```

## References

- [GitHub Webhook Security](https://docs.github.com/en/webhooks/using-webhooks/validating-webhook-deliveries)
- [OWASP Timing Attack Prevention](https://owasp.org/www-community/vulnerabilities/Timing_attack)
