import type { FindingInput } from '@vouch/types';
import { extractAddedLinesFromPatch } from '../parsers/diff-lines';

export interface PackageRef {
  name: string;
  version: string;
  ecosystem: 'npm' | 'PyPI';
}

export interface OsvBatchResponse {
  results: Array<{
    vulns?: Array<{
      id: string;
      summary?: string;
      details?: string;
      database_specific?: { severity?: string; cvss_score?: number };
      severity?: Array<{ type: string; score: string }>;
      aliases?: string[];
    }>;
  }>;
}

const OSV_BATCH_URL = 'https://api.osv.dev/v1/querybatch';
const BATCH_SIZE = 100;

/** Strip semver range prefixes (^, ~, >=) to query a concrete version */
export function normalizeVersion(range: string): string | null {
  const trimmed = range.trim();
  if (!trimmed || trimmed === '*' || trimmed === 'latest') {
    return null;
  }

  const semverMatch = trimmed.match(/(\d+\.\d+\.\d+(?:[-+][\w.-]+)?)/);
  if (semverMatch) {
    return semverMatch[1];
  }

  return null;
}

export function extractNpmPackagesFromPatch(patch: string, filePath = 'package.json'): PackageRef[] {
  const packages: PackageRef[] = [];
  const { syntheticSource } = extractAddedLinesFromPatch(patch);
  if (!syntheticSource.trim()) {
    return packages;
  }

  try {
    const data = JSON.parse(syntheticSource) as {
      dependencies?: Record<string, string>;
      devDependencies?: Record<string, string>;
      peerDependencies?: Record<string, string>;
      optionalDependencies?: Record<string, string>;
    };

    const sections = [
      data.dependencies,
      data.devDependencies,
      data.peerDependencies,
      data.optionalDependencies,
    ];

    for (const section of sections) {
      if (!section) {
        continue;
      }
      for (const [name, versionRange] of Object.entries(section)) {
        const version = normalizeVersion(versionRange);
        if (!version) {
          continue;
        }
        packages.push({ name, version, ecosystem: 'npm' });
      }
    }
  } catch {
    return packages;
  }

  return packages;
}

export function extractPyPiPackagesFromRequirementsPatch(patch: string): PackageRef[] {
  const packages: PackageRef[] = [];

  for (const row of patch.split(/\r?\n/)) {
    if (!row.startsWith('+') || row.startsWith('+++')) {
      continue;
    }
    const line = row.slice(1).trim();
    if (!line || line.startsWith('#')) {
      continue;
    }
    const match = line.match(/^([a-zA-Z0-9_.-]+)\s*(?:\[.*?\])?\s*(==|>=|<=|~=|!=)?\s*([\d.]+[\w.-]*)/);
    if (!match) {
      continue;
    }
    const version = normalizeVersion(match[3]);
    if (!version) {
      continue;
    }
    packages.push({ name: match[1], version, ecosystem: 'PyPI' });
  }

  return packages;
}

function mapOsvSeverity(vuln: NonNullable<OsvBatchResponse['results'][0]['vulns']>[0]): 'low' | 'medium' | 'high' | 'critical' {
  const cvss = vuln.database_specific?.cvss_score;
  if (typeof cvss === 'number') {
    if (cvss >= 9) return 'critical';
    if (cvss >= 7) return 'high';
    if (cvss >= 4) return 'medium';
    return 'low';
  }

  const label = vuln.database_specific?.severity?.toLowerCase() ?? '';
  if (label.includes('critical')) return 'critical';
  if (label.includes('high')) return 'high';
  if (label.includes('medium') || label.includes('moderate')) return 'medium';
  return 'high';
}

function cveId(vuln: NonNullable<OsvBatchResponse['results'][0]['vulns']>[0]): string {
  const alias = vuln.aliases?.find((a) => a.startsWith('CVE-'));
  return alias ?? vuln.id;
}

function toOsvFinding(
  pkg: PackageRef & { filePath?: string },
  vuln: NonNullable<OsvBatchResponse['results'][0]['vulns']>[0]
): FindingInput {
  const id = cveId(vuln);
  const advisoryUrl = `https://osv.dev/vulnerability/${encodeURIComponent(vuln.id)}`;

  return {
    type: 'security',
    severity: mapOsvSeverity(vuln),
    confidence: 1.0,
    filePath: pkg.filePath ?? 'package.json',
    lineStart: 1,
    lineEnd: 1,
    title: `Known vulnerability: ${id} in ${pkg.name}@${pkg.version}`,
    description: `${vuln.summary ?? vuln.details ?? 'Known CVE reported in OSV.'} Advisory: ${advisoryUrl}`,
    codeSnippet: `${pkg.name}@${pkg.version}`,
  };
}

export async function checkVulnerabilities(
  packages: PackageRef[],
  fetchImpl: typeof fetch = fetch
): Promise<FindingInput[]> {
  if (packages.length === 0) {
    return [];
  }

  const findings: FindingInput[] = [];

  for (let offset = 0; offset < packages.length; offset += BATCH_SIZE) {
    const batch = packages.slice(offset, offset + BATCH_SIZE);
    const response = await fetchImpl(OSV_BATCH_URL, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        queries: batch.map((pkg) => ({
          package: {
            name: pkg.name,
            ecosystem: pkg.ecosystem,
          },
          version: pkg.version,
        })),
      }),
    });

    if (!response.ok) {
      console.error(`[OSV] batch query failed: ${response.status}`);
      continue;
    }

    const data = (await response.json()) as OsvBatchResponse;

    for (let index = 0; index < batch.length; index++) {
      const pkg = batch[index] as PackageRef & { filePath?: string };
      const vulns = data.results[index]?.vulns ?? [];

      for (const vuln of vulns) {
        findings.push(toOsvFinding(pkg, vuln));
      }
    }
  }

  return findings;
}

export function collectManifestPackages(
  files: Array<{ filename: string; patch: string }>
): Array<PackageRef & { filePath: string }> {
  const packages: Array<PackageRef & { filePath: string }> = [];

  for (const file of files) {
    if (file.filename === 'package.json' || file.filename.endsWith('/package.json')) {
      for (const pkg of extractNpmPackagesFromPatch(file.patch, file.filename)) {
        packages.push({ ...pkg, filePath: file.filename });
      }
    } else if (
      file.filename === 'requirements.txt' ||
      file.filename.endsWith('/requirements.txt')
    ) {
      for (const pkg of extractPyPiPackagesFromRequirementsPatch(file.patch)) {
        packages.push({ ...pkg, filePath: file.filename });
      }
    }
  }

  return packages;
}
