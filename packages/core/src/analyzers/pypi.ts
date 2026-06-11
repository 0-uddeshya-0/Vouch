import type { FindingInput } from '@vouch/types';
import { extractAddedLinesFromPatch } from '../parsers/diff-lines';
import { RegistryClient, defaultRegistryClient } from '../parsers/registry-client';

export type PypiAnalyzer = {
  analyzeRequirementsTxt(patch: string, filePath: string): Promise<{ findings: FindingInput[] }>;
  analyzePyprojectToml(patch: string, filePath: string): Promise<{ findings: FindingInput[] }>;
  analyzeImportStatement(
    moduleName: string,
    filePath: string,
    line: number,
    raw: string
  ): Promise<FindingInput | null>;
};

function parseRequirementsLines(patch: string): string[] {
  const { syntheticSource } = extractAddedLinesFromPatch(patch);
  const names: string[] = [];
  for (const line of syntheticSource.split(/\n/)) {
    const t = line.trim();
    if (!t || t.startsWith('#') || t.startsWith('-')) {
      continue;
    }
    const base = t.split(/[ \t[<>=!]/)[0];
    if (base) {
      names.push(base);
    }
  }
  return names;
}

/**
 * Common Python imports whose PyPI distribution name differs from the module name.
 * Without this map, `import cv2` would be flagged because there is no "cv2" project.
 */
const IMPORT_TO_DISTRIBUTION: Record<string, string> = {
  cv2: 'opencv-python',
  PIL: 'pillow',
  pil: 'pillow',
  yaml: 'pyyaml',
  sklearn: 'scikit-learn',
  skimage: 'scikit-image',
  bs4: 'beautifulsoup4',
  dotenv: 'python-dotenv',
  dateutil: 'python-dateutil',
  jwt: 'pyjwt',
  Crypto: 'pycryptodome',
  OpenSSL: 'pyopenssl',
  serial: 'pyserial',
  usb: 'pyusb',
  magic: 'python-magic',
  fitz: 'pymupdf',
  docx: 'python-docx',
  pptx: 'python-pptx',
  github: 'pygithub',
  googleapiclient: 'google-api-python-client',
  mpl_toolkits: 'matplotlib',
  attr: 'attrs',
  psycopg2: 'psycopg2-binary',
};

function resolveDistributionName(moduleName: string): string {
  return IMPORT_TO_DISTRIBUTION[moduleName] ?? moduleName;
}

function createAnalyzePyModule(registry: RegistryClient) {
  return async function analyzePyModule(
    moduleName: string,
    filePath: string,
    line: number,
    raw: string
  ): Promise<FindingInput | null> {
    const meta = await registry.getPypiPackage(resolveDistributionName(moduleName));
    if (meta.exists) {
      return null;
    }
    // Skip when the registry could not be reached — "unknown" is not "missing".
    if (!meta.verified) {
      return null;
    }
    return {
      type: 'hallucination',
      severity: 'medium',
      confidence: 0.8,
      filePath,
      lineStart: line,
      lineEnd: line,
      title: `PyPI project not found: ${moduleName}`,
      description: `Could not verify \`${raw}\` on PyPI (project may be private, renamed, or nonexistent).`,
      codeSnippet: raw,
    };
  };
}

export function createPypiAnalyzer(registry: RegistryClient): PypiAnalyzer {
  const analyzePyModule = createAnalyzePyModule(registry);

  return {
    async analyzeRequirementsTxt(patch: string, filePath: string): Promise<{ findings: FindingInput[] }> {
      const findings: FindingInput[] = [];
      const reqs = parseRequirementsLines(patch);
      let line = 0;
      for (const row of patch.split(/\r?\n/)) {
        line++;
        if (!row.startsWith('+') || row.startsWith('+++')) {
          continue;
        }
        const content = row.slice(1).trim();
        if (!content || content.startsWith('#')) {
          continue;
        }
        const name = content.split(/[ \t[<>=!]/)[0];
        if (name && reqs.includes(name)) {
          const f = await analyzePyModule(name, filePath, line, name);
          if (f) {
            findings.push(f);
          }
        }
      }
      return { findings };
    },

    async analyzePyprojectToml(patch: string, filePath: string): Promise<{ findings: FindingInput[] }> {
      const findings: FindingInput[] = [];
      const { syntheticSource } = extractAddedLinesFromPatch(patch);
      const depNames = new Set<string>();
      for (const line of syntheticSource.split(/\n/)) {
        const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=/);
        if (m) {
          depNames.add(m[1]);
        }
      }
      let lineNo = 0;
      for (const row of patch.split(/\r?\n/)) {
        lineNo++;
        if (!row.startsWith('+') || row.startsWith('+++')) {
          continue;
        }
        const content = row.slice(1);
        for (const dep of depNames) {
          if (content.includes(dep)) {
            const f = await analyzePyModule(dep, filePath, lineNo, dep);
            if (f) {
              findings.push(f);
            }
          }
        }
      }
      return { findings };
    },

    async analyzeImportStatement(
      moduleName: string,
      filePath: string,
      line: number,
      raw: string
    ): Promise<FindingInput | null> {
      return analyzePyModule(moduleName, filePath, line, raw);
    },
  };
}

export const pypiAnalyzer = createPypiAnalyzer(defaultRegistryClient);
