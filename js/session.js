/* Read-only session detail. */

import {
  getSession, sessionVolume, sessionSetCount, sessionMinutes, exerciseVolume,
  fmtDate, num, unitsFor, TYPE_LABEL, getMachine, machineFactor
} from './store.js';
import { esc, icon, compact, fmtNum } from './ui.js';
import { go, back } from './app.js';

export function renderSessionDetail(view, id) {
  const s = getSession(id);
  if (!s) { go('#/', true); return; }

  const isCardio = s.type === 'cardio';
  const u = unitsFor(s.type);
  const title = s.templateName || TYPE_LABEL[s.type];

  const kpis = isCardio
    ? [[s.exercises.length, 'ACTIVITIES'], [fmtNum(sessionMinutes(s), 0), 'MINUTES'],
       [fmtNum(totalDistance(s)), 'KM']]
    : [[s.exercises.length, 'EXERCISES'], [sessionSetCount(s), 'SETS'],
       [compact(sessionVolume(s)), 'KG VOLUME']];

  view.innerHTML = `
    <header class="screen-head bordered">
      <button class="icon-btn plain" data-back aria-label="Back">${icon('back')}</button>
      <div class="screen-title">${esc(title)}<small>${esc(fmtDate(s.date, { weekday: 'long', day: 'numeric', month: 'long' }))}</small></div>
      <button class="icon-btn" data-edit aria-label="Edit">${icon('edit')}</button>
    </header>

    <div class="pad" style="padding-top:6px">
      <div class="banner c-${s.type}">
        <div style="flex:1">
          ${esc(title)}
          <div class="b-sub">${TYPE_LABEL[s.type]} workout</div>
        </div>
      </div>
    </div>

    <div class="pad" style="padding-top:12px">
      <div class="kpis">
        ${kpis.map(([v, l]) => `<div class="kpi"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join('')}
      </div>
    </div>

    <div class="section-label">${isCardio ? 'Activity' : 'Exercises'}</div>
    <div class="pad">
      <div class="card">
        ${s.exercises.map((ex) => exBlock(ex, u, isCardio)).join('') || '<div class="muted tiny">Nothing logged.</div>'}
      </div>
    </div>

    ${s.notes ? `
      <div class="section-label">Notes</div>
      <div class="pad"><div class="card" style="font-size:14.5px;line-height:1.55;white-space:pre-wrap">${esc(s.notes)}</div></div>` : ''}

    <div class="pad" style="padding-top:20px;padding-bottom:8px">
      <button class="btn" data-edit2>${icon('edit')} Edit session</button>
    </div>
  `;

  view.querySelector('[data-back]').addEventListener('click', () => back());
  view.querySelector('[data-edit]').addEventListener('click', () => go(`#/log/${s.id}`));
  view.querySelector('[data-edit2]').addEventListener('click', () => go(`#/log/${s.id}`));
}

/* Which stack it was on, and what its numbers count for — otherwise 90 on a
   cable that reads high looks like a personal best. */
function gearNote(ex) {
  const m = ex.machineId ? getMachine(ex.machineId) : null;
  if (!m) return '';
  const f = machineFactor(ex.machineId);
  const note = f === 1 ? '' : ` · ` + fmtNum(f * 100, 0) + `%`;
  return `<span class="det-gear">` + esc(m.name) + note + `</span>`;
}

function totalDistance(s) {
  return (s.exercises || []).reduce(
    (t, ex) => t + (ex.sets || []).reduce((n, x) => n + num(x.weight), 0), 0);
}

function exBlock(ex, u, isCardio) {
  const vol = isCardio ? 0 : exerciseVolume(ex);
  const unitA = u.a.toLowerCase();
  const unitB = u.b.toLowerCase();

  return `
    <div class="det-ex">
      <div class="det-ex-name">${esc(ex.name)}${gearNote(ex)}</div>
      <div class="det-sets">
        ${ex.sets.map((x) => isCardio
          ? `<span class="det-set"><b>${fmtNum(x.reps)}</b> ${unitA}${num(x.weight) ? ` · <b>${fmtNum(x.weight)}</b> ${unitB}` : ''}</span>`
          : `<span class="det-set"><b>${num(x.reps)}</b> × <b>${fmtNum(x.weight)}</b>${unitB}</span>`).join('')}
      </div>
      ${vol ? `<div class="det-total">${ex.sets.length} sets · ${compact(vol)} kg volume</div>` : ''}
    </div>`;
}
