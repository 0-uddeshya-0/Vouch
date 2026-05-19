/**
 * Analysis Worker
 * BullMQ worker for processing PR analysis jobs
 */

import { env } from '@vouch/config/env';
import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import {
  LLMRouter,
  createPypiAnalyzer,
  RegistryClient,
  scanForSecrets,
  entropyScanner,
  formatPRComment,
  CheckRunManager,
  extractTypeScriptImports,
  extractPythonImports,
  extractPackageName,
  extractTopLevelModule,
  isNodeBuiltin,
  isPythonStandardLibrary,
  getInstallationOctokit,
  auditLogger,
  analyzeDependencyQuality,
  analyzeDeclaredDependencies,
  createNpmAnalyzer,
  fetchRepoConfig,
  type RepoConfig,
} from '@vouch/core';
import { getPrisma } from './plugins';
import type { FindingInput } from '@vouch/types';
import { RedisRegistryCacheAdapter } from './redis-registry-cache';

interface AnalysisJob {
  analysisId: string;
  installationId: number;
  repoId: number;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  defaultBranch: string;
}

interface PrFileInput {
  filename: string;
  patch: string;
  status: string;
}

const redis = new Redis(env.REDIS_URL);
const registryCache = new RedisRegistryCacheAdapter(redis);
const registryClient = new RegistryClient({ cache: registryCache });
const pypiAnalyzer = createPypiAnalyzer(registryClient);

const llmRouter = new LLMRouter();

function isPackageJsonPath(filename: string): boolean {
  return filename === 'package.json' || filename.endsWith('/package.json');
}

function isRequirementsTxtPath(filename: string): boolean {
  return filename === 'requirements.txt' || filename.endsWith('/requirements.txt');
}

function isPyprojectTomlPath(filename: string): boolean {
  return filename === 'pyproject.toml' || filename.endsWith('/pyproject.toml');
}

/**
 * Collect top-level package/module names imported across all PR source files.
 */
function collectImportedPackages(files: PrFileInput[]): string[] {
  const packages = new Set<string>();

  for (const file of files) {
    if (file.status === 'removed' || !file.patch) {
      continue;
    }

    if (
      file.filename.endsWith('.ts') ||
      file.filename.endsWith('.tsx') ||
      file.filename.endsWith('.js') ||
      file.filename.endsWith('.jsx')
    ) {
      const imports = extractTypeScriptImports(file.patch, file.filename);
      for (const imp of imports) {
        const packageName = extractPackageName(imp.source);
        if (packageName && !isNodeBuiltin(packageName)) {
          packages.add(packageName);
        }
      }
    } else if (file.filename.endsWith('.py')) {
      const imports = extractPythonImports(file.patch);
      for (const imp of imports) {
        const moduleName = extractTopLevelModule(imp.module);
        if (moduleName && !isPythonStandardLibrary(moduleName)) {
          packages.add(moduleName);
        }
      }
    }
  }

  return [...packages];
}

