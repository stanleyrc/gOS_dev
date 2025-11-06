/**
 * Factory for creating and managing EventInterpretationRepository instances.
 * Provides a central registry for switching between storage backends.
 */

import { IndexedDBRepository } from "./IndexedDBRepository";
import { RemoteRepository } from "./RemoteRepository";
import { DynamoDBRepository } from "./DynamoDBRepository";

export const REPOSITORY_TYPES = {
  INDEXED_DB: "indexeddb",
  REMOTE: "remote",
  DYNAMODB: "dynamodb",
};

class RepositoryFactory {
  constructor() {
    this._instances = new Map();
    this._activeType = REPOSITORY_TYPES.INDEXED_DB;
  }

  setActiveType(type) {
    if (!Object.values(REPOSITORY_TYPES).includes(type)) {
      throw new Error(`Invalid repository type: ${type}`);
    }
    this._activeType = type;
  }

  getActiveType() {
    return this._activeType;
  }

  _mapAuditLoggingRepoToType(auditLoggingRepo) {
    if (!auditLoggingRepo) return null;
    
    const repoString = String(auditLoggingRepo).toLowerCase();
    switch (repoString) {
      case 'dynamodb':
        return REPOSITORY_TYPES.DYNAMODB;
      case 'indexeddb':
        return REPOSITORY_TYPES.INDEXED_DB;
      case 'remote':
        return REPOSITORY_TYPES.REMOTE;
      default:
        console.warn(`Unknown auditLoggingRepo value: ${auditLoggingRepo}, defaulting to IndexedDB`);
        return REPOSITORY_TYPES.INDEXED_DB;
    }
  }

  create(type = null, config = {}) {
    const repoType = type || this._activeType;

    switch (repoType) {
      case REPOSITORY_TYPES.INDEXED_DB:
        return new IndexedDBRepository();

      case REPOSITORY_TYPES.REMOTE:
        return new RemoteRepository(config);

      case REPOSITORY_TYPES.DYNAMODB:
        return new DynamoDBRepository(config);

      default:
        throw new Error(`Unknown repository type: ${repoType}`);
    }
  }

  getInstance(type = null, config = {}) {
    const repoType = type || this._activeType;
    const cacheKey = `${repoType}::${JSON.stringify(config)}`;

    if (!this._instances.has(cacheKey)) {
      this._instances.set(cacheKey, this.create(repoType, config));
    }

    return this._instances.get(cacheKey);
  }

  getActiveRepository(config = {}) {
    const dataset = config.dataset || config;
    const auditLoggingRepo = dataset?.auditLoggingRepo;
    
    if (auditLoggingRepo) {
      const repoType = this._mapAuditLoggingRepoToType(auditLoggingRepo);
      return this.getInstance(repoType, config);
    }
    
    return this.getInstance(this._activeType, config);
  }

  clearInstances() {
    this._instances.clear();
  }
}

export const repositoryFactory = new RepositoryFactory();

export function getRepository(type = null, config = {}) {
  return repositoryFactory.getInstance(type, config);
}

export function getActiveRepository(config = {}) {
  return repositoryFactory.getActiveRepository(config);
}
