/* The gym-fast logging screen.
   Opens pre-built from a workout, with last time's numbers showing as ghosts
   behind empty fields — enter one and it turns solid, so at a glance you can
   tell what you've already done today. Lock an exercise when you're finished
   with it and it stops being editable. */

import {
  state, uid, save, saveNow, num, TYPES, TYPE_LABEL,
  todayISO, fmtDate, getSession, upsertSession, deleteSession,
  sortedTemplates, getTemplate, upsertTemplate, sessionFromTemplate, prefillExercise,
  matchesTemplate, lastPerformance, allExerciseNames, rememberExercise,
  usesStack, getMachine, sortedMachines, referenceMachine, isCalibrated,
  machineFactor, lastMachineFor, stepFor
} from './store.js';
import { esc, icon, toast, openSheet, closeSheet, pickSheet, confirmSheet, fmtNum } from './ui.js';
import { go, back } from './app.js';

/* ---------------- entry point: choose what to log ---------------- */

export async function startLogFlow(date) {
  const tpls = sortedTemplates();

  if (!tpls.length) {
    go('#/workouts/new');
    return;
  }

  const options = tpls.map((t) => ({
    label: t.name,
    sub: `${t.exercises.length} exercise${t.exercises.length === 1 ? '' : 's'}`,
    value: t.id,
    swatch: TYPE_LABEL[t.type][0],
    colorClass: `c-${t.type}`
  }));
  options.push({ label: 'Empty workout', sub: 'Start from a blank list', value: '__empty__' });

  const choice = await pickSheet({ title: fmtDate(date, { weekday: 'long', day: 'numeric', month: 'long' }), options });
  if (!choice) return;
  go(choice === '__empty__' ? `#/log?date=${date}` : `#/log?date=${date}&tpl=${choice}`);
}

/* ---------------- editor ---------------- */

