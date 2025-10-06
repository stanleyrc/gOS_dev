/**
 * Helpers for report state persistence and IO (IndexedDB, parsing, deltas, export).
 * Centralizes side-effects for easier testing and simpler components.
 */
import { eventAnchor, tierKey as keyTier, fieldBase as keyFieldBase } from "./reportKeys";
import { HtmlRenderer } from "./HtmlRenderer";
import { loadInlineReportAssets } from "./reportAssets";
import { buildReportFromState } from "./reportMapper";

// ---- IndexedDB helpers ----

function openOrInitDb(dbName = "gos_report", version = 1) {
  return new Promise((resolve) => {
    const req = indexedDB.open(dbName, version);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains("kv")) {
        db.createObjectStore("kv", { keyPath: "k" });
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => resolve(null);
  });
}

function putAll(db, entries) {
  return new Promise((resolve) => {
    if (!db) return resolve();
    const tx = db.transaction("kv", "readwrite");
    const store = tx.objectStore("kv");
    for (const entry of entries) {
      try {
        if (Array.isArray(entry)) {
          const [k, v] = entry;
          store.put({ k: String(k), v });
        } else if (entry && typeof entry === "object" && ("k" in entry)) {
          store.put({ k: String(entry.k), v: entry.v });
        } else if (entry && typeof entry === "object" && ("key" in entry)) {
          store.put({ k: String(entry.key), v: entry.value });
        }
      } catch (_) {}
    }
    tx.oncomplete = () => {
      db.close();
      resolve();
    };
    tx.onabort = tx.onerror = () => {
      db.close();
      resolve();
    };
  });
}

export async function writeEntries(entries) {
  if (!window.indexedDB) return;
  const db = await openOrInitDb("gos_report", 1);
  await putAll(db, entries);
}

export async function clearCase(caseId) {
  try {
    if (!window.indexedDB || !caseId) return;
    const prefixes = [
      `gos.tier.${caseId}.`,
      `gos.field.${caseId}.`,
      `gos.notes.${caseId}`,
      `gos.genomic.${caseId}`,
    ];
    const dbInfos = (indexedDB.databases && (await indexedDB.databases())) || [];
    const dbNames = (dbInfos || []).map((d) => d?.name).filter(Boolean);
    const matchesPrefix = (s) =>
      typeof s === "string" &&
      prefixes.some((p) => s.startsWith(p) || s.includes(`::${p}`));

    await Promise.all(
      dbNames
        .filter((name) => name && name.startsWith("gos_report"))
        .map(
          (dbName) =>
            new Promise((resolve) => {
              const req = indexedDB.open(dbName);
              req.onerror = () => resolve();
              req.onsuccess = () => {
                const db = req.result;
                const stores = Array.from(db.objectStoreNames || []);
                const nextStore = (i) => {
                  if (i >= stores.length) {
                    db.close();
                    resolve();
                    return;
                  }
                  const storeName = stores[i];
                  const tx = db.transaction(storeName, "readwrite");
                  const store = tx.objectStore(storeName);

                  let usedCursor = false;
                  try {
                    const cursorReq = store.openCursor();
                    usedCursor = true;
                    cursorReq.onsuccess = (e) => {
                      const cursor = e.target.result;
                      if (cursor) {
                        const key = cursor.key;
                        const val = cursor.value;
                        const keyStr = typeof key === "string" ? key : "";
                        const kProp = (val && (val.k || val.key)) || "";
                        const candidateStrs = [keyStr, String(kProp || "")];
                        const shouldDel = candidateStrs.some(matchesPrefix);
                        if (shouldDel) {
                          store.delete(key);
                        }
                        cursor.continue();
                      }
                    };
                  } catch (_) {
                    usedCursor = false;
                  }

                  if (!usedCursor && store.getAllKeys && store.getAll) {
                    const keysReq = store.getAllKeys();
                    const valsReq = store.getAll();
                    keysReq.onsuccess = () => {
                      const keys = keysReq.result || [];
                      valsReq.onsuccess = () => {
                        const vals = valsReq.result || [];
                        keys.forEach((k, idx) => {
                          const keyStr = typeof k === "string" ? k : "";
                          const v = vals[idx];
                          const kProp = (v && (v.k || v.key)) || "";
                          const candidateStrs = [keyStr, String(kProp || "")];
                          const shouldDel = candidateStrs.some(matchesPrefix);
                          if (shouldDel) store.delete(k);
                        });
                      };
                    };
                  }

                  tx.oncomplete = () => nextStore(i + 1);
                  tx.onabort = tx.onerror = () => nextStore(i + 1);
                };

                nextStore(0);
              };
            })
        )
    );
  } catch (err) {
    console.error("Failed clearing case state from IndexedDB:", err);
  }
}

