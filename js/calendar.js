/* Month calendar: Notion-style event blocks.
   Lifting days get the big block; abs and cardio get their own smaller ones. */

import {
  state, sessionsByDate, isoDate, todayISO, weekStart, TYPES, MAIN_TYPES, TYPE_LABEL
} from './store.js';
import { esc, icon, pickSheet } from './ui.js';
import { go } from './app.js';
import { startLogFlow } from './editor.js';

const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// Which month is on screen; survives navigation within the session.
let cursor = new Date();
// Direction of the last month change, so the grid slides the way you swiped.
let slide = 0;

export function renderCalendar(view) {
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const byDate = sessionsByDate();
  const today = todayISO();

  // Grid starts on the Sunday of the week containing the 1st.
  const first = new Date(year, month, 1);
  const lead = first.getDay();
  const gridStart = new Date(year, month, 1 - lead);

  const cells = [];
  const counts = { push: 0, pull: 0, legs: 0, abs: 0, cardio: 0 };

  for (let i = 0; i < 42; i++) {
    const d = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    const iso = isoDate(d);
    const inMonth = d.getMonth() === month;
    const list = byDate.get(iso) || [];

    if (inMonth) list.forEach((s) => { counts[s.type] = (counts[s.type] || 0) + 1; });

    const blocks = list.slice(0, 3).map((s) => {
      const label = s.templateName || TYPE_LABEL[s.type];
      const size = MAIN_TYPES.includes(s.type) ? 'evt-main' : 'evt-small';
      return `<span class="evt ${size} c-${s.type}">${esc(label)}</span>`;
    }).join('');

    const label = list.length
      ? list.map((s) => s.templateName || TYPE_LABEL[s.type]).join(', ')
      : 'no workout — tap to log';

    // The cell itself takes the colour of the day's primary workout, so a month
    // reads as a constellation of lit tiles before you read a single word.
    const lead = list[0];
    const lit = lead ? ` has-workout c-${lead.type}` : '';

    cells.push(`
      <button class="cal-day${inMonth ? '' : ' out'}${lit}${iso === today ? ' today' : ''}" data-date="${iso}"
              aria-label="${esc(d.toLocaleDateString(undefined, { day: 'numeric', month: 'long' }) + ': ' + label)}">
        <span class="cal-num">${d.getDate()}</span>
        ${blocks}
      </button>`);
  }

  // Stop drawing trailing all-empty weeks so the month isn't padded with dead space.
  const weeks = [];
  for (let w = 0; w < 6; w++) weeks.push(cells.slice(w * 7, w * 7 + 7));
  while (weeks.length > 4) {
    const lastWeek = weeks[weeks.length - 1];
    if (lastWeek.every((c) => c.includes('cal-day out'))) weeks.pop();
    else break;
  }

  const lifts = MAIN_TYPES.reduce((t, k) => t + counts[k], 0);
  const monthName = first.toLocaleDateString(undefined, { month: 'long', year: 'numeric' });

  view.innerHTML = `
    <header class="screen-head">
      <div class="screen-title">${esc(monthName)}<small>${lifts} session${lifts === 1 ? '' : 's'} this month</small></div>
      <button class="icon-btn" data-prev aria-label="Previous month">${icon('back')}</button>
      <button class="icon-btn" data-next aria-label="Next month">${icon('chev')}</button>
      <button class="icon-btn hide-desktop" data-settings aria-label="Settings">${icon('gear')}</button>
    </header>

    ${monthRail(lifts)}

    <div class="cal-summary">
      ${TYPES.filter((t) => MAIN_TYPES.includes(t) || counts[t])
        .map((t) => `<span class="pill c-${t}">${TYPE_LABEL[t]} ${counts[t]}</span>`).join('')}
      ${!isCurrentMonth() ? '<button class="pill neutral" data-today>Today</button>' : ''}
    </div>

    <div class="cal-wrap">
      <div class="cal-dow">${DOW.map((d) => `<span>${d}</span>`).join('')}</div>
      <div class="cal-grid${slide > 0 ? ' slide-left' : slide < 0 ? ' slide-right' : ''}">${weeks.flat().join('')}</div>
    </div>

    ${lifts + counts.abs + counts.cardio === 0 ? `
      <div class="empty">
        <strong>Nothing logged yet</strong>
        Tap a day, or hit <b>+</b> to log a workout.
      </div>` : ''}
  `;

  view.querySelector('[data-prev]').addEventListener('click', () => shift(-1, view));
  view.querySelector('[data-next]').addEventListener('click', () => shift(1, view));
  view.querySelector('[data-settings]').addEventListener('click', () => go('#/settings'));
  const todayBtn = view.querySelector('[data-today]');
  if (todayBtn) todayBtn.addEventListener('click', () => { cursor = new Date(); renderCalendar(view); });

  view.querySelectorAll('[data-date]').forEach((cell) => {
    cell.addEventListener('click', () => openDay(cell.dataset.date, byDate));
  });

  attachSwipe(view.querySelector('.cal-grid'), view);
}