export function renderEditor(view, sessionId, params) {
  const editing = sessionId ? getSession(sessionId) : null;
  if (sessionId && !editing) { go('#/', true); return; }

  let s;
  if (editing) {
    s = JSON.parse(JSON.stringify(editing));
    // A saved session opens protected: every exercise is locked until you tap
    // it open, so opening history to fix one number can't rewrite the rest.
    // Sessions logged before locks existed have no flag, so they lock too.
    s.exercises.forEach((ex) => { ex.locked = ex.locked !== false; });
  } else if (state.draft && state.draft.date === (params.date || todayISO()) &&
             (state.draft.templateId || '') === (params.tpl || '')) {
    s = state.draft;                       // resume an interrupted session
  } else {
    const tpl = params.tpl ? getTemplate(params.tpl) : null;
    s = sessionFromTemplate(tpl, params.date || todayISO());
    if (!tpl && params.type && TYPES.includes(params.type)) s.type = params.type;
  }

  const isNew = !editing;
  if (isNew) { state.draft = s; save(); }

  /* What you did last time, per exercise — refreshed on every paint. It drives
     both the ghost numbers in the fields and what the steppers adopt on their
     first press. lastPerformance() walks the whole history, so it's looked up
     once here rather than per set row. */
  let prev = [];

  paint();

  function touch() {
    if (isNew) { state.draft = s; save(); }
  }

  /* Update what a card's own state controls — the lock button and the done
     counter — without repainting, which would close the keyboard mid-entry. */
  function syncCard(i) {
    const card = view.querySelector(`[data-ex="${i}"]`);
    const lock = card && card.querySelector('[data-lock]');
    if (lock) lock.disabled = !started(s.exercises[i]);

    const counter = view.querySelector('[data-progress]');
    if (counter) counter.textContent = progressLabel();
  }

  function paint() {
    const title = s.templateName || TYPE_LABEL[s.type];
    prev = s.exercises.map((ex) => {
      const last = lastPerformance(ex.name, s.date, s.id);
      // Remember which stack it was on, so the ghost can be converted to today's.
      if (last) last.machineId = lastMachineFor(ex.name, s.date, s.id);
      return last;
    });

    view.innerHTML = `
      <header class="screen-head bordered">
        <button class="icon-btn plain" data-cancel aria-label="Cancel">${icon('close')}</button>
        <div class="screen-title">${esc(title)}<small>${esc(fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'short' }))}</small></div>
        <button class="txt-btn" data-save>Save</button>
      </header>

      <div class="pad">
        <div class="ed-field">
          <label for="ed-date">Date</label>
          <input type="date" id="ed-date" value="${s.date}">
        </div>
      </div>

      <div class="pad seg seg-wrap">
        ${TYPES.map((t) => `<button class="c-${t} ${s.type === t ? 'on' : ''}" data-type="${t}">${TYPE_LABEL[t]}</button>`).join('')}
      </div>

      <div class="section-label">Exercises<span class="sl-count" data-progress>${progressLabel()}</span></div>
      <div class="pad stack">
        ${s.exercises.map((ex, i) => exerciseCard(ex, i, stepFor(s.type, ex.name))).join('')}
        <button class="btn ghost" data-add-ex>${icon('plus')} Add exercise</button>
      </div>

      <div class="section-label">Notes</div>
      <div class="pad">
        <textarea class="notes-area" id="ed-notes" placeholder="How did it feel? Energy, niggles, anything.">${esc(s.notes || '')}</textarea>
      </div>

      ${editing ? `
        <div class="pad" style="padding-top:22px">
          <button class="btn danger" data-delete>${icon('trash')} Delete session</button>
        </div>` : ''}

      <div class="save-bar">
        <button class="btn primary" data-save2>${icon('check')} ${isNew ? 'Save workout' : 'Save changes'}</button>
      </div>
    `;
    wire();
  }

  /* Last time's numbers for one set row, converted onto the stack you're using
     today. Log 90 on a stack that reads high, switch to the reference next
     week, and the ghost says 40 — the number that actually repeats the lift. */
  function ghostFor(i, j) {
    const p = prev[i];
    const set = p && p.sets[j];
    if (!set) return null;

    const from = machineFactor(p.machineId);
    const to = machineFactor(s.exercises[i].machineId);
    if (from === to) return set;
    return { reps: set.reps, weight: convert(set.weight, from, to) };
  }

  function convert(weight, from, to) {
    if (weight === '' || weight == null) return '';
    const v = (num(weight) * from) / (to || 1);
    return String(Math.round(v * 100) / 100);
  }

  function entered(set) {
    return num(set.reps) > 0 || num(set.weight) > 0;
  }

  /* An exercise counts as done today once anything is entered against it. */
  function started(ex) {
    return (ex.sets || []).some(entered);
  }

  function progressLabel() {
    if (!s.exercises.length) return '';
    const done = s.exercises.filter((ex) => ex.locked || ex.skipped || started(ex)).length;
    return `${done} / ${s.exercises.length} done`;
  }

  function exerciseCard(ex, i, u) {
    if (ex.skipped) return skippedCard(ex, i);
    if (ex.locked) return lockedCard(ex, i, u);

    const p = prev[i];
    const hint = p
      ? `<b>Last</b> ${esc(fmtDate(p.date, { day: 'numeric', month: 'short' }))}${
          p.machineId ? ` · ${esc(machineName(p.machineId))}` : ''}`
      : 'First time logging this one';

    return `
      <div class="ex-card" data-ex="${i}">
        <div class="ex-head">
          <div class="ex-name">${esc(ex.name)}</div>
          <button class="icon-btn plain" data-skip="${i}"
                  aria-label="Skip ${esc(ex.name)}">${icon('skip')}</button>
          <button class="lock-btn" data-lock="${i}" aria-pressed="false"
                  aria-label="Lock ${esc(ex.name)}"${started(ex) ? '' : ' disabled'}>${icon('unlock')}</button>
        </div>
        ${machineChip(ex, i)}
        <div class="ex-last">${hint}</div>
        <div class="ex-rows">
          ${ex.sets.map((set, j) => setRow(set, i, j, u)).join('')}
        </div>
      </div>`;
  }

  /* Fields open empty. Last time's numbers sit behind them as placeholders, so
     a dim number reads as "not done yet" and a solid one as "done today".
     Each row carries its own button to take last time's numbers for that set. */
  function setRow(set, i, j, u) {
    const g = ghostFor(i, j);
    const ga = g && g.reps !== '' ? fmtNum(g.reps) : '0';
    const gb = g && g.weight !== '' ? fmtNum(g.weight) : '0';
    const canRepeat = !!g && !entered(set);

    return `
      <div class="set-row">
        <span class="set-idx">${j + 1}</span>
        <div class="stepper">
          <button data-step="${i}:${j}:reps:-${u.stepA}" aria-label="Less">−</button>
          <input inputmode="${u.a === 'REPS' ? 'numeric' : 'decimal'}" enterkeyhint="next"
                 data-in="${i}:${j}:reps" value="${esc(set.reps)}" placeholder="${esc(ga)}">
          <span class="unit">${u.a}</span>
          <button data-step="${i}:${j}:reps:${u.stepA}" aria-label="More">+</button>
        </div>
        <div class="stepper">
          <button data-step="${i}:${j}:weight:-${u.stepB}" aria-label="Less">−</button>
          <input inputmode="decimal" enterkeyhint="next"
                 data-in="${i}:${j}:weight" value="${esc(set.weight)}" placeholder="${esc(gb)}">
          <span class="unit">${u.b}</span>
          <button data-step="${i}:${j}:weight:${u.stepB}" aria-label="More">+</button>
        </div>
        <button class="set-same" data-same="${i}:${j}"${canRepeat ? '' : ' disabled'}
                aria-label="Use set ${j + 1} from last time">${icon('fill')}</button>
      </div>`;
  }

  function machineName(id) {
    const m = getMachine(id);
    return m ? m.name : 'Unknown cable';
  }

  /* Which stack you're on. Only shown for the exercises that run on one, so
     dumbbell and barbell work never asks you anything. */
  function machineChip(ex, i, locked) {
    if (!usesStack(ex.name)) return '';
    const m = ex.machineId ? getMachine(ex.machineId) : null;
    const warn = m && !isCalibrated(m) ? ' uncal' : '';
    const label = m ? esc(m.name) : 'Which cable?';

    if (locked) return `<div class="ex-gear"><span class="gear-chip on${warn}">${label}</span></div>`;

    return `
      <div class="ex-gear">
        <button class="gear-chip${m ? ' on' : ''}${warn}" data-machine="${i}">
          ${label}${m && !isCalibrated(m) ? ' · not calibrated' : ''}
        </button>
      </div>`;
  }

  /* Skipped: you didn't do it, so nothing is recorded. Not zero reps, not last
     week's numbers carried forward — the exercise simply isn't in the session. */
  function skippedCard(ex, i) {
    return `
      <div class="ex-card skipped" data-ex="${i}">
        <div class="ex-head">
          <span class="ex-skip-mark">${icon('skip')}</span>
          <div class="ex-name">${esc(ex.name)}</div>
          <button class="mini-btn" data-skip="${i}">Undo</button>
        </div>
        <div class="ex-skipped-note">Skipped — nothing recorded against this one.</div>
      </div>`;
  }

  /* Locked: the exercise stops being a form and becomes a record of what you
     did. No inputs at all, so there is nothing left to mis-tap between sets. */
  function lockedCard(ex, i, u) {
    const cardio = s.type === 'cardio';
    const ua = u.a.toLowerCase(), ub = u.b.toLowerCase();

    // One row per set, numbered like the form it replaces, so a locked card
    // still reads top to bottom in the order you entered it.
    const done = ex.sets.map((set, j) => {
      const val = cardio
        ? `<b>${fmtNum(set.reps)}</b> ${ua}${num(set.weight) ? ` · <b>${fmtNum(set.weight)}</b> ${ub}` : ''}`
        : `<b>${num(set.reps)}</b> × <b>${fmtNum(set.weight)}</b>${ub}`;
      return `
        <div class="done-row">
          <span class="set-idx">${j + 1}</span>
          <span class="done-set">${val}</span>
        </div>`;
    }).join('');

    return `
      <div class="ex-card locked" data-ex="${i}">
        <div class="ex-head">
          <span class="ex-tick">${icon('check')}</span>
          <div class="ex-name">${esc(ex.name)}</div>
          <button class="lock-btn on" data-lock="${i}" aria-pressed="true"
                  aria-label="Unlock ${esc(ex.name)}">${icon('lock')}</button>
        </div>
        ${machineChip(ex, i, true)}
        <div class="ex-done">${done}</div>
      </div>`;
  }

  /* ---------------- events ---------------- */

  function wire() {
    view.querySelector('#ed-date').addEventListener('change', (e) => {
      s.date = e.target.value || s.date; touch(); paint();
    });

    view.querySelector('#ed-notes').addEventListener('input', (e) => { s.notes = e.target.value; touch(); });

    view.querySelectorAll('[data-type]').forEach((b) => b.addEventListener('click', () => {
      s.type = b.dataset.type; touch(); paint();
    }));

    // Typing into a set field: update state only, never repaint (keeps focus + keyboard).
    view.querySelectorAll('[data-in]').forEach((inp) => {
      inp.addEventListener('input', () => {
        const [i, j, field] = inp.dataset.in.split(':');
        s.exercises[+i].sets[+j][field] = inp.value;
        touch();
        syncCard(+i);
      });
      inp.addEventListener('focus', () => inp.select());
    });

    view.querySelectorAll('[data-step]').forEach((b) => b.addEventListener('click', () => {
      const [i, j, field, delta] = b.dataset.step.split(':');
      const set = s.exercises[+i].sets[+j];
      const g = ghostFor(+i, +j);
      const ghost = g ? g[field] : '';

      // First press on an untouched field takes last time's number as it stands:
      // repeating a lift is one tap, beating it is two.
      const next = (set[field] === '' && ghost !== '' && ghost != null)
        ? num(ghost)
        : Math.max(0, Math.round((num(set[field]) + Number(delta)) * 100) / 100);

      set[field] = String(next);
      const inp = view.querySelector(`[data-in="${i}:${j}:${field}"]`);
      if (inp) inp.value = set[field];
      touch();
      syncCard(+i);
    }));

    // Repeat one set from last time, converted to today's cable if they differ.
    view.querySelectorAll('[data-same]').forEach((b) => b.addEventListener('click', () => {
      const [i, j] = b.dataset.same.split(':').map(Number);
      const g = ghostFor(i, j);
      if (!g) return;
      const set = s.exercises[i].sets[j];
      if (set.reps === '') set.reps = g.reps == null ? '' : String(g.reps);
      if (set.weight === '') set.weight = g.weight == null ? '' : String(g.weight);
      touch(); paint();
    }));

    view.querySelectorAll('[data-skip]').forEach((b) => b.addEventListener('click', () => {
      const ex = s.exercises[+b.dataset.skip];
      ex.skipped = !ex.skipped;
      if (ex.skipped) ex.locked = false;
      touch(); paint();
    }));

    view.querySelectorAll('[data-lock]').forEach((b) => b.addEventListener('click', () => {
      const ex = s.exercises[+b.dataset.lock];
      if (ex.locked) {
        ex.locked = false;
      } else {
        if (!started(ex)) return;
        // Locking commits what you actually did: rows you never filled in are
        // dropped now rather than silently at save, so the card matches the record.
        ex.sets = ex.sets.filter(entered);
        ex.locked = true;
      }
      touch(); paint();
    }));

    view.querySelector('[data-add-ex]').addEventListener('click', async () => {
      const name = await pickExerciseSheet({ type: s.type, title: 'Add exercise' });
      if (!name) return;
      rememberExercise(name, s.type);
      s.exercises.push(prefillExercise({ name }, s.date, s.type));
      touch(); paint();
    });

    view.querySelector('[data-cancel]').addEventListener('click', onCancel);
    view.querySelector('[data-save]').addEventListener('click', onSave);
    view.querySelector('[data-save2]').addEventListener('click', onSave);

    const del = view.querySelector('[data-delete]');
    if (del) del.addEventListener('click', async () => {
      const ok = await confirmSheet({
        title: 'Delete this session?', message: 'This removes it from your calendar and stats.',
        confirmLabel: 'Delete', danger: true
      });
      if (!ok) return;
      deleteSession(s.id);
      toast('Session deleted', 'ok');
      go('#/', true);
    });
  }

  async function onCancel() {
    const hasData = s.exercises.some((ex) => ex.sets.some((x) => num(x.reps) || num(x.weight)));
    if (isNew && hasData) {
      const ok = await confirmSheet({
        title: 'Discard this session?', message: 'Nothing will be saved.',
        confirmLabel: 'Discard', danger: true
      });
      if (!ok) return;
    }
    if (isNew) { state.draft = null; saveNow(); }
    go('#/', true);
  }

  async function onSave() {
    // Drop rows you never filled in; keep bodyweight sets (reps but no weight).
    const saved = JSON.parse(JSON.stringify(s));
    saved.exercises = saved.exercises
      .filter((ex) => !ex.skipped)
      .map((ex) => ({ ...ex, sets: ex.sets.filter((x) => num(x.reps) > 0 || num(x.weight) > 0) }))
      .filter((ex) => ex.sets.length > 0);

    if (!saved.exercises.length) { toast('Add at least one set before saving', 'error'); return; }

    // Exercise list drifted from the workout? Offer to make it permanent.
    const tpl = saved.templateId ? getTemplate(saved.templateId) : null;
    if (tpl && !matchesTemplate({ exercises: s.exercises }, tpl)) {
      const ok = await confirmSheet({
        title: `Update ${tpl.name}?`,
        message: 'You changed the exercise list. Save it to this workout for next time, or keep it as a one-off.',
        confirmLabel: `Update ${tpl.name}`
      });
      if (ok) {
        tpl.exercises = s.exercises.map((ex) => ({ id: uid(), name: ex.name }));
        upsertTemplate(tpl);
      }
    }

    saved.exercises.forEach((ex) => rememberExercise(ex.name, saved.type));
    upsertSession(saved);
    if (isNew) state.draft = null;
    const stored = saveNow();
    const sets = saved.exercises.reduce((t, ex) => t + ex.sets.length, 0);
    if (stored === false) toast('Saved for now, but storage is blocked here', 'error');
    else toast(isNew ? `${saved.templateName || TYPE_LABEL[saved.type]} logged · ${sets} sets` : 'Changes saved', 'ok');
    go(`#/session/${saved.id}`, true);
  }
}

