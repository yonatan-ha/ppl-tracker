/* Stats: per-exercise progress, volume over time, frequency vs target. */

import {
  state, sortedSessions, sessionVolume, sessionMinutes, topSet, est1RM,
  num, weekStart, isoDate, parseISO, MAIN_TYPES, TYPE_LABEL
} from './store.js';
import { esc, icon, compact, fmtNum, pickSheet } from './ui.js';
import { lineChart, barChart, progressRing, wireChartTaps } from './charts.js';

const WEEKS = 12;
const VOLUME_FILTERS = ['all', 'push', 'pull', 'legs', 'abs'];

let selectedExercise = null;
let volumeFilter = 'all';

/* Charting a long history costs real work, so show the frame and skeletons
   first and fill them in on the next frame — the tab never feels stuck. */
export function renderStats(view) {
  const sessions = sortedSessions();

  if (!sessions.length) {
    view.innerHTML = `
      <header class="screen-head"><div class="screen-title">Stats</div></header>
      <div class="empty"><strong>No data yet</strong>Log a couple of sessions and your progress, volume and frequency show up here.</div>`;
    return;
  }

  if (sessions.length > 40) {
    view.innerHTML = statsSkeleton(sessions.length);
    requestAnimationFrame(() => requestAnimationFrame(() => paintStats(view, sessions)));
  } else {
    paintStats(view, sessions);
  }
}

function statsSkeleton(count) {
  const card = `
    <div class="stat-card">
      <div class="skeleton sk-line short"></div>
      <div class="skeleton sk-chart"></div>
      <div class="skeleton sk-line"></div>
    </div>`;
  return `
    <header class="screen-head"><div class="screen-title">Stats<small>${count} sessions logged</small></div></header>
    <div class="pad stack" style="gap:14px" aria-busy="true">${card + card + card}</div>`;
}

function paintStats(view, sessions) {
  const history = exerciseHistory(sessions);
  const names = [...history.keys()];
  if (!selectedExercise || !history.has(selectedExercise)) {
    // Default to your most-logged lifting exercise.
    selectedExercise = [...names].sort((a, b) => liftCount(history, b) - liftCount(history, a))[0];
  }

  const weeks = lastWeeks(WEEKS);

  view.innerHTML = `
    <header class="screen-head"><div class="screen-title">Stats<small>${sessions.length} sessions logged</small></div></header>
    <div class="pad" style="padding-bottom:14px">${ringsPanel(sessions, weeks)}</div>
    <div class="pad stack stats-grid" style="gap:14px">
      ${exercisePanel(history)}
      ${volumePanel(sessions, weeks)}
      ${frequencyPanel(sessions, weeks)}
    </div>
    <div style="height:16px"></div>
  `;

  view.querySelector('[data-pick-ex]').addEventListener('click', async () => {
    const opts = [...names]
      .sort((a, b) => history.get(b).length - history.get(a).length)
      .map((n) => ({ label: n, sub: `${history.get(n).length} sessions`, value: n }));
    const picked = await pickSheet({ title: 'Choose exercise', options: opts });
    if (picked) { selectedExercise = picked; paintStats(view, sessions); }
  });

  view.querySelectorAll('[data-vol]').forEach((b) => b.addEventListener('click', () => {
    volumeFilter = b.dataset.vol; paintStats(view, sessions);
  }));

  wireChartTaps(view);
}

/* ---------------- rings: the at-a-glance row ---------------- */

function ringsPanel(sessions, weeks) {
  const target = state.settings.weeklyTarget || 5;

  const inWeek = (w) => sessions.filter(
    (s) => MAIN_TYPES.includes(s.type) && s.date >= w.startISO && s.date <= w.endISO).length;

  const thisWeek = inWeek(weeks[weeks.length - 1]);
  const weekPct = Math.min(100, (thisWeek / target) * 100);

  // Consistency: how many of the last 12 weeks met the target.
  const met = weeks.filter((w) => inWeek(w) >= target).length;
  const consistency = (met / weeks.length) * 100;

  // Volume trend: this week against the 12-week average, capped at 100.
  const vols = weeks.map((w) => sessions
    .filter((s) => s.date >= w.startISO && s.date <= w.endISO)
    .reduce((t, s) => t + sessionVolume(s), 0));
  const active = vols.filter((v) => v > 0);
  const avgVol = active.length ? active.reduce((a, b) => a + b, 0) / active.length : 0;
  const volPct = avgVol ? Math.min(100, (vols[vols.length - 1] / avgVol) * 100) : 0;

  const cards = [
    { label: `Week · ${thisWeek}/${target}`, value: weekPct },
    { label: `Consistency · ${met}/${weeks.length}`, value: consistency },
    { label: 'Volume vs avg', value: volPct }
  ];

  return `
    <div class="rings">
      ${cards.map((c) => `
        <div class="ring-card">
          ${progressRing(c.value)}
          <div class="ring-label">${esc(c.label)}</div>
        </div>`).join('')}
    </div>`;
}

