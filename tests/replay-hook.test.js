import assert from 'node:assert/strict';
import React from 'react';
import { test } from 'node:test';
import { QueryClient, QueryClientProvider, useInfiniteQuery } from '@tanstack/react-query';
import TestRenderer, { act } from 'react-test-renderer';
import '../extension/replay-template.js';

globalThis.IS_REACT_ACT_ENVIRONMENT = true;
const originalDocument = globalThis.document;
const attributes = new Map();
globalThis.document = {
  documentElement: {
    setAttribute: (key, value) => attributes.set(key, value),
    removeAttribute: key => attributes.delete(key),
    getAttribute: key => attributes.get(key) ?? null
  }
};

const baseMs = Date.parse('2025-01-01T00:00:00.000Z');
const iso = value => new Date(value).toISOString();

function makePage(pageParam) {
  const start = Date.parse(pageParam.start_time);
  return { data: { messages: [0, 2000, 6000].map(offset => ({
    id: `${start}:${offset}`,
    created_at: iso(start + offset)
  })) } };
}

function makeClock(start = 10000) {
  let now = start;
  let id = 0;
  const timers = new Map();
  return {
    now: () => now,
    advance(ms) { now += ms; },
    schedule(callback, delay) {
      const timerId = ++id;
      timers.set(timerId, { due: now + delay, callback });
      return timerId;
    },
    clear(timerId) { timers.delete(timerId); },
    pendingCount() { return timers.size; },
    runDue() {
      let changed = true;
      while (changed) {
        changed = false;
        for (const [timerId, timer] of timers) {
          if (timer.due <= now) {
            timers.delete(timerId);
            timer.callback();
            changed = true;
            break;
          }
        }
      }
    }
  };
}

function createHarness({ client, clock, transport, initialData = true }) {
  function Replay(props) {
    const state = globalThis.KCFReplayTemplate({
      React,
      useInfiniteQuery: options => useInfiniteQuery(options),
      createOptions: startAt => ({
        queryKey: ['react-harness', props.channelId, startAt],
        queryFn: args => transport({ ...args, channelId: props.channelId }),
        initialPageParam: { start_time: startAt },
        getNextPageParam: (lastPage, pages, lastPageParam) => lastPage?.data
          ? { start_time: iso(Date.parse(lastPageParam.start_time) + 5000) }
          : undefined,
        initialData: initialData ? {
          pages: [makePage({ start_time: startAt })],
          pageParams: [{ start_time: startAt }]
        } : undefined
      }),
      initialStart: props.startAt,
      videoStartMs: props.videoStartMs,
      progress: props.progress,
      isSliding: props.isSliding,
      channelId: props.channelId,
      now: clock.now,
      scheduleTimeout: clock.schedule,
      clearTimeout: clock.clear
    });
    const messages = state.data?.pages.flatMap(page => page?.data?.messages || []) || [];
    const shown = messages.filter(message => Date.parse(message.created_at) <= props.videoStartMs + state.displayMs);
    return React.createElement('output', null, JSON.stringify({
      displayMs: state.displayMs,
      shown: shown.map(message => ({ id: message.id, time: Date.parse(message.created_at) })),
      pageCount: state.data?.pages?.length || 0
    }));
  }

  const startAt = iso(baseMs);
  const render = props => React.createElement(QueryClientProvider, { client },
    React.createElement(Replay, {
      channelId: 'maddyson', startAt, videoStartMs: baseMs,
      progress: 0, isSliding: false, ...props
    }));
  return { Replay, render };
}

async function flush() {
  await Promise.resolve();
  await Promise.resolve();
  await Promise.resolve();
}

async function flushReactTurn() {
  await act(async () => { await flush(); await new Promise(resolve => setTimeout(resolve, 0)); await flush(); });
}

