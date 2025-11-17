/**
 * IndexedDB implementation of EventInterpretationRepository.
 * Handles browser-based persistent storage for event interpretations.
 */

import { EventInterpretationRepository } from "./EventInterpretationRepository";
import EventInterpretation from "../../helpers/EventInterpretation";

const DB_NAME = "gOS_Interpretations";
const STORE_NAME = "interpretations";
const DB_VERSION = 2;  // Increment version
const INDEX_BY_CASE = "by_case";
const INDEX_BY_COHORT = "by_cohort";          // NEW: Index for cohort queries
const INDEX_BY_COHORT_CASE = "by_cohort_case";  // NEW: Composite index

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      
      req.onupgradeneeded = (event) => {
      const db = req.result;

      if (!db.objectStoreNames.contains(STORE_NAME)) {
      const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
      store.createIndex(INDEX_BY_CASE, "caseId", { unique: false });
        store.createIndex(INDEX_BY_COHORT, "cohortId", { unique: false });  // NEW
          store.createIndex(INDEX_BY_COHORT_CASE, ["cohortId", "caseId"], { unique: false });  // NEW
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
    id: EventInterpretation.createId(json.cohortId, json.caseId, json.alterationId, json.authorId),
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

  async get(cohortId, caseId, alterationId, authorId) {
    if (!window.indexedDB) return null;

    const id = EventInterpretation.createId(cohortId, caseId, alterationId, authorId);

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

  async getForCase(cohortId, caseId) {
  if (!window.indexedDB) return [];
  if (!cohortId || !caseId) return [];

  try {
  const results = await withStore(STORE_NAME, "readonly", (store) => {
  return new Promise((resolve, reject) => {
  const index = store.index(INDEX_BY_COHORT_CASE);
  const req = index.getAll([cohortId, caseId]);

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

  async delete(cohortId, caseId, alterationId, authorId) {
    if (!window.indexedDB) return;

    const id = EventInterpretation.createId(cohortId, caseId, alterationId, authorId);

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

  async clearCase(cohortId, caseId) {
    if (!window.indexedDB || !cohortId || !caseId) return;

    try {
      const interpretations = await this.getForCase(cohortId, caseId);

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
          id: EventInterpretation.createId(json.cohortId, json.caseId, json.alterationId, json.authorId),
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

  async saveGlobalNotes(cohortId, caseId, notes) {
  if (!window.indexedDB || !cohortId || !caseId) return;

  const interpretation = new EventInterpretation({
  cohortId,
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

  async getGlobalNotes(cohortId, caseId) {
    if (!window.indexedDB || !cohortId || !caseId) return null;

    const interpretation = await this.get(cohortId, caseId, "GLOBAL_NOTES", null);
    return interpretation?.data?.notes ?? null;
  }

  async getCasesWithInterpretations(cohortId) {
    if (!window.indexedDB || !cohortId) return new Set();

    try {
      const results = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const index = store.index(INDEX_BY_COHORT);
          const req = index.getAll(cohortId);

          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });

      // Extract unique caseIds
      const caseIds = new Set(results.map(item => item.caseId));
      return caseIds;
    } catch (e) {
      console.error("Failed to get cases with interpretations:", e);
      return new Set();
    }
  }

  async getCasesInterpretationsCount(cohortId) {
    if (!window.indexedDB || !cohortId) return new Map();

    try {
      const results = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const index = store.index(INDEX_BY_COHORT);
          const req = index.getAll(cohortId);

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
