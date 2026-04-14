import * as ts from 'typescript';
import { extractAddedLinesFromPatch } from './diff-lines';

export const dependencyParseLogger = {
  error(code: string, detail?: Record<string, unknown>): void {
    const payload = detail ? ` ${JSON.stringify(detail)}` : '';
    console.error(`[vouch:dependency-parser:${code}]${payload}`);
  },
};

export interface TypeScriptImport {
  line: number;
  source: string;
  kind: 'static' | 'dynamic' | 'require';
}

export interface PythonImport {
  line: number;
  /** Primary module path (e.g. `os.path` or `requests`) */
  module: string;
  /** Human-readable label for the import site */
  name: string;
}

function scriptKindFromFilename(filename: string): ts.ScriptKind {
  const f = filename.toLowerCase();
  if (f.endsWith('.tsx')) {
    return ts.ScriptKind.TSX;
  }
  if (f.endsWith('.jsx')) {
    return ts.ScriptKind.JSX;
  }
  if (f.endsWith('.js') || f.endsWith('.mjs') || f.endsWith('.cjs')) {
    return ts.ScriptKind.JS;
  }
  return ts.ScriptKind.TS;
}

function stringFromExpression(node: ts.Expression | undefined): string | undefined {
  if (node === undefined) {
    return undefined;
  }
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
    return node.text;
  }
  return undefined;
}