test('10-minute 1x and 2x stress with 7s on every page preserves bounds and single-flight', async () => {
  for (const speed of [1, 2]) {
    const clock = makeClock();
    const stats = { active: 0, maxActive: 0, calls: 0, aborted: 0 };
    const pending = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    const transport = ({ pageParam, signal }) => new Promise(resolve => {
      stats.calls++;
      stats.active++;
      stats.maxActive = Math.max(stats.maxActive, stats.active);
      const request = {
        startedAt: clock.now(),
        resolve() {
          if (request.done) return;
          request.done = true;
          stats.active--;
          resolve(makePage(pageParam));
        },
        done: false
      };
      signal.addEventListener('abort', () => {
        if (!request.done) { request.done = true; stats.active--; stats.aborted++; }
      }, { once: true });
      pending.push(request);
    });
    const { render } = createHarness({ client, clock, transport });
    let renderer;
    await act(async () => { renderer = TestRenderer.create(render({})); await flush(); });
    const seconds = 600 / speed;
    for (let second = 1; second <= seconds; second++) {
      await act(async () => {
        clock.advance(1000);
        clock.runDue();
        for (const request of pending) {
          if (!request.done && clock.now() - request.startedAt >= 7000) request.resolve();
        }
        renderer.update(render({ progress: second * speed * 1000 }));
        await flush();
      });
      const output = JSON.parse(renderer.root.findByType('output').children[0]);
      assert.ok(output.shown.every(message => message.time <= baseMs + output.displayMs));
    }
    const cached = client.getQueryCache().getAll().flatMap(query => query.state.data?.pages || []);
    assert.ok(cached.length <= 24, `retained ${cached.length} pages`);
    assert.ok(stats.calls > 20, `only ${stats.calls} page requests`);
    assert.equal(stats.maxActive, 1);
    assert.equal(stats.aborted, 0);
    await act(async () => { renderer.unmount(); await flush(); });
    client.clear();
  }
});

test('10-minute playback stays current through one 7s spike with 400ms normal pages', async t => {
  for (const speed of [1, 2]) {
    const clock = makeClock();
    const stats = { active: 0, maxActive: 0, calls: 0, aborted: 0, spikeCount: 0 };
    const pending = [];
    const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
    t.after(() => client.clear());
    const transport = ({ pageParam, signal }) => new Promise(resolve => {
      stats.calls++;
      stats.active++;
      stats.maxActive = Math.max(stats.maxActive, stats.active);
      const spike = !stats.spikeCount && clock.now() >= 50000;
      if (spike) stats.spikeCount++;
      const request = {
        startedAt: clock.now(), delay: spike ? 7000 : 400, done: false,
        resolve() {
          if (request.done) return;
          request.done = true;
          stats.active--;
          resolve(makePage(pageParam));
        }
      };
      signal.addEventListener('abort', () => {
        if (!request.done) { request.done = true; stats.active--; stats.aborted++; }
      }, { once: true });
      pending.push(request);
    });
    const { render } = createHarness({ client, clock, transport });
    let renderer;
    await act(async () => { renderer = TestRenderer.create(render({})); await flush(); });
    let maximumAge = 0;
    let minimumBuffer = Infinity;
    for (let second = 1; second <= 600 / speed; second++) {
      await act(async () => {
        clock.advance(1000);
        clock.runDue();
        for (const request of pending)
          if (!request.done && clock.now() - request.startedAt >= request.delay) request.resolve();
        renderer.update(render({ progress: second * speed * 1000 }));
        await flush();
      });
      const output = JSON.parse(renderer.root.findByType('output').children[0]);
      assert.ok(output.shown.every(message => message.time <= baseMs + output.displayMs));
      if (second >= 30) {
        const newest = Math.max(...output.shown.map(message => message.time));
        maximumAge = Math.max(maximumAge, baseMs + second * speed * 1000 - newest);
        const metrics = JSON.parse(attributes.get('data-kcf-buffer-v2'));
        if (Number.isFinite(metrics.bufferMs)) minimumBuffer = Math.min(minimumBuffer, metrics.bufferMs);
      }
    }
    const pages = client.getQueryCache().getAll().flatMap(query => query.state.data?.pages || []);
    assert.equal(stats.spikeCount, 1);
    assert.ok(maximumAge <= 2000, `speed=${speed} maximum chat age=${maximumAge}ms`);
    assert.ok(Number.isFinite(minimumBuffer), `speed=${speed} buffer metric was not recorded`);
    assert.ok(pages.length > 0 && pages.length <= 24, `retained ${pages.length} pages`);
    assert.equal(stats.maxActive, 1);
    assert.equal(stats.aborted, 0, 'steady playback never cancels a request');
    await act(async () => { renderer.unmount(); await flush(); });
  }
});

