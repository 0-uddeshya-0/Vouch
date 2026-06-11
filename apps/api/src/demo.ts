/**
 * Vouch demo — runs the real analysis pipeline on a fixture "AI-generated" PR
 * without needing a GitHub App, webhooks, Redis, or an LLM.
 *
 *   pnpm demo            # analyze + seed the local database for the dashboard
 *   pnpm demo --no-db    # analyze only (no database needed)
 *
 * The fixture PR is the kind of change an AI assistant plausibly produces:
 * a hallucinated package, a CVE-riddled lodash pin, redundant HTTP clients,
 * an unused dependency, a hardcoded AWS key, and a phantom Python import.
 */

// Demo never talks to GitHub: satisfy env validation with placeholders before
// any module that loads @vouch/config/env is imported.
process.env.GITHUB_APP_ID ??= 'demo';
process.env.GITHUB_PRIVATE_KEY ??= 'demo-placeholder-key';
process.env.GITHUB_WEBHOOK_SECRET ??= 'demo-placeholder-secret';
process.env.DATABASE_URL ??= 'postgresql://postgres:postgres@localhost:5432/vouch?schema=public';
process.env.REDIS_URL ??= 'redis://localhost:6379';

const DEMO_REPO = 'acme/payments-service';
const DEMO_PR_NUMBER = 42;
const DEMO_INSTALLATION_GITHUB_ID = 999_999_001;
const DEMO_REPO_GITHUB_ID = 999_999_002;

interface DemoFile {
  filename: string;
  status: string;
  patch: string;
}

/** A realistic AI-assistant PR: plausible-looking, quietly wrong. */
const DEMO_FILES: DemoFile[] = [
  {
    filename: 'services/payments/package.json',
    status: 'modified',
    patch: [
      '@@ -8,10 +8,15 @@',
      '   "dependencies": {',
      '     "fastify": "^4.26.0",',
      '+    "express-auth-slop": "^1.0.0",',
      '+    "lodash": "4.17.15",',
      '+    "axios": "^1.6.0",',
      '+    "node-fetch": "^2.6.7",',
      '+    "left-pad": "^1.3.0",',
      '     "zod": "^3.22.4"',
      '   }',
    ].join('\n'),
  },
  {
    filename: 'services/payments/src/refund-service.ts',
    status: 'added',
    patch: [
      '@@ -0,0 +1,14 @@',
      "+import axios from 'axios';",
      "+import retry from 'axios-retry-pro';",
      "+import { groupBy } from 'lodash';",
      '+',
      "+const REFUND_API_KEY = 'AKIA2E4XQJ7VHZ93KQLM';",
      '+',
      '+export async function processRefund(orderId: string, amount: number) {',
      "+  const response = await axios.post('https://api.payments.internal/refunds', {",
      '+    orderId,',
      '+    amount,',
      '+    apiKey: REFUND_API_KEY,',
      '+  });',
      '+  return groupBy(response.data.items, (item: { status: string }) => item.status);',
      '+}',
    ].join('\n'),
  },
  {
    filename: 'services/payments/scripts/reconcile.py',
    status: 'added',
    patch: [
      '@@ -0,0 +1,8 @@',
      '+import json',
      '+import flask_auth_simple_pro',
      '+import requests',
      '+',
      '+def reconcile(batch_id: str):',
      '+    session = flask_auth_simple_pro.Session()',
      '+    payload = requests.get(f"https://internal/batches/{batch_id}").json()',
      '+    return json.dumps(payload)',
    ].join('\n'),
  },
];

const BOLD = '\x1b[1m';
const DIM = '\x1b[2m';
const RED = '\x1b[31m';
const YELLOW = '\x1b[33m';
const GREEN = '\x1b[32m';
const CYAN = '\x1b[36m';
const RESET = '\x1b[0m';

function severityColor(severity: string): string {
  if (severity === 'critical') return RED;
  if (severity === 'high') return RED;
  if (severity === 'medium') return YELLOW;
  return DIM;
}

