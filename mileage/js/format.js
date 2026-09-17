// Formatting helpers. Distances are stored in miles; display converts by units.

export const KM_PER_MI = 1.609344;

export function escapeHtml(value) {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function uid() {
  if (globalThis.crypto && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

const numFmtCache = new Map();
export function fmtNum(n, { max = 1, min = 0 } = {}) {
  const key = `${max}:${min}`;
  if (!numFmtCache.has(key)) {
    numFmtCache.set(key, new Intl.NumberFormat(undefined, { maximumFractionDigits: max, minimumFractionDigits: min }));
  }
  return numFmtCache.get(key).format(Number(n) || 0);
}

export function toDisplayDistance(mi, units) {
  return units === 'km' ? mi * KM_PER_MI : mi;
}

export function fromDisplayDistance(value, units) {
  return units === 'km' ? value / KM_PER_MI : value;
}

/** "24.6 mi" / "412 mi" (drops decimals at or above 1,000 to keep headlines tidy) */
export function fmtDistance(mi, units = 'mi', { unit = true, max } = {}) {
  const v = toDisplayDistance(Number(mi) || 0, units);
  const decimals = max ?? (Math.abs(v) >= 1000 ? 0 : 1);
  const s = fmtNum(v, { max: decimals });
  return unit ? `${s} ${units}` : s;
}

const moneyFmt = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 2, maximumFractionDigits: 2 });
const moneyFmt0 = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', minimumFractionDigits: 0, maximumFractionDigits: 0 });

export function fmtMoney(dollars, { cents = true } = {}) {
  const n = Number(dollars) || 0;
  return cents ? moneyFmt.format(n) : moneyFmt0.format(n);
}

/** 70 -> "70¢", 72.5 -> "72.5¢" */
export function fmtCents(c) {
  return `${fmtNum(c, { max: 2 })}¢`;
}

// ---- Dates (ISO 'YYYY-MM-DD' strings in local time) ----

export function pad2(n) { return String(n).padStart(2, '0'); }

export function toISODate(d) {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

export function todayISO() { return toISODate(new Date()); }

export function parseISO(s) {
  if (!s || typeof s !== 'string') return null;
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
}

export function isValidISODate(s) {
  const d = parseISO(s);
  return !!d && !Number.isNaN(d.getTime()) && toISODate(d) === s.slice(0, 10);
}

export function monthKey(s) { return s ? s.slice(0, 7) : ''; }
export function yearOf(s) { return Number((s || '').slice(0, 4)); }

export function addMonths(year, month /* 1-12 */, delta) {
  const d = new Date(year, month - 1 + delta, 1);
  return { year: d.getFullYear(), month: d.getMonth() + 1 };
}

export function daysBetween(aISO, bISO) {
  const a = parseISO(aISO), b = parseISO(bISO);
  if (!a || !b) return null;
  return Math.round((b - a) / 86400000);
}

const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
const MONTHS_SHORT = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
const DAYS_SHORT = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export function monthName(month, short = false) { return (short ? MONTHS_SHORT : MONTHS)[month - 1] || ''; }
export function fmtMonthYear(year, month, short = false) { return `${monthName(month, short)} ${year}`; }

/** 'Sep 17' or 'Sep 17, 2025' when not the current year */
export function fmtDate(s, { weekday = false, year = 'auto' } = {}) {
  const d = parseISO(s);
  if (!d) return '';
  const now = new Date();
  const showYear = year === true || (year === 'auto' && d.getFullYear() !== now.getFullYear());
  let out = `${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}`;
  if (showYear) out += `, ${d.getFullYear()}`;
  if (weekday) out = `${DAYS_SHORT[d.getDay()]}, ${out}`;
  return out;
}

/** 'Today' | 'Yesterday' | 'Wednesday, Sep 17' | 'Wednesday, Sep 17, 2025' */
export function fmtDayHeading(s) {
  const d = parseISO(s);
  if (!d) return '';
  const today = todayISO();
  const diff = daysBetween(s, today);
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  if (diff === -1) return 'Tomorrow';
  const now = new Date();
  const withYear = d.getFullYear() !== now.getFullYear();
  return `${DAYS[d.getDay()]}, ${MONTHS_SHORT[d.getMonth()]} ${d.getDate()}${withYear ? `, ${d.getFullYear()}` : ''}`;
}

/** Friendly relative label for chips: 'Today', 'Yesterday', 'Mon', 'Sep 3' */
export function fmtRelativeShort(s) {
  const diff = daysBetween(s, todayISO());
  if (diff === 0) return 'Today';
  if (diff === 1) return 'Yesterday';
  const d = parseISO(s);
  if (!d) return '';
  if (diff != null && diff > 1 && diff < 7) return DAYS_SHORT[d.getDay()];
  return fmtDate(s);
}

export function csvEscape(v) {
  const s = String(v ?? '');
  return /[",\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function download(filename, text, type = 'text/plain') {
  const blob = new Blob([text], { type: `${type};charset=utf-8` });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 2000);
}

/** Debounce for input handlers */
export function debounce(fn, ms = 150) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}
