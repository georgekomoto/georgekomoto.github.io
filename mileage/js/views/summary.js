// Summary — the year's deduction, purpose split, miles by month, rates in effect and CSV export.
// Re-renders on store changes. The selected year lives at module level so it survives tab switches.

import { escapeHtml, fmtDistance, fmtMoney, fmtCents, fmtNum, fmtDate, monthName, parseISO, toISODate, download } from '../format.js';
import { PURPOSES, purposeLabel } from '../store.js';

const PURPOSE_ORDER = ['business', 'medical', 'charity', 'personal'];
const DEDUCTIBLE = new Set(PURPOSES.filter((p) => p.deductible).map((p) => p.id));

// Chart geometry in CSS px. The SVG is drawn at the card's measured width so text stays true to size.
const CHART = { padTop: 24, plotH: 136, axisH: 22, gap: 8, maxBar: 24, minBar: 6, radius: 3, segGap: 2, fallbackW: 329 };

let selectedYear = null;

// ------------------------------------------------------------------ small helpers

function thisYear() { return new Date().getFullYear(); }
function cssEscape(s) { return (globalThis.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }
function plural(n, one) { return `${fmtNum(n, { max: 0 })} ${n === 1 ? one : `${one}s`}`; }
function unitWords(v, units) { const one = Math.abs(v - 1) < 1e-9; return units === 'km' ? (one ? 'kilometer' : 'kilometers') : (one ? 'mile' : 'miles'); }
function distanceWords(v, units) { return `${fmtNum(v, { max: v >= 1000 ? 0 : 1 })} ${unitWords(v, units)}`; }
/** A month value at the precision its total deserves: whole numbers from 100 up, one decimal below. */
function shortNum(v, ref = v) { return fmtNum(v, { max: ref >= 100 ? 0 : 1 }); }
function whatByMonth(units) { return units === 'km' ? 'Kilometers by month' : 'Miles by month'; }
const px = (n) => Math.round(n * 10) / 10;

/** Rate periods that overlap `year`, each clipped to the year: [{from, business, medical, charity, start, end}] */
function ratePeriodsForYear(store, year) {
  const periods = store.ratePeriods();
  const yStart = `${year}-01-01`;
  const yEnd = `${year}-12-31`;
  const out = [];
  periods.forEach((p, i) => {
    const next = periods[i + 1];
    const endExclusive = next ? next.from : null;
    if (p.from > yEnd) return;
    if (endExclusive && endExclusive <= yStart) return;
    const start = p.from > yStart ? p.from : yStart;
    let end = yEnd;
    if (endExclusive) {
      const d = parseISO(endExclusive);
      if (d) { d.setDate(d.getDate() - 1); const e = toISODate(d); if (e < end) end = e; }
    }
    out.push({ ...p, start, end });
  });
  // Dates before the earliest period fall back to it (store.ratePeriodFor does the same).
  if (!out.length && periods[0]) out.push({ ...periods[0], start: yStart, end: yEnd });
  return out;
}

// ------------------------------------------------------------------ chart maths

/** Two or three clean gridlines that bracket the max: {top, ticks} */
function niceTicks(max) {
  if (!(max > 0)) return { top: 0, ticks: [] };
  const pow = Math.pow(10, Math.floor(Math.log10(max)));
  for (let p = pow / 10; p <= pow * 100; p *= 10) {
    for (const s of [1, 2, 2.5, 5]) {
      const step = s * p;
      const n = Math.ceil(max / step - 1e-9);
      if (n >= 2 && n <= 3) return { top: n * step, ticks: Array.from({ length: n }, (_, i) => (i + 1) * step) };
    }
  }
  return { top: max, ticks: [max] };
}

function layoutChart(width, months) {
  const max = months.reduce((m, x) => Math.max(m, x.total), 0);
  const { top, ticks } = niceTicks(max);
  const tickLabels = ticks.map((t) => fmtNum(t, { max: 2 }));
  const longest = tickLabels.reduce((m, s) => Math.max(m, s.length), 0);
  const gutter = ticks.length ? Math.round(longest * 7.2 + 14) : 0;
  const plotW = Math.max(96, width - gutter);
  const slot = plotW / 12;
  const barW = Math.max(CHART.minBar, Math.min(CHART.maxBar, Math.round(slot - CHART.gap)));
  const baseline = CHART.padTop + CHART.plotH;
  const height = baseline + CHART.axisH;
  const scale = top > 0 ? CHART.plotH / top : 0;
  let maxIdx = -1;
  const bars = months.map((m, i) => {
    const cx = slot * i + slot / 2;
    const x = Math.round(cx - barW / 2);
    const hDed = m.ded > 0 ? Math.max(2, m.ded * scale) : 0;
    const hPer = m.per > 0 ? Math.max(2, m.per * scale) : 0;
    const h = hDed + hPer;
    if (m.total > 0 && (maxIdx < 0 || m.total > months[maxIdx].total)) maxIdx = i;
    return { i, cx: x + barW / 2, x, w: barW, hDed, hPer, h, top: baseline - h };
  });
  return { width, height, gutter, plotW, slot, baseline, top, ticks, tickLabels, scale, bars, maxIdx };
}

function rectPath(x, y, w, h) { return `M${px(x)},${px(y)}h${px(w)}v${px(h)}h${px(-w)}z`; }

/** Column with rounded top corners and a square base (data-end rounded, baseline square). */
function topRoundedRect(x, y, w, h, r) {
  const rr = Math.min(r, h, w / 2);
  if (rr <= 0.2) return rectPath(x, y, w, h);
  return `M${px(x)},${px(y + rr)}a${px(rr)},${px(rr)} 0 0 1 ${px(rr)},${px(-rr)}h${px(w - 2 * rr)}a${px(rr)},${px(rr)} 0 0 1 ${px(rr)},${px(rr)}v${px(h - rr)}h${px(-w)}z`;
}

function chartSvg(L, months, { year, units, isCurrentYear, nowMonth, hasData }) {
  const total = months.reduce((s, m) => s + m.total, 0);
  const ded = months.reduce((s, m) => s + m.ded, 0);
  const label = hasData
    ? `${whatByMonth(units)} in ${year}: ${distanceWords(total, units)} total, ${distanceWords(ded, units)} deductible. Busiest month ${monthName(L.maxIdx + 1)} with ${distanceWords(months[L.maxIdx].total, units)}.`
    : `${whatByMonth(units)} in ${year}: no trips logged.`;
  let out = `<svg class="summary-svg" width="${L.width}" height="${L.height}" viewBox="0 0 ${L.width} ${L.height}" role="img" aria-label="${escapeHtml(label)}">`;
  // Gridlines with right-aligned tick labels sitting just above each line
  L.ticks.forEach((t, k) => {
    const y = Math.round(L.baseline - t * L.scale) + 0.5;
    out += `<line class="summary-grid" x1="0" x2="${L.width}" y1="${y}" y2="${y}" shape-rendering="crispEdges"/>`;
    out += `<text class="summary-tick" x="${L.width}" y="${px(y - 4.5)}" text-anchor="end">${escapeHtml(L.tickLabels[k])}</text>`;
  });
  out += `<line class="summary-axis" x1="0" x2="${L.width}" y1="${L.baseline + 0.5}" y2="${L.baseline + 0.5}" shape-rendering="crispEdges"/>`;
  // Stacked columns: deductible from the baseline, personal on top, a 2px surface gap between them
  for (const b of L.bars) {
    const m = months[b.i];
    if (!(m.total > 0)) continue;
    let d = '';
    if (b.hDed > 0) {
      d += `<path class="seg-ded" d="${b.hPer > 0 ? rectPath(b.x, L.baseline - b.hDed, b.w, b.hDed) : topRoundedRect(b.x, L.baseline - b.hDed, b.w, b.hDed, CHART.radius)}"/>`;
    }
    if (b.hPer > 0) {
      const gap = b.hDed > 0 && b.hPer >= 4 ? CHART.segGap : 0;
      d += `<path class="seg-per" d="${topRoundedRect(b.x, L.baseline - b.h, b.w, b.hPer - gap, CHART.radius)}"/>`;
    }
    out += `<g class="summary-bar${b.i === L.maxIdx ? ' is-max' : ''}" data-i="${b.i}">${d}</g>`;
  }
  // The busiest month is the one value labeled directly
  if (hasData && L.maxIdx >= 0) {
    const b = L.bars[L.maxIdx];
    const text = fmtNum(months[L.maxIdx].total, { max: 0 });
    const half = text.length * 3.6 + 2;
    const x = Math.max(half, Math.min(L.plotW - half, b.cx));
    out += `<text class="summary-maxlbl" x="${px(x)}" y="${px(b.top - 6)}" text-anchor="middle">${escapeHtml(text)}</text>`;
  }
  for (const b of L.bars) {
    const now = isCurrentYear && b.i === nowMonth;
    out += `<text class="summary-month${now ? ' is-now' : ''}" x="${px(b.cx)}" y="${L.baseline + 16}" text-anchor="middle">${monthName(b.i + 1, true).charAt(0)}</text>`;
  }
  return `${out}</svg>`;
}

function tableHtml(months, year, units) {
  const rows = months.map((m, i) => (m.count > 0
    ? `<tr><th scope="row">${monthName(i + 1)}</th><td>${fmtNum(m.ded, { max: 1 })}</td><td>${fmtNum(m.per, { max: 1 })}</td><td>${fmtNum(m.total, { max: 1 })}</td><td>${m.count}</td></tr>`
    : '')).join('');
  if (!rows) return '';
  return `<table class="sr-only"><caption>${whatByMonth(units)}, ${year}</caption><thead><tr><th scope="col">Month</th><th scope="col">Deductible (${units})</th><th scope="col">Personal (${units})</th><th scope="col">Total (${units})</th><th scope="col">Trips</th></tr></thead><tbody>${rows}</tbody></table>`;
}

/**
 * Draws the chart into `host` and adds the readout layer: tap or drag across the columns (or focus the
 * chart and use the arrow keys) to see a month's numbers. Returns { destroy }.
 */
function mountChart(host, months, opts) {
  const { units } = opts;
  const hasData = months.some((m) => m.total > 0);
  let defaultIdx = 11;
  if (opts.isCurrentYear) defaultIdx = opts.nowMonth;
  else { let i = 11; while (i > 0 && !(months[i].total > 0)) i -= 1; defaultIdx = i; }

  let L = null;
  let width = 0;
  let sel = -1;
  let shown = false;
  let pressed = false;
  let moved = false;
  let toggleOff = false;
  let showTimer = 0;
  let scrub = null;
  let callout = null;
  let rule = null;

  const readout = (i) => {
    const m = months[i];
    const name = monthName(i + 1);
    if (!(m.total > 0)) return `${name}: no trips`;
    const parts = [];
    if (m.ded > 0) parts.push(`${shortNum(m.ded, m.total)} deductible`);
    if (m.per > 0) parts.push(`${shortNum(m.per, m.total)} personal`);
    return `${name}: ${distanceWords(m.total, units)}, ${parts.join(', ')}`;
  };

  function draw() {
    width = Math.round(host.clientWidth) || CHART.fallbackW;
    L = layoutChart(width, months);
    let html = chartSvg(L, months, { ...opts, hasData });
    if (hasData) {
      html += `<div class="summary-scrub" tabindex="0" role="slider" aria-label="Month" aria-orientation="horizontal" aria-valuemin="1" aria-valuemax="12" aria-valuenow="${defaultIdx + 1}" aria-valuetext="${escapeHtml(readout(defaultIdx))}" style="width:${px(L.plotW)}px;height:${L.baseline}px"></div>`;
      html += '<div class="summary-callout-rule" hidden aria-hidden="true"></div>';
      html += '<div class="summary-callout" hidden aria-hidden="true"><div class="summary-callout-title"></div><div class="summary-callout-value"></div><div class="summary-callout-sub"></div></div>';
    } else {
      html += `<div class="summary-chart-empty" style="top:${CHART.padTop}px;height:${CHART.plotH}px">No trips in ${escapeHtml(String(opts.year))}</div>`;
    }
    host.innerHTML = html;
    sel = -1; shown = false; pressed = false;
    host.classList.remove('is-scrubbing');
    scrub = host.querySelector('.summary-scrub');
    callout = host.querySelector('.summary-callout');
    rule = host.querySelector('.summary-callout-rule');
    if (scrub) {
      scrub.addEventListener('pointerdown', onDown);
      scrub.addEventListener('pointermove', onMove);
      scrub.addEventListener('pointerup', onUp);
      scrub.addEventListener('pointercancel', onCancel);
      scrub.addEventListener('keydown', onKey);
      scrub.addEventListener('focus', onFocus);
      scrub.addEventListener('blur', onBlur);
    }
  }

  function select(i) {
    sel = i;
    scrub.setAttribute('aria-valuenow', String(i + 1));
    scrub.setAttribute('aria-valuetext', readout(i));
    host.querySelectorAll('.summary-bar').forEach((g) => g.classList.toggle('is-sel', Number(g.dataset.i) === i));
    const m = months[i];
    callout.querySelector('.summary-callout-title').textContent = `${monthName(i + 1)} ${opts.year}`;
    callout.querySelector('.summary-callout-value').textContent = m.total > 0 ? `${shortNum(m.total)} ${units}` : 'No trips';
    const parts = [];
    if (m.ded > 0) parts.push(`${shortNum(m.ded, m.total)} deductible`);
    if (m.per > 0) parts.push(`${shortNum(m.per, m.total)} personal`);
    const sub = callout.querySelector('.summary-callout-sub');
    sub.textContent = parts.join(' \u00b7 ');
    sub.hidden = !parts.length;
    if (shown) place();
  }

  function place() {
    const b = L.bars[sel];
    callout.hidden = false;
    rule.hidden = false;
    const cw = callout.offsetWidth;
    const ch = callout.offsetHeight;
    const left = Math.max(0, Math.min(L.plotW - cw, b.cx - cw / 2));
    callout.style.left = `${Math.round(left)}px`;
    const top = ch + 4;
    const end = months[sel].total > 0 ? b.top : L.baseline;
    rule.style.left = `${b.cx - 0.5}px`;
    rule.style.top = `${top}px`;
    rule.style.height = `${Math.max(0, end - top - 3)}px`;
  }

  function show() { clearTimeout(showTimer); shown = true; host.classList.add('is-scrubbing'); place(); }
  function hide() {
    clearTimeout(showTimer);
    shown = false;
    host.classList.remove('is-scrubbing');
    if (callout) { callout.hidden = true; rule.hidden = true; }
    host.querySelectorAll('.summary-bar.is-sel').forEach((g) => g.classList.remove('is-sel'));
  }

  function monthAt(clientX) {
    const r = scrub.getBoundingClientRect();
    return Math.max(0, Math.min(11, Math.floor(((clientX - r.left) / Math.max(1, r.width)) * 12)));
  }

  function onDown(e) {
    if (e.button != null && e.button > 0) return;
    const i = monthAt(e.clientX);
    toggleOff = shown && sel === i;
    pressed = true; moved = false;
    try { scrub.setPointerCapture(e.pointerId); } catch (_) { /* synthetic events have no capture */ }
    select(i);
    // A touch that turns into a vertical scroll is cancelled almost at once; wait a beat before showing.
    if (e.pointerType === 'touch' && !shown) { clearTimeout(showTimer); showTimer = setTimeout(show, 120); } else show();
  }
  function onMove(e) {
    if (!pressed) return;
    const i = monthAt(e.clientX);
    if (i !== sel) { moved = true; select(i); if (!shown) show(); }
  }
  function onUp() {
    if (!pressed) return;
    pressed = false;
    if (!shown) show();
    if (toggleOff && !moved) hide();
  }
  function onCancel() { pressed = false; hide(); }
  function onKey(e) {
    const cur = sel >= 0 ? sel : defaultIdx;
    let next;
    switch (e.key) {
      case 'ArrowLeft': case 'ArrowDown': next = cur - 1; break;
      case 'ArrowRight': case 'ArrowUp': next = cur + 1; break;
      case 'Home': next = 0; break;
      case 'End': next = 11; break;
      case 'Enter': case ' ': next = cur; break;
      case 'Escape': if (shown) { e.preventDefault(); hide(); } return;
      default: return;
    }
    e.preventDefault();
    select(Math.max(0, Math.min(11, next)));
    show();
  }
  function onFocus() { if (!shown && scrub.matches(':focus-visible')) { select(sel >= 0 ? sel : defaultIdx); show(); } }
  function onBlur() { pressed = false; if (shown) hide(); }
  function onDocDown(e) { if (shown && !host.contains(e.target)) hide(); }

  const ro = typeof ResizeObserver === 'function'
    ? new ResizeObserver(() => { const w = Math.round(host.clientWidth); if (w && w !== width) draw(); })
    : null;
  draw();
  if (ro) ro.observe(host);
  document.addEventListener('pointerdown', onDocDown, true);

  return {
    destroy() {
      clearTimeout(showTimer);
      if (ro) ro.disconnect();
      document.removeEventListener('pointerdown', onDocDown, true);
    },
  };
}

// ------------------------------------------------------------------ view

export function mount(root, ctx) {
  const { store, app, icon } = ctx;
  let alive = true;
  let queued = false;
  let chart = null;

  /** Years to step through: every year with trips plus the current one, ascending. */
  function years() {
    const set = new Set(store.yearsWithTrips());
    set.add(thisYear());
    return [...set].sort((a, b) => a - b);
  }

  function monthlyData(trips) {
    const months = Array.from({ length: 12 }, () => ({ ded: 0, per: 0, total: 0, count: 0 }));
    for (const t of trips) {
      const m = Number(String(t.date || '').slice(5, 7)) - 1;
      if (!(m >= 0 && m < 12)) continue;
      const d = store.toDisplay(t.distanceMi);
      if (DEDUCTIBLE.has(t.purpose)) months[m].ded += d; else months[m].per += d;
      months[m].total += d;
      months[m].count += 1;
    }
    return months;
  }

  // ---------------------------------------------------------------- templates

  function yearNavHtml(ys) {
    const prev = ys.filter((y) => y < selectedYear).pop();
    const next = ys.find((y) => y > selectedYear);
    return `
      <div class="summary-yearnav">
        <button class="summary-yearbtn" type="button" data-act="prev-year" data-year="${prev == null ? '' : prev}" aria-label="Previous year"${prev == null ? ' disabled aria-disabled="true"' : ''}>${icon('chevronLeft', { size: 20, stroke: 2.4 })}</button>
        <h2 class="summary-yearlabel" id="summary-year"><span class="sr-only">Year </span>${selectedYear}</h2>
        <button class="summary-yearbtn" type="button" data-act="next-year" data-year="${next == null ? '' : next}" aria-label="Next year"${next == null ? ' disabled aria-disabled="true"' : ''}>${icon('chevronRight', { size: 20, stroke: 2.4 })}</button>
      </div>`;
  }

  function breakdownRowHtml(p, bp, totalMi, units) {
    const share = totalMi > 0 ? Math.max(0, Math.min(100, (bp.distanceMi / totalMi) * 100)) : 0;
    const personal = p === 'personal';
    return `
      <div class="row summary-prow">
        <div class="row-main">
          <div class="row-title"><span class="dot ${p}" aria-hidden="true"></span>${escapeHtml(purposeLabel(p))}</div>
          <div class="row-sub">${plural(bp.count, 'trip')}</div>
        </div>
        <div class="row-trailing">
          <div class="row-value">${fmtDistance(bp.distanceMi, units)}</div>
          <div class="summary-money${personal ? ' is-none' : ''}">${personal ? '<span aria-hidden="true">\u2014</span><span class="sr-only">Not deductible</span>' : fmtMoney(bp.value)}</div>
        </div>
        <div class="summary-pbar ${p}" aria-hidden="true"><span style="width:${share.toFixed(1)}%"></span></div>
      </div>`;
  }

  function heroHtml(ys, sum, yearTrips, units) {
    const rows = PURPOSE_ORDER.filter((p) => sum.byPurpose[p] && sum.byPurpose[p].count > 0);
    const dec = store.toDisplay(sum.distanceMi) >= 10 ? 0 : 1; // headline numbers: whole units once there is anything to speak of
    const sub = yearTrips.length
      ? `${fmtDistance(sum.deductibleMi, units, { unit: false, max: dec })} deductible ${units} of ${fmtDistance(sum.distanceMi, units, { unit: false, max: dec })} total`
      : 'No trips logged this year yet';
    return `
      <section class="card summary-hero-card" aria-labelledby="summary-year">
        ${yearNavHtml(ys)}
        <div class="summary-hero">
          <p class="summary-hero-label">Estimated deduction</p>
          <p class="summary-hero-value">${fmtMoney(sum.value)}</p>
          <p class="summary-hero-sub">${sub}</p>
        </div>
        ${rows.length ? `<div class="summary-breakdown">${rows.map((p) => breakdownRowHtml(p, sum.byPurpose[p], sum.distanceMi, units)).join('')}</div>` : ''}
      </section>`;
  }

  function chartCardHtml(months, year, units, isCurrentYear, nowMonth) {
    const hasData = months.some((m) => m.count > 0);
    // The caption answers "is my log complete?": how many of the year's months (so far) have trips.
    let caption;
    if (!hasData) caption = `No trips in ${year}`;
    else {
      const elapsed = isCurrentYear ? nowMonth + 1 : 12;
      const logged = months.filter((m) => m.count > 0).length; // includes months dated ahead of today
      if (logged >= elapsed) caption = isCurrentYear ? 'Trips logged every month so far' : 'Trips logged every month';
      else caption = `Trips in ${logged} of ${elapsed} months${isCurrentYear ? ' so far' : ''}`;
    }
    return `
      <section class="card summary-chart-card" aria-labelledby="summary-chart-title">
        <div class="summary-chart-head">
          <h2 class="summary-card-title" id="summary-chart-title">${whatByMonth(units)}</h2>
          <ul class="summary-legend" aria-label="Legend">
            <li><span class="summary-swatch ded" aria-hidden="true"></span>Deductible</li>
            <li><span class="summary-swatch per" aria-hidden="true"></span>Personal</li>
          </ul>
        </div>
        <p class="summary-chart-caption">${escapeHtml(caption)}</p>
        <div class="summary-chart" data-chart></div>
        ${tableHtml(months, year, units)}
      </section>`;
  }

  function vehiclesHtml(sum, units) {
    const entries = Object.entries(sum.byVehicle).filter(([, v]) => v.count > 0);
    if (entries.length < 2) return '';
    entries.sort((a, b) => b[1].distanceMi - a[1].distanceMi);
    return `
      <h2 class="section-title">Vehicles</h2>
      <div class="list">${entries.map(([id, v]) => {
        const veh = id === 'none' ? null : store.vehicle(id);
        const name = veh ? veh.name : 'No vehicle';
        return `
          <div class="row">
            <div class="row-main"><div class="row-title">${escapeHtml(name)}</div><div class="row-sub">${plural(v.count, 'trip')}</div></div>
            <div class="row-trailing"><div class="row-value">${fmtDistance(v.distanceMi, units)}</div><div class="summary-money">${fmtMoney(v.value)}</div></div>
          </div>`;
      }).join('')}</div>`;
  }

  function ratesHtml(year) {
    const periods = ratePeriodsForYear(store, year);
    return `
      <h2 class="section-title">Rates</h2>
      <div class="list summary-rates">
        ${periods.map((p) => `
          <div class="row">
            <div class="row-main">
              <div class="row-title">${escapeHtml(`${fmtDate(p.start, { year: false })} \u2013 ${fmtDate(p.end, { year: false })}, ${year}`)}</div>
              <div class="row-sub">Business ${escapeHtml(fmtCents(p.business))} \u00b7 Medical ${escapeHtml(fmtCents(p.medical))} \u00b7 Charity ${escapeHtml(fmtCents(p.charity))}</div>
            </div>
          </div>`).join('')}
        <button class="row" type="button" data-act="rates">
          <div class="row-main"><div class="row-title">Edit rates</div></div>
          <span class="chevron" aria-hidden="true">${icon('chevronRight', { size: 20 })}</span>
        </button>
      </div>`;
  }

  function exportHtml(year, yearCount, allCount) {
    return `
      <h2 class="section-title">Export</h2>
      <div class="list">
        <button class="row has-icon" type="button" data-act="export-year"${yearCount ? '' : ' disabled aria-disabled="true"'}>
          <span class="row-icon tint" aria-hidden="true">${icon('share', { size: 20 })}</span>
          <div class="row-main"><div class="row-title">Export ${year} as CSV</div><div class="row-sub">${yearCount ? plural(yearCount, 'trip') : 'No trips this year'}</div></div>
        </button>
        <button class="row has-icon" type="button" data-act="export-all">
          <span class="row-icon tint" aria-hidden="true">${icon('share', { size: 20 })}</span>
          <div class="row-main"><div class="row-title">Export all trips as CSV</div><div class="row-sub">${plural(allCount, 'trip')}</div></div>
        </button>
      </div>
      <p class="section-footer">Each row has the date, route, purpose, distance, rate and value \u2014 the fields an IRS mileage log needs.</p>`;
  }

  function emptyHtml() {
    return `
      <div class="empty-state summary-empty">
        <div class="summary-empty-icon" aria-hidden="true">${icon('chart', { size: 40 })}</div>
        <h2 class="title3">Nothing to summarize yet</h2>
        <p>Your deduction and monthly miles will appear here after your first trip.</p>
        <button class="btn btn-primary" type="button" data-act="new">Log a trip</button>
      </div>`;
  }

  // ---------------------------------------------------------------- render

  function focusKeyOf(el) {
    if (!el || !root.contains(el)) return null;
    const b = el.closest('[data-act]');
    return b ? b.dataset.act : null;
  }

  function restoreFocus(act) {
    if (!act) return;
    let el = root.querySelector(`[data-act="${cssEscape(act)}"]`);
    if (el && el.disabled) el = root.querySelector('.summary-yearbtn:not([disabled])');
    if (el) el.focus({ preventScroll: true });
  }

  function render() {
    const scrollY = window.scrollY;
    const focusKey = focusKeyOf(document.activeElement);
    if (chart) { chart.destroy(); chart = null; }

    const units = store.units();
    const all = store.trips();
    let html = '<div class="page summary-page"><div class="page-header"><h1 class="large-title">Summary</h1></div>';
    let months = null;
    let chartOpts = null;
    if (!all.length) {
      html += emptyHtml();
    } else {
      const ys = years();
      if (selectedYear == null || !ys.includes(selectedYear)) selectedYear = thisYear();
      const now = new Date();
      const isCurrentYear = selectedYear === now.getFullYear();
      const yearTrips = store.tripsForYear(selectedYear);
      const sum = store.summarize(yearTrips);
      months = monthlyData(yearTrips);
      chartOpts = { year: selectedYear, units, isCurrentYear, nowMonth: now.getMonth() };
      html += heroHtml(ys, sum, yearTrips, units);
      html += chartCardHtml(months, selectedYear, units, isCurrentYear, now.getMonth());
      html += vehiclesHtml(sum, units);
      html += ratesHtml(selectedYear);
      html += exportHtml(selectedYear, yearTrips.length, all.length);
    }
    html += '<p class="sr-only" aria-live="polite" data-live></p></div>';
    root.innerHTML = html;
    if (months) chart = mountChart(root.querySelector('[data-chart]'), months, chartOpts);

    window.scrollTo(0, scrollY);
    restoreFocus(focusKey);
  }

  function announceYear() {
    const trips = store.tripsForYear(selectedYear);
    const sum = store.summarize(trips);
    const text = `${selectedYear}: ${plural(trips.length, 'trip')}, ${distanceWords(store.toDisplay(sum.distanceMi), store.units())}, ${fmtMoney(sum.value)} deduction`;
    setTimeout(() => { const el = root.querySelector('[data-live]'); if (alive && el) el.textContent = text; }, 80);
  }

  function selectYear(y) {
    if (!y || y === selectedYear) return;
    selectedYear = y;
    app.haptic();
    render();
    announceYear();
  }

  function exportCsv(trips, filename) {
    download(filename, store.csv(trips), 'text/csv');
    app.toast('CSV ready');
  }

  // Store changes are coalesced into one render per tick (imports and seeding emit dozens).
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => { queued = false; if (alive) render(); });
  }

  // ---------------------------------------------------------------- events

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || !root.contains(btn) || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
    switch (btn.dataset.act) {
      case 'prev-year': case 'next-year': selectYear(Number(btn.dataset.year)); break;
      case 'rates': app.navigate('#/settings/rates'); break;
      case 'export-year': exportCsv(store.tripsForYear(selectedYear), `mileage-${selectedYear}.csv`); break;
      case 'export-all': exportCsv(store.trips(), 'mileage-all-trips.csv'); break;
      case 'new': app.openTrip('new'); break;
      default: break;
    }
  }
  const onTouch = () => {}; // lets iOS Safari apply :active to rows

  root.addEventListener('click', onClick);
  root.addEventListener('touchstart', onTouch, { passive: true });
  ctx.onChange(schedule);

  render();

  return () => {
    alive = false;
    root.removeEventListener('click', onClick);
    root.removeEventListener('touchstart', onTouch);
    if (chart) { chart.destroy(); chart = null; }
  };
}
