import type { FindingInput } from '@vouch/types';
import { extractAddedNpmDependencies } from '../parsers/manifest-fragments';

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

  // Works for whole-file additions and fragment edits to an existing manifest.
  for (const { name, versionRange } of extractAddedNpmDependencies(patch)) {
    const version = normalizeVersion(versionRange);
    if (!version) {
      continue;
    }
    packages.push({ name, version, ecosystem: 'npm' });
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

const SEVERITY_RANK: Record<string, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const MAX_LISTED_ADVISORIES = 5;

/**
 * One finding per vulnerable package (axios@1.6.0 has 26 OSV entries — listing
 * each as its own finding would drown the PR comment).
 */
function toAggregatedOsvFinding(
  pkg: PackageRef & { filePath?: string },
  vulns: NonNullable<OsvBatchResponse['results'][0]['vulns']>
): FindingInput {
  let severity: 'low' | 'medium' | 'high' | 'critical' = 'low';
  for (const vuln of vulns) {
    const mapped = mapOsvSeverity(vuln);
    if (SEVERITY_RANK[mapped] > SEVERITY_RANK[severity]) {
      severity = mapped;
    }
  }

  const listed = vulns
    .slice(0, MAX_LISTED_ADVISORIES)
    .map((vuln) => cveId(vuln))
    .join(', ');
  const more = vulns.length > MAX_LISTED_ADVISORIES ? ` and ${vulns.length - MAX_LISTED_ADVISORIES} more` : '';

  return {
    type: 'security',
    severity,
    confidence: 1.0,
    filePath: pkg.filePath ?? 'package.json',
    lineStart: 1,
    lineEnd: 1,
    title: `${vulns.length} known ${vulns.length === 1 ? 'vulnerability' : 'vulnerabilities'} in ${pkg.name}@${pkg.version}`,
    description: `OSV reports ${vulns.length} known ${vulns.length === 1 ? 'advisory' : 'advisories'} affecting ${pkg.name}@${pkg.version}: ${listed}${more}. Upgrade to a patched version — details at https://osv.dev.`,
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

      if (vulns.length > 0) {
        findings.push(toAggregatedOsvFinding(pkg, vulns));
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
