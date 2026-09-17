// Mileage — trip entry sheet. Routes: #/trip/new and #/trip/<id>.
// Renders once, then patches the live nodes (summary, hints, visibility) as the user types.
// Goal: a repeat trip is two taps (chip, Save); a new trip needs one number.

import { escapeHtml, fmtDistance, fmtMoney, fmtCents, fmtDate, todayISO, isValidISODate } from '../format.js';
import { PURPOSES, PURPOSE_IDS, purposeLabel } from '../store.js';

const MAX_PLACES = 60;

export function mount(root, ctx) {
  const { store, app, icon } = ctx;
  const rawId = (ctx.params && ctx.params.id) || 'new';
  const isNew = rawId === 'new';
  const trip = isNew ? null : store.trip(rawId);
  if (!isNew && !trip) return mountMissing(root, ctx);

  const prefill = isNew ? (app.takePrefill() || null) : null;
  const src = trip || prefill || {};
  const settings = store.settings();
  let vehicles = store.vehicles();
  const defaultVehicle = store.defaultVehicle();
  let disposed = false;
  let saving = false;
  let suggestions = new Map();
  let lastUnits = null;

  // ------------------------------------------------------------ state

  const st = {
    mode: 'distance',            // 'distance' | 'odometer'
    distance: '',                // display units; one-way when roundTrip is on
    roundTrip: !!src.roundTrip,
    odoStart: '', odoEnd: '',
    odoStartAuto: false,         // start reading was filled from the vehicle's last reading
    odoTouched: false,           // end reading has been blurred once (gates the inline error)
    from: str(src.from), to: str(src.to),
    purpose: PURPOSE_IDS.includes(src.purpose) ? src.purpose : (PURPOSE_IDS.includes(settings.defaultPurpose) ? settings.defaultPurpose : 'business'),
    date: isValidISODate(str(src.date)) ? str(src.date).slice(0, 10) : todayISO(),
    vehicleId: (vehicles.find((v) => v.id === src.vehicleId) || defaultVehicle || {}).id || null,
    notes: str(src.notes),
    saveRoute: true,
  };
  const hasOdo = src.odoStart != null && src.odoEnd != null;
  if (hasOdo) {
    st.mode = 'odometer';
    st.odoStart = fmtInput(src.odoStart);
    st.odoEnd = fmtInput(src.odoEnd);
  } else if (isNew && settings.entryMode === 'odometer' && !(Number(src.distanceMi) > 0)) {
    st.mode = 'odometer';
  }
  if (Number(src.distanceMi) > 0) st.distance = fmtInput(store.toDisplay(src.distanceMi) / (st.roundTrip ? 2 : 1));
  if (st.mode === 'odometer' && !st.odoStart) {
    const last = store.lastOdometer(st.vehicleId);
    if (last != null) { st.odoStart = fmtInput(last); st.odoStartAuto = true; }
  }

  // ------------------------------------------------------------ render

  root.innerHTML = template();
  const $ = (sel) => root.querySelector(sel);
  const el = {
    form: $('.entry'), cancel: $('#e-cancel'), quick: $('.quick'), chipRow: $('.chip-row'), chips: [],
    hero: $('.hero'), grow: $('.hero-grow'), distance: $('#e-distance'), derived: $('#e-derived'), unit: $('#e-unit'),
    roundRow: $('#e-round-row'), round: $('#e-round'), roundHint: $('#e-round-hint'),
    odo: $('#e-odo'), odoStart: $('#e-odo-start'), odoEnd: $('#e-odo-end'), odoNote: $('#e-odo-note'), mode: $('#e-mode'),
    from: $('#e-from'), to: $('#e-to'), swap: $('#e-swap'), places: $('#e-places'),
    rate: $('#e-rate'), date: $('#e-date'), dateDisplay: $('#e-date-display'), vehicle: $('#e-vehicle'), notes: $('#e-notes'),
    saveRouteRow: $('#e-save-route'), saveRouteSwitch: $('#e-save-route-switch'),
    del: $('#e-delete'), error: $('#e-error'), save: $('#e-save'),
  };

  el.distance.value = st.distance; setGrow();
  el.round.checked = st.roundTrip;
  el.odoStart.value = st.odoStart; el.odoEnd.value = st.odoEnd;
  el.from.value = st.from; el.to.value = st.to;
  el.notes.value = st.notes;
  renderPlaces();
  renderChips();
  update();
  growNotes();
  requestAnimationFrame(growNotes);

  // Desktop only: put the caret in the number so a new trip is "type, Enter". Touch devices never get a
  // programmatic focus (the keyboard would cover the sheet). Two frames so it lands after the shell's own focus.
  if (!matchMedia('(pointer: coarse)').matches) {
    requestAnimationFrame(() => requestAnimationFrame(() => {
      const a = document.activeElement;
      if (!disposed && !(a && ['INPUT', 'TEXTAREA', 'SELECT'].includes(a.tagName))) primaryInput().focus({ preventScroll: true });
    }));
  }

  // ------------------------------------------------------------ events

  el.cancel.addEventListener('click', () => ctx.close());
  el.save.addEventListener('click', save);
  if (el.del) el.del.addEventListener('click', remove);
  el.form.addEventListener('submit', (e) => { e.preventDefault(); if (!el.save.disabled) save(); });

  el.hero.addEventListener('click', (e) => { if (e.target !== el.distance) primaryInput().focus(); });
  el.distance.addEventListener('input', () => {
    const clean = sanitizeDecimal(el.distance.value, 6, 2);
    if (clean !== el.distance.value) el.distance.value = clean;
    st.distance = clean; setGrow(); clearError(); update();
  });
  el.distance.addEventListener('blur', () => {
    const t = trimSeparator(el.distance.value);
    if (t !== el.distance.value) { el.distance.value = t; st.distance = t; setGrow(); update(); }
  });
  el.distance.addEventListener('keydown', onEnterSave);

  el.round.addEventListener('change', () => { st.roundTrip = el.round.checked; update(); });

  el.odoStart.addEventListener('input', () => {
    const clean = sanitizeDecimal(el.odoStart.value, 7, 2);
    if (clean !== el.odoStart.value) el.odoStart.value = clean;
    st.odoStart = clean; st.odoStartAuto = false; clearError(); update();
  });
  el.odoEnd.addEventListener('input', () => {
    const clean = sanitizeDecimal(el.odoEnd.value, 7, 2);
    if (clean !== el.odoEnd.value) el.odoEnd.value = clean;
    st.odoEnd = clean; clearError(); update();
  });
  el.odoEnd.addEventListener('blur', () => { st.odoTouched = true; update(); });
  el.odoStart.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.odoEnd.focus(); } });
  el.odoEnd.addEventListener('keydown', onEnterSave);
  el.mode.addEventListener('click', () => setMode(st.mode === 'odometer' ? 'distance' : 'odometer'));

  el.from.addEventListener('input', () => { st.from = el.from.value; update(); });
  el.to.addEventListener('input', () => { st.to = el.to.value; update(); });
  el.from.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); el.to.focus(); } });
  el.to.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); primaryInput().focus(); } });
  el.swap.addEventListener('click', () => {
    [st.from, st.to] = [st.to, st.from];
    el.from.value = st.from; el.to.value = st.to;
    app.haptic(); update();
  });

  el.form.addEventListener('change', (e) => {
    if (e.target && e.target.name === 'purpose' && e.target.checked) { st.purpose = e.target.value; update(); }
  });
  el.date.addEventListener('input', onDate);
  el.date.addEventListener('change', onDate);
  if (el.vehicle) el.vehicle.addEventListener('change', () => {
    st.vehicleId = el.vehicle.value || null;
    if (st.mode === 'odometer' && (st.odoStartAuto || !st.odoStart)) refillOdoStart();
    update();
  });
  el.notes.addEventListener('input', () => { st.notes = el.notes.value; growNotes(); });
  if (el.saveRouteSwitch) el.saveRouteSwitch.addEventListener('change', () => { st.saveRoute = el.saveRouteSwitch.checked; });
  if (el.chipRow) el.chipRow.addEventListener('click', (e) => { const b = e.target.closest('.chip'); if (b) pickChip(b); });

  ctx.onChange((_, change) => {
    if (disposed || saving) return;
    const type = change && change.type;
    if (['vehicles', 'replace', 'import', 'clear'].includes(type)) refreshVehicles();
    if (isNew && ['trips', 'routes', 'replace', 'import', 'clear'].includes(type)) { renderChips(); renderPlaces(); }
    update();
  });

  return () => { disposed = true; };

  // ------------------------------------------------------------ template

  function template() {
    const units = store.units();
    const unitWord = units === 'km' ? 'kilometers' : 'miles';
    const vehicleRow = vehicles.length ? `
        <label class="field"><span class="field-label">Vehicle</span>
          <select class="field-input" id="e-vehicle">${vehicleOptions()}</select>
        </label>` : '';
    return `
  <form class="entry" data-mode="${isNew ? 'new' : 'edit'}" novalidate autocomplete="off">
    <div class="sheet-header">
      <button class="nav-btn" type="button" id="e-cancel">Cancel</button>
      <h2 class="sheet-title" id="sheet-title">${isNew ? 'Log trip' : 'Edit trip'}</h2>
      <span></span>
    </div>
    <div class="sheet-content">
      ${isNew ? `<section class="quick" hidden>
        <h3 class="quick-heading" id="e-quick-title">Quick picks</h3>
        <div class="chip-row" role="group" aria-labelledby="e-quick-title"></div>
      </section>` : ''}
      <div class="card hero-card">
        <div class="hero">
          <span class="hero-grow" data-value="0">
            <input class="hero-num" id="e-distance" type="text" inputmode="decimal" pattern="[0-9]*[.,]?[0-9]*" placeholder="0" size="1" maxlength="9" autocomplete="off" enterkeyhint="done" aria-label="Distance in ${unitWord}">
          </span>
          <output class="hero-num hero-out is-empty" id="e-derived" for="e-odo-start e-odo-end" aria-label="Distance in ${unitWord}, from the odometer" hidden>0</output>
          <span class="hero-unit" id="e-unit" aria-hidden="true">${units}</span>
        </div>
        <div class="field round-row" id="e-round-row">
          <div class="field-main">
            <span class="field-label" id="e-round-label">Round trip</span>
            <div class="hint" id="e-round-hint" hidden></div>
          </div>
          <label class="switch"><input type="checkbox" role="switch" id="e-round" aria-labelledby="e-round-label"><span class="switch-track"></span></label>
        </div>
        <div class="odo" id="e-odo" hidden>
          <label class="field"><span class="field-label">Start odometer</span><input class="field-input num" id="e-odo-start" type="text" inputmode="decimal" placeholder="Required" maxlength="10" autocomplete="off" enterkeyhint="next"></label>
          <label class="field"><span class="field-label">End odometer</span><input class="field-input num" id="e-odo-end" type="text" inputmode="decimal" placeholder="Required" maxlength="10" autocomplete="off" enterkeyhint="done"></label>
          <p class="odo-note error-text" id="e-odo-note" hidden></p>
        </div>
        <button class="mode-toggle" type="button" id="e-mode">Use odometer</button>
      </div>
      <div class="list route-list">
        <div class="route-fields">
          <label class="field field-stacked"><span class="field-label">From</span><input class="field-input" id="e-from" type="text" list="e-places" placeholder="Optional" autocomplete="off" autocapitalize="words" enterkeyhint="next" maxlength="120"></label>
          <label class="field field-stacked"><span class="field-label">To</span><input class="field-input" id="e-to" type="text" list="e-places" placeholder="Optional" autocomplete="off" autocapitalize="words" enterkeyhint="next" maxlength="120"></label>
          <button class="swap-btn" type="button" id="e-swap" aria-label="Swap from and to">${icon('swap', { size: 20 })}</button>
        </div>
        <datalist id="e-places"></datalist>
      </div>
      <div class="list purpose-list">
        <div class="segmented lg" role="radiogroup" aria-label="Purpose">
          ${PURPOSES.map((p) => `<label class="seg"><input type="radio" name="purpose" value="${p.id}"${p.id === st.purpose ? ' checked' : ''}><span>${escapeHtml(p.label)}</span></label>`).join('')}
        </div>
      </div>
      <p class="section-footer" id="e-rate"></p>
      <div class="list details-list">
        <label class="field date-field"><span class="field-label">Date</span>
          <span class="date-control">
            <span class="date-display" id="e-date-display" aria-hidden="true"></span>
            <input class="field-input num" id="e-date" type="date" value="${st.date}" required>
          </span>
        </label>
        ${vehicleRow}
        <label class="field field-stacked"><span class="field-label">Notes</span><textarea class="field-input" id="e-notes" rows="1" placeholder="Optional" maxlength="500" autocapitalize="sentences"></textarea></label>
      </div>
      ${isNew ? `<div class="list save-route" id="e-save-route" hidden>
        <div class="field">
          <span class="field-label" id="e-save-route-label">Save as a route for quick entry</span>
          <label class="switch"><input type="checkbox" role="switch" id="e-save-route-switch" aria-labelledby="e-save-route-label" checked><span class="switch-track"></span></label>
        </div>
      </div>` : `<button class="btn btn-destructive btn-block delete-btn" type="button" id="e-delete">Delete trip</button>`}
    </div>
    <div class="sheet-footer">
      <div class="error-text" id="e-error" role="alert"></div>
      <button class="btn btn-primary btn-block" type="button" id="e-save" disabled>Save trip</button>
    </div>
  </form>`;
  }

  function vehicleOptions() {
    return vehicles.map((v) => `<option value="${escapeHtml(v.id)}"${v.id === st.vehicleId ? ' selected' : ''}>${escapeHtml(v.name)}</option>`).join('');
  }

  function chipHtml(s) {
    const dist = fmtDistance(s.distanceMi, store.units());
    const text = s.from && s.to ? `${escapeHtml(s.from)} → ${escapeHtml(s.to)}` : (s.from ? `From ${escapeHtml(s.from)}` : `To ${escapeHtml(s.to)}`);
    const spoken = s.from && s.to ? `${s.from} to ${s.to}` : (s.from ? `From ${s.from}` : `To ${s.to}`);
    return `<button class="chip" type="button" data-key="${escapeHtml(s.key)}" aria-pressed="false" aria-label="${escapeHtml(`${spoken}, ${dist}`)}">${icon(s.kind === 'route' ? 'route' : 'clock', { size: 16 })}<span class="chip-label">${text}</span><span class="chip-meta">${escapeHtml(dist)}</span></button>`;
  }

  // ------------------------------------------------------------ derived values

  function oneWayDisplay() { return parseDecimal(st.distance); }
  /** End minus start in display units; null while either reading is empty. May be negative. */
  function odoDelta() {
    if (!st.odoStart || !st.odoEnd) return null;
    return parseDecimal(st.odoEnd) - parseDecimal(st.odoStart);
  }
  function totalDisplay() {
    if (st.mode === 'odometer') { const d = odoDelta(); return d != null && d > 0 ? d : 0; }
    const v = oneWayDisplay();
    return v > 0 ? v * (st.roundTrip ? 2 : 1) : 0;
  }
  function primaryInput() {
    if (st.mode === 'odometer') return st.odoStart ? el.odoEnd : el.odoStart;
    return el.distance;
  }

  // ------------------------------------------------------------ in-place updates

  function update() {
    if (disposed) return;
    const units = store.units();
    if (units !== lastUnits) {
      lastUnits = units;
      const word = units === 'km' ? 'kilometers' : 'miles';
      el.unit.textContent = units;
      el.distance.setAttribute('aria-label', `Distance in ${word}`);
      el.derived.setAttribute('aria-label', `Distance in ${word}, from the odometer`);
    }
    const odo = st.mode === 'odometer';
    el.grow.hidden = odo;
    el.derived.hidden = !odo;
    el.roundRow.hidden = odo;
    el.odo.hidden = !odo;
    el.mode.textContent = odo ? 'Enter distance instead' : 'Use odometer';
    el.hero.classList.toggle('is-derived', odo);

    if (odo) {
      const d = odoDelta();
      const ok = d != null && d > 0;
      el.derived.textContent = ok ? fmtInput(d) : '0';
      el.derived.classList.toggle('is-empty', !ok);
      const bad = d != null && d <= 0 && st.odoTouched;
      el.odoNote.hidden = !bad;
      el.odoNote.textContent = bad ? 'End odometer must be higher than start.' : '';
    } else if (st.roundTrip) {
      const v = oneWayDisplay();
      el.roundHint.hidden = false;
      el.roundHint.textContent = v > 0
        ? `${fmtDistance(store.fromDisplay(v), units)} each way · ${fmtDistance(store.fromDisplay(v * 2), units)} total`
        : 'Enter the one-way distance';
    } else {
      el.roundHint.hidden = true;
    }

    el.dateDisplay.textContent = st.date ? fmtDate(st.date, { weekday: true, year: true }) : 'Pick a date';
    el.date.setAttribute('aria-label', `Date${st.date ? `, ${fmtDate(st.date, { weekday: true, year: true })}` : ''}`);

    const rate = store.rateFor(st.date || todayISO(), st.purpose);
    el.rate.textContent = st.purpose === 'personal'
      ? 'Personal trips aren’t deductible'
      : `${purposeLabel(st.purpose)} · ${fmtCents(rate)} per ${units === 'km' ? 'kilometer' : 'mile'}`;

    const from = st.from.trim(), to = st.to.trim();
    if (el.saveRouteRow) el.saveRouteRow.hidden = !(from && to && !store.findRoute(from, to));
    syncChips();

    const totalMi = store.fromDisplay(totalDisplay());
    const valid = totalMi > 0;
    el.save.disabled = !valid;
    el.save.textContent = valid ? summaryLabel(totalMi, units) : 'Save trip';
  }

  function summaryLabel(totalMi, units) {
    let s = `Save trip · ${fmtDistance(totalMi, units)}`;
    if (st.purpose !== 'personal') s += ` · ${fmtMoney(store.tripValue({ date: st.date, purpose: st.purpose, distanceMi: totalMi }))}`;
    return s;
  }

  function setGrow() { el.grow.dataset.value = el.distance.value || '0'; }

  function growNotes() {
    if (disposed) return;
    el.notes.style.height = 'auto';
    el.notes.style.height = `${el.notes.scrollHeight}px`;
  }

  function clearError() { if (el.error.textContent) el.error.textContent = ''; }
  function showError(message) { el.error.textContent = message; app.haptic(); }

  function onDate() { st.date = el.date.value; clearError(); update(); }

  function onEnterSave(e) {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    if (!el.save.disabled) save(); else e.target.blur();
  }

  function setRadio(purpose) {
    const r = el.form.querySelector(`input[name="purpose"][value="${purpose}"]`);
    if (r) r.checked = true;
  }

  function refillOdoStart() {
    const last = store.lastOdometer(st.vehicleId);
    st.odoStart = last != null ? fmtInput(last) : '';
    st.odoStartAuto = last != null;
    el.odoStart.value = st.odoStart;
  }

  function setMode(mode, { persist = true, focus = true } = {}) {
    if (st.mode === mode) return;
    if (mode === 'odometer') {
      if (!st.odoStart) refillOdoStart();
    } else {
      // Carry the odometer distance over so nothing typed is lost.
      const d = odoDelta();
      if (d != null && d > 0) { st.distance = fmtInput(d / (st.roundTrip ? 2 : 1)); el.distance.value = st.distance; setGrow(); }
    }
    st.mode = mode;
    if (persist) store.setSettings({ entryMode: mode });
    clearError();
    update();
    if (focus) primaryInput().focus();
  }

  function renderPlaces() {
    el.places.innerHTML = store.places().slice(0, MAX_PLACES).map((p) => `<option value="${escapeHtml(p)}"></option>`).join('');
  }

  function refreshVehicles() {
    vehicles = store.vehicles();
    if (!el.vehicle) return;
    if (!vehicles.some((v) => v.id === st.vehicleId)) st.vehicleId = (store.defaultVehicle() || {}).id || null;
    el.vehicle.innerHTML = vehicleOptions();
  }

  function renderChips() {
    if (!el.chipRow) return;
    const { routes, recent } = store.suggestions(8);
    const trips = store.trips();
    const list = [];
    for (const r of routes) {
      const k = key(r.from, r.to);
      const last = trips.find((t) => t.routeId === r.id || key(t.from, t.to) === k);
      list.push({ key: k, kind: 'route', from: r.from, to: r.to, distanceMi: r.distanceMi, purpose: r.purpose,
        roundTrip: last ? !!last.roundTrip : undefined, vehicleId: last ? last.vehicleId || null : null });
    }
    for (const t of recent) {
      list.push({ key: key(t.from, t.to), kind: 'recent', from: t.from, to: t.to, distanceMi: t.distanceMi, purpose: t.purpose,
        roundTrip: !!t.roundTrip, vehicleId: t.vehicleId || null });
    }
    suggestions = new Map(list.map((s) => [s.key, s]));
    el.quick.hidden = list.length === 0;
    el.chipRow.innerHTML = list.map(chipHtml).join('');
    el.chips = [...el.chipRow.querySelectorAll('.chip')];
    syncChips();
  }

  function syncChips() {
    if (!el.chips.length) return;
    const k = st.from.trim() && st.to.trim() ? key(st.from, st.to) : '';
    for (const c of el.chips) {
      const sel = !!k && c.dataset.key === k;
      c.classList.toggle('is-selected', sel);
      c.setAttribute('aria-pressed', String(sel));
    }
  }

  function pickChip(btn) {
    const s = suggestions.get(btn.dataset.key);
    if (!s || btn.classList.contains('is-selected')) return; // second tap: nothing to do
    st.from = s.from; st.to = s.to;
    el.from.value = s.from; el.to.value = s.to;
    if (PURPOSE_IDS.includes(s.purpose)) { st.purpose = s.purpose; setRadio(s.purpose); }
    if (s.vehicleId && el.vehicle && vehicles.some((v) => v.id === s.vehicleId)) { st.vehicleId = s.vehicleId; el.vehicle.value = s.vehicleId; }
    if (s.roundTrip != null) { st.roundTrip = s.roundTrip; el.round.checked = s.roundTrip; }
    const oneWay = store.toDisplay(s.distanceMi) / (s.kind === 'recent' && s.roundTrip ? 2 : 1);
    st.distance = fmtInput(oneWay);
    el.distance.value = st.distance; setGrow();
    if (st.mode === 'odometer') setMode('distance', { persist: false, focus: false });
    clearError();
    app.haptic();
    update();
  }

  // ------------------------------------------------------------ save / delete

  function save() {
    if (saving || disposed) return;
    if (!st.date) { showError('Pick a valid date.'); el.date.focus(); return; }
    const totalMi = store.fromDisplay(totalDisplay());
    if (!(totalMi > 0)) { showError('Enter a distance greater than zero.'); primaryInput().focus(); return; }
    const from = st.from.trim(), to = st.to.trim();
    const odo = st.mode === 'odometer';
    let routeId = (store.findRoute(from, to) || {}).id || null;
    let createdRoute = null;
    saving = true;
    try {
      if (isNew && st.saveRoute && from && to && !routeId) {
        createdRoute = store.saveRoute({ from, to, distanceMi: round3(totalMi / (st.roundTrip ? 2 : 1)), purpose: st.purpose });
        routeId = createdRoute.id;
      }
      const data = {
        date: st.date, from, to, distanceMi: totalMi, purpose: st.purpose, vehicleId: st.vehicleId, roundTrip: st.roundTrip,
        odoStart: odo ? parseDecimal(st.odoStart) : null, odoEnd: odo ? parseDecimal(st.odoEnd) : null,
        notes: st.notes, routeId,
      };
      if (isNew) store.addTrip(data); else store.updateTrip(rawId, data);
    } catch (err) {
      if (createdRoute) store.deleteRoute(createdRoute.id);
      saving = false;
      showError(err && err.message ? err.message : 'Could not save this trip.');
      return;
    }
    store.setSettings({ defaultPurpose: st.purpose, defaultVehicleId: st.vehicleId });
    app.haptic();
    ctx.close();
    app.toast('Trip saved');
  }

  async function remove() {
    if (saving || disposed) return;
    const ok = await app.confirm({ title: 'Delete this trip?', message: 'This can be undone for a few seconds.', confirmLabel: 'Delete', destructive: true });
    if (!ok || disposed) return;
    saving = true;
    const removed = store.deleteTrip(rawId);
    ctx.close();
    app.toast('Trip deleted', { actionLabel: 'Undo', onAction: () => store.restoreTrip(removed) });
  }
}

