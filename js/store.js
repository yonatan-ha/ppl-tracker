/* State + persistence + selectors. Everything lives in one localStorage blob. */

import { SEED_EXERCISES } from './exercises.js';
import {
  initStorage, readRaw, writeRaw, requestPersistence,
  hadPreviousVisit, stampVisit, isDurable, canPersist, IS_FRAMED
} from './storage.js';

const STORAGE_KEY = 'ppl.v1';
const SCHEMA_VERSION = 2;

/* Every type is a workout in its own right. MAIN_TYPES are the lifting days
   that count toward the weekly target; abs and cardio stand on their own. */
export const TYPES = ['push', 'pull', 'legs', 'abs', 'cardio'];
export const MAIN_TYPES = ['push', 'pull', 'legs'];
export const TYPE_LABEL = { push: 'Push', pull: 'Pull', legs: 'Legs', abs: 'Abs', cardio: 'Cardio' };

/* Cardio is logged in minutes and kilometres; everything else in reps and kg.
   Both share the same {reps, weight} set shape so history and prefill stay simple. */
export const UNITS = {
  cardio: { a: 'MIN', b: 'KM', stepA: 5, stepB: 0.5 },
  default: { a: 'REPS', b: 'KG', stepA: 1, stepB: 2.5 }
};

export function unitsFor(type) {
  return UNITS[type] || UNITS.default;
}

export let state = null;

export function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function blankState() {
  return {
    version: SCHEMA_VERSION,
    settings: { unit: 'kg', weeklyTarget: 5, lastExportAt: null, sessionsSinceExport: 0, setupDone: false },
    sessions: [],
    templates: [],
    exerciseLibrary: SEED_EXERCISES.map((e) => ({ name: e.name, type: e.type })),
    draft: null
  };
}

function migrate(data) {
  const base = blankState();
  const out = {
    ...base,
    ...data,
    settings: { ...base.settings, ...(data.settings || {}) }
  };

  // v1 -> v2: abs/cardio used to hang off a session as an "addon". They are
  // standalone workouts now, so lift each one out into its own session.
  if ((data.version || 1) < 2) {
    const extra = [];
    for (const s of out.sessions) {
      const addon = s.addon;
      delete s.addon;
      if (!addon) continue;

      if (addon.kind === 'cardio') {
        const mins = parseFloat(addon.minutes);
        extra.push({
          id: uid(), date: s.date, type: 'cardio',
          templateId: null, templateName: null,
          notes: addon.note || '',
          exercises: [{
            id: uid(), name: addon.note ? String(addon.note).trim() : 'Cardio',
            sets: [{ id: uid(), reps: Number.isFinite(mins) ? String(mins) : '', weight: '' }]
          }],
          createdAt: s.createdAt || Date.now(), updatedAt: Date.now()
        });
      } else if ((addon.exercises || []).length) {
        extra.push({
          id: uid(), date: s.date, type: 'abs',
          templateId: null, templateName: null, notes: '',
          exercises: addon.exercises,
          createdAt: s.createdAt || Date.now(), updatedAt: Date.now()
        });
      }
    }
    out.sessions = out.sessions.concat(extra);

    // Templates now hold only an exercise list — set and rep counts are chosen
    // when you log, not baked into the workout.
    out.templates = (out.templates || []).map((t) => {
      delete t.defaultAddon;
      return { ...t, exercises: (t.exercises || []).map((e) => ({ id: e.id || uid(), name: e.name })) };
    });

    out.templates = collapseAbVariants(out.templates);

    // Abs and cardio are workouts you can log from now, so seed one of each
    // from what you were already doing as an add-on.
    for (const kind of ['abs', 'cardio']) {
      if (out.templates.some((t) => t.type === kind)) continue;
      const latest = out.sessions.filter((s) => s.type === kind).pop();
      if (!latest) continue;
      out.templates.push({
        id: uid(), name: TYPE_LABEL[kind], type: kind, order: out.templates.length,
        exercises: latest.exercises.map((e) => ({ id: uid(), name: e.name })),
        updatedAt: Date.now()
      });
    }

    if (out.draft && out.draft.addon) delete out.draft.addon;
  }

  out.version = SCHEMA_VERSION;
  return out;
}

/* v1 shipped Push A/Push B and Pull A/Pull B as defaults. There's one workout
   per type now, so fold those pairs back together — but only where the lists
   are still exactly as shipped, so a workout you actually edited is never lost. */
const V1_DEFAULTS = {
  'Push A': ['Bench Press', 'Overhead Press', 'Incline Dumbbell Press', 'Lateral Raise', 'Triceps Pushdown'],
  'Push B': ['Incline Bench Press', 'Machine Chest Press', 'Seated Dumbbell Shoulder Press', 'Cable Lateral Raise', 'Overhead Triceps Extension'],
  'Pull A': ['Pull-Up', 'Barbell Row', 'Seated Cable Row', 'Face Pull', 'Barbell Curl'],
  'Pull B': ['Deadlift', 'Lat Pulldown', 'Chest-Supported Row', 'Rear Delt Fly', 'Hammer Curl']
};

