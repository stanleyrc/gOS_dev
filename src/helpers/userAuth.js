import { LocalStorageUserAuthRepository } from '../services/repositories/LocalStorageUserAuthRepository';

export const userAuthRepository = new LocalStorageUserAuthRepository();

export function getUser() {
  return userAuthRepository.getUser();
}

export function setUser(user) {
  return userAuthRepository.setUser(user);
}

export function removeUser() {
  return userAuthRepository.removeUser();
}

export function createUser(displayName) {
  return userAuthRepository.createUser(displayName);
}

export function getCurrentUserId() {
  const user = userAuthRepository.getUser();
  return user ? user.userId : null;
}

export function getCurrentUser() {
  return userAuthRepository.getUser();
}