function collectTypeScriptImportsFromSourceFile(
  sf: ts.SourceFile,
  syntheticLineToNewFileLine: number[]
): TypeScriptImport[] {
  const results: TypeScriptImport[] = [];

  function mapLine(zeroBasedSynthLine: number): number {
    const idx = zeroBasedSynthLine;
    if (idx >= 0 && idx < syntheticLineToNewFileLine.length) {
      return syntheticLineToNewFileLine[idx];
    }
    return zeroBasedSynthLine + 1;
  }

  function addModuleRef(text: string, node: ts.Node, kind: TypeScriptImport['kind']): void {
    const pos = node.getStart(sf);
    const { line } = sf.getLineAndCharacterOfPosition(pos);
    const mapped = mapLine(line);
    results.push({ line: mapped, source: text, kind });
  }

  function visit(node: ts.Node): void {
    if (ts.isImportDeclaration(node)) {
      const spec = node.moduleSpecifier;
      if (spec && ts.isStringLiteralLike(spec)) {
        addModuleRef(spec.text, node, 'static');
      }
    } else if (ts.isExportDeclaration(node) && node.moduleSpecifier && ts.isStringLiteralLike(node.moduleSpecifier)) {
      addModuleRef(node.moduleSpecifier.text, node, 'static');
    } else if (ts.isCallExpression(node)) {
      if (node.expression.kind === ts.SyntaxKind.ImportKeyword) {
        const t = stringFromExpression(node.arguments[0]);
        if (t !== undefined) {
          addModuleRef(t, node, 'dynamic');
        }
      } else if (ts.isIdentifier(node.expression) && node.expression.text === 'require' && node.arguments.length > 0) {
        const t = stringFromExpression(node.arguments[0]);
        if (t !== undefined) {
          addModuleRef(t, node, 'require');
        }
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sf);
  return results;
}

export function extractTypeScriptImports(patch: string, filename = 'file.ts'): TypeScriptImport[] {
  try {
    const { syntheticSource, syntheticLineToNewFileLine } = extractAddedLinesFromPatch(patch);
    if (!syntheticSource.trim()) {
      return [];
    }

    const kind = scriptKindFromFilename(filename);
    const sf = ts.createSourceFile(
      filename,
      syntheticSource,
      ts.ScriptTarget.Latest,
      true,
      kind
    );

    const parseDiagnostics = (sf as ts.SourceFile & { parseDiagnostics?: readonly ts.Diagnostic[] })
      .parseDiagnostics;
    if (parseDiagnostics && parseDiagnostics.length > 0) {
      dependencyParseLogger.error('typescript_syntax_error', {
        diagnosticCount: parseDiagnostics.length,
        filename,
      });
      return [];
    }

    return collectTypeScriptImportsFromSourceFile(sf, syntheticLineToNewFileLine);
  } catch (err) {
    dependencyParseLogger.error('typescript_parse_exception', {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

/* ─── Python (tree-sitter) ─────────────────────────────────────────────── */

type TreeSitterParser = {
  setLanguage(lang: unknown): void;
  parse(source: string): { rootNode: TreeSitterNode };
};

interface TreeSitterNode {
  type: string;
  text: string;
  startPosition: { row: number; column: number };
  namedChildren: TreeSitterNode[];
  children: TreeSitterNode[];
  hasError: boolean;
  childForFieldName?(field: string): TreeSitterNode | null;
  childrenForFieldName?(field: string): TreeSitterNode[];
}

let cachedPythonParser: TreeSitterParser | null = null;
let pythonParserInitFailed = false;

function getPythonParser(): TreeSitterParser | null {
  if (pythonParserInitFailed) {
    return null;
  }
  if (cachedPythonParser) {
    return cachedPythonParser;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const TreeSitterMod = require('tree-sitter') as { default?: new () => TreeSitterParser } & (new () => TreeSitterParser);
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const PythonLang = require('tree-sitter-python');
    const ParserCtor = (TreeSitterMod.default ?? TreeSitterMod) as new () => TreeSitterParser;
    const parser = new ParserCtor();
    const lang = PythonLang.default ?? PythonLang;
    parser.setLanguage(lang);
    cachedPythonParser = parser;
    return cachedPythonParser;
  } catch (err) {
    pythonParserInitFailed = true;
    dependencyParseLogger.error('python_parser_init_failed', {
      message: err instanceof Error ? err.message : String(err),
    });
    return null;
  }
}

function dottedNameText(node: TreeSitterNode): string {
  if (node.type === 'dotted_name') {
    return node.text;
  }
  if (node.type === 'aliased_import') {
    const nameNode = node.namedChildren.find((c) => c.type === 'dotted_name');
    if (nameNode) {
      return nameNode.text;
    }
  }
  const parts: string[] = [];
  for (const c of node.namedChildren) {
    if (c.type === 'identifier' || c.type === 'dotted_name') {
      parts.push(c.text);
    }
  }
  return parts.length > 0 ? parts.join('.') : node.text;
}

function collectPythonFromNode(
  node: TreeSitterNode,
  syntheticLineToNewFileLine: number[],
  out: PythonImport[]
): void {
  const mapRow = (row0: number): number => {
    if (row0 >= 0 && row0 < syntheticLineToNewFileLine.length) {
      return syntheticLineToNewFileLine[row0];
    }
    return row0 + 1;
  };

  if (node.type === 'import_statement') {
    const nameNodes = node.childrenForFieldName?.('name') ?? [];
    for (const nameNode of nameNodes) {
      if (nameNode.type === 'dotted_name') {
        const modText = dottedNameText(nameNode);
        const line = mapRow(nameNode.startPosition.row);
        const top = modText.split('.')[0] ?? modText;
        out.push({ line, module: top, name: `import ${modText}` });
      } else if (nameNode.type === 'aliased_import') {
        const mod = nameNode.namedChildren.find((c) => c.type === 'dotted_name');
        if (mod) {
          const modText = dottedNameText(mod);
          const line = mapRow(mod.startPosition.row);
          const top = modText.split('.')[0] ?? modText;
          out.push({ line, module: top, name: `import ${modText}` });
        }
      }
    }
  } else if (node.type === 'import_from_statement') {
    const modNode = node.childForFieldName?.('module_name');
    const moduleText = modNode?.text ?? '';
    const imported = node.childrenForFieldName?.('name') ?? [];
    const hasStar = node.namedChildren.some((c) => c.type === 'wildcard_import');
    const nameBits: string[] = [];
    if (hasStar) {
      nameBits.push('*');
    }
    for (const im of imported) {
      nameBits.push(im.text);
    }
    const anchor = modNode ?? node;
    const line = mapRow(anchor.startPosition.row);
    const stripped = moduleText.replace(/^\.+/, '').trim();
    const topLevel = stripped.split('.').filter(Boolean)[0] ?? stripped;
    const label = `from ${moduleText} import ${nameBits.length > 0 ? nameBits.join(', ') : '…'}`;
    out.push({
      line,
      module: topLevel || moduleText,
      name: label,
    });
  } else if (node.type === 'call_expression' || node.type === 'call') {
    const func = node.namedChildren.find((c) => c.type === 'attribute' || c.type === 'identifier');
    const text = func?.text ?? '';
    if (text.includes('import_module') || text.endsWith('import_module')) {
      const arg = node.namedChildren.find((c) => c.type === 'argument_list');
      const str = arg?.namedChildren.find((c) => c.type === 'string');
      const inner =
        str?.namedChildren.find((c) => c.type === 'string_content') ?? str;
      if (inner) {
        const raw = inner.text;
        const cleaned = raw.replace(/^['"]|['"]$/g, '');
        const line = mapRow(inner.startPosition.row);
        out.push({
          line,
          module: cleaned,
          name: `importlib.import_module(${cleaned})`,
        });
      }
    }
  }

  for (const ch of node.namedChildren) {
    collectPythonFromNode(ch, syntheticLineToNewFileLine, out);
  }
}

export function extractPythonImports(patch: string): PythonImport[] {
  try {
    const { syntheticSource, syntheticLineToNewFileLine } = extractAddedLinesFromPatch(patch);
    if (!syntheticSource.trim()) {
      return [];
    }

    const parser = getPythonParser();
    if (!parser) {
      return [];
    }

    const tree = parser.parse(syntheticSource);
    if (tree.rootNode.hasError) {
      dependencyParseLogger.error('python_tree_has_error', {});
      return [];
    }

    const out: PythonImport[] = [];
    collectPythonFromNode(tree.rootNode, syntheticLineToNewFileLine, out);
    return out;
  } catch (err) {
    dependencyParseLogger.error('python_parse_exception', {
      message: err instanceof Error ? err.message : String(err),
    });
    return [];
  }
}

export { extractPackageName, extractTopLevelModule, isNodeBuiltin, isPythonStandardLibrary } from './module-utils';
