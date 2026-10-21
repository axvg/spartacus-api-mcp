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

// Covers `export { X }`, `export { X as Y }` and both of their `export type` forms. A name
// reaches the outside only through one of these statements or an export modifier, and only
// that name can be written in an import.
function exportsOf(statement) {
  if (!ts.isExportDeclaration(statement) || statement.moduleSpecifier) return [];
  const bindings = statement.exportClause;
  if (!bindings || !ts.isNamedExports(bindings)) return [];
  return bindings.elements.map((element) => ({
    local: (element.propertyName ?? element.name).text,
    public: element.name.text,
  }));
}

function hasExportModifier(node) {
  return (node.modifiers ?? []).some((m) => m.kind === ts.SyntaxKind.ExportKeyword);
}

// The bundler renames a symbol before a namespace re-exports it, as in
// `type cartGroup_actions_d_CartAction = CartAction;`. Such a declaration is plumbing: it
// points at another symbol of the same file and nothing imports it.
function aliasTarget(statement) {
  if (ts.isTypeAliasDeclaration(statement)) {
    const { type } = statement;
    if (ts.isTypeReferenceNode(type) && ts.isIdentifier(type.typeName)) return type.typeName.text;
    return null;
  }
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    const type = declaration?.type;
    if (type && ts.isTypeQueryNode(type) && ts.isIdentifier(type.exprName))
      return type.exprName.text;
  }
  return null;
}

// `declare namespace X { export { a as A } }` publishes A, reachable as X.A once the file
// exports X. Without this the symbols behind a namespace look internal.
function namespaceExportsOf(statement) {
  if (!ts.isModuleDeclaration(statement) || !statement.body) return null;
  if (!ts.isModuleBlock(statement.body) || !ts.isIdentifier(statement.name)) return null;
  const names = [];
  for (const inner of statement.body.statements) names.push(...exportsOf(inner));
  return names.length ? { namespace: statement.name.text, names } : null;
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
        file,
        line: source.getLineAndCharacterOfPosition(node.getStart(source)).line + 1,
        doc: docOf(node),
        signature: node.getText(source),
        exported: hasExportModifier(statement),
      };
      symbols.push(symbol);
      declared.set(name, symbol);
    }
  }

  const plumbing = new Map();
  for (const statement of source.statements) {
    for (const { name } of declarationsOf(statement)) {
      const target = aliasTarget(statement);
      if (target && declared.has(target)) plumbing.set(name, target);
    }
  }

  const fileExports = new Map();
  for (const statement of source.statements) {
    for (const { local, public: publicName } of exportsOf(statement)) {
      fileExports.set(local, publicName);
      const declaration = declared.get(local);
      if (!declaration) continue;
      if (local === publicName) {
        declaration.exported = true;
        continue;
      }
      declaration.exportedAs = publicName;
      if (!declared.has(publicName)) {
        symbols.push({ ...declaration, name: publicName, aliasOf: local, exported: true });
      }
    }
  }

  for (const statement of source.statements) {
    const block = namespaceExportsOf(statement);
    if (!block) continue;
    const namespaceName = fileExports.get(block.namespace);
    if (!namespaceName) continue;
    for (const { local, public: publicName } of block.names) {
      const target = plumbing.get(local) ?? local;
      const declaration = declared.get(target);
      if (!declaration) continue;
      declaration.exported = true;
      declaration.importName = namespaceName;
      declaration.usage = `${namespaceName}.${publicName}`;
      delete declaration.exportedAs;
    }
  }

  // An internal name cannot be written in an import, so it carries no specifier. The same
  // holds for a file that no entry point of the package publishes.
  const out = symbols.filter((symbol) => !(plumbing.has(symbol.name) && !symbol.exported));
  for (const symbol of out) {
    if (!symbol.exported) continue;
    if (importPath) symbol.import = importPath;
    symbol.importName ??= symbol.name;
    symbol.usage ??= symbol.name;
    delete symbol.exportedAs;
  }
  return out;
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
      symbols.push(...readFile(file, pkg, version, byFile.get(relative)));
    }
  }
  return { symbols, packages };
}

// Members declared directly on the type. A parameter of a method is not a member, so the
// search never descends into a signature.
function directMembers(statement) {
  if (ts.isClassDeclaration(statement) || ts.isInterfaceDeclaration(statement))
    return statement.members ?? [];
  if (ts.isEnumDeclaration(statement)) return statement.members ?? [];
  if (ts.isTypeAliasDeclaration(statement) && ts.isTypeLiteralNode(statement.type))
    return statement.type.members ?? [];
  if (ts.isVariableStatement(statement)) {
    const [declaration] = statement.declarationList.declarations;
    const type = declaration?.type;
    return type && ts.isTypeLiteralNode(type) ? (type.members ?? []) : [];
  }
  return [];
}

// Returns the exact declaration of the matching members, parsed from the symbol signature,
// each one with the JSDoc written above it.
export function membersOf(signature, member) {
  const source = ts.createSourceFile('symbol.d.ts', signature, ts.ScriptTarget.Latest, true);
  const lower = member.toLowerCase();
  const found = [];
  for (const statement of source.statements) {
    for (const node of directMembers(statement)) {
      const name = node.name && ts.isIdentifier(node.name) ? node.name.text : null;
      if (!name || !name.toLowerCase().includes(lower)) continue;
      found.push({ name, doc: docOf(node), signature: node.getText(source) });
    }
  }
  return found;
}
