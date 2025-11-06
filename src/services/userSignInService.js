import EventEmitter from 'eventemitter3';

/**
 * Singleton service for managing user sign-in flow
 * Allows triggering the sign-in modal from anywhere (including plain JS classes)
 */
class UserSignInService extends EventEmitter {
  constructor() {
    super();
    this.pendingRequest = null;
  }

  /**
   * Request user sign-in (creates user if doesn't exist)
   * @returns {Promise<Object>} Promise that resolves with user object { userId, displayName }
   */
  requestSignIn() {
    return new Promise((resolve, reject) => {
      this.pendingRequest = { resolve, reject };
      this.emit('signInRequested', { mode: 'create' });
    });
  }

  /**
   * Request user name update (for existing user)
   * @param {Object} currentUser - Current user object
   * @returns {Promise<Object>} Promise that resolves with updated user object
   */
  requestNameUpdate(currentUser) {
    return new Promise((resolve, reject) => {
      this.pendingRequest = { resolve, reject };
      this.emit('signInRequested', { mode: 'update', currentUser });
    });
  }

  /**
   * Resolve pending sign-in request with user
   * @param {Object} user - User object { userId, displayName }
   */
  resolveSignIn(user) {
    if (this.pendingRequest) {
      this.pendingRequest.resolve(user);
      this.pendingRequest = null;
    }
  }

  /**
   * Reject pending sign-in request
   * @param {Error} error - Error object
   */
  rejectSignIn(error) {
    if (this.pendingRequest) {
      this.pendingRequest.reject(error);
      this.pendingRequest = null;
    }
  }

  /**
   * Cancel pending sign-in request
   */
  cancelSignIn() {
    if (this.pendingRequest) {
      this.pendingRequest.reject(new Error('Sign-in cancelled'));
      this.pendingRequest = null;
    }
  }
}

// Export singleton instance
export const userSignInService = new UserSignInService();
