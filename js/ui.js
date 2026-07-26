/* UI primitives: escaping, icons, the brand mark, toasts, sheets, busy states. */

export function esc(s) {
  return String(s == null ? '' : s)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

/* ---------------- brand ----------------
   LOGO PLACEHOLDER — swap the SVG below for your own mark.
   Keep the 0 0 48 48 viewBox and it will drop straight into the sidebar, the
   setup screen and the boot splash at every size they use. The three bars echo
   the Push / Pull / Legs blocks on the calendar. */

export function brandMarkSVG() {
  return `
    <svg viewBox="0 0 48 48" role="img" aria-label="PPL">
      <defs>
        <linearGradient id="ppl-brand" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stop-color="var(--blue-600)"/>
          <stop offset="1" stop-color="var(--cyan-400)"/>
        </linearGradient>
      </defs>
      <rect x="1.5" y="1.5" width="45" height="45" rx="11" fill="url(#ppl-brand)"/>
      <rect x="11" y="14"   width="26" height="5.4" rx="1.4" fill="var(--on-accent)" opacity=".95"/>
      <rect x="11" y="21.3" width="17" height="5.4" rx="1.4" fill="var(--on-accent)" opacity=".72"/>
      <rect x="11" y="28.6" width="26" height="5.4" rx="1.4" fill="var(--on-accent)" opacity=".95"/>
    </svg>`;
}

/* Fills every [data-brand-mark] slot in the document. */
export function paintBrandMarks(root = document) {
  root.querySelectorAll('[data-brand-mark]').forEach((el) => {
    if (!el.firstChild) el.innerHTML = brandMarkSVG();
  });
}

/* ---------------- icons ---------------- */

const ICON_PATHS = {
  back: '<path d="M15 19l-7-7 7-7"/>',
  chev: '<path d="M9 18l6-6-6-6"/>',
  chevDown: '<path d="M6 9l6 6 6-6"/>',
  close: '<path d="M18 6L6 18M6 6l12 12"/>',
  gear: '<circle cx="12" cy="12" r="3.2"/><path d="M19.4 15a1.6 1.6 0 00.32 1.77l.06.06a2 2 0 11-2.83 2.83l-.06-.06a1.6 1.6 0 00-1.77-.32 1.6 1.6 0 00-1 1.47V21a2 2 0 11-4 0v-.1a1.6 1.6 0 00-1.05-1.47 1.6 1.6 0 00-1.77.32l-.06.06a2 2 0 11-2.83-2.83l.06-.06a1.6 1.6 0 00.32-1.77 1.6 1.6 0 00-1.47-1H3a2 2 0 110-4h.1a1.6 1.6 0 001.47-1.05 1.6 1.6 0 00-.32-1.77l-.06-.06a2 2 0 112.83-2.83l.06.06a1.6 1.6 0 001.77.32H9a1.6 1.6 0 001-1.47V3a2 2 0 114 0v.1a1.6 1.6 0 001 1.47 1.6 1.6 0 001.77-.32l.06-.06a2 2 0 112.83 2.83l-.06.06a1.6 1.6 0 00-.32 1.77V9a1.6 1.6 0 001.47 1H21a2 2 0 110 4h-.1a1.6 1.6 0 00-1.47 1z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6"/>',
  edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.12 2.12 0 013 3L7 19l-4 1 1-4z"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  copy: '<rect x="9" y="9" width="12" height="12" rx="2"/><path d="M5 15V5a2 2 0 012-2h10"/>',
  calendar: '<rect x="3" y="5" width="18" height="16" rx="3"/><path d="M3 10h18M8 3v4M16 3v4"/>',
  alert: '<path d="M12 9v4M12 17h.01"/><path d="M10.3 3.9L2 18a2 2 0 001.7 3h16.6a2 2 0 001.7-3L13.7 3.9a2 2 0 00-3.4 0z"/>',
  download: '<path d="M12 3v12M7 11l5 5 5-5M4 21h16"/>',
  upload: '<path d="M12 16V4M7 9l5-5 5 5M4 21h16"/>'
};

export function icon(name, cls) {
  return `<svg viewBox="0 0 24 24" class="${cls || ''}" aria-hidden="true" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">${ICON_PATHS[name] || ''}</svg>`;
}

/* ---------------- toasts ---------------- */

/* toast('Saved')            neutral
   toast('Saved', 'ok')      success
   toast('Failed', 'error')  error — held on screen longer, it matters more */
export function toast(message, kind = 'ok') {
  const root = document.getElementById('toast-root');
  if (!root) return;

  const el = document.createElement('div');
  el.className = `toast ${kind}`;
  const glyph = kind === 'error' ? 'alert' : kind === 'ok' ? 'check' : '';
  el.innerHTML = `${glyph ? icon(glyph) : ''}<span>${esc(message)}</span>`;
  root.appendChild(el);

  // Never stack more than three; the oldest goes first.
  while (root.children.length > 3) root.firstChild.remove();

  const life = kind === 'error' ? 4200 : 2300;
  setTimeout(() => {
    el.classList.add('out');
    setTimeout(() => el.remove(), 220);
  }, life);
}

/* ---------------- busy state ---------------- */

/* Wraps a real async action: the button shows a spinner and stops accepting
   taps until the work settles. Never used to fake latency. */
export async function withBusy(button, label, work) {
  if (!button) return work();
  const original = button.innerHTML;
  button.classList.add('is-busy');
  button.setAttribute('aria-busy', 'true');
  button.innerHTML = `<span class="spinner"></span><span>${esc(label || 'Working…')}</span>`;
  try {
    return await work();
  } finally {
    button.classList.remove('is-busy');
    button.removeAttribute('aria-busy');
    button.innerHTML = original;
  }
}

/* ---------------- bottom sheet ---------------- */

let closeCurrent = null;

export function openSheet({ title, bodyHTML, onMount, headRight }) {
  closeSheet();
  const root = document.getElementById('sheet-root');
  root.innerHTML = `
    <div class="scrim" data-scrim>
      <div class="sheet" role="dialog" aria-modal="true"${title ? ' aria-label="' + esc(title) + '"' : ''}>
        <div class="sheet-grab"></div>
        ${title ? `<div class="sheet-head"><h2>${esc(title)}</h2>${headRight || ''}</div>` : ''}
        <div class="sheet-body">${bodyHTML || ''}</div>
      </div>
    </div>`;

  const scrim = root.querySelector('[data-scrim]');
  scrim.addEventListener('click', (e) => { if (e.target === scrim) closeSheet(); });

  const onKey = (e) => { if (e.key === 'Escape') closeSheet(); };
  document.addEventListener('keydown', onKey);

  closeCurrent = () => {
    document.removeEventListener('keydown', onKey);
    root.innerHTML = '';
    closeCurrent = null;
  };

  if (onMount) onMount(root.querySelector('.sheet'));
  return closeSheet;
}

export function closeSheet() {
  if (closeCurrent) closeCurrent();
}

export function isSheetOpen() {
  return !!closeCurrent;
}

/* Yes/no confirmation. Resolves true/false. */
export function confirmSheet({ title, message, confirmLabel = 'Confirm', danger = false }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (!answered) { answered = true; closeSheet(); resolve(v); } };
    openSheet({
      title,
      bodyHTML: `
        <div class="pad stack" style="padding-bottom:8px">
          ${message ? `<p class="muted" style="font-size:14.5px;line-height:1.55">${esc(message)}</p>` : ''}
          <button class="btn ${danger ? 'danger' : 'primary'}" data-yes>${esc(confirmLabel)}</button>
          <button class="btn" data-no>Cancel</button>
        </div>`,
      onMount(sheet) {
        sheet.querySelector('[data-yes]').addEventListener('click', () => done(true));
        sheet.querySelector('[data-no]').addEventListener('click', () => done(false));
        sheet.closest('.scrim').addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) done(false); });
      }
    });
  });
}

