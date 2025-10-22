/**
 * Repository interface for EventInterpretation storage operations.
 * Provides an abstraction layer over storage backends (IndexedDB, remote API, etc.).
 */

export class EventInterpretationRepository {
  async save(interpretation) {
    throw new Error("save must be implemented");
  }

  async get(caseId, alterationId, authorId) {
    throw new Error("get must be implemented");
  }

  async getForCase(caseId) {
    throw new Error("getForCase must be implemented");
  }

  async delete(caseId, alterationId) {
    throw new Error("delete must be implemented");
  }

  async clearCase(caseId) {
    throw new Error("clearCase must be implemented");
  }

  async bulkSave(interpretations) {
    throw new Error("bulkSave must be implemented");
  }

  async saveGlobalNotes(caseId, notes) {
    throw new Error("saveGlobalNotes must be implemented");
  }

  async getGlobalNotes(caseId) {
    throw new Error("getGlobalNotes must be implemented");
  }
}
