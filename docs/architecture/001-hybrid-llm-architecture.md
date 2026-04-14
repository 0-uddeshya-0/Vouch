# ADR 001: Hybrid LLM Architecture

## Status

Accepted

## Context

Vouch needs to analyze PR diffs for hallucinated dependencies and security issues. Using a single LLM for all analysis would be cost-prohibitive at scale.

## Decision

Implement a tiered LLM architecture:

1. **Tier 1 (Haiku)**: Fast, cheap triage ($0.80/M input, $4.00/M output)
2. **Tier 2 (Sonnet)**: Deep analysis for complex cases ($3.00/M input, $15.00/M output)

Escalation triggers:
- Confidence < 0.7 from Haiku
- Complexity score > 8
- Multiple files with interdependencies

## Consequences

### Positive

- 80% of cases handled by Haiku (cost savings)
- Sonnet available for complex cases (accuracy)
- Configurable thresholds per organization

### Negative

- Added complexity in routing logic
- Potential latency increase on escalation
- Need to track costs per PR

## Alternatives Considered

1. **Single Sonnet**: Too expensive ($0.10-0.50 per PR)
2. **Self-hosted LLM**: Infrastructure overhead, accuracy concerns
3. **Rule-based only**: Would miss complex patterns

## References

- [Anthropic Pricing](https://www.anthropic.com/pricing)
- Cost analysis in `/docs/research/llm-cost-analysis.md`