export async function getTierOverride(tierKey) {
  try {
    if (!window.indexedDB || !tierKey) return null;
    const dbInfos = (indexedDB.databases && (await indexedDB.databases())) || [];
    const dbNames = (dbInfos || []).map((d) => d?.name).filter(Boolean);

    for (const dbName of dbNames) {
      if (!dbName || !dbName.startsWith("gos_report")) continue;

      const result = await new Promise((resolve) => {
        const openReq = indexedDB.open(dbName);
        openReq.onerror = () => resolve(null);
        openReq.onsuccess = () => {
          const db = openReq.result;
          const stores = Array.from(db.objectStoreNames || []);
          if (!stores.length) {
            db.close();
            resolve(null);
            return;
          }
          const fullKey = `${dbName}::${tierKey}`;

          const tryStore = (i) => {
            if (i >= stores.length) {
              db.close();
              resolve(null);
              return;
            }
            const storeName = stores[i];
            const tx = db.transaction(storeName, "readonly");
            const store = tx.objectStore(storeName);

            const getReq = store.get(fullKey);
            getReq.onsuccess = () => {
              const val = getReq.result;
              if (val != null) {
                db.close();
                resolve(typeof val === "object" && val !== null ? val.v ?? null : val);
                return;
              }
              if (!store.getAll) {
                tryStore(i + 1);
                return;
              }
              const allReq = store.getAll();
              allReq.onsuccess = () => {
                const arr = allReq.result || [];
                const match = arr.find(
                  (r) =>
                    r?.k === fullKey ||
                    r?.k === tierKey ||
                    r?.key === tierKey ||
                    r === fullKey ||
                    r === tierKey
                );
                if (match) {
                  db.close();
                  resolve(typeof match === "object" && match !== null ? match.v ?? null : match);
                } else {
                  tryStore(i + 1);
                }
              };
              allReq.onerror = () => tryStore(i + 1);
            };
            getReq.onerror = () => tryStore(i + 1);
          };

          tryStore(0);
        };
      });

      if (result != null) {
        const num = Number(result);
        return Number.isFinite(num) ? String(num) : String(result);
      }
    }
  } catch (_) {}
  return null;
}

export async function saveTierOverride(tierKey, value) {
  await writeEntries([[String(tierKey), value]]);
}

export async function saveGlobalNotes(caseId, notes) {
  if (!caseId) return;
  await writeEntries([[`gos.notes.${caseId}`, String(notes || "")]]);
}

// ---- Delta builder ----

export function buildDelta(originalFilteredEvents = [], filteredEvents = [], caseId) {
  const origByUid = new Map((originalFilteredEvents || []).map((d) => [d.uid, d]));
  const normStr = (v) => (v == null ? "" : String(v));
  const toList = (v) =>
    Array.isArray(v)
      ? v.map((s) => String(s).trim()).filter(Boolean)
      : String(v || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);
  const sameArr = (a, b) => {
    if (!Array.isArray(a) || !Array.isArray(b)) return false;
    if (a.length !== b.length) return false;
    for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
    return true;
  };

  const deltaKv = [];
  (filteredEvents || []).forEach((ev) => {
    const orig = origByUid.get(ev.uid) || {};
    const anchor = eventAnchor(ev?.gene, ev?.variant);
    if (!anchor) return;
    const base = keyFieldBase(caseId, anchor);
    const tKey = keyTier(caseId, anchor);

    // Tier override delta
    const curTier = normStr(ev.tier);
    const origTier = normStr(orig.tier);
    if (curTier && curTier !== origTier) {
      deltaKv.push({ k: tKey, v: curTier });
    }

    // Text fields deltas
    const fields = [
      ["gene_summary", "gene_summary"],
      ["variant_summary", "variant_summary"],
      ["effect_description", "effect_description"],
      ["notes", "notes"],
    ];
    fields.forEach(([prop, key]) => {
      const cur = normStr(ev[prop]);
      const prev = normStr(orig[prop]);
      if (cur !== prev) {
        deltaKv.push({ k: `${base}.${key}`, v: cur });
      }
    });

    // Pills deltas
    const curTher = toList(ev.therapeutics);
    const prevTher = toList(orig.therapeutics);
    if (!sameArr(curTher, prevTher)) {
      deltaKv.push({ k: `${base}.therapeutics`, v: curTher });
    }
    const curRes = toList(ev.resistances);
    const prevRes = toList(orig.resistances);
    if (!sameArr(curRes, prevRes)) {
      deltaKv.push({ k: `${base}.resistances`, v: curRes });
    }
  });
  return deltaKv;
}

// ---- Report export ----

