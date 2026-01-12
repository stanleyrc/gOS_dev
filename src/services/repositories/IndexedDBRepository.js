/**
 * IndexedDB implementation of EventInterpretationRepository.
 * Handles browser-based persistent storage for event interpretations.
 */

import { EventInterpretationRepository } from "./EventInterpretationRepository";
import EventInterpretation from "../../helpers/EventInterpretation";

const DB_NAME = "gOS_Interpretations";
const STORE_NAME = "interpretations";
const DB_VERSION = 4;
const INDEX_BY_CASE = "by_case";
const INDEX_BY_DATASET = "by_dataset";
const INDEX_BY_DATASET_CASE = "by_dataset_case";
const INDEX_BY_GENE_VARIANT = "by_gene_variant";

// Timeout for IndexedDB operations (prevents indefinite hangs)
const DB_OPERATION_TIMEOUT = 30000; // 30 seconds

// Connection pooling to prevent "database locked" errors
let dbInstance = null;
let dbOpenPromise = null;

function openDb() {
  // If connection already exists and is open, reuse it
  if (dbInstance) {
    return Promise.resolve(dbInstance);
  }

  // If opening is in progress, wait for it
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  // Start the opening process
  dbOpenPromise = new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        dbOpenPromise = null;
        console.error("IndexedDB open timeout - database may be locked or blocked");
        reject(new Error("IndexedDB open timeout - database may be locked"));
      }
    }, DB_OPERATION_TIMEOUT);

    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onblocked = () => {
        console.warn("IndexedDB open blocked - waiting for other connections to close. If this persists, try closing other tabs or restarting the browser.");
      };

      req.onupgradeneeded = (event) => {
        const db = req.result;
        const tx = event.target.transaction;

        if (!db.objectStoreNames.contains(STORE_NAME)) {
          // Fresh database - create store with all indices
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex(INDEX_BY_CASE, "caseId", { unique: false });
          store.createIndex(INDEX_BY_DATASET, "datasetId", { unique: false });
          store.createIndex(INDEX_BY_DATASET_CASE, ["datasetId", "caseId"], { unique: false });
          store.createIndex(INDEX_BY_GENE_VARIANT, ["gene", "variant_type"], { unique: false });
        } else {
          // Existing database - add any missing indices
          const store = tx.objectStore(STORE_NAME);
          if (!store.indexNames.contains(INDEX_BY_DATASET)) {
            store.createIndex(INDEX_BY_DATASET, "datasetId", { unique: false });
          }
          if (!store.indexNames.contains(INDEX_BY_DATASET_CASE)) {
            store.createIndex(INDEX_BY_DATASET_CASE, ["datasetId", "caseId"], { unique: false });
          }
          if (!store.indexNames.contains(INDEX_BY_GENE_VARIANT)) {
            store.createIndex(INDEX_BY_GENE_VARIANT, ["gene", "variant_type"], { unique: false });
          }
        }
      };

      req.onsuccess = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          dbInstance = req.result;
          dbInstance.onclose = () => {
            dbInstance = null;
          };
          resolve(dbInstance);
        }
      };

      req.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          dbOpenPromise = null;
          reject(req.error || new Error("IndexedDB open failed"));
        }
      };
    } catch (e) {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        dbOpenPromise = null;
        reject(e);
      }
    }
  }).then(db => {
    dbOpenPromise = null;
    return db;
  }).catch(err => {
    dbOpenPromise = null;
    throw err;
  });

  return dbOpenPromise;
}

async function withStore(storeName, mode, fn) {
  let db;
  try {
    db = await openDb();
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);

    // Set up transaction completion handler BEFORE running fn
    // This prevents a race condition where the transaction completes
    // before we can attach the oncomplete handler
    const txComplete = new Promise((resolve, reject) => {
      let settled = false;

      const timeoutId = setTimeout(() => {
        if (!settled) {
          settled = true;
          console.error("IndexedDB transaction timeout");
          reject(new Error("IndexedDB transaction timeout"));
        }
      }, DB_OPERATION_TIMEOUT);

      tx.oncomplete = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          resolve();
        }
      };
      tx.onabort = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(tx.error || new Error("Transaction aborted"));
        }
      };
      tx.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          reject(tx.error || new Error("Transaction failed"));
        }
      };
    });

    const result = await fn(store, tx);
    await txComplete;

    return result;
  } catch (e) {
    console.error("IndexedDB operation failed:", e.message);
    throw e;
  }
  // Note: Do not close the database here - we're reusing the connection to prevent lock errors
}

