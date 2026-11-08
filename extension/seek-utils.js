(function (root) {
  function normalizeSeekSeconds(value, fallback = 10) {
    if (value === '' || value === null || value === undefined) return fallback;
    const num = Number(value);
    if (!Number.isFinite(num)) return fallback;
    return Math.max(1, Math.min(300, Math.round(num)));
  }

  root.KCFSeekUtils = { normalizeSeekSeconds };
})(typeof globalThis !== 'undefined' ? globalThis : this);
