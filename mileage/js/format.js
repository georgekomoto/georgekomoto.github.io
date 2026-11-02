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

/** Current local time as 'HH:MM'. */
export function nowTime(d = new Date()) { return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`; }

/** 'today at 8:05 AM' | 'yesterday at 8:05 AM' | 'Monday, Sep 15 at 8:05 AM' */
export function fmtWhen(dateISO, hhmm) {
  const day = fmtDayHeading(dateISO);
  const relative = ['Today', 'Yesterday', 'Tomorrow'].includes(day);
  const dayPart = relative ? day.toLowerCase() : day;
  const t = fmtTime(hhmm);
  return t ? `${dayPart} at ${t}` : dayPart;
}

/** Whole minutes since a local date and time, or null when unknown or in the future. */
export function minutesSince(dateISO, hhmm, now = new Date()) {
  const d = parseISO(dateISO);
  if (!d) return null;
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (m) d.setHours(Number(m[1]), Number(m[2]), 0, 0);
  const mins = Math.floor((now - d) / 60000);
  return mins >= 0 ? mins : null;
}

/** 0 -> 'just now', 12 -> '12 min', 65 -> '1 hr 5 min'. Blank past 12 hours, where the day says more. */
export function fmtElapsed(mins) {
  if (mins == null || mins >= 720) return '';
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const h = Math.floor(mins / 60), m = mins % 60;
  return m ? `${h} hr ${m} min ago` : `${h} hr ago`;
}

/** 'HH:MM' -> '8:05 AM'. Returns '' for a blank or unparseable value. */
export function fmtTime(hhmm) {
  const m = String(hhmm || '').match(/^(\d{1,2}):(\d{2})/);
  if (!m) return '';
  const h = Number(m[1]);
  const suffix = h < 12 ? 'AM' : 'PM';
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return `${h12}:${m[2]} ${suffix}`;
}

/** '07:50'+'08:24' -> '7:50–8:24 AM'; across noon -> '11:40 AM–12:10 PM'; one side only -> that time. */
export function fmtTimeRange(start, end) {
  const a = fmtTime(start), b = fmtTime(end);
  if (!a || !b) return a || b;
  const [at, ap] = a.split(' '), [bt, bp] = b.split(' ');
  return ap === bp ? `${at}\u2013${bt} ${bp}` : `${a}\u2013${b}`;
}

// ---- odometer readings: typed with the locale's decimal mark, shown with its grouping ----
const NUM_PARTS = new Intl.NumberFormat(undefined).formatToParts(1234567.8);
const DECIMAL = (NUM_PARTS.find((p) => p.type === 'decimal') || { value: '.' }).value;
const GROUP = (NUM_PARTS.find((p) => p.type === 'group') || { value: '' }).value;

/** A typed reading -> canonical '48222.4': grouping removed, the decimal mark normalized to '.', at most
    seven whole digits and one decimal. A trailing mark is kept while typing ('48222.'). */
export function canonReading(raw) {
  let s = String(raw == null ? '' : raw);
  if (GROUP) s = s.split(GROUP).join('');
  s = s.replace(/[\s\u00a0\u202f]/g, '');
  const mark = DECIMAL === ',' ? ',' : '.';
  const i = s.indexOf(mark);
  const whole = (i < 0 ? s : s.slice(0, i)).replace(/\D/g, '').slice(0, 7).replace(/^0+(?=\d)/, '');
  if (i < 0) return whole;
  return `${whole || '0'}.${s.slice(i + 1).replace(/\D/g, '').slice(0, 1)}`;
}

/** Canonical '48222.4' -> '48,222.4' in the locale's marks; '48222.' -> '48,222.' while typing. */
export function groupReading(canon) {
  const s = String(canon == null ? '' : canon);
  if (!s) return '';
  const [w, f] = s.split('.');
  const whole = Number(w || 0).toLocaleString(undefined, { maximumFractionDigits: 0 });
  return f === undefined ? whole : `${whole}${DECIMAL}${f}`;
}

/** Short labels for a set of routes: drop ' · qualifier' and ', city' suffixes when every label stays
    distinct, then cut each side at a word boundary. */
export function routeLabels(routes, max = 14) {
  const SEP = /\s[·•|–—-]\s|,\s/;
  const head = (x) => { const h = String(x || '').split(SEP)[0].trim(); return h || String(x || '').trim(); };
  const cut = (x) => {
    x = String(x || '').trim();
    if (x.length <= max) return x;
    let acc = '';
    for (const w of x.split(/\s+/)) { const next = acc ? `${acc} ${w}` : w; if (next.length > max - 1) break; acc = next; }
    if (!acc) acc = x.slice(0, max - 1);
    return `${acc.replace(/[\s·•,|–—-]+$/, '')}…`;
  };
  const brief = routes.map((r) => `${head(r.from)}|${head(r.to)}`);
  const distinct = new Set(brief).size === brief.length;
  return routes.map((r) => {
    const parts = distinct ? [head(r.from), head(r.to)] : [r.from, r.to];
    const shown = parts.filter((x) => String(x || '').trim());
    return shown.length === 2 ? shown.map(cut).join(' → ') : (r.from ? `From ${cut(r.from)}` : `To ${cut(r.to)}`);
  });
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
