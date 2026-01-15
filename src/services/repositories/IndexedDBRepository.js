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

// Timeout for IndexedDB operations
const DB_OPEN_TIMEOUT = 10000; // 10 seconds (increased for slow first-time creation)
const DB_TRANSACTION_TIMEOUT = 10000; // 10 seconds for transactions
const RETRY_COOLDOWN = 30000; // 30 seconds before allowing retry after failure

// Connection state
let dbInstance = null;
let dbOpenPromise = null;
let lastFailureTime = 0; // Track when we last failed, for cooldown

/**
 * Check if IndexedDB is available in this browser
 */
function isIndexedDBAvailable() {
  try {
    return typeof window !== 'undefined' &&
           typeof window.indexedDB !== 'undefined' &&
           window.indexedDB !== null;
  } catch (e) {
    return false;
  }
}

/**
 * Check if the cached connection is still valid
 */
function isConnectionValid() {
  if (!dbInstance) return false;
  try {
    return dbInstance.objectStoreNames.contains(STORE_NAME);
  } catch (e) {
    dbInstance = null;
    return false;
  }
}

/**
 * Open database
 */
async function openDb() {
  // Check if IndexedDB is available
  if (!isIndexedDBAvailable()) {
    throw new Error("IndexedDB not supported");
  }

  // If connection already exists and is valid, reuse it
  if (isConnectionValid()) {
    return dbInstance;
  }

  // If opening is in progress, wait for it
  if (dbOpenPromise) {
    return dbOpenPromise;
  }

  // Check cooldown period after failure to prevent retry storms
  if (lastFailureTime > 0) {
    const timeSinceFailure = Date.now() - lastFailureTime;
    if (timeSinceFailure < RETRY_COOLDOWN) {
      const remainingSecs = Math.ceil((RETRY_COOLDOWN - timeSinceFailure) / 1000);
      throw new Error(`IndexedDB in cooldown - retry in ${remainingSecs}s`);
    }
    // Cooldown expired, allow retry
    console.log("IndexedDB cooldown expired, retrying...");
    lastFailureTime = 0;
  }

  // Start the opening process
  dbOpenPromise = new Promise((resolve, reject) => {
    let settled = false;

    const timeoutId = setTimeout(() => {
      if (!settled) {
        settled = true;
        dbOpenPromise = null;
        lastFailureTime = Date.now();
        console.error(`IndexedDB open timeout after ${DB_OPEN_TIMEOUT/1000}s - entering cooldown`);
        reject(new Error("IndexedDB open timeout"));
      }
    }, DB_OPEN_TIMEOUT);

    try {
      console.log(`Opening IndexedDB "${DB_NAME}" v${DB_VERSION}...`);
      const req = indexedDB.open(DB_NAME, DB_VERSION);

      req.onblocked = () => {
        console.warn("IndexedDB blocked - close other tabs/connections using this database");
      };

      req.onupgradeneeded = (event) => {
        console.log("IndexedDB upgrade/create needed - creating schema");
        try {
          const db = req.result;

          if (!db.objectStoreNames.contains(STORE_NAME)) {
            const store = db.createObjectStore(STORE_NAME, { keyPath: "id" });
            store.createIndex(INDEX_BY_CASE, "caseId", { unique: false });
            store.createIndex(INDEX_BY_DATASET, "datasetId", { unique: false });
            store.createIndex(INDEX_BY_DATASET_CASE, ["datasetId", "caseId"], { unique: false });
            store.createIndex(INDEX_BY_GENE_VARIANT, ["gene", "variant_type"], { unique: false });
            console.log("IndexedDB schema created successfully");
          } else {
            const tx = event.target.transaction;
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
            console.log("IndexedDB schema upgraded successfully");
          }
        } catch (upgradeError) {
          console.error("IndexedDB upgrade error:", upgradeError);
        }
      };

      req.onsuccess = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          lastFailureTime = 0; // Clear any previous failure
          console.log("IndexedDB opened successfully");
          dbInstance = req.result;
          dbInstance.onclose = () => {
            console.log("IndexedDB connection closed");
            dbInstance = null;
          };
          dbOpenPromise = null;
          resolve(dbInstance);
        }
      };

      req.onerror = () => {
        if (!settled) {
          settled = true;
          clearTimeout(timeoutId);
          dbOpenPromise = null;
          lastFailureTime = Date.now();
          console.error("IndexedDB open error:", req.error);
          reject(req.error || new Error("IndexedDB open failed"));
        }
      };
    } catch (e) {
      if (!settled) {
        settled = true;
        clearTimeout(timeoutId);
        dbOpenPromise = null;
        lastFailureTime = Date.now();
        console.error("IndexedDB open exception:", e);
        reject(e);
      }
    }
  });

  return dbOpenPromise;
}

