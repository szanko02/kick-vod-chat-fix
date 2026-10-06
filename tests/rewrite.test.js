import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { test } from 'node:test';
import '../extension/replay-template.js';
import '../extension/rewrite.js';

const fixture = name => readFile(new URL(`./fixtures/${name}`, import.meta.url), 'utf8');

test('recognizes the exact stored-page query contract', async () => {
  const query = await fixture('query-contract.js');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(query), 'october-2026');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(await fixture('latest-query-contract.js')), 'october-2026');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(`const api={${query}};const re=/["']+/;`), 'october-2026');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(`const example=${JSON.stringify(query)};`), null);
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract('const example=`' + query + '`;'), null);
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(`/* ${query} */`), null);
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract('const re=/getInfiniteHistoryByChannel:/;'), null);
  const secondDeclaration = query.slice(0, query.lastIndexOf(',getInfiniteHistoryByChannelAndThread')) + ',getInfiniteHistoryByChannel:(x,y)=>null';
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(secondDeclaration), null);
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(query.replace('+5e3', '+1e4')), null);
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(query.replace('"WebChatHistory"', '"OtherHistory"')), null);
  const alphaQuery = query.replace(/[A-Za-z_$][A-Za-z0-9_$]*/g, token => ({ e: 'entry', n: 'page', t: 'query', o: 'request' })[token] || token);
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(alphaQuery), 'october-2026');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(alphaQuery.replace('+5e3', '+10e3')), null);
});

test('patches only the extracted current and legacy modules', async () => {
  for (const name of ['current-module.js', 'legacy-module.js']) {
    const source = await fixture(name);
    const result = globalThis.KCFSourceRewrite.adaptBundleSource(source, { contractVerified: true });
    assert.equal(result.status, 'applied', `${name}: ${result.reason || result.status}`);
    assert.match(result.source, /KCF_replay_state_v3/);
    assert.match(result.source, /fetchNextPage\(\{ cancelRefetch: false \}\)/);
    assert.match(result.source, /maxPages: 24/);
    assert.match(result.source, /refetchOnWindowFocus: false/);
    assert.match(result.source, /created_at/);
    assert.equal((result.source.match(/ChatroomReplayEntries/g) || []).length, 1);
  }
  const latest = await fixture('latest-module.js');
  const serialized = JSON.stringify(latest);
  const serializedResult = globalThis.KCFSourceRewrite.adaptBundleSource(serialized, { contractVerified: true });
  assert.equal(serializedResult.status, 'unchanged');
  assert.equal(serializedResult.source, serialized);
  assert.equal(globalThis.KCFSourceRewrite.adaptBundleSource(`/* ${latest} */`, { contractVerified: true }).status, 'unchanged');
  const latestResult = globalThis.KCFSourceRewrite.adaptBundleSource(latest, { contractVerified: true });
  assert.equal(latestResult.status, 'applied', latestResult.reason || latestResult.status);
  assert.match(latestResult.source, /KCF_replay_state_v3/);
  assert.match(latestResult.source, /M\.filter\(e=>new Date\(e\.created_at\)\.getTime\(\)<=w\+I\)/);

  const longTail = `${latest};const unrelated="${'x'.repeat(9000)}";`;
  assert.equal(globalThis.KCFSourceRewrite.adaptBundleSource(longTail, { contractVerified: true }).status, 'applied');
});

test('leaves unknown, duplicate, and contract-unverified code byte-for-byte unchanged', async () => {
  const current = await fixture('current-module.js');
  const apply = source => globalThis.KCFSourceRewrite.adaptBundleSource(source, { contractVerified: true });
  assert.deepEqual(apply(current.replace('S=g??E', 'S=g??E+1')).source, current.replace('S=g??E', 'S=g??E+1'));
  assert.equal(apply(current.replace('r=e.i(673781)', 'r=e.i(1)')).status, 'applied');
  assert.equal(apply(current.replace('S-R.current>2e3', 'S-R.current>2001')).status, 'unsupported');
  assert.equal(apply(`${current};e.s(["ChatroomReplayEntries",0,()=>{}])`).status, 'unsupported');
  const unverified = globalThis.KCFSourceRewrite.adaptBundleSource(current);
  assert.equal(unverified.reason, 'contract-unverified');
  assert.equal(unverified.source, current);
});

test('accepts only bijective alpha-renames and changed numeric module ids', async () => {
  const latest = await fixture('latest-module.js');
  const renamed = latest
    .replace('t=e.i(92506)', 'moduleOne=e.i(800001)')
    .replace('r=e.i(700712)', 'reactRef=e.i(800002)')
    .replace('a=e.i(963448)', 'queryApi=e.i(800004)')
    .replace('m=e.i(152098)', 'moduleLast=e.i(800003)')
    .replace('channelSlug:f', 'channelSlug:channelProp')
    .replace(/\br\b/g, 'reactRef')
    .replace(/\ba\b/g, 'queryApi');
  const result = globalThis.KCFSourceRewrite.adaptBundleSource(renamed, { contractVerified: true });
  assert.equal(result.status, 'applied', result.reason || result.status);
  assert.match(result.source, /React:reactRef/);
  assert.match(result.source, /\(0,queryApi\.useInfiniteQuery\)/);
  assert.match(result.source, /M\.filter\(e=>new Date\(e\.created_at\)\.getTime\(\)<=w\+I\)/);

  for (const changed of [
    latest.replace('channelSlug:f', 'channelSlug:f+1'),
    latest.replace('S-R.current>2e3', 'S-R.current>2001'),
    latest.replace('S-R.current>2e3', 'S-R.current>=2e3'),
    latest.replace('(0,a.useInfiniteQuery)', '(0,a.useQuery)'),
    latest.replace('"ChatroomReplayEntries"', '"ChatroomReplayEntriesV2"'),
    latest.replace('M.filter(e=>new Date(e.created_at).getTime()<=w+I)', 'M.filter(e=>new Date(e.created_at).getTime()<=w+I+1)'),
    renamed.replace('reactRef=e.i(800002)', 'moduleOne=e.i(800002)')
  ]) {
    assert.notEqual(globalThis.KCFSourceRewrite.adaptBundleSource(changed, { contractVerified: true }).status, 'applied');
  }
});

test('contains no downloaded-code execution mechanism', async () => {
  for (const path of ['../extension/background.js', '../extension/rewrite.js', '../extension/replay-template.js']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\s*\(/);
  }
});