/* ---------------- panel 1: per exercise ---------------- */

function exercisePanel(history) {
  const entries = history.get(selectedExercise) || [];
  const isCardio = entries.length && entries[entries.length - 1].type === 'cardio';
  const color = isCardio ? 'var(--slate-300)' : 'var(--accent)';

  // Cardio progresses in minutes; everything else in top-set load.
  const points = entries.map((e) => {
    const when = parseISO(e.date).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
    if (isCardio) {
      const mins = (e.ex.sets || []).reduce((t, x) => t + num(x.reps), 0);
      const km = (e.ex.sets || []).reduce((t, x) => t + num(x.weight), 0);
      return { y: mins, label: when, cap: `${when} · ${fmtNum(mins, 0)} min${km ? ` · ${fmtNum(km)} km` : ''}`, color };
    }
    const t = topSet(e.ex);
    const w = num(t && t.weight), r = num(t && t.reps);
    return {
      y: w, label: when,
      cap: `${when} · top set ${r}×${fmtNum(w)}kg · e1RM ${fmtNum(est1RM(w, r), 0)}kg`,
      color
    };
  });

  const best = points.reduce((m, p) => Math.max(m, p.y), 0);
  const bestE1RM = isCardio ? 0 : entries.reduce((m, e) => {
    const t = topSet(e.ex);
    return Math.max(m, est1RM(t && t.weight, t && t.reps));
  }, 0);

  const delta = points.length > 1 ? points[points.length - 1].y - points[0].y : 0;
  const unit = isCardio ? 'min' : 'kg';

  const kpis = isCardio
    ? [[fmtNum(best, 0), 'LONGEST MIN'], [fmtNum(points.reduce((t, p) => t + p.y, 0), 0), 'TOTAL MIN'], [entries.length, 'SESSIONS']]
    : [[fmtNum(best), 'BEST KG'], [fmtNum(bestE1RM, 0), 'EST. 1RM'], [entries.length, 'SESSIONS']];

  return `
    <div class="stat-card" data-chart>
      <div class="stat-head"><h3>Progress</h3><span class="hint">${isCardio ? 'minutes per session' : 'top set per session'}</span></div>
      <button class="picker" data-pick-ex>
        <span>${esc(selectedExercise || 'Pick an exercise')}</span>
        ${icon('chevDown')}
      </button>
      ${lineChart(points, { color })}
      <div class="chart-caption">${points.length > 1
        ? `${delta >= 0 ? '+' : ''}${fmtNum(delta)} ${unit} since ${points[0].label} · tap a point`
        : 'Log this one again to see a trend'}</div>
      <div class="kpis" style="padding:4px 2px 6px">
        ${kpis.map(([v, l]) => `<div class="kpi"><div class="kpi-v">${v}</div><div class="kpi-l">${l}</div></div>`).join('')}
      </div>
    </div>`;
}

/* ---------------- panel 2: volume ---------------- */

function volumePanel(sessions, weeks) {
  const TYPE_SOLID = {
    push: 'var(--red-500)', pull: 'var(--blue-500)', legs: 'var(--amber-400)', abs: 'var(--green-500)'
  };
  const color = volumeFilter === 'all' ? 'var(--accent)' : TYPE_SOLID[volumeFilter];

  const bars = weeks.map((w) => {
    const inWeek = sessions
      .filter((s) => s.date >= w.startISO && s.date <= w.endISO && s.type !== 'cardio')
      .filter((s) => volumeFilter === 'all' || s.type === volumeFilter);
    const vol = inWeek.reduce((t, s) => t + sessionVolume(s), 0);
    const sets = inWeek.reduce((t, s) => t + s.exercises.reduce((n, e) => n + e.sets.length, 0), 0);
    return {
      label: w.label, value: vol, color,
      cap: `Week of ${w.label} · ${compact(vol)} kg · ${sets} sets · ${inWeek.length} session${inWeek.length === 1 ? '' : 's'}`
    };
  });

  const totals = bars.map((b) => b.value).filter((v) => v > 0);
  const avg = totals.length ? totals.reduce((a, b) => a + b, 0) / totals.length : 0;
  const thisWeek = bars[bars.length - 1].value;

  return `
    <div class="stat-card" data-chart>
      <div class="stat-head"><h3>Volume</h3><span class="hint">sets × reps × kg, weekly</span></div>
      <div class="scroll-x" style="padding:0 2px 10px">
        ${VOLUME_FILTERS.map((t) => `<button class="chip ${t === 'all' ? '' : `c-${t}`} ${volumeFilter === t ? 'on' : ''}" data-vol="${t}">${t === 'all' ? 'All' : TYPE_LABEL[t]}</button>`).join('')}
      </div>
      ${barChart(bars, { color })}
      <div class="chart-caption">This week ${compact(thisWeek)} kg · ${WEEKS}-week average ${compact(avg)} kg</div>
    </div>`;
}

