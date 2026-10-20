// Storage 層：保存先の実装だけを担当する。
// どのアダプタも同じインターフェースを持つ：
//   getAll(collection) / putMany(collection, records) / replaceAll({ collection: records })
// 将来 Firebase / Supabase やネイティブ（Capacitor の SQLite 等）に移す場合は、
// 同じインターフェースのアダプタを作って data.js の createDataService に渡せばよい。

export const COLLECTIONS = ['stores', 'transactions', 'meta'];
const DB_NAME = 'medal-bank';
const DB_VERSION = 1;
const LS_PREFIX = 'medalbank:v1:';

export function createMemoryAdapter() {
  const mem = Object.fromEntries(COLLECTIONS.map((c) => [c, new Map()]));
  return {
    kind: 'memory',
    async getAll(c) { return [...mem[c].values()].map((r) => structuredClone(r)); },
    async putMany(c, records) { for (const r of records) mem[c].set(r.id, structuredClone(r)); },
    async replaceAll(data) {
      for (const c of COLLECTIONS) {
        mem[c].clear();
        for (const r of data[c] ?? []) mem[c].set(r.id, structuredClone(r));
      }
    },
  };
}

function createLocalStorageAdapter() {
  const read = (c) => {
    try { return JSON.parse(localStorage.getItem(LS_PREFIX + c)) ?? []; } catch { return []; }
  };
  const write = (c, list) => localStorage.setItem(LS_PREFIX + c, JSON.stringify(list));
  return {
    kind: 'localstorage',
    async getAll(c) { return read(c); },
    async putMany(c, records) {
      const map = new Map(read(c).map((r) => [r.id, r]));
      for (const r of records) map.set(r.id, r);
      write(c, [...map.values()]);
    },
    async replaceAll(data) { for (const c of COLLECTIONS) write(c, data[c] ?? []); },
  };
}

function openDB() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      for (const c of COLLECTIONS) {
        if (!db.objectStoreNames.contains(c)) db.createObjectStore(c, { keyPath: 'id' });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    req.onblocked = () => reject(new Error('blocked'));
  });
}

const done = (tx) => new Promise((resolve, reject) => {
  tx.oncomplete = () => resolve();
  tx.onerror = () => reject(tx.error);
  tx.onabort = () => reject(tx.error ?? new Error('aborted'));
});

function createIndexedDBAdapter(db) {
  return {
    kind: 'indexeddb',
    getAll(c) {
      return new Promise((resolve, reject) => {
        const req = db.transaction(c, 'readonly').objectStore(c).getAll();
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      });
    },
    async putMany(c, records) {
      const tx = db.transaction(c, 'readwrite');
      const os = tx.objectStore(c);
      for (const r of records) os.put(r);
      await done(tx);
    },
    // 復元はひとつのトランザクションで行い、途中で失敗しても元のデータが残るようにする
    async replaceAll(data) {
      const tx = db.transaction(COLLECTIONS, 'readwrite');
      for (const c of COLLECTIONS) {
        const os = tx.objectStore(c);
        os.clear();
        for (const r of data[c] ?? []) os.put(r);
      }
      await done(tx);
    },
  };
}

/** IndexedDB を優先し、使えなければ localStorage、それも無理ならメモリ（保存されない）で動かす */
export async function createDefaultStorage() {
  try {
    if (typeof indexedDB === 'undefined') throw new Error('no indexedDB');
    const db = await Promise.race([
      openDB(),
      new Promise((_, reject) => setTimeout(() => reject(new Error('timeout')), 3000)),
    ]);
    // 端末の容量が少なくなっても消されにくくする（対応ブラウザのみ）
    navigator.storage?.persist?.().catch(() => {});
    return createIndexedDBAdapter(db);
  } catch {
    try {
      localStorage.setItem(LS_PREFIX + '__probe', '1');
      localStorage.removeItem(LS_PREFIX + '__probe');
      return createLocalStorageAdapter();
    } catch {
      return createMemoryAdapter();
    }
  }
}
