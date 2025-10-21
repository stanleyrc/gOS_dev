/**
 * Remote API implementation of EventInterpretationRepository.
 * Dummy implementation for future backend integration.
 */

import { EventInterpretationRepository } from "./EventInterpretationRepository";
import { EventInterpretation } from "./EventInterpretation";

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
    if (!(interpretation instanceof EventInterpretation)) {
      interpretation = new EventInterpretation(interpretation);
    }
    
    const response = await this._fetch(
      `/cases/${interpretation.caseId}/interpretations/${interpretation.alterationId}`,
      {
        method: "PUT",
        body: JSON.stringify(interpretation.toJSON()),
      }
    );
    
    return EventInterpretation.fromJSON(response);
  }

  async get(caseId, alterationId) {
    const response = await this._fetch(
      `/cases/${caseId}/interpretations/${alterationId}`
    );
    return response ? EventInterpretation.fromJSON(response) : null;
  }

  async getForCase(caseId) {
    const response = await this._fetch(`/cases/${caseId}/interpretations`);
    return (response?.interpretations || []).map((data) =>
      EventInterpretation.fromJSON(data)
    );
  }

  async delete(caseId, alterationId) {
    return this._fetch(`/cases/${caseId}/interpretations/${alterationId}`, {
      method: "DELETE",
    });
  }

  async clearCase(caseId) {
    return this._fetch(`/cases/${caseId}/interpretations`, {
      method: "DELETE",
    });
  }

  async bulkSave(interpretations) {
    const normalized = interpretations.map((interp) =>
      interp instanceof EventInterpretation
        ? interp.toJSON()
        : new EventInterpretation(interp).toJSON()
    );
    
    const response = await this._fetch("/interpretations/bulk", {
      method: "POST",
      body: JSON.stringify({ interpretations: normalized }),
    });
    
    return (response?.interpretations || []).map((data) =>
      EventInterpretation.fromJSON(data)
    );
  }

  async saveGlobalNotes(caseId, notes) {
    return this._fetch(`/cases/${caseId}/notes`, {
      method: "PUT",
      body: JSON.stringify({ notes }),
    });
  }

  async getGlobalNotes(caseId) {
    const response = await this._fetch(`/cases/${caseId}/notes`);
    return response?.notes ?? null;
  }
}
