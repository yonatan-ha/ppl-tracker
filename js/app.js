/* Router + bootstrap. Hash routes keep the iOS back-swipe working. */

import {
  loadState, state, saveNow, todayISO, loadFailure,
  discardCorruptData, exportRawBackup, exportJSON, importJSON, hasSaveError
} from './store.js';
import { isDurable, canPersist, IS_FRAMED } from './storage.js';
import {
  closeSheet, isSheetOpen, icon, esc, toast, toastSaveResult, confirmSheet, withBusy, paintBrandMarks
} from './ui.js';
import { renderCalendar } from './calendar.js';
import { renderStats } from './stats.js';
import { renderSessionDetail } from './session.js';
import { renderEditor, startLogFlow } from './editor.js';
import { renderTemplateList, renderTemplateEditor, renderSetup } from './templates.js';
import { renderSettings } from './settings.js';

const view = document.getElementById('view');
const tabbar = document.getElementById('tabbar');

export function go(hash, replace) {
  if (replace) location.replace(hash);
  else location.hash = hash;
}

export function back(fallback = '#/') {
  if (history.length > 1) history.back();
  else go(fallback, true);
}

function parseRoute() {
  const raw = (location.hash || '#/').slice(1);
  const [path, query] = raw.split('?');
  const parts = path.split('/').filter(Boolean);
  const params = {};
  new URLSearchParams(query || '').forEach((v, k) => { params[k] = v; });
  return { parts, params };
}

const FULLSCREEN = new Set(['log', 'setup', 'workouts']);

function render() {
  const { parts, params } = parseRoute();
  const root = parts[0] || '';

  // Unreadable save file: stop here rather than silently starting over.
  if (loadFailure && loadFailure.reason === 'corrupt') {
    renderRecovery(view);
    tabbar.classList.add('hidden');
    view.classList.add('no-tabs');
    return;
  }

  // Force first-run setup until at least one workout exists.
  if (!state.settings.setupDone && state.templates.length === 0 && root !== 'setup') {
    go('#/setup', true);
    return;
  }

  view.scrollTop = 0;
  window.scrollTo(0, 0);

  // Replay the enter animation so a route change reads as movement.
  view.classList.remove('view-enter');
  void view.offsetWidth;
  view.classList.add('view-enter');

  switch (root) {
    case '':        renderCalendar(view, params); break;
    case 'stats':   renderStats(view, params); break;
    case 'settings': renderSettings(view, params); break;
    case 'setup':   renderSetup(view, params); break;
    case 'workouts':
      if (parts[1]) renderTemplateEditor(view, parts[1], params);
      else renderTemplateList(view, params);
      break;
    case 'session': renderSessionDetail(view, parts[1]); break;
    case 'log':     renderEditor(view, parts[1] || null, params); break;
    default:        go('#/', true); return;
  }

  // On phones a full-screen flow hides the bar; the desktop sidebar stays put
  // (CSS keeps it visible) so you never lose your bearings on a wide screen.
  const full = FULLSCREEN.has(root) || (root === 'log');
  tabbar.classList.toggle('hidden', full);
  view.classList.toggle('no-tabs', full);

  tabbar.querySelectorAll('[data-nav]').forEach((b) => {
    const target = b.dataset.nav === '#/' ? '' : b.dataset.nav.slice(2);
    b.classList.toggle('active', target === root);
    if (target === root) b.setAttribute('aria-current', 'page');
    else b.removeAttribute('aria-current');
  });

  renderStorageWarning(root);
}

/* ---------------- storage warnings ---------------- */

const WARN_DISMISSED = 'ppl.warnDismissed';
let warnDismissed = false;

/* Only ever shown when saving genuinely can't be relied on. Silence here would
   mean losing a training log without ever being told. */
function storageProblem() {
  // Evidence beats prediction: storage worked on a previous visit and is empty
  // now, so the browser actually cleared it rather than this being a first run.
  if (loadFailure && loadFailure.reason === 'evicted') {
    return {
      key: 'blocked',
      title: 'Your saved data was cleared',
      body: 'The browser wiped this app’s storage since your last visit — that’s a limit of running it as a preview, not something you did. Restore a backup below, and install the standalone copy to stop it happening again.'
    };
  }
  if (!canPersist() || hasSaveError()) {
    return {
      key: 'blocked',
      title: 'This copy can’t save',
      body: 'Storage is blocked here, so anything you log disappears when you close the app. Export a backup before you leave, and use the installed copy to keep data.'
    };
  }
  if (!isDurable()) {
    return {
      key: 'framed',
      title: 'Preview — data may not stick',
      body: 'Inside this preview the browser can clear saved data between visits. For a workout log you keep, install the standalone copy. Export a backup any time.'
    };
  }
  return null;
}

