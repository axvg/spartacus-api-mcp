#!/usr/bin/env node
import { existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { createCatalog } from './src/query.js';
import { startServer } from './src/server.js';

const repoArg = process.argv.slice(2).find((arg) => !arg.startsWith('--'));
const repoRoot = resolve(repoArg || process.env.SPARTACUS_REPO || process.cwd());
const catalog = createCatalog(repoRoot);

// Smoke test without an MCP client: builds the index and checks a class, a re-export
// alias and a name that does not exist.
if (process.argv.includes('--self-check')) {
  if (!existsSync(catalog.spartacusRoot)) {
    console.log(`SKIP no ${catalog.spartacusRoot}, run npm install in the repository`);
    process.exit(0);
  }
  const cases = [
    ['class', () => catalog.find('ActiveCartFacade').length > 0],
    ['alias', () => catalog.find('cartBaseTranslationsEs').some((s) => s.aliasOf === 'es')],
    ['missing name', () => catalog.find('ThisSymbolDoesNotExist').length === 0],
  ];
  const bad = cases.filter(([, run]) => !run()).map(([name]) => name);
  console.log(
    bad.length ? `FAIL ${bad.join(', ')}` : `OK ${catalog.getIndex().symbols.length} symbols`
  );
  process.exit(bad.length ? 1 : 0);
}

await startServer(catalog);
