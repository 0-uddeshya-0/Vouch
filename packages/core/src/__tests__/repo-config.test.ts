import { createNpmAnalyzer } from '../analyzers/npm';
import {
  clearRepoConfigCache,
  resolveRepoConfig,
  shouldIgnorePackage,
} from '../config/repo-config';
import type { RegistryClient } from '../parsers/registry-client';

describe('repo config', () => {
  afterEach(() => {
    clearRepoConfigCache();
  });

  describe('shouldIgnorePackage', () => {
    it('matches scoped packages when ignoreScopes includes the scope', () => {
      const config = resolveRepoConfig({ ignoreScopes: ['@internal'] });
      expect(shouldIgnorePackage('@internal/ui-kit', config)).toBe(true);
      expect(shouldIgnorePackage('@internal', config)).toBe(true);
      expect(shouldIgnorePackage('@external/pkg', config)).toBe(false);
    });

    it('matches exact dependency names in ignoreDependencies', () => {
      const config = resolveRepoConfig({ ignoreDependencies: ['legacy-logger'] });
      expect(shouldIgnorePackage('legacy-logger', config)).toBe(true);
      expect(shouldIgnorePackage('other-logger', config)).toBe(false);
    });
  });

  describe('createNpmAnalyzer with ignoreScopes', () => {
    it('skips registry lookup for ignored scoped packages', async () => {
      const getNpmPackage = jest.fn().mockResolvedValue({ exists: false });
      const registry = { getNpmPackage } as unknown as RegistryClient;
      const config = resolveRepoConfig({ ignoreScopes: ['@internal'] });
      const analyzer = createNpmAnalyzer(registry, config);

      const finding = await analyzer.analyzeImportStatement(
        '@internal/ui-kit',
        'src/app.ts',
        1,
        '@internal/ui-kit'
      );

      expect(finding).toBeNull();
      expect(getNpmPackage).not.toHaveBeenCalled();
    });
  });
});
