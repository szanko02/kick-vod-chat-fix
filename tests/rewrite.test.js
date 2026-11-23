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
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(await fixture('october-19-query-contract.js')), 'october-2026');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(await fixture('october-21-query-contract.js')), 'october-2026');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(await fixture('october-28-query-contract.js')), 'october-2026');
  assert.equal(globalThis.KCFSourceRewrite.detectQueryContract(await fixture('november-23-query-contract.js')), 'october-2026');
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
  for (const name of ['current-module.js', 'legacy-module.js', 'october-14-module.js', 'october-14-ru-module.js', 'october-19-module.js', 'october-21-module.js', 'october-28-module.js', 'november-23-module.js']) {
    const source = await fixture(name);
    const result = globalThis.KCFSourceRewrite.adaptBundleSource(source, { contractVerified: true });
    assert.equal(result.status, 'applied', `${name}: ${result.reason || result.status}`);
    assert.match(result.source, /KCF_replay_state_v3/);
    assert.match(result.source, /fetchNextPage\(\{ cancelRefetch: false \}\)/);
    assert.match(result.source, /maxPages: 24/);
    assert.match(result.source, /refetchOnWindowFocus: false/);
    assert.match(result.source, /created_at/);
    const expectedMatches = (name === 'october-21-module.js' || name === 'october-28-module.js' || name === 'november-23-module.js') ? 2 : 1;
    assert.equal((result.source.match(/ChatroomReplayEntries/g) || []).length, expectedMatches);
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

  const callbackRenamed = latest.replace('M.filter(e=>new Date(e.created_at).getTime()<=w+I)', 'M.filter(entry=>new Date(entry.created_at).getTime()<=w+I)');
  const callbackResult = globalThis.KCFSourceRewrite.adaptBundleSource(callbackRenamed, { contractVerified: true });
  assert.equal(callbackResult.status, 'applied');

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

test('rejects modules referencing dropped bindings in the remaining component body', async () => {
  const october28 = await fixture('october-28-module.js');
  const validResult = globalThis.KCFSourceRewrite.adaptBundleSource(october28, { contractVerified: true });
  assert.equal(validResult.status, 'applied');

  const mutated = october28.replace('},[E,q,S,y]);', '},[E,q,S,y]);console.log(B,P);');
  const rejectedResult = globalThis.KCFSourceRewrite.adaptBundleSource(mutated, { contractVerified: true });
  assert.equal(rejectedResult.status, 'unsupported');
  assert.equal(rejectedResult.reason, 'unknown-segment');
  assert.equal(rejectedResult.source, mutated);

  const propAccess = october28.replace('},[E,q,S,y]);', '},[E,q,S,y]);const prop=foo.B+bar?.P;');
  const propResult = globalThis.KCFSourceRewrite.adaptBundleSource(propAccess, { contractVerified: true });
  assert.equal(propResult.status, 'applied');

  const objKey = october28.replace('},[E,q,S,y]);', '},[E,q,S,y]);const obj={B:1,P:2};');
  const objResult = globalThis.KCFSourceRewrite.adaptBundleSource(objKey, { contractVerified: true });
  assert.equal(objResult.status, 'applied');

  const regexAndTemplate = october28.replace(
    '},[E,q,S,y]);',
    '},[E,q,S,y]);const re=/["\'}`]+/g,tpl=`head-${`nested-${E}`}-tail`;'
  );
  const regexAndTemplateResult = globalThis.KCFSourceRewrite.adaptBundleSource(regexAndTemplate, { contractVerified: true });
  assert.equal(regexAndTemplateResult.status, 'applied');

  const templateDroppedRef = october28.replace(
    '},[E,q,S,y]);',
    '},[E,q,S,y]);const tpl=`head-${B}-tail`;'
  );
  const templateDroppedResult = globalThis.KCFSourceRewrite.adaptBundleSource(templateDroppedRef, { contractVerified: true });
  assert.equal(templateDroppedResult.status, 'unsupported');
  assert.equal(templateDroppedResult.reason, 'unknown-segment');
});

test('patches large >40KB modules with literals spanning past 32KB after segmentEnd', async () => {
  const october28 = await fixture('october-28-module.js');
  const pad36k = 'ease-in-'.repeat(4600);

  // 1. Large module (>60KB) where a string literal in a subsequent module crosses segmentEnd + 32768
  const paddedAfterComponent = `${october28};const tailClasses="${pad36k}";`;
  assert.ok(paddedAfterComponent.length > 60000);
  const afterResult = globalThis.KCFSourceRewrite.adaptBundleSource(paddedAfterComponent, { contractVerified: true });
  assert.equal(afterResult.status, 'applied', afterResult.reason || afterResult.status);
  assert.match(afterResult.source, /KCF_replay_state_v3/);

  // 2. Large component body (>40KB inside the component before its closing brace) with string literal crossing 32KB
  const paddedInsideComponent = october28.replace(
    '},[E,q,S,y]);',
    `},[E,q,S,y]);const inlineBanner="${pad36k}";`
  );
  assert.ok(paddedInsideComponent.length > 60000);
  const insideResult = globalThis.KCFSourceRewrite.adaptBundleSource(paddedInsideComponent, { contractVerified: true });
  assert.equal(insideResult.status, 'applied', insideResult.reason || insideResult.status);
  assert.match(insideResult.source, /KCF_replay_state_v3/);

  // 3. Dropped binding referenced after >32KB inside the component body is still caught and rejected
  const droppedPast32k = october28.replace(
    '},[E,q,S,y]);',
    `},[E,q,S,y]);const inlineBanner="${pad36k}";console.log(B);`
  );
  const droppedPast32kResult = globalThis.KCFSourceRewrite.adaptBundleSource(droppedPast32k, { contractVerified: true });
  assert.equal(droppedPast32kResult.status, 'unsupported');
  assert.equal(droppedPast32kResult.reason, 'unknown-segment');
  assert.equal(droppedPast32kResult.source, droppedPast32k);
});

test('detectQueryContract handles inner arrow scoping and 1-2 char minified exports', async () => {
  const detect = source => globalThis.KCFSourceRewrite.detectQueryContract(source);
  const nov23Query = await fixture('november-23-query-contract.js');
  const nov23Method = 'getInfiniteHistoryByChannel:(e,t)=>(0,n.a)({queryKey:["WebChatHistory","getHistoryByChannel",e,t],queryFn:({signal:t,pageParam:a})=>s(t,e,a.start_time),initialPageParam:{start_time:t},getNextPageParam:(e,t,a)=>{if(e?.data)return{start_time:new Date(new Date(a.start_time).getTime()+5e3).toISOString()}}})';

  assert.equal(detect(nov23Query), 'october-2026');
  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('(0,n.a)', '(0,n.z)'))), 'october-2026');
  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('(0,n.a)', '(0,n.ab)').replace('+5e3', '+5000'))), 'october-2026');
  assert.equal(detect(`const api={other:1,${nov23Method.replace('(0,n.a)', '(0,n.z)').replace('+5e3', '+5000')}};`), 'october-2026');

  const freshParamsMethod = nov23Method
    .replace('queryFn:({signal:t,pageParam:a})=>s(t,e,a.start_time)', 'queryFn:({signal:q,pageParam:p})=>s(q,e,p.start_time)')
    .replace('getNextPageParam:(e,t,a)=>{if(e?.data)return{start_time:new Date(new Date(a.start_time).getTime()+5e3).toISOString()}}', 'getNextPageParam:(l,m,p)=>{if(l?.data)return{start_time:new Date(new Date(p.start_time).getTime()+5e3).toISOString()}}');
  assert.equal(detect(nov23Query.replace(nov23Method, freshParamsMethod)), 'october-2026');

  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('(0,n.a)', '(0,n.queryOptions)'))), null);
  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('(0,n.a)', '(0,n.useQuery)'))), null);
  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('queryFn:({signal:t,pageParam:a})=>s(t,e,a.start_time)', 'queryFn:({signal:e,pageParam:a})=>s(e,e,a.start_time)'))), null);
  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('getNextPageParam:(e,t,a)', 'getNextPageParam:(e,e,a)'))), null);
  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('+5e3', '+1e4'))), null);
  assert.equal(detect(nov23Query.replace(nov23Method, nov23Method.replace('+5e3', '+10e3'))), null);
});

