/**
 * Cryptographic service for keypair generation, signing, and verification
 * Uses Web Crypto API for client-side cryptographic operations
 */

const ALGORITHM = {
  name: 'RSASSA-PKCS1-v1_5',
  modulusLength: 2048,
  publicExponent: new Uint8Array([1, 0, 1]),
  hash: 'SHA-256',
};

/**
 * Generate a new RSA keypair
 * @returns {Promise<{publicKey: Object, privateKey: Object}>} JWK format keys
 */
export async function generateKeyPair() {
  const keyPair = await crypto.subtle.generateKey(
    ALGORITHM,
    true, // extractable
    ['sign', 'verify']
  );

  const publicKeyJWK = await crypto.subtle.exportKey('jwk', keyPair.publicKey);
  const privateKeyJWK = await crypto.subtle.exportKey('jwk', keyPair.privateKey);

  return {
    publicKey: publicKeyJWK,
    privateKey: privateKeyJWK,
  };
}

/**
 * Convert public key JWK to a string identifier for use as authorId
 * @param {Object} publicKeyJWK - Public key in JWK format
 * @returns {string} Base64 encoded public key identifier
 */
export function publicKeyToId(publicKeyJWK) {
  // Use the modulus (n) from the JWK as the identifier
  // This is unique to the key and shorter than full JWK
  return publicKeyJWK.n;
}

/**
 * Import a private key from JWK format
 * @param {Object} privateKeyJWK - Private key in JWK format
 * @returns {Promise<CryptoKey>}
 */
async function importPrivateKey(privateKeyJWK) {
  return await crypto.subtle.importKey(
    'jwk',
    privateKeyJWK,
    ALGORITHM,
    false,
    ['sign']
  );
}

/**
 * Import a public key from JWK format
 * @param {Object} publicKeyJWK - Public key in JWK format
 * @returns {Promise<CryptoKey>}
 */
async function importPublicKey(publicKeyJWK) {
  return await crypto.subtle.importKey(
    'jwk',
    publicKeyJWK,
    ALGORITHM,
    false,
    ['verify']
  );
}

/**
 * Sign data with a private key
 * @param {string} data - Data to sign (will be stringified if object)
 * @param {Object} privateKeyJWK - Private key in JWK format
 * @returns {Promise<string>} Base64 encoded signature
 */
export async function signData(data, privateKeyJWK) {
  const dataString = typeof data === 'string' ? data : JSON.stringify(data);
  const encoder = new TextEncoder();
  const dataBuffer = encoder.encode(dataString);

  const privateKey = await importPrivateKey(privateKeyJWK);
  const signature = await crypto.subtle.sign(
    ALGORITHM.name,
    privateKey,
    dataBuffer
  );

  // Convert to base64
  return arrayBufferToBase64(signature);
}

/**
 * Verify a signature against data and public key
 * @param {string} data - Original data that was signed
 * @param {string} signatureBase64 - Base64 encoded signature
 * @param {Object} publicKeyJWK - Public key in JWK format
 * @returns {Promise<boolean>} True if signature is valid
 */
export async function verifySignature(data, signatureBase64, publicKeyJWK) {
  try {
    const dataString = typeof data === 'string' ? data : JSON.stringify(data);
    const encoder = new TextEncoder();
    const dataBuffer = encoder.encode(dataString);

    const publicKey = await importPublicKey(publicKeyJWK);
    const signature = base64ToArrayBuffer(signatureBase64);

    return await crypto.subtle.verify(
      ALGORITHM.name,
      publicKey,
      signature,
      dataBuffer
    );
  } catch (error) {
    console.error('Signature verification failed:', error);
    return false;
  }
}

/**
 * Convert ArrayBuffer to base64 string
 * @param {ArrayBuffer} buffer
 * @returns {string}
 */
function arrayBufferToBase64(buffer) {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  for (let i = 0; i < bytes.byteLength; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Convert base64 string to ArrayBuffer
 * @param {string} base64
 * @returns {ArrayBuffer}
 */
function base64ToArrayBuffer(base64) {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}
