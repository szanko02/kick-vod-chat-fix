import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

test('pageshow from BFCache re-announces a VOD route and rereads metrics', async () => {
  const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  const sent = [];
  const listeners = new Map();
  const attributes = new Map([['data-kcf-buffer-v2', JSON.stringify({
    version: 3, videoMs: 10000, displayMs: 8000, bufferMs: 15000,
    pages: 4, fetching: false, error: false, updatedAt: 10
  })]]);
  const window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name)
  };
  class MutationObserver { observe() {} disconnect() {} }
  const context = {
    browser: { runtime: {
      sendMessage: message => { sent.push(message); return Promise.resolve(); },
      onMessage: { addListener() {} }
    } },
    document: { documentElement: { getAttribute: key => attributes.get(key) ?? null } },
    location: { pathname: '/maddyson/videos/01a10d48-8960-7f24-aade-189d84b44b61' },
    window, MutationObserver, Date, JSON,
    setInterval: () => 1, clearInterval() {}
  };
  vm.runInNewContext(source, context);
  const routesBefore = sent.filter(message => message.type === 'ROUTE').length;
  sent.length = 0;
  listeners.get('pagehide')();
  listeners.get('pageshow')();
  assert.equal(sent.filter(message => message.type === 'ROUTE').length, 1);
  assert.equal(sent.find(message => message.type === 'ROUTE').isVod, true);
  const metrics = sent.find(message => message.type === 'METRICS');
  assert.equal(metrics.metrics.bufferMs, 15000);
  assert.equal(routesBefore, 1);
});

test('document_start survives a missing root and observes it when the parser creates it', async () => {
  const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  const sent = [];
  const listeners = new Map();
  const observers = [];
  let root = null;
  const document = {};
  Object.defineProperty(document, 'documentElement', { get: () => root });
  const window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name)
  };
  class MutationObserver {
    constructor(callback) { this.callback = callback; this.target = null; this.disconnected = false; observers.push(this); }
    observe(target) { this.target = target; }
    disconnect() { this.disconnected = true; }
  }
  const context = {
    browser: { runtime: {
      sendMessage: message => { sent.push(message); return Promise.resolve(); },
      onMessage: { addListener() {} }
    } },
    document, location: { pathname: '/maddyson/videos/example' }, window,
    MutationObserver, Date, JSON, setInterval: () => 1, clearInterval() {}
  };
  vm.runInNewContext(source, context);
  assert.equal(observers[0].target, document);
  assert.equal(sent.find(message => message.type === 'ROUTE').isVod, true);
  root = { getAttribute: () => JSON.stringify({
    version: 3, videoMs: 1000, displayMs: 1000, bufferMs: 15000,
    pages: 3, fetching: false, error: false, updatedAt: 10
  }) };
  observers[0].callback();
  assert.equal(observers[0].disconnected, true);
  assert.equal(observers[1].target, root);
  assert.equal(sent.find(message => message.type === 'METRICS').metrics.bufferMs, 15000);
  listeners.get('pagehide')();
  assert.equal(observers[1].disconnected, true);
});

test('popstate without route change does not re-emit route, and pause prevents stale status', async () => {
  const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  const sent = [];
  const listeners = new Map();
  let intervalHandler = null;
  const attributes = new Map([['data-kcf-buffer-v2', JSON.stringify({
    version: 3, videoMs: 10000, displayMs: 8000, bufferMs: 15000,
    pages: 4, fetching: false, error: false, updatedAt: 10
  })]]);
  const window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name)
  };
  class MutationObserver { observe() {} disconnect() {} }
  let videoPaused = true;
  let now = 1000000;
  const context = {
    browser: { runtime: {
      sendMessage: message => { sent.push(message); return Promise.resolve(); },
      onMessage: { addListener() {} }
    } },
    document: {
      documentElement: { getAttribute: key => attributes.get(key) ?? null },
      querySelector: sel => (sel === 'video' ? { paused: videoPaused } : null)
    },
    location: { pathname: '/maddyson/videos/01a10d48-8960-7f24-aade-189d84b44b61' },
    window, MutationObserver,
    Date: { now: () => now },
    JSON,
    setInterval: fn => { intervalHandler = fn; return 1; },
    clearInterval: () => {}
  };
  vm.runInNewContext(source, context);
  sent.length = 0;

  listeners.get('popstate')({ state: {} });
  assert.equal(sent.filter(m => m.type === 'ROUTE').length, 0);

  now += 10000;
  intervalHandler();
  assert.equal(sent.filter(m => m.type === 'STATUS' && m.status === 'stale').length, 0);

  videoPaused = false;
  intervalHandler();
  assert.equal(sent.filter(m => m.type === 'STATUS' && m.status === 'stale').length, 1);
});