test('adaptBundleSource preserves minified export resilience and selector param flexibility', async () => {
  const apply = source => globalThis.KCFSourceRewrite.adaptBundleSource(source, { contractVerified: true });
  const october28 = await fixture('october-28-module.js');
  const nov23 = await fixture('november-23-module.js');

  const remappedOct28 = october28
    .replace('(0,l.f)(e=>e.currentProgressInMs)', '(0,l.z)(e=>e.currentProgressInMs)')
    .replace('(0,l.f)(e=>e.isSeekbarSliding)', '(0,l.z)(e=>e.isSeekbarSliding)')
    .replace('(0,r.f)({...(0,i.I)({channelId:w,startTime:B})', '(0,r.a)({...(0,i.H)({channelId:w,startTime:B})');
  const remappedOct28Result = apply(remappedOct28);
  assert.equal(remappedOct28Result.status, 'applied', remappedOct28Result.reason || remappedOct28Result.status);
  assert.match(remappedOct28Result.source, /\(0,r\.a\)/);
  assert.match(remappedOct28Result.source, /\(0,i\.H\)/);

  const remappedNov23 = nov23
    .replace('(0,l.f)(e=>e.currentProgressInMs)', '(0,l.z)(e=>e.currentProgressInMs)')
    .replace('(0,l.f)(e=>e.isSeekbarSliding)', '(0,l.z)(e=>e.isSeekbarSliding)')
    .replace('(0,a.f)({...(0,i.I)({channelId:b,startTime:N})', '(0,a.b)({...(0,i.H)({channelId:b,startTime:N})');
  const remappedNov23Result = apply(remappedNov23);
  assert.equal(remappedNov23Result.status, 'applied', remappedNov23Result.reason || remappedNov23Result.status);
  assert.match(remappedNov23Result.source, /\(0,a\.b\)/);
  assert.match(remappedNov23Result.source, /\(0,i\.H\)/);

  const selectorRenamedNov23 = nov23.replace('e=>e.currentProgressInMs', 'p=>p.currentProgressInMs');
  const selectorRenamedOct28 = october28.replace('e=>e.currentProgressInMs', 'p=>p.currentProgressInMs');
  assert.equal(apply(selectorRenamedNov23).status, 'applied');
  assert.equal(apply(selectorRenamedOct28).status, 'applied');

  const mismatchedStoreOct28 = october28.replace('(0,l.f)(e=>e.isSeekbarSliding)', '(0,l.g)(e=>e.isSeekbarSliding)');
  const mismatchedStoreNov23 = nov23.replace('(0,l.f)(e=>e.isSeekbarSliding)', '(0,l.g)(e=>e.isSeekbarSliding)');
  assert.equal(apply(mismatchedStoreOct28).status, 'unsupported');
  assert.equal(apply(mismatchedStoreNov23).status, 'unsupported');

  const namedQueryOct28 = october28.replace('(0,r.f)({...(0,i.I)({channelId:w,startTime:B})', '(0,r.useQuery)({...(0,i.I)({channelId:w,startTime:B})');
  const namedQueryNov23 = nov23.replace('(0,a.f)({...(0,i.I)({channelId:b,startTime:N})', '(0,a.useQuery)({...(0,i.I)({channelId:b,startTime:N})');
  assert.equal(apply(namedQueryOct28).status, 'unsupported');
  assert.equal(apply(namedQueryNov23).status, 'unsupported');
});

test('contains no downloaded-code execution mechanism', async () => {
  for (const path of ['../extension/background.js', '../extension/rewrite.js', '../extension/replay-template.js']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8');
    assert.doesNotMatch(source, /\beval\s*\(|\bnew\s+Function\s*\(/);
  }
});