test('two transient page errors recover after cooldown and exhausted pages stop fetching', async t => {
  const clock = makeClock();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let renderer;
  t.after(async () => {
    if (renderer) {
      try { await act(async () => { renderer.unmount(); await flush(); }); } catch { /* best-effort cleanup after assertion failures */ }
    }
    client.clear();
  });
  let calls = 0;
  let failures = 0;
  const transport = async ({ pageParam }) => {
    calls++;
    if (failures) { failures--; throw new Error('fixture transient failure'); }
    return makePage(pageParam);
  };
  const { render } = createHarness({ client, clock, transport });
  await act(async () => { renderer = TestRenderer.create(render({})); await flush(); });
  for (let turn = 0; turn < 30 && (client.getQueryCache().getAll()[0]?.state.data?.pages?.length || 0) < 4; turn++)
    await flushReactTurn();
  assert.equal(calls, 3, 'three successful pages warm the 15-second buffer');
  failures = 2;

  await act(async () => { renderer.update(render({ progress: 1000 })); await flush(); });
  await flushReactTurn();
  assert.equal(calls, 4, 'first transient failure starts once playback consumes buffer');
  for (let failure = 0; failure < 2; failure++) {
    await act(async () => { clock.advance(2999); clock.runDue(); await flush(); });
    assert.equal(calls, 4 + failure, 'cooldown prevents an early retry');
    await act(async () => { clock.advance(1); clock.runDue(); await flush(); });
    await flushReactTurn();
  }
  assert.equal(calls, 6, 'second transient failure is retried and then recovers');
  assert.equal(client.getQueryCache().getAll()[0].state.data.pages.length, 5);
  await act(async () => { renderer.unmount(); await flush(); });
  renderer = null;
  client.clear();

  const exhaustedClock = makeClock();
  const exhaustedClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let exhaustedRenderer;
  t.after(async () => {
    if (exhaustedRenderer) {
      try { await act(async () => { exhaustedRenderer.unmount(); await flush(); }); } catch { /* best-effort cleanup after assertion failures */ }
    }
    exhaustedClient.clear();
  });
  let exhaustedCalls = 0;
  const exhaustedTransport = async ({ pageParam }) => {
    exhaustedCalls++;
    return exhaustedCalls === 4 ? {} : makePage(pageParam);
  };
  const exhausted = createHarness({ client: exhaustedClient, clock: exhaustedClock, transport: exhaustedTransport });
  await act(async () => { exhaustedRenderer = TestRenderer.create(exhausted.render({})); await flush(); });
  for (let turn = 0; turn < 30 && (exhaustedClient.getQueryCache().getAll()[0]?.state.data?.pages?.length || 0) < 4; turn++)
    await flushReactTurn();
  assert.equal(exhaustedCalls, 3);
  await act(async () => { exhaustedRenderer.update(exhausted.render({ progress: 1000 })); await flush(); });
  await flushReactTurn();
  assert.equal(exhaustedCalls, 4);
  for (const progress of [2000, 3000, 4000, 5000]) {
    await act(async () => { exhaustedClock.advance(1000); exhaustedClock.runDue(); exhaustedRenderer.update(exhausted.render({ progress })); await flush(); });
  }
  assert.equal(exhaustedCalls, 4, 'hasNextPage false prevents further requests');
  await act(async () => { exhaustedRenderer.unmount(); await flush(); });
  exhaustedRenderer = null;
  exhaustedClient.clear();
});

