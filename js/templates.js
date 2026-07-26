/* First-run setup + the workout builder.
   A workout template is just an ordered list of exercises. How many sets and
   reps you did is recorded when you log the session, never fixed up front. */

import {
  state, uid, saveNow, TYPES, TYPE_LABEL,
  sortedTemplates, getTemplate, upsertTemplate, deleteTemplate, rememberExercise
} from './store.js';
import { STARTER_TEMPLATES } from './exercises.js';
import { esc, icon, toast, confirmSheet } from './ui.js';
import { go, back } from './app.js';
import { pickExerciseSheet } from './editor.js';

/* ---------------- first run ---------------- */

export function renderSetup(view) {
  const picked = new Set(STARTER_TEMPLATES.map((t) => t.name));

  view.innerHTML = `
    <div class="hero">
      <div class="hero-blocks">
        <span class="c-push"></span><span class="c-pull"></span><span class="c-legs"></span>
        <span class="c-abs"></span><span class="c-cardio"></span>
      </div>
      <h1>Set up your workouts</h1>
      <p>Each workout keeps its own list of exercises. Pick the ones you run — you'll fill in sets and reps when you actually log a session.</p>
    </div>

    <div class="section-label">Suggested workouts</div>
    <div id="starters">
      ${STARTER_TEMPLATES.map((t, i) => `
        <button class="list-row c-${t.type}" data-i="${i}" aria-pressed="true">
          <span class="swatch">${TYPE_LABEL[t.type][0]}</span>
          <span class="lr-main">
            <span class="lr-title">${esc(t.name)}</span>
            <span class="lr-sub">${t.exercises.length} exercise${t.exercises.length === 1 ? '' : 's'} · ${esc(t.exercises.slice(0, 2).join(', '))}${t.exercises.length > 2 ? '…' : ''}</span>
          </span>
          <span class="chev" data-mark>${icon('check')}</span>
        </button>`).join('')}
    </div>

    <div class="pad stack" style="padding-top:20px">
      <button class="btn primary" data-use>Use selected</button>
      <button class="btn ghost" data-scratch>Start from scratch</button>
    </div>
    <div class="pad tiny muted center" style="padding-top:12px;padding-bottom:24px">
      Everything is stored on this device only.
    </div>
  `;

  view.querySelectorAll('[data-i]').forEach((row) => {
    const t = STARTER_TEMPLATES[+row.dataset.i];
    row.addEventListener('click', () => {
      const on = picked.has(t.name);
      if (on) picked.delete(t.name); else picked.add(t.name);
      row.setAttribute('aria-pressed', String(!on));
      row.style.opacity = on ? '.4' : '1';
      row.querySelector('[data-mark]').style.visibility = on ? 'hidden' : 'visible';
    });
  });

  view.querySelector('[data-use]').addEventListener('click', () => {
    STARTER_TEMPLATES.filter((t) => picked.has(t.name)).forEach((t, i) => {
      upsertTemplate({
        id: uid(), name: t.name, type: t.type, order: i,
        exercises: t.exercises.map((name) => ({ id: uid(), name }))
      });
    });
    state.settings.setupDone = true;
    saveNow();
    go('#/', true);
  });

  view.querySelector('[data-scratch]').addEventListener('click', () => {
    state.settings.setupDone = true;
    saveNow();
    go('#/workouts/new', true);
  });
}

/* ---------------- workout list ---------------- */

export function renderTemplateList(view) {
  const tpls = sortedTemplates();

  view.innerHTML = `
    <header class="screen-head bordered">
      <button class="icon-btn plain" data-back aria-label="Back">${icon('back')}</button>
      <div class="screen-title">My workouts</div>
    </header>

    ${tpls.length ? tpls.map((t) => `
      <button class="list-row c-${t.type}" data-id="${t.id}">
        <span class="swatch">${TYPE_LABEL[t.type][0]}</span>
        <span class="lr-main">
          <span class="lr-title">${esc(t.name)}</span>
          <span class="lr-sub">${t.exercises.length} exercise${t.exercises.length === 1 ? '' : 's'}</span>
        </span>
        <span class="chev">${icon('chev')}</span>
      </button>`).join('') : `
      <div class="empty"><strong>No workouts yet</strong>Create one and it'll be ready to log with a single tap.</div>`}

    <div class="pad" style="padding-top:18px">
      <button class="btn ghost" data-new>${icon('plus')} New workout</button>
    </div>
  `;

  view.querySelector('[data-back]').addEventListener('click', () => back());
  view.querySelector('[data-new]').addEventListener('click', () => go('#/workouts/new'));
  view.querySelectorAll('[data-id]').forEach((b) => {
    b.addEventListener('click', () => go(`#/workouts/${b.dataset.id}`));
  });
}

/* ---------------- workout editor ---------------- */

