// Mileage — data store. Single JSON document in localStorage, canonical distances in miles.
// Views read through the API below and re-render on `subscribe`.

import { uid, todayISO, yearOf, monthKey, toDisplayDistance, fromDisplayDistance, isValidISODate, csvEscape, fmtDistance, KM_PER_MI } from './format.js';

export const STORAGE_KEY = 'mileage.v2';
export const SCHEMA_VERSION = 2;

export const PURPOSES = [
  { id: 'business', label: 'Business', deductible: true },
  { id: 'personal', label: 'Personal', deductible: false },
  { id: 'medical', label: 'Medical', deductible: true },
  { id: 'charity', label: 'Charity', deductible: true },
];
export const PURPOSE_IDS = PURPOSES.map((p) => p.id);
export function purposeLabel(id) { return (PURPOSES.find((p) => p.id === id) || PURPOSES[0]).label; }

// IRS standard mileage rates, cents per mile, by effective date (the IRS changed rates mid-year in 2026).
// Sources: Notice 2025-5 (2025), Notice 2026-10 (Jan 2026), Announcement 2026-11 (Jul 2026). Editable in Settings.
export const DEFAULT_RATES = [
  { from: '2023-01-01', business: 65.5, medical: 22, charity: 14 },
  { from: '2024-01-01', business: 67, medical: 21, charity: 14 },
  { from: '2025-01-01', business: 70, medical: 21, charity: 14 },
  { from: '2026-01-01', business: 72.5, medical: 20.5, charity: 14 },
  { from: '2026-07-01', business: 76, medical: 23.5, charity: 14 },
];

function defaultState() {
  return {
    version: SCHEMA_VERSION,
    settings: {
      units: 'mi',
      defaultPurpose: 'business',
      defaultVehicleId: null,
      rates: structuredClone(DEFAULT_RATES),
      theme: 'system',
      onboarded: false,
      migratedLegacy: false,
      createdAt: new Date().toISOString(),
    },
    vehicles: [],
    routes: [],
    trips: [],
  };
}

let state = null;
const listeners = new Set();
let saveTimer = null;

function load() {
  if (state) return state;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw);
      state = normalize(parsed);
      return state;
    }
  } catch (err) {
    console.warn('Could not read saved data; starting fresh.', err);
  }
  state = defaultState();
  return state;
}

function normalize(s) {
  const base = defaultState();
  const out = { ...base, ...s };
  out.settings = { ...base.settings, ...(s.settings || {}) };
  out.settings.rates = normalizeRates(s.settings?.rates);
  out.vehicles = Array.isArray(s.vehicles) ? s.vehicles : [];
  out.routes = Array.isArray(s.routes) ? s.routes : [];
  out.trips = Array.isArray(s.trips) ? s.trips : [];
  out.version = SCHEMA_VERSION;
  return out;
}

function normalizeRates(raw) {
  let periods = [];
  if (Array.isArray(raw)) periods = raw;
  else if (raw && typeof raw === 'object') periods = Object.entries(raw).map(([year, r]) => ({ from: `${year}-01-01`, ...r }));
  periods = periods
    .filter((p) => p && isValidISODate(String(p.from || '').slice(0, 10)))
    .map((p) => ({ from: String(p.from).slice(0, 10), business: num(p.business) ?? 0, medical: num(p.medical) ?? 0, charity: num(p.charity) ?? 0 }));
  if (!periods.length) periods = structuredClone(DEFAULT_RATES);
  return sortPeriods(dedupePeriods(periods));
}
function sortPeriods(list) { return list.slice().sort((a, b) => a.from.localeCompare(b.from)); }
function dedupePeriods(list) { const m = new Map(); for (const p of list) m.set(p.from, p); return [...m.values()]; }

function persist() {
  clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch (err) {
      console.error('Save failed', err);
      emit({ type: 'error', error: err });
    }
  }, 0);
}

function emit(change) {
  for (const fn of listeners) {
    try { fn(state, change); } catch (err) { console.error(err); }
  }
}

function commit(change) {
  state.updatedAt = new Date().toISOString();
  persist();
  emit(change);
}

