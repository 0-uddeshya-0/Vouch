# Security Policy

## Supported Versions

| Version | Supported          |
| ------- | ------------------ |
| 1.x     | :white_check_mark: |
| < 1.0   | :x:                |

## Reporting a Vulnerability

**Please do not open public issues for security vulnerabilities.**

Instead, report security issues privately:

- **Email**: security@vouch.dev
- **GPG Key**: [Download](https://vouch.dev/security.gpg)
- **Response Time**: Within 48 hours

### What to Include

1. **Description** - Clear description of the vulnerability
2. **Impact** - What could an attacker do?
3. **Reproduction** - Step-by-step instructions
4. **Environment** - Version, OS, configuration
5. **Mitigation** - Any suggested fixes (optional)

### Response Process

1. **Acknowledgment** - Within 48 hours
2. **Investigation** - Within 1 week
3. **Fix Development** - Timeline communicated
4. **Disclosure** - Coordinated public disclosure

## Disclosure Policy

We follow responsible disclosure:

- **90-day window** for fix development
- **Public disclosure** after fix is released
- **Credit** given to reporter (if desired)
- **CVE** assigned for serious issues

## Security Features

### Current Protections

- ✅ HMAC-SHA256 webhook signature verification
- ✅ Constant-time signature comparison
- ✅ Idempotency for replay attack prevention
- ✅ Rate limiting per installation
- ✅ No code persistence (in-memory only)
- ✅ Secret masking in logs
- ✅ Private key rotation support

### Security Checklist

For deployments:

- [ ] Use strong webhook secret (32+ random chars)
- [ ] Enable IP allowlisting for GitHub webhooks
- [ ] Use HTTPS only
- [ ] Rotate private keys regularly
- [ ] Monitor audit logs
- [ ] Keep dependencies updated

## Known Security Considerations

### LLM Provider Security

When using cloud LLM providers:

- Code diffs are sent to external APIs
- Use Ollama for air-gapped deployments
- Review provider's data handling policies

### Registry API Security

- Package names are sent to npm/PyPI APIs
- No code content is sent to registries
- Responses are cached to minimize calls

## Security-Related Configuration

```bash
# Webhook security
GITHUB_WEBHOOK_SECRET=your-strong-secret-here

# IP allowlisting (GitHub webhook IPs)
ALLOWED_GITHUB_IPS=192.30.252.0/22,185.199.108.0/22

# Audit logging
AUDIT_LOGGING=true
AUDIT_LOG_RETENTION_DAYS=2555

# Air-gapped mode (no external calls)
VOUCH_MODE=airgapped
```

## Past Security Advisories

| Date | CVE | Description | Fixed In |
|------|-----|-------------|----------|
| - | - | No advisories yet | - |

## Security Research

We welcome security research! Please:

1. Follow responsible disclosure
2. Respect rate limits
3. Don't access others' data
4. Report findings promptly

## Contact

- **Security Team**: security@vouch.dev
- **GPG Fingerprint**: `A1B2 C3D4 E5F6 7890 1234 5678 90AB CDEF 1234 5678`

---

Thank you for helping keep Vouch secure! 🔒
