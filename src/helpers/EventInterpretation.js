import { getUser } from './userAuth.js';

class EventInterpretation {
  constructor({
    caseId,
    datasetId,
    alterationId,
    gene = null,
    variant = null,
    variant_type = null,
    authorId = null,
    authorName = null,
    lastModified = null,
    data = {},
    signature = null
  } = {}) {
    this.caseId = caseId;
    this.datasetId = datasetId;
    this.alterationId = alterationId;
    this.gene = gene;
    this.variant = variant;
    this.variant_type = variant_type;
    
    // Get current user info - caller should ensure user exists via ensureUser() first
    if (!authorId || !authorName) {
      const user = getUser();
      if (user) {
        this.authorId = authorId || user.userId;
        this.authorName = authorName || user.displayName;
      } else {
        // Fallback - should not happen if ensureUser() was called
        console.warn('EventInterpretation created without user - please call ensureUser() first');
        this.authorId = authorId || null;
        this.authorName = authorName || 'Anonymous';
      }
    } else {
      this.authorId = authorId;
      this.authorName = authorName;
    }
    
    this.lastModified = lastModified || new Date().toISOString();
    this.data = data;
    this.signature = signature || null;
    this.hasTierChange = 'tier' in this.data;
  }

  static createId(datasetId, caseId, alterationId, authorId) {
    return `${datasetId}::${caseId}::${alterationId}::${authorId}`;
  }

  hasOverrides() {
    return this.data && Object.keys(this.data).length > 0;
  }

  matchesOriginal(originalEvent) {
    if (!originalEvent || !this.data) return false;
    if (Object.keys(this.data).length === 0) return true;
    
    for (const [key, value] of Object.entries(this.data)) {
      const originalValue = originalEvent[key];
      
      if (originalValue === undefined) {
        const isEmpty = value === null || value === undefined || value === '';
        if (!isEmpty) {
          return false;
        }
      } else {
        if (String(originalValue) !== String(value)) {
          return false;
        }
      }
    }
    
    return true;
  }

  updateData(newData) {
    this.data = { ...this.data, ...newData };
    this.lastModified = new Date().toISOString();
    this.hasTierChange = 'tier' in this.data;
  }

  toJSON() {
    const result = {
      datasetId: this.datasetId,
      caseId: this.caseId,
      alterationId: this.alterationId,
      authorId: this.authorId,
      authorName: this.authorName,
      lastModified: this.lastModified,
      hasTierChange: this.hasTierChange
    };

    if (this.gene) {
      result.gene = this.gene;
    }

    if (this.variant) {
      result.variant = this.variant;
    }

    if (this.variant_type) {
      result.variant_type = this.variant_type;
    }

    if (Object.keys(this.data).length > 0) {
      result.data = this.data;
    }

    if (this.signature) {
      result.signature = this.signature;
    }

    return result;
  }

  serialize() {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

export default EventInterpretation;