export class IndexedDBRepository extends EventInterpretationRepository {
  async save(interpretation) {
    if (!window.indexedDB) {
      throw new Error("IndexedDB not available");
    }
    
    if (!(interpretation instanceof EventInterpretation)) {
      interpretation = new EventInterpretation(interpretation);
    }
    
    if (!interpretation.caseId || !interpretation.alterationId) {
      throw new Error("EventInterpretation must have caseId and alterationId");
    }
    
    const json = interpretation.toJSON ? interpretation.toJSON() : interpretation;
    const data = {
    id: EventInterpretation.createId(json.datasetId, json.caseId, json.alterationId, json.authorId),
    ...json,
    updatedAt: Date.now(),
    };
    
    await withStore(STORE_NAME, "readwrite", (store) => {
      return new Promise((resolve, reject) => {
        const req = store.put(data);
        req.onsuccess = () => resolve();
        req.onerror = () => reject(req.error);
      });
    });
    
    return interpretation;
  }

  async get(datasetId, caseId, alterationId, authorId) {
    if (!window.indexedDB) return null;

    const id = EventInterpretation.createId(datasetId, caseId, alterationId, authorId);

    try {
      const data = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      });

      return data ? new EventInterpretation(data) : null;
    } catch (e) {
      console.error("Failed to get interpretation:", e);
      return null;
    }
  }

  async getForCase(datasetId, caseId) {
  if (!window.indexedDB) return [];
  if (!datasetId || !caseId) return [];

  try {
  const results = await withStore(STORE_NAME, "readonly", (store) => {
  return new Promise((resolve, reject) => {
  const index = store.index(INDEX_BY_DATASET_CASE);
  const req = index.getAll([datasetId, caseId]);

  req.onsuccess = () => resolve(req.result || []);
  req.onerror = () => reject(req.error);
  });
  });

  return results.map((data) => new EventInterpretation(data));
  } catch (e) {
  console.error("Failed to get interpretations for case:", e);
  return [];
  }
  }

  async delete(datasetId, caseId, alterationId, authorId) {
    if (!window.indexedDB) return;

    const id = EventInterpretation.createId(datasetId, caseId, alterationId, authorId);

    try {
      await withStore(STORE_NAME, "readwrite", (store) => {
        return new Promise((resolve, reject) => {
          const req = store.delete(id);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.error("Failed to delete interpretation:", e);
    }
  }

  async clearCase(datasetId, caseId) {
    if (!window.indexedDB || !datasetId || !caseId) return;

    try {
      const interpretations = await this.getForCase(datasetId, caseId);

      await withStore(STORE_NAME, "readwrite", async (store) => {
        const deletePromises = interpretations.map((interp) => {
          return new Promise((resolve, reject) => {
            const req = store.delete(interp.id);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
          });
        });

        await Promise.all(deletePromises);
      });
    } catch (e) {
      console.error("Failed to clear case:", e);
      throw e;
    }
  }

  async bulkSave(interpretations) {
    if (!window.indexedDB) {
      throw new Error("IndexedDB not available");
    }
    
    if (!Array.isArray(interpretations) || interpretations.length === 0) {
      return [];
    }
    
    const normalized = interpretations.map((interp) =>
      interp instanceof EventInterpretation
        ? interp
        : new EventInterpretation(interp)
    );
    
    await withStore(STORE_NAME, "readwrite", async (store) => {
      const savePromises = normalized.map((interp) => {
        return new Promise((resolve, reject) => {
          const json = interp.toJSON ? interp.toJSON() : interp;
          const data = {
          id: EventInterpretation.createId(json.datasetId, json.caseId, json.alterationId, json.authorId),
          ...json,
          updatedAt: Date.now(),
          };

          const req = store.put(data);
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
      
      await Promise.all(savePromises);
    });
    
    return normalized;
  }

  async saveGlobalNotes(datasetId, caseId, notes) {
  if (!window.indexedDB || !datasetId || !caseId) return;

  const interpretation = new EventInterpretation({
  datasetId,
  caseId,
  alterationId: "GLOBAL_NOTES",
  data: { notes: String(notes || "") }
  });

    await this.save(interpretation);
  }

  async getAll() {
    if (!window.indexedDB) return [];

    try {
      const results = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });

      return results.map((data) => new EventInterpretation(data));
    } catch (e) {
      console.error("Failed to get all interpretations:", e);
      return [];
    }
  }

  async getGlobalNotes(datasetId, caseId) {
  if (!window.indexedDB || !datasetId || !caseId) return null;

  const interpretation = await this.get(datasetId, caseId, "GLOBAL_NOTES", null);
    return interpretation?.data?.notes ?? null;
  }

  async getCasesWithInterpretations(datasetId) {
  if (!window.indexedDB || !datasetId) {
    return {
      withTierChange: new Set(),
      byAuthor: new Map(),
      byGene: new Map(),
      all: new Set(),
    };
  }

  try {
    // Categorize cases by tier change, author, and gene
    const withTierChange = new Set();
    const byAuthor = new Map();
    const byGene = new Map();
    const all = new Set();

    // Use cursor to iterate through results in chunks to avoid transaction timeout
    await withStore(STORE_NAME, "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const index = store.index(INDEX_BY_DATASET);
        const req = index.openCursor(datasetId);

        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const item = cursor.value;
            const caseId = item.caseId;
            all.add(caseId);
            
            // Tier changes
            if (item.hasTierChange) {
              withTierChange.add(caseId);
            }
            
            // By author
            if (item.authorName) {
              if (!byAuthor.has(item.authorName)) {
                byAuthor.set(item.authorName, new Set());
              }
              byAuthor.get(item.authorName).add(caseId);
            }
            
            // By gene
            if (item.gene) {
              if (!byGene.has(item.gene)) {
                byGene.set(item.gene, new Set());
              }
              byGene.get(item.gene).add(caseId);
            }

            cursor.continue();
          } else {
            resolve();
          }
        };

        req.onerror = () => reject(req.error);
      });
    });

    return {
      withTierChange,
      byAuthor,
      byGene,
      all,
    };
  } catch (e) {
    console.error("Failed to get cases with interpretations:", e);
    return {
      withTierChange: new Set(),
      byAuthor: new Map(),
      byGene: new Map(),
      all: new Set(),
    };
  }
}

  async getCasesInterpretationsCount(datasetId) {
  if (!window.indexedDB || !datasetId) return new Map();

  try {
    const countMap = new Map();

    // Use cursor to iterate through results in chunks to avoid transaction timeout
    await withStore(STORE_NAME, "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const index = store.index(INDEX_BY_DATASET);
        const req = index.openCursor(datasetId);

        req.onsuccess = (event) => {
          const cursor = event.target.result;
          if (cursor) {
            const item = cursor.value;
            const caseId = item.caseId;
            countMap.set(caseId, (countMap.get(caseId) || 0) + 1);
            cursor.continue();
          } else {
            resolve();
          }
        };

        req.onerror = () => reject(req.error);
      });
    });

    return countMap;
  } catch (e) {
    console.error("Failed to get cases interpretations count:", e);
    return new Map();
  }
}

  async getTierCountsByGeneVariantType(gene, variantType) {
    if (!window.indexedDB || !gene || !variantType) {
      return { 1: 0, 2: 0, 3: 0 };
    }

    try {
      const results = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const index = store.index(INDEX_BY_GENE_VARIANT);
          const req = index.getAll([gene, variantType]);

          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });

      const counts = { 1: 0, 2: 0, 3: 0 };
      results.forEach(item => {
        const tier = Number(item.data?.tier);
        if ([1, 2, 3].includes(tier)) {
          counts[tier]++;
        }
      });

      return counts;
    } catch (e) {
      console.error("Failed to get tier counts by gene and variant type:", e);
      return { 1: 0, 2: 0, 3: 0 };
    }
  }
}
