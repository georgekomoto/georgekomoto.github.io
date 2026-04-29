import { readBytes, dataView } from './reader.js';

const PARTITION_TABLE_OFFSET = 0x1BE;
const PARTITION_ENTRY_SIZE   = 16;
const MBR_SIGNATURE          = 0xAA55; // little-endian at 0x1FE

const PARTITION_TYPES = {
  0x00: { name: 'Empty',      cls: '' },
  0x05: { name: 'Extended',   cls: 'badge-unknown' },
  0x0F: { name: 'Extended',   cls: 'badge-unknown' },
  0x13: { name: 'MFS App',    cls: 'badge-mfs-app' },
  0x14: { name: 'MFS Media',  cls: 'badge-mfs-media' },
  0x82: { name: 'Linux Swap', cls: 'badge-swap' },
  0x83: { name: 'Linux',      cls: 'badge-linux' },
};

export async function parseMBR(file) {
  const bytes = await readBytes(file, 0, 512);
  const view = dataView(bytes);

  const sig = view.getUint16(0x1FE, true); // LE
  if (sig !== MBR_SIGNATURE) {
    return { ok: false, error: `Bad MBR signature: 0x${sig.toString(16).toUpperCase()} (expected 0xAA55)`, partitions: [] };
  }

  const partitions = [];
  for (let i = 0; i < 4; i++) {
    const off = PARTITION_TABLE_OFFSET + i * PARTITION_ENTRY_SIZE;
    const type     = bytes[off + 0x04];
    const lbaStart = view.getUint32(off + 0x08, true); // LE
    const lbaSize  = view.getUint32(off + 0x0C, true); // LE

    const info = PARTITION_TYPES[type] || { name: `Type 0x${type.toString(16).toUpperCase().padStart(2,'0')}`, cls: 'badge-unknown' };
    partitions.push({
      index:      i,
      type,
      typeName:   info.name,
      typeCls:    info.cls,
      lbaStart,
      lbaSize,
      byteOffset: lbaStart * 512,
      byteSize:   lbaSize  * 512,
      isMfsApp:   type === 0x13,
      isMfsMedia: type === 0x14,
      isEmpty:    type === 0x00 || lbaSize === 0,
    });
  }

  const bootSector = bytes.slice(0, 512);
  return { ok: true, partitions, bootSector };
}

export function formatBytes(n) {
  if (n === 0) return '—';
  const units = ['B','KB','MB','GB','TB'];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < units.length - 1) { v /= 1024; i++; }
  return `${v % 1 === 0 ? v : v.toFixed(1)} ${units[i]}`;
}