/* ---------------- exercise picker ---------------- */

export function pickExerciseSheet({ type, title }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (!answered) { answered = true; closeSheet(); resolve(v); } };

    const all = allExerciseNames();
    // Same-category first, then most-used, then alphabetical.
    all.sort((a, b) => (
      (a.type === type ? 0 : 1) - (b.type === type ? 0 : 1) ||
      b.uses - a.uses ||
      a.name.localeCompare(b.name)
    ));

    openSheet({
      title: title || 'Add exercise',
      bodyHTML: `
        <div class="pad" style="padding-bottom:10px">
          <input id="ac-search" class="field" type="search"
                 placeholder="Search or type a new name" autocomplete="off" autocapitalize="words">
        </div>
        <div class="autocomplete" id="ac-list"></div>`,
      onMount(sheet) {
        const search = sheet.querySelector('#ac-search');
        const list = sheet.querySelector('#ac-list');

        const draw = () => {
          const q = search.value.trim().toLowerCase();
          const hits = (q ? all.filter((e) => e.name.toLowerCase().includes(q)) : all).slice(0, 60);
          const exact = all.some((e) => e.name.toLowerCase() === q);
          list.innerHTML =
            (q && !exact ? `<button class="ac-item" data-new>Add “${esc(search.value.trim())}”<small>new exercise</small></button>` : '') +
            hits.map((e) => `<button class="ac-item" data-name="${esc(e.name)}">${esc(e.name)}${e.uses ? `<small>${e.uses}×</small>` : ''}</button>`).join('');

          list.querySelectorAll('[data-name]').forEach((b) => b.addEventListener('click', () => done(b.dataset.name)));
          const nb = list.querySelector('[data-new]');
          if (nb) nb.addEventListener('click', () => done(search.value.trim()));
        };

        search.addEventListener('input', draw);
        draw();
        sheet.closest('.scrim').addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) done(null); });
      }
    });
  });
}
