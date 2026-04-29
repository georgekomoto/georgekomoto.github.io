import { parseMBR } from '../mbr.js';
import { readSuperblock } from '../mfs.js';
import * as state from '../state.js';

export async function render(root) {
  root.innerHTML = `
<section class="view">
  <div class="view-header"><h2>TiVo Drive Viewer</h2></div>

  <div class="card" style="margin-bottom:1.5rem;">
    <p>Load a raw disk image (.img) of a TiVo hard drive to browse its recordings.
    The file is never uploaded — all parsing happens locally in your browser.</p>
  </div>

  <div class="drop-zone" id="dropZone" role="button" tabindex="0" aria-label="Drop disk image or click to browse">
    <span class="drop-zone-icon">💾</span>
    <p><strong>Drop a TiVo disk image here</strong></p>
    <p class="small">or click to browse &mdash; .img, .bin, .dd files</p>
    <input type="file" class="file-input" id="fileInput" accept=".img,.bin,.dd,.iso,.raw,application/octet-stream">
  </div>

  <div id="scanStatus" style="display:none;">
    <div class="progress-wrap">
      <progress id="scanProgress" value="0" max="100"></progress>
      <p class="progress-label" id="scanLabel">Reading disk…</p>
    </div>
    <div class="scan-log" id="scanLog"></div>
  </div>

  <div id="errorBox" style="display:none;"></div>
</section>`;

  const dropZone   = root.querySelector('#dropZone');
  const fileInput  = root.querySelector('#fileInput');
  const scanStatus = root.querySelector('#scanStatus');
  const scanLog    = root.querySelector('#scanLog');
  const scanLabel  = root.querySelector('#scanLabel');
  const progressEl = root.querySelector('#scanProgress');
  const errorBox   = root.querySelector('#errorBox');

  // Click anywhere in drop zone opens file picker
  dropZone.addEventListener('click', () => fileInput.click());
  dropZone.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') fileInput.click(); });

  dropZone.addEventListener('dragover', e => {
    e.preventDefault();
    dropZone.classList.add('drag-over');
  });
  dropZone.addEventListener('dragleave', () => dropZone.classList.remove('drag-over'));
  dropZone.addEventListener('drop', e => {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
    const file = e.dataTransfer.files[0];
    if (file) processFile(file);
  });

  fileInput.addEventListener('change', () => {
    if (fileInput.files[0]) processFile(fileInput.files[0]);
  });

  function log(level, msg) {
    const span = document.createElement('span');
    span.className = `scan-log-line scan-log-${level}`;
    span.textContent = msg;
    scanLog.appendChild(span);
    scanLog.scrollTop = scanLog.scrollHeight;
  }

  function showError(msg) {
    errorBox.style.display = '';
    errorBox.innerHTML = `<div class="callout callout-error"><strong>Error</strong>${esc(msg)}</div>`;
  }

  async function processFile(file) {
    state.reset();
    state.setFile(file);

    errorBox.style.display = 'none';
    scanLog.innerHTML = '';
    dropZone.style.display = 'none';
    scanStatus.style.display = '';
    scanLabel.textContent = `Reading ${file.name} (${fmtBytes(file.size)})…`;
    progressEl.value = 0;

    // Step 1: MBR
    log('ok', `File: ${file.name}  (${fmtBytes(file.size)})`);
    let mbrResult;
    try {
      mbrResult = await parseMBR(file);
    } catch (e) {
      showError(`Failed to read MBR: ${e.message}`);
      dropZone.style.display = '';
      scanStatus.style.display = 'none';
      return;
    }

    if (!mbrResult.ok) {
      log('err', mbrResult.error);
      // Still navigate to partitions — show what we found
      state.setPartitions([]);
      state.setParseError(mbrResult.error);
      location.hash = '#/partitions';
      return;
    }

    state.setPartitions(mbrResult.partitions);
    const nonEmpty = mbrResult.partitions.filter(p => !p.isEmpty);
    log('ok', `MBR valid — ${nonEmpty.length} partition(s) found`);
    progressEl.value = 10;

    // Step 2: Read MFS superblocks
    const mfsApps = mbrResult.partitions.filter(p => p.isMfsApp);
    const otherCandidates = mbrResult.partitions.filter(p => !p.isEmpty && !p.isMfsApp && !p.isMfsMedia);

    const mfsVolumes = [];

    async function tryMfs(partition) {
      const sb = await readSuperblock(file, partition);
      mfsVolumes.push({ partition, superblock: sb });
      if (sb.ok) {
        log('ok', `  Partition ${partition.index}: MFS volume detected (magic OK, ${sb.objLogSize} log sectors)`);
      } else {
        log('warn', `  Partition ${partition.index} (${partition.typeName}): ${sb.error}`);
      }
    }

    scanLabel.textContent = 'Checking MFS volumes…';
    for (const p of mfsApps) await tryMfs(p);

    // Also probe non-MFS-typed partitions in case of mislabeled images
    if (mfsApps.length === 0) {
      log('warn', 'No MFS App (0x13) partition found — probing all non-empty partitions');
      for (const p of otherCandidates) await tryMfs(p);
    }

    state.setMfsVolumes(mfsVolumes);
    progressEl.value = 30;

    const goodVolumes = mfsVolumes.filter(v => v.superblock.ok);
    if (goodVolumes.length === 0) {
      log('warn', 'No readable MFS volumes found. Showing partition layout only.');
      state.setParseError('No MFS volumes could be parsed. The image may not be a TiVo drive, or the MFS format version is not supported.');
      location.hash = '#/partitions';
      return;
    }

    // Step 3: Scan recordings
    scanLabel.textContent = 'Scanning recording database…';
    log('ok', `Scanning MFS object log…`);

    const allRecordings = [];
    for (const { superblock } of goodVolumes) {
      const result = await scanRecordingsWithProgress(file, superblock, (done, total, found) => {
        progressEl.value = 30 + Math.floor((done / total) * 60);
        scanLabel.textContent = `Scanning sectors… ${done.toLocaleString()} / ${total.toLocaleString()} — ${found} recording(s)`;
      });
      for (const r of result.log) log(r.level, r.msg);
      allRecordings.push(...result.recordings);
    }

    state.setRecordings(allRecordings);
    progressEl.value = 100;
    scanLabel.textContent = `Done — ${allRecordings.length} recording(s) found`;
    log('ok', `Scan complete.`);

    // Brief pause so user sees the 100% state
    await sleep(600);
    location.hash = '#/recordings';
  }
}

// Import here to avoid circular deps at module eval time
async function scanRecordingsWithProgress(file, superblock, onProgress) {
  const { scanRecordings } = await import('../mfs.js');
  return scanRecordings(file, superblock, onProgress);
}

function fmtBytes(n) {
  const units = ['B','KB','MB','GB','TB'];
  let i = 0, v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v % 1 === 0 ? v : v.toFixed(1)} ${units[i]}`;
}

function esc(s) {
  return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

function sleep(ms) {
  return new Promise(r => setTimeout(r, ms));
}
