import { extractAddedNpmDependencies } from '../parsers/manifest-fragments';
import { extractNpmPackagesFromPatch } from '../analyzers/osv-scanner';

describe('extractAddedNpmDependencies', () => {
  it('parses a whole-file package.json addition (valid JSON)', () => {
    const body = JSON.stringify(
      {
        name: 'demo',
        version: '1.0.0',
        dependencies: { lodash: '^4.17.21', axios: '^1.6.0' },
        devDependencies: { jest: '^29.0.0' },
      },
      null,
      2
    );
    const patch = `@@ -0,0 +1,12 @@\n${body
      .split('\n')
      .map((l) => `+${l}`)
      .join('\n')}`;

    const deps = extractAddedNpmDependencies(patch);
    const names = deps.map((d) => d.name).sort();
    expect(names).toEqual(['axios', 'jest', 'lodash']);
  });

  it('parses a fragment edit to an existing package.json', () => {
    const patch = [
      '@@ -10,6 +10,8 @@',
      '   "dependencies": {',
      '     "fastify": "^4.0.0",',
      '+    "express-auth-slop": "^1.0.0",',
      '+    "lodash": "4.17.15",',
      '     "zod": "^3.22.4"',
      '   }',
    ].join('\n');

    const deps = extractAddedNpmDependencies(patch);
    expect(deps).toEqual([
      { name: 'express-auth-slop', versionRange: '^1.0.0' },
      { name: 'lodash', versionRange: '4.17.15' },
    ]);
  });

  it('ignores non-dependency fields and scripts in fragments', () => {
    const patch = [
      '@@ -1,4 +1,8 @@',
      '+  "version": "2.0.0",',
      '+  "packageManager": "pnpm@9.15.4",',
      '+  "build": "tsc --noEmit",',
      '+  "node": ">=20.0.0",',
      '+  "left-pad": "^1.3.0",',
    ].join('\n');

    const deps = extractAddedNpmDependencies(patch);
    expect(deps).toEqual([{ name: 'left-pad', versionRange: '^1.3.0' }]);
  });

  it('handles scoped packages in fragments', () => {
    const patch = ['@@ -5,2 +5,3 @@', '+    "@types/node": "^20.11.0",'].join('\n');
    expect(extractAddedNpmDependencies(patch)).toEqual([
      { name: '@types/node', versionRange: '^20.11.0' },
    ]);
  });

  it('feeds fragment deps into the OSV package extractor', () => {
    const patch = ['@@ -10,2 +10,3 @@', '+    "lodash": "4.17.15",'].join('\n');
    expect(extractNpmPackagesFromPatch(patch)).toEqual([
      { name: 'lodash', version: '4.17.15', ecosystem: 'npm' },
    ]);
  });

  it('returns nothing for empty or unrelated patches', () => {
    expect(extractAddedNpmDependencies('')).toEqual([]);
    const patch = ['@@ -1,1 +1,2 @@', '+const x = 1;'].join('\n');
    expect(extractAddedNpmDependencies(patch)).toEqual([]);
  });
});
