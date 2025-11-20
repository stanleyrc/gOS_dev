/**
 * User authentication validation utilities
 */

/**
 * Extract all unique author names from interpretations
 * @param {Object} interpretationsById - Redux state.Interpretations.byId
 * @returns {Array<string>} Array of unique author names
 */
export function getAllAuthorNames(interpretationsById) {
  const authorNames = new Set();
  
  Object.values(interpretationsById || {}).forEach(interpretation => {
    if (interpretation?.authorName) {
      authorNames.add(interpretation.authorName);
    }
  });
  
  return Array.from(authorNames);
}

/**
 * Normalize username for comparison (lowercase, trimmed)
 * @param {string} name - Username to normalize
 * @returns {string} Normalized username
 */
export function normalizeUsername(name) {
  return (name || '').trim().toLowerCase();
}

/**
 * Check if a username is available
 * @param {string} displayName - The username to check
 * @param {Array<string>} existingAuthorNames - Array of existing author names
 * @param {string} currentUserName - Current user's display name (can keep their own)
 * @returns {Object} { isAvailable: boolean, message: string }
 */
export function isUsernameAvailable(displayName, existingAuthorNames, currentUserName = null) {
  const trimmedName = (displayName || '').trim();
  
  // Check if empty
  if (!trimmedName) {
    return {
      isAvailable: false,
      message: 'Username cannot be empty'
    };
  }
  
  const normalizedInput = normalizeUsername(trimmedName);
  const normalizedCurrent = normalizeUsername(currentUserName);
  
  // Allow user to keep their own name
  if (normalizedInput === normalizedCurrent) {
    return {
      isAvailable: true,
      message: ''
    };
  }
  
  // Check against existing names (case-insensitive)
  const isDuplicate = existingAuthorNames.some(
    existingName => normalizeUsername(existingName) === normalizedInput
  );
  
  if (isDuplicate) {
    return {
      isAvailable: false,
      message: 'This username is already taken. Please choose a different name.'
    };
  }
  
  return {
    isAvailable: true,
    message: ''
  };
}
