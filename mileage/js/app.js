// Mileage — app shell: hash router, tab bar, modal sheet, alert, toast.
// Views implement: export function mount(root, ctx) -> optional cleanup fn.

import { store } from './store.js';
import { icon } from './icons.js';
import { escapeHtml } from './format.js';
import * as tripsView from './views/trips.js';
import * as entryView from './views/entry.js';
import * as summaryView from './views/summary.js';
import * as settingsView from './views/settings.js';

const TABS = [
  { id: 'trips', label: 'Trips', icon: 'road', iconActive: 'roadFill', path: '/trips', view: tripsView },
  { id: 'summary', label: 'Summary', icon: 'chart', iconActive: 'chartFill', path: '/summary', view: summaryView },
  { id: 'settings', label: 'Settings', icon: 'gear', iconActive: 'gearFill', path: '/settings', view: settingsView },
];

const tabRoot = document.getElementById('tab-root');
const topBar = document.getElementById('top-bar');
const topBarTitle = topBar.querySelector('.top-bar-title');
const tabBarWrap = document.getElementById('tab-bar');
const sheetRoot = document.getElementById('sheet-root');
const alertRoot = document.getElementById('alert-root');
const toastRoot = document.getElementById('toast-root');

const scrollMemory = new Map();
let current = { tabId: null, params: null, cleanup: null };
let sheet = { name: null, cleanup: null, closing: false };
let pendingPrefill = null;
let lockedScrollY = 0;
let lastNonSheetHash = '#/trips';

// ------------------------------------------------------------ public app API

export const app = {
  navigate(path, { replace = false } = {}) {
    const hash = path.startsWith('#') ? path : `#${path}`;
    if (replace) history.replaceState(null, '', hash); else location.hash = hash;
    if (replace) route();
  },
  /** Open the trip sheet. id: 'new' | tripId. prefill: partial trip for 'new' (e.g. a repeated route). */
  openTrip(id = 'new', prefill = null) {
    pendingPrefill = prefill;
    location.hash = `#/trip/${id}`;
  },
  takePrefill() { const p = pendingPrefill; pendingPrefill = null; return p; },
  closeSheet() {
    if (!sheet.name) return;
    if (location.hash.startsWith('#/trip/')) {
      // Prefer going back so the browser history stays tidy.
      if (history.length > 1 && history.state?.fromApp) history.back();
      else app.navigate(lastNonSheetHash, { replace: true });
    } else {
      closeSheet();
    }
  },
  activeTab() { return current.tabId; },
  toast(message, { actionLabel = '', onAction = null, duration = 4000 } = {}) {
    toastRoot.innerHTML = '';
    const el = document.createElement('div');
    el.className = 'toast';
    el.setAttribute('role', 'status');
    el.innerHTML = `<span>${escapeHtml(message)}</span>${actionLabel ? `<button type="button">${escapeHtml(actionLabel)}</button>` : ''}`;
    toastRoot.appendChild(el);
    requestAnimationFrame(() => el.classList.add('is-in'));
    let done = false;
    const dismiss = () => { if (done) return; done = true; el.classList.remove('is-in'); setTimeout(() => el.remove(), 250); };
    if (actionLabel) el.querySelector('button').addEventListener('click', () => { dismiss(); onAction && onAction(); });
    setTimeout(dismiss, duration);
    return dismiss;
  },
  /** iOS-style alert. Resolves true when confirmed. */
  confirm({ title, message = '', confirmLabel = 'OK', cancelLabel = 'Cancel', destructive = false }) {
    return new Promise((resolve) => {
      alertRoot.hidden = false;
      alertRoot.className = 'alert-root';
      alertRoot.innerHTML = `
        <div class="alert-backdrop"></div>
        <div class="alert" role="alertdialog" aria-modal="true" aria-labelledby="alert-title" ${message ? 'aria-describedby="alert-msg"' : ''}>
          <div class="alert-body">
            <div class="alert-title" id="alert-title">${escapeHtml(title)}</div>
            ${message ? `<div class="alert-msg" id="alert-msg">${escapeHtml(message)}</div>` : ''}
          </div>
          <div class="alert-actions">
            <button type="button" data-act="cancel">${escapeHtml(cancelLabel)}</button>
            <button type="button" data-act="ok" class="${destructive ? 'destructive strong' : 'strong'}">${escapeHtml(confirmLabel)}</button>
          </div>
        </div>`;
      document.body.classList.add('alert-open');
      const prevFocus = document.activeElement;
      const dialog = alertRoot.querySelector('.alert');
      dialog.tabIndex = -1;
      requestAnimationFrame(() => { alertRoot.classList.add('is-open'); dialog.focus({ preventScroll: true }); });
      const finish = (ok) => {
        alertRoot.classList.remove('is-open');
        document.body.classList.remove('alert-open');
        setTimeout(() => { alertRoot.hidden = true; alertRoot.innerHTML = ''; }, 180);
        document.removeEventListener('keydown', onKey);
        if (prevFocus && prevFocus.focus) prevFocus.focus();
        resolve(ok);
      };
      const onKey = (e) => { if (e.key === 'Escape') finish(false); };
      document.addEventListener('keydown', onKey);
      alertRoot.querySelector('[data-act="cancel"]').addEventListener('click', () => finish(false));
      alertRoot.querySelector('[data-act="ok"]').addEventListener('click', () => finish(true));
      alertRoot.querySelector('.alert-backdrop').addEventListener('click', () => finish(false));
    });
  },
  haptic() { try { navigator.vibrate && navigator.vibrate(8); } catch (_) { /* unsupported */ } },
};

