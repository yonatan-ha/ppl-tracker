/* Cable stacks and their calibration.

   Three stations, three different ideas of what a kilogram is. Nothing here
   recovers the true weight — nobody knows what the sticker on a worn stack
   really means. What it does is make the numbers comparable: one stack is the
   reference, every other one records how its readings translate, and a
   pushdown logged anywhere lands on the same scale. */

import {
  uid, sortedMachines, getMachine, referenceMachine, upsertMachine, deleteMachine,
  isCalibrated, setUsesStack, stackExerciseNames, num
} from './store.js';
import { esc, icon, toast, openSheet, closeSheet, confirmSheet, fmtNum } from './ui.js';
import { back } from './app.js';
import { pickExerciseSheet } from './editor.js';

export function renderMachines(view) {
  const machines = sortedMachines();
  const ref = referenceMachine();
  const stackNames = stackExerciseNames();

  view.innerHTML = `
    <header class="screen-head bordered">
      <button class="icon-btn plain" data-back aria-label="Back">${icon('back')}</button>
      <div class="screen-title">Cables</div>
    </header>

    <div class="pad tiny muted" style="padding-top:10px;line-height:1.6">
      Each station reads differently. Say what you do on
      <b>${esc(ref ? ref.name : 'the reference')}</b> and what you do on the others for the
      same effort, and every logged set lands on one scale.
    </div>

    <div class="section-label">Stations</div>
    ${machines.map((m) => `
      <button class="list-row ${m.reference ? 'c-pull' : isCalibrated(m) ? 'c-abs' : 'c-legs'}" data-m="${m.id}">
        <span class="swatch">${m.reference ? '&#9733;' : isCalibrated(m) ? icon('check') : '?'}</span>
        <span class="lr-main">
          <span class="lr-title">${esc(m.name)}</span>
          <span class="lr-sub">${esc(statusLine(m, ref))}</span>
        </span>
        <span class="chev">${icon('chev')}</span>
      </button>`).join('')}

    <div class="pad" style="padding-top:16px">
      <button class="btn ghost" data-add>${icon('plus')} Add a station</button>
    </div>

    <div class="section-label">Exercises on these cables</div>
    ${stackNames.length ? stackNames.map((name) => `
      <div class="list-row">
        <span class="lr-main"><span class="lr-title">${esc(name)}</span></span>
        <button class="icon-btn plain" data-drop="${esc(name)}" aria-label="Remove ${esc(name)}">${icon('close')}</button>
      </div>`).join('') : `
      <div class="pad tiny muted center" style="padding:14px 8px">None yet.</div>`}

    <div class="pad" style="padding-top:14px;padding-bottom:8px">
      <button class="btn ghost" data-add-ex>${icon('plus')} Add an exercise</button>
    </div>

    <div class="pad tiny muted" style="padding:14px 16px 30px;line-height:1.6">
      Only these exercises ask which station you used. Everything else — dumbbells,
      barbells, the fixed machines — never does.
    </div>
  `;

  view.querySelector('[data-back]').addEventListener('click', () => back('#/settings'));

  view.querySelectorAll('[data-m]').forEach((b) =>
    b.addEventListener('click', () => calibrateSheet(getMachine(b.dataset.m), view)));

  view.querySelector('[data-add]').addEventListener('click', () => {
    const created = { id: uid(), name: `Cable ${sortedMachines().length + 1}`, factor: null, reference: false };
    upsertMachine(created);
    calibrateSheet(created, view);
  });

  view.querySelector('[data-add-ex]').addEventListener('click', async () => {
    const name = await pickExerciseSheet({ type: 'push', title: 'Which exercise?' });
    if (!name) return;
    setUsesStack(name, true);
    renderMachines(view);
  });

  view.querySelectorAll('[data-drop]').forEach((b) => b.addEventListener('click', () => {
    setUsesStack(b.dataset.drop, false);
    renderMachines(view);
  }));
}

function statusLine(m, ref) {
  if (m.reference) return 'Reference — everything converts to this';
  if (!isCalibrated(m)) return 'Not calibrated — counts 1:1 for now';
  return `Counts as ${fmtNum(m.factor * 100, 0)}% of ${ref ? ref.name : 'reference'}`;
}

