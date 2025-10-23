import { UserAuthRepository } from './UserAuthRepository';

const USER_KEY = 'gOS_user';

export class LocalStorageUserAuthRepository extends UserAuthRepository {
  getUser() {
    try {
      const userStr = localStorage.getItem(USER_KEY);
      return userStr ? JSON.parse(userStr) : null;
    } catch (e) {
      console.error('Error parsing user from localStorage:', e);
      return null;
    }
  }

  setUser(user) {
    try {
      localStorage.setItem(USER_KEY, JSON.stringify(user));
    } catch (e) {
      console.error('Error setting user to localStorage:', e);
      throw e;
    }
  }

  removeUser() {
    try {
      localStorage.removeItem(USER_KEY);
    } catch (e) {
      console.error('Error removing user from localStorage:', e);
      throw e;
    }
  }

  createUser(displayName) {
    try {
      const userId = crypto.randomUUID();
      const userObj = { userId, displayName };
      this.setUser(userObj);
      return userObj;
    } catch (e) {
      console.error('Error creating user:', e);
      throw e;
    }
  }
}
