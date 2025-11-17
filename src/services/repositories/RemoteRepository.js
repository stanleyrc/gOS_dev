/**
 * Remote API implementation of EventInterpretationRepository.
 * Dummy implementation for future backend integration.
 */

import { EventInterpretationRepository } from "./EventInterpretationRepository";
import EventInterpretation from "../../helpers/EventInterpretation";

export class RemoteRepository extends EventInterpretationRepository {
  constructor(config = {}) {
    super();
    this.baseUrl = config.baseUrl || "/api/v1";
    this.authToken = config.authToken || null;
  }

  _headers() {
    const headers = {
      "Content-Type": "application/json",
    };
    if (this.authToken) {
      headers.Authorization = `Bearer ${this.authToken}`;
    }
    return headers;
  }

  async _fetch(endpoint, options = {}) {
    throw new Error("RemoteRepository not yet implemented - backend API pending");
  }

  async save(interpretation) {
    const json = interpretation.toJSON ? interpretation.toJSON() : interpretation;
    
    const response = await this._fetch(
      `/datasets/${json.datasetId}/cases/${json.caseId}/interpretations/${json.alterationId}/${json.authorId}`,
      {
        method: "PUT",
        body: JSON.stringify(json),
      }
    );
    
    return new EventInterpretation(response);
  }

  async get(datasetId, caseId, alterationId, authorId) {
    const response = await this._fetch(
      `/datasets/${datasetId}/cases/${caseId}/interpretations/${alterationId}/${authorId}`
    );
    return response ? new EventInterpretation(response) : null;
  }

  async getForCase(datasetId, caseId) {
    const response = await this._fetch(`/datasets/${datasetId}/cases/${caseId}/interpretations`);
    return (response?.interpretations || []).map((data) =>
      new EventInterpretation(data)
    );
  }

  async delete(datasetId, caseId, alterationId, authorId) {
    return this._fetch(`/datasets/${datasetId}/cases/${caseId}/interpretations/${alterationId}/${authorId}`, {
      method: "DELETE",
    });
  }

  async clearCase(datasetId, caseId) {
    return this._fetch(`/datasets/${datasetId}/cases/${caseId}/interpretations`, {
      method: "DELETE",
    });
  }

  async bulkSave(interpretations) {
    const normalized = interpretations.map((interp) =>
      interp.toJSON ? interp.toJSON() : interp
    );
    
    const response = await this._fetch("/interpretations/bulk", {
      method: "POST",
      body: JSON.stringify({ interpretations: normalized }),
    });
    
    return (response?.interpretations || []).map((data) =>
      new EventInterpretation(data)
    );
  }

  async saveGlobalNotes(datasetId, caseId, notes) {
    return this._fetch(`/datasets/${datasetId}/cases/${caseId}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    });
  }

  async getGlobalNotes(datasetId, caseId) {
    const response = await this._fetch(`/datasets/${datasetId}/cases/${caseId}/notes`);
    return response?.notes ?? null;
  }

  async getCasesWithInterpretations(datasetId) {
    const response = await this._fetch(`/datasets/${datasetId}/cases`);
    return new Set(response?.caseIds || []);
  }

  async getCasesInterpretationsCount(datasetId) {
    const response = await this._fetch(`/datasets/${datasetId}/cases/counts`);
    return new Map(Object.entries(response?.counts || {}));
  }
}
