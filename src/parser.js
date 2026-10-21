import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

const KINDS = {
  [ts.SyntaxKind.ClassDeclaration]: 'class',
  [ts.SyntaxKind.InterfaceDeclaration]: 'interface',
  [ts.SyntaxKind.EnumDeclaration]: 'enum',
  [ts.SyntaxKind.FunctionDeclaration]: 'function',
  [ts.SyntaxKind.TypeAliasDeclaration]: 'type',
  [ts.SyntaxKind.ModuleDeclaration]: 'namespace',
};

function listTypeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTypeFiles(path));
    else if (entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

function readPackageJson(pkgDir) {
  try {
    return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
  } catch {
    return {};
  }
}

// package.json `exports` already maps every public entry point to its .d.ts file, so the
// import specifier a caller needs is the key whose types field points at that file.
function importPaths(pkg, manifest) {
  const byFile = new Map();
  for (const [key, value] of Object.entries(manifest.exports ?? {})) {
    const types = typeof value === 'object' && value !== null ? value.types : undefined;
    if (typeof types !== 'string') continue;
    const file = types.replace(/^\.\//, '').replace(/\\/g, '/');
    const specifier = key === '.' ? pkg : `${pkg}${key.slice(1)}`;
    const current = byFile.get(file);
    // The shortest specifier wins when several entry points publish the same file.
    if (!current || specifier.length < current.length) byFile.set(file, specifier);
  }
  return byFile;
}

function nameOf(node) {
  return node.name && ts.isIdentifier(node.name) ? node.name.text : null;
}

// The .d.ts files keep the JSDoc of the source, so the text the authors wrote about a
// symbol travels with its declaration.
function docOf(node) {
  const blocks = node.jsDoc ?? [];
  const parts = [];
  for (const block of blocks) {
    if (typeof block.comment === 'string') parts.push(block.comment);
    for (const tag of block.tags ?? []) {
      const name = tag.tagName.text;
      const value = typeof tag.comment === 'string' ? tag.comment : '';
      const target = tag.name && ts.isIdentifier(tag.name) ? ` ${tag.name.text}` : '';
      parts.push(`@${name}${target}${value ? ` ${value}` : ''}`.trim());
    }
  }
  return parts.join('\n').trim() || undefined;
}

function declarationsOf(statement) {
  if (ts.isVariableStatement(statement)) {
    return statement.declarationList.declarations
      .filter((d) => ts.isIdentifier(d.name))
      .map((d) => ({ name: d.name.text, kind: 'const', node: statement }));
  }
  const kind = KINDS[statement.kind];
  const name = kind ? nameOf(statement) : null;
  return name ? [{ name, kind, node: statement }] : [];
}

// Covers `export { X as Y }` and `export type { X as Y }`, both common in bundled types.
function aliasesOf(statement, declared) {
  if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) return [];
  const bindings = statement.exportClause;
  if (!bindings || !ts.isNamedExports(bindings)) return [];
  const out = [];
  for (const element of bindings.elements) {
    if (!element.propertyName) continue;
    const source = declared.get(element.propertyName.text);
    if (!source || declared.has(element.name.text)) continue;
    out.push({ ...source, name: element.name.text, aliasOf: source.name });
  }
  return out;
}

function readFile(file, pkg, version, importPath) {
  const text = readFileSync(file, 'utf8');
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const symbols = [];
  const declared = new Map();
  for (const statement of source.statements) {
    for (const { name, kind, node } of declarationsOf(statement)) {
      const symbol = {
        name,
        kind,
        package: pkg,
        version,
        import: importPath,
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        doc: docOf(node),
        signature: node.getText(source),
      };
      symbols.push(symbol);
      declared.set(name, symbol);
    }
  }
  for (const statement of source.statements) symbols.push(...aliasesOf(statement, declared));
  return symbols;
}

export function buildIndex(spartacusRoot) {
  const symbols = [];
  const packages = [];
  for (const entry of readdirSync(spartacusRoot, { withFileTypes: true })) {
    const pkgDir = join(spartacusRoot, entry.name);
    try {
      if (!statSync(pkgDir).isDirectory()) continue;
    } catch {
      continue;
    }
    const pkg = `@spartacus/${entry.name}`;
    const manifest = readPackageJson(pkgDir);
    const version = manifest.version ?? 'unknown';
    const byFile = importPaths(pkg, manifest);
    packages.push({ package: pkg, version });
    const typesDir = join(pkgDir, 'types');
    let files = [];
    try {
      if (statSync(typesDir).isDirectory()) files = listTypeFiles(typesDir);
    } catch {
      continue;
    }
    for (const file of files) {
      const relative = file.slice(pkgDir.length + 1).replace(/\\/g, '/');
      symbols.push(...readFile(file, pkg, version, byFile.get(relative) ?? pkg));
    }
  }
  return { symbols, packages };
}

// Returns the exact declaration of the matching members, parsed from the symbol signature,
// each one with the JSDoc written above it.
export function membersOf(signature, member) {
  const source = ts.createSourceFile('symbol.d.ts', signature, ts.ScriptTarget.Latest, true);
  const lower = member.toLowerCase();
  const found = [];
  const visit = (node) => {
    const name = node.name && ts.isIdentifier(node.name) ? node.name.text : null;
    if (name && name.toLowerCase().includes(lower) && node.parent !== source) {
      found.push({ name, doc: docOf(node), signature: node.getText(source) });
      return;
    }
    ts.forEachChild(node, visit);
  };
  ts.forEachChild(source, (statement) => ts.forEachChild(statement, visit));
  return found;
}