function parseAddedRequirementsDeps(patch: string): string[] {
  const names: string[] = [];
  for (const row of patch.split(/\r?\n/)) {
    if (!row.startsWith('+') || row.startsWith('+++')) {
      continue;
    }
    const t = row.slice(1).trim();
    if (!t || t.startsWith('#')) {
      continue;
    }
    const base = t.split(/[ \t[<>=!]/)[0];
    if (base) {
      names.push(base);
    }
  }
  return names;
}

function parseAddedPyprojectDeps(patch: string): string[] {
  const names: string[] = [];
  for (const row of patch.split(/\r?\n/)) {
    if (!row.startsWith('+') || row.startsWith('+++')) {
      continue;
    }
    const line = row.slice(1);
    const m = line.match(/^\s*([a-zA-Z0-9_-]+)\s*=/);
    if (m) {
      names.push(m[1]);
    }
  }
  return names;
}

/**
 * Run dependency quality (slop) analysis on manifest files using PR-wide import context.
 */
function analyzeDependencyQualityForPr(
  files: PrFileInput[],
  importedPackages: readonly string[],
  repoConfig: RepoConfig
): FindingInput[] {
  const findings: FindingInput[] = [];

  const packageJsonFile = files.find((f) => isPackageJsonPath(f.filename) && f.patch);
  if (packageJsonFile) {
    findings.push(
      ...analyzeDependencyQuality({
        packageJsonPatch: packageJsonFile.patch,
        filePath: packageJsonFile.filename,
        importedPackages,
        repoConfig,
      })
    );
  }

  const requirementsFile = files.find((f) => isRequirementsTxtPath(f.filename) && f.patch);
  if (requirementsFile) {
    const deps = parseAddedRequirementsDeps(requirementsFile.patch);
    if (deps.length > 0) {
      findings.push(
        ...analyzeDeclaredDependencies(deps, importedPackages, requirementsFile.filename, repoConfig)
      );
    }
  }

  const pyprojectFile = files.find((f) => isPyprojectTomlPath(f.filename) && f.patch);
  if (pyprojectFile) {
    const deps = parseAddedPyprojectDeps(pyprojectFile.patch);
    if (deps.length > 0) {
      findings.push(
        ...analyzeDeclaredDependencies(deps, importedPackages, pyprojectFile.filename, repoConfig)
      );
    }
  }

  return findings;
}

const worker = new Worker<AnalysisJob>('pr-analysis', async (job) => {
  const {
    analysisId,
    installationId,
    repoFullName,
    prNumber,
    commitSha,
    defaultBranch,
  } = job.data;

  console.log(`Processing analysis ${analysisId} for ${repoFullName}#${prNumber}`);

  const prisma = getPrisma();
  const [owner, repo] = repoFullName.split('/');

  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: 'processing' },
  });

  let checkRunId: number | null = null;
  let llmTier1Calls = 0;
  let llmTier2Calls = 0;
  let estimatedCost = 0;

  try {
    const octokit = await getInstallationOctokit(installationId);
    const repoConfig = await fetchRepoConfig(octokit, owner, repo, defaultBranch);
    const npmAnalyzer = createNpmAnalyzer(registryClient, repoConfig);
    const checkRunManager = new CheckRunManager(octokit);

    const checkRun = await checkRunManager.createCheckRun({
      owner,
      repo,
      sha: commitSha,
    });
    checkRunId = checkRun.id;

    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });

    const prFiles: PrFileInput[] = files
      .filter((f) => f.patch && f.status !== 'removed')
      .map((f) => ({
        filename: f.filename,
        patch: f.patch as string,
        status: f.status,
      }));

    const allFindings: FindingInput[] = [];

    for (const file of prFiles) {
      const findings = await analyzeFile(file.filename, file.patch, file.status, npmAnalyzer);
      allFindings.push(...findings);
    }

    const importedPackages = collectImportedPackages(prFiles);
    const qualityFindings = analyzeDependencyQualityForPr(prFiles, importedPackages, repoConfig);
    allFindings.push(...qualityFindings);

    for (const finding of allFindings) {
      await prisma.finding.create({
        data: {
          analysisId,
          type: finding.type,
          severity: finding.severity,
          confidence: finding.confidence,
          filePath: finding.filePath,
          lineStart: finding.lineStart,
          lineEnd: finding.lineEnd,
          title: finding.title,
          description: finding.description,
          codeSnippet: finding.codeSnippet,
        },
      });
    }

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'completed',
        completedAt: new Date(),
        llmTier1Calls,
        llmTier2Calls,
        estimatedCost,
      },
    });

    const dbFindings = await prisma.finding.findMany({
      where: { analysisId },
    });

    await checkRunManager.updateCheckRun(
      checkRunId,
      { owner, repo, sha: commitSha },
      dbFindings,
      {
        analysisId,
        model: llmTier2Calls > 0 ? 'claude-3-5-sonnet' : 'claude-3-5-haiku',
        confidence: env.LLM_CONFIDENCE_THRESHOLD,
        llmTier1Calls,
        llmTier2Calls,
        estimatedCost,
      }
    );

    const comment = formatPRComment(dbFindings, {
      analysisId,
      model: llmTier2Calls > 0 ? 'claude-3-5-sonnet' : 'claude-3-5-haiku',
      confidence: env.LLM_CONFIDENCE_THRESHOLD,
      llmTier1Calls,
      llmTier2Calls,
      estimatedCost,
    });

    await octokit.issues.createComment({
      owner,
      repo,
      issue_number: prNumber,
      body: comment,
    });

    auditLogger.log('analysis_completed', {
      analysisId,
      installationId,
      findingsCount: allFindings.length,
      qualityFindingsCount: qualityFindings.length,
      importedPackagesCount: importedPackages.length,
      llmTier1Calls,
      llmTier2Calls,
      estimatedCost,
    });

    return {
      success: true,
      findingsCount: allFindings.length,
      analysisId,
    };

  } catch (error) {
    console.error('Analysis failed:', error);

    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'error',
        completedAt: new Date(),
      },
    });

    if (checkRunId) {
      try {
        const octokit = await getInstallationOctokit(installationId);
        const checkRunManager = new CheckRunManager(octokit);
        await checkRunManager.completeCheckRun(
          checkRunId,
          { owner, repo, sha: commitSha },
          false,
          error instanceof Error ? error.message : 'Analysis failed'
        );
      } catch (checkError) {
        console.error('Failed to update check run:', checkError);
      }
    }

    auditLogger.log('analysis_failed', {
      analysisId,
      installationId,
      error: error instanceof Error ? error.message : 'Unknown error',
    });

    throw error;
  }
}, {
  connection: redis,
  concurrency: 5,
});

