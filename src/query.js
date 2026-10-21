import { join } from 'node:path';
import { buildIndex } from './parser.js';

function membersOf(signature, member) {
  const lower = member.toLowerCase();
  return signature
    .split('\n')
    .filter((line) => line.toLowerCase().includes(lower))
    .join('\n');
}

// The index is built on the first question and kept for the rest of the process.
export function createCatalog(repoRoot) {
  const spartacusRoot = join(repoRoot, 'node_modules', '@spartacus');
  let index = null;
  const getIndex = () => (index ??= buildIndex(spartacusRoot));

  function find(name) {
    const lower = name.toLowerCase();
    return getIndex().symbols.filter((s) => s.name.toLowerCase() === lower);
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
      .slice(0, limit)
      .map(({ name, kind, package: p, version, file, line }) => ({
        name,
        kind,
        package: p,
        version,
        file,
        line,
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
      results: hits.map((s) => ({
        name: s.name,
        kind: s.kind,
        package: s.package,
        version: s.version,
        file: s.file,
        line: s.line,
        aliasOf: s.aliasOf,
        signature: member ? membersOf(s.signature, member) : s.signature,
      })),
    };
  }

  function listPackages() {
    return { repo: repoRoot, packages: getIndex().packages };
  }

  return { repoRoot, spartacusRoot, getIndex, find, searchSymbols, getSignature, listPackages };
}
