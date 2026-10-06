import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const flush = async () => { await Promise.resolve(); await Promise.resolve(); await new Promise(resolve => setImmediate(resolve)); };

async function makeBackground({ deferStorage = false, initialEnabled = true } = {}) {
  const listeners = { request: [], updated: [], removed: [], messages: [], storage: [] };
  const filters = new Map();
  const badges = [];
  const sent = [];
  const tab = { id: 7, url: 'https://kick.com/maddyson/videos/example' };
  let enabled = initialEnabled;
  let rejectNextWrite = false;
  let resolveStorage;
  let filterCount = 0;
  let timerId = 0;
  const timers = new Map();
  function schedule(callback, delay) {
    const id = ++timerId;
    timers.set(id, { callback, delay });
    return id;
  }
  function cancel(id) { timers.delete(id); }
  function fireTimersThrough(delay) {
    for (const [id, timer] of [...timers]) {
      if (timer.delay <= delay) {
        timers.delete(id);
        timer.callback();
      }
    }
  }
  const browser = {
    runtime: {
      id: 'test-extension', getManifest: () => ({}),
      getURL: path => `moz-extension://test-extension/${path}`,
      onMessage: { addListener(callback) { listeners.messages.push(callback); } }
    },
    webRequest: { onBeforeRequest: { addListener(callback, filter, extra) { listeners.request.push({ callback, filter, extra }); } } },
    browserAction: {
      setBadgeText: value => badges.push({ type: 'text', ...value }),
      setBadgeBackgroundColor: value => badges.push({ type: 'color', ...value })
    },
    tabs: {
      sendMessage: (tabId, message) => { sent.push({ tabId, message }); return Promise.resolve(); },
      query: async () => [tab],
      reload: async id => { tab.reloaded = id; },
      onRemoved: { addListener(callback) { listeners.removed.push(callback); } },
      onUpdated: { addListener(callback) { listeners.updated.push(callback); } }
    },
    storage: {
      local: {
        get: () => deferStorage ? new Promise(resolve => { resolveStorage = resolve; }) : Promise.resolve({ enabled }),
        set: async values => {
          if (rejectNextWrite) { rejectNextWrite = false; throw new Error('storage write failed'); }
          const oldValue = enabled;
          enabled = values.enabled;
          for (const callback of listeners.storage) callback({ enabled: { oldValue, newValue: enabled } }, 'local');
        }
      },
      onChanged: { addListener(callback) { listeners.storage.push(callback); } }
    }
  };
  browser.webRequest = {
    onBeforeRequest: { addListener(callback, filter, extra) { listeners.request.push({ callback, filter, extra }); } },
    filterResponseData(requestId) {
      filterCount++;
      const output = [];
      const filter = {
        output, closed: false, disconnected: false,
        write(bytes) { output.push(new Uint8Array(bytes).slice()); },
        close() { this.closed = true; },
        disconnect() { this.disconnected = true; }
      };
      filters.set(requestId, filter);
      return filter;
    }
  };
  const source = await readFile(new URL('../extension/background.js', import.meta.url), 'utf8');
  const template = await readFile(new URL('../extension/replay-template.js', import.meta.url), 'utf8');
  const rewrite = await readFile(new URL('../extension/rewrite.js', import.meta.url), 'utf8');
  const context = vm.createContext({
    browser, URL, Date, Promise, TextEncoder, TextDecoder, Uint8Array, Map, Set, Number, Boolean,
    setTimeout: schedule, clearTimeout: cancel, console
  });
  vm.runInContext(template, context);
  vm.runInContext(rewrite, context);
  vm.runInContext(source, context);
  await flush();

  function request(requestId, overrides = {}) {
    const details = {
      requestId, tabId: 7, frameId: 0, type: 'script',
      documentUrl: tab.url,
      url: `https://assets.kick.com/main/_next/static/chunks/${requestId}.js`,
      ...overrides
    };
    listeners.request[0].callback(details);
    return filters.get(requestId);
  }
  function emit(filter, bytes) {
    filter.ondata({ data: bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) });
  }
  function joined(filter) {
    const length = filter.output.reduce((sum, part) => sum + part.length, 0);
    const bytes = new Uint8Array(length);
    let offset = 0;
    for (const part of filter.output) { bytes.set(part, offset); offset += part.length; }
    return bytes;
  }
  function contentMessage(message, { frameId = 0, url = tab.url, tabId = 7 } = {}) {
    const handler = listeners.messages[0];
    return handler(message, { id: 'test-extension', tab: { id: tabId }, frameId, url });
  }
  function popupMessage(message, { withTab = false, url = 'moz-extension://test-extension/popup.html' } = {}) {
    return listeners.messages[0](message, { id: 'test-extension', url, ...(withTab ? { tab: { id: 9 } } : {}) });
  }
  return {
    browser, listeners, filters, badges, sent, tab, request, emit, joined, contentMessage, popupMessage,
    get filterCount() { return filterCount; },
    resolveStorage(value = { enabled: initialEnabled }) { resolveStorage(value); },
    fireTimersThrough,
    failNextWrite() { rejectNextWrite = true; },
    get enabled() { return enabled; },
    async state() { return popupMessage({ type: 'GET_STATE' }); }
  };
}

