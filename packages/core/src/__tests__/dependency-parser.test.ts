import {
  extractTypeScriptImports,
  extractPythonImports,
  extractPackageName,
  extractTopLevelModule,
  isNodeBuiltin,
  isPythonStandardLibrary,
  dependencyParseLogger,
} from '../parsers/dependency-parser';

describe('dependency-parser (TypeScript / JavaScript)', () => {
  it('extracts static imports and export-from', () => {
    const patch = `
@@ -0,0 +1,4 @@
+import React from 'react';
+import { foo } from './local';
+export { x } from 'bar';
+export * from 'reexports';
`;
    const found = extractTypeScriptImports(patch, 'sample.tsx');
    const sources = found.map((f) => f.source).sort();
    expect(sources).toEqual(['./local', 'bar', 'react', 'reexports'].sort());
    expect(found.every((f) => f.kind === 'static')).toBe(true);
  });

  it('extracts dynamic import() including multiline', () => {
    const patch = `
@@ -1,2 +1,6 @@
+async function load() {
+  const m = await import(
+    'lodash'
+  );
+}
`;
    const found = extractTypeScriptImports(patch, 'a.ts');
    const dyn = found.filter((f) => f.kind === 'dynamic');
    expect(dyn.length).toBe(1);
    expect(dyn[0].source).toBe('lodash');
  });

  it('extracts require() and const x = require()', () => {
    const patch = `
@@ -1,2 +1,4 @@
+const fs = require('fs');
+const cfg = require(
+  'config-chain');
`;
    const found = extractTypeScriptImports(patch, 'b.js');
    const reqs = found.filter((f) => f.kind === 'require');
    const mods = reqs.map((r) => r.source).sort();
    expect(mods).toEqual(['config-chain', 'fs']);
  });

  it('maps diff lines to new-file line numbers', () => {
    const patch = `@@ -10,3 +10,4 @@
 ctx
+import { z } from 'zod';
 side
`;
    const found = extractTypeScriptImports(patch, 'f.ts');
    expect(found.length).toBe(1);
    expect(found[0].line).toBe(11);
    expect(found[0].source).toBe('zod');
  });

  it('degrades gracefully on malformed TypeScript (empty array, logged)', () => {
    const err = jest.spyOn(dependencyParseLogger, 'error').mockImplementation(() => {});
    const patch = `
@@ -1 +1 @@
+import { broken
`;
    const found = extractTypeScriptImports(patch, 'bad.ts');
    expect(found).toEqual([]);
    expect(err).toHaveBeenCalled();
    err.mockRestore();
  });
});

describe('dependency-parser (Python)', () => {
  it('extracts import and from-import', () => {
    const patch = `
@@ -1,2 +1,4 @@
+import os
+import numpy as np
+from requests import Session
`;
    const found = extractPythonImports(patch);
    const mods = found.map((f) => f.module);
    expect(mods).toContain('os');
    expect(mods).toContain('numpy');
    expect(mods.some((m) => m.includes('requests') || m === 'requests')).toBe(true);
  });

  it('extracts importlib.import_module', () => {
    const patch = `
@@ -1 +1,2 @@
+import importlib
+importlib.import_module('json')
`;
    const found = extractPythonImports(patch);
    expect(found.some((f) => f.module === 'json')).toBe(true);
  });
});

describe('module-utils', () => {
  it('extractPackageName handles scoped and subpaths', () => {
    expect(extractPackageName('@scope/pkg/sub')).toBe('@scope/pkg');
    expect(extractPackageName('lodash/fp')).toBe('lodash');
  });

  it('extractTopLevelModule splits on first dot', () => {
    expect(extractTopLevelModule('foo.bar.baz')).toBe('foo');
  });

  it('detects node builtins', () => {
    expect(isNodeBuiltin('fs')).toBe(true);
    expect(isNodeBuiltin('node:path')).toBe(true);
    expect(isNodeBuiltin('react')).toBe(false);
  });

  it('detects python stdlib heuristics', () => {
    expect(isPythonStandardLibrary('os')).toBe(true);
    expect(isPythonStandardLibrary('requests')).toBe(false);
  });
});
