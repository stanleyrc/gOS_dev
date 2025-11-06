import { getUser } from './userAuth.js';

class EventInterpretation {
  constructor({
    caseId,
    alterationId,
    gene = null,
    variant = null,
    authorId = null,
    authorName = null,
    lastModified = null,
    data = {}
  } = {}) {
    this.caseId = caseId;
    this.alterationId = alterationId;
    this.gene = gene;
    this.variant = variant;
    
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
  }

  static createId(caseId, alterationId, authorId) {
    return `${caseId}::${alterationId}::${authorId}`;
  }

  hasOverrides() {
    return this.data && Object.keys(this.data).length > 0;
  }

  updateData(newData) {
    this.data = { ...this.data, ...newData };
    this.lastModified = new Date().toISOString();
  }

  toJSON() {
    const result = {
      caseId: this.caseId,
      alterationId: this.alterationId,
      authorId: this.authorId,
      authorName: this.authorName,
      lastModified: this.lastModified
    };

    if (this.gene) {
      result.gene = this.gene;
    }

    if (this.variant) {
      result.variant = this.variant;
    }

    if (Object.keys(this.data).length > 0) {
      result.data = this.data;
    }

    return result;
  }

  serialize() {
    return JSON.stringify(this.toJSON(), null, 2);
  }
}

export default EventInterpretation;