/* Single-choice list sheet. Resolves the chosen value, or null. */
export function pickSheet({ title, options }) {
  return new Promise((resolve) => {
    let answered = false;
    const done = (v) => { if (!answered) { answered = true; closeSheet(); resolve(v); } };
    openSheet({
      title,
      bodyHTML: options.map((o, i) => `
        <button class="list-row ${o.colorClass || ''}" data-i="${i}">
          ${o.swatch ? `<span class="swatch">${esc(o.swatch)}</span>` : ''}
          <span class="lr-main">
            <span class="lr-title">${esc(o.label)}</span>
            ${o.sub ? `<span class="lr-sub">${esc(o.sub)}</span>` : ''}
          </span>
          <span class="chev">${icon('chev')}</span>
        </button>`).join(''),
      onMount(sheet) {
        sheet.querySelectorAll('[data-i]').forEach((b) => {
          b.addEventListener('click', () => done(options[+b.dataset.i].value));
        });
        sheet.closest('.scrim').addEventListener('click', (e) => { if (e.target.classList.contains('scrim')) done(null); });
      }
    });
  });
}

/* ---------------- formatting ---------------- */

export function fmtNum(n, digits = 1) {
  const v = Number(n) || 0;
  if (Math.abs(v) >= 1000) return Math.round(v).toLocaleString();
  return String(parseFloat(v.toFixed(digits)));
}

/* 12500 -> "12.5k" for compact chart labels and KPIs. */
export function compact(n) {
  const v = Number(n) || 0;
  if (v >= 1e6) return (v / 1e6).toFixed(1).replace(/\.0$/, '') + 'M';
  if (v >= 1e3) return (v / 1e3).toFixed(1).replace(/\.0$/, '') + 'k';
  return String(Math.round(v));
}
