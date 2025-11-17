/**
 * Repository interface for EventInterpretation storage operations.
 * Provides an abstraction layer over storage backends (IndexedDB, remote API, etc.).
 */

export class EventInterpretationRepository {
  async save(interpretation) {
    throw new Error("save must be implemented");
  }

  async get(cohortId, caseId, alterationId, authorId) {
    throw new Error("get must be implemented");
  }

  async getForCase(cohortId, caseId) {
    throw new Error("getForCase must be implemented");
  }

  async delete(cohortId, caseId, alterationId, authorId) {
    throw new Error("delete must be implemented");
  }

  async clearCase(cohortId, caseId) {
    throw new Error("clearCase must be implemented");
  }

  async bulkSave(interpretations) {
    throw new Error("bulkSave must be implemented");
  }

  async saveGlobalNotes(cohortId, caseId, notes) {
    throw new Error("saveGlobalNotes must be implemented");
  }

  async getAll() {
    throw new Error("getAll must be implemented");
  }

  async getGlobalNotes(cohortId, caseId) {
    throw new Error("getGlobalNotes must be implemented");
  }

  async getCasesWithInterpretations(cohortId) {
    throw new Error("getCasesWithInterpretations must be implemented");
  }

  async getCasesInterpretationsCount(cohortId) {
    throw new Error("getCasesInterpretationsCount must be implemented");
  }
}
