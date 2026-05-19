/**
 * Deterministic maps for dependency quality heuristics (no LLM).
 */

export interface NativeAlternativeInfo {
  /** Built-in or standard-library replacement */
  alternative: string;
  /** Explainability text required in findings */
  explanation: string;
}

/** Packages with well-known native or platform built-in replacements */
export const NATIVE_PACKAGE_ALTERNATIVES: Record<string, NativeAlternativeInfo> = {
  uuid: {
    alternative: 'crypto.randomUUID()',
    explanation:
      'The `uuid` package is often unnecessary: use `crypto.randomUUID()` in Node 16.7+ / modern browsers.',
  },
  'uuid/v4': {
    alternative: 'crypto.randomUUID()',
    explanation:
      'The `uuid` package is often unnecessary: use `crypto.randomUUID()` in Node 16.7+ / modern browsers.',
  },
  moment: {
    alternative: 'Intl.DateTimeFormat / Temporal / native Date',
    explanation:
      '`moment` is legacy-heavy; prefer `Intl.DateTimeFormat`, the Temporal API, or native `Date` for formatting and parsing.',
  },
  'moment-timezone': {
    alternative: 'Intl.DateTimeFormat with timeZone option',
    explanation:
      '`moment-timezone` overlaps with `Intl.DateTimeFormat` (`timeZone` option) in modern runtimes.',
  },
  axios: {
    alternative: 'global fetch (Node 18+ / undici)',
    explanation:
      '`axios` overlaps with the platform `fetch` API; consider native `fetch` before adding another HTTP client.',
  },
  'node-fetch': {
    alternative: 'global fetch (Node 18+)',
    explanation:
      '`node-fetch` is redundant on Node 18+ where `fetch` is built in.',
  },
  lodash: {
    alternative: 'native Array/Object methods (ES2020+)',
    explanation:
      'Many `lodash` helpers are one-liners with native `Array`/`Object` methods, optional chaining, and spread syntax.',
  },
  ramda: {
    alternative: 'native Array/Object methods (ES2020+)',
    explanation:
      '`ramda` overlaps with other utility libraries (`lodash`, `underscore`); prefer native methods when possible.',
  },
  underscore: {
    alternative: 'native Array/Object methods (ES2020+)',
    explanation:
      '`underscore` overlaps with `lodash`/`ramda`; native ES builtins cover most common cases.',
  },
  request: {
    alternative: 'global fetch',
    explanation: 'The deprecated `request` package should be replaced with native `fetch` or `undici`.',
  },
  chalk: {
    alternative: 'util.styleText (Node 20+) / ANSI codes',
    explanation:
      'For simple terminal colors, Node 20+ `util.styleText` or minimal ANSI escapes may suffice instead of `chalk`.',
  },
  colors: {
    alternative: 'util.styleText (Node 20+) / ANSI codes',
    explanation: '`colors` is often replaceable with `util.styleText` or small ANSI helpers.',
  },
  'left-pad': {
    alternative: 'String.prototype.padStart',
    explanation: '`left-pad` is replaceable with `String.prototype.padStart`.',
  },
};

export interface OverlapGroup {
  /** npm package names in the same functional category */
  packages: readonly string[];
  /** Shown when multiple members appear in the same PR */
  explanation: string;
}

/**
 * Known overlapping dependency families. When two or more members appear in the
 * declared or imported set, each involved package gets a redundancy finding.
 */
export const DEPENDENCY_OVERLAP_GROUPS: readonly OverlapGroup[] = [
  {
    packages: ['lodash', 'ramda', 'underscore'],
    explanation:
      'Utility libraries `lodash`, `ramda`, and `underscore` overlap heavily; pick one or prefer native ES builtins.',
  },
  {
    packages: ['axios', 'node-fetch', 'got', 'ky', 'superagent', 'request'],
    explanation:
      'Multiple HTTP clients (`axios`, `node-fetch`, `got`, `ky`, etc.) overlap; prefer a single client or native `fetch`.',
  },
  {
    packages: ['moment', 'dayjs', 'date-fns', 'luxon'],
    explanation:
      'Date libraries (`moment`, `dayjs`, `date-fns`, `luxon`) overlap; standardize on one or use `Intl` / Temporal.',
  },
  {
    packages: ['uuid', 'nanoid', 'shortid'],
    explanation:
      'ID generators (`uuid`, `nanoid`, `shortid`) overlap; use `crypto.randomUUID()` when UUIDs suffice.',
  },
];
