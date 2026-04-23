import * as dashboard from './views/dashboard.js';
import * as vehicles from './views/vehicles.js';
import * as trips from './views/trips.js';
import * as expenses from './views/expenses.js';
import * as clients from './views/clients.js';
import * as events from './views/events.js';
import * as reports from './views/reports.js';
import * as settings from './views/settings.js';

const routes = [
  { match: /^\/?$/,                          view: (root) => dashboard.render(root) },
  { match: /^\/vehicles$/,                   view: (root) => vehicles.renderList(root) },
  { match: /^\/vehicles\/new$/,              view: (root) => vehicles.renderForm(root) },
  { match: /^\/vehicles\/([^/]+)\/edit$/,    view: (root, m) => vehicles.renderForm(root, m[1]) },
  { match: /^\/vehicles\/([^/]+)$/,          view: (root, m) => vehicles.renderDetail(root, m[1]) },
  { match: /^\/trips$/,                      view: (root) => trips.renderList(root) },
  { match: /^\/trips\/new$/,                 view: (root) => trips.renderForm(root) },
  { match: /^\/trips\/([^/]+)\/edit$/,       view: (root, m) => trips.renderForm(root, m[1]) },
  { match: /^\/trips\/([^/]+)$/,             view: (root, m) => trips.renderDetail(root, m[1]) },
  { match: /^\/expenses$/,                   view: (root) => expenses.renderList(root) },
  { match: /^\/expenses\/new$/,              view: (root, _, q) => expenses.renderForm(root, null, q) },
  { match: /^\/expenses\/([^/]+)\/edit$/,    view: (root, m) => expenses.renderForm(root, m[1]) },
  { match: /^\/expenses\/([^/]+)$/,          view: (root, m) => expenses.renderDetail(root, m[1]) },
  { match: /^\/clients$/,                    view: (root) => clients.renderList(root) },
  { match: /^\/clients\/new$/,               view: (root) => clients.renderForm(root) },
  { match: /^\/clients\/([^/]+)\/edit$/,     view: (root, m) => clients.renderForm(root, m[1]) },
  { match: /^\/clients\/([^/]+)$/,           view: (root, m) => clients.renderDetail(root, m[1]) },
  { match: /^\/events$/,                     view: (root) => events.renderList(root) },
  { match: /^\/events\/new$/,                view: (root) => events.renderForm(root) },
  { match: /^\/events\/([^/]+)\/edit$/,      view: (root, m) => events.renderForm(root, m[1]) },
  { match: /^\/events\/([^/]+)$/,            view: (root, m) => events.renderDetail(root, m[1]) },
  { match: /^\/reports$/,                    view: (root) => reports.render(root) },
  { match: /^\/settings$/,                   view: (root) => settings.render(root) },
];

const app = document.getElementById('app');

async function handleRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  const [path, queryString] = hash.split('?');
  const query = Object.fromEntries(new URLSearchParams(queryString || ''));
  for (const route of routes) {
    const m = path.match(route.match);
    if (m) {
      try {
        app.classList.add('loading');
        await route.view(app, m, query);
      } catch (err) {
        console.error(err);
        app.innerHTML = `<section class="view"><h2>Something went wrong</h2><pre>${err.message}</pre></section>`;
      } finally {
        app.classList.remove('loading');
        window.scrollTo(0, 0);
        updateActiveNav(path);
      }
      return;
    }
  }
  app.innerHTML = `<section class="view"><h2>Not found</h2><p><a href="#/">Back to dashboard</a></p></section>`;
}

function updateActiveNav(path) {
  const links = document.querySelectorAll('[data-nav]');
  for (const a of links) {
    const key = a.dataset.nav;
    const active = (key === 'dashboard' && path === '/') || (key !== 'dashboard' && path.startsWith('/' + key));
    a.classList.toggle('is-active', active);
  }
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);

if ('serviceWorker' in navigator && location.protocol !== 'file:') {
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./sw.js', { scope: './' }).catch((err) => {
      console.warn('Service worker registration failed:', err);
    });
  });
}
