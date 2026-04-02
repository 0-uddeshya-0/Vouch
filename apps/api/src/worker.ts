/**
 * Analysis Worker
 * BullMQ worker for processing PR analysis jobs
 */

import { Worker } from 'bullmq';
import { Redis } from 'ioredis';
import { env } from '@vouch/config';
import { 
  LLMRouter, 
  npmAnalyzer, 
  pypiAnalyzer, 
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
} from '@vouch/core';
import { getPrisma } from './plugins';
import type { FindingInput } from '@vouch/types';

interface AnalysisJob {
  analysisId: string;
  installationId: number;
  repoId: number;
  repoFullName: string;
  prNumber: number;
  commitSha: string;
  defaultBranch: string;
}

const redis = new Redis(env.REDIS_URL);
const llmRouter = new LLMRouter();

const worker = new Worker<AnalysisJob>('pr-analysis', async (job) => {
  const { 
    analysisId, 
    installationId, 
    repoFullName, 
    prNumber, 
    commitSha 
  } = job.data;
  
  console.log(`Processing analysis ${analysisId} for ${repoFullName}#${prNumber}`);
  
  const prisma = getPrisma();
  const [owner, repo] = repoFullName.split('/');
  
  // Update analysis status
  await prisma.analysis.update({
    where: { id: analysisId },
    data: { status: 'processing' },
  });
  
  let checkRunId: number | null = null;
  let llmTier1Calls = 0;
  let llmTier2Calls = 0;
  let estimatedCost = 0;
  
  try {
    // Get GitHub client
    const octokit = await getInstallationOctokit(installationId);
    const checkRunManager = new CheckRunManager(octokit);
    
    // Create check run
    const checkRun = await checkRunManager.createCheckRun({
      owner,
      repo,
      sha: commitSha,
    });
    checkRunId = checkRun.id;
    
    // Get PR files
    const { data: files } = await octokit.pulls.listFiles({
      owner,
      repo,
      pull_number: prNumber,
    });
    
    const allFindings: FindingInput[] = [];
    
    // Analyze each file
    for (const file of files) {
      if (!file.patch || file.status === 'removed') continue;
      
      const findings = await analyzeFile(file.filename, file.patch, file.status);
      allFindings.push(...findings);
    }
    
    // Create findings in database
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
    
    // Update analysis
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
    
    // Update check run
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
    
    // Post PR comment
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
    
    // Update analysis status
    await prisma.analysis.update({
      where: { id: analysisId },
      data: {
        status: 'error',
        completedAt: new Date(),
      },
    });
    
    // Update check run if created
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
  status: string
): Promise<FindingInput[]> {
  const findings: FindingInput[] = [];
  
  // Check for secrets in all files
  const secretFindings = scanForSecrets(patch, filename);
  findings.push(...secretFindings);
  
  // Run entropy scanner
  const entropyFindings = entropyScanner.scan(patch, filename);
  findings.push(...entropyFindings);
  
  // Analyze based on file type
  if (filename === 'package.json') {
    const result = await npmAnalyzer.analyzePackageJson(patch, filename);
    findings.push(...result.findings);
  } else if (filename === 'requirements.txt') {
    const result = await pypiAnalyzer.analyzeRequirementsTxt(patch, filename);
    findings.push(...result.findings);
  } else if (filename === 'pyproject.toml') {
    const result = await pypiAnalyzer.analyzePyprojectToml(patch, filename);
    findings.push(...result.findings);
  } else if (filename.endsWith('.ts') || filename.endsWith('.tsx') || 
             filename.endsWith('.js') || filename.endsWith('.jsx')) {
    // Extract and check imports
    const imports = extractTypeScriptImports(patch);
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
    // Extract and check Python imports
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

// Handle worker events
worker.on('completed', (job) => {
  console.log(`Job ${job.id} completed:`, job.returnvalue);
});

worker.on('failed', (job, error) => {
  console.error(`Job ${job?.id} failed:`, error);
});

console.log('Analysis worker started');

// Graceful shutdown
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