function renderStorageWarning(root) {
  document.getElementById('storage-warning')?.remove();
  if (warnDismissed || root === 'log') return;

  const problem = storageProblem();
  if (!problem) return;
  // On the setup screen, only interrupt for the serious case — you should know
  // before typing in every exercise that it won't be kept.
  if (root === 'setup' && problem.key !== 'blocked') return;

  const bar = document.createElement('div');
  bar.id = 'storage-warning';
  bar.className = `warn-bar ${problem.key === 'blocked' ? 'warn-hard' : ''}`;
  bar.innerHTML = `
    <div class="warn-main">
      <strong>${esc(problem.title)}</strong>
      <span>${esc(problem.body)}</span>
    </div>
    <div class="warn-actions">
      <button class="mini-btn" data-warn-export>Export backup</button>
      <button class="mini-btn" data-warn-import>Restore</button>
      <button class="icon-btn plain" data-warn-close aria-label="Dismiss">${icon('close')}</button>
    </div>
    <input type="file" accept="application/json,.json" hidden data-warn-file>`;

  view.prepend(bar);

  bar.querySelector('[data-warn-export]').addEventListener('click', (e) =>
    withBusy(e.currentTarget, 'Exporting…', async () => {
      toastSaveResult(await exportJSON(), 'Backup saved');
    }));

  const file = bar.querySelector('[data-warn-file]');
  bar.querySelector('[data-warn-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', () => restoreFromFile(file, bar.querySelector('[data-warn-import]')));

  bar.querySelector('[data-warn-close]').addEventListener('click', () => {
    warnDismissed = true;
    try { sessionStorage.setItem(WARN_DISMISSED, '1'); } catch (e) { /* fine */ }
    bar.remove();
  });
}

async function restoreFromFile(input, button) {
  const f = input.files && input.files[0];
  if (!f) return;
  const run = async () => {
    try {
      importJSON(await f.text());
      toast('Backup restored', 'ok');
      location.hash = '#/';
      render();
    } catch (err) {
      console.error(err);
      toast(`Couldn’t read ${f.name} — is it a PPL backup?`, 'error');
    }
    input.value = '';
  };
  return button ? withBusy(button, 'Restoring…', run) : run();
}

/* ---------------- unreadable save file ---------------- */

function renderRecovery(target) {
  target.innerHTML = `
    <div class="hero" style="padding-top:48px">
      <h1>Your saved data couldn’t be read</h1>
      <p>Nothing has been deleted — the app has stopped writing so the original file stays intact. Download it first, then restore a backup or start over.</p>
    </div>
    <div class="pad stack">
      <button class="btn primary" data-rec-raw>${icon('copy')} Download the unreadable file</button>
      <button class="btn" data-rec-import>Restore from a backup</button>
      <button class="btn danger" data-rec-reset>${icon('trash')} Start over</button>
      <input type="file" accept="application/json,.json" hidden data-rec-file>
    </div>
    <div class="pad tiny muted" style="padding-top:16px;line-height:1.55">
      Details: ${esc(loadFailure && loadFailure.error || 'unknown error')}
    </div>`;

  target.querySelector('[data-rec-raw]').addEventListener('click', (e) =>
    withBusy(e.currentTarget, 'Preparing…', async () => {
      toastSaveResult(await exportRawBackup(), 'Saved');
    }));

  const file = target.querySelector('[data-rec-file]');
  target.querySelector('[data-rec-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', () => restoreFromFile(file, target.querySelector('[data-rec-import]')));

  target.querySelector('[data-rec-reset]').addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: 'Start over?',
      message: 'The unreadable data is erased and the app resets. Download it first if you might want to recover it later.',
      confirmLabel: 'Erase and start over', danger: true
    });
    if (!ok) return;
    discardCorruptData();
    location.hash = '#/';
    render();
  });
}

/* ---------------- boot ---------------- */

loadState();
paintBrandMarks();

try { warnDismissed = sessionStorage.getItem(WARN_DISMISSED) === '1'; } catch (e) { /* fine */ }

tabbar.querySelectorAll('[data-nav]').forEach((b) => {
  b.addEventListener('click', () => go(b.dataset.nav));
});

document.getElementById('fab').addEventListener('click', () => startLogFlow(todayISO()));

window.addEventListener('hashchange', () => {
  if (isSheetOpen()) closeSheet();
  render();
});

// Flush pending writes if the app is backgrounded mid-edit.
document.addEventListener('visibilitychange', () => { if (document.hidden) saveNow(); });
window.addEventListener('pagehide', saveNow);

render();
dismissBootSplash();

/* The splash covers the first paint so the app never flashes an empty frame.
   It clears as soon as the first screen is on the glass — no artificial wait.
   rAF doesn't run in a backgrounded or non-compositing tab, so a timer backs it
   up; whichever lands first wins, and CSS clears it even if neither does. */
function dismissBootSplash() {
  const boot = document.getElementById('boot');
  if (!boot) return;
  let cleared = false;
  const clear = () => {
    if (cleared) return;
    cleared = true;
    boot.classList.add('done');
    setTimeout(() => boot.remove(), 400);
  };
  requestAnimationFrame(() => requestAnimationFrame(clear));
  setTimeout(clear, 500);
}

/* Offline shell, for the hosted copy only. On localhost a cached worker just
   serves stale code while you're editing, so skip it there. */
const IS_LOCAL = ['localhost', '127.0.0.1', ''].includes(location.hostname);

if ('serviceWorker' in navigator && location.protocol !== 'file:' && !IS_LOCAL) {
  window.addEventListener('load', () => {
    // Absent on the single-file build — failing to register is fine there.
    navigator.serviceWorker.register('sw.js').then(watchForUpdate).catch(() => {});
  });
} else if ('serviceWorker' in navigator && IS_LOCAL) {
  navigator.serviceWorker.getRegistrations()
    .then((rs) => rs.forEach((r) => r.unregister()))
    .catch(() => {});
}

/* A new version finished downloading in the background — say so rather than
   waiting for the user to wonder why a fix hasn't appeared. */
function watchForUpdate(reg) {
  if (!reg) return;
  reg.addEventListener('updatefound', () => {
    const sw = reg.installing;
    if (!sw) return;
    sw.addEventListener('statechange', () => {
      if (sw.state === 'installed' && navigator.serviceWorker.controller) {
        toast('Update ready — reopen the app to apply', 'ok');
      }
    });
  });
}
