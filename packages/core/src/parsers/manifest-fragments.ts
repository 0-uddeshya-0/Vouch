/**
 * Tolerant extraction of npm dependencies from package.json diffs.
 *
 * When a PR adds a whole package.json, the added lines form valid JSON and can
 * be parsed directly. When a PR adds lines to an *existing* package.json (the
 * common case), the added lines are a fragment like:
 *
 *     "express-auth-slop": "^1.0.0",
 *     "lodash": "4.17.15",
 *
 * JSON.parse fails on fragments, so we fall back to per-line extraction of
 * `"name": "range"` pairs that look like dependency entries.
 */

import { extractAddedLinesFromPatch } from './diff-lines';

export interface AddedManifestDependency {
  name: string;
  versionRange: string;
}

/** package.json fields whose values are version-like strings but are not dependencies. */
const NON_DEPENDENCY_FIELDS = new Set([
  'name',
  'version',
  'description',
  'main',
  'module',
  'types',
  'typings',
  'license',
  'author',
  'homepage',
  'type',
  'packageManager',
  'browser',
  'unpkg',
  'jsdelivr',
  // engines entries ("node": ">=20") match the line shape but are not packages
  'node',
  'npm',
  'pnpm',
  'yarn',
  'bun',
]);

const DEPENDENCY_LINE = /^\s*"((?:@[a-z0-9~][\w.~-]*\/)?[a-z0-9~][\w.~-]*)"\s*:\s*"([^"]+)"\s*,?\s*$/i;

const VERSION_LIKE =
  /^(?:[~^]|>=?|<=?|=)?\s*\d|^\*$|^x$|^latest$|^next$|^workspace:|^npm:|^file:|^link:|^portal:|^github:|^git\+|^https?:\/\//;

function fromJsonObject(data: unknown): AddedManifestDependency[] {
  if (!data || typeof data !== 'object') {
    return [];
  }
  const sections = [
    'dependencies',
    'devDependencies',
    'peerDependencies',
    'optionalDependencies',
  ] as const;
  const out: AddedManifestDependency[] = [];
  for (const section of sections) {
    const block = (data as Record<string, unknown>)[section];
    if (!block || typeof block !== 'object') {
      continue;
    }
    for (const [name, range] of Object.entries(block)) {
      if (typeof range === 'string') {
        out.push({ name, versionRange: range });
      }
    }
  }
  return out;
}

function fromFragmentLines(syntheticSource: string): AddedManifestDependency[] {
  const out: AddedManifestDependency[] = [];
  for (const line of syntheticSource.split('\n')) {
    const match = DEPENDENCY_LINE.exec(line);
    if (!match) {
      continue;
    }
    const [, name, range] = match;
    if (NON_DEPENDENCY_FIELDS.has(name)) {
      continue;
    }
    if (!VERSION_LIKE.test(range.trim())) {
      continue;
    }
    out.push({ name, versionRange: range });
  }
  return out;
}

/**
 * Extract dependencies added in a package.json patch. Parses complete JSON when
 * possible, otherwise falls back to line-level fragment matching.
 */
export function extractAddedNpmDependencies(patch: string): AddedManifestDependency[] {
  const { syntheticSource } = extractAddedLinesFromPatch(patch);
  if (!syntheticSource.trim()) {
    return [];
  }

  try {
    const parsed = fromJsonObject(JSON.parse(syntheticSource));
    if (parsed.length > 0) {
      return dedupe(parsed);
    }
    // Valid JSON but no dependency sections (e.g. a scripts-only change): the
    // fragment scan would misread script lines, so trust the JSON result.
    return [];
  } catch {
    return dedupe(fromFragmentLines(syntheticSource));
  }
}

/**
 * True when a version range resolves through the npm registry. Protocol ranges
 * (workspace:, file:, link:, git, tarball URLs) never do — checking them
 * against the registry produces guaranteed false "hallucination" findings.
 */
export function isRegistryInstallableRange(versionRange: string): boolean {
  return !/^(?:workspace:|file:|link:|portal:|npm:|git\+|github:|git:|https?:\/\/)/.test(
    versionRange.trim()
  );
}

function dedupe(deps: AddedManifestDependency[]): AddedManifestDependency[] {
  const seen = new Map<string, AddedManifestDependency>();
  for (const dep of deps) {
    if (!seen.has(dep.name)) {
      seen.set(dep.name, dep);
    }
  }
  return [...seen.values()];
}