async function analyzeFile(
  filename: string,
  patch: string,
  _status: string,
  npmAnalyzer: ReturnType<typeof createNpmAnalyzer>
): Promise<FindingInput[]> {
  const findings: FindingInput[] = [];

  const secretFindings = scanForSecrets(patch, filename);
  findings.push(...secretFindings);

  const entropyFindings = entropyScanner.scan(patch, filename);
  findings.push(...entropyFindings);

  if (isPackageJsonPath(filename)) {
    const result = await npmAnalyzer.analyzePackageJson(patch, filename);
    findings.push(...result.findings);
  } else if (isRequirementsTxtPath(filename)) {
    const result = await pypiAnalyzer.analyzeRequirementsTxt(patch, filename);
    findings.push(...result.findings);
  } else if (isPyprojectTomlPath(filename)) {
    const result = await pypiAnalyzer.analyzePyprojectToml(patch, filename);
    findings.push(...result.findings);
  } else if (filename.endsWith('.ts') || filename.endsWith('.tsx') ||
             filename.endsWith('.js') || filename.endsWith('.jsx')) {
    const imports = extractTypeScriptImports(patch, filename);
    for (const imp of imports) {
      const packageName = extractPackageName(imp.source);
      if (!isNodeBuiltin(packageName)) {
        const finding = await npmAnalyzer.analyzeImportStatement(
          packageName,
          filename,
          imp.line,
          imp.source
        );
        if (finding) {
          findings.push(finding);
        }
      }
    }
  } else if (filename.endsWith('.py')) {
    const imports = extractPythonImports(patch);
    for (const imp of imports) {
      const moduleName = extractTopLevelModule(imp.module);
      if (!isPythonStandardLibrary(moduleName)) {
        const finding = await pypiAnalyzer.analyzeImportStatement(
          moduleName,
          filename,
          imp.line,
          imp.name
        );
        if (finding) {
          findings.push(finding);
        }
      }
    }
  }

  return findings;
}

worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

console.log('Analysis worker started');

process.on('SIGTERM', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});

process.on('SIGINT', async () => {
  console.log('Shutting down worker...');
  await worker.close();
  process.exit(0);
});