function collapseAbVariants(templates) {
  const untouched = (t) => {
    const shipped = V1_DEFAULTS[t.name];
    if (!shipped) return false;
    const names = (t.exercises || []).map((e) => e.name.trim().toLowerCase());
    return names.length === shipped.length &&
           names.every((n, i) => n === shipped[i].toLowerCase());
  };

  let out = templates;
  for (const base of ['Push', 'Pull']) {
    const a = out.find((t) => t.name === `${base} A`);
    const b = out.find((t) => t.name === `${base} B`);
    if (a && untouched(a)) {
      a.name = base;
      if (b && untouched(b)) out = out.filter((t) => t !== b);
    }
  }
  return out;
}

/* Set when saved data existed but could not be read or migrated. While this is
   set the app runs read-only in memory and refuses to write, so a bad read can
   never overwrite a good save. The raw text is kept so it can be exported. */
export let loadFailure = null;

export function loadState() {
  initStorage();
  requestPersistence();

  let raw = null;
  try {
    raw = readRaw(STORAGE_KEY);
  } catch (err) {
    raw = null;
    loadFailure = { reason: 'read', error: String(err), raw: null };
  }

  if (!raw) {
    state = blankState();
    // Storage worked before but is empty now: it was cleared between visits.
    if (!loadFailure && hadPreviousVisit()) {
      loadFailure = { reason: 'evicted', error: null, raw: null };
    }
    stampVisit();
    return state;
  }

  try {
    state = migrate(JSON.parse(raw));
    saveNow();                 // persist the migrated shape
    stampVisit();
  } catch (err) {
    // Never fall back to a blank state and then save over the real thing.
    console.error('Saved data could not be read:', err);
    loadFailure = { reason: 'corrupt', error: String(err && err.message || err), raw };
    state = blankState();
  }
  return state;
}

let saveTimer = null;
export function save() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(saveNow, 300);
}

let saveError = false;

export function saveNow() {
  clearTimeout(saveTimer);
  if (loadFailure && loadFailure.reason === 'corrupt') return;   // protect the original
  const ok = writeRaw(STORAGE_KEY, JSON.stringify(state));
  if (!ok) saveError = true;
  return ok;
}

export function hasSaveError() { return saveError; }

/* Give up on the unreadable payload and start clean. Only ever called from an
   explicit choice in the UI, never automatically. */
export function discardCorruptData() {
  loadFailure = null;
  state = blankState();
  saveNow();
}

/* ---------------- dates ---------------- */