// ------------------------------------------------------------ tab bar

function renderTabBar() {
  tabBarWrap.innerHTML = `
    <div class="tab-bar" role="tablist" aria-label="Sections">
      ${TABS.map((t) => `
        <a class="tab" role="tab" href="#${t.path}" data-tab="${t.id}" aria-label="${t.label}">
          <span class="tab-icon" data-icon="${t.icon}" data-icon-active="${t.iconActive}">${icon(t.icon)}</span>
          <span class="tab-label">${t.label}</span>
        </a>`).join('')}
    </div>
    <a class="action-pill" href="#/trip/new" id="log-trip-btn" aria-label="Log a trip">${icon('plusBold', { size: 22 })}<span>Log trip</span></a>`;
  tabBarWrap.querySelector('#log-trip-btn').addEventListener('click', (e) => { e.preventDefault(); app.openTrip('new'); });
  tabBarWrap.querySelectorAll('.tab').forEach((a) => a.addEventListener('click', (e) => {
    // Re-tapping the active tab scrolls to top (iOS convention)
    if (a.dataset.tab === current.tabId && !sheet.name) { e.preventDefault(); window.scrollTo({ top: 0, behavior: 'smooth' }); }
  }));
}

function updateTabBar() {
  tabBarWrap.querySelectorAll('.tab').forEach((a) => {
    const active = a.dataset.tab === current.tabId;
    if (active) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current');
    const holder = a.querySelector('.tab-icon');
    holder.innerHTML = icon(active ? holder.dataset.iconActive : holder.dataset.icon);
  });
}

// ------------------------------------------------------------ routing

