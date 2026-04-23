import { db, SCHEMA_VERSION, STORES } from '../db.js';
import { triggerDownload } from './csv.js';

export async function exportBackup() {
  const d = await db();
  const out = {
    app: 'mileage',
    schemaVersion: SCHEMA_VERSION,
    exportedAt: new Date().toISOString(),
    data: {},
  };
  for (const store of STORES) {
    const rows = await d.getAll(store);
    if (store === 'attachments') {
      out.data[store] = await Promise.all(rows.map(serializeAttachment));
    } else {
      out.data[store] = rows;
    }
  }
  return out;
}

export async function downloadBackup() {
  const payload = await exportBackup();
  const json = JSON.stringify(payload);
  const date = new Date().toISOString().slice(0, 10);
  const blob = new Blob([json], { type: 'application/json' });
  triggerDownload(blob, `mileage-backup-${date}.json`);
}

export async function importBackup(payload, mode = 'merge') {
  if (!payload || payload.app !== 'mileage') {
    throw new Error('Not a mileage backup file');
  }
  if (payload.schemaVersion !== SCHEMA_VERSION) {
    throw new Error(
      `Backup schema version ${payload.schemaVersion} does not match app version ${SCHEMA_VERSION}`,
    );
  }
  const d = await db();
  const summary = {};
  for (const store of STORES) {
    const rows = payload.data[store] || [];
    summary[store] = 0;
    await d.tx(store, 'readwrite', async (s) => {
      if (mode === 'replace') {
        await reqP(s.clear());
      }
      for (const row of rows) {
        if (mode === 'merge') {
          const existing = await reqP(s.get(row.id));
          if (existing) continue;
        }
        const record = store === 'attachments' ? await deserializeAttachment(row) : row;
        await reqP(s.put(record));
        summary[store]++;
      }
    });
  }
  return summary;
}

async function serializeAttachment(row) {
  const { blob, ...rest } = row;
  const base64 = blob ? await blobToBase64(blob) : null;
  return { ...rest, blobBase64: base64 };
}

async function deserializeAttachment(row) {
  const { blobBase64, ...rest } = row;
  const blob = blobBase64 ? base64ToBlob(blobBase64, rest.mimeType || 'application/octet-stream') : null;
  return { ...rest, blob };
}

function blobToBase64(blob) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result;
      const comma = result.indexOf(',');
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

function base64ToBlob(base64, mimeType) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new Blob([bytes], { type: mimeType });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
