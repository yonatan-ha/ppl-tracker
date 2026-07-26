/* Hand-rolled inline SVG charts — no library, scales via viewBox, tap to inspect.
   Every chart renders into a container that also holds a .chart-caption line;
   wireChartTaps() hooks the tap targets up to that caption. */

import { esc, compact } from './ui.js';

const W = 340, H = 158;
const PAD = { t: 12, r: 10, b: 22, l: 30 };
const PLOT_W = W - PAD.l - PAD.r;
const PLOT_H = H - PAD.t - PAD.b;

function niceTicks(min, max, count = 3) {
  if (max <= min) return [min];
  const step = (max - min) / (count - 1);
  const out = [];
  for (let i = 0; i < count; i++) out.push(min + step * i);
  return out;
}

function gridlines(ticks, scaleY) {
  return ticks.map((t) => {
    const y = scaleY(t);
    return `<line x1="${PAD.l}" y1="${y}" x2="${W - PAD.r}" y2="${y}" stroke="var(--grid-line)" stroke-width="1" ${t === ticks[0] ? '' : 'stroke-dasharray="2 4"'}/>
            <text x="${PAD.l - 5}" y="${y + 3.5}" text-anchor="end" font-size="9.5" fill="var(--dimmer)">${esc(compact(t))}</text>`;
  }).join('');
}

/* points: [{ y, label, cap, color? }] — evenly spaced along x. */
export function lineChart(points, { color = 'var(--accent)', flat = false } = {}) {
  if (!points.length) return emptyChart('No data yet');

  const ys = points.map((p) => p.y);
  let min = Math.min(...ys), max = Math.max(...ys);
  if (min === max) { min = Math.max(0, min - 1); max = max + 1; }
  const span = max - min;
  min = Math.max(0, min - span * 0.12);
  max = max + span * 0.12;

  const scaleY = (v) => PAD.t + PLOT_H - ((v - min) / (max - min)) * PLOT_H;
  const scaleX = points.length === 1
    ? () => PAD.l + PLOT_W / 2
    : (i) => PAD.l + (i / (points.length - 1)) * PLOT_W;

  const path = points.map((p, i) => `${i ? 'L' : 'M'}${scaleX(i).toFixed(1)},${scaleY(p.y).toFixed(1)}`).join(' ');
  const area = `${path} L${scaleX(points.length - 1).toFixed(1)},${PAD.t + PLOT_H} L${scaleX(0).toFixed(1)},${PAD.t + PLOT_H} Z`;

  const dots = points.map((p, i) => {
    const r = points.length > 24 ? 2 : 3.2;
    return `<circle cx="${scaleX(i).toFixed(1)}" cy="${scaleY(p.y).toFixed(1)}" r="${r}"
             fill="var(--card)" stroke="${p.color || color}" stroke-width="2"/>`;
  }).join('');

  const hits = points.map((p, i) => {
    const w = PLOT_W / points.length;
    return `<rect x="${(scaleX(i) - w / 2).toFixed(1)}" y="${PAD.t}" width="${w.toFixed(1)}" height="${PLOT_H}"
             fill="transparent" data-cap="${esc(p.cap || '')}" data-i="${i}"/>`;
  }).join('');

  const marker = `<line data-marker x1="0" y1="${PAD.t}" x2="0" y2="${PAD.t + PLOT_H}" stroke="${color}" stroke-width="1" opacity="0"/>`;
  const xs = points.map((p, i) => ({ x: scaleX(i), y: scaleY(p.y) }));

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet" data-xy='${JSON.stringify(xs.map((p) => [Math.round(p.x), Math.round(p.y)]))}'>
      ${gridlines(niceTicks(min, max), scaleY)}
      ${flat ? '' : `<path d="${area}" fill="${color}" opacity=".10"/>`}
      <path d="${path}" fill="none" stroke="${color}" stroke-width="2.2" stroke-linejoin="round" stroke-linecap="round"/>
      ${dots}
      ${marker}
      <text x="${PAD.l}" y="${H - 6}" font-size="9.5" fill="var(--dimmer)">${esc(points[0].label || '')}</text>
      ${points.length > 1 ? `<text x="${W - PAD.r}" y="${H - 6}" text-anchor="end" font-size="9.5" fill="var(--dimmer)">${esc(points[points.length - 1].label || '')}</text>` : ''}
      ${hits}
    </svg>`;
}

/* bars: [{ label, value, cap, color, segments?: [{value,color}] }] */
export function barChart(bars, { color = 'var(--accent)', target = null, targetLabel = '' } = {}) {
  if (!bars.length) return emptyChart('No data yet');

  const totals = bars.map((b) => b.segments ? b.segments.reduce((t, s) => t + s.value, 0) : b.value);
  let max = Math.max(...totals, target || 0);
  if (max <= 0) max = 1;
  max = max * 1.14;

  const scaleY = (v) => PAD.t + PLOT_H - (v / max) * PLOT_H;
  const slot = PLOT_W / bars.length;
  const bw = Math.min(slot * 0.66, 26);

  const rects = bars.map((b, i) => {
    const cx = PAD.l + slot * i + slot / 2;
    const x = cx - bw / 2;
    const segs = b.segments || [{ value: b.value, color: b.color || color }];
    let acc = 0;
    const parts = segs.filter((s) => s.value > 0).map((s, si, arr) => {
      const y0 = scaleY(acc + s.value), y1 = scaleY(acc);
      acc += s.value;
      const isTop = si === arr.length - 1;
      const h = Math.max(1.5, y1 - y0);
      return `<rect x="${x.toFixed(1)}" y="${y0.toFixed(1)}" width="${bw.toFixed(1)}" height="${h.toFixed(1)}"
               fill="${s.color}" rx="${isTop ? 3 : 0}"/>`;
    }).join('');
    const empty = totals[i] === 0
      ? `<rect x="${x.toFixed(1)}" y="${(PAD.t + PLOT_H - 2).toFixed(1)}" width="${bw.toFixed(1)}" height="2" fill="var(--grid-line)" rx="1"/>`
      : '';
    return parts + empty +
      `<rect x="${(cx - slot / 2).toFixed(1)}" y="${PAD.t}" width="${slot.toFixed(1)}" height="${PLOT_H}"
        fill="transparent" data-cap="${esc(b.cap || '')}" data-i="${i}"/>`;
  }).join('');

  const every = bars.length > 8 ? Math.ceil(bars.length / 6) : 1;
  const labels = bars.map((b, i) => (i % every === 0 || i === bars.length - 1)
    ? `<text x="${(PAD.l + slot * i + slot / 2).toFixed(1)}" y="${H - 6}" text-anchor="middle" font-size="9" fill="var(--dimmer)">${esc(b.label)}</text>`
    : '').join('');

  const targetLine = target ? `
    <line x1="${PAD.l}" y1="${scaleY(target).toFixed(1)}" x2="${W - PAD.r}" y2="${scaleY(target).toFixed(1)}"
          stroke="var(--accent)" stroke-width="1.4" stroke-dasharray="4 3" opacity=".85"/>
    <text x="${W - PAD.r}" y="${(scaleY(target) - 4).toFixed(1)}" text-anchor="end" font-size="9" fill="var(--accent)" font-weight="700">${esc(targetLabel)}</text>` : '';

  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      ${gridlines(niceTicks(0, max / 1.14), scaleY)}
      ${rects}
      ${targetLine}
      ${labels}
    </svg>`;
}

