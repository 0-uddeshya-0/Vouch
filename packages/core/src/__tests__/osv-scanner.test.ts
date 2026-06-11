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

  it('aggregates OSV vulnerabilities into one finding per package', async () => {
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
              {
                id: 'GHSA-aaaa-bbbb-cccc',
                summary: 'ReDoS in lodash',
                aliases: ['CVE-2019-10744'],
                database_specific: { severity: 'CRITICAL', cvss_score: 9.1 },
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
    // One aggregated finding, not one per CVE
    expect(findings).toHaveLength(1);
    expect(findings[0].type).toBe('security');
    expect(findings[0].confidence).toBe(1);
    expect(findings[0].title).toBe('2 known vulnerabilities in lodash@4.17.15');
    // Severity is the highest across all advisories
    expect(findings[0].severity).toBe('critical');
    expect(findings[0].description).toContain('CVE-2020-8203');
    expect(findings[0].description).toContain('CVE-2019-10744');
    expect(findings[0].description).toContain('osv.dev');
  });

  it('lists at most five advisories and summarizes the rest', async () => {
    const vulns = Array.from({ length: 8 }, (_, i) => ({
      id: `GHSA-000${i}-aaaa-bbbb`,
      summary: `Vuln ${i}`,
    }));
    const mockFetch = jest.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ results: [{ vulns }] }),
    });

    const findings = await checkVulnerabilities(
      [{ name: 'axios', version: '1.6.0', ecosystem: 'npm' }],
      mockFetch as unknown as typeof fetch
    );

    expect(findings).toHaveLength(1);
    expect(findings[0].title).toBe('8 known vulnerabilities in axios@1.6.0');
    expect(findings[0].description).toContain('and 3 more');
  });
});
