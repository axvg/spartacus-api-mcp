import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';

const CODE = /\.(ts|html)$/;
const SKIP = new Set(['node_modules', 'dist', '.git', '.angular', 'coverage']);

function listCodeFiles(dir) {
  const out = [];
  let entries = [];
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return out;
  }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const path = join(dir, entry.name);
    if (entry.isDirectory()) out.push(...listCodeFiles(path));
    else if (CODE.test(entry.name) && !entry.name.endsWith('.d.ts')) out.push(path);
  }
  return out;
}

// The import line tells the caller which specifier this project already uses for the symbol,
// which is the one that compiles here.
function importLine(lines, name) {
  const pattern = new RegExp(`import[^;]*\\b${name}\\b[^;]*from\\s*['"][^'"]+['"]`, 's');
  const text = lines.join('\n');
  const match = pattern.exec(text);
  return match ? match[0].replace(/\s+/g, ' ') : undefined;
}

export function findUsage(repoRoot, { name, limit = 10, dir = 'src' }) {
  const root = join(repoRoot, dir);
  try {
    if (!statSync(root).isDirectory()) return { repo: repoRoot, count: 0, results: [] };
  } catch {
    return { repo: repoRoot, error: `no ${dir} directory in ${repoRoot}`, results: [] };
  }
  const word = new RegExp(`\\b${name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`);
  const results = [];
  for (const file of listCodeFiles(root)) {
    if (results.length >= limit) break;
    const text = readFileSync(file, 'utf8');
    if (!word.test(text)) continue;
    const lines = text.split(/\r?\n/);
    const specifier = importLine(lines, name);
    for (let i = 0; i < lines.length && results.length < limit; i++) {
      if (!word.test(lines[i]) || /^\s*(import|export)\b/.test(lines[i])) continue;
      results.push({
        file: relative(repoRoot, file).split(sep).join('/'),
        line: i + 1,
        import: specifier,
        // One line of context on each side is enough to show how the call is wired.
        snippet: lines.slice(Math.max(0, i - 1), i + 2).join('\n'),
      });
    }
  }
  return { repo: repoRoot, count: results.length, results };
}