test('backward and forward seeks reset once; sliding pauses requests until release', async t => {
  const clock = makeClock();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let renderer;
  t.after(async () => {
    if (renderer) {
      try { await act(async () => { renderer.unmount(); await flush(); }); } catch { /* best-effort cleanup after assertion failures */ }
    }
    client.clear();
  });
  const starts = [];
  let calls = 0;
  const transport = async ({ pageParam }) => {
    calls++;
    starts.push(Date.parse(pageParam.start_time) - baseMs);
    return makePage(pageParam);
  };
  const { render } = createHarness({ client, clock, transport });
  await act(async () => { renderer = TestRenderer.create(render({})); await flush(); });
  const activeStart = () => {
    const current = client.getQueryCache().getAll().find(query => query.getObserversCount() > 0);
    return Date.parse(current.queryKey[2]) - baseMs;
  };
  const update = async props => {
    await act(async () => { renderer.update(render(props)); await flush(); });
    await flushReactTurn();
  };
  const waitForBuffer = async progress => {
    for (let turn = 0; turn < 30; turn++) {
      const query = client.getQueryCache().getAll().find(item => item.getObserversCount() > 0);
      const params = query?.state.data?.pageParams || [];
      const last = params.at(-1);
      if (last && Date.parse(last.start_time) - baseMs - progress >= 15000 && query.state.fetchStatus === 'idle') return;
      await flushReactTurn();
    }
  };
  await waitForBuffer(0);

  await update({ progress: 5000 });
  assert.equal(activeStart(), 2500);
  await waitForBuffer(5000);
  await update({ progress: 5000 });
  assert.equal(activeStart(), 2500, 'a stable render does not repeat the seek reset');

  await update({ progress: 3000 });
  assert.equal(activeStart(), 500, 'backward seek starts 2.5 seconds before the playhead');
  await waitForBuffer(3000);
  await update({ progress: 8000 });
  assert.equal(activeStart(), 5500, 'forward seek starts 2.5 seconds before the playhead');
  await waitForBuffer(8000);

  const callsBeforeSlide = calls;
  await update({ progress: 9000, isSliding: true });
  await update({ progress: 30000, isSliding: true });
  assert.equal(calls, callsBeforeSlide, 'scrubbing does not fetch history');
  await update({ progress: 30000, isSliding: false });
  assert.equal(activeStart(), 27500, 'release creates a fresh window before the final seek position');
  await waitForBuffer(30000);
  await update({ progress: 30000 });
  assert.equal(activeStart(), 27500, 'stable post-seek renders keep the new query key');
  for (const start of [7500, 5500, 10500, 32500])
    assert.ok(starts.includes(start), `query window starting at ${start}ms was fetched; observed ${starts.join(',')}`);
});

test('paused playback resets its query context when the recording start or channel changes', async t => {
  const clock = makeClock();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let renderer;
  t.after(async () => {
    if (renderer) {
      try { await act(async () => { renderer.unmount(); await flush(); }); } catch { /* best-effort cleanup after assertion failures */ }
    }
    client.clear();
  });
  const requests = [];
  const transport = async ({ pageParam, channelId }) => {
    requests.push({ channelId, start: Date.parse(pageParam.start_time) });
    return makePage(pageParam);
  };
  const { render } = createHarness({ client, clock, transport });
  await act(async () => { renderer = TestRenderer.create(render({ progress: 0, paused: true })); await flush(); });
  for (let turn = 0; turn < 30 && (client.getQueryCache().getAll()[0]?.state.data?.pages?.length || 0) < 4; turn++)
    await flushReactTurn();

  const newBase = baseMs + 60000;
  const newStart = iso(newBase);
  const update = async props => {
    await act(async () => { renderer.update(render({ progress: 0, paused: true, ...props })); await flush(); });
    await flushReactTurn();
  };
  const activeQuery = () => client.getQueryCache().getAll().find(query => query.getObserversCount() > 0);

  await update({ startAt: newStart, videoStartMs: newBase });
  assert.equal(activeQuery().queryKey[1], 'maddyson');
  assert.equal(activeQuery().queryKey[2], newStart, 'new absolute start is the query key at unchanged progress');
  assert.equal(activeQuery().state.data.pageParams[0].start_time, newStart);
  let output = JSON.parse(renderer.root.findByType('output').children[0]);
  assert.ok(output.shown.some(message => message.time === newBase), 'the new recording renders its own zero-time message');

  await update({ startAt: newStart, videoStartMs: newBase, channelId: 'new-channel' });
  assert.equal(activeQuery().queryKey[1], 'new-channel', 'channel changes create a fresh query at unchanged progress');
  assert.equal(activeQuery().queryKey[2], newStart);
  output = JSON.parse(renderer.root.findByType('output').children[0]);
  assert.ok(output.shown.some(message => message.time === newBase));
  assert.ok(requests.filter(request => request.channelId === 'new-channel').every(request => request.start >= newBase));
});

