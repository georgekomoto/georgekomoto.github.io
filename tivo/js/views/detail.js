import * as state from '../state.js';
import { formatDuration, formatTivoDate, hexDump } from '../mfs.js';

export async function render(root, idx) {
  const recordings = state.recordings || [];
  const rec = recordings[idx];

  if (!rec) {
    root.innerHTML = `
<section class="view">
  <div class="callout callout-error">Recording #${idx} not found. <a href="#/recordings">Back to list</a></div>
</section>`;
    return;
  }

  const warnHtml = rec.parseWarnings.length
    ? `<div class="callout callout-warning" style="margin-bottom:1rem;">
         <strong>Parse warnings</strong>
         <ul style="margin:.25rem 0 0; padding-left:1.25rem;">${rec.parseWarnings.map(w => `<li>${esc(w)}</li>`).join('')}</ul>
       </div>`
    : '';

  const qualityColor = { Best: '#1a7f37', High: '#1d4ed8', Medium: '#b45309', Basic: '#636b75' }[rec.quality] || '#636b75';

  const metaRows = [
    ['Title',    rec.title],
    rec.episodeTitle ? ['Episode',  rec.episodeTitle] : null,
    rec.description  ? ['Description', rec.description] : null,
    ['Channel',  rec.channel  || '—'],
    ['Date',     rec.startTime ? formatTivoDate(rec.startTime) : '—'],
    ['Duration', formatDuration(rec.duration)],
    ['Quality',  `<span style="color:${qualityColor};font-weight:600;">${esc(rec.quality)}</span>`],
    ['FSID',     `0x${rec.fsid.toString(16).toUpperCase()}`],
    rec.streamFsid ? ['Stream FSID', `0x${rec.streamFsid.toString(16).toUpperCase()}`] : null,
  ].filter(Boolean);

  const prev = idx > 0 ? `<a href="#/recording/${idx - 1}" class="btn btn-small">← Prev</a>` : '';
  const next = idx < recordings.length - 1 ? `<a href="#/recording/${idx + 1}" class="btn btn-small">Next →</a>` : '';

  root.innerHTML = `
<section class="view">
  <div class="view-header">
    <a href="#/recordings" class="btn btn-small">← All Recordings</a>
    <div style="margin-left:auto;display:flex;gap:.5rem;">${prev}${next}</div>
  </div>

  ${warnHtml}

  <div class="metadata-card">
    <div class="metadata-card-header">
      <h2>${esc(rec.title)}</h2>
      ${rec.episodeTitle ? `<p class="muted" style="margin:0;">${esc(rec.episodeTitle)}</p>` : ''}
    </div>
    <div class="metadata-card-body">
      <dl class="details">
        ${metaRows.map(([k, v]) => `<dt>${esc(k)}</dt><dd>${typeof v === 'string' && !v.startsWith('<') ? esc(v) : v}</dd>`).join('')}
      </dl>
    </div>
  </div>

  <div class="action-bar">
    <button class="btn btn-primary" id="exportJson">Export metadata as JSON</button>
  </div>

  <div style="margin-top:1.5rem;">
    <button class="hex-toggle" id="hexToggle">▶ Raw object bytes (${rec.rawObjectBytes.length} bytes)</button>
    <div id="hexWrap" style="display:none;">
      <div class="hex-dump-wrap">
        ${hexDump(rec.rawObjectBytes, 512)}
      </div>
      ${rec.rawObjectBytes.length > 512 ? `<p class="small muted" style="margin:.5rem 0 0;">Showing first 512 of ${rec.rawObjectBytes.length} bytes.</p>` : ''}
    </div>
  </div>
</section>`;

  root.querySelector('#exportJson').addEventListener('click', () => {
    const obj = {
      title:        rec.title,
      episodeTitle: rec.episodeTitle || undefined,
      description:  rec.description  || undefined,
      channel:      rec.channel      || undefined,
      startTime:    rec.startTime    ? rec.startTime.toISOString() : undefined,
      duration:     rec.duration     || undefined,
      quality:      rec.quality,
      fsid:         rec.fsid,
      streamFsid:   rec.streamFsid   || undefined,
      parseOk:      rec.parseOk,
      parseWarnings: rec.parseWarnings.length ? rec.parseWarnings : undefined,
    };
    const blob = new Blob([JSON.stringify(obj, null, 2)], { type: 'application/json' });
    triggerDownload(blob, `tivo-${sanitizeFilename(rec.title)}.json`);
  });

  const hexToggle = root.querySelector('#hexToggle');
  const hexWrap   = root.querySelector('#hexWrap');
  hexToggle.addEventListener('click', () => {
    const open = hexWrap.style.display !== 'none';
    hexWrap.style.display = open ? 'none' : '';
    hexToggle.textContent = hexToggle.textContent.replace(open ? '▼' : '▶', open ? '▶' : '▼');
  });
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

function sanitizeFilename(s) {
  return s.replace(/[^a-z0-9]+/gi, '-').toLowerCase().slice(0, 40) || 'recording';
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
