/* Storage adapter.

   The app can run in three very different places:
     - a normal origin (hosted or localhost)  -> localStorage, durable
     - inside a framed preview / sandbox      -> localStorage may throw, or the
                                                 browser may clear it between visits
     - a private window with storage blocked  -> localStorage throws

   Losing a workout log silently is the worst possible failure, so this layer
   never pretends: it reports exactly what it can guarantee, and the UI says so. */

const PROBE_KEY = '__ppl_probe__';
const STAMP_KEY = 'ppl.stamp';

let backend = 'memory';     // 'local' | 'memory'
let memoryValue = null;     // session-only fallback so the app still runs
let lastError = null;

/* True when this document is running inside another page (the artifact
   viewer, an embed). Framed storage is partitioned and browsers — iOS Safari
   especially — evict it aggressively, so it is never dependable. */
export const IS_FRAMED = (() => {
  try { return window.top !== window.self; } catch (e) { return true; }
})();

function probeLocalStorage() {
  try {
    localStorage.setItem(PROBE_KEY, '1');
    const ok = localStorage.getItem(PROBE_KEY) === '1';
    localStorage.removeItem(PROBE_KEY);
    return ok;
  } catch (err) {
    lastError = err;
    return false;
  }
}

export function initStorage() {
  backend = probeLocalStorage() ? 'local' : 'memory';
  return backend;
}

export function storageBackend() { return backend; }
export function storageError() { return lastError; }

/* Writes survive a reload. Only true for a real origin we could write to. */
export function canPersist() { return backend === 'local'; }

/* Writes survive closing the app. Framed storage passes the write test but
   gets cleared out from under us, so it does not count as durable. */
export function isDurable() { return backend === 'local' && !IS_FRAMED; }

export function readRaw(key) {
  if (backend !== 'local') return memoryValue;
  try {
    return localStorage.getItem(key);
  } catch (err) {
    lastError = err;
    backend = 'memory';
    return memoryValue;
  }
}

export function writeRaw(key, text) {
  memoryValue = text;
  if (backend !== 'local') return false;
  try {
    localStorage.setItem(key, text);
    return true;
  } catch (err) {
    lastError = err;
    // Quota or a mid-session permission change: keep running from memory
    // rather than throwing away what the user is in the middle of logging.
    backend = 'memory';
    return false;
  }
}

export function removeRaw(key) {
  memoryValue = null;
  if (backend !== 'local') return;
  try { localStorage.removeItem(key); } catch (err) { lastError = err; }
}

/* Did a previous visit write here? Distinguishes "first ever launch" from
   "storage was wiped between visits", which look identical otherwise. */
export function hadPreviousVisit() {
  if (backend !== 'local') return false;
  try { return localStorage.getItem(STAMP_KEY) !== null; } catch (e) { return false; }
}

export function stampVisit() {
  if (backend !== 'local') return;
  try { localStorage.setItem(STAMP_KEY, String(Date.now())); } catch (e) { /* not critical */ }
}

/* Ask the browser to exempt us from routine eviction. Best effort. */
export function requestPersistence() {
  if (!navigator.storage || !navigator.storage.persist) return;
  navigator.storage.persisted()
    .then((granted) => (granted ? true : navigator.storage.persist()))
    .catch(() => {});
}