async function main(): Promise<void> {
  const seedDb = !process.argv.includes('--no-db');

  const core = await import('@vouch/core');
  const {
    scanForSecrets,
    entropyScanner,
    createNpmAnalyzer,
    createPypiAnalyzer,
    RegistryClient,
    extractTypeScriptImports,
    extractPythonImports,
    extractPackageName,
    extractTopLevelModule,
    isNodeBuiltin,
    isPythonStandardLibrary,
    analyzeDependencyQuality,
    collectManifestPackages,
    checkVulnerabilities,
    formatGitHubPRComment,
    buildCheckRunPresentation,
    DEFAULT_REPO_CONFIG,
  } = core;

  console.log(`\n${BOLD}Vouch demo${RESET} — analyzing a fixture AI-generated PR`);
  console.log(`${DIM}Repo ${DEMO_REPO} · PR #${DEMO_PR_NUMBER} · ${DEMO_FILES.length} files changed${RESET}\n`);
  console.log(`${DIM}Running deterministic pipeline: secrets → registries (live npm/PyPI) → slop detector → OSV CVE scan${RESET}\n`);

  const registry = new RegistryClient();
  const npmAnalyzer = createNpmAnalyzer(registry, DEFAULT_REPO_CONFIG);
  const pypiAnalyzer = createPypiAnalyzer(registry);

  type Finding = Awaited<ReturnType<typeof npmAnalyzer.analyzePackageJson>>['findings'][number];
  const findings: Finding[] = [];

  // 1. Per-file pass (same checks the worker runs)
  for (const file of DEMO_FILES) {
    findings.push(...scanForSecrets(file.patch, file.filename));
    findings.push(...entropyScanner.scan(file.patch, file.filename));

    if (file.filename.endsWith('package.json')) {
      const result = await npmAnalyzer.analyzePackageJson(file.patch, file.filename);
      findings.push(...result.findings);
    } else if (/\.(ts|tsx|js|jsx)$/.test(file.filename)) {
      for (const imp of extractTypeScriptImports(file.patch, file.filename)) {
        const pkg = extractPackageName(imp.source);
        if (pkg && !isNodeBuiltin(pkg)) {
          const finding = await npmAnalyzer.analyzeImportStatement(pkg, file.filename, imp.line, imp.source);
          if (finding) findings.push(finding);
        }
      }
    } else if (file.filename.endsWith('.py')) {
      for (const imp of extractPythonImports(file.patch)) {
        const mod = extractTopLevelModule(imp.module);
        if (mod && !isPythonStandardLibrary(mod)) {
          const finding = await pypiAnalyzer.analyzeImportStatement(mod, file.filename, imp.line, imp.name);
          if (finding) findings.push(finding);
        }
      }
    }
  }

  // 2. Slop detector with PR-wide import context
  const importedPackages: string[] = [];
  for (const file of DEMO_FILES) {
    if (/\.(ts|tsx|js|jsx)$/.test(file.filename)) {
      for (const imp of extractTypeScriptImports(file.patch, file.filename)) {
        const pkg = extractPackageName(imp.source);
        if (pkg && !isNodeBuiltin(pkg)) importedPackages.push(pkg);
      }
    }
  }
  const manifest = DEMO_FILES.find((f) => f.filename.endsWith('package.json'));
  if (manifest) {
    findings.push(
      ...analyzeDependencyQuality({
        packageJsonPatch: manifest.patch,
        filePath: manifest.filename,
        importedPackages,
        repoConfig: DEFAULT_REPO_CONFIG,
      })
    );
  }

  // 3. OSV CVE scan (live)
  try {
    const packages = collectManifestPackages(DEMO_FILES.map((f) => ({ filename: f.filename, patch: f.patch })));
    findings.push(...(await checkVulnerabilities(packages)));
  } catch (error) {
    console.warn(`${YELLOW}OSV scan skipped (network?):${RESET}`, error instanceof Error ? error.message : error);
  }

  // ── Report ────────────────────────────────────────────────────────────────
  const order: Record<string, number> = { critical: 0, high: 1, medium: 2, low: 3 };
  findings.sort((a, b) => (order[a.severity] ?? 9) - (order[b.severity] ?? 9));

  console.log(`${BOLD}Found ${findings.length} issues:${RESET}\n`);
  for (const f of findings) {
    const color = severityColor(f.severity);
    console.log(`  ${color}${BOLD}${f.severity.toUpperCase().padEnd(8)}${RESET} ${f.title}`);
    console.log(`  ${DIM}${f.filePath}:${f.lineStart} · ${f.type}${RESET}`);
    if (f.codeSnippet) console.log(`  ${DIM}> ${f.codeSnippet.slice(0, 90)}${RESET}`);
    console.log();
  }

  // 4. Render exactly what Vouch posts on GitHub
  const analysisId = `demo-${Date.now().toString(36)}`;
  const meta = {
    analysisId,
    model: 'deterministic-only (demo)',
    confidence: 0.7,
    llmTier1Calls: 0,
    llmTier2Calls: 0,
    estimatedCost: 0,
    prNumber: DEMO_PR_NUMBER,
    dashboardBaseUrl: process.env.VOUCH_DASHBOARD_URL ?? 'http://localhost:3002',
  };
  const comment = formatGitHubPRComment(findings, meta);
  const checkRun = buildCheckRunPresentation(findings, meta);

  const fs = await import('node:fs');
  const path = await import('node:path');
  const previewPath = path.resolve(__dirname, '../../../scripts/demo/pr-comment-preview.md');
  fs.mkdirSync(path.dirname(previewPath), { recursive: true });
  fs.writeFileSync(previewPath, comment ?? '_No findings._\n');

  console.log(`${BOLD}GitHub check run:${RESET} ${checkRun.conclusion === 'action_required' ? RED : GREEN}${checkRun.conclusion}${RESET} — ${checkRun.title}`);
  console.log(`${BOLD}PR comment preview written to:${RESET} ${CYAN}scripts/demo/pr-comment-preview.md${RESET}`);
  console.log(`${DIM}(paste it into any GitHub comment box to see the exact rendering)${RESET}\n`);

  // 5. Seed the dashboard database
  if (!seedDb) {
    console.log(`${DIM}--no-db: skipping database seed.${RESET}\n`);
    return;
  }

  try {
    const { PrismaClient } = await import('@prisma/client');
    const prisma = new PrismaClient({ log: ['error'] });
    await prisma.$queryRaw`SELECT 1`;

    const installation = await prisma.installation.upsert({
      where: { githubId: DEMO_INSTALLATION_GITHUB_ID },
      update: { status: 'active' },
      create: {
        githubId: DEMO_INSTALLATION_GITHUB_ID,
        accountLogin: 'acme',
        accountType: 'Organization',
        plan: 'free',
        status: 'active',
      },
    });

    const repo = await prisma.repo.upsert({
      where: { githubId: DEMO_REPO_GITHUB_ID },
      update: { fullName: DEMO_REPO },
      create: {
        installationId: installation.id,
        githubId: DEMO_REPO_GITHUB_ID,
        fullName: DEMO_REPO,
        private: true,
        defaultBranch: 'main',
      },
    });

    // Replace previous demo runs so re-running stays clean.
    await prisma.$transaction([
      prisma.finding.deleteMany({ where: { analysis: { repoId: repo.id } } }),
      prisma.analysis.deleteMany({ where: { repoId: repo.id } }),
    ]);

    const analysis = await prisma.analysis.create({
      data: {
        repoId: repo.id,
        prNumber: DEMO_PR_NUMBER,
        commitSha: 'demo0000deadbeef',
        status: 'completed',
        completedAt: new Date(),
      },
    });

    await prisma.finding.createMany({
      data: findings.map((f) => ({
        analysisId: analysis.id,
        type: f.type,
        severity: f.severity,
        confidence: f.confidence,
        filePath: f.filePath,
        lineStart: f.lineStart,
        lineEnd: f.lineEnd,
        title: f.title,
        description: f.description,
        codeSnippet: f.codeSnippet,
      })),
    });

    await prisma.$disconnect();

    console.log(`${GREEN}${BOLD}Database seeded.${RESET} View the findings dashboard:`);
    console.log(`  ${CYAN}DASHBOARD_DEMO_MODE=true pnpm --filter @vouch/dashboard dev${RESET}`);
    console.log(`  then open ${CYAN}http://localhost:3002/findings${RESET}\n`);
  } catch (error) {
    console.warn(`${YELLOW}Could not seed the database${RESET} (is Postgres running?)`);
    console.warn(`${DIM}Start it with: docker compose -f infra/docker/docker-compose.dev.yml up -d db${RESET}`);
    console.warn(`${DIM}then: npx prisma migrate deploy && pnpm demo${RESET}`);
    console.warn(`${DIM}(${error instanceof Error ? error.message.split('\n')[0] : error})${RESET}\n`);
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error('Demo failed:', error);
  process.exit(1);
});