// ------------------------------------------------------------ missing trip

function mountMissing(root, ctx) {
  root.innerHTML = `
  <form class="entry" data-mode="missing" novalidate>
    <div class="sheet-header">
      <button class="nav-btn" type="button" id="e-cancel">Close</button>
      <h2 class="sheet-title" id="sheet-title">Edit trip</h2>
      <span></span>
    </div>
    <div class="sheet-content">
      <div class="empty-state">${ctx.icon('road', { size: 40, cls: 'muted' })}<h3 class="title3">Trip not found</h3><p>This trip is no longer in your log.</p></div>
    </div>
  </form>`;
  root.querySelector('#e-cancel').addEventListener('click', () => ctx.close());
  return () => {};
}

// ------------------------------------------------------------ helpers

function str(v) { return v == null ? '' : String(v); }
function norm(s) { return String(s || '').trim().toLowerCase(); }
function key(from, to) { return `${norm(from)}|${norm(to)}`; }
function round3(n) { return Math.round(n * 1000) / 1000; }

/** Number -> input text: up to two decimals, no trailing zeros ('' for non-numbers). */
function fmtInput(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return '';
  return String(parseFloat(v.toFixed(2)));
}

/** Keep digits and one decimal separator ('.' or ',' as typed); cap integer and fraction lengths. */
function sanitizeDecimal(raw, maxInt, maxFrac) {
  const s = String(raw == null ? '' : raw).replace(/[^\d.,]/g, '');
  const m = s.match(/^(\d*)([.,])?(.*)$/);
  const int = m[1].slice(0, maxInt);
  const sep = m[2] || '';
  const frac = m[3].replace(/\D/g, '').slice(0, maxFrac);
  return sep ? `${int}${sep}${frac}` : int;
}

function trimSeparator(s) { return String(s || '').replace(/[.,]$/, '').replace(/^[.,]/, '0.'); }

function parseDecimal(s) {
  const n = parseFloat(String(s == null ? '' : s).replace(',', '.'));
  return Number.isFinite(n) && n >= 0 ? n : 0;
}
