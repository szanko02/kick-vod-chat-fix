/* global browser */
const statusIds = {
  checking: 'statusChecking', inactive: 'statusInactive', applied: 'statusApplied',
  healthy: 'statusHealthy', stale: 'statusStale', unsupported: 'statusUnsupported',
  disabled: 'statusDisabled'
};
const enabledInput = document.getElementById('enabled');
const statusText = document.getElementById('status');
const reloadButton = document.getElementById('reload');
const metricsText = document.getElementById('metrics');
let refreshing = false;
let closed = false;

for (const node of document.querySelectorAll('[data-i18n]'))
  node.textContent = browser.i18n.getMessage(node.dataset.i18n);
document.documentElement.lang = browser.i18n.getUILanguage().startsWith('ru') ? 'ru' : 'en';

function showMetrics(metrics) {
  if (!metrics) {
    metricsText.textContent = browser.i18n.getMessage('metricsNone');
    return;
  }
  const seconds = value => value === null ? '—' : (value / 1000).toFixed(1);
  metricsText.textContent = browser.i18n.getMessage('metricsSummary', [
    seconds(metrics.videoMs), seconds(metrics.displayMs), seconds(metrics.bufferMs),
    String(metrics.pages),
    browser.i18n.getMessage(metrics.fetching ? 'fetchingYes' : 'fetchingNo'),
    browser.i18n.getMessage(metrics.error ? 'errorYes' : 'errorNo')
  ]);
}

async function refresh() {
  if (refreshing || closed) return;
  refreshing = true;
  try {
  const state = await browser.runtime.sendMessage({ type: 'GET_STATE' });
  if (closed) return;
  enabledInput.checked = state.enabled;
  const key = statusIds[state.status] || 'statusChecking';
  statusText.textContent = browser.i18n.getMessage(key);
  reloadButton.disabled = !state.isVod;
  showMetrics(state.metrics);
  } finally {
    refreshing = false;
  }
}

enabledInput.addEventListener('change', () => {
  browser.runtime.sendMessage({ type: 'SET_ENABLED', enabled: enabledInput.checked }).then(refresh);
});
reloadButton.addEventListener('click', async () => {
  const result = await browser.runtime.sendMessage({ type: 'RELOAD_VOD' });
  if (!result?.ok) statusText.textContent = browser.i18n.getMessage('reloadFailed');
});
refresh().catch(() => {
  statusText.textContent = browser.i18n.getMessage('statusChecking');
});
const refreshTimer = setInterval(() => refresh().catch(() => {}), 1000);
window.addEventListener('pagehide', () => {
  closed = true;
  clearInterval(refreshTimer);
}, { once: true });
