import { getUser, createUser } from './userAuth.js';

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
    this.authorId = authorId || this.getOrCreateAuthorId();
    this.authorName = authorName || this.getOrCreateAuthorName();
    this.lastModified = lastModified || new Date().toISOString();
    this.data = data;
  }

  getOrCreateAuthorId() {
    const userObj = this.getOrCreateUser();
    return userObj.userId;
  }

  getOrCreateAuthorName() {
    const userObj = this.getOrCreateUser();
    return userObj.displayName;
  }

  getOrCreateUser() {
    let user = getUser();

    if (!user) {
      const displayName = this.promptForDisplayName();
      user = createUser(displayName);
    }

    return user;
  }

  promptForDisplayName() {
    const displayName = prompt('Please enter your display name:');
    return displayName && displayName.trim() ? displayName.trim() : 'Anonymous';
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
