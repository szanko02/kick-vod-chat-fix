import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import { test } from 'node:test';

const flush = () => new Promise(resolve => setImmediate(resolve));

test('popup refreshes live diagnostics and renders localized metric substitutions', async () => {
  const source = await readFile(new URL('../extension/popup.js', import.meta.url), 'utf8');
  for (const locale of ['en', 'ru']) {
    const messages = JSON.parse(await readFile(new URL(`../extension/_locales/${locale}/messages.json`, import.meta.url), 'utf8'));
    const elements = Object.fromEntries(['enabled', 'status', 'reload', 'metrics', 'seekBackward', 'seekForward'].map(id => [id, {
      checked: false, disabled: false, textContent: '', value: '', listeners: {},
      matches: () => false,
      addEventListener(type, callback) { this.listeners[type] = callback; }
    }]));
    const sentMessages = [];
    const windowListeners = new Map();
    let timerCallback;
    let timerCleared = false;
    let calls = 0;
    let resolveFirst;
    let currentMetrics = { videoMs: 10000, displayMs: 8000, bufferMs: 15000, pages: 4, fetching: false, error: false };
    const context = {
      document: {
        getElementById: id => elements[id],
        querySelectorAll: () => [],
        documentElement: { lang: '' }
      },
      browser: {
        i18n: {
          getUILanguage: () => locale,
          getMessage(key, substitutions = []) {
            const value = messages[key]?.message || '';
            return value.replace(/\$(\d)/g, (_, index) => String(substitutions[Number(index) - 1] ?? ''));
          }
        },
        runtime: { sendMessage: message => {
          sentMessages.push(message);
          if (message.type !== 'GET_STATE') return Promise.resolve({ ok: true });
          calls++;
          const state = { enabled: true, status: 'healthy', isVod: true, metrics: currentMetrics, seekBackward: 15, seekForward: 45 };
          return calls === 1 ? new Promise(resolve => { resolveFirst = () => resolve(state); }) : Promise.resolve(state);
        } }
      },
      window: { addEventListener: (name, callback) => windowListeners.set(name, callback) },
      setInterval: callback => { timerCallback = callback; return 7; },
      clearInterval: id => { timerCleared = id === 7; },
      Promise, String, parseInt, Math, Number
    };
    vm.runInNewContext(source, context);
    assert.equal(calls, 1);
    timerCallback();
    assert.equal(calls, 1, 'poll does not overlap an in-flight refresh');
    resolveFirst();
    await flush();
    assert.equal(elements.seekBackward.value, 15);
    assert.equal(elements.seekForward.value, 45);
    assert.match(elements.metrics.textContent, /10\.0/);
    assert.match(elements.metrics.textContent, /8\.0/);
    assert.match(elements.metrics.textContent, /15\.0/);
    assert.match(elements.metrics.textContent, /4/);
    assert.doesNotMatch(elements.metrics.textContent, /[{}]/);
    assert.equal(context.document.documentElement.lang, locale);

    elements.seekBackward.value = '5';
    elements.seekForward.value = '25';
    elements.seekBackward.listeners.change();
    const seekMsg = sentMessages.find(m => m.type === 'SET_SEEK');
    assert.ok(seekMsg);
    assert.equal(seekMsg.type, 'SET_SEEK');
    assert.equal(seekMsg.seekBackward, 5);
    assert.equal(seekMsg.seekForward, 25);

    currentMetrics = { ...currentMetrics, videoMs: 12000, bufferMs: 17000 };
    timerCallback();
    await flush();
    assert.equal(calls, 2);
    assert.match(elements.metrics.textContent, /12\.0/);
    assert.match(elements.metrics.textContent, /17\.0/);
    windowListeners.get('pagehide')();
    assert.equal(timerCleared, true);
  }
});
