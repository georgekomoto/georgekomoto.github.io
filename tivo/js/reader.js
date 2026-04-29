const SECTOR_SIZE = 512;

export async function readBytes(file, byteOffset, length) {
  const start = Number(byteOffset);
  const slice = file.slice(start, start + length);
  if (slice.arrayBuffer) {
    return new Uint8Array(await slice.arrayBuffer());
  }
  // FileReader fallback for older browsers
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(new Uint8Array(fr.result));
    fr.onerror = () => reject(fr.error);
    fr.readAsArrayBuffer(slice);
  });
}

export async function readSector(file, lba) {
  return readBytes(file, lba * SECTOR_SIZE, SECTOR_SIZE);
}

export async function readSectors(file, lba, count) {
  return readBytes(file, lba * SECTOR_SIZE, count * SECTOR_SIZE);
}

export function dataView(bytes) {
  return new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
}

export const SECTOR = SECTOR_SIZE;