test('listener is early, request scope is narrow, chunks round-trip, and latest module rewrites', async () => {
  const app = await makeBackground({ deferStorage: true });
  assert.equal(app.listeners.request.length, 2, 'listeners register before storage resolves');
  app.request('before-ready');
  assert.equal(app.filterCount, 0, 'loading never intercepts before settings are ready');
  app.resolveStorage();
  await flush();

  app.request('bad-tab', { tabId: -1 });
  app.request('subframe', { frameId: 1 });
  app.request('bad-origin', { documentUrl: 'https://example.org/' });
  app.request('bad-path', { url: 'https://assets.kick.com/other/chunk.js' });
  assert.equal(app.filterCount, 0);
  app.contentMessage({ type: 'ROUTE', isVod: true, routeSequence: 1 });

  const query = await readFile(new URL('./fixtures/latest-query-contract.js', import.meta.url), 'utf8');
  const queryFilter = app.request('query');
  const queryBytes = encoder.encode(query);
  app.emit(queryFilter, queryBytes.slice(0, 31));
  app.emit(queryFilter, queryBytes.slice(31));
  queryFilter.onstop();
  await flush();
  assert.equal(decoder.decode(app.joined(queryFilter)), query);
  assert.equal(queryFilter.closed, true);

  const current = await readFile(new URL('./fixtures/latest-module.js', import.meta.url), 'utf8');
  const currentFilter = app.request('component');
  const currentBytes = encoder.encode(current);
  for (let offset = 0; offset < currentBytes.length; offset += 37)
    app.emit(currentFilter, currentBytes.slice(offset, offset + 37));
  currentFilter.onstop();
  await flush();
  const rewritten = decoder.decode(app.joined(currentFilter));
  assert.match(rewritten, /KCF_replay_state_v3/);
  assert.equal((rewritten.match(/ChatroomReplayEntries/g) || []).length, 1);
  assert.equal(app.sent.some(item => item.message.status === 'applied'), true);

  const utf8 = encoder.encode('const label = "Привет 👋";');
  const untouched = app.request('utf8');
  app.emit(untouched, utf8.slice(0, 17));
  app.emit(untouched, utf8.slice(17));
  untouched.onstop();
  await flush();
  assert.deepEqual(app.joined(untouched), utf8);

  const malformedBytes = new Uint8Array([0xc3, 0x28]);
  const malformed = app.request('malformed');
  app.emit(malformed, malformedBytes);
  malformed.onstop();
  await flush();
  assert.deepEqual(app.joined(malformed), malformedBytes);

  const statuses = app.sent.filter(item => item.message.type === 'PATCH_STATUS').map(item => item.message.status);
  assert.deepEqual(statuses, ['applied'], 'unrelated scripts do not replace the applied status');
});

test('shared chunk source status stays inactive on live routes and restores on VOD entry', async () => {
  const app = await makeBackground();
  async function script(id, source) {
    const filter = app.request(id);
    app.emit(filter, encoder.encode(source));
    filter.onstop();
    await flush();
  }

  app.tab.url = 'https://kick.com/maddyson';
  app.contentMessage({ type: 'ROUTE', isVod: false, routeSequence: 1 });
  await script('preload-query', await readFile(new URL('./fixtures/latest-query-contract.js', import.meta.url), 'utf8'));
  const current = await readFile(new URL('./fixtures/latest-module.js', import.meta.url), 'utf8');
  await script('preload-current', current);
  assert.equal((await app.state()).status, 'inactive');
  assert.equal(app.badges.at(-2).text, '', 'a shared replay chunk does not show a VOD badge on live routes');

  app.tab.url = 'https://kick.com/maddyson/videos/example';
  app.contentMessage({ type: 'ROUTE', isVod: true, routeSequence: 2 });
  await flush();
  assert.equal((await app.state()).status, 'applied');
  assert.equal(app.sent.at(-1).message.status, 'applied', 'cached applied source status reaches the VOD content script');

  app.tab.url = 'https://kick.com/maddyson';
  app.contentMessage({ type: 'ROUTE', isVod: false, routeSequence: 3 });
  await script('preload-unsupported', current.replace('S-R.current>2e3', 'S-R.current>2001'));
  assert.equal((await app.state()).status, 'inactive');
  assert.equal(app.badges.at(-2).text, '');

  app.tab.url = 'https://kick.com/maddyson/videos/next';
  app.contentMessage({ type: 'ROUTE', isVod: true, routeSequence: 4 });
  await flush();
  assert.equal((await app.state()).status, 'unsupported');
  assert.equal(app.sent.at(-1).message.status, 'unsupported', 'cached unsupported source status avoids an endless checking state');
});

