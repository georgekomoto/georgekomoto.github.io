// Mileage — Settings tab: preferences, vehicles, mileage rates, saved routes and data tools.
// Routes: #/settings, #/settings/vehicles, #/settings/vehicle/<id|new>, #/settings/rates,
//         #/settings/rate/<from|new>, #/settings/routes, #/settings/route/<id>.

import { PURPOSES, purposeLabel } from '../store.js';
import { icon } from '../icons.js';
import { escapeHtml, fmtDistance, fmtCents, fmtNum, fmtDate, todayISO, isValidISODate, download } from '../format.js';

const HOME = '#/settings';
const RATES = '#/settings/rates';
const ROUTES = '#/settings/routes';
const RATE_KEYS = ['business', 'medical', 'charity'];

export function mount(root, ctx) {
  const { app, store } = ctx;
  const page = parsePage(ctx.params.section);
  const isForm = page.type === 'vehicle' || page.type === 'rate' || page.type === 'route';
  let leaving = false;

  const views = {
    main: () => renderMain(store),
    vehicles: () => renderVehicles(store),
    vehicle: () => renderVehicleForm(store, page.id),
    rates: () => renderRates(store),
    rate: () => renderRateForm(store, page.from),
    routes: () => renderRoutes(store),
    route: () => renderRouteForm(store, page.id),
    missing: () => renderMissing(HOME, 'Settings', 'There is nothing at this address.'),
  };

  function render(keepPosition) {
    const y = window.scrollY;
    const focus = keepPosition ? focusKey(root, document.activeElement) : null;
    root.innerHTML = views[page.type]();
    if (keepPosition) {
      window.scrollTo(0, y);
      const el = focus && root.querySelector(focus);
      if (el) el.focus({ preventScroll: true });
    }
  }

  // ------------------------------------------------------------ actions

  async function onClick(e) {
    const btn = e.target.closest('[data-act]');
    if (!btn || !root.contains(btn)) return;
    switch (btn.dataset.act) {
      case 'nav': app.navigate(btn.dataset.to || HOME); break;
      case 'dismiss-tip': store.setSettings({ installTipDismissed: true }); break;
      case 'export-csv': download('mileage-all.csv', store.csv(store.trips()), 'text/csv'); break;
      case 'backup': download('mileage-backup.json', store.exportJSON(), 'application/json'); break;
      case 'restore': { const input = root.querySelector('#restore-file'); if (input) input.click(); break; }
      case 'clear-all': await clearAll(); break;
      case 'reset-rates': await resetRates(); break;
      case 'delete-vehicle': await deleteVehicle(btn.dataset.id); break;
      case 'delete-rate': await deleteRate(btn.dataset.from); break;
      case 'delete-route': await deleteRoute(btn.dataset.id); break;
      default: break;
    }
  }

  function onChange(e) {
    const t = e.target;
    if (!t || !root.contains(t)) return;
    if (t.name === 'units' && t.checked) { store.setSettings({ units: t.value === 'km' ? 'km' : 'mi' }); app.haptic(); }
    else if (t.name === 'theme' && t.checked) { store.setSettings({ theme: ['light', 'dark'].includes(t.value) ? t.value : 'system' }); app.haptic(); }
    else if (t.id === 's-purpose') store.setSettings({ defaultPurpose: PURPOSES.some((p) => p.id === t.value) ? t.value : 'business' });
    else if (t.id === 'restore-file') restoreFrom(t);
  }

  function onInput(e) {
    // Clear an inline error as soon as the person edits the field
    const field = e.target.closest('.field.is-invalid');
    if (field) setFieldError(field, '');
    const form = e.target.closest('form[data-form]');
    const formError = form && form.querySelector('.form-error');
    if (formError && !formError.hidden) formError.hidden = true;
  }

  function onSubmit(e) {
    const form = e.target.closest('form[data-form]');
    if (!form || !root.contains(form)) return;
    e.preventDefault();
    if (form.dataset.form === 'vehicle') saveVehicle(form);
    else if (form.dataset.form === 'rate') saveRate(form);
    else if (form.dataset.form === 'route') saveRoute(form);
  }

  // ---- vehicles

  function saveVehicle(form) {
    const name = form.elements.name.value.trim();
    const plate = form.elements.plate.value.trim();
    const odoRaw = form.elements.odometer.value.trim();
    const odometer = odoRaw ? parseNumber(odoRaw) : null;
    const isDefault = form.elements.isDefault.checked;
    let ok = validate(form, 'name', name ? '' : 'Enter a name for this vehicle.');
    ok = validate(form, 'odometer', odoRaw && (odometer == null || odometer < 0) ? 'Enter the odometer reading as a number.' : '') && ok;
    if (!ok) return;
    const id = form.dataset.id;
    leaving = true;
    if (id) {
      store.updateVehicle(id, { name, plate, odometer });
      if (isDefault) store.setDefaultVehicle(id);
    } else {
      store.addVehicle({ name, plate, odometer, isDefault });
    }
    app.navigate(HOME);
    app.toast(id ? 'Vehicle saved' : `${name} added`);
  }

  async function deleteVehicle(id) {
    const v = store.vehicle(id);
    if (!v) return;
    const ok = await app.confirm({
      title: `Delete ${v.name}?`,
      message: 'Trips logged with this vehicle keep their distance and value.',
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    leaving = true;
    store.deleteVehicle(id);
    app.navigate(HOME);
    app.toast('Vehicle deleted');
  }

  // ---- rate periods

  function saveRate(form) {
    const from = String(form.elements.from.value || '').slice(0, 10);
    const oldFrom = form.dataset.from || '';
    let ok = validate(form, 'from', isValidISODate(from) ? '' : 'Pick a start date.');
    const patch = {};
    for (const k of RATE_KEYS) {
      const raw = form.elements[k].value.trim();
      const n = raw ? parseNumber(raw) : null;
      const bad = n == null || n < 0 || n > 500;
      ok = validate(form, k, bad ? 'Enter cents from 0 to 500.' : '') && ok;
      patch[k] = n;
    }
    if (!ok) return;
    leaving = true;
    try {
      store.setRatePeriod(from, patch);
      if (oldFrom && oldFrom !== from) store.deleteRatePeriod(oldFrom);
    } catch (err) {
      leaving = false;
      showFormError(form, err.message || 'Could not save this rate period.');
      return;
    }
    app.navigate(RATES);
    app.toast('Rate period saved');
  }

  async function deleteRate(from) {
    if (store.ratePeriods().length <= 1) { app.toast('Keep at least one rate period.'); return; }
    const ok = await app.confirm({
      title: 'Delete rate period?',
      message: `Trips from ${fmtDate(from, { year: true })} on will use the previous period.`,
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    leaving = true;
    if (!store.deleteRatePeriod(from)) { leaving = false; app.toast('Keep at least one rate period.'); return; }
    app.navigate(RATES);
    app.toast('Rate period deleted');
  }

  async function resetRates() {
    const ok = await app.confirm({
      title: 'Reset rates?',
      message: 'Your rate periods will be replaced with the IRS defaults.',
      confirmLabel: 'Reset', destructive: true,
    });
    if (!ok) return;
    store.resetRates();
    app.toast('Rates reset to IRS defaults');
  }

  // ---- saved routes

  function saveRoute(form) {
    const id = form.dataset.id;
    const from = form.elements.from.value.trim();
    const to = form.elements.to.value.trim();
    const dist = parseNumber(form.elements.distance.value);
    const purpose = form.elements.purpose.value;
    let ok = validate(form, 'from', from ? '' : 'Enter where the route starts.');
    ok = validate(form, 'to', to ? '' : 'Enter where the route ends.') && ok;
    ok = validate(form, 'distance', dist != null && dist > 0 ? '' : 'Enter a distance greater than zero.') && ok;
    if (!ok) return;
    leaving = true;
    store.updateRoute(id, {
      from: from.slice(0, 120), to: to.slice(0, 120),
      distanceMi: Math.round(store.fromDisplay(dist) * 1000) / 1000,
      purpose: PURPOSES.some((p) => p.id === purpose) ? purpose : 'business',
    });
    app.navigate(ROUTES);
    app.toast('Route saved');
  }

  async function deleteRoute(id) {
    const r = store.route(id);
    if (!r) return;
    const ok = await app.confirm({
      title: 'Delete route?',
      message: 'Trips that used this route are kept.',
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    leaving = true;
    store.deleteRoute(id);
    app.navigate(ROUTES);
    app.toast('Route deleted');
  }

  // ---- data

  async function restoreFrom(input) {
    const file = input.files && input.files[0];
    input.value = '';
    if (!file) return;
    let payload;
    try { payload = JSON.parse(await file.text()); } catch (_) { app.toast('That file is not a Mileage backup.'); return; }
    const data = payload && payload.data ? payload.data : payload;
    if (!data || !Array.isArray(data.trips)) { app.toast('That file is not a Mileage backup.'); return; }
    const ok = await app.confirm({
      title: 'Restore backup',
      message: `This file holds ${plural(data.trips.length, 'trip')}. Merging adds trips, vehicles and routes you don't already have and keeps everything else.`,
      confirmLabel: 'Merge', cancelLabel: 'Cancel',
    });
    if (!ok) return;
    const before = { trips: store.trips().length, vehicles: store.vehicles().length, routes: store.routes().length };
    try { store.importJSON(payload, 'merge'); } catch (err) { app.toast(err.message || 'Could not restore that file.'); return; }
    const added = [
      [store.trips().length - before.trips, 'trip'],
      [store.vehicles().length - before.vehicles, 'vehicle'],
      [store.routes().length - before.routes, 'route'],
    ].filter(([n]) => n > 0).map(([n, w]) => plural(n, w));
    app.toast(added.length ? `Added ${added.join(', ')}` : 'Nothing new to add', { duration: 5000 });
  }

  async function clearAll() {
    const ok = await app.confirm({
      title: 'Delete all data?',
      message: 'Every trip, vehicle, route and setting on this device will be erased. This cannot be undone.',
      confirmLabel: 'Delete', destructive: true,
    });
    if (!ok) return;
    store.clearAll();
    window.scrollTo(0, 0);
    app.toast('All data deleted');
  }

  // ------------------------------------------------------------ lifecycle

  root.addEventListener('click', onClick);
  root.addEventListener('change', onChange);
  root.addEventListener('input', onInput);
  root.addEventListener('submit', onSubmit);

  ctx.onChange(() => {
    if (leaving) return;
    if (isForm) {
      // Keep what the person is typing; only leave if the thing being edited disappeared.
      if (!entityExists(page, store)) { leaving = true; app.navigate(parentOf(page)); }
      return;
    }
    render(true);
  });

  render(false);

  return () => {
    root.removeEventListener('click', onClick);
    root.removeEventListener('change', onChange);
    root.removeEventListener('input', onInput);
    root.removeEventListener('submit', onSubmit);
  };
}

// ------------------------------------------------------------ routing helpers

function parsePage(section) {
  const s = String(section || '').replace(/^\/+|\/+$/g, '');
  if (!s) return { type: 'main' };
  const i = s.indexOf('/');
  const kind = i < 0 ? s : s.slice(0, i);
  let id = i < 0 ? '' : s.slice(i + 1);
  try { id = decodeURIComponent(id); } catch (_) { /* keep raw */ }
  switch (kind) {
    case 'vehicles': return { type: 'vehicles' };
    case 'vehicle': return id ? { type: 'vehicle', id } : { type: 'vehicles' };
    case 'rates': return { type: 'rates' };
    case 'rate': return id ? { type: 'rate', from: id } : { type: 'rates' };
    case 'routes': return { type: 'routes' };
    case 'route': return id ? { type: 'route', id } : { type: 'routes' };
    default: return { type: 'missing' };
  }
}

function parentOf(page) {
  if (page.type === 'rate') return RATES;
  if (page.type === 'route') return ROUTES;
  return HOME;
}

function entityExists(page, store) {
  if (page.type === 'vehicle') return page.id === 'new' || !!store.vehicle(page.id);
  if (page.type === 'rate') return page.from === 'new' || store.ratePeriods().some((p) => p.from === page.from);
  if (page.type === 'route') return !!store.route(page.id);
  return true;
}

// ------------------------------------------------------------ pages

function renderMain(store) {
  const s = store.settings();
  const units = store.units();
  const routes = store.routes();
  const tripCount = store.trips().length;
  const period = store.ratePeriodFor(todayISO());
  const showTip = !isStandalone() && !s.installTipDismissed;
  const purpose = PURPOSES.some((p) => p.id === s.defaultPurpose) ? s.defaultPurpose : 'business';
  const theme = ['light', 'dark'].includes(s.theme) ? s.theme : 'system';
  return `
    <div class="page settings-page">
      <div class="page-header"><h1 class="large-title">Settings</h1></div>
      ${showTip ? installCard() : ''}

      <h2 class="section-title">Vehicles</h2>
      ${vehicleList(store, units)}
      <p class="section-footer">Trips use the default vehicle unless you pick another.</p>

      <h2 class="section-title">Entry</h2>
      <div class="list">
        <div class="field">
          <span class="field-label" id="units-label">Units</span>
          <div class="segmented" role="radiogroup" aria-labelledby="units-label">
            ${seg('units', 'mi', 'Miles', units === 'mi')}
            ${seg('units', 'km', 'Kilometers', units === 'km')}
          </div>
        </div>
        <div class="field">
          <label class="field-label" for="s-purpose">Default purpose</label>
          <select class="field-input" id="s-purpose">${purposeOptions(purpose)}</select>
        </div>
        ${navRow(ROUTES, 'Saved routes', routes.length ? plural(routes.length, 'route') : 'No routes yet')}
      </div>

      <h2 class="section-title">Rates</h2>
      <div class="list">
        ${navRow(RATES, 'Mileage rates', `From ${fmtDate(period.from, { year: true })} · ${fmtCents(period.business)} business`)}
      </div>

      <h2 class="section-title">Appearance</h2>
      <div class="list">
        <div class="field">
          <span class="field-label" id="theme-label">Theme</span>
          <div class="segmented" role="radiogroup" aria-labelledby="theme-label">
            ${seg('theme', 'system', 'System', theme === 'system')}
            ${seg('theme', 'light', 'Light', theme === 'light')}
            ${seg('theme', 'dark', 'Dark', theme === 'dark')}
          </div>
        </div>
      </div>

      <h2 class="section-title">Data</h2>
      <div class="list">
        ${actionRow('export-csv', 'Export all trips as CSV', tripCount ? plural(tripCount, 'trip') : 'No trips')}
        ${actionRow('backup', 'Back up to a file')}
        ${actionRow('restore', 'Restore from backup')}
        ${actionRow('clear-all', 'Delete all data', '', 'danger')}
      </div>
      <input type="file" id="restore-file" accept="application/json,.json" aria-label="Choose a backup file" hidden>
      <p class="section-footer">Your data stays on this device. Back up before switching phones or clearing Safari data.</p>

      <p class="section-footer about"><span class="about-version">Mileage 2.0</span><br>Built for manual logs, no tracking, no account.</p>
    </div>`;
}

function renderVehicles(store) {
  return subPage(HOME, 'Settings', 'Vehicles', `
    ${vehicleList(store, store.units())}
    <p class="section-footer">Trips use the default vehicle unless you pick another.</p>`);
}

function renderVehicleForm(store, id) {
  const isNew = id === 'new';
  const v = isNew ? null : store.vehicle(id);
  if (!isNew && !v) return renderMissing(HOME, 'Settings', 'This vehicle was deleted.');
  const units = store.units();
  const def = store.defaultVehicle();
  const isDefault = v ? !!def && def.id === v.id : store.vehicles().length === 0;
  const lockDefault = isDefault; // a default is always required, so it is changed by picking another vehicle
  return subPage(HOME, 'Settings', isNew ? 'New vehicle' : 'Edit vehicle', `
    <form class="settings-form" data-form="vehicle" data-id="${v ? escapeHtml(v.id) : ''}" novalidate>
      <div class="list">
        <div class="field field-stacked">
          <label class="field-label" for="v-name">Name</label>
          <input class="field-input" id="v-name" name="name" type="text" value="${escapeHtml(v ? v.name : '')}" placeholder="Honda Civic" autocomplete="off" autocapitalize="words" enterkeyhint="next" required>
          <span class="error-text" data-error="name" hidden></span>
        </div>
        <div class="field field-stacked">
          <label class="field-label" for="v-plate">License plate</label>
          <input class="field-input" id="v-plate" name="plate" type="text" value="${escapeHtml(v ? v.plate : '')}" placeholder="Optional" autocomplete="off" autocapitalize="characters" enterkeyhint="next">
        </div>
        <div class="field field-stacked">
          <label class="field-label" for="v-odo">Odometer (${units})</label>
          <input class="field-input num" id="v-odo" name="odometer" type="text" inputmode="numeric" value="${v && v.odometer != null ? escapeHtml(v.odometer) : ''}" placeholder="Optional" autocomplete="off" enterkeyhint="done">
          <span class="hint">Used to prefill odometer entry</span>
          <span class="error-text" data-error="odometer" hidden></span>
        </div>
        <div class="field">
          <label class="field-label" for="v-default">Default vehicle</label>
          <label class="switch"><input type="checkbox" id="v-default" name="isDefault"${isDefault ? ' checked' : ''}${lockDefault ? ' disabled' : ''}><span class="switch-track"></span></label>
        </div>
      </div>
      ${lockDefault ? `<p class="section-footer">${isNew ? 'Your first vehicle becomes the default.' : 'To change the default, turn it on for another vehicle.'}</p>` : ''}
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-block">Save</button>
        ${v ? `<button type="button" class="btn btn-destructive btn-block" data-act="delete-vehicle" data-id="${escapeHtml(v.id)}">Delete vehicle</button>` : ''}
      </div>
    </form>`);
}

function renderRates(store) {
  const periods = store.ratePeriods().slice().reverse();
  const current = store.ratePeriodFor(todayISO());
  const units = store.units();
  const rows = periods.map((p) => `
        <a class="row rate-row" href="#/settings/rate/${encodeURIComponent(p.from)}">
          <span class="row-main">
            <span class="row-title">From ${fmtDate(p.from, { year: true })}${p.from === current.from ? ' <span class="badge accent">Current</span>' : ''}</span>
            <span class="row-sub">Medical ${fmtCents(p.medical)} · Charity ${fmtCents(p.charity)}</span>
          </span>
          <span class="row-trailing">
            <span class="row-value">${fmtCents(p.business)}</span>
            <span class="row-sub">business</span>
          </span>
          <span class="chevron">${icon('chevronRight')}</span>
        </a>`);
  rows.push(navRow('#/settings/rate/new', 'Add rate period', '', { cls: 'add' }));
  return subPage(HOME, 'Settings', 'Mileage rates', `
    <p class="section-footer intro">Cents per ${units === 'km' ? 'kilometer' : 'mile'} the IRS allows for each purpose. Rates apply from their start date until the next period begins.</p>
    <div class="list">${rows.join('')}</div>
    <div class="list">${actionRow('reset-rates', 'Reset to IRS defaults')}</div>
    <p class="section-footer">Defaults follow IRS Notice 2025-5, Notice 2026-10 and Announcement 2026-11. Check irs.gov before filing.</p>`);
}

function renderRateForm(store, from) {
  const isNew = from === 'new';
  const p = isNew ? null : store.ratePeriods().find((x) => x.from === from);
  if (!isNew && !p) return renderMissing(RATES, 'Mileage rates', 'This rate period was deleted.');
  const units = store.units();
  const unit = `¢ per ${units === 'km' ? 'kilometer' : 'mile'}`;
  const base = p || store.ratePeriodFor(todayISO());
  const startDate = p ? p.from : `${new Date().getFullYear() + 1}-01-01`;
  const rateField = (key, label) => `
        <div class="field">
          <label class="field-label" for="r-${key}">${label}</label>
          <input class="field-input num" id="r-${key}" name="${key}" type="text" inputmode="decimal" value="${escapeHtml(fmtNum(base[key], { max: 2 }).replace(/,/g, ''))}" autocomplete="off" enterkeyhint="${key === 'charity' ? 'done' : 'next'}">
          <span class="field-unit">${unit}</span>
          <span class="error-text" data-error="${key}" hidden></span>
        </div>`;
  return subPage(RATES, 'Mileage rates', isNew ? 'New rate period' : 'Edit rate period', `
    <form class="settings-form" data-form="rate" data-from="${p ? escapeHtml(p.from) : ''}" novalidate>
      <div class="list">
        <div class="field">
          <label class="field-label" for="r-from">Start date</label>
          <input class="field-input" id="r-from" name="from" type="date" value="${escapeHtml(startDate)}" required>
          <span class="error-text" data-error="from" hidden></span>
        </div>
      </div>
      <p class="section-footer">Rates apply to trips on or after this date, until the next period begins.</p>
      <h2 class="section-title">Rate by purpose</h2>
      <div class="list">
        ${rateField('business', 'Business')}
        ${rateField('medical', 'Medical')}
        ${rateField('charity', 'Charity')}
      </div>
      <p class="section-footer">Personal trips are never deductible.</p>
      <p class="error-text form-error" role="alert" hidden></p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-block">Save</button>
        ${p ? `<button type="button" class="btn btn-destructive btn-block" data-act="delete-rate" data-from="${escapeHtml(p.from)}">Delete rate period</button>` : ''}
      </div>
    </form>`);
}

function renderRoutes(store) {
  const routes = store.routes();
  const units = store.units();
  const rows = routes.map((r) => navRow(`#/settings/route/${encodeURIComponent(r.id)}`,
    `${escapeHtml(r.from)} → ${escapeHtml(r.to)}`,
    `${fmtDistance(r.distanceMi, units)} · <span class="dot ${escapeHtml(r.purpose)}"></span>${purposeLabel(r.purpose)} · ${usage(r.useCount)}`));
  const body = routes.length
    ? `<div class="list">${rows.join('')}</div>`
    : `<div class="card empty-state">
        ${icon('route', { size: 40, cls: 'muted' })}
        <h3 class="title3">No saved routes</h3>
        <p>When you log a trip, save it as a route to log it again in one tap.</p>
      </div>`;
  return subPage(HOME, 'Settings', 'Saved routes', `
    <p class="section-footer intro">Routes appear as quick picks when you log a trip.</p>
    ${body}`);
}

function renderRouteForm(store, id) {
  const r = store.route(id);
  if (!r) return renderMissing(ROUTES, 'Saved routes', 'This route was deleted.');
  const units = store.units();
  const distance = Math.round(store.toDisplay(r.distanceMi) * 10) / 10;
  return subPage(ROUTES, 'Saved routes', 'Edit route', `
    <form class="settings-form" data-form="route" data-id="${escapeHtml(r.id)}" novalidate>
      <div class="list">
        <div class="field field-stacked">
          <label class="field-label" for="rt-from">From</label>
          <input class="field-input" id="rt-from" name="from" type="text" value="${escapeHtml(r.from)}" placeholder="Home" autocomplete="off" autocapitalize="words" enterkeyhint="next" required>
          <span class="error-text" data-error="from" hidden></span>
        </div>
        <div class="field field-stacked">
          <label class="field-label" for="rt-to">To</label>
          <input class="field-input" id="rt-to" name="to" type="text" value="${escapeHtml(r.to)}" placeholder="Office" autocomplete="off" autocapitalize="words" enterkeyhint="next" required>
          <span class="error-text" data-error="to" hidden></span>
        </div>
        <div class="field field-stacked">
          <label class="field-label" for="rt-distance">Distance one way (${units})</label>
          <input class="field-input num" id="rt-distance" name="distance" type="text" inputmode="decimal" value="${escapeHtml(distance)}" autocomplete="off" enterkeyhint="done" required>
          <span class="error-text" data-error="distance" hidden></span>
        </div>
        <div class="field">
          <label class="field-label" for="rt-purpose">Purpose</label>
          <select class="field-input" id="rt-purpose" name="purpose">${purposeOptions(r.purpose)}</select>
        </div>
      </div>
      <p class="section-footer">${usage(r.useCount, true)}</p>
      <div class="form-actions">
        <button type="submit" class="btn btn-primary btn-block">Save</button>
        <button type="button" class="btn btn-destructive btn-block" data-act="delete-route" data-id="${escapeHtml(r.id)}">Delete route</button>
      </div>
    </form>`);
}

function renderMissing(back, backLabel, message) {
  return subPage(back, backLabel, 'Not found', `<div class="card"><p class="muted">${message}</p></div>`);
}

// ------------------------------------------------------------ fragments

function subPage(back, backLabel, title, body) {
  return `
    <div class="page settings-page">
      <div class="sub-nav">
        <button type="button" class="nav-btn back" data-act="nav" data-to="${back}" aria-label="Back to ${backLabel}">${icon('chevronLeft', { stroke: 2.4 })}<span>${backLabel}</span></button>
      </div>
      <div class="page-header"><h1 class="large-title">${title}</h1></div>
      ${body}
    </div>`;
}

function installCard() {
  return `
      <div class="card install-card" role="note">
        <span class="row-icon tint">${icon('share')}</span>
        <span class="install-body">
          <span class="headline">Add to your Home Screen</span>
          <span class="footnote muted">In Safari, tap Share, then Add to Home Screen. Mileage then opens full screen and works offline.</span>
        </span>
        <button type="button" class="dismiss" data-act="dismiss-tip" aria-label="Dismiss"><span class="glyph">${icon('xmark', { size: 14, stroke: 2.6 })}</span></button>
      </div>`;
}

function vehicleList(store, units) {
  const def = store.defaultVehicle();
  const rows = store.vehicles().map((v) => {
    const sub = [v.plate, v.odometer != null ? `${fmtNum(v.odometer, { max: 0 })} ${units}` : ''].filter(Boolean).join(' · ');
    return `
        <a class="row has-icon" href="#/settings/vehicle/${encodeURIComponent(v.id)}">
          <span class="row-icon">${icon('car')}</span>
          <span class="row-main"><span class="row-title">${escapeHtml(v.name)}</span>${sub ? `<span class="row-sub num">${escapeHtml(sub)}</span>` : ''}</span>
          ${def && def.id === v.id ? '<span class="row-trailing"><span class="badge accent">Default</span></span>' : ''}
          <span class="chevron">${icon('chevronRight')}</span>
        </a>`;
  });
  rows.push(`
        <a class="row has-icon add" href="#/settings/vehicle/new">
          <span class="row-icon tint">${icon('plus')}</span>
          <span class="row-main"><span class="row-title">Add vehicle</span></span>
          <span class="chevron">${icon('chevronRight')}</span>
        </a>`);
  return `<div class="list">${rows.join('')}</div>`;
}

/** Navigation row. `title` and `sub` are HTML (escape user text before passing). */
function navRow(href, title, sub = '', { trailing = '', cls = '' } = {}) {
  return `
        <a class="row${cls ? ` ${cls}` : ''}" href="${href}">
          <span class="row-main"><span class="row-title">${title}</span>${sub ? `<span class="row-sub">${sub}</span>` : ''}</span>
          ${trailing ? `<span class="row-trailing">${trailing}</span>` : ''}
          <span class="chevron">${icon('chevronRight')}</span>
        </a>`;
}

function actionRow(act, title, detail = '', cls = '') {
  return `
        <button type="button" class="row action${cls ? ` ${cls}` : ''}" data-act="${act}">
          <span class="row-main"><span class="row-title">${title}</span></span>
          ${detail ? `<span class="row-detail">${detail}</span>` : ''}
        </button>`;
}

function seg(name, value, label, checked) {
  return `<label class="seg"><input type="radio" name="${name}" value="${value}"${checked ? ' checked' : ''}><span>${label}</span></label>`;
}

function purposeOptions(selected) {
  return PURPOSES.map((p) => `<option value="${p.id}"${p.id === selected ? ' selected' : ''}>${p.label}</option>`).join('');
}

// ------------------------------------------------------------ small helpers

function isStandalone() {
  try { return !!(window.navigator.standalone || window.matchMedia('(display-mode: standalone)').matches); } catch (_) { return false; }
}

function plural(n, word) { return `${fmtNum(n, { max: 0 })} ${word}${n === 1 ? '' : 's'}`; }

function usage(count, sentence = false) {
  const n = Number(count) || 0;
  if (sentence) return n === 0 ? 'Not used in a trip yet.' : n === 1 ? 'Used in one trip.' : `Used in ${fmtNum(n, { max: 0 })} trips.`;
  return n === 0 ? 'not used yet' : n === 1 ? 'used once' : `used ${fmtNum(n, { max: 0 })} times`;
}

function parseNumber(value) {
  const n = parseFloat(String(value ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

/** Show or clear an inline error for a named field; returns true when there is no error. */
function validate(form, name, message) {
  const err = form.querySelector(`[data-error="${name}"]`);
  const field = err && err.closest('.field');
  if (field) setFieldError(field, message);
  if (message) {
    const input = form.elements[name];
    if (input && input.focus && !form.querySelector('.field.is-invalid input:focus')) input.focus({ preventScroll: false });
  }
  return !message;
}

function setFieldError(field, message) {
  const err = field.querySelector('.error-text');
  if (err) { err.textContent = message; err.hidden = !message; }
  field.classList.toggle('is-invalid', !!message);
  const input = field.querySelector('input, select');
  if (input) input.setAttribute('aria-invalid', message ? 'true' : 'false');
}

function showFormError(form, message) {
  const el = form.querySelector('.form-error');
  if (!el) return;
  el.textContent = message;
  el.hidden = false;
}

/** A selector to refocus the active element after a re-render, or null. */
function focusKey(root, el) {
  if (!el || el === document.body || !root.contains(el)) return null;
  if (el.id) return `#${cssEscape(el.id)}`;
  if (el.name && el.type === 'radio') return `input[name="${cssEscape(el.name)}"][value="${cssEscape(el.value)}"]`;
  const act = el.closest('[data-act]');
  if (act) return `[data-act="${cssEscape(act.dataset.act)}"]`;
  return null;
}

function cssEscape(s) { return (window.CSS && CSS.escape) ? CSS.escape(String(s)) : String(s).replace(/["\\]/g, '\\$&'); }
