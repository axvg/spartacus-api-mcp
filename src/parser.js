import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const DECL =
  /^\s*(?:export\s+)?declare\s+(?:abstract\s+)?(class|interface|enum|function|const|let|var|type|namespace)\s+([A-Za-z_$][\w$]*)/;

// Bundled .d.ts files publish many symbols under another name, as in
// `export { es as cartBaseTranslationsEs }`. Callers ask for the public name, so every
// alias becomes its own entry that points at the declaration it renames.
const EXPORT_BLOCK = /export\s*\{([^}]*)\}\s*;/g;
const ALIAS = /^\s*([A-Za-z_$][\w$]*)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;

function listTypeFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listTypeFiles(path));
    else if (entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

function readVersion(pkgDir) {
  try {
    return JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8')).version;
  } catch {
    return 'unknown';
  }
}

// A declaration body ends on the line where the brace depth returns to zero.
function readBody(lines, start) {
  let depth = 0;
  for (let i = start; i < lines.length; i++) {
    for (const char of lines[i]) {
      if (char === '{') depth++;
      else if (char === '}') depth--;
    }
    if (depth === 0 && /[;}]\s*$/.test(lines[i]))
      return lines.slice(start, i + 1).join('\n');
  }
  return lines[start];
}

function aliasesOf(text, declared) {
  const out = [];
  for (const [, body] of text.matchAll(EXPORT_BLOCK)) {
    for (const part of body.split(',')) {
      const pair = ALIAS.exec(part);
      if (!pair) continue;
      const source = declared.get(pair[1]);
      if (!source || declared.has(pair[2])) continue;
      out.push({ ...source, name: pair[2], aliasOf: source.name });
    }
  }
  return out;
}

function readFile(file, pkg, version) {
  const text = readFileSync(file, 'utf8');
  const lines = text.split(/\r?\n/);
  const symbols = [];
  const declared = new Map();
  for (let i = 0; i < lines.length; i++) {
    const match = DECL.exec(lines[i]);
    if (!match) continue;
    const symbol = {
      name: match[2],
      kind: match[1],
      package: pkg,
      version,
      file,
      line: i + 1,
      signature: readBody(lines, i),
    };
    symbols.push(symbol);
    declared.set(symbol.name, symbol);
  }
  symbols.push(...aliasesOf(text, declared));
  return symbols;
}

export function buildIndex(spartacusRoot) {
  const symbols = [];
  const packages = [];
  for (const entry of readdirSync(spartacusRoot, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const pkgDir = join(spartacusRoot, entry.name);
    const typesDir = join(pkgDir, 'types');
    const pkg = `@spartacus/${entry.name}`;
    const version = readVersion(pkgDir);
    packages.push({ package: pkg, version });
    let files = [];
    try {
      if (statSync(typesDir).isDirectory()) files = listTypeFiles(typesDir);
    } catch {
      continue;
    }
    for (const file of files) symbols.push(...readFile(file, pkg, version));
  }
  return { symbols, packages };
}