export function isoDate(d) {
  const p = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

export function todayISO() { return isoDate(new Date()); }

export function parseISO(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(y, m - 1, d);
}

/* Monday-based week start. */
export function weekStart(d) {
  const x = new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const dow = (x.getDay() + 6) % 7; // Mon = 0
  x.setDate(x.getDate() - dow);
  return x;
}

export function fmtDate(iso, opts) {
  return parseISO(iso).toLocaleDateString(undefined, opts || { weekday: 'short', day: 'numeric', month: 'short' });
}

/* ---------------- session helpers ---------------- */

export function sessionsByDate() {
  const map = new Map();
  for (const s of state.sessions) {
    if (!map.has(s.date)) map.set(s.date, []);
    map.get(s.date).push(s);
  }
  // Lifting days first, so the main workout leads the day cell.
  for (const list of map.values()) {
    list.sort((a, b) => rankType(a.type) - rankType(b.type));
  }
  return map;
}

export function rankType(type) {
  const i = TYPES.indexOf(type);
  return i < 0 ? 99 : i;
}

export function getSession(id) {
  return state.sessions.find((s) => s.id === id) || null;
}

export function sortedSessions() {
  return [...state.sessions].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
}

export function upsertSession(session) {
  const i = state.sessions.findIndex((s) => s.id === session.id);
  session.updatedAt = Date.now();
  if (i >= 0) {
    state.sessions[i] = session;
  } else {
    session.createdAt = Date.now();
    state.sessions.push(session);
    state.settings.sessionsSinceExport = (state.settings.sessionsSinceExport || 0) + 1;
  }
  saveNow();
}

export function deleteSession(id) {
  state.sessions = state.sessions.filter((s) => s.id !== id);
  saveNow();
}

/* Volume for one exercise entry: sum of reps x weight over its sets. */
export function exerciseVolume(ex) {
  return (ex.sets || []).reduce((t, s) => t + (num(s.reps) * num(s.weight)), 0);
}

/* Cardio has no meaningful load, so it never contributes volume. */
export function sessionVolume(session) {
  if (session.type === 'cardio') return 0;
  return (session.exercises || []).reduce((t, ex) => t + exerciseVolume(ex), 0);
}

export function sessionSetCount(session) {
  return (session.exercises || []).reduce((t, ex) => t + (ex.sets || []).length, 0);
}

/* Total minutes logged in a cardio session (minutes live in the reps field). */
export function sessionMinutes(session) {
  if (session.type !== 'cardio') return 0;
  return (session.exercises || []).reduce(
    (t, ex) => t + (ex.sets || []).reduce((n, s) => n + num(s.reps), 0), 0);
}

export function num(v) {
  const n = parseFloat(v);
  return Number.isFinite(n) ? n : 0;
}

/* Epley estimated 1RM. */
export function est1RM(weight, reps) {
  const w = num(weight), r = num(reps);
  if (!w || !r) return 0;
  return w * (1 + r / 30);
}

/* The heaviest set of an exercise entry, by weight then reps. */
export function topSet(ex) {
  let best = null;
  for (const s of ex.sets || []) {
    if (!best || num(s.weight) > num(best.weight) ||
       (num(s.weight) === num(best.weight) && num(s.reps) > num(best.reps))) best = s;
  }
  return best;
}

/* Most recent logged performance of a named exercise.
   excludeId skips the session you're editing, so it shows the *previous* time. */
export function lastPerformance(name, beforeDate, excludeId) {
  const key = name.trim().toLowerCase();
  let found = null;
  for (const s of state.sessions) {
    if (excludeId && s.id === excludeId) continue;
    if (beforeDate && s.date > beforeDate) continue;
    for (const ex of s.exercises || []) {
      if (ex.name.trim().toLowerCase() !== key) continue;
      if (!found || s.date > found.date || (s.date === found.date && (s.createdAt || 0) > found.createdAt)) {
        found = { date: s.date, createdAt: s.createdAt || 0, sets: ex.sets || [] };
      }
    }
  }
  return found;
}

/* Every exercise name that appears in history or the library. */
export function allExerciseNames() {
  const seen = new Map();
  for (const e of state.exerciseLibrary) seen.set(e.name.toLowerCase(), { name: e.name, type: e.type, uses: 0 });
  for (const s of state.sessions) {
    for (const ex of s.exercises || []) {
      const k = ex.name.trim().toLowerCase();
      if (!k) continue;
      const hit = seen.get(k) || { name: ex.name.trim(), type: s.type, uses: 0 };
      hit.uses += 1;
      seen.set(k, hit);
    }
  }
  return [...seen.values()];
}

export function rememberExercise(name, type) {
  const key = name.trim().toLowerCase();
  if (!key) return;
  if (state.exerciseLibrary.some((e) => e.name.trim().toLowerCase() === key)) return;
  state.exerciseLibrary.push({ name: name.trim(), type });
  save();
}

/* ---------------- templates ---------------- */

export function getTemplate(id) {
  return state.templates.find((t) => t.id === id) || null;
}

export function sortedTemplates() {
  return [...state.templates].sort((a, b) => (rankType(a.type) - rankType(b.type)) || (a.order || 0) - (b.order || 0));
}

export function upsertTemplate(tpl) {
  const i = state.templates.findIndex((t) => t.id === tpl.id);
  tpl.updatedAt = Date.now();
  if (i >= 0) state.templates[i] = tpl;
  else {
    tpl.order = state.templates.length;
    state.templates.push(tpl);
  }
  saveNow();
}

export function deleteTemplate(id) {
  state.templates = state.templates.filter((t) => t.id !== id);
  saveNow();
}

/* Build a ready-to-log session from a template.
   A template only lists exercises — sets and reps come from what you did last
   time, or start as one blank row the first time you log something. */
export function sessionFromTemplate(tpl, date) {
  return {
    id: uid(),
    date: date || todayISO(),
    type: tpl ? tpl.type : 'push',
    templateId: tpl ? tpl.id : null,
    templateName: tpl ? tpl.name : null,
    notes: '',
    exercises: (tpl ? tpl.exercises : []).map((te) => prefillExercise(te, date))
  };
}

export function prefillExercise(te, date) {
  const last = lastPerformance(te.name, date);
  const sets = last && last.sets.length
    ? last.sets.map((s) => ({ id: uid(), reps: s.reps, weight: s.weight }))
    : [{ id: uid(), reps: '', weight: '' }];
  return { id: uid(), name: te.name, sets };
}

/* Does this session's exercise list still match its template? */
export function matchesTemplate(session, tpl) {
  if (!tpl) return true;
  const a = (session.exercises || []).map((e) => e.name.trim().toLowerCase()).join('|');
  const b = (tpl.exercises || []).map((e) => e.name.trim().toLowerCase()).join('|');
  return a === b;
}

/* ---------------- export / import ---------------- */

export function exportJSON() {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ppl-backup-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
  state.settings.lastExportAt = Date.now();
  state.settings.sessionsSinceExport = 0;
  saveNow();
}

export function importJSON(text) {
  const data = JSON.parse(text);
  if (!data || !Array.isArray(data.sessions)) throw new Error('Not a PPL backup file');
  const next = migrate(data);
  loadFailure = null;          // an explicit restore clears the read-only lock
  state = next;
  saveNow();
}

/* Download whatever is sitting in storage, readable or not — the escape hatch
   when the app can't parse it but you don't want to lose it. */
export function exportRawBackup() {
  const text = (loadFailure && loadFailure.raw) || JSON.stringify(state, null, 2);
  const blob = new Blob([text], { type: 'application/json' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = `ppl-raw-${todayISO()}.json`;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function resetAll() {
  loadFailure = null;
  state = blankState();
  saveNow();
}