function num(v) {
  const n = typeof v === 'number' ? v : parseFloat(String(v ?? '').replace(/[^0-9.\-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

function round(n, places = 2) { const f = 10 ** places; return Math.round(n * f) / f; }

// ------------------------------------------------------------------ public API

export const store = {
  get state() { return load(); },

  subscribe(fn) {
    listeners.add(fn);
    return () => listeners.delete(fn);
  },

  // ---- settings & units
  settings() { return load().settings; },
  setSettings(patch) {
    Object.assign(load().settings, patch);
    commit({ type: 'settings' });
  },
  units() { return load().settings.units === 'km' ? 'km' : 'mi'; },
  toDisplay(mi) { return toDisplayDistance(Number(mi) || 0, this.units()); },
  fromDisplay(v) { return fromDisplayDistance(Number(v) || 0, this.units()); },

  // ---- rates: stored in cents per MILE (IRS), exposed in cents per display unit.
  // Effective-dated periods sorted ascending by `from`.
  _rateToDisplay(p) {
    const f = this.units() === 'km' ? 1 / KM_PER_MI : 1;
    return { ...p, business: round(p.business * f, 2), medical: round(p.medical * f, 2), charity: round(p.charity * f, 2) };
  },
  ratePeriods() { return load().settings.rates.map((p) => this._rateToDisplay(p)); },
  /** The rate period in effect on a date ('YYYY-MM-DD'); falls back to the earliest period. */
  ratePeriodFor(date) {
    const d = String(date || todayISO()).slice(0, 10);
    const periods = load().settings.rates;
    let match = null;
    for (const p of periods) { if (p.from <= d) match = p; else break; }
    return this._rateToDisplay(match || periods[0] || { from: d, business: 0, medical: 0, charity: 0 });
  },
  rateFor(date, purpose) {
    if (purpose === 'personal') return 0;
    return Number(this.ratePeriodFor(date)[purpose]) || 0;
  },
  /** Add or update the period starting on `from`. Values are cents per display unit. */
  setRatePeriod(from, patch) {
    const s = load();
    const f = String(from).slice(0, 10);
    if (!isValidISODate(f)) throw new Error('Pick a valid start date.');
    const toMile = this.units() === 'km' ? KM_PER_MI : 1;
    const existing = s.settings.rates.find((p) => p.from === f);
    const base = existing || { ...(s.settings.rates.filter((p) => p.from <= f).pop() || s.settings.rates[0] || { business: 0, medical: 0, charity: 0 }), from: f };
    const next = { ...base, from: f };
    for (const k of ['business', 'medical', 'charity']) {
      if (k in patch) { const v = num(patch[k]); if (v == null || v < 0 || v > 500) throw new Error('Rates must be between 0 and 500 cents.'); next[k] = round(v * toMile, 3); }
    }
    s.settings.rates = sortPeriods(dedupePeriods([...s.settings.rates.filter((p) => p.from !== f), next]));
    commit({ type: 'settings' });
    return next;
  },
  deleteRatePeriod(from) {
    const s = load();
    if (s.settings.rates.length <= 1) return false;
    s.settings.rates = s.settings.rates.filter((p) => p.from !== from);
    commit({ type: 'settings' });
    return true;
  },
  resetRates() {
    load().settings.rates = structuredClone(DEFAULT_RATES);
    commit({ type: 'settings' });
  },
  /** Raw stored rate for a date and purpose, in cents per mile (never unit-converted). */
  _rawRate(date, purpose) {
    if (purpose === 'personal') return 0;
    const d = String(date || todayISO()).slice(0, 10);
    const periods = load().settings.rates;
    let match = null;
    for (const p of periods) { if (p.from <= d) match = p; else break; }
    return Number((match || periods[0] || {})[purpose]) || 0;
  },
  /** Dollar value of a trip at the rate in effect on its date. Computed per mile so the
      total never shifts when the display unit changes. */
  tripValue(trip) {
    return round((Number(trip.distanceMi) || 0) * this._rawRate(trip.date, trip.purpose) / 100, 2);
  },

  // ---- vehicles
  vehicles() { return load().vehicles.slice().sort((a, b) => (b.isDefault ? 1 : 0) - (a.isDefault ? 1 : 0) || a.name.localeCompare(b.name)); },
  vehicle(id) { return load().vehicles.find((v) => v.id === id) || null; },
  defaultVehicle() {
    const s = load();
    return s.vehicles.find((v) => v.id === s.settings.defaultVehicleId) || s.vehicles.find((v) => v.isDefault) || s.vehicles[0] || null;
  },
  addVehicle({ name, plate = '', odometer = null, isDefault = false }) {
    const s = load();
    const v = { id: uid(), name: String(name || '').trim() || 'My car', plate: String(plate || '').trim(), odometer: num(odometer), isDefault: false, createdAt: new Date().toISOString() };
    s.vehicles.push(v);
    if (isDefault || s.vehicles.length === 1) this.setDefaultVehicle(v.id, false);
    commit({ type: 'vehicles' });
    return v;
  },
  updateVehicle(id, patch) {
    const v = this.vehicle(id);
    if (!v) return null;
    if ('name' in patch) patch.name = String(patch.name || '').trim() || v.name;
    if ('odometer' in patch) patch.odometer = num(patch.odometer);
    Object.assign(v, patch, { updatedAt: new Date().toISOString() });
    commit({ type: 'vehicles' });
    return v;
  },
  setDefaultVehicle(id, doCommit = true) {
    const s = load();
    for (const v of s.vehicles) v.isDefault = v.id === id;
    s.settings.defaultVehicleId = id;
    if (doCommit) commit({ type: 'vehicles' });
  },
  deleteVehicle(id) {
    const s = load();
    const idx = s.vehicles.findIndex((v) => v.id === id);
    if (idx < 0) return null;
    const [removed] = s.vehicles.splice(idx, 1);
    if (s.settings.defaultVehicleId === id) {
      s.settings.defaultVehicleId = s.vehicles[0]?.id || null;
      if (s.vehicles[0]) s.vehicles[0].isDefault = true;
    }
    commit({ type: 'vehicles' });
    return removed;
  },
  /** Last recorded end odometer for a vehicle, or its stored odometer */
  lastOdometer(vehicleId) {
    const s = load();
    const withOdo = s.trips.filter((t) => t.vehicleId === vehicleId && t.odoEnd != null).sort(byDateDesc);
    if (withOdo.length) return withOdo[0].odoEnd;
    const v = this.vehicle(vehicleId);
    return v && v.odometer != null ? v.odometer : null;
  },

  // ---- trips
  trips() { return load().trips.slice().sort(byDateDesc); },
  trip(id) { return load().trips.find((t) => t.id === id) || null; },
  /** Validates and adds a trip. Throws Error with a friendly message on bad input. */
  addTrip(input) {
    const s = load();
    const t = cleanTrip(input, this);
    t.id = uid();
    t.createdAt = new Date().toISOString();
    s.trips.push(t);
    this._afterTripWrite(t);
    commit({ type: 'trips', id: t.id, op: 'add' });
    return t;
  },
  updateTrip(id, patch) {
    const s = load();
    const idx = s.trips.findIndex((t) => t.id === id);
    if (idx < 0) throw new Error('Trip not found');
    const merged = cleanTrip({ ...s.trips[idx], ...patch }, this);
    merged.id = id;
    merged.createdAt = s.trips[idx].createdAt;
    merged.updatedAt = new Date().toISOString();
    s.trips[idx] = merged;
    this._afterTripWrite(merged);
    commit({ type: 'trips', id, op: 'update' });
    return merged;
  },
  deleteTrip(id) {
    const s = load();
    const idx = s.trips.findIndex((t) => t.id === id);
    if (idx < 0) return null;
    const [removed] = s.trips.splice(idx, 1);
    commit({ type: 'trips', id, op: 'delete' });
    return removed;
  },
  restoreTrip(trip) {
    const s = load();
    if (!trip || s.trips.some((t) => t.id === trip.id)) return;
    s.trips.push(trip);
    commit({ type: 'trips', id: trip.id, op: 'add' });
  },
  _afterTripWrite(t) {
    // keep vehicle odometer current
    if (t.vehicleId && t.odoEnd != null) {
      const v = this.vehicle(t.vehicleId);
      if (v && (v.odometer == null || t.odoEnd > v.odometer)) v.odometer = t.odoEnd;
    }
    // route usage stats
    if (t.routeId) {
      const r = load().routes.find((x) => x.id === t.routeId);
      if (r) { r.useCount = (r.useCount || 0) + 1; r.lastUsed = r.lastUsed && r.lastUsed > t.date ? r.lastUsed : t.date; }
    }
  },

  // ---- queries
  tripsForMonth(year, month) {
    const key = `${year}-${String(month).padStart(2, '0')}`;
    return load().trips.filter((t) => monthKey(t.date) === key).sort(byDateDesc);
  },
  tripsForYear(year) {
    return load().trips.filter((t) => yearOf(t.date) === Number(year)).sort(byDateDesc);
  },
  /** Distinct months that have trips, newest first: [{year, month, count}] */
  monthsWithTrips() {
    const map = new Map();
    for (const t of load().trips) {
      const k = monthKey(t.date);
      map.set(k, (map.get(k) || 0) + 1);
    }
    return [...map.entries()].sort((a, b) => b[0].localeCompare(a[0])).map(([k, count]) => ({ year: Number(k.slice(0, 4)), month: Number(k.slice(5, 7)), count }));
  },
  yearsWithTrips() {
    const set = new Set(load().trips.map((t) => yearOf(t.date)).filter(Boolean));
    return [...set].sort((a, b) => b - a);
  },
  /** Totals: { count, distanceMi, value, byPurpose: {business:{count,distanceMi,value},...}, byVehicle: {id:{...}} } */
  summarize(trips) {
    const out = { count: 0, distanceMi: 0, value: 0, deductibleMi: 0, byPurpose: {}, byVehicle: {} };
    for (const p of PURPOSE_IDS) out.byPurpose[p] = { count: 0, distanceMi: 0, value: 0 };
    for (const t of trips) {
      const v = this.tripValue(t);
      out.count += 1;
      out.distanceMi += t.distanceMi;
      out.value += v;
      if (t.purpose !== 'personal') out.deductibleMi += t.distanceMi;
      const bp = out.byPurpose[t.purpose] || (out.byPurpose[t.purpose] = { count: 0, distanceMi: 0, value: 0 });
      bp.count += 1; bp.distanceMi += t.distanceMi; bp.value += v;
      const vid = t.vehicleId || 'none';
      const bv = out.byVehicle[vid] || (out.byVehicle[vid] = { count: 0, distanceMi: 0, value: 0 });
      bv.count += 1; bv.distanceMi += t.distanceMi; bv.value += v;
    }
    out.value = round(out.value, 2);
    return out;
  },

  // ---- routes (saved from/to pairs with a known distance)
  routes() {
    return load().routes.slice().sort((a, b) => (b.lastUsed || '').localeCompare(a.lastUsed || '') || (b.useCount || 0) - (a.useCount || 0));
  },
  route(id) { return load().routes.find((r) => r.id === id) || null; },
  findRoute(from, to) {
    const f = norm(from), t = norm(to);
    if (!f || !t) return null;
    return load().routes.find((r) => norm(r.from) === f && norm(r.to) === t) || null;
  },
  saveRoute({ from, to, distanceMi, purpose = 'business' }) {
    const s = load();
    const existing = this.findRoute(from, to);
    if (existing) {
      existing.distanceMi = Number(distanceMi) || existing.distanceMi;
      existing.purpose = purpose || existing.purpose;
      commit({ type: 'routes' });
      return existing;
    }
    const r = { id: uid(), from: String(from).trim(), to: String(to).trim(), distanceMi: Number(distanceMi) || 0, purpose, useCount: 0, lastUsed: null, createdAt: new Date().toISOString() };
    s.routes.push(r);
    commit({ type: 'routes' });
    return r;
  },
  updateRoute(id, patch) {
    const r = this.route(id);
    if (!r) return null;
    Object.assign(r, patch);
    commit({ type: 'routes' });
    return r;
  },
  deleteRoute(id) {
    const s = load();
    const idx = s.routes.findIndex((r) => r.id === id);
    if (idx < 0) return null;
    const [removed] = s.routes.splice(idx, 1);
    for (const t of s.trips) if (t.routeId === id) t.routeId = null;
    commit({ type: 'routes' });
    return removed;
  },
  /** Suggestions for quick entry: saved routes first (by recency), then recent distinct trips not already covered. */
  suggestions(limit = 8) {
    const routes = this.routes();
    const seen = new Set(routes.map((r) => `${norm(r.from)}|${norm(r.to)}`));
    const recent = [];
    for (const t of this.trips()) {
      if (!t.from && !t.to) continue;
      const k = `${norm(t.from)}|${norm(t.to)}`;
      if (seen.has(k)) continue;
      seen.add(k);
      recent.push(t);
      if (recent.length >= limit) break;
    }
    return { routes: routes.slice(0, limit), recent: recent.slice(0, Math.max(0, limit - Math.min(routes.length, limit))) };
  },
  /** Distinct place names from routes and trips, most recent first */
  places() {
    const seen = new Map();
    const push = (name, when) => { const k = norm(name); if (!k) return; if (!seen.has(k) || seen.get(k).when < when) seen.set(k, { name: String(name).trim(), when }); };
    for (const t of this.trips()) { push(t.from, t.date || ''); push(t.to, t.date || ''); }
    for (const r of load().routes) { push(r.from, r.lastUsed || 'z'); push(r.to, r.lastUsed || 'z'); }
    return [...seen.values()].sort((a, b) => b.when.localeCompare(a.when)).map((x) => x.name);
  },
  lastTrip() { return this.trips()[0] || null; },

  // ---- export / import
  csv(trips) {
    const units = this.units();
    const head = ['Date', 'From', 'To', 'Purpose', `Distance (${units})`, `Rate (cents per ${units === 'km' ? 'km' : 'mile'})`, 'Value (USD)', 'Vehicle', 'Round trip', 'Odometer start', 'Odometer end', 'Notes'];
    const rows = trips.slice().sort(byDateAsc).map((t) => [
      t.date, t.from, t.to, purposeLabel(t.purpose),
      fmtDistance(t.distanceMi, units, { unit: false, max: 1 }).replace(/,/g, ''),
      this.rateFor(t.date, t.purpose), this.tripValue(t).toFixed(2),
      this.vehicle(t.vehicleId)?.name || '', t.roundTrip ? 'Yes' : 'No',
      t.odoStart ?? '', t.odoEnd ?? '', t.notes || '',
    ]);
    return [head, ...rows].map((r) => r.map(csvEscape).join(',')).join('\r\n') + '\r\n';
  },
  exportJSON() { return JSON.stringify({ app: 'mileage', exportedAt: new Date().toISOString(), data: load() }, null, 2); },
  importJSON(payload, mode = 'merge') {
    const data = payload && payload.data ? payload.data : payload;
    if (!data || !Array.isArray(data.trips)) throw new Error('That file is not a Mileage backup.');
    const incoming = normalize(data);
    const s = load();
    if (mode === 'replace') {
      state = incoming;
    } else {
      const have = new Set(s.trips.map((t) => t.id));
      for (const t of incoming.trips) if (!have.has(t.id)) s.trips.push(t);
      const haveV = new Set(s.vehicles.map((v) => v.id));
      for (const v of incoming.vehicles) if (!haveV.has(v.id)) s.vehicles.push({ ...v, isDefault: false });
      for (const r of incoming.routes) if (!this.findRoute(r.from, r.to)) s.routes.push(r);
    }
    commit({ type: 'import' });
    return { trips: incoming.trips.length, vehicles: incoming.vehicles.length, routes: incoming.routes.length };
  },
  clearAll() {
    state = defaultState();
    state.settings.onboarded = true;
    state.settings.migratedLegacy = true;
    commit({ type: 'clear' });
  },
  /** Replace the whole state (dev/testing) */
  replaceState(next) {
    state = normalize(next);
    commit({ type: 'replace' });
  },

  /** One-time import from the previous IndexedDB-based version of this app. Resolves {trips, vehicles} or null. */
  async migrateLegacy() {
    const s = load();
    if (s.settings.migratedLegacy) return null;
    try {
      if (!('indexedDB' in globalThis)) return null;
      if (typeof indexedDB.databases === 'function') {
        const dbs = await indexedDB.databases();
        if (!dbs.some((d) => d.name === 'mileage')) { s.settings.migratedLegacy = true; commit({ type: 'settings' }); return null; }
      }
      const db = await new Promise((resolve, reject) => {
        const req = indexedDB.open('mileage');
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
        req.onupgradeneeded = () => { /* db did not exist; nothing to migrate */ };
      });
      const names = Array.from(db.objectStoreNames);
      if (!names.includes('trips')) { db.close(); s.settings.migratedLegacy = true; commit({ type: 'settings' }); return null; }
      const readAll = (name) => new Promise((resolve, reject) => {
        const req = db.transaction(name, 'readonly').objectStore(name).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      const [legacyTrips, legacyVehicles] = await Promise.all([readAll('trips'), names.includes('vehicles') ? readAll('vehicles') : []]);
      db.close();
      const vmap = new Map();
      for (const lv of legacyVehicles) {
        if (lv.archived) continue;
        const v = this.addVehicle({ name: lv.name || lv.plate || 'Vehicle', plate: lv.plate || '', odometer: lv.currentOdometer });
        vmap.set(lv.id, { id: v.id, units: lv.units });
      }
      let count = 0;
      for (const lt of legacyTrips) {
        let distance = num(lt.distance);
        if (distance == null && lt.startOdometer != null && lt.endOdometer != null) distance = Number(lt.endOdometer) - Number(lt.startOdometer);
        if (!distance || distance <= 0 || !isValidISODate(String(lt.date || '').slice(0, 10))) continue;
        const veh = vmap.get(lt.vehicleId);
        const distanceMi = veh && veh.units === 'km' ? fromDisplayDistance(distance, 'km') : distance;
        const purpose = classifyPurpose(lt.purpose);
        const notes = [lt.purpose, lt.notes].filter(Boolean).join(' · ');
        try {
          this.addTrip({ date: String(lt.date).slice(0, 10), from: '', to: '', distanceMi, purpose, vehicleId: veh?.id || null, odoStart: num(lt.startOdometer), odoEnd: num(lt.endOdometer), notes, roundTrip: false });
          count += 1;
        } catch (_) { /* skip bad rows */ }
      }
      s.settings.migratedLegacy = true;
      commit({ type: 'migrate' });
      return { trips: count, vehicles: vmap.size };
    } catch (err) {
      console.warn('Legacy migration skipped', err);
      return null;
    }
  },
};

// ------------------------------------------------------------------ helpers

function byDateDesc(a, b) { return (b.date || '').localeCompare(a.date || '') || (b.createdAt || '').localeCompare(a.createdAt || ''); }
function byDateAsc(a, b) { return -byDateDesc(a, b); }
function norm(s) { return String(s || '').trim().toLowerCase(); }

function classifyPurpose(text) {
  const t = norm(text);
  if (/personal|private|commut/.test(t)) return 'personal';
  if (/medic|doctor|hospital|dentist|clinic|pharmac/.test(t)) return 'medical';
  if (/charit|volunteer|donat|nonprofit|church/.test(t)) return 'charity';
  return 'business';
}

/** Coerce and validate a trip object. distance may be given as `distanceMi` (miles) or `distance` (display units). */
function cleanTrip(input, api) {
  const t = { ...input };
  t.date = String(t.date || todayISO()).slice(0, 10);
  if (!isValidISODate(t.date)) throw new Error('Pick a valid date.');
  t.from = String(t.from || '').trim().slice(0, 120);
  t.to = String(t.to || '').trim().slice(0, 120);
  t.purpose = PURPOSE_IDS.includes(t.purpose) ? t.purpose : 'business';
  t.vehicleId = t.vehicleId || api.defaultVehicle()?.id || null;
  t.roundTrip = !!t.roundTrip;
  t.odoStart = num(t.odoStart);
  t.odoEnd = num(t.odoEnd);
  t.notes = String(t.notes || '').trim().slice(0, 500);
  t.routeId = t.routeId || null;
  let mi = num(t.distanceMi);
  if (mi == null && t.distance != null) mi = api.fromDisplay(num(t.distance));
  if (mi == null && t.odoStart != null && t.odoEnd != null) mi = api.fromDisplay(t.odoEnd - t.odoStart);
  if (mi == null || !(mi > 0)) throw new Error('Enter a distance greater than zero.');
  if (mi > 20000) throw new Error('That distance looks too large for one trip.');
  if (t.odoStart != null && t.odoEnd != null && t.odoEnd < t.odoStart) throw new Error('End odometer must be higher than start.');
  t.distanceMi = round(mi, 3);
  delete t.distance;
  return t;
}
