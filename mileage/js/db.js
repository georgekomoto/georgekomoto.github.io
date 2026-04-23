import { openDB } from './util/idb.js';

export const SCHEMA_VERSION = 1;
export const DB_NAME = 'mileage';

export const STORES = [
  'vehicles',
  'trips',
  'expenses',
  'clients',
  'events',
  'attachments',
  'comments',
  'meta',
];

let dbPromise = null;

export function db() {
  if (!dbPromise) {
    dbPromise = openDB(DB_NAME, SCHEMA_VERSION, {
      upgrade(raw, oldVersion) {
        if (oldVersion < 1) {
          const vehicles = raw.createObjectStore('vehicles', { keyPath: 'id' });
          vehicles.createIndex('archived', 'archived');

          const trips = raw.createObjectStore('trips', { keyPath: 'id' });
          trips.createIndex('vehicleId', 'vehicleId');
          trips.createIndex('date', 'date');
          trips.createIndex('clientId', 'clientId');

          const expenses = raw.createObjectStore('expenses', { keyPath: 'id' });
          expenses.createIndex('vehicleId', 'vehicleId');
          expenses.createIndex('tripId', 'tripId');
          expenses.createIndex('date', 'date');
          expenses.createIndex('type', 'type');

          raw.createObjectStore('clients', { keyPath: 'id' });
          raw.createObjectStore('events', { keyPath: 'id' });

          const attachments = raw.createObjectStore('attachments', { keyPath: 'id' });
          attachments.createIndex('parent', ['parentType', 'parentId']);

          const comments = raw.createObjectStore('comments', { keyPath: 'id' });
          comments.createIndex('parent', ['parentType', 'parentId']);

          raw.createObjectStore('meta', { keyPath: 'key' });
        }
      },
    });
  }
  return dbPromise;
}

export function uid() {
  return Date.now().toString(36) + '-' + Math.random().toString(36).slice(2, 10);
}

export async function list(store) {
  const d = await db();
  return d.getAll(store);
}

export async function get(store, id) {
  const d = await db();
  return d.get(store, id);
}

export async function put(store, value) {
  const d = await db();
  const record = { ...value };
  if (!record.id) record.id = uid();
  if (!record.createdAt) record.createdAt = new Date().toISOString();
  await d.put(store, record);
  return record;
}

export async function remove(store, id) {
  const d = await db();
  await d.delete(store, id);
}

export async function byIndex(store, indexName, query) {
  const d = await db();
  return d.getAllFromIndex(store, indexName, query);
}

export async function getMeta(key, fallback = null) {
  const d = await db();
  const row = await d.get('meta', key);
  return row ? row.value : fallback;
}

export async function setMeta(key, value) {
  const d = await db();
  await d.put('meta', { key, value });
}

export async function childrenOf(store, parentType, parentId) {
  const d = await db();
  return d.getAllFromIndex(store, 'parent', [parentType, parentId]);
}

export async function saveTripAndUpdateVehicle(trip) {
  const d = await db();
  return d.tx(['trips', 'vehicles'], 'readwrite', async ({ trips, vehicles }) => {
    const record = { ...trip };
    if (!record.id) record.id = uid();
    if (!record.createdAt) record.createdAt = new Date().toISOString();
    if (record.startOdometer != null && record.endOdometer != null) {
      record.distance = Number(record.endOdometer) - Number(record.startOdometer);
    } else {
      record.distance = null;
    }
    await reqP(trips.put(record));
    if (record.endOdometer != null) {
      const vehicle = await reqP(vehicles.get(record.vehicleId));
      if (vehicle) {
        const current = Number(vehicle.currentOdometer || 0);
        if (Number(record.endOdometer) > current) {
          vehicle.currentOdometer = Number(record.endOdometer);
          await reqP(vehicles.put(vehicle));
        }
      }
    }
    return record;
  });
}

function reqP(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