export async function exportReport({
  id,
  reportMeta,
  filteredEvents,
  originalFilteredEvents,
  globalNotes,
}) {
  const assets = await loadInlineReportAssets();
  const partialState = {
    CaseReport: { id, metadata: reportMeta },
    FilteredEvents: { filteredEvents },
  };
  const reportObj = buildReportFromState(partialState);

  const deltaKv = buildDelta(originalFilteredEvents, filteredEvents, id);
  if (String(globalNotes || "")) {
    deltaKv.push({ k: `gos.notes.${id}`, v: String(globalNotes || "") });
  }

  const renderer = new HtmlRenderer();
  const filename = id ? `gos_report_${id}.html` : "gos_report.html";
  const res = await renderer.render(reportObj, {
    ...assets,
    filename,
    initialStore: deltaKv, // only deltas as [{k, v}]
  });

  const blob = new Blob([res.html], { type: res.mimeType || "text/html" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = res.filename || filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1500);
}

// ---- Report import parsing ----

function toKvMap(data) {
  const map = new Map();
  const add = (k, v) => {
    if (typeof k === "string") map.set(k, v);
  };
  if (Array.isArray(data)) {
    for (const it of data) {
      if (it && typeof it === "object" && ("k" in it || "key" in it)) {
        add(String(it.k ?? it.key), it.v ?? it.value);
      } else if (Array.isArray(it) && it.length === 2 && typeof it[0] === "string") {
        add(it[0], it[1]);
      }
    }
  } else if (data && typeof data === "object") {
    if (Array.isArray(data.items)) return toKvMap(data.items);
    if (Array.isArray(data.kv)) return toKvMap(data.kv);
    if (data.data && typeof data.data === "object") {
      Object.entries(data.data).forEach(([k, v]) => add(k, v));
    } else {
      Object.entries(data).forEach(([k, v]) => add(k, v));
    }
  }
  return map;
}

export function parseEmbeddedStateFromReportHtml(htmlText, expectedCaseId) {
  const parser = new DOMParser();
  const doc = parser.parseFromString(htmlText, "text/html");

  const meta = doc.querySelector('meta[name="gos-case-id"]');
  const importedCaseId = (meta && meta.getAttribute("content")) || "";
  if (!importedCaseId || importedCaseId !== String(expectedCaseId || "")) {
    const err = new Error("Mismatched case id");
    err.code = "MISMATCH_CASE";
    throw err;
  }

  const scripts = Array.from(doc.querySelectorAll('script[type="application/json"]'));
  let storeMap = new Map();
  for (const s of scripts) {
    try {
      const txt = s.textContent || "";
      if (!txt.trim()) continue;
      const m = toKvMap(JSON.parse(txt));
      const cnt = Array.from(m.keys()).filter((k) => String(k).startsWith("gos.")).length;
      if (cnt > storeMap.size) storeMap = m;
    } catch (_) {}
  }
  if (!storeMap.size) {
    const err = new Error("Missing embedded state");
    err.code = "MISSING_STATE";
    throw err;
  }

  const prefixes = [
    `gos.tier.${expectedCaseId}.`,
    `gos.field.${expectedCaseId}.`,
    `gos.notes.${expectedCaseId}`,
    `gos.genomic.${expectedCaseId}`,
  ];
  const entriesForCase = Array.from(storeMap.entries()).filter(([k]) =>
    prefixes.some((p) => String(k).startsWith(p))
  );

  return { kvMap: storeMap, entriesForCase };
}

// Add this helper to centralize tier-key generation for a record
export function buildTierKey(caseId, record) {
  if (!caseId || !record) return null;
  const anchor = eventAnchor(record?.gene, record?.variant);
  return keyTier(caseId, anchor);
}

// Add this high-level import function to parse HTML, write IDB, and apply to Redux
export async function importReportStateFromHtml({
  htmlText,
  caseId,
  filteredEvents,
  applyTierOverride,
  updateAlterationFields,
  setGlobalNotes,
}) {
  const { kvMap, entriesForCase } = parseEmbeddedStateFromReportHtml(
    htmlText,
    caseId
  );

  // Overwrite IndexedDB for this case
  await clearCase(caseId);
  await writeEntries(entriesForCase);

  const get = (k) => kvMap.get(k);
  const toList = (val) =>
    Array.isArray(val)
      ? val.map(String)
      : String(val || "")
          .split(",")
          .map((s) => s.trim())
          .filter(Boolean);

  for (const ev of filteredEvents || []) {
    const tKey = buildTierKey(caseId, ev);
    const baseKey = keyFieldBase(caseId, eventAnchor(ev?.gene, ev?.variant));

    const tierVal = get(tKey);
    if (tierVal != null && String(tierVal) !== String(ev.tier)) {
      applyTierOverride(ev.uid, String(tierVal));
    }

    const changes = {};
    const gs = get(`${baseKey}.gene_summary`);
    if (gs != null) changes.gene_summary = String(gs);
    const vs = get(`${baseKey}.variant_summary`);
    if (vs != null) changes.variant_summary = String(vs);
    const ed = get(`${baseKey}.effect_description`);
    if (ed != null) changes.effect_description = String(ed);
    const nt = get(`${baseKey}.notes`);
    if (nt != null) changes.notes = String(nt);
    const th = get(`${baseKey}.therapeutics`);
    if (th != null) changes.therapeutics = toList(th);
    const rs = get(`${baseKey}.resistances`);
    if (rs != null) changes.resistances = toList(rs);

    if (Object.keys(changes).length) {
      updateAlterationFields(ev.uid, changes);
    }
  }

  const gnotesKey = `gos.notes.${caseId}`;
  const gnotes = get(gnotesKey);
  if (gnotes != null) {
    setGlobalNotes(String(gnotes));
  }
}
