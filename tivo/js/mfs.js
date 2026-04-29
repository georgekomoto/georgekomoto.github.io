import { readBytes, readSector, dataView, SECTOR } from './reader.js';

// Known MFS superblock magic values (read as big-endian uint32)
const MFS_MAGIC_PRIMARY = 0xABBAFEED;
const MFS_MAGIC_ALT     = 0xFEEDABBA; // byte-swapped interpretation
const MFS_MAGIC_S1      = 0x3000FFFF; // Series 1 variant

// TiVo epoch: 1993-01-01 00:00:00 UTC
// Seconds from Unix epoch (1970-01-01) to TiVo epoch start
const TIVO_EPOCH_OFFSET = 725846400;

// MFS object type IDs (big-endian uint16)
const OBJ_RECORDING     = 0x0002;
const OBJ_SHOWING       = 0x0001;
const OBJ_STREAM        = 0x001F;

// TYDB attribute IDs within recording object payloads
const ATTR_TITLE         = 0x01;
const ATTR_EPISODE_TITLE = 0x02;
const ATTR_DESCRIPTION   = 0x03;
const ATTR_CHANNEL       = 0x04;
const ATTR_START_TIME    = 0x07;
const ATTR_DURATION      = 0x08;
const ATTR_QUALITY       = 0x0C;
const ATTR_STREAM_FSID   = 0x0D;

// Max object-log sectors to scan before stopping (limits reads on huge drives)
const MAX_SCAN_SECTORS = 20000;

// ----- Superblock -----

export async function readSuperblock(file, partition) {
  const base = partition.lbaStart;
  let bytes;
  try {
    bytes = await readSector(file, base);
  } catch (e) {
    return { ok: false, error: `Read error at LBA ${base}: ${e.message}` };
  }

  const view = dataView(bytes);
  const magic = view.getUint32(0, false); // big-endian

  if (magic !== MFS_MAGIC_PRIMARY && magic !== MFS_MAGIC_ALT && magic !== MFS_MAGIC_S1) {
    return {
      ok: false,
      error: `Not an MFS volume (magic 0x${magic.toString(16).toUpperCase()}, expected 0xABBAFEED)`,
      rawBytes: bytes.slice(0, 64),
    };
  }

  // Superblock layout (all big-endian):
  //  0x00  magic
  //  0x04  checksum
  //  0x08  root fsid
  //  0x0C  flags
  //  0x10  sector size
  //  0x14  unknown
  //  0x18  volume size (sectors)
  //  0x1C  partition list sector offset
  //  0x20  object log start sector (relative to partition start)
  //  0x24  object log size (sectors)
  //  0x28  media chunk size (sectors)
  const rootFsid      = view.getUint32(0x08, false);
  const volumeSectors = view.getUint32(0x18, false);
  const objLogSector  = view.getUint32(0x20, false); // relative to partition
  const objLogSize    = view.getUint32(0x24, false);

  return {
    ok: true,
    magic,
    rootFsid,
    volumeSectors,
    objLogSector,
    objLogSize,
    // Absolute LBA for object log start:
    objLogLbaStart: base + objLogSector,
    rawBytes: bytes.slice(0, 64),
  };
}

// ----- Object log walker -----

export async function scanRecordings(file, superblock, onProgress) {
  const recordings = [];
  const warnings   = [];
  const log        = [];

  const { objLogLbaStart, objLogSize } = superblock;

  if (!objLogLbaStart || !objLogSize) {
    return { recordings, warnings: ['Object log location unknown in superblock'], log };
  }

  const maxSectors = Math.min(objLogSize, MAX_SCAN_SECTORS);
  log.push({ level: 'ok', msg: `Scanning ${maxSectors.toLocaleString()} object log sectors starting at LBA ${objLogLbaStart}` });

  for (let i = 0; i < maxSectors; i++) {
    const lba = objLogLbaStart + i;
    let bytes;
    try {
      bytes = await readSector(file, lba);
    } catch (e) {
      log.push({ level: 'err', msg: `Read error at LBA ${lba}: ${e.message}` });
      break;
    }

    const result = parseSector(bytes);

    if (result.endOfLog) {
      log.push({ level: 'ok', msg: `End-of-log marker at sector ${i}` });
      break;
    }

    for (const record of result.records) {
      if (record.type === OBJ_RECORDING) {
        const rec = decodeRecording(record, recordings.length);
        recordings.push(rec);
        if (rec.parseWarnings.length) {
          for (const w of rec.parseWarnings) warnings.push(w);
        }
      }
    }

    if (onProgress) onProgress(i + 1, maxSectors, recordings.length);
  }

  log.push({ level: 'ok', msg: `Found ${recordings.length} recording object(s)` });
  return { recordings, warnings, log };
}

// ----- Sector parser -----

function parseSector(bytes) {
  const view = dataView(bytes);

  // End-of-log sentinel
  const sectorType = view.getUint32(0, false);
  if (sectorType === 0xFFFFFFFF) return { endOfLog: true, records: [] };

  const records = [];
  let pos = 4; // skip 4-byte sector header

  while (pos + 8 <= bytes.length) {
    const type = view.getUint16(pos,     false); // BE
    const size = view.getUint16(pos + 2, false); // BE

    if (size < 8 || pos + size > bytes.length) break;

    const fsid    = view.getUint32(pos + 4, false);
    const payload = bytes.slice(pos + 8, pos + size);

    records.push({ type, size, fsid, payload });
    pos += size;
  }

  return { endOfLog: false, records };
}

