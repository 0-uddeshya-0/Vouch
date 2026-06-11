#!/usr/bin/env bash
# Creates a branch with intentional bad dependencies for Vouch dogfooding.
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
TARGET="${ROOT}/apps/api/package.json"
BRANCH="dogfood/vouch-production-test"

if ! command -v git >/dev/null 2>&1; then
  echo "git is required"
  exit 1
fi

if ! command -v node >/dev/null 2>&1; then
  echo "node is required"
  exit 1
fi

cd "$ROOT"

if [[ -n "$(git status --porcelain)" ]]; then
  echo "Working tree is not clean. Commit or stash changes first."
  exit 1
fi

git checkout -b "$BRANCH" 2>/dev/null || git checkout "$BRANCH"

node <<'NODE'
const fs = require('fs');
const path = require('path');
const pkgPath = path.join(process.cwd(), 'apps/api/package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
pkg.dependencies = pkg.dependencies || {};
// Only ADD the two bad deps — do not re-sort existing keys, so the diff
// contains exactly two added lines (like a real PR would).
pkg.dependencies['express-auth-slop'] = '^1.0.0';
pkg.dependencies['lodash'] = '^4.17.21';
fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
console.log('Updated apps/api/package.json with dogfood dependencies');
NODE

git add apps/api/package.json
git commit -m "dogfood: add fake npm package and unused lodash for Vouch test"

echo ""
echo "Branch ready: $BRANCH"
echo ""
echo "Next steps:"
echo "  git push -u origin $BRANCH"
echo "  Open a PR on GitHub against main"
echo "  Ensure Vouch GitHub App is installed on this repository"
echo "  Watch for Check Run + PR comment within ~30 seconds"