/* Kinetic's right-hand stat rail, adapted to a 5x/week split: how this week is
   going, how many weeks you've hit target back to back, and the month total. */
function monthRail(monthLifts) {
  const target = state.settings.weeklyTarget || 5;
  const thisWeek = liftsInWeek(weekStart(new Date()));
  const streak = weekStreak(target);

  return `
    <div class="month-rail">
      <div class="rail-card${thisWeek >= target ? ' lit' : ''}">
        <div class="rc-label">This week</div>
        <div class="rc-value">${thisWeek}<small> / ${target}</small></div>
      </div>
      <div class="rail-card${streak > 0 ? ' lit' : ''}">
        <div class="rc-label">Streak</div>
        <div class="rc-value">${streak}<small> ${streak === 1 ? 'wk' : 'wks'}</small></div>
      </div>
      <div class="rail-card">
        <div class="rc-label">Month</div>
        <div class="rc-value">${monthLifts}</div>
      </div>
    </div>`;
}

function liftsInWeek(sunday) {
  const start = isoDate(sunday);
  const endDate = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() + 6);
  const end = isoDate(endDate);
  return state.sessions.filter(
    (s) => MAIN_TYPES.includes(s.type) && s.date >= start && s.date <= end
  ).length;
}

/* Consecutive past weeks that met the target. The current week only counts once
   it's actually met, so a fresh Sunday never wipes the number out. */
function weekStreak(target) {
  let streak = 0;
  const sunday = weekStart(new Date());
  if (liftsInWeek(sunday) >= target) streak++;
  for (let i = 1; i <= 104; i++) {
    const back = new Date(sunday.getFullYear(), sunday.getMonth(), sunday.getDate() - i * 7);
    if (liftsInWeek(back) >= target) streak++;
    else break;
  }
  return streak;
}

function isCurrentMonth() {
  const now = new Date();
  return cursor.getFullYear() === now.getFullYear() && cursor.getMonth() === now.getMonth();
}

function shift(delta, view) {
  slide = delta;
  cursor = new Date(cursor.getFullYear(), cursor.getMonth() + delta, 1);
  renderCalendar(view);
  slide = 0;
}

/* A day can hold several workouts — a lifting session plus abs or cardio. */
async function openDay(iso, byDate) {
  const list = byDate.get(iso) || [];
  if (!list.length) { startLogFlow(iso); return; }
  if (list.length === 1) { go(`#/session/${list[0].id}`); return; }

  const options = list.map((s) => ({
    label: s.templateName || TYPE_LABEL[s.type],
    sub: `${s.exercises.length} exercise${s.exercises.length === 1 ? '' : 's'}`,
    value: s.id,
    swatch: TYPE_LABEL[s.type][0],
    colorClass: `c-${s.type}`
  }));
  options.push({ label: 'Log another workout', sub: 'Add a second session to this day', value: '__new__' });

  const picked = await pickSheet({ title: new Date(iso).toLocaleDateString(undefined, { weekday: 'long', day: 'numeric', month: 'long' }), options });
  if (!picked) return;
  if (picked === '__new__') startLogFlow(iso);
  else go(`#/session/${picked}`);
}

/* Horizontal swipe between months, without stealing vertical scrolling. */
function attachSwipe(grid, view) {
  let x0 = null, y0 = null, locked = false;

  grid.addEventListener('touchstart', (e) => {
    if (e.touches.length !== 1) return;
    x0 = e.touches[0].clientX; y0 = e.touches[0].clientY; locked = false;
  }, { passive: true });

  grid.addEventListener('touchmove', (e) => {
    if (x0 === null) return;
    const dx = e.touches[0].clientX - x0;
    const dy = e.touches[0].clientY - y0;
    if (!locked && Math.abs(dx) > 46 && Math.abs(dx) > Math.abs(dy) * 1.6) {
      locked = true;
      shift(dx < 0 ? 1 : -1, view);
      x0 = null;
    }
  }, { passive: true });

  grid.addEventListener('touchend', () => { x0 = null; }, { passive: true });
}
