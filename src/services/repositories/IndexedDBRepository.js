/**
 * IndexedDB implementation of EventInterpretationRepository.
 * Handles browser-based persistent storage for event interpretations.
 */

import { EventInterpretationRepository } from "./EventInterpretationRepository";
import EventInterpretation from "../../helpers/EventInterpretation";

const DB_NAME = "gOS_Interpretations";
const STORE_NAME = "interpretations";
const DB_VERSION = 3;  // Increment version
const INDEX_BY_CASE = "by_case";
const INDEX_BY_DATASET = "by_dataset";          // NEW: Index for dataset queries
const INDEX_BY_DATASET_CASE = "by_dataset_case";  // NEW: Composite index

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      
      req.onupgradeneeded = (event) => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex(INDEX_BY_CASE, "caseId", { unique: false });
      store.createIndex(INDEX_BY_DATASET, "datasetId", { unique: false });  // NEW
      store.createIndex(INDEX_BY_DATASET_CASE, ["datasetId", "caseId"], { unique: false });  // NEW
        }
      };
      
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error || new Error("IndexedDB open failed"));
    } catch (e) {
      reject(e);
    }
  });
}

async function withStore(storeName, mode, fn) {
  let db;
  try {
    db = await openDb();
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const result = await fn(store, tx);
    
    await new Promise((resolve, reject) => {
      tx.oncomplete = () => resolve();
      tx.onabort = () => reject(tx.error || new Error("Transaction aborted"));
      tx.onerror = () => reject(tx.error || new Error("Transaction failed"));
    });
    
    return result;
  } catch (e) {
    throw e;
  } finally {
    if (db) {
      try {
        db.close();
      } catch (_) {}
    }
  }
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
  const results = await withStore(STORE_NAME, "readonly", (store) => {
  return new Promise((resolve, reject) => {
  const index = store.index(INDEX_BY_DATASET);
  const req = index.getAll(datasetId);

          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });

      // Categorize cases by tier change, author, and gene
      const withTierChange = new Set();
      const byAuthor = new Map();
      const byGene = new Map();
      const all = new Set();

      results.forEach(item => {
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
  const results = await withStore(STORE_NAME, "readonly", (store) => {
  return new Promise((resolve, reject) => {
  const index = store.index(INDEX_BY_DATASET);
  const req = index.getAll(datasetId);

          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });

      // Count interpretations per case
      const countMap = new Map();
      results.forEach(item => {
        const caseId = item.caseId;
        countMap.set(caseId, (countMap.get(caseId) || 0) + 1);
      });

      return countMap;
    } catch (e) {
      console.error("Failed to get cases interpretations count:", e);
      return new Map();
    }
  }
}
