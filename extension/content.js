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
    if (!changed && force !== true) return;
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
    const video = document.querySelector?.('video');
    const isPaused = Boolean(video && video.paused);
    if (isVod && !isPaused && lastMetricsAt && Date.now() - lastMetricsAt > 5000 && patchStatus !== 'unsupported') {
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

  let seekBackward = 10;
  let seekForward = 30;
  let osdEl = null;
  let osdTimer = null;
  let osdAccumulated = 0;

  function loadSeekSettings() {
    browser.storage?.local?.get?.(['seekBackward', 'seekForward']).then(stored => {
      if (Number.isInteger(stored?.seekBackward) && stored.seekBackward >= 1 && stored.seekBackward <= 300) {
        seekBackward = stored.seekBackward;
      }
      if (Number.isInteger(stored?.seekForward) && stored.seekForward >= 1 && stored.seekForward <= 300) {
        seekForward = stored.seekForward;
      }
    }).catch(() => {});
  }

  browser.storage?.onChanged?.addListener?.((changes, area) => {
    if (area === 'local') {
      if (changes.seekBackward && Number.isInteger(changes.seekBackward.newValue)) {
        seekBackward = Math.max(1, Math.min(300, changes.seekBackward.newValue));
      }
      if (changes.seekForward && Number.isInteger(changes.seekForward.newValue)) {
        seekForward = Math.max(1, Math.min(300, changes.seekForward.newValue));
      }
    }
  });

  function showSeekOsd(seconds) {
    const video = document.querySelector?.('video');
    if (!video || typeof document.createElement !== 'function') return;

    if (osdEl && osdEl.style?.opacity !== '0' && ((osdAccumulated > 0 && seconds > 0) || (osdAccumulated < 0 && seconds < 0))) {
      osdAccumulated += seconds;
    } else {
      osdAccumulated = seconds;
    }

    if (!osdEl) {
      osdEl = document.createElement('div');
      osdEl.className = 'kcf-seek-osd';
      Object.assign(osdEl.style, {
        background: 'rgba(0, 0, 0, 0.78)',
        color: '#53fc18',
        fontSize: '20px',
        fontWeight: '700',
        padding: '10px 22px',
        borderRadius: '8px',
        pointerEvents: 'none',
        zIndex: '999999',
        userSelect: 'none',
        fontFamily: 'system-ui, sans-serif',
        boxShadow: '0 4px 14px rgba(0, 0, 0, 0.6)',
        transition: 'opacity 0.25s ease',
        transform: 'translate(-50%, -50%)',
        textAlign: 'center',
        lineHeight: '1'
      });
    }

    const isRu = (document.documentElement?.lang || navigator?.language || '').startsWith('ru');
    const unit = isRu ? 'сек' : 's';
    const text = osdAccumulated < 0 ? `⟲ ${Math.abs(osdAccumulated)} ${unit}` : `⟳ ${osdAccumulated} ${unit}`;
    osdEl.textContent = text;
    osdEl.style.opacity = '1';

    const fullscreen = document.fullscreenElement;
    if (fullscreen) {
      osdEl.style.position = 'absolute';
      osdEl.style.top = '50%';
      osdEl.style.left = '50%';
      if (osdEl.parentElement !== fullscreen && typeof fullscreen.appendChild === 'function') fullscreen.appendChild(osdEl);
    } else if (document.body) {
      const rect = typeof video.getBoundingClientRect === 'function'
        ? video.getBoundingClientRect()
        : { top: 0, left: 0, width: 0, height: 0 };
      osdEl.style.position = 'fixed';
      osdEl.style.top = `${rect.top + rect.height / 2}px`;
      osdEl.style.left = `${rect.left + rect.width / 2}px`;
      if (osdEl.parentElement !== document.body && typeof document.body.appendChild === 'function') document.body.appendChild(osdEl);
    }

    if (typeof clearTimeout === 'function') clearTimeout(osdTimer);
    if (typeof setTimeout === 'function') {
      osdTimer = setTimeout(() => {
        if (osdEl) osdEl.style.opacity = '0';
        osdTimer = setTimeout(() => {
          osdEl?.remove();
          osdEl = null;
          osdAccumulated = 0;
        }, 250);
      }, 750);
    }
  }

  function isEditableTarget(target) {
    if (!target) return false;
    const tag = (target.tagName ? target.tagName : '').toLowerCase();
    if (tag === 'input' || tag === 'textarea' || target.isContentEditable || target.dataset?.input) return true;
    if (typeof target.closest === 'function' && target.closest('[role="dialog"], [role="alertdialog"], [data-state="open"][role="dialog"]')) return true;
    return false;
  }

  function onKeyDown(event) {
    if (!isVod || patchStatus === 'disabled') return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (isEditableTarget(event.target)) return;

    const video = document.querySelector?.('video');
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

    event.preventDefault();
    event.stopImmediatePropagation?.();

    const isBackward = event.key === 'ArrowLeft';
    const delta = isBackward ? -seekBackward : seekForward;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    showSeekOsd(delta);
  }

  function onPopState() {
    checkRoute(false);
  }

  function start() {
    if (running) return;
    running = true;
    loadSeekSettings();
    checkRoute(true);
    observeMetrics();
    timer = setInterval(checkFreshness, 1000);
    window.addEventListener('popstate', onPopState);
    window.addEventListener('keydown', onKeyDown, true);
  }

  function stop() {
    if (!running) return;
    running = false;
    clearInterval(timer);
    timer = null;
    if (typeof clearTimeout === 'function') clearTimeout(osdTimer);
    osdEl?.remove();
    osdEl = null;
    osdAccumulated = 0;
    observer?.disconnect();
    observer = null;
    rootObserver?.disconnect();
    rootObserver = null;
    window.removeEventListener('popstate', onPopState);
    window.removeEventListener('keydown', onKeyDown, true);
  }

  browser.runtime.onMessage.addListener(onPatchStatus);
  window.addEventListener('pagehide', stop);
  window.addEventListener('pageshow', start);
  start();
})();
