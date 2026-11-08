/* global browser */
(function () {
  const routePattern = /^\/[^/?#]+\/videos\/[^/?#]+(?:\/|$)/;
  const nonSeekableRoles = new Set(['slider', 'textbox', 'combobox', 'listbox', 'menu', 'tab']);
  let routeKey = '';
  let routeSequence = 0;
  let isVod = false;
  let enabled = true;
  let patchStatus = 'checking';
  let lastMetricsAt = 0;
  let lastMetricsSentAt = 0;
  let metricsThrottleTimer = null;
  let observer = null;
  let rootObserver = null;
  let timer = null;
  let running = false;

  function send(message) {
    browser.runtime.sendMessage(message).catch(() => {});
  }

  function readMetrics(force = false) {
    const raw = document.documentElement?.getAttribute('data-kcf-buffer-v2');
    if (!raw) return;
    try {
      const value = JSON.parse(raw);
      if (value?.version !== 3 || !Number.isFinite(value.updatedAt)) return;
      const now = Date.now();
      const elapsed = now - lastMetricsSentAt;
      if (!force && elapsed < 1000) {
        if (!metricsThrottleTimer && typeof setTimeout === 'function') {
          metricsThrottleTimer = setTimeout(() => {
            metricsThrottleTimer = null;
            readMetrics(true);
          }, 1000 - elapsed);
        }
        return;
      }
      if (metricsThrottleTimer && typeof clearTimeout === 'function') {
        clearTimeout(metricsThrottleTimer);
        metricsThrottleTimer = null;
      }
      lastMetricsSentAt = now;
      lastMetricsAt = now;
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
    if (isVod) readMetrics(true);
  }

  function findVideo() {
    const list = typeof document.querySelectorAll === 'function' ? [...document.querySelectorAll('video')] : null;
    const fallback = document.querySelector?.('video');
    const videos = list || (fallback ? [fallback] : []);
    if (videos.length === 0) return null;
    for (const v of videos) {
      if (Number.isFinite(v?.duration) && v.duration > 0 && !v.paused) return v;
    }
    for (const v of videos) {
      if (Number.isFinite(v?.duration) && v.duration > 0) return v;
    }
    return videos[0];
  }

  function checkFreshness() {
    checkRoute();
    const video = findVideo();
    const isPaused = !video || Boolean(video.paused);
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
    observer = new MutationObserver(() => readMetrics(false));
    observer.observe(root, { attributes: true, attributeFilter: ['data-kcf-buffer-v2'] });
    readMetrics(true);
  }

  let seekBackward = 10;
  let seekForward = 30;
  let osdEl = null;
  let osdTimer = null;
  let osdAccumulated = 0;

  function parseSeek(value, fallback) {
    if (globalThis.KCFSeekUtils?.normalizeSeekSeconds) {
      return globalThis.KCFSeekUtils.normalizeSeekSeconds(value, fallback);
    }
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(1, Math.min(300, Math.round(num)));
  }

  function loadSettings() {
    browser.storage?.local?.get?.(['enabled', 'seekBackward', 'seekForward']).then(stored => {
      if (typeof stored?.enabled === 'boolean') {
        enabled = stored.enabled;
      }
      seekBackward = parseSeek(stored?.seekBackward, 10);
      seekForward = parseSeek(stored?.seekForward, 30);
    }).catch(() => {});
  }

  browser.storage?.onChanged?.addListener?.((changes, area) => {
    if (area === 'local') {
      if (changes.enabled && typeof changes.enabled.newValue === 'boolean') {
        enabled = changes.enabled.newValue;
      }
      if (changes.seekBackward) {
        seekBackward = parseSeek(changes.seekBackward.newValue, seekBackward);
      }
      if (changes.seekForward) {
        seekForward = parseSeek(changes.seekForward.newValue, seekForward);
      }
    }
  });

  function showSeekOsd(seconds, video) {
    video = video || findVideo();
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

    const unit = (typeof browser !== 'undefined' && browser.i18n?.getMessage?.('secondsUnit'))
      || ((document.documentElement?.lang || navigator?.language || '').startsWith('ru') ? 'сек' : 's');
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
    if (tag === 'input' || tag === 'textarea' || tag === 'select' || target.isContentEditable || target.dataset?.input) return true;
    const role = (typeof target.getAttribute === 'function' ? target.getAttribute('role') : target.role) || '';
    if (role && nonSeekableRoles.has(role.toLowerCase())) return true;
    if (typeof target.closest === 'function') {
      if (target.closest('[role="dialog"], [role="alertdialog"], [data-state="open"][role="dialog"], [role="slider"], [role="textbox"], [role="combobox"], [role="listbox"], [role="menu"], [role="tab"]')) return true;
    }
    return false;
  }

  function onKeyDown(event) {
    if (!isVod || !enabled) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    const target = (typeof event.composedPath === 'function' && event.composedPath()[0]) || event.target;
    if (isEditableTarget(target)) return;

    const video = findVideo();
    if (!video || !Number.isFinite(video.duration) || video.duration <= 0) return;

    event.preventDefault();
    event.stopImmediatePropagation?.();

    const isBackward = event.key === 'ArrowLeft';
    const delta = isBackward ? -seekBackward : seekForward;
    video.currentTime = Math.max(0, Math.min(video.duration, video.currentTime + delta));
    showSeekOsd(delta, video);
  }

  function onPopState() {
    checkRoute(false);
  }

  function start() {
    if (running) return;
    running = true;
    loadSettings();
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
    if (metricsThrottleTimer && typeof clearTimeout === 'function') {
      clearTimeout(metricsThrottleTimer);
      metricsThrottleTimer = null;
    }
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