export function renderTemplateEditor(view, id, params) {
  const isNew = id === 'new';
  const existing = isNew ? null : getTemplate(id);
  if (!isNew && !existing) { go('#/workouts', true); return; }

  // Work on a copy; nothing is written until Save.
  const draft = existing
    ? JSON.parse(JSON.stringify(existing))
    : {
        id: uid(),
        name: '',
        type: TYPES.includes(params.type) ? params.type : 'push',
        exercises: []
      };

  paint();

  function paint() {
    view.innerHTML = `
      <header class="screen-head bordered">
        <button class="icon-btn plain" data-cancel aria-label="Cancel">${icon('close')}</button>
        <div class="screen-title">${isNew ? 'New workout' : 'Edit workout'}</div>
        <button class="txt-btn" data-save>Save</button>
      </header>

      <div class="pad" style="padding-top:8px">
        <input class="card" id="tpl-name" style="width:100%;font-size:17px;font-weight:650;padding:14px"
               placeholder="Workout name (e.g. Push)" value="${esc(draft.name)}"
               autocapitalize="words" autocomplete="off">
      </div>

      <div class="section-label">Type</div>
      <div class="pad seg seg-wrap">
        ${TYPES.map((t) => `<button class="c-${t} ${draft.type === t ? 'on' : ''}" data-type="${t}">${TYPE_LABEL[t]}</button>`).join('')}
      </div>

      <div class="section-label">Exercises · ${draft.exercises.length}</div>
      <div class="pad stack">
        ${draft.exercises.length ? `
          <div class="card" style="padding:2px 0">
            ${draft.exercises.map((ex, i) => exerciseRow(ex, i, draft.exercises.length)).join('')}
          </div>` : `
          <div class="tiny muted center" style="padding:14px 8px">No exercises yet.</div>`}
        <button class="btn ghost" data-add>${icon('plus')} Add exercise</button>
      </div>

      <div class="pad tiny muted" style="padding-top:14px;line-height:1.55">
        Sets, reps and weight aren't set here — you enter those when you log the workout, and it remembers what you did last time.
      </div>

      ${!isNew ? `
        <div class="pad" style="padding-top:22px;padding-bottom:10px">
          <button class="btn danger" data-delete>${icon('trash')} Delete workout</button>
        </div>` : ''}

      <div style="height:22px"></div>
    `;

    view.querySelector('#tpl-name').addEventListener('input', (e) => { draft.name = e.target.value; });

    view.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      draft.type = b.dataset.type; paint();
    }));

    view.querySelectorAll('[data-move]').forEach((b) => b.addEventListener('click', () => {
      const [idx, dir] = b.dataset.move.split(':').map(Number);
      const j = idx + dir;
      if (j < 0 || j >= draft.exercises.length) return;
      const [moved] = draft.exercises.splice(idx, 1);
      draft.exercises.splice(j, 0, moved);
      paint();
    }));

    view.querySelectorAll('[data-rm]').forEach((b) => b.addEventListener('click', () => {
      draft.exercises.splice(+b.dataset.rm, 1); paint();
    }));

    view.querySelector('[data-add]').addEventListener('click', async () => {
      const name = await pickExerciseSheet({ type: draft.type, title: 'Add exercise' });
      if (!name) return;
      rememberExercise(name, draft.type);
      draft.exercises.push({ id: uid(), name });
      paint();
    });

    view.querySelector('[data-cancel]').addEventListener('click', () => back('#/workouts'));

    view.querySelector('[data-save]').addEventListener('click', () => {
      if (!draft.name.trim()) draft.name = defaultName(draft.type);
      if (!draft.exercises.length) { toast('Add at least one exercise'); return; }
      draft.exercises.forEach((ex) => rememberExercise(ex.name, draft.type));
      upsertTemplate(draft);
      toast(isNew ? 'Workout created' : 'Workout updated');
      go('#/workouts', true);
    });

    const del = view.querySelector('[data-delete]');
    if (del) del.addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: `Delete ${draft.name}?`,
        message: 'Sessions you already logged from this workout are kept — only the workout itself is removed.',
        confirmLabel: 'Delete', danger: true
      });
      if (!ok) return;
      deleteTemplate(draft.id);
      toast('Workout deleted');
      go('#/workouts', true);
    });
  }

  function exerciseRow(ex, i, total) {
    return `
      <div class="tpl-row">
        <span class="tpl-num">${i + 1}</span>
        <span class="tpl-name">${esc(ex.name)}</span>
        <button class="icon-btn plain" data-move="${i}:-1" ${i === 0 ? 'disabled style="opacity:.25"' : ''} aria-label="Move up">${icon('back', 'rot-up')}</button>
        <button class="icon-btn plain" data-move="${i}:1" ${i === total - 1 ? 'disabled style="opacity:.25"' : ''} aria-label="Move down">${icon('chev', 'rot-down')}</button>
        <button class="icon-btn plain" data-rm="${i}" aria-label="Remove">${icon('close')}</button>
      </div>`;
  }
}

function defaultName(type) {
  const existing = state.templates.filter((t) => t.type === type).length;
  return existing ? `${TYPE_LABEL[type]} ${existing + 1}` : TYPE_LABEL[type];
}
