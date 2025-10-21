/**
 * IndexedDB implementation of EventInterpretationRepository.
 * Handles browser-based persistent storage for event interpretations.
 */

import { EventInterpretationRepository } from "./EventInterpretationRepository";
import { EventInterpretation } from "./EventInterpretation";

const DB_NAME = "gOS_Interpretations";
const STORE_NAME = "interpretations";
const GLOBAL_NOTES_STORE = "globalNotes";
const DB_VERSION = 1;
const INDEX_BY_CASE = "by_case";

function openDb() {
  return new Promise((resolve, reject) => {
    try {
      const req = indexedDB.open(DB_NAME, DB_VERSION);
      
      req.onupgradeneeded = (event) => {
        const db = req.result;
        
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
          store.createIndex(INDEX_BY_CASE, "caseId", { unique: false });
        }
        
        if (!db.objectStoreNames.contains(GLOBAL_NOTES_STORE)) {
          db.createObjectStore(GLOBAL_NOTES_STORE, { keyPath: "caseId" });
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
    
    const data = {
      id: interpretation.id,
      caseId: interpretation.caseId,
      alterationId: interpretation.alterationId,
      tier: interpretation.tier,
      gene_summary: interpretation.gene_summary,
      variant_summary: interpretation.variant_summary,
      effect_description: interpretation.effect_description,
      notes: interpretation.notes,
      therapeutics: interpretation.therapeutics,
      resistances: interpretation.resistances,
      metadata: interpretation.metadata,
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

  async get(caseId, alterationId) {
    if (!window.indexedDB) return null;
    
    const id = EventInterpretation.createId(caseId, alterationId);
    
    try {
      const data = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const req = store.get(id);
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      });
      
      return data ? EventInterpretation.fromJSON(data) : null;
    } catch (e) {
      console.error("Failed to get interpretation:", e);
      return null;
    }
  }

  async getForCase(caseId) {
    if (!window.indexedDB) return [];
    if (!caseId) return [];
    
    try {
      const results = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const index = store.index(INDEX_BY_CASE);
          const req = index.getAll(caseId);
          
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });
      
      return results.map((data) => EventInterpretation.fromJSON(data));
    } catch (e) {
      console.error("Failed to get interpretations for case:", e);
      return [];
    }
  }

  async delete(caseId, alterationId) {
    if (!window.indexedDB) return;
    
    const id = EventInterpretation.createId(caseId, alterationId);
    
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

  async clearCase(caseId) {
    if (!window.indexedDB || !caseId) return;
    
    try {
      const interpretations = await this.getForCase(caseId);
      
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
      
      await withStore(GLOBAL_NOTES_STORE, "readwrite", (store) => {
        return new Promise((resolve) => {
          const req = store.delete(caseId);
          req.onsuccess = () => resolve();
          req.onerror = () => resolve();
        });
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
          const data = {
            id: interp.id,
            caseId: interp.caseId,
            alterationId: interp.alterationId,
            tier: interp.tier,
            gene_summary: interp.gene_summary,
            variant_summary: interp.variant_summary,
            effect_description: interp.effect_description,
            notes: interp.notes,
            therapeutics: interp.therapeutics,
            resistances: interp.resistances,
            metadata: interp.metadata,
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

  async saveGlobalNotes(caseId, notes) {
    if (!window.indexedDB || !caseId) return;
    
    try {
      await withStore(GLOBAL_NOTES_STORE, "readwrite", (store) => {
        return new Promise((resolve, reject) => {
          const req = store.put({
            caseId: String(caseId),
            notes: String(notes || ""),
            updatedAt: Date.now(),
          });
          req.onsuccess = () => resolve();
          req.onerror = () => reject(req.error);
        });
      });
    } catch (e) {
      console.error("Failed to save global notes:", e);
      throw e;
    }
  }

  async getGlobalNotes(caseId) {
    if (!window.indexedDB || !caseId) return null;
    
    try {
      const result = await withStore(GLOBAL_NOTES_STORE, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const req = store.get(String(caseId));
          req.onsuccess = () => resolve(req.result);
          req.onerror = () => reject(req.error);
        });
      });
      
      return result?.notes ?? null;
    } catch (e) {
      console.error("Failed to get global notes:", e);
      return null;
    }
  }
}
