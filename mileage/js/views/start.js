// Mileage — start trip sheet. Route: #/trip/start.
// The first half of a trip: the odometer reading, date, time and vehicle when you set off. Saving it
// creates a trip in progress, which the finish sheet (#/trip/finish) completes when you arrive.

import { escapeHtml, fmtDate, fmtNum, fmtTime, fmtWhen, nowTime, todayISO } from '../format.js';

export function mount(root, ctx) {
  const { store, app } = ctx;
  const open = store.openTrip();
  if (open) return mountInProgress(root, ctx, open);

  const units = store.units();
  const vehicles = store.vehicles();
  const st = {
    odo: '',
    date: todayISO(),
    time: nowTime(),
    vehicleId: (store.defaultVehicle() || {}).id || null,
  };
  let saving = false;
  let disposed = false;

  root.innerHTML = template();
  const $ = (sel) => root.querySelector(sel);
  const el = {
    form: $('.entry'), cancel: $('#s-cancel'), hero: $('.hero'), grow: $('.hero-grow'), odo: $('#s-odo'),
    lastText: $('#s-last-text'), useLast: $('#s-use-last'), warn: $('#s-warn'),
    date: $('#s-date'), dateDisplay: $('#s-date-display'), time: $('#s-time'), timeDisplay: $('#s-time-display'),
    vehicle: $('#s-vehicle'), past: $('#s-past'), error: $('#s-error'), save: $('#s-save'),
  };
  setGrow();
  update();

  // Desktop only: put the caret in the reading. Touch devices are left alone so the keyboard
  // does not cover the sheet before the person has seen it.
  if (!matchMedia('(pointer: coarse)').matches) {
    requestAnimationFrame(() => requestAnimationFrame(() => { if (!disposed) el.odo.focus({ preventScroll: true }); }));
  }

  // ------------------------------------------------------------ events

  el.cancel.addEventListener('click', () => ctx.close());
  el.save.addEventListener('click', save);
  el.form.addEventListener('submit', (e) => { e.preventDefault(); if (!el.save.disabled) save(); });
  el.hero.addEventListener('click', (e) => { if (e.target !== el.odo) el.odo.focus(); });

  el.odo.addEventListener('input', () => {
    const clean = sanitizeReading(el.odo.value);
    if (clean !== el.odo.value) el.odo.value = clean;
    st.odo = clean; setGrow(); clearError(); update();
  });
  el.odo.addEventListener('blur', () => {
    const t = el.odo.value.replace(/[.,]$/, '');
    if (t !== el.odo.value) { el.odo.value = t; st.odo = t; setGrow(); update(); }
  });
  el.odo.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!el.save.disabled) save(); else el.odo.blur();
  });

  el.useLast.addEventListener('click', () => {
    const last = lastReading().value;
    if (last == null) return;
    st.odo = String(last);
    el.odo.value = st.odo;
    setGrow(); clearError(); update();
    app.haptic();
  });

  const onDate = () => { st.date = el.date.value; clearError(); update(); };
  el.date.addEventListener('input', onDate);
  el.date.addEventListener('change', onDate);
  const onTime = () => { st.time = el.time.value; clearError(); update(); };
  el.time.addEventListener('input', onTime);
  el.time.addEventListener('change', onTime);
  if (el.vehicle) el.vehicle.addEventListener('change', () => { st.vehicleId = el.vehicle.value || null; update(); });

  // Already drove: swap this sheet for the full one, so closing it lands back on the tab.
  el.past.addEventListener('click', () => app.openTrip('new', null, { replace: true }));

  ctx.onChange(() => { if (!disposed && !saving) update(); });

  return () => { disposed = true; };

  // ------------------------------------------------------------ template

  function template() {
    const vehicleRow = vehicles.length > 1 ? `
        <label class="field"><span class="field-label">Vehicle</span>
          <select class="field-input" id="s-vehicle">${vehicles.map((v) => `<option value="${escapeHtml(v.id)}"${v.id === st.vehicleId ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('')}</select>
        </label>` : '';
    return `
  <form class="entry entry-start" data-mode="start" novalidate autocomplete="off">
    <div class="sheet-header">
      <button class="nav-btn" type="button" id="s-cancel">Cancel</button>
      <h2 class="sheet-title" id="sheet-title">Start trip</h2>
      <span></span>
    </div>
    <div class="sheet-content">
      <div class="card hero-card start-card">
        <p class="hero-label" id="s-odo-label">Odometer reading</p>
        <div class="hero">
          <span class="hero-grow" data-value="0">
            <input class="hero-num" id="s-odo" type="text" inputmode="decimal" placeholder="0" size="1" maxlength="9" autocomplete="off" enterkeyhint="done" aria-labelledby="s-odo-label" aria-describedby="s-last-text s-warn">
          </span>
          <span class="hero-unit" aria-hidden="true">${units}</span>
        </div>
        <div class="start-last">
          <span class="hint" id="s-last-text"></span>
          <button class="btn btn-sm btn-secondary" type="button" id="s-use-last" hidden></button>
        </div>
        <p class="warn-text start-warn" id="s-warn" hidden></p>
      </div>
      <div class="list details-list">
        <label class="field date-field"><span class="field-label">Date</span>
          <span class="date-control">
            <span class="date-display" id="s-date-display" aria-hidden="true"></span>
            <input class="field-input num" id="s-date" type="date" value="${st.date}" required>
          </span>
        </label>
        <label class="field"><span class="field-label">Start time</span>
          <span class="time-control">
            <span class="time-display" id="s-time-display" aria-hidden="true"></span>
            <input class="field-input num" id="s-time" type="time" value="${st.time}">
          </span>
        </label>
        ${vehicleRow}
      </div>
      <p class="section-footer">You’ll add the end reading, route and purpose when you arrive.</p>
      <button class="btn btn-plain past-trip-link" type="button" id="s-past">Already drove? Log a finished trip</button>
    </div>
    <div class="sheet-footer">
      <div class="error-text" id="s-error" role="alert"></div>
      <button class="btn btn-primary btn-block" type="button" id="s-save" disabled>Start trip</button>
    </div>
  </form>`;
  }

  // ------------------------------------------------------------ updates

  /** The last reading on record for the chosen vehicle, with the date it was taken when known. */
  function lastReading() {
    const t = store.trips().find((x) => x.vehicleId === st.vehicleId && x.odoEnd != null);
    if (t) return { value: t.odoEnd, date: t.date };
    const v = st.vehicleId ? store.vehicle(st.vehicleId) : null;
    return { value: v && v.odometer != null ? v.odometer : null, date: null };
  }

  function update() {
    if (disposed) return;
    const last = lastReading();
    const typed = parseReading(st.odo);
    if (last.value != null) {
      const reading = `${fmtNum(last.value, { max: 1 })} ${units}`;
      el.lastText.textContent = last.date ? `Last recorded ${reading} on ${fmtDate(last.date)}` : `Last recorded ${reading}`;
      el.useLast.textContent = `Use ${fmtNum(last.value, { max: 1 })}`;
      el.useLast.setAttribute('aria-label', `Use the last reading, ${reading}`);
      el.useLast.hidden = typed === last.value;
    } else {
      el.lastText.textContent = 'Read it from your dashboard.';
      el.useLast.hidden = true;
    }
    // Lower than the last reading is almost always a typo, but a new car or a corrected log can
    // make it legitimate, so warn without blocking.
    const low = st.odo !== '' && last.value != null && typed < last.value;
    el.warn.hidden = !low;
    el.warn.textContent = low ? `That’s lower than the last reading of ${fmtNum(last.value, { max: 1 })} ${units}.` : '';

    el.dateDisplay.textContent = st.date ? fmtDate(st.date, { weekday: true, year: true }) : 'Pick a date';
    el.date.setAttribute('aria-label', `Date${st.date ? `, ${fmtDate(st.date, { weekday: true, year: true })}` : ''}`);
    el.timeDisplay.textContent = st.time ? fmtTime(st.time) : 'Now';
    el.time.setAttribute('aria-label', `Start time, ${st.time ? fmtTime(st.time) : 'now'}`);

    el.save.disabled = st.odo === '' || !st.date;
  }

  function setGrow() { el.grow.dataset.value = el.odo.value || '0'; }
  function clearError() { if (el.error.textContent) el.error.textContent = ''; }

  function save() {
    if (saving || disposed) return;
    saving = true;
    try {
      store.startTrip({ odoStart: parseReading(st.odo), date: st.date, time: st.time, vehicleId: st.vehicleId });
    } catch (err) {
      saving = false;
      el.error.textContent = err && err.message ? err.message : 'Could not start this trip.';
      app.haptic();
      return;
    }
    app.haptic();
    ctx.close();
    app.toast('Trip started');
  }
}

// ------------------------------------------------------------ a trip is already running

function mountInProgress(root, ctx, open) {
  root.innerHTML = `
  <form class="entry" data-mode="busy" novalidate>
    <div class="sheet-header">
      <button class="nav-btn" type="button" id="s-close">Close</button>
      <h2 class="sheet-title" id="sheet-title">Start trip</h2>
      <span></span>
    </div>
    <div class="sheet-content">
      <div class="empty-state">
        ${ctx.icon('flag', { size: 44, cls: 'empty-symbol' })}
        <h3 class="title3">A trip is in progress</h3>
        <p>${escapeHtml(`It started ${fmtWhen(open.date, open.time)}. Finish it before you start another.`)}</p>
        <button class="btn btn-secondary" type="button" id="s-finish">Finish trip</button>
      </div>
    </div>
  </form>`;
  root.querySelector('#s-close').addEventListener('click', () => ctx.close());
  root.querySelector('#s-finish').addEventListener('click', () => ctx.app.openTrip('finish', null, { replace: true }));
  return () => {};
}

// ------------------------------------------------------------ helpers

/** Digits and one decimal separator, up to seven whole digits and one decimal: how odometers read. */
function sanitizeReading(raw) {
  const s = String(raw == null ? '' : raw).replace(/[^\d.,]/g, '');
  const m = s.match(/^(\d*)([.,])?(.*)$/);
  const int = m[1].slice(0, 7);
  return m[2] ? `${int}${m[2]}${m[3].replace(/\D/g, '').slice(0, 1)}` : int;
}

function parseReading(s) {
  const n = parseFloat(String(s == null ? '' : s).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : null;
}
