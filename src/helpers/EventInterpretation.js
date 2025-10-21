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
    let authorId = localStorage.getItem('gOS_authorId');
    if (!authorId) {
      authorId = `user-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      localStorage.setItem('gOS_authorId', authorId);
    }
    return authorId;
  }

  getOrCreateAuthorName() {
    let authorName = localStorage.getItem('gOS_authorName');
    if (!authorName) {
      authorName = 'Anonymous';
      localStorage.setItem('gOS_authorName', authorName);
    }
    return authorName;
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
