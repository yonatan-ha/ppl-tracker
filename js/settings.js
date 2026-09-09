/* Settings: workouts, weekly target, backup, reset. */

import {
  state, save, saveNow, exportJSON, importJSON, resetAll, hasSaveError,
  sortedMachines, isCalibrated, BUILD
} from './store.js';
import { isDurable, canPersist, storageBackend, IS_FRAMED } from './storage.js';
import { esc, icon, toast, toastSaveResult, confirmSheet, withBusy } from './ui.js';
import { go, back } from './app.js';

function storageStatus() {
  if (!canPersist() || hasSaveError()) {
    return { label: 'Not saving', sub: 'Storage is blocked here — export before you close', cls: 'c-push' };
  }
  if (!isDurable()) {
    return { label: 'Preview storage', sub: 'May be cleared between visits — keep a backup', cls: 'c-legs' };
  }
  return { label: 'Saved on this device', sub: 'Data persists between visits', cls: 'c-abs' };
}

export function renderSettings(view) {
  const st = state.settings;
  const since = st.sessionsSinceExport || 0;
  const uncal = sortedMachines().filter((m) => !isCalibrated(m)).length;
  const lastExport = st.lastExportAt
    ? new Date(st.lastExportAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
    : 'never';

  view.innerHTML = `
    <header class="screen-head bordered">
      <button class="icon-btn plain" data-back aria-label="Back">${icon('back')}</button>
      <div class="screen-title">Settings</div>
    </header>

    <div class="section-label">Training</div>
    <button class="list-row" data-workouts>
      <span class="lr-main">
        <span class="lr-title">My workouts</span>
        <span class="lr-sub">${state.templates.length} template${state.templates.length === 1 ? '' : 's'}</span>
      </span>
      <span class="chev">${icon('chev')}</span>
    </button>
    <button class="list-row" data-cables>
      <span class="lr-main">
        <span class="lr-title">Cables</span>
        <span class="lr-sub">${uncal ? `${uncal} station${uncal === 1 ? '' : 's'} to calibrate` : 'All stations calibrated'}</span>
      </span>
      <span class="chev">${icon('chev')}</span>
    </button>
    <div class="list-row">
      <span class="lr-main">
        <span class="lr-title">Weekly target</span>
        <span class="lr-sub">Sessions per week, used in Stats</span>
      </span>
      <div class="stepper" style="width:132px;flex:none">
        <button data-target="-1">−</button>
        <input inputmode="numeric" id="wk-target" value="${st.weeklyTarget}">
        <button data-target="1">+</button>
      </div>
    </div>

    <div class="section-label">Data</div>
    <div class="list-row ${storageStatus().cls}">
      <span class="swatch">${icon('check')}</span>
      <span class="lr-main">
        <span class="lr-title">${esc(storageStatus().label)}</span>
        <span class="lr-sub">${esc(storageStatus().sub)}</span>
      </span>
    </div>
    ${since >= 20 ? `
      <div class="pad" style="padding-bottom:10px">
        <div class="banner c-legs" style="font-size:13.5px">
          <div style="flex:1">${since} sessions since your last backup
            <div class="b-sub">Export a copy — browser storage isn't permanent.</div>
          </div>
        </div>
      </div>` : ''}
    <button class="list-row" data-export>
      <span class="lr-main">
        <span class="lr-title">Export backup</span>
        <span class="lr-sub">${state.sessions.length} sessions · last export ${esc(lastExport)}</span>
      </span>
      <span class="chev">${icon('chev')}</span>
    </button>
    <button class="list-row" data-import>
      <span class="lr-main">
        <span class="lr-title">Import backup</span>
        <span class="lr-sub">Replaces everything on this device</span>
      </span>
      <span class="chev">${icon('chev')}</span>
    </button>
    <button class="list-row" data-reset>
      <span class="lr-main">
        <span class="lr-title" style="color:var(--danger)">Erase all data</span>
        <span class="lr-sub">Sessions, workouts, everything</span>
      </span>
    </button>

    <div class="pad tiny muted center" style="padding:26px 26px 30px;line-height:1.6">
      PPL Tracker · all data stays on this device.<br>
      Add to Home Screen for the full-screen app.<br>
      <span class="u-mono" style="font-size:11px;opacity:.7">build ${esc(BUILD)}</span>
    </div>
    <input type="file" id="import-file" accept="application/json,.json" hidden>
  `;

  view.querySelector('[data-back]').addEventListener('click', () => back());
  view.querySelector('[data-workouts]').addEventListener('click', () => go('#/workouts'));
  view.querySelector('[data-cables]').addEventListener('click', () => go('#/cables'));

  const target = view.querySelector('#wk-target');
  view.querySelectorAll('[data-target]').forEach((b) => b.addEventListener('click', () => {
    st.weeklyTarget = Math.min(14, Math.max(1, (st.weeklyTarget || 5) + Number(b.dataset.target)));
    target.value = st.weeklyTarget;
    save();
  }));
  target.addEventListener('change', () => {
    const n = parseInt(target.value, 10);
    st.weeklyTarget = Number.isFinite(n) ? Math.min(14, Math.max(1, n)) : 5;
    target.value = st.weeklyTarget;
    saveNow();
  });

  view.querySelector('[data-export]').addEventListener('click', async (e) => {
    await withBusy(e.currentTarget, 'Exporting…', async () => {
      const count = state.sessions.length;
      toastSaveResult(await exportJSON(), `Backup of ${count} session${count === 1 ? '' : 's'} saved`);
    });
    renderSettings(view);
  });

  const file = view.querySelector('#import-file');
  view.querySelector('[data-import]').addEventListener('click', () => file.click());
  file.addEventListener('change', async () => {
    const f = file.files && file.files[0];
    if (!f) return;
    const ok = await confirmSheet({
      title: 'Replace all data?',
      message: `Importing ${f.name} overwrites everything currently on this device.`,
      confirmLabel: 'Import', danger: true
    });
    if (!ok) { file.value = ''; return; }
    await withBusy(view.querySelector('[data-import]'), 'Restoring…', async () => {
      try {
        importJSON(await f.text());
        toast('Backup restored', 'ok');
        go('#/', true);
        location.reload();
      } catch (err) {
        toast(`Couldn’t read ${f.name} — is it a PPL backup?`, 'error');
        console.error(err);
      }
    });
    file.value = '';
  });

  view.querySelector('[data-reset]').addEventListener('click', async () => {
    const ok = await confirmSheet({
      title: 'Erase everything?',
      message: 'All sessions and workouts are permanently deleted. Export a backup first if you might want them.',
      confirmLabel: 'Erase all data', danger: true
    });
    if (!ok) return;
    resetAll();
    location.hash = '#/';
    location.reload();
  });
}