test('custom seek intercepts ArrowLeft and ArrowRight on VOD without modifying editable inputs', async () => {
  const source = await readFile(new URL('../extension/content.js', import.meta.url), 'utf8');
  const sent = [];
  const listeners = new Map();
  let storageChangeListener = null;
  const video = { currentTime: 50, duration: 100 };
  let createdElement = null;
  const document = {
    documentElement: { getAttribute: () => null, lang: 'en' },
    querySelector: sel => (sel === 'video' ? video : null),
    createElement: () => {
      createdElement = { style: {}, classList: { add() {} }, remove() {}, textContent: '' };
      return createdElement;
    },
    body: { appendChild() {} }
  };
  const window = {
    addEventListener: (name, handler) => listeners.set(name, handler),
    removeEventListener: name => listeners.delete(name)
  };
  class MutationObserver { observe() {} disconnect() {} }
  const context = {
    browser: {
      runtime: {
        sendMessage: message => { sent.push(message); return Promise.resolve(); },
        onMessage: { addListener() {} }
      },
      storage: {
        local: { get: () => Promise.resolve({ seekBackward: 10, seekForward: 30 }) },
        onChanged: { addListener: fn => { storageChangeListener = fn; } }
      }
    },
    document,
    location: { pathname: '/maddyson/videos/01a10d48-8960-7f24-aade-189d84b44b61' },
    window,
    MutationObserver,
    Date,
    JSON,
    setInterval: () => 1,
    clearInterval: () => {},
    setTimeout: () => 1,
    clearTimeout: () => {},
    Math,
    Number
  };
  vm.runInNewContext(source, context);

  const keydown = listeners.get('keydown');
  assert.ok(keydown, 'capturing keydown listener should be registered');

  function makeEvent(overrides) {
    let prevented = false;
    let stopped = false;
    return {
      key: 'ArrowLeft',
      target: { tagName: 'DIV' },
      preventDefault: () => { prevented = true; },
      stopImmediatePropagation: () => { stopped = true; },
      get isPrevented() { return prevented; },
      get isStopped() { return stopped; },
      ...overrides
    };
  }

  // 1. Normal ArrowLeft (default: -10s)
  const leftEv = makeEvent({ key: 'ArrowLeft' });
  keydown(leftEv);
  assert.equal(leftEv.isPrevented, true);
  assert.equal(leftEv.isStopped, true);
  assert.equal(video.currentTime, 40);

  // 2. Normal ArrowRight (default: +30s)
  const rightEv = makeEvent({ key: 'ArrowRight' });
  keydown(rightEv);
  assert.equal(rightEv.isPrevented, true);
  assert.equal(rightEv.isStopped, true);
  assert.equal(video.currentTime, 70);

  // 3. Clamping at upper bound
  const rightMax = makeEvent({ key: 'ArrowRight' });
  keydown(rightMax);
  assert.equal(video.currentTime, 100);

  // 4. Clamping at lower bound
  video.currentTime = 5;
  const leftMin = makeEvent({ key: 'ArrowLeft' });
  keydown(leftMin);
  assert.equal(video.currentTime, 0);

  // 5. Modifier keys should be ignored
  video.currentTime = 50;
  const shiftEv = makeEvent({ key: 'ArrowRight', shiftKey: true });
  keydown(shiftEv);
  assert.equal(shiftEv.isPrevented, false);
  assert.equal(video.currentTime, 50);

  const ctrlEv = makeEvent({ key: 'ArrowLeft', ctrlKey: true });
  keydown(ctrlEv);
  assert.equal(ctrlEv.isPrevented, false);
  assert.equal(video.currentTime, 50);

  // 6. Editable targets (inputs, textareas, contenteditable, dialog) should be ignored
  const inputEv = makeEvent({ key: 'ArrowLeft', target: { tagName: 'INPUT' } });
  keydown(inputEv);
  assert.equal(inputEv.isPrevented, false);
  assert.equal(video.currentTime, 50);

  const areaEv = makeEvent({ key: 'ArrowRight', target: { tagName: 'TEXTAREA' } });
  keydown(areaEv);
  assert.equal(areaEv.isPrevented, false);
  assert.equal(video.currentTime, 50);

  const editEv = makeEvent({ key: 'ArrowRight', target: { tagName: 'DIV', isContentEditable: true } });
  keydown(editEv);
  assert.equal(editEv.isPrevented, false);
  assert.equal(video.currentTime, 50);

  const modalEv = makeEvent({ key: 'ArrowRight', target: { tagName: 'DIV', closest: sel => sel.includes('dialog') ? true : null } });
  keydown(modalEv);
  assert.equal(modalEv.isPrevented, false);
  assert.equal(video.currentTime, 50);

  // 7. Dynamic settings update via storage change
  assert.ok(storageChangeListener);
  storageChangeListener({ seekBackward: { newValue: 5 }, seekForward: { newValue: 15 } }, 'local');

  const customLeft = makeEvent({ key: 'ArrowLeft' });
  keydown(customLeft);
  assert.equal(video.currentTime, 45); // 50 - 5 = 45

  const customRight = makeEvent({ key: 'ArrowRight' });
  keydown(customRight);
  assert.equal(video.currentTime, 60); // 45 + 15 = 60

  // 8. Consecutive seeks in the same direction accumulate in OSD text
  video.currentTime = 50;
  const left1 = makeEvent({ key: 'ArrowLeft' });
  keydown(left1);
  assert.equal(createdElement.textContent, '⟲ 5 s');

  const left2 = makeEvent({ key: 'ArrowLeft' });
  keydown(left2);
  assert.equal(createdElement.textContent, '⟲ 10 s');

  const left3 = makeEvent({ key: 'ArrowLeft' });
  keydown(left3);
  assert.equal(createdElement.textContent, '⟲ 15 s');

  // Switching direction resets accumulation to the new direction
  const right1 = makeEvent({ key: 'ArrowRight' });
  keydown(right1);
  assert.equal(createdElement.textContent, '⟳ 15 s');
});