test('overflow, stream errors, navigation, and toggle release buffered bytes safely', async () => {
  const app = await makeBackground();
  const oversized = app.request('oversized');
  const tooLarge = new Uint8Array(2 * 1024 * 1024 + 1);
  app.emit(oversized, tooLarge);
  assert.equal(oversized.disconnected, true);
  assert.equal(app.joined(oversized).length, tooLarge.length);

  const errored = app.request('error');
  app.emit(errored, encoder.encode('partial'));
  errored.onerror();
  assert.equal(errored.disconnected, true);

  const timedOut = app.request('timed-out');
  const partial = encoder.encode('still-valid-prefix');
  app.emit(timedOut, partial);
  app.fireTimersThrough(6000);
  assert.equal(timedOut.disconnected, true);
  assert.deepEqual(app.joined(timedOut), partial);

  app.contentMessage({ type: 'ROUTE', isVod: true, routeSequence: 1 });
  app.contentMessage({ type: 'METRICS', metrics: {
    version: 3, videoMs: 1000, displayMs: 1000, bufferMs: 15000, pages: 3,
    fetching: false, error: false, updatedAt: Date.now()
  } });
  assert.equal((await app.state()).status, 'healthy');

  const pending = app.request('pending');
  app.emit(pending, encoder.encode('partial source'));
  for (const listener of app.listeners.updated) listener(7, { status: 'loading' }, app.tab);
  assert.equal(pending.disconnected, true);
  assert.equal((await app.state()).isVod, false);

  app.contentMessage({ type: 'ROUTE', isVod: true, routeSequence: 2 });
  const held = app.request('held');
  app.emit(held, encoder.encode('buffered source'));
  const disabled = await app.popupMessage({ type: 'SET_ENABLED', enabled: false });
  assert.equal(disabled.ok, true);
  assert.equal(disabled.enabled, false);
  assert.equal(held.disconnected, true);
  app.contentMessage({ type: 'METRICS', metrics: {
    version: 3, videoMs: 2000, displayMs: 2000, bufferMs: 20000, pages: 4,
    fetching: false, error: false, updatedAt: Date.now()
  } });
  const disabledState = await app.state();
  assert.equal(disabledState.status, 'disabled');
  assert.equal(disabledState.metrics, null);

  const enabled = await app.popupMessage({ type: 'SET_ENABLED', enabled: true });
  assert.equal(enabled.ok, true);
  assert.equal(enabled.enabled, true);
  assert.equal((await app.state()).status, 'checking');
  app.failNextWrite();
  const failed = await app.popupMessage({ type: 'SET_ENABLED', enabled: false });
  assert.equal(failed.ok, false);
  assert.equal(failed.enabled, true);
  assert.equal((await app.state()).enabled, true);
});

test('content and popup messages are sender-checked; reload uses the active URL', async () => {
  const app = await makeBackground();
  const invalid = app.contentMessage({ type: 'ROUTE', isVod: true, routeSequence: 1 }, { frameId: 1 });
  assert.equal(invalid, undefined);
  app.contentMessage({ type: 'ROUTE', isVod: true, routeSequence: 1 });
  assert.equal((await app.state()).status, 'checking');
  assert.equal((await app.popupMessage({ type: 'RELOAD_VOD' })).ok, true);
  assert.equal(app.tab.reloaded, 7);
  assert.equal((await app.popupMessage({ type: 'GET_STATE' }, { withTab: true })).isVod, true);
  assert.equal(await app.popupMessage({ type: 'GET_STATE' }, { url: 'moz-extension://other-extension/popup.html' }), undefined);
  app.tab.url = 'https://kick.com/maddyson';
  assert.equal((await app.state()).status, 'inactive');
  assert.equal((await app.state()).isVod, false);
  assert.equal((await app.popupMessage({ type: 'RELOAD_VOD' })).ok, false);
  assert.equal(await app.contentMessage({ type: 'SET_ENABLED', enabled: false }), undefined);
  assert.equal(app.enabled, true);
});

test('aggregate buffer budget releases the crossing response without retaining it', async () => {
  const app = await makeBackground();
  const chunk = new Uint8Array(2 * 1024 * 1024);
  const held = [];
  for (let index = 0; index < 8; index++) {
    const filter = app.request(`held-${index}`);
    app.emit(filter, chunk);
    held.push(filter);
  }
  const crossing = app.request('aggregate-limit');
  app.emit(crossing, new Uint8Array([7]));
  assert.equal(crossing.disconnected, true);
  assert.deepEqual(app.joined(crossing), new Uint8Array([7]));
  for (const listener of app.listeners.updated) listener(7, { status: 'loading' }, app.tab);
  assert.ok(held.every(filter => filter.disconnected));
});
