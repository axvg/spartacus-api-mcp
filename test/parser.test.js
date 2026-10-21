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
  const [member] = result.members;
  assert.equal(member.name, 'load');
  assert.match(member.signature, /abstract load\(code: string, options\?: \{/);
  assert.match(member.signature, /force\?: boolean;/);
});

test('carries the jsdoc of the symbol and of the member', () => {
  const [result] = catalog.getSignature({ name: 'DemoFacade', member: 'load' }).results;
  assert.equal(result.doc, 'Reads demo data.');
  assert.match(result.members[0].doc, /Loads one demo by code\./);
  assert.match(result.members[0].doc, /@param code Demo code/);
});

test('a member that does not exist answers with an error', () => {
  const [result] = catalog.getSignature({ name: 'DemoFacade', member: 'nope' }).results;
  assert.match(result.error, /no member matches nope/);
});

test('finds where the project already uses a symbol', () => {
  const answer = catalog.findExamples({ name: 'DemoFacade' });
  assert.equal(answer.count, 1);
  const [first] = answer.results;
  assert.equal(first.file, 'src/app/demo.component.ts');
  assert.equal(first.line, 5);
  assert.equal(first.import, "import { DemoFacade } from '@spartacus/demo/root'");
  assert.match(first.snippet, /inject\(DemoFacade\)/);
});

test('reports a missing source directory instead of failing', () => {
  const answer = catalog.findExamples({ name: 'DemoFacade', dir: 'nowhere' });
  assert.match(answer.error, /no nowhere directory/);
});

test('a missing symbol answers with suggestions', () => {
  const answer = catalog.getSignature({ name: 'DemoFacad' });
  assert.match(answer.error, /not found/);
  assert.ok(answer.suggestions.includes('DemoFacade'));
});
