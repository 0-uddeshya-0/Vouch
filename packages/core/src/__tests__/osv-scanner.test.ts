import {
  checkVulnerabilities,
  extractNpmPackagesFromPatch,
  normalizeVersion,
} from '../analyzers/osv-scanner';

describe('osv-scanner', () => {
  it('normalizes semver ranges to concrete versions', () => {
    expect(normalizeVersion('^4.17.15')).toBe('4.17.15');
    expect(normalizeVersion('~1.2.3')).toBe('1.2.3');
    expect(normalizeVersion('latest')).toBeNull();
  });

  it('extracts npm packages with versions from package.json patches', () => {
    const patch = `@@ -1,3 +1,6 @@
+{
+  "dependencies": {
+    "lodash": "^4.17.15"
+  }
+}`;

    const packages = extractNpmPackagesFromPatch(patch, 'package.json');
    expect(packages).toEqual([
      { name: 'lodash', version: '4.17.15', ecosystem: 'npm' },
    ]);
  });

  it('maps OSV batch vulnerabilities to FindingInput objects', async () => {
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            vulns: [
              {
                id: 'GHSA-xxxx-yyyy-zzzz',
                summary: 'Prototype pollution in lodash',
                aliases: ['CVE-2020-8203'],
                database_specific: { severity: 'HIGH', cvss_score: 7.4 },
              },
            ],
          },
        ],
      }),
    });

    const findings = await checkVulnerabilities(
      [{ name: 'lodash', version: '4.17.15', ecosystem: 'npm' }],
      mockFetch as unknown as typeof fetch
    );

    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.osv.dev/v1/querybatch',
      expect.objectContaining({ method: 'POST' })
    );
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('security');
    expect(findings[0].confidence).toBe(1);
    expect(findings[0].title).toContain('CVE-2020-8203');
    expect(findings[0].description).toContain('https://osv.dev/vulnerability/');
  });
});
