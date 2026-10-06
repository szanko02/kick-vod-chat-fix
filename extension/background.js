/* global browser */
(function () {
  const MAX_RESPONSE = 2 * 1024 * 1024;
  const MAX_BUFFERED = 16 * 1024 * 1024;
  const RESPONSE_TIMEOUT_MS = 6000;
  const CONTRACT_WAIT_MS = 1200;
  const enabledState = { ready: false, enabled: false };
  const bufferedRequests = new Map();
  const pageStates = new Map();
  const verifiedContracts = new Set();
  const contractWaiters = new Map();
  let bufferedTotal = 0;
  let persistedEnabled = true;
  let enabledRevision = 0;
  let storageQueue = Promise.resolve();
  let storageReadyPromise = Promise.resolve();

  function badge(tabId, status) {
    const badgeData = {
      inactive: ['', '#777777'],
      applied: ['…', '#b7791f'],
      healthy: ['OK', '#208547'],
      stale: ['?', '#777777'],
      unsupported: ['!', '#b3261e'],
      disabled: ['', '#777777'],
      checking: ['', '#777777']
    }[status] || ['', '#777777'];
    browser.browserAction.setBadgeText({ tabId, text: badgeData[0] });
    browser.browserAction.setBadgeBackgroundColor({ tabId, color: badgeData[1] });
  }

  function notifyPatchStatus(tabId, status) {
    browser.tabs.sendMessage(tabId, { type: 'PATCH_STATUS', status }).catch(() => {});
  }

  function sendStatus(tabId, status) {
    if (!Number.isInteger(tabId) || tabId < 0) return;
    const previous = pageStates.get(tabId) || {};
    const sourceStatus = status === 'applied' || status === 'unsupported' ? status : previous.sourceStatus;
    const visibleStatus = status === 'inactive' || !previous.isVod ? 'inactive'
      : !enabledState.enabled ? 'disabled' : status;
    pageStates.set(tabId, { ...previous, sourceStatus, status: visibleStatus, updatedAt: Date.now() });
    badge(tabId, visibleStatus);
    if (previous.isVod && enabledState.enabled && (status === 'applied' || status === 'unsupported'))
      notifyPatchStatus(tabId, status);
  }

  function release(requestId, state) {
    if (state.released) return;
    state.released = true;
    clearTimeout(state.timer);
    bufferedTotal = Math.max(0, bufferedTotal - state.bytes);
    state.bytes = 0;
    state.chunks.length = 0;
    bufferedRequests.delete(requestId);
  }

  function toArrayBuffer(bytes) {
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }

  function writeOriginal(state, disconnect, finalChunk) {
    if (state.released) return;
    try {
      for (const chunk of state.chunks) state.filter.write(toArrayBuffer(chunk));
      if (finalChunk) state.filter.write(toArrayBuffer(finalChunk));
      if (disconnect) state.filter.disconnect();
      else state.filter.close();
    } catch {
      try { state.filter.disconnect(); } catch { /* stream already ended */ }
    } finally {
      release(state.requestId, state);
    }
  }

  function waitForContract(tabId) {
    if (verifiedContracts.has(tabId)) return Promise.resolve(true);
    return new Promise(resolve => {
      const waiters = contractWaiters.get(tabId) || [];
      const waiter = { resolve, timer: setTimeout(() => finish(false), CONTRACT_WAIT_MS) };
      function finish(value) {
        clearTimeout(waiter.timer);
        const current = contractWaiters.get(tabId) || [];
        const next = current.filter(item => item !== waiter);
        if (next.length) contractWaiters.set(tabId, next);
        else contractWaiters.delete(tabId);
        resolve(value);
      }
      waiter.finish = finish;
      waiters.push(waiter);
      contractWaiters.set(tabId, waiters);
    });
  }

  function markContract(tabId) {
    if (!Number.isInteger(tabId) || tabId < 0) return;
    verifiedContracts.add(tabId);
    for (const waiter of contractWaiters.get(tabId) || []) waiter.finish(true);
    contractWaiters.delete(tabId);
  }

  async function finishResponse(state) {
    if (state.released) return;
    try {
      const bytes = new Uint8Array(state.bytes);
      let offset = 0;
      for (const chunk of state.chunks) {
        bytes.set(chunk, offset);
        offset += chunk.byteLength;
      }
      const text = new TextDecoder('utf-8', { fatal: true }).decode(bytes);

      if (browser.runtime.getManifest && rootContract(text)) markContract(state.tabId);
      let contractVerified = verifiedContracts.has(state.tabId);
      if (!contractVerified && text.includes('"ChatroomReplayEntries"'))
        contractVerified = await waitForContract(state.tabId);
      if (state.released) return;
      if (!enabledState.enabled) {
        state.filter.write(toArrayBuffer(bytes));
        state.filter.close();
        return;
      }

      const result = rootRewrite(text, contractVerified);
      if (result.status === 'applied') {
        const encoded = new TextEncoder().encode(result.source);
        state.filter.write(toArrayBuffer(encoded));
        sendStatus(state.tabId, 'applied');
      } else {
        state.filter.write(toArrayBuffer(bytes));
        if (result.status === 'unsupported') sendStatus(state.tabId, 'unsupported');
      }
      state.filter.close();
    } catch {
      try {
        for (const chunk of state.chunks) state.filter.write(toArrayBuffer(chunk));
        state.filter.close();
      } catch {
        try { state.filter.disconnect(); } catch { /* stream already ended */ }
      }
    } finally {
      release(state.requestId, state);
    }
  }

  function rootContract(text) {
    return globalThis.KCFSourceRewrite.detectQueryContract(text) !== null;
  }

  function rootRewrite(text, contractVerified) {
    return globalThis.KCFSourceRewrite.adaptBundleSource(text, { contractVerified });
  }

  function intercept(details) {
    if (!enabledState.ready || !enabledState.enabled || details.tabId < 0 || details.frameId !== 0 ||
        !/^https:\/\/kick\.com\//.test(details.documentUrl || '') ||
        !/^https:\/\/assets\.kick\.com\/main\/_next\/static\/chunks\/[^/?#]+\.js(?:[?#]|$)/.test(details.url))
      return;

    let filter;
    try { filter = browser.webRequest.filterResponseData(details.requestId); }
    catch { return; }
    const state = {
      requestId: details.requestId,
      tabId: details.tabId,
      filter,
      chunks: [],
      bytes: 0,
      released: false,
      timer: null
    };
    bufferedRequests.set(details.requestId, state);
    state.timer = setTimeout(() => writeOriginal(state, true), RESPONSE_TIMEOUT_MS);
    filter.ondata = event => {
      if (state.released) return;
      const chunk = new Uint8Array(event.data).slice();
      if (state.bytes + chunk.byteLength > MAX_RESPONSE || bufferedTotal + chunk.byteLength > MAX_BUFFERED) {
        writeOriginal(state, true, chunk);
        return;
      }
      state.chunks.push(chunk);
      state.bytes += chunk.byteLength;
      bufferedTotal += chunk.byteLength;
    };
    filter.onstop = () => { void finishResponse(state); };
    filter.onerror = () => {
      try { filter.disconnect(); } catch { /* stream already ended */ }
      release(details.requestId, state);
    };
  }

  function clearTab(tabId) {
    for (const [requestId, state] of bufferedRequests) {
      if (state.tabId === tabId) writeOriginal(state, true);
    }
    pageStates.delete(tabId);
    verifiedContracts.delete(tabId);
    for (const waiter of contractWaiters.get(tabId) || []) waiter.finish(false);
    contractWaiters.delete(tabId);
  }

  function applyEnabled(enabled) {
    enabledState.enabled = enabled;
    enabledState.ready = true;
    if (!enabled) {
      for (const state of bufferedRequests.values()) writeOriginal(state, true);
      for (const [id, page] of pageStates) {
        page.status = page.isVod ? 'disabled' : 'inactive';
        badge(id, page.status);
      }
      return;
    }
    for (const [id, page] of pageStates) {
      if (!page.isVod) continue;
      page.status = page.sourceStatus || 'checking';
      badge(id, page.status);
    }
  }

  async function setEnabled(enabled) {
    await storageReadyPromise;
    const revision = ++enabledRevision;
    applyEnabled(enabled);
    const write = storageQueue.catch(() => {}).then(() => browser.storage.local.set({ enabled }));
    storageQueue = write;
    try {
      await write;
      persistedEnabled = enabled;
      if (revision === enabledRevision) applyEnabled(enabled);
      return { ok: true, enabled: enabledState.enabled };
    } catch {
      if (revision === enabledRevision) applyEnabled(persistedEnabled);
      return { ok: false, enabled: enabledState.enabled };
    }
  }

  function isKickTopFrame(sender) {
    try {
      return Boolean(sender.tab) && sender.frameId === 0 &&
        new URL(sender.url).hostname === 'kick.com';
    } catch { return false; }
  }

  function isKickVodUrl(value) {
    try {
      const url = new URL(value);
      return url.hostname === 'kick.com' && /^\/[^/?#]+\/videos\/[^/?#]+(?:\/|$)/.test(url.pathname);
    } catch { return false; }
  }

  function isPopup(sender) {
    try {
      const url = new URL(sender.url);
      const expected = new URL(browser.runtime.getURL('popup.html'));
      return sender.id === browser.runtime.id && url.protocol === expected.protocol &&
        url.hostname === expected.hostname && url.pathname === expected.pathname;
    } catch { return false; }
  }

  browser.webRequest.onBeforeRequest.addListener(intercept, {
    urls: ['https://assets.kick.com/main/_next/static/chunks/*.js'],
    types: ['script']
  }, ['blocking']);
  browser.webRequest.onBeforeRequest.addListener(details => {
    if (details.type === 'main_frame' && details.tabId >= 0) clearTab(details.tabId);
  }, { urls: ['https://kick.com/*'], types: ['main_frame'] });
  browser.tabs.onRemoved.addListener(clearTab);
  browser.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'loading') clearTab(tabId);
  });

  browser.runtime.onMessage.addListener((message, sender) => {
    const tabId = sender.tab?.id;
    if (message?.type === 'ROUTE' && Number.isInteger(tabId) && isKickTopFrame(sender) &&
        typeof message.isVod === 'boolean' && Number.isInteger(message.routeSequence)) {
      const state = pageStates.get(tabId) || {};
      const routeChanged = state.routeSequence !== message.routeSequence;
      const next = { ...state, routeSequence: message.routeSequence, isVod: message.isVod };
      if (routeChanged) {
        next.status = message.isVod ? enabledState.enabled ? next.sourceStatus || 'checking' : 'disabled' : 'inactive';
        next.metrics = null;
      }
      if (!enabledState.enabled && message.isVod) next.status = 'disabled';
      pageStates.set(tabId, next);
      if (!message.isVod) sendStatus(tabId, 'inactive');
      else if (next.sourceStatus) sendStatus(tabId, next.sourceStatus);
      else badge(tabId, next.status || 'checking');
      return Promise.resolve({ ok: true });
    }
    if (message?.type === 'METRICS' && Number.isInteger(tabId) && isKickTopFrame(sender) && enabledState.enabled && message.metrics &&
        message.metrics.version === 3 && Number.isFinite(message.metrics.updatedAt)) {
      const safeMetrics = {
        videoMs: Number.isFinite(message.metrics.videoMs) ? message.metrics.videoMs : null,
        displayMs: Number.isFinite(message.metrics.displayMs) ? message.metrics.displayMs : null,
        bufferMs: Number.isFinite(message.metrics.bufferMs) ? message.metrics.bufferMs : null,
        pages: Number.isInteger(message.metrics.pages) ? Math.max(0, message.metrics.pages) : 0,
        fetching: Boolean(message.metrics.fetching),
        error: Boolean(message.metrics.error),
        updatedAt: message.metrics.updatedAt
      };
      const previous = pageStates.get(tabId) || {};
      const status = previous.sourceStatus === 'unsupported' ? 'unsupported'
        : Date.now() - safeMetrics.updatedAt > 5000 ? 'stale'
        : safeMetrics.bufferMs !== null && safeMetrics.bufferMs >= 10000 ? 'healthy'
        : 'applied';
      pageStates.set(tabId, { ...previous, metrics: safeMetrics, status, isVod: true });
      badge(tabId, status);
      return Promise.resolve({ ok: true });
    }
    if (message?.type === 'STATUS' && Number.isInteger(tabId) && isKickTopFrame(sender) &&
        ['stale', 'applied', 'unsupported', 'inactive'].includes(message.status)) {
      sendStatus(tabId, message.status);
      return Promise.resolve({ ok: true });
    }

    if (message?.type === 'SET_ENABLED' && isPopup(sender) && typeof message.enabled === 'boolean') {
      return setEnabled(message.enabled);
    }
    if (message?.type === 'GET_STATE' && isPopup(sender)) return activeState();
    if (message?.type === 'RELOAD_VOD' && isPopup(sender)) return reloadActiveVod();
    return undefined;
  });

  async function activeState() {
    await storageReadyPromise;
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const tabId = tab?.id;
    const page = Number.isInteger(tabId) ? pageStates.get(tabId) || {} : {};
    const isVod = Boolean(page.isVod && isKickVodUrl(tab?.url));
    return {
      enabled: enabledState.enabled,
      status: !isVod ? 'inactive' : enabledState.enabled ? page.status || 'checking' : 'disabled',
      isVod,
      metrics: isVod ? page.metrics || null : null
    };
  }

  async function reloadActiveVod() {
    const tabs = await browser.tabs.query({ active: true, currentWindow: true });
    const tab = tabs[0];
    const state = tab && pageStates.get(tab.id);
    if (!tab || !isKickVodUrl(tab.url) || !state?.isVod)
      return { ok: false, reason: 'not-vod' };
    await browser.tabs.reload(tab.id);
    return { ok: true };
  }

  browser.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && changes.enabled) {
      persistedEnabled = changes.enabled.newValue === true;
      if (enabledRevision === 0 || persistedEnabled === enabledState.enabled)
        applyEnabled(persistedEnabled);
    }
  });

  storageReadyPromise = browser.storage.local.get('enabled').then(values => {
    persistedEnabled = values.enabled !== false;
    applyEnabled(persistedEnabled);
  }).catch(() => applyEnabled(false));
})();
