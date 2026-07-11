/**
 * Credentials encryption for the content module (server-side only).
 *
 * Encrypts third-party credentials (WordPress Application Passwords) with
 * AES-256-GCM before they are stored in the database, using a master key from
 * the CONTENT_CREDENTIALS_ENCRYPTION_KEY env var.
 *
 * Storage format: iv:tag:ciphertext (hex-encoded, colon-separated).
 *
 * Security rules:
 *   - Never log the key, the plaintext, or the ciphertext.
 *   - If the env key is missing/invalid, throw a clear error — callers must
 *     refuse to save the credential rather than store it unencrypted.
 *   - Decrypt only on the server, only at the moment of use.
 */

import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard nonce size
const KEY_ENV = 'CONTENT_CREDENTIALS_ENCRYPTION_KEY'

export class CredentialsCryptoError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'CredentialsCryptoError'
  }
}

/**
 * Resolve the 32-byte master key from the env var.
 * Accepts 64 hex chars or 44-char base64 (both decode to 32 bytes).
 * Throws CredentialsCryptoError with a clear message when missing/invalid —
 * never logs the key value itself.
 */
function getMasterKey(): Buffer {
  const raw = process.env[KEY_ENV]
  if (!raw || !raw.trim()) {
    throw new CredentialsCryptoError(
      `${KEY_ENV} is not set. Generate one with: openssl rand -hex 32`
    )
  }
  const value = raw.trim()

  if (/^[0-9a-fA-F]{64}$/.test(value)) {
    return Buffer.from(value, 'hex')
  }
  // Fallback: try base64 (must decode to exactly 32 bytes).
  try {
    const buf = Buffer.from(value, 'base64')
    if (buf.length === 32) return buf
  } catch {
    // fall through to the error below
  }
  throw new CredentialsCryptoError(
    `${KEY_ENV} must be 32 bytes: 64 hex chars (openssl rand -hex 32) or base64 of 32 bytes.`
  )
}

/** True when the encryption key env var is configured and valid. */
export function isCredentialsCryptoConfigured(): boolean {
  try {
    getMasterKey()
    return true
  } catch {
    return false
  }
}

/**
 * Encrypt a credential. Returns "iv:tag:ciphertext" (hex).
 * Throws CredentialsCryptoError when the master key is missing/invalid.
 */
export function encryptCredential(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new CredentialsCryptoError('Cannot encrypt an empty credential.')
  }
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

/**
 * Decrypt an "iv:tag:ciphertext" (hex) value produced by encryptCredential.
 * Throws CredentialsCryptoError on a malformed value, wrong key, or tampering
 * (GCM auth tag mismatch). Server-side only.
 */
export function decryptCredential(stored: string): string {
  if (typeof stored !== 'string' || !stored.includes(':')) {
    throw new CredentialsCryptoError('Stored credential has an invalid format.')
  }
  const parts = stored.split(':')
  if (parts.length !== 3) {
    throw new CredentialsCryptoError('Stored credential has an invalid format.')
  }
  const [ivHex, tagHex, dataHex] = parts
  if (!/^[0-9a-fA-F]+$/.test(ivHex + tagHex + dataHex)) {
    throw new CredentialsCryptoError('Stored credential has an invalid format.')
  }

  const key = getMasterKey()
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const plaintext = Buffer.concat([
      decipher.update(Buffer.from(dataHex, 'hex')),
      decipher.final(),
    ])
    return plaintext.toString('utf8')
  } catch {
    // Deliberately generic — never include key/ciphertext material in errors.
    throw new CredentialsCryptoError(
      'Failed to decrypt credential (wrong key or corrupted value).'
    )
  }
}
