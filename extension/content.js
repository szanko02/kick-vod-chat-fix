/* global browser */
(function () {
  const routePattern = /^\/[^/?#]+\/videos\/[^/?#]+(?:\/|$)/;
  let routeKey = '';
  let routeSequence = 0;
  let isVod = false;
  let patchStatus = 'checking';
  let lastMetricsAt = 0;
  let observer = null;
  let rootObserver = null;
  let timer = null;
  let running = false;

  function send(message) {
    browser.runtime.sendMessage(message).catch(() => {});
  }

  function readMetrics() {
    const raw = document.documentElement?.getAttribute('data-kcf-buffer-v2');
    if (!raw) return;
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 3 || !Number.isFinite(value.updatedAt)) return;
      const metrics = {
        version: 3,
        videoMs: Number.isFinite(value.videoMs) ? value.videoMs : null,
        displayMs: Number.isFinite(value.displayMs) ? value.displayMs : null,
        bufferMs: Number.isFinite(value.bufferMs) ? value.bufferMs : null,
        pages: Number.isInteger(value.pages) ? Math.max(0, value.pages) : 0,
        fetching: Boolean(value.fetching),
        error: Boolean(value.error),
        updatedAt: value.updatedAt
      };
      lastMetricsAt = Date.now();
      patchStatus = metrics.bufferMs !== null && metrics.bufferMs >= 10000 ? 'healthy' : 'applied';
      send({ type: 'METRICS', metrics });
    } catch { /* malformed page attributes are ignored */ }
  }

  function checkRoute(force = false) {
    const nextKey = `${location.pathname}`;
    const changed = nextKey !== routeKey;
    if (!changed && !force) return;
    routeKey = nextKey;
    routeSequence++;
    isVod = routePattern.test(location.pathname);
    if (changed) {
      patchStatus = isVod ? 'checking' : 'inactive';
      lastMetricsAt = 0;
    }
    send({ type: 'ROUTE', isVod, routeSequence });
    if (isVod) readMetrics();
  }

  function checkFreshness() {
    checkRoute();
    if (isVod && lastMetricsAt && Date.now() - lastMetricsAt > 5000 && patchStatus !== 'unsupported') {
      patchStatus = 'stale';
      send({ type: 'STATUS', status: 'stale' });
    }
  }

  function onPatchStatus(message) {
    if (!isVod || !['applied', 'unsupported'].includes(message.status)) return;
    patchStatus = message.status;
    if (message.status === 'applied' && !lastMetricsAt) lastMetricsAt = Date.now();
  }

  function observeMetrics() {
    const root = document.documentElement;
    if (!root) {
      rootObserver = new MutationObserver(() => {
        if (!document.documentElement) return;
        rootObserver?.disconnect();
        rootObserver = null;
        observeMetrics();
      });
      rootObserver.observe(document, { childList: true, subtree: true });
      return;
    }
    observer = new MutationObserver(readMetrics);
    observer.observe(root, { attributes: true, attributeFilter: ['data-kcf-buffer-v2'] });
    readMetrics();
  }

  function start() {
    if (running) return;
    running = true;
    checkRoute(true);
    observeMetrics();
    timer = setInterval(checkFreshness, 1000);
    window.addEventListener('popstate', checkRoute);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearInterval(timer);
    timer = null;
    observer?.disconnect();
    observer = null;
    rootObserver?.disconnect();
    rootObserver = null;
    window.removeEventListener('popstate', checkRoute);
  }

  browser.runtime.onMessage.addListener(onPatchStatus);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  start();
})();
