import * as state from '../state.js';
import { formatDuration, formatTivoDate } from '../mfs.js';

const SORT_OPTIONS = [
  { key: 'date',     label: 'Date' },
  { key: 'title',    label: 'Title' },
  { key: 'channel',  label: 'Channel' },
  { key: 'duration', label: 'Duration' },
];

let currentSort   = 'date';
let currentFilter = '';

export async function render(root) {
  if (!state.file) {
    root.innerHTML = `
<section class="view">
  <div class="callout callout-info">No disk image loaded. <a href="#/">Import one first.</a></div>
</section>`;
    return;
  }

  const recordings = state.recordings || [];

  if (recordings.length === 0) {
    root.innerHTML = `
<section class="view">
  <div class="view-header"><h2>Recordings</h2></div>
  <div class="empty-state">
    <p>No recordings found on this drive.</p>
    <p><a href="#/partitions">View partition details</a> &nbsp;·&nbsp; <a href="#/">Import a different image</a></p>
  </div>
</section>`;
    return;
  }

  const warnCount = recordings.filter(r => !r.parseOk).length;
  const warningHtml = warnCount
    ? `<div class="callout callout-warning" style="margin-bottom:1rem;">
         <strong>${warnCount} recording(s) had parse warnings</strong>
         Some metadata may be incomplete or estimated.
       </div>`
    : '';

  root.innerHTML = `
<section class="view">
  <div class="view-header">
    <h2>Recordings</h2>
    <span class="muted small">${recordings.length} found</span>
    <button class="btn btn-small" id="exportAll" style="margin-left:auto;">Export all as JSON</button>
  </div>

  ${warningHtml}

  <div class="filter-bar">
    <input type="search" id="searchInput" placeholder="Search title, channel, description…" value="${esc(currentFilter)}">
    ${SORT_OPTIONS.map(o =>
      `<button class="sort-btn${currentSort === o.key ? ' active' : ''}" data-sort="${o.key}">${o.label}</button>`
    ).join('')}
  </div>

  <ul class="recording-list" id="recList"></ul>
</section>`;

  const listEl    = root.querySelector('#recList');
  const searchEl  = root.querySelector('#searchInput');
  const exportBtn = root.querySelector('#exportAll');

  renderList(recordings, listEl);

  searchEl.addEventListener('input', () => {
    currentFilter = searchEl.value;
    renderList(recordings, listEl);
  });

  root.querySelectorAll('.sort-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      currentSort = btn.dataset.sort;
      root.querySelectorAll('.sort-btn').forEach(b => b.classList.toggle('active', b === btn));
      renderList(recordings, listEl);
    });
  });

  exportBtn.addEventListener('click', () => {
    const json = JSON.stringify(recordings.map(exportableRecording), null, 2);
    const blob = new Blob([json], { type: 'application/json' });
    triggerDownload(blob, 'tivo-recordings.json');
  });
}

function renderList(recordings, listEl) {
  const q = currentFilter.toLowerCase().trim();

  let filtered = q
    ? recordings.filter(r =>
        r.title.toLowerCase().includes(q) ||
        r.channel.toLowerCase().includes(q) ||
        r.description.toLowerCase().includes(q) ||
        r.episodeTitle.toLowerCase().includes(q)
      )
    : recordings;

  filtered = [...filtered].sort((a, b) => {
    switch (currentSort) {
      case 'title':    return a.title.localeCompare(b.title);
      case 'channel':  return a.channel.localeCompare(b.channel) || sortByDate(a, b);
      case 'duration': return (b.duration || 0) - (a.duration || 0);
      case 'date':
      default:         return sortByDate(a, b);
    }
  });

  if (filtered.length === 0) {
    listEl.innerHTML = `<li style="padding:1.5rem;color:var(--muted);text-align:center;">No recordings match your search.</li>`;
    return;
  }

  listEl.innerHTML = filtered.map((r, i) => {
    const dateStr = r.startTime ? formatTivoDate(r.startTime) : '—';
    const dur     = formatDuration(r.duration);
    const meta    = [r.channel, dateStr, dur].filter(Boolean).join(' · ');
    const warnBit = r.parseOk ? '' : `<span class="parse-warning"> ⚠</span>`;
    const ep      = r.episodeTitle ? `<div class="recording-episode">${esc(r.episodeTitle)}</div>` : '';
    return `
<li>
  <a class="recording-item" href="#/recording/${r._idx}">
    <span class="recording-num">${i + 1}</span>
    <span class="recording-body">
      <span class="recording-title">${esc(r.title)}${warnBit}</span>
      ${ep}
      <span class="recording-meta">${esc(meta)}</span>
    </span>
    <span class="recording-arrow">›</span>
  </a>
</li>`;
  }).join('');
}

function sortByDate(a, b) {
  const ta = a.startTime ? a.startTime.getTime() : 0;
  const tb = b.startTime ? b.startTime.getTime() : 0;
  return tb - ta; // newest first
}

function exportableRecording(r) {
  return {
    title:        r.title,
    episodeTitle: r.episodeTitle || undefined,
    description:  r.description  || undefined,
    channel:      r.channel      || undefined,
    startTime:    r.startTime    ? r.startTime.toISOString() : undefined,
    duration:     r.duration     || undefined,
    quality:      r.quality,
    fsid:         r.fsid,
    streamFsid:   r.streamFsid   || undefined,
    parseOk:      r.parseOk,
    parseWarnings: r.parseWarnings.length ? r.parseWarnings : undefined,
  };
}

function triggerDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a   = document.createElement('a');
  a.href     = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
