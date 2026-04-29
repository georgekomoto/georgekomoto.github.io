import * as state from '../state.js';
import { hexDump } from '../mfs.js';
import { formatBytes } from '../mbr.js';

export async function render(root) {
  const { file, partitions, mfsVolumes, parseError } = state;

  if (!file) {
    root.innerHTML = `
<section class="view">
  <div class="callout callout-info">No disk image loaded. <a href="#/">Import one first.</a></div>
</section>`;
    return;
  }

  const supMap = Object.fromEntries(
    (mfsVolumes || []).map(v => [v.partition.index, v.superblock])
  );

  let errorHtml = '';
  if (parseError) {
    errorHtml = `<div class="callout callout-warning"><strong>Warning</strong>${esc(parseError)}</div>`;
  }

  const rows = partitions.map(p => {
    if (p.isEmpty) {
      return `<tr class="empty"><td>${p.index + 1}</td><td><span class="badge badge-unknown">Empty</span></td><td>—</td><td>—</td><td>—</td><td>—</td></tr>`;
    }
    const badgeCls = p.typeCls || 'badge-unknown';
    const sb = supMap[p.index];
    let mfsStatus = '';
    if (sb) {
      mfsStatus = sb.ok
        ? `<span class="badge badge-ok">MFS OK</span> ${sb.objLogSize} log sectors`
        : `<span class="badge badge-fail">Not MFS</span>`;
    }
    return `<tr>
      <td>${p.index + 1}</td>
      <td><span class="badge ${badgeCls}">${esc(p.typeName)}</span></td>
      <td class="small muted">${p.lbaStart.toLocaleString()}</td>
      <td>${formatBytes(p.byteSize)}</td>
      <td class="small muted">${p.byteOffset.toLocaleString()}</td>
      <td>${mfsStatus}</td>
    </tr>`;
  }).join('');

  // MFS superblock hex dumps
  const sbDumps = (mfsVolumes || []).filter(v => v.superblock.rawBytes).map(v => {
    const sb = v.superblock;
    const p  = v.partition;
    const title = sb.ok
      ? `Partition ${p.index + 1} MFS Superblock (magic 0x${sb.magic.toString(16).toUpperCase()})`
      : `Partition ${p.index + 1} — first 64 bytes`;
    return `
<div style="margin-top:1rem;">
  <button class="hex-toggle" data-target="sbhex-${p.index}">▶ ${esc(title)}</button>
  <div id="sbhex-${p.index}" style="display:none;">
    <div class="hex-dump-wrap">${hexDump(sb.rawBytes, 64)}</div>
  </div>
</div>`;
  }).join('');

  const recCount = (state.recordings || []).length;
  const actionBtn = recCount > 0
    ? `<a href="#/recordings" class="btn btn-primary">${recCount} Recording${recCount !== 1 ? 's' : ''} →</a>`
    : `<a href="#/" class="btn">← New Import</a>`;

  root.innerHTML = `
<section class="view">
  <div class="view-header">
    <h2>Partition Layout</h2>
    ${actionBtn}
  </div>

  <div class="card" style="padding:.5rem 0;">
    <div style="padding:.5rem 1rem .25rem; font-size:.85rem; color:var(--muted);">
      ${esc(file.name)} &mdash; ${formatBytes(file.size)}
    </div>
    <div style="overflow-x:auto;">
      <table class="partition-table">
        <thead>
          <tr>
            <th>#</th>
            <th>Type</th>
            <th>LBA Start</th>
            <th>Size</th>
            <th>Byte Offset</th>
            <th>MFS Status</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </div>
  </div>

  ${errorHtml}
  ${sbDumps}
</section>`;

  // Toggle hex dumps
  root.querySelectorAll('.hex-toggle').forEach(btn => {
    btn.addEventListener('click', () => {
      const target = root.querySelector('#' + btn.dataset.target);
      const open = target.style.display !== 'none';
      target.style.display = open ? 'none' : '';
      btn.textContent = btn.textContent.replace(open ? '▼' : '▶', open ? '▶' : '▼');
    });
  });
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}
