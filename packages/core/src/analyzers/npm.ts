import type { FindingInput } from '@vouch/types';
import {
  DEFAULT_REPO_CONFIG,
  shouldIgnorePackage,
  type RepoConfig,
} from '../config/repo-config';
import { extractAddedLinesFromPatch } from '../parsers/diff-lines';
import { RegistryClient, defaultRegistryClient } from '../parsers/registry-client';
import { extractPackageName } from '../parsers/module-utils';

export type NpmAnalyzer = {
  analyzePackageJson(patch: string, filePath: string): Promise<{ findings: FindingInput[] }>;
  analyzeImportStatement(
    packageName: string,
    filePath: string,
    line: number,
    raw: string
  ): Promise<FindingInput | null>;
};

function createAnalyzeImportCore(registry: RegistryClient, repoConfig: RepoConfig) {
  return async function analyzeImportCore(
    packageName: string,
    filePath: string,
    line: number,
    raw: string
  ): Promise<FindingInput | null> {
    if (shouldIgnorePackage(packageName, repoConfig)) {
      return null;
    }
    const meta = await registry.getNpmPackage(packageName);
    if (meta.exists) {
      return null;
    }
    return {
      type: 'hallucination',
      severity: 'medium',
      confidence: 0.85,
      filePath,
      lineStart: line,
      lineEnd: line,
      title: `npm package not found: ${packageName}`,
      description: `The import references \`${raw}\` but the package \`${packageName}\` does not exist on the public npm registry (or could not be verified).`,
      codeSnippet: raw,
    };
  };
}

function firstLineForDependency(patch: string, dep: string): number {
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

export function createNpmAnalyzer(
  registry: RegistryClient,
  repoConfig: RepoConfig = DEFAULT_REPO_CONFIG
): NpmAnalyzer {
  const analyzeImportCore = createAnalyzeImportCore(registry, repoConfig);

  return {
    async analyzePackageJson(patch: string, filePath: string): Promise<{ findings: FindingInput[] }> {
      const findings: FindingInput[] = [];
      const { syntheticSource } = extractAddedLinesFromPatch(patch);
      let data: { dependencies?: Record<string, string>; devDependencies?: Record<string, string> };
      try {
        data = JSON.parse(syntheticSource || '{}') as {
          dependencies?: Record<string, string>;
          devDependencies?: Record<string, string>;
        };
      } catch {
        return { findings };
      }
      const deps = [
        ...Object.keys(data.dependencies ?? {}),
        ...Object.keys(data.devDependencies ?? {}),
      ];
      for (const dep of deps) {
        const pkg = extractPackageName(dep);
        const line = firstLineForDependency(patch, dep);
        const f = await analyzeImportCore(pkg, filePath, line, dep);
        if (f) {
          findings.push(f);
        }
      }
      return { findings };
    },

    async analyzeImportStatement(
      packageName: string,
      filePath: string,
      line: number,
      raw: string
    ): Promise<FindingInput | null> {
      return analyzeImportCore(packageName, filePath, line, raw);
    },
  };
}

/** Default analyzer using the in-memory registry client */
export const npmAnalyzer = createNpmAnalyzer(defaultRegistryClient);