function emptyChart(msg) {
  return `
    <svg class="chart" viewBox="0 0 ${W} ${H}" preserveAspectRatio="xMidYMid meet">
      <text x="${W / 2}" y="${H / 2}" text-anchor="middle" font-size="12" fill="var(--dimmer)">${esc(msg)}</text>
    </svg>`;
}

/* Tap anywhere on a chart to write that point's summary into its caption line. */
export function wireChartTaps(root) {
  root.querySelectorAll('[data-chart]').forEach((box) => {
    const caption = box.querySelector('.chart-caption');
    const svg = box.querySelector('svg');
    if (!caption || !svg) return;
    const fallback = caption.textContent;

    svg.querySelectorAll('[data-cap]').forEach((hit) => {
      const show = () => {
        caption.textContent = hit.dataset.cap || fallback;
        const marker = svg.querySelector('[data-marker]');
        const xy = svg.dataset.xy ? JSON.parse(svg.dataset.xy) : null;
        if (marker && xy && xy[+hit.dataset.i]) {
          marker.setAttribute('x1', xy[+hit.dataset.i][0]);
          marker.setAttribute('x2', xy[+hit.dataset.i][0]);
          marker.setAttribute('opacity', '.4');
        }
      };
      hit.addEventListener('click', show);
      hit.addEventListener('touchstart', show, { passive: true });
    });
  });
}
