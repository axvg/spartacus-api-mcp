import assert from 'node:assert/strict';
import { test } from 'node:test';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createCatalog } from '../src/query.js';

const fixtures = join(dirname(fileURLToPath(import.meta.url)), 'fixtures');
const catalog = createCatalog(fixtures);
const one = (name) => catalog.find(name)[0];

test('indexes a declared class', () => {
  assert.equal(one('DemoFacade').kind, 'class');
});

test('indexes a declaration without the declare keyword', () => {
  assert.equal(one('DemoState').kind, 'interface');
});

test('indexes a type alias and a const', () => {
  assert.equal(one('DemoUnion').kind, 'type');
  assert.equal(one('demoTranslations').kind, 'const');
});

test('keeps both overloads of a function', () => {
  assert.equal(catalog.find('overloaded').length, 2);
});

test('resolves an alias of export', () => {
  assert.equal(one('demoTranslationsEs').aliasOf, 'es');
});

test('resolves an alias of export type', () => {
  assert.equal(one('PublicDemoState').aliasOf, 'DemoState');
});

test('a brace inside a string does not cut the declaration', () => {
  assert.match(one('DemoState').signature, /separator: '\}';\s*\}$/);
});

test('reports the public import specifier, not the file', () => {
  assert.equal(one('DemoFacade').import, '@spartacus/demo/root');
});

test('reports the installed version', () => {
  assert.equal(one('DemoFacade').version, '9.9.9');
  assert.deepEqual(catalog.listPackages().packages, [
    { package: '@spartacus/demo', version: '9.9.9' },
  ]);
});

test('a member answer carries the whole declaration', () => {
  const [result] = catalog.getSignature({ name: 'DemoFacade', member: 'load' }).results;
  assert.match(result.signature, /abstract load\(code: string, options\?: \{/);
  assert.match(result.signature, /force\?: boolean;/);
});

test('a missing symbol answers with suggestions', () => {
  const answer = catalog.getSignature({ name: 'DemoFacad' });
  assert.match(answer.error, /not found/);
  assert.ok(answer.suggestions.includes('DemoFacade'));
});
