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
