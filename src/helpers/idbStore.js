import { } from "./utility"; // keep placeholder if your linter requires at least one import

const DB_NAME = "gos_report";
const STORE_NAME = "kv";
const INDEX_NS = "by_ns";

function nsKey(ns, key) {
  return `__gosdoc__${String(ns || "no-ns")}__::${String(key)}`;
}

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, 1);
      req.onupgradeneeded = function () {
        const db = req.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const st = db.createObjectStore(STORE_NAME, { keyPath: "k" });
          st.createIndex(INDEX_NS, "ns", { unique: false });
        }
      };
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("idb open failed"));
    } catch (e) {
      reject(e);
    }
  });
}

async function withStore(mode, fn) {
  let db;
  try {
    db = await openDb();
    const tx = db.transaction(STORE_NAME, mode);
    const st = tx.objectStore(STORE_NAME);
    const out = await fn(st, tx);
    await new Promise((res) => {
      tx.oncomplete = () => res();
      tx.onabort = tx.onerror = () => res();
    });
    return out;
  } catch (e) {
    return undefined;
  } finally {
    try { db && db.close && db.close(); } catch (_e) {}
  }
}

export async function idbSet(ns, key, val) {
  const nsStr = String(ns || "no-ns");
  const k = nsKey(nsStr, key);
  const vStr = String(val ?? "");
  try {
    await withStore("readwrite", (st) =>
      st.put({ k, ns: nsStr, key: String(key), v: vStr })
    );
  } catch (_e) {}
}

export async function idbGet(ns, key, fallback = null) {
  const nsStr = String(ns || "no-ns");
  const k = nsKey(nsStr, key);
  try {
    const rec = await withStore("readonly", (st) => st.get(k));
    if (rec && Object.prototype.hasOwnProperty.call(rec, "v")) return String(rec.v ?? "");
    // Fallback: scan NS for 'key' field match (compat)
    const map = await idbGetAll(nsStr);
    if (map && Object.prototype.hasOwnProperty.call(map, key)) return String(map[key] ?? "");
  } catch (_e) {}
  return fallback;
}

export async function idbRemove(ns, key) {
  const nsStr = String(ns || "no-ns");
  const k = nsKey(nsStr, key);
  try {
    await withStore("readwrite", (st) => st.delete(k));
  } catch (_e) {}
}

export async function idbGetAll(ns) {
  const nsStr = String(ns || "no-ns");
  try {
    const out = {};
    await withStore("readonly", (st) => {
      return new Promise((resolve) => {
        const idx = st.index(INDEX_NS);
        const req = idx.openCursor(IDBKeyRange.only(nsStr));
        req.onsuccess = function () {
          const c = req.result;
          if (c) {
            const v = (c.value && c.value.v) ?? "";
            const rawKey = (c.value && c.value.key) || "";
            if (rawKey) out[String(rawKey)] = String(v ?? "");
            c.continue();
          } else {
            resolve(out);
          }
        };
        req.onerror = function () { resolve(out); };
      });
    });
    return out;
  } catch (_e) {
    return {};
  }
}

export async function idbRemovePrefix(ns, prefix) {
  const nsStr = String(ns || "no-ns");
  const pref = String(prefix || "");
  try {
    const all = await idbGetAll(nsStr);
    const keys = Object.keys(all).filter((k) => k.startsWith(pref));
    if (!keys.length) return 0;
    await withStore("readwrite", async (st) => {
      await Promise.all(keys.map((key) => st.delete(nsKey(nsStr, key))));
    });
    return keys.length;
  } catch (_e) {
    return 0;
  }
}

export function toCommaList(val) {
  if (Array.isArray(val)) return val.filter(Boolean).map(String).map((s) => s.trim()).filter(Boolean).join(", ");
  return String(val ?? "").trim();
}

export function fromCommaList(text) {
  return String(text || "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
}
