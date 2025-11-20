/**
 * Repository interface for User authentication storage operations.
 * Provides an abstraction layer over auth backends (localStorage, remote API, etc.).
 */

export class UserAuthRepository {
  getUser() {
    throw new Error("getUser must be implemented");
  }

  setUser(user) {
    throw new Error("setUser must be implemented");
  }

  removeUser() {
    throw new Error("removeUser must be implemented");
  }

  createUser(displayName) {
    throw new Error("createUser must be implemented");
  }
}
