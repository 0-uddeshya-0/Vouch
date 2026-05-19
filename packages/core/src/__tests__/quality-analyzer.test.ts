import {
  analyzeDeclaredDependencies,
  analyzeDependencyQuality,
} from '../analyzers/quality-analyzer';

describe('quality-analyzer', () => {
  it('flags lodash, axios, and uuid with explicit native or overlap reasoning', () => {
    const findings = analyzeDeclaredDependencies(['lodash', 'axios', 'uuid'], []);

    const byPkg = (pkg: string) =>
      findings.filter((f) => f.codeSnippet === pkg || f.title.includes(pkg));

    expect(byPkg('uuid').length).toBeGreaterThan(0);
    expect(byPkg('uuid').some((f) => f.description.includes('crypto.randomUUID'))).toBe(true);

    expect(byPkg('axios').length).toBeGreaterThan(0);
    expect(
      byPkg('axios').some(
        (f) => f.description.includes('fetch') || f.description.includes('overlapping')
      )
    ).toBe(true);

    expect(byPkg('lodash').length).toBeGreaterThan(0);
    expect(
      byPkg('lodash').some(
        (f) =>
          f.description.includes('lodash') &&
          (f.description.includes('ramda') ||
            f.description.includes('native') ||
            f.description.includes('Array'))
      )
    ).toBe(true);

    for (const f of findings) {
      expect(f.type).toBe('anti-pattern');
      expect(f.confidence).toBe(1);
      expect(['low', 'medium']).toContain(f.severity);
    }
  });

  it('flags redundancy when lodash and ramda are both declared', () => {
    const findings = analyzeDeclaredDependencies(['lodash', 'ramda'], []);
    const redundancy = findings.filter((f) => f.title.startsWith('Redundant dependency'));
    expect(redundancy.length).toBeGreaterThanOrEqual(2);
    expect(
      redundancy.some(
        (f) => f.description.includes('lodash') && f.description.includes('ramda')
      )
    ).toBe(true);
  });

  it('flags unused dependencies not present in import list', () => {
    const findings = analyzeDeclaredDependencies(['left-pad', 'react'], ['react']);
    expect(findings.some((f) => f.title.includes('left-pad') && f.title.includes('Unused'))).toBe(
      true
    );
    expect(findings.some((f) => f.description.includes('no import'))).toBe(true);
  });

  it('does not flag react when it is imported', () => {
    const patch = `@@ -1,2 +1,3 @@
+    "react": "18.0.0",
`;
    const findings = analyzeDependencyQuality({
      packageJsonPatch: patch,
      importedPackages: ['react'],
    });
    expect(findings.some((f) => f.title.includes('Unused') && f.codeSnippet === 'react')).toBe(
      false
    );
  });
});
