import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { buildIndex, membersOf } from './parser.js';
import { findUsage } from './usage.js';

// Installed versions, read without parsing anything. The index is rebuilt when this
// changes, so an npm install does not leave the server answering with the old types.
function versionStamp(spartacusRoot) {
  const parts = [];
  let entries = [];
  try {
    entries = readdirSync(spartacusRoot, { withFileTypes: true });
  } catch {
    return '';
  }
  for (const entry of entries) {
    const pkgDir = join(spartacusRoot, entry.name);
    try {
      if (!statSync(pkgDir).isDirectory()) continue;
      const { version } = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
      parts.push(`${entry.name}@${version}`);
    } catch {
      parts.push(`${entry.name}@unknown`);
    }
  }
  return parts.sort().join(',');
}

export function createCatalog(repoRoot) {
  const spartacusRoot = join(repoRoot, 'node_modules', '@spartacus');
  let index = null;
  let stamp = null;

  function getIndex() {
    const current = versionStamp(spartacusRoot);
    if (!index || current !== stamp) {
      index = buildIndex(spartacusRoot);
      stamp = current;
    }
    return index;
  }

  function find(name) {
    const lower = name.toLowerCase();
    return getIndex().symbols.filter((s) => s.name.toLowerCase() === lower);
  }

  // Exact name first, then what can be imported, so the useful answer is at the top.
  function rank(symbol, lower) {
    return (symbol.name.toLowerCase() === lower ? 0 : 2) + (symbol.exported ? 0 : 1);
  }

  function searchSymbols({ query, kind, package: pkg, limit = 30 }) {
    const lower = String(query).toLowerCase();
    const hits = getIndex()
      .symbols.filter(
        (s) =>
          s.name.toLowerCase().includes(lower) &&
          (!kind || s.kind === kind) &&
          (!pkg || s.package.includes(pkg))
      )
      .sort((a, b) => rank(a, lower) - rank(b, lower))
      .slice(0, limit)
      .map((s) => ({
        name: s.name,
        kind: s.kind,
        package: s.package,
        version: s.version,
        exported: Boolean(s.exported),
        import: s.import,
        importName: s.importName,
        usage: s.usage,
        exportedAs: s.exportedAs,
        file: s.file,
        line: s.line,
      }));
    return { repo: repoRoot, count: hits.length, results: hits };
  }

  function getSignature({ name, package: pkg, member }) {
    let hits = find(name);
    if (pkg) hits = hits.filter((s) => s.package.includes(pkg));
    if (!hits.length) {
      const near = searchSymbols({ query: name, limit: 10 }).results.map((s) => s.name);
      return { error: `symbol ${name} not found`, repo: repoRoot, suggestions: near };
    }
    return {
      repo: repoRoot,
      results: hits.map((s) => {
        const common = {
          name: s.name,
          kind: s.kind,
          package: s.package,
          version: s.version,
          // Only a name the package exports can be written in an import. An internal one
          // says so, and points at the public name when it has one.
          exported: Boolean(s.exported),
          import: s.import,
          importName: s.importName,
          usage: s.usage,
          exportedAs: s.exportedAs,
          file: s.file,
          line: s.line,
          aliasOf: s.aliasOf,
          doc: s.doc,
        };
        if (!member) return { ...common, signature: s.signature };
        const members = membersOf(s.signature, member);
        return members.length
          ? { ...common, members }
          : { ...common, error: `no member matches ${member}` };
      }),
    };
  }

  function listPackages() {
    return { repo: repoRoot, packages: getIndex().packages };
  }

  function findExamples(args) {
    return findUsage(repoRoot, args);
  }

  return {
    repoRoot,
    spartacusRoot,
    getIndex,
    find,
    searchSymbols,
    getSignature,
    listPackages,
    findExamples,
  };
}
