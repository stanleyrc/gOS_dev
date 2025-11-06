/**
 * Service for signing and verifying interpretation data
 * Abstraction layer that uses cryptoService internally
 * Can be swapped to server-side signing/verification in the future
 */

import { signData, verifySignature, publicKeyToId } from '../crypto/cryptoService';
import { getUser } from '../../helpers/userAuth';

/**
 * Create a canonical JSON string for signing
 * Ensures consistent field ordering for signature verification
 * @param {Object} interpretationJSON - Interpretation data
 * @returns {string} Canonical JSON string
 */
function createCanonicalData(interpretationJSON) {
  const canonical = {
    caseId: interpretationJSON.caseId,
    alterationId: interpretationJSON.alterationId,
    authorId: interpretationJSON.authorId,
    lastModified: interpretationJSON.lastModified,
    data: interpretationJSON.data || {},
  };
  return JSON.stringify(canonical);
}

/**
 * Sign an interpretation with the user's private key
 * @param {Object} interpretationJSON - Interpretation data (without signature)
 * @param {Object} user - User object with privateKey
 * @returns {Promise<string>} Base64 encoded signature
 */
export async function signInterpretation(interpretationJSON, user) {
  if (!user || !user.privateKey) {
    throw new Error('User must have a private key to sign interpretations');
  }

  const canonicalData = createCanonicalData(interpretationJSON);
  return await signData(canonicalData, user.privateKey);
}

/**
 * Verify an interpretation signature
 * @param {Object} interpretationJSON - Interpretation data (without signature field)
 * @param {string} signature - Base64 encoded signature
 * @param {Object} publicKey - Public key JWK of the author
 * @returns {Promise<boolean>} True if signature is valid
 */
export async function verifyInterpretation(interpretationJSON, signature, publicKey) {
  if (!signature || !publicKey) {
    return false;
  }

  try {
    const canonicalData = createCanonicalData(interpretationJSON);
    return await verifySignature(canonicalData, signature, publicKey);
  } catch (error) {
    console.error('Error verifying interpretation signature:', error);
    return false;
  }
}

/**
 * Verify an interpretation signature using current user's public key
 * Convenience method for client-side verification of own interpretations
 * @param {Object} interpretationJSON - Interpretation data (without signature field)
 * @param {string} signature - Base64 encoded signature
 * @returns {Promise<boolean>} True if signature is valid for current user
 */
export async function verifyOwnInterpretation(interpretationJSON, signature) {
  const user = getUser();
  if (!user || !user.publicKey) {
    console.warn('Cannot verify: user has no public key');
    return false;
  }

  const expectedAuthorId = publicKeyToId(user.publicKey);
  if (interpretationJSON.authorId !== expectedAuthorId) {
    console.warn('Cannot verify: interpretation author does not match current user');
    return false;
  }

  return verifyInterpretation(interpretationJSON, signature, user.publicKey);
}
