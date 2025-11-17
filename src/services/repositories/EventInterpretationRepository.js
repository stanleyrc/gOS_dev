/**
 * Repository interface for EventInterpretation storage operations.
 * Provides an abstraction layer over storage backends (IndexedDB, remote API, etc.).
 */

export class EventInterpretationRepository {
  async save(interpretation) {
    throw new Error("save must be implemented");
  }

  async get(datasetId, caseId, alterationId, authorId) {
    throw new Error("get must be implemented");
  }

  async getForCase(datasetId, caseId) {
    throw new Error("getForCase must be implemented");
  }

  async delete(datasetId, caseId, alterationId, authorId) {
    throw new Error("delete must be implemented");
  }

  async clearCase(datasetId, caseId) {
    throw new Error("clearCase must be implemented");
  }

  async bulkSave(interpretations) {
    throw new Error("bulkSave must be implemented");
  }

  async saveGlobalNotes(datasetId, caseId, notes) {
    throw new Error("saveGlobalNotes must be implemented");
  }

  async getAll() {
    throw new Error("getAll must be implemented");
  }

  async getGlobalNotes(datasetId, caseId) {
    throw new Error("getGlobalNotes must be implemented");
  }

  async getCasesWithInterpretations(datasetId) {
    throw new Error("getCasesWithInterpretations must be implemented");
  }

  async getCasesInterpretationsCount(datasetId) {
    throw new Error("getCasesInterpretationsCount must be implemented");
  }
}
