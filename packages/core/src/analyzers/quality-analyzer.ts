import type { FindingInput } from '@vouch/types';
import { extractAddedLinesFromPatch } from '../parsers/diff-lines';
import { extractPackageName } from '../parsers/module-utils';
import {
  DEPENDENCY_OVERLAP_GROUPS,
  NATIVE_PACKAGE_ALTERNATIVES,
} from './quality-maps';

export type { NativeAlternativeInfo, OverlapGroup } from './quality-maps';
export { DEPENDENCY_OVERLAP_GROUPS, NATIVE_PACKAGE_ALTERNATIVES } from './quality-maps';

export interface QualityAnalyzerInput {
  /** Unified diff for package.json (or full file); used for line numbers and added deps */
  packageJsonPatch: string;
  filePath?: string;
  /**
   * Top-level npm package names extracted from PR source imports (TS/JS).
   * Pass an empty array if only analyzing package.json.
   */
  importedPackages: readonly string[];
}

function normalizePkg(name: string): string {
  return extractPackageName(name.trim()).toLowerCase();
}

function parseAddedDependenciesFromPatch(patch: string): string[] {
  const { syntheticSource } = extractAddedLinesFromPatch(patch);
  if (!syntheticSource.trim()) {
    return [];
  }
  try {
    const data = JSON.parse(syntheticSource) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };
    return [
      ...Object.keys(data.dependencies ?? {}),
      ...Object.keys(data.devDependencies ?? {}),
      ...Object.keys(data.peerDependencies ?? {}),
      ...Object.keys(data.optionalDependencies ?? {}),
    ];
  } catch {
    return [];
  }
}

function lineForDependencyInPatch(patch: string, dep: string): number {
  let line = 0;
  for (const row of patch.split(/\r?\n/)) {
    line++;
    if (!row.startsWith('+') || row.startsWith('+++')) {
      continue;
    }
    const content = row.slice(1);
    if (content.includes(`"${dep}"`) || content.includes(`'${dep}'`)) {
      return line;
    }
  }
  return 1;
}

function buildFinding(
  pkg: string,
  filePath: string,
  line: number,
  title: string,
  description: string,
  severity: 'low' | 'medium'
): FindingInput {
  return {
    type: 'anti-pattern',
    severity,
    confidence: 1.0,
    filePath,
    lineStart: line,
    lineEnd: line,
    title,
    description,
    codeSnippet: pkg,
  };
}

function checkNativeAlternatives(
  packages: Set<string>,
  filePath: string,
  patch: string,
  findings: FindingInput[]
): void {
  for (const pkg of packages) {
    const key = pkg.toLowerCase();
    const info = NATIVE_PACKAGE_ALTERNATIVES[key];
    if (!info) {
      continue;
    }
    const line = lineForDependencyInPatch(patch, pkg);
    findings.push(
      buildFinding(
        pkg,
        filePath,
        line,
        `Native alternative available for ${pkg}`,
        `${info.explanation} Prefer: ${info.alternative}.`,
        'medium'
      )
    );
  }
}

function checkRedundancy(
  packages: Set<string>,
  filePath: string,
  patch: string,
  findings: FindingInput[]
): void {
  const alreadyFlagged = new Set<string>();

  for (const group of DEPENDENCY_OVERLAP_GROUPS) {
    const present = group.packages.filter((p) => packages.has(normalizePkg(p)));
    if (present.length < 2) {
      continue;
    }
    const others = present.join(', ');
    for (const pkg of present) {
      const norm = normalizePkg(pkg);
      if (alreadyFlagged.has(norm)) {
        continue;
      }
      alreadyFlagged.add(norm);
      const line = lineForDependencyInPatch(patch, pkg);
      findings.push(
        buildFinding(
          pkg,
          filePath,
          line,
          `Redundant dependency: ${pkg}`,
          `${group.explanation} Detected overlapping package(s) in this change: ${others}.`,
          'medium'
        )
      );
    }
  }
}

function checkUnusedDeclared(
  declared: string[],
  imported: Set<string>,
  filePath: string,
  patch: string,
  findings: FindingInput[]
): void {
  for (const dep of declared) {
    const norm = normalizePkg(dep);
    if (imported.has(norm)) {
      continue;
    }
    const line = lineForDependencyInPatch(patch, dep);
    findings.push(
      buildFinding(
        dep,
        filePath,
        line,
        `Unused dependency: ${dep}`,
        `Package \`${dep}\` was added to package.json but no import of \`${dep}\` was found in the PR diff. Remove it or add a usage.`,
        'low'
      )
    );
  }
}

/**
 * Deterministic "slop detector" for dependency quality (redundancy, native replacements, unused deps).
 */
export function analyzeDependencyQuality(input: QualityAnalyzerInput): FindingInput[] {
  const filePath = input.filePath ?? 'package.json';
  const patch = input.packageJsonPatch;
  const declared = parseAddedDependenciesFromPatch(patch);
  const imported = new Set(input.importedPackages.map(normalizePkg));

  const union = new Set<string>();
  for (const d of declared) {
    union.add(normalizePkg(d));
  }
  for (const i of imported) {
    union.add(i);
  }

  const findings: FindingInput[] = [];

  checkNativeAlternatives(union, filePath, patch, findings);
  checkRedundancy(union, filePath, patch, findings);
  checkUnusedDeclared(declared, imported, filePath, patch, findings);

  return findings;
}

/**
 * Analyze from an explicit dependency list (e.g. unit tests) without a real patch.
 */
export function analyzeDeclaredDependencies(
  dependencies: readonly string[],
  importedPackages: readonly string[] = [],
  filePath = 'package.json'
): FindingInput[] {
  const body = JSON.stringify(
    {
      dependencies: Object.fromEntries(dependencies.map((d) => [d, '1.0.0'])),
    },
    null,
    2
  );
  const patch = `@@ -0,0 +1,10 @@\n${body.split('\n').map((l) => `+${l}`).join('\n')}\n`;
  return analyzeDependencyQuality({
    packageJsonPatch: patch,
    filePath,
    importedPackages,
  });
}
