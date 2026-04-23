// Minimal promise-based IndexedDB wrapper.
// Not a general-purpose library — only the operations this app needs.

export function openDB(name, version, { upgrade } = {}) {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(name, version);
    req.onupgradeneeded = (e) => {
      if (upgrade) upgrade(req.result, e.oldVersion, e.newVersion, req.transaction);
    };
    req.onsuccess = () => resolve(wrapDB(req.result));
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('IndexedDB open blocked'));
  });
}

function wrapDB(db) {
  return {
    raw: db,
    get: (store, key) => op(db, store, 'readonly', (s) => s.get(key)),
    getAll: (store) => op(db, store, 'readonly', (s) => s.getAll()),
    getAllFromIndex: (store, indexName, query) =>
      op(db, store, 'readonly', (s) => s.index(indexName).getAll(query)),
    put: (store, value) => op(db, store, 'readwrite', (s) => s.put(value)),
    add: (store, value) => op(db, store, 'readwrite', (s) => s.add(value)),
    delete: (store, key) => op(db, store, 'readwrite', (s) => s.delete(key)),
    clear: (store) => op(db, store, 'readwrite', (s) => s.clear()),
    tx: (stores, mode, fn) => runTx(db, stores, mode, fn),
  };
}

function op(db, store, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(store, mode);
    const req = fn(tx.objectStore(store));
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    tx.onerror = () => reject(tx.error);
  });
}

function runTx(db, stores, mode, fn) {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(stores, mode);
    const stored = Array.isArray(stores)
      ? Object.fromEntries(stores.map((n) => [n, tx.objectStore(n)]))
      : tx.objectStore(stores);
    let result;
    Promise.resolve(fn(stored, tx)).then(
      (r) => { result = r; },
      (e) => { try { tx.abort(); } catch (_) {} reject(e); },
    );
    tx.oncomplete = () => resolve(result);
    tx.onerror = () => reject(tx.error);
    tx.onabort = () => reject(tx.error || new Error('Transaction aborted'));
  });
}

export function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}
