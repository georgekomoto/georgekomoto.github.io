// Trips — the home tab. Month summary card, quick-log chips for saved routes,
// and the month's trips grouped by day. Re-renders on store changes.

import { escapeHtml, fmtDistance, fmtMoney, fmtTime, fmtDayHeading, fmtMonthYear, addMonths, todayISO } from '../format.js';
import { purposeLabel } from '../store.js';

// Deductible purposes first; personal is the non-deductible remainder.
const BAR_ORDER = ['business', 'medical', 'charity', 'personal'];
const THIN = '\u2009';
const ARROW = `<span class="arrow" aria-hidden="true">${THIN}\u2192${THIN}</span>`;

// Selected month lives at module level so it survives re-renders and tab switches.
let selected = null;
let filter = null;   // purpose id, or null for every trip

function monthOf(iso) { return { year: Number(String(iso).slice(0, 4)), month: Number(String(iso).slice(5, 7)) }; }
function ord(m) { return m.year * 12 + m.month; }
function currentMonth() { return monthOf(todayISO()); }
function cssEscape(s) { return (globalThis.CSS && CSS.escape) ? CSS.escape(s) : String(s).replace(/["\\]/g, '\\$&'); }

export function mount(root, ctx) {
  const { store, app, icon } = ctx;
  let alive = true;
  let queued = false;
  let tripOps = [];

  // ---------------------------------------------------------------- data helpers

  /** Navigable range: from the earliest month with trips (or now) up to the current month (or a later month that has trips). */
  function bounds() {
    const now = currentMonth();
    const months = store.monthsWithTrips();
    const newest = months[0], oldest = months[months.length - 1];
    return {
      min: oldest && ord(oldest) < ord(now) ? { year: oldest.year, month: oldest.month } : now,
      max: newest && ord(newest) > ord(now) ? { year: newest.year, month: newest.month } : now,
    };
  }

  function clampSelected(b) {
    if (!selected) selected = currentMonth();
    if (ord(selected) < ord(b.min)) selected = { ...b.min };
    if (ord(selected) > ord(b.max)) selected = { ...b.max };
  }

  function distanceWords(mi, units) {
    const v = fmtDistance(mi, units, { unit: false });
    const one = v === '1';
    return `${v} ${units === 'km' ? (one ? 'kilometer' : 'kilometers') : (one ? 'mile' : 'miles')}`;
  }

  /** Title for a trip row: "From → To", falling back to notes, then "<Purpose> trip". */
  function tripTitle(t) {
    const from = String(t.from || '').trim();
    const to = String(t.to || '').trim();
    if (from && to) return { html: `${escapeHtml(from)}${ARROW}${escapeHtml(to)}`, text: `${from} to ${to}` };
    if (from) return { html: `${escapeHtml(from)}${ARROW}`, text: `from ${from}` };
    if (to) return { html: `${ARROW}${escapeHtml(to)}`, text: `to ${to}` };
    const notes = String(t.notes || '').trim();
    if (notes) return { html: escapeHtml(notes), text: notes };
    const s = `${purposeLabel(t.purpose)} trip`;
    return { html: escapeHtml(s), text: s };
  }

  /** Chip labels: drop " · qualifier" / ", city" suffixes when every chip stays distinct, then cut each side at a word boundary. */
  function chipLabels(routes) {
    const SEP = /\s[·•|–—-]\s|,\s/;
    const head = (s) => { const h = String(s || '').split(SEP)[0].trim(); return h || String(s || '').trim(); };
    const cut = (s, max = 14) => {
      s = String(s || '').trim();
      if (s.length <= max) return s;
      let acc = '';
      for (const w of s.split(/\s+/)) { const next = acc ? `${acc} ${w}` : w; if (next.length > max - 1) break; acc = next; }
      if (!acc) acc = s.slice(0, max - 1);
      return `${acc.replace(/[\s·•,|–—-]+$/, '')}…`;
    };
    const brief = routes.map((r) => `${head(r.from)} → ${head(r.to)}`);
    const pick = new Set(brief).size === brief.length ? (r) => [head(r.from), head(r.to)] : (r) => [r.from, r.to];
    return routes.map((r) => pick(r).map((x) => cut(x)).join(' → '));
  }

  // ---------------------------------------------------------------- templates

  function monthCardHtml(trips, units, b) {
    const sum = store.summarize(trips);
    const ytd = store.summarize(store.tripsForYear(selected.year));
    const cur = currentMonth();
    const prevOff = ord(selected) <= ord(b.min);
    const nextOff = ord(selected) >= ord(b.max);
    const segs = BAR_ORDER.filter((p) => sum.byPurpose[p] && sum.byPurpose[p].distanceMi > 0);
    const yearWord = selected.year < cur.year ? 'total' : 'so far';
    return `
      <section class="card month-card" aria-labelledby="month-label">
        <div class="month-nav">
          <button class="month-nav-btn" type="button" data-act="prev-month" aria-label="Previous month"${prevOff ? ' disabled aria-disabled="true"' : ''}>${icon('chevronLeft', { size: 20, stroke: 2.4 })}</button>
          <h2 class="month-nav-label" id="month-label">${escapeHtml(fmtMonthYear(selected.year, selected.month))}</h2>
          <button class="month-nav-btn" type="button" data-act="next-month" aria-label="Next month"${nextOff ? ' disabled aria-disabled="true"' : ''}>${icon('chevronRight', { size: 20, stroke: 2.4 })}</button>
        </div>
        <div class="month-hero">
          <p class="month-distance"><span class="month-distance-value">${fmtDistance(sum.distanceMi, units, { unit: false })}</span><span class="month-distance-unit"> ${units}</span></p>
          <p class="month-value${sum.total > 0 ? '' : ' is-zero'}">${fmtMoney(sum.total)} deduction</p>
        </div>
        ${segs.length ? `<div class="purpose-bar" aria-hidden="true">${segs.map((p) => `<span class="purpose-seg ${p}" style="flex-grow:${Number(sum.byPurpose[p].distanceMi) || 0}"></span>`).join('')}</div>` : ''}
        ${segs.length ? `<ul class="purpose-legend">${segs.map((p) => {
          const on = filter === p;
          return `<li><button class="legend-btn${on ? ' is-on' : ''}" type="button" data-act="filter" data-purpose="${p}" aria-pressed="${on}" aria-label="${escapeHtml(`${on ? 'Clear the' : 'Show only'} ${purposeLabel(p).toLowerCase()} filter`)}"><span class="dot ${p}" aria-hidden="true"></span><span class="legend-name">${escapeHtml(purposeLabel(p))}</span><span class="legend-mi">${fmtDistance(sum.byPurpose[p].distanceMi, units)}</span></button></li>`;
        }).join('')}</ul>` : ''}
        <p class="month-foot">${selected.year} ${yearWord} \u00b7 ${fmtDistance(ytd.distanceMi, units, { max: 1 })} \u00b7 ${fmtMoney(ytd.total)}</p>
      </section>`;
  }

  function quickLogHtml(units) {
    const routes = store.suggestions(4).routes;
    if (!routes.length) return '';
    const labels = chipLabels(routes);
    return `
      <h2 class="day-heading quick-log-heading" id="quick-log-title"><span class="day-label">Quick log</span></h2>
      <div class="chip-row" role="group" aria-labelledby="quick-log-title">${routes.map((r, i) => {
        const aria = `Log ${r.from} to ${r.to}, ${distanceWords(r.distanceMi, units)}, ${purposeLabel(r.purpose).toLowerCase()}`;
        return `<button class="chip quick-chip" type="button" data-act="quick" data-route="${escapeHtml(r.id)}" aria-label="${escapeHtml(aria)}">${icon('plus', { size: 16 })}<span class="chip-label">${escapeHtml(labels[i])}</span><span class="chip-meta">${fmtDistance(r.distanceMi, units)}</span></button>`;
      }).join('')}</div>`;
  }

  function rowHtml(t, units, defaultVehicleId) {
    const vehicle = t.vehicleId ? store.vehicle(t.vehicleId) : null;
    const personal = t.purpose === 'personal';
    const value = store.tripTotal(t);
    const extras = store.tripExtras(t);
    const title = tripTitle(t);
    const sub = [];
    if (t.time) sub.push(fmtTime(t.time));
    sub.push(t.detail || purposeLabel(t.purpose));
    if (vehicle && vehicle.id !== defaultVehicleId) sub.push(vehicle.name);
    if (t.roundTrip) sub.push('Round trip');
    const aria = [title.text, distanceWords(t.distanceMi, units), t.detail ? `${purposeLabel(t.purpose).toLowerCase()}, ${t.detail}` : purposeLabel(t.purpose).toLowerCase()];
    if (t.roundTrip) aria.push('round trip');
    if (!personal) aria.push(extras > 0 ? `${fmtMoney(value)} including ${fmtMoney(extras)} tolls and parking` : fmtMoney(value));
    aria.push(fmtDayHeading(t.date));
    return `
      <button class="row trip-row" type="button" data-act="open" data-id="${escapeHtml(t.id)}" aria-label="${escapeHtml(aria.join(', '))}">
        <div class="row-main">
          <div class="row-title">${title.html}</div>
          <div class="row-sub"><span class="dot ${escapeHtml(t.purpose)}" aria-hidden="true"></span>${escapeHtml(sub.join(' \u00b7 '))}</div>
        </div>
        <div class="row-trailing">
          <div class="row-value">${fmtDistance(t.distanceMi, units)}</div>
          <div class="row-money${personal ? ' is-none' : ''}">${personal ? '\u2014' : fmtMoney(value)}${!personal && extras > 0 ? '<span class="row-extras" aria-hidden="true">+</span>' : ''}</div>
        </div>
      </button>`;
  }

  function listHtml(trips, units) {
    const defaultVehicleId = (store.defaultVehicle() || {}).id || null;
    const groups = [];
    for (const t of trips) {
      const g = groups[groups.length - 1];
      if (g && g.date === t.date) g.trips.push(t); else groups.push({ date: t.date, trips: [t] });
    }
    return groups.map((g) => {
      const total = g.trips.reduce((s, t) => s + (Number(t.distanceMi) || 0), 0);
      return `
        <h2 class="day-heading"><span class="day-label">${escapeHtml(fmtDayHeading(g.date))}</span><span class="day-total">${fmtDistance(total, units)}</span></h2>
        <div class="list">${g.trips.map((t) => rowHtml(t, units, defaultVehicleId)).join('')}</div>`;
    }).join('');
  }

  function monthEmptyHtml() {
    const latest = store.monthsWithTrips()[0];
    const hasLater = latest && ord(latest) > ord(selected);
    return `
      <div class="card month-empty${hasLater ? ' has-action' : ''}">
        <p class="month-empty-text">No trips in ${escapeHtml(fmtMonthYear(selected.year, selected.month).split(' ')[0])}</p>
        ${hasLater ? '<button class="btn btn-plain" type="button" data-act="latest">Go to latest month</button>' : ''}
      </div>`;
  }

  function emptyStateHtml() {
    return `
      <div class="empty-state">
        <div class="empty-icon" aria-hidden="true">${icon('route', { size: 44 })}</div>
        <h2 class="title3">No trips yet</h2>
        <p>Log a trip in a few taps. Save the routes you drive often and they\u2019ll be one tap away next time.</p>
        <button class="btn btn-secondary" type="button" data-act="new">Log your first trip</button>
      </div>`;
  }

  // ---------------------------------------------------------------- render

  function focusKeyOf(el) {
    if (!el || !root.contains(el)) return null;
    const b = el.closest('[data-act]');
    return b ? { act: b.dataset.act, id: b.dataset.id || b.dataset.route || '' } : null;
  }

  function restoreFocus(key) {
    if (!key) return;
    const sel = key.id
      ? `[data-act="${key.act}"][data-id="${cssEscape(key.id)}"], [data-act="${key.act}"][data-route="${cssEscape(key.id)}"]`
      : `[data-act="${key.act}"]`;
    let el = root.querySelector(sel);
    if (el && el.disabled) el = root.querySelector('.month-nav-btn:not([disabled])');
    if (el) el.focus({ preventScroll: true });
  }

  function render() {
    const units = store.units();
    const all = store.trips();
    const b = bounds();
    clampSelected(b);

    const scrollY = window.scrollY;
    const focusKey = focusKeyOf(document.activeElement);

    let html = '<div class="page trips-page"><div class="page-header"><h1 class="large-title">Trips</h1></div>';
    if (!all.length) {
      html += emptyStateHtml();
    } else {
      const trips = store.tripsForMonth(selected.year, selected.month);
      if (filter && !trips.some((t) => t.purpose === filter)) filter = null;
      const shown = filter ? trips.filter((t) => t.purpose === filter) : trips;
      html += monthCardHtml(trips, units, b);
      html += filter ? '' : quickLogHtml(units);
      html += trips.length
        ? (shown.length ? listHtml(shown, units) : `<div class="card month-empty"><p class="muted">No ${escapeHtml(purposeLabel(filter).toLowerCase())} trips this month.</p><button class="btn btn-plain" type="button" data-act="filter" data-purpose="${escapeHtml(filter)}">Show all trips</button></div>`)
        : monthEmptyHtml();
    }
    html += '<p class="sr-only" aria-live="polite" data-live></p></div>';
    root.innerHTML = html;

    window.scrollTo(0, scrollY);
    restoreFocus(focusKey);
  }

  function announceMonth() {
    const trips = store.tripsForMonth(selected.year, selected.month);
    const sum = store.summarize(trips);
    const text = `${fmtMonthYear(selected.year, selected.month)}: ${trips.length} trip${trips.length === 1 ? '' : 's'}, ${distanceWords(sum.distanceMi, store.units())}, ${fmtMoney(sum.total)} deduction`;
    setTimeout(() => { const el = root.querySelector('[data-live]'); if (alive && el) el.textContent = text; }, 80);
  }

  function selectMonth(m) {
    selected = { year: m.year, month: m.month };
    render();
    announceMonth();
  }

  function shiftMonth(delta) {
    const b = bounds();
    const next = addMonths(selected.year, selected.month, delta);
    if (ord(next) < ord(b.min) || ord(next) > ord(b.max)) return;
    selectMonth(next);
  }

  // Store changes are coalesced into one render per tick (seeding/import emit dozens).
  // A single saved trip moves the view to its month so the user sees what they just logged.
  function schedule() {
    if (queued) return;
    queued = true;
    queueMicrotask(() => {
      queued = false;
      if (!alive) return;
      if (tripOps.length === 1 && (tripOps[0].op === 'add' || tripOps[0].op === 'update')) {
        const t = store.trip(tripOps[0].id);
        if (t && t.date) selected = monthOf(t.date);
      }
      tripOps = [];
      render();
    });
  }

  // ---------------------------------------------------------------- events

  function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || !root.contains(btn) || btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
    switch (btn.dataset.act) {
      case 'prev-month': shiftMonth(-1); break;
      case 'next-month': shiftMonth(1); break;
      case 'latest': { const m = store.monthsWithTrips()[0]; if (m) selectMonth(m); break; }
      case 'open': app.openTrip(btn.dataset.id); break;
      case 'quick': {
        const r = store.route(btn.dataset.route);
        if (r) app.openTrip('new', { from: r.from, to: r.to, distanceMi: r.distanceMi, purpose: r.purpose, detail: r.detail || '', routeId: r.id });
        break;
      }
      case 'new': app.openTrip('new'); break;
      case 'filter': {
        const p = btn.dataset.purpose;
        filter = filter === p ? null : p;
        app.haptic();
        render();
        const live = root.querySelector('[data-live]');
        if (live) live.textContent = filter ? `Showing ${purposeLabel(filter).toLowerCase()} trips only` : 'Showing all trips';
        break;
      }
      default: break;
    }
  }
  const onTouch = () => {}; // lets iOS Safari apply :active to rows

  root.addEventListener('click', onClick);
  root.addEventListener('touchstart', onTouch, { passive: true });
  ctx.onChange((_, change) => {
    if (change && change.type === 'trips') tripOps.push(change);
    schedule();
  });

  render();

  return () => {
    alive = false;
    root.removeEventListener('click', onClick);
    root.removeEventListener('touchstart', onTouch);
  };
}