// ----- Recording decoder -----

function decodeRecording(record, idx) {
  const { fsid, payload } = record;
  const warnings = [];
  const attrs    = {};

  // Try structured TLV attribute parsing
  parseTLV(payload, attrs, warnings);

  // Fall back to heuristic string extraction if title is missing
  if (!attrs[ATTR_TITLE] && payload.length >= 4) {
    const strings = extractPrintableStrings(payload, 4);
    if (strings.length) {
      attrs[ATTR_TITLE] = strings[0];
      warnings.push('Title recovered by heuristic string scan');
    }
  }

  const startTimeTivo = attrs[ATTR_START_TIME] || 0;
  const startTime = startTimeTivo
    ? new Date((startTimeTivo + TIVO_EPOCH_OFFSET) * 1000)
    : null;

  const qualityMap = { 0: 'Basic', 1: 'Medium', 2: 'High', 3: 'Best' };

  return {
    _idx:         idx,
    fsid,
    title:        attrs[ATTR_TITLE]         || '(unknown)',
    episodeTitle: attrs[ATTR_EPISODE_TITLE] || '',
    description:  attrs[ATTR_DESCRIPTION]   || '',
    channel:      attrs[ATTR_CHANNEL]       || '',
    startTime,
    duration:     attrs[ATTR_DURATION]      || 0,
    quality:      qualityMap[attrs[ATTR_QUALITY]] || 'Unknown',
    streamFsid:   attrs[ATTR_STREAM_FSID]   || null,
    rawObjectBytes: payload,
    parseWarnings:  warnings,
    parseOk: warnings.length === 0,
  };
}

// ----- TLV attribute parser -----

function parseTLV(payload, attrs, warnings) {
  if (payload.length < 4) return;
  const view = dataView(payload);
  let pos = 0;

  while (pos + 4 <= payload.length) {
    const attrType = view.getUint16(pos,     false); // BE
    const attrLen  = view.getUint16(pos + 2, false); // BE

    if (attrLen === 0) { pos += 4; continue; }
    if (pos + 4 + attrLen > payload.length) break;

    const value = payload.slice(pos + 4, pos + 4 + attrLen);

    switch (attrType) {
      case ATTR_TITLE:
      case ATTR_EPISODE_TITLE:
      case ATTR_DESCRIPTION:
      case ATTR_CHANNEL:
        attrs[attrType] = decodeUtf8(value);
        break;
      case ATTR_START_TIME:
        if (attrLen >= 4) {
          const ts = dataView(value).getUint32(0, false);
          // Sanity-check: valid TiVo timestamps are 0 to ~1.2 billion (covers 1993–2030)
          if (ts > 0 && ts < 1_200_000_000) attrs[attrType] = ts;
          else warnings.push(`Suspicious startTime value: ${ts}`);
        }
        break;
      case ATTR_DURATION:
        if (attrLen >= 4) {
          const dur = dataView(value).getUint32(0, false);
          // Sanity-check: duration 0 to 24 hours in seconds
          if (dur > 0 && dur < 86400) attrs[attrType] = dur;
          else if (dur >= 86400) warnings.push(`Duration unusually long: ${dur}s`);
        }
        break;
      case ATTR_QUALITY:
        if (attrLen >= 1) attrs[attrType] = value[0];
        break;
      case ATTR_STREAM_FSID:
        if (attrLen >= 4) attrs[attrType] = dataView(value).getUint32(0, false);
        break;
    }

    pos += 4 + attrLen;
  }
}

// ----- Helpers -----

function decodeUtf8(bytes) {
  try {
    // Strip trailing null bytes
    let end = bytes.length;
    while (end > 0 && bytes[end - 1] === 0) end--;
    return new TextDecoder('utf-8', { fatal: false }).decode(bytes.slice(0, end)).trim();
  } catch {
    return '';
  }
}

function extractPrintableStrings(bytes, minLen) {
  const results = [];
  let start = -1;
  for (let i = 0; i <= bytes.length; i++) {
    const b = bytes[i];
    const printable = b >= 0x20 && b < 0x7F;
    if (printable) {
      if (start === -1) start = i;
    } else {
      if (start !== -1 && i - start >= minLen) {
        results.push(new TextDecoder().decode(bytes.slice(start, i)).trim());
      }
      start = -1;
    }
  }
  return results;
}

// ----- Formatting helpers -----

export function formatDuration(seconds) {
  if (!seconds) return '—';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  return h ? `${h}h ${m}m` : `${m}m`;
}

export function formatTivoDate(date) {
  if (!date) return '—';
  return date.toLocaleString(undefined, {
    year: 'numeric', month: 'short', day: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });
}

// ----- Hex dump -----

export function hexDump(bytes, limit = 256) {
  const slice = bytes.slice(0, limit);
  let rows = '';
  for (let off = 0; off < slice.length; off += 16) {
    const line = slice.slice(off, off + 16);
    const addr  = off.toString(16).toUpperCase().padStart(8, '0');
    const hex   = Array.from(line).map(b => b.toString(16).toUpperCase().padStart(2,'0')).join(' ').padEnd(16*3 - 1, ' ');
    const ascii = Array.from(line).map(b => (b >= 0x20 && b < 0x7F) ? String.fromCharCode(b) : '.').join('');
    rows += `<tr><td class="addr">${addr}</td><td class="hex">${hex}</td><td class="ascii">${ascii}</td></tr>`;
  }
  return `<table class="hex-dump"><tbody>${rows}</tbody></table>`;
}