async function withStore(storeName, mode, fn) {
  const db = await openDb();
  const tx = db.transaction(storeName, mode);
  const store = tx.objectStore(storeName);

  // For readonly operations, just execute and return
  const result = await fn(store, tx);

  // Only wait for transaction completion on write operations
  if (mode === "readwrite") {
    await new Promise((resolve, reject) => {
      const timeoutId = setTimeout(() => {
        reject(new Error("IndexedDB transaction timeout"));
      }, DB_TRANSACTION_TIMEOUT);

      tx.oncomplete = () => {
        clearTimeout(timeoutId);
        resolve();
      };
      tx.onabort = () => {
        clearTimeout(timeoutId);
        reject(tx.error || new Error("Transaction aborted"));
      };
      tx.onerror = () => {
        clearTimeout(timeoutId);
        reject(tx.error || new Error("Transaction failed"));
      };
    });
  }

  return result;
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
    // Use getAll instead of cursor for better reliability
    const results = await withStore(STORE_NAME, "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const index = store.index(INDEX_BY_DATASET);
        const req = index.getAll(datasetId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    });

    // Process results in memory
    const withTierChange = new Set();
    const byAuthor = new Map();
    const byGene = new Map();
    const all = new Set();

    for (const item of results) {
      const caseId = item.caseId;
      all.add(caseId);

      if (item.hasTierChange) {
        withTierChange.add(caseId);
      }

      if (item.authorName) {
        if (!byAuthor.has(item.authorName)) {
          byAuthor.set(item.authorName, new Set());
        }
        byAuthor.get(item.authorName).add(caseId);
      }

      if (item.gene) {
        if (!byGene.has(item.gene)) {
          byGene.set(item.gene, new Set());
        }
        byGene.get(item.gene).add(caseId);
      }
    }

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
    // Use getAll instead of cursor for better reliability
    const results = await withStore(STORE_NAME, "readonly", (store) => {
      return new Promise((resolve, reject) => {
        const index = store.index(INDEX_BY_DATASET);
        const req = index.getAll(datasetId);
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
    });

    // Process results in memory
    const countMap = new Map();
    for (const item of results) {
      const caseId = item.caseId;
      countMap.set(caseId, (countMap.get(caseId) || 0) + 1);
    }

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

  async getGeneVariantsWithTierChanges() {
    if (!window.indexedDB) {
      return new Set();
    }

    try {
      const results = await withStore(STORE_NAME, "readonly", (store) => {
        return new Promise((resolve, reject) => {
          const req = store.getAll();
          req.onsuccess = () => resolve(req.result || []);
          req.onerror = () => reject(req.error);
        });
      });

      const geneVariants = new Set();
      for (const item of results) {
        // Only include items with tier changes AND valid gene/variant_type
        if (item.hasTierChange && item.gene && item.variant_type) {
          geneVariants.add(`${item.gene}-${item.variant_type}`);
        }
      }

      return geneVariants;
    } catch (e) {
      console.error("Failed to get gene variants with tier changes:", e);
      return new Set();
    }
  }
}