/* Calibration asks the only question you can actually answer standing in the
   gym: the same set, on two stacks, reads what and what? */
function calibrateSheet(m, view) {
  if (!m) return;
  const ref = referenceMachine();
  const isRef = !!m.reference;

  // Seed the pair from any factor already set, so reopening shows your answer.
  const seedRef = 40;
  const seedHere = m.factor ? String(Math.round((seedRef / m.factor) * 10) / 10) : '';

  openSheet({
    title: m.name,
    bodyHTML: `
      <div class="pad stack" style="padding-bottom:10px">
        <input class="field" id="m-name" value="${esc(m.name)}" placeholder="Name"
               autocapitalize="words" autocomplete="off">

        ${isRef ? `
          <p class="tiny muted" style="line-height:1.6">
            This is the reference. Its numbers are the scale, so there is nothing to
            calibrate — every other station is expressed in these.
          </p>` : `
          <p class="tiny muted" style="line-height:1.6">
            Same exercise, same effort, two stations. What does each one read?
          </p>

          <div class="cal-pair">
            <label>${esc(ref ? ref.name : 'Reference')}</label>
            <input class="field" id="m-ref" inputmode="decimal" value="${seedRef}" placeholder="40">
          </div>
          <div class="cal-pair">
            <label>${esc(m.name)}</label>
            <input class="field" id="m-here" inputmode="decimal" value="${esc(seedHere)}" placeholder="90">
          </div>

          <div class="cal-out" id="m-out"></div>`}

        <button class="btn primary" data-save>${icon('check')} Save</button>
        ${isRef ? '' : `
          <button class="btn" data-clear>Mark not calibrated</button>
          <button class="btn danger" data-del>${icon('trash')} Remove station</button>`}
      </div>`,

    onMount(sheet) {
      const nameEl = sheet.querySelector('#m-name');
      const refEl = sheet.querySelector('#m-ref');
      const hereEl = sheet.querySelector('#m-here');
      const out = sheet.querySelector('#m-out');

      const factorNow = () => {
        const a = num(refEl && refEl.value);
        const b = num(hereEl && hereEl.value);
        return a > 0 && b > 0 ? a / b : null;
      };

      const draw = () => {
        if (!out) return;
        const f = factorNow();
        const here = num(hereEl.value);
        out.innerHTML = f
          ? `<b>${esc(nameEl.value.trim() || m.name)}</b> counts as <b>${fmtNum(f * 100, 0)}%</b> — ` +
            `${fmtNum(here)} on it is ${fmtNum(here * f)} on ${esc(ref ? ref.name : 'the reference')}.`
          : 'Fill in both numbers to see the conversion.';
      };
      if (refEl) refEl.addEventListener('input', draw);
      if (hereEl) hereEl.addEventListener('input', draw);
      if (nameEl) nameEl.addEventListener('input', draw);
      draw();

      sheet.querySelector('[data-save]').addEventListener('click', () => {
        const next = { ...m, name: nameEl.value.trim() || m.name };
        if (!isRef) {
          const f = factorNow();
          if (!f) { toast('Enter both numbers, or mark it not calibrated', 'error'); return; }
          next.factor = f;
        }
        upsertMachine(next);
        closeSheet();
        toast(`${next.name} saved`, 'ok');
        renderMachines(view);
      });

      const clear = sheet.querySelector('[data-clear]');
      if (clear) clear.addEventListener('click', () => {
        upsertMachine({ ...m, name: nameEl.value.trim() || m.name, factor: null });
        closeSheet();
        renderMachines(view);
      });

      const del = sheet.querySelector('[data-del]');
      if (del) del.addEventListener('click', async () => {
        closeSheet();
        const ok = await confirmSheet({
          title: `Remove ${m.name}?`,
          message: 'Sets already logged on it keep their numbers and stop being converted.',
          confirmLabel: 'Remove', danger: true
        });
        if (!ok) return;
        deleteMachine(m.id);
        toast(`${m.name} removed`, 'ok');
        renderMachines(view);
      });
    }
  });
}