function parseHash() {
  const raw = location.hash.replace(/^#/, '') || '/';
  const [path, qs] = raw.split('?');
  const query = Object.fromEntries(new URLSearchParams(qs || ''));
  const parts = path.split('/').filter(Boolean);
  return { path, query, parts };
}

function makeCtx(params, query) {
  const subs = [];
  return {
    app, store, params, query, icon,
    /** Subscribe to store changes for the life of this view */
    onChange(fn) { subs.push(store.subscribe(fn)); },
    _dispose() { subs.forEach((u) => u()); subs.length = 0; },
  };
}

async function mountTab(tab, params, query) {
  const sameTab = current.tabId === tab.id && JSON.stringify(current.params) === JSON.stringify(params);
  if (sameTab) return;
  if (current.tabId) scrollMemory.set(current.tabId, window.scrollY);
  unmountTab();
  current = { tabId: tab.id, params, cleanup: null };
  const ctx = makeCtx(params, query);
  tabRoot.innerHTML = '';
  tabRoot.dataset.tab = tab.id;
  try {
    const cleanup = await tab.view.mount(tabRoot, ctx);
    current.cleanup = () => { ctx._dispose(); if (typeof cleanup === 'function') cleanup(); };
  } catch (err) {
    console.error(err);
    tabRoot.innerHTML = `<div class="page"><div class="page-header"><h1 class="large-title">Something went wrong</h1></div><div class="card"><p class="muted">${escapeHtml(err.message)}</p></div></div>`;
  }
  updateTabBar();
  updateTopBarTitle();
  const y = params.section ? 0 : (scrollMemory.get(tab.id) || 0);
  window.scrollTo(0, y);
  onScroll();
}

function unmountTab() {
  if (current.cleanup) { try { current.cleanup(); } catch (e) { console.error(e); } }
  current.cleanup = null;
}

async function openSheet(name, params, query) {
  if (sheet.name === name && sheet.params?.id === params.id) return;
  if (sheet.name) await closeSheet(true);
  sheet = { name, params, cleanup: null, closing: false };
  sheetRoot.hidden = false;
  sheetRoot.innerHTML = `
    <div class="sheet-backdrop"></div>
    <div class="sheet" role="dialog" aria-modal="true" aria-labelledby="sheet-title">
      <div class="sheet-grabber" aria-hidden="true"></div>
      <div class="sheet-view"></div>
    </div>`;
  const view = sheetRoot.querySelector('.sheet-view');
  view.style.display = 'contents';
  const ctx = makeCtx(params, query);
  ctx.close = () => app.closeSheet();
  try {
    const cleanup = await entryView.mount(view, ctx);
    sheet.cleanup = () => { ctx._dispose(); if (typeof cleanup === 'function') cleanup(); };
  } catch (err) {
    console.error(err);
    view.innerHTML = `<div class="sheet-header"><button class="nav-btn" id="sheet-err-close">Close</button><div class="sheet-title">Error</div><span></span></div><div class="sheet-content"><div class="card"><p class="muted">${escapeHtml(err.message)}</p></div></div>`;
    view.querySelector('#sheet-err-close').addEventListener('click', () => app.closeSheet());
  }
  // Lock the page behind the sheet without losing its scroll position: the tab root becomes a
  // fixed-height, overflow-hidden box, so mirror window.scrollY into its own scrollTop.
  lockedScrollY = window.scrollY;
  document.body.classList.add('sheet-open');
  tabRoot.scrollTop = lockedScrollY;
  applyThemeColor();
  sheetRoot.querySelector('.sheet-backdrop').addEventListener('click', () => app.closeSheet());
  document.addEventListener('keydown', onSheetKey);
  // trap focus lightly: move focus into the sheet
  requestAnimationFrame(() => {
    sheetRoot.classList.add('is-open');
    const first = sheetRoot.querySelector('[autofocus], input, button');
    if (first && !matchMedia('(pointer: coarse)').matches) first.focus({ preventScroll: true });
  });
}

function onSheetKey(e) { if (e.key === 'Escape') app.closeSheet(); }

function closeSheet(immediate = false) {
  return new Promise((resolve) => {
    if (!sheet.name) return resolve();
    const done = () => {
      if (sheet.cleanup) { try { sheet.cleanup(); } catch (e) { console.error(e); } }
      sheet = { name: null, cleanup: null, closing: false };
      applyThemeColor();
      sheetRoot.innerHTML = '';
      sheetRoot.hidden = true;
      document.removeEventListener('keydown', onSheetKey);
      resolve();
    };
    document.body.classList.remove('sheet-open');
    document.documentElement.style.removeProperty('--kb-inset');
    document.documentElement.style.removeProperty('--sheet-safe-bottom');
    window.scrollTo(0, lockedScrollY);
    sheetRoot.classList.remove('is-open');
    if (immediate || matchMedia('(prefers-reduced-motion: reduce)').matches) done(); else setTimeout(done, 400);
  });
}

async function route() {
  const { path, query, parts } = parseHash();
  // Sheet routes: #/trip/new, #/trip/:id
  if (parts[0] === 'trip' && parts[1]) {
    if (!current.tabId) await mountTab(TABS[0], {}, {});
    await openSheet('entry', { id: parts[1] }, query);
    return;
  }
  lastNonSheetHash = location.hash || '#/trips';
  if (sheet.name) await closeSheet();
  const tab = TABS.find((t) => parts[0] === t.id) || TABS[0];
  const params = parts.length > 1 ? { section: parts.slice(1).join('/') } : {};
  if (!parts.length || (parts[0] !== tab.id)) history.replaceState(null, '', `#${tab.path}`);
  await mountTab(tab, params, query);
}

// ------------------------------------------------------------ top bar (large title collapse)

function updateTopBarTitle() {
  const h1 = tabRoot.querySelector('.large-title');
  topBarTitle.textContent = h1 ? h1.textContent.trim() : '';
  // Sub-pages declare a back destination on their .page (data-back-hash, data-back-label);
  // the shell keeps that button fixed in the top bar like a UINavigationBar.
  const page = tabRoot.querySelector('.page');
  const back = topBar.querySelector('.top-bar-back');
  if (page && page.dataset.backHash) {
    back.hidden = false;
    back.setAttribute('href', page.dataset.backHash);
    back.innerHTML = `${icon('chevronLeft', { size: 26 })}<span>${escapeHtml(page.dataset.backLabel || 'Back')}</span>`;
  } else {
    back.hidden = true;
  }
}

function onScroll() {
  const h1 = tabRoot.querySelector('.large-title');
  if (!h1) { topBar.classList.remove('is-collapsed'); return; }
  const rect = h1.getBoundingClientRect();
  const barBottom = topBar.getBoundingClientRect().bottom;
  topBar.classList.toggle('is-collapsed', rect.bottom <= barBottom + 2);
}

window.addEventListener('scroll', onScroll, { passive: true });

// Keep the sheet footer above the on-screen keyboard (iOS shrinks only the visual viewport).
if (window.visualViewport) {
  const vv = window.visualViewport;
  const onViewport = () => {
    if (!sheet.name) { document.documentElement.style.removeProperty('--kb-inset'); document.documentElement.style.removeProperty('--sheet-safe-bottom'); return; }
    const inset = Math.max(0, Math.round(window.innerHeight - vv.height - vv.offsetTop));
    document.documentElement.style.setProperty('--kb-inset', `${inset}px`);
    document.documentElement.style.setProperty('--sheet-safe-bottom', inset > 40 ? '0px' : 'var(--safe-bottom)');
  };
  vv.addEventListener('resize', onViewport);
  vv.addEventListener('scroll', onViewport);
}
const titleObserver = new MutationObserver(() => { updateTopBarTitle(); onScroll(); });
titleObserver.observe(tabRoot, { childList: true, subtree: true, characterData: true });

// ------------------------------------------------------------ boot

function applyTheme() {
  const theme = store.settings().theme || 'system';
  if (theme === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.setAttribute('data-theme', theme);
  applyThemeColor();
}

/** iOS colors the status bar from theme-color: match the page, and go black while a sheet is up. */
function applyThemeColor() {
  const theme = store.settings().theme || 'system';
  const dark = theme === 'dark' || (theme === 'system' && matchMedia('(prefers-color-scheme: dark)').matches);
  const color = sheet.name || dark ? '#000000' : '#F2F2F7';
  document.querySelectorAll('meta[name="theme-color"]').forEach((m) => { m.removeAttribute('media'); m.setAttribute('content', color); });
}

store.subscribe((_, change) => { if (change.type === 'settings' || change.type === 'replace' || change.type === 'clear') applyTheme(); });
matchMedia('(prefers-color-scheme: dark)').addEventListener('change', applyTheme);

window.addEventListener('hashchange', () => {
  // mark history entries created from within the app so closeSheet can go back safely
  if (!history.state) history.replaceState({ fromApp: true }, '');
  route();
});

async function boot() {
  applyTheme();
  renderTabBar();
  if (!history.state) history.replaceState({ fromApp: false }, '');
  await route();
  const migrated = await store.migrateLegacy();
  if (migrated && migrated.trips > 0) {
    app.toast(`Imported ${migrated.trips} trip${migrated.trips === 1 ? '' : 's'} from the previous version`, { duration: 6000 });
  }
  if ('serviceWorker' in navigator && location.protocol !== 'file:' && !isDev()) {
    window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js', { scope: './' }).catch(() => {}));
  }
}

function isDev() { return ['localhost', '127.0.0.1'].includes(location.hostname); }

if (isDev()) {
  import('./demo.js').then((m) => {
    window.__mileage = {
      store, app,
      seed: (name = 'demo') => { m.seed(store, name); return store.state; },
      go: (hash) => { location.hash = hash; },
      isSheetOpen: () => !!sheet.name,
    };
    document.documentElement.dataset.ready = '1';
  });
} else {
  document.documentElement.dataset.ready = '1';
}

boot();
