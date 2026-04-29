import * as home from './views/home.js';
import * as partitions from './views/partitions.js';
import * as recordings from './views/recordings.js';
import * as detail from './views/detail.js';

const routes = [
  { match: /^\/?$/,                     view: (root) => home.render(root) },
  { match: /^\/partitions$/,            view: (root) => partitions.render(root) },
  { match: /^\/recordings$/,            view: (root) => recordings.render(root) },
  { match: /^\/recording\/(\d+)$/,      view: (root, m) => detail.render(root, parseInt(m[1], 10)) },
];

const app = document.getElementById('app');

async function handleRoute() {
  const hash = location.hash.replace(/^#/, '') || '/';
  for (const route of routes) {
    const m = hash.match(route.match);
    if (m) {
      try {
        app.classList.add('loading');
        await route.view(app, m);
      } catch (err) {
        console.error(err);
        app.innerHTML = `<section class="view"><h2>Something went wrong</h2><pre>${escHtml(err.message)}</pre></section>`;
      } finally {
        app.classList.remove('loading');
        window.scrollTo(0, 0);
        updateNav(hash);
      }
      return;
    }
  }
  app.innerHTML = `<section class="view"><h2>Not found</h2><p><a href="#/">Back to import</a></p></section>`;
}

function updateNav(path) {
  for (const a of document.querySelectorAll('[data-nav]')) {
    const key = a.dataset.nav;
    const active =
      (key === 'import' && path === '/') ||
      (key !== 'import' && path.startsWith('/' + key));
    a.classList.toggle('is-active', active);
  }
}

function escHtml(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

window.addEventListener('hashchange', handleRoute);
window.addEventListener('DOMContentLoaded', handleRoute);
