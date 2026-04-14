# Contributing to Vouch

Thank you for your interest in contributing to Vouch! This document provides guidelines and instructions for contributing.

## Table of Contents

- [Code of Conduct](#code-of-conduct)
- [Getting Started](#getting-started)
- [Development Setup](#development-setup)
- [Making Changes](#making-changes)
- [Testing](#testing)
- [Submitting Changes](#submitting-changes)
- [Security Issues](#security-issues)

## Code of Conduct

This project adheres to a code of conduct. By participating, you are expected to uphold this code:

- Be respectful and inclusive
- Welcome newcomers
- Focus on constructive feedback
- Respect different viewpoints and experiences

## Getting Started

### Prerequisites

- Node.js 20+
- pnpm
- Docker & Docker Compose
- Git

### Fork and Clone

```bash
# Fork the repository on GitHub, then clone your fork
git clone https://github.com/YOUR_USERNAME/vouch.git
cd vouch

# Add upstream remote
git remote add upstream https://github.com/vouch/vouch.git
```

## Development Setup

### One-Command Setup

```bash
./scripts/dev-setup.sh
```

### Manual Setup

```bash
# Install dependencies
pnpm install

# Start infrastructure services
docker-compose -f infra/docker/docker-compose.dev.yml up -d

# Run database migrations
npx prisma migrate dev

# Build packages
pnpm run build

# Start development server
pnpm dev
```

### Environment Variables

Copy `.env.example` to `.env` and configure:

```bash
cp .env.example .env
# Edit .env with your credentials
```

For local development without GitHub App credentials:

```bash
# Use mock mode for testing
MOCK_GITHUB_API=true
LLM_PROVIDER=ollama  # Use local LLM (free)
```

## Making Changes

### Branch Naming

- `feature/description` - New features
- `fix/description` - Bug fixes
- `docs/description` - Documentation updates
- `refactor/description` - Code refactoring
- `test/description` - Test additions/improvements

### Commit Messages

Follow conventional commits:

```
feat: add support for crates.io registry
fix: handle scoped npm packages correctly
docs: update API documentation
test: add security scanner test cases
refactor: simplify LLM router logic
```

### Code Style

- TypeScript with strict mode enabled
- ESLint for linting
- Prettier for formatting
- Run `pnpm lint` before committing

## Testing

### Test Requirements

Every contribution must include tests:

- **Unit tests** for new functions/classes
- **Integration tests** for API endpoints
- **End-to-end tests** for critical user flows

### Running Tests

```bash
# Run all tests
pnpm test

# Run unit tests only
pnpm test:unit

# Run integration tests
pnpm test:integration

# Run with coverage
pnpm test:coverage

# Run specific test file
pnpm test security-scanner.test.ts
```

### Test Coverage Requirements

- Minimum 80% coverage for new code
- 100% coverage for security-critical code

### Writing Tests

```typescript
// Example test structure
describe('Feature Name', () => {
  beforeEach(() => {
    // Setup
  });

  afterEach(() => {
    // Cleanup
  });

  describe('Specific Behavior', () => {
    test('should do something expected', () => {
      // Arrange
      const input = 'test';
      
      // Act
      const result = functionUnderTest(input);
      
      // Assert
      expect(result).toBe('expected output');
    });

    test('should handle edge case', () => {
      // Test edge cases
    });
  });
});
```

## Submitting Changes

### Pull Request Process

1. **Update documentation** - README, API docs, etc.
2. **Add tests** - All changes must have tests
3. **Run tests locally** - Ensure all tests pass
4. **Update CHANGELOG.md** - Document your changes
5. **Submit PR** - Use the PR template

### PR Template

```markdown
## Description
Brief description of changes

## Type of Change
- [ ] Bug fix
- [ ] New feature
- [ ] Breaking change
- [ ] Documentation update

## Testing
- [ ] Unit tests added/updated
- [ ] Integration tests added/updated
- [ ] Manual testing performed

## Checklist
- [ ] Code follows style guidelines
- [ ] Tests pass locally
- [ ] Documentation updated
- [ ] CHANGELOG.md updated
```

### Review Process

1. Automated checks must pass (CI, linting, tests)
2. At least one maintainer review required
3. Address review feedback
4. Squash commits if requested

## Security Issues

**Do not open public issues for security vulnerabilities.**

Instead:

1. Email security@vouch.dev
2. Include detailed description
3. Provide reproduction steps
4. Allow 90 days for disclosure

See [SECURITY.md](./SECURITY.md) for full policy.

## Development Guidelines

### Architecture Decisions

- Document significant decisions in `docs/architecture/`
- Use ADR format (Architecture Decision Records)
- Reference relevant issues/PRs

### Performance Considerations

- Registry calls must be cached
- LLM calls must have cost limits
- Database queries must be indexed
- Worker jobs must be idempotent

### Security Considerations

- Never log secrets or credentials
- Use constant-time comparison for signatures
- Validate all inputs
- Fail securely (deny by default)

## Questions?

- 📖 [Documentation](https://docs.vouch.dev)
- 💬 [Discord](https://discord.gg/vouch)
- 📧 [Email](mailto:contributing@vouch.dev)

Thank you for contributing to Vouch! 🚀