/* ---------------- panel 3: frequency ---------------- */

function frequencyPanel(sessions, weeks) {
  const target = state.settings.weeklyTarget || 5;

  const bars = weeks.map((w) => {
    const inWeek = sessions.filter((s) => s.date >= w.startISO && s.date <= w.endISO);
    const counts = { push: 0, pull: 0, legs: 0, abs: 0, cardio: 0 };
    inWeek.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });
    const lifts = MAIN_TYPES.reduce((t, k) => t + counts[k], 0);
    const extras = counts.abs + counts.cardio;
    return {
      label: w.label,
      value: lifts,
      segments: MAIN_TYPES.map((t) => ({
        value: counts[t],
        color: { push: 'var(--red-500)', pull: 'var(--blue-500)', legs: 'var(--amber-400)' }[t]
      })),
      cap: `Week of ${w.label} · ${lifts}/${target} lifting · ${MAIN_TYPES.map((t) => `${counts[t]} ${TYPE_LABEL[t]}`).join(', ')}${extras ? ` · +${counts.abs} abs, ${counts.cardio} cardio` : ''}`
    };
  });

  const counts = bars.map((b) => b.value);
  const thisWeek = counts[counts.length - 1];
  const last4 = counts.slice(-4);
  const avg4 = last4.reduce((a, b) => a + b, 0) / (last4.length || 1);
  const onTarget = counts.filter((c) => c >= target).length;

  return `
    <div class="stat-card" data-chart>
      <div class="stat-head"><h3>Frequency</h3><span class="hint">lifting days vs ${target}×/week</span></div>
      ${barChart(bars, { target, targetLabel: `${target}×` })}
      <div class="chart-caption">Tap a week for the full breakdown</div>
      <div class="kpis" style="padding:4px 2px 6px">
        <div class="kpi"><div class="kpi-v">${thisWeek}</div><div class="kpi-l">THIS WEEK</div></div>
        <div class="kpi"><div class="kpi-v">${fmtNum(avg4)}</div><div class="kpi-l">4-WK AVG</div></div>
        <div class="kpi"><div class="kpi-v">${onTarget}<span style="font-size:13px;color:var(--dimmer)">/${WEEKS}</span></div><div class="kpi-l">ON TARGET</div></div>
      </div>
      <div class="chips" style="padding:2px 2px 4px;justify-content:center">
        ${MAIN_TYPES.map((t) => `<span class="pill c-${t}" style="font-size:11px;padding:3px 9px">${TYPE_LABEL[t]}</span>`).join('')}
      </div>
    </div>`;
}

/* ---------------- helpers ---------------- */

/* name -> [{date, ex, type}] in chronological order. */
function exerciseHistory(sessions) {
  const map = new Map();
  for (const s of sessions) {
    for (const ex of s.exercises || []) {
      const name = ex.name.trim();
      if (!name || !ex.sets || !ex.sets.length) continue;
      if (!map.has(name)) map.set(name, []);
      map.get(name).push({ date: s.date, ex, type: s.type });
    }
  }
  return map;
}

/* How often an exercise appears on a lifting day — used to pick a default. */
function liftCount(history, name) {
  return (history.get(name) || []).filter((e) => MAIN_TYPES.includes(e.type)).length;
}

/* The last N Monday-started weeks, oldest first. */
function lastWeeks(n) {
  const out = [];
  const thisMonday = weekStart(new Date());
  for (let i = n - 1; i >= 0; i--) {
    const start = new Date(thisMonday.getFullYear(), thisMonday.getMonth(), thisMonday.getDate() - i * 7);
    const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
    out.push({
      startISO: isoDate(start),
      endISO: isoDate(end),
      label: start.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
    });
  }
  return out;
}