test('paused replay warms to 15 seconds and stops; initial failure waits through cooldown', async t => {
  const clock = makeClock();
  const client = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let renderer;
  t.after(async () => {
    if (renderer) {
      try { await act(async () => { renderer.unmount(); await flush(); }); } catch { /* best-effort cleanup after assertion failures */ }
    }
    client.clear();
  });
  let calls = 0;
  const transport = async ({ pageParam }) => {
    calls++;
    return makePage(pageParam);
  };
  const { render } = createHarness({ client, clock, transport });
  await act(async () => { renderer = TestRenderer.create(render({ paused: true })); await flush(); });
  for (let turn = 0; turn < 30 && (client.getQueryCache().getAll()[0]?.state.data?.pages?.length || 0) < 4; turn++)
    await flushReactTurn();
  let output = JSON.parse(renderer.root.findByType('output').children[0]);
  assert.equal(output.pageCount, 4);
  assert.equal(calls, 3);
  assert.equal(Number(JSON.parse(attributes.get('data-kcf-buffer-v2')).bufferMs), 15000);
  await act(async () => { renderer.unmount(); await flush(); });
  renderer = null;
  client.clear();

  const retryClock = makeClock();
  const retryClient = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: Infinity } } });
  let retryRenderer;
  t.after(async () => {
    if (retryRenderer) {
      try { await act(async () => { retryRenderer.unmount(); await flush(); }); } catch { /* best-effort cleanup after assertion failures */ }
    }
    retryClient.clear();
  });
  let attempts = 0;
  let failInitial;
  const retryTransport = async ({ pageParam }) => {
    attempts++;
    if (attempts === 1) return new Promise((_, reject) => { failInitial = () => reject(new Error('fixture initial failure')); });
    return makePage(pageParam);
  };
  const retryHarness = createHarness({ client: retryClient, clock: retryClock, transport: retryTransport, initialData: false });
  await act(async () => { retryRenderer = TestRenderer.create(retryHarness.render({ paused: true })); await flush(); });
  assert.equal(attempts, 1);
  await act(async () => {
    failInitial();
    await flush();
  });
  for (let turn = 0; turn < 20 && (retryClient.getQueryCache().getAll()[0]?.state.status !== 'error' || retryClock.pendingCount() === 0); turn++)
    await flushReactTurn();
  assert.equal(retryClock.pendingCount(), 1, `initial error schedules cooldown before virtual time advances: ${attributes.get('data-kcf-buffer-v2')} query=${JSON.stringify(retryClient.getQueryCache().getAll().map(item => ({ state: item.state.status, fetchStatus: item.state.fetchStatus, error: String(item.state.error || '') })))}`);
  await act(async () => { retryClock.advance(2999); retryClock.runDue(); await flush(); });
  assert.equal(attempts, 1);
  await act(async () => { retryClock.advance(1); retryClock.runDue(); await flush(); });
  for (let turn = 0; turn < 30 && (retryClient.getQueryCache().getAll()[0]?.state.data?.pages?.length || 0) < 4; turn++)
    await flushReactTurn();
  output = JSON.parse(retryRenderer.root.findByType('output').children[0]);
  assert.equal(output.pageCount, 4, `initial retry attempts=${attempts}, timers=${retryClock.pendingCount()}, metrics=${attributes.get('data-kcf-buffer-v2')}, output=${JSON.stringify(output)}`);
  assert.equal(attempts, 5);
  await act(async () => { retryRenderer.unmount(); await flush(); });
  retryRenderer = null;
  retryClient.clear();
});

test.after(() => {
  globalThis.document = originalDocument;
});
