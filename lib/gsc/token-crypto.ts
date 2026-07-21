/**
 * Stage E1 — GSC OAuth refresh-token encryption (server-side ONLY).
 *
 * Mirrors lib/security/credentials-crypto.ts (AES-256-GCM, random IV, auth tag)
 * but uses a DEDICATED key env var (GSC_TOKEN_ENCRYPTION_KEY) so GSC token secrets
 * are isolated from content credentials, and a VERSIONED ciphertext envelope.
 *
 * Envelope: "v1:iv:tag:ciphertext" (all hex, colon-separated). The leading version
 * tag lets the format evolve without ambiguity.
 *
 * Security rules:
 *   - Never log the key, plaintext, or ciphertext.
 *   - Missing/invalid key → throw; callers refuse to store rather than store plaintext.
 *   - Decrypt only on the server, only at the moment of use.
 *   - Never exposed to client bundles.
 */
import crypto from 'crypto'

const ALGORITHM = 'aes-256-gcm'
const IV_LENGTH = 12 // GCM standard nonce size
const KEY_ENV = 'GSC_TOKEN_ENCRYPTION_KEY'
export const GSC_ENCRYPTION_VERSION = 1
const ENVELOPE_PREFIX = 'v1'

export class GscTokenCryptoError extends Error {
  constructor(message: string) { super(message); this.name = 'GscTokenCryptoError' }
}

/** Resolve the 32-byte key: 64 hex chars or base64 of 32 bytes. Never logs the value. */
function getMasterKey(): Buffer {
  const raw = process.env[KEY_ENV]
  if (!raw || !raw.trim()) {
    throw new GscTokenCryptoError(`${KEY_ENV} is not set. Generate one with: openssl rand -hex 32`)
  }
  const value = raw.trim()
  if (/^[0-9a-fA-F]{64}$/.test(value)) return Buffer.from(value, 'hex')
  try {
    const buf = Buffer.from(value, 'base64')
    if (buf.length === 32) return buf
  } catch { /* fall through */ }
  throw new GscTokenCryptoError(`${KEY_ENV} must be 32 bytes: 64 hex chars (openssl rand -hex 32) or base64 of 32 bytes.`)
}

/** True when the encryption key env var is configured and valid. */
export function isGscTokenCryptoConfigured(): boolean {
  try { getMasterKey(); return true } catch { return false }
}

/** Encrypt a refresh token → "v1:iv:tag:ciphertext" (hex). Random IV per call. */
export function encryptGscToken(plaintext: string): string {
  if (typeof plaintext !== 'string' || plaintext.length === 0) {
    throw new GscTokenCryptoError('Cannot encrypt an empty token.')
  }
  const key = getMasterKey()
  const iv = crypto.randomBytes(IV_LENGTH)
  const cipher = crypto.createCipheriv(ALGORITHM, key, iv)
  const ciphertext = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()])
  const tag = cipher.getAuthTag()
  return `${ENVELOPE_PREFIX}:${iv.toString('hex')}:${tag.toString('hex')}:${ciphertext.toString('hex')}`
}

/** Decrypt a "v1:iv:tag:ciphertext" value. Throws on malformed/wrong-key/tamper. */
export function decryptGscToken(stored: string): string {
  if (typeof stored !== 'string' || !stored.includes(':')) {
    throw new GscTokenCryptoError('Stored token has an invalid format.')
  }
  const parts = stored.split(':')
  if (parts.length !== 4 || parts[0] !== ENVELOPE_PREFIX) {
    throw new GscTokenCryptoError('Stored token has an invalid or unsupported envelope.')
  }
  const [, ivHex, tagHex, dataHex] = parts
  if (!/^[0-9a-fA-F]+$/.test(ivHex + tagHex + dataHex) || !ivHex || !tagHex || !dataHex) {
    throw new GscTokenCryptoError('Stored token has an invalid format.')
  }
  const key = getMasterKey()
  try {
    const decipher = crypto.createDecipheriv(ALGORITHM, key, Buffer.from(ivHex, 'hex'))
    decipher.setAuthTag(Buffer.from(tagHex, 'hex'))
    const plaintext = Buffer.concat([decipher.update(Buffer.from(dataHex, 'hex')), decipher.final()])
    return plaintext.toString('utf8')
  } catch {
    // Deliberately generic — never include key/ciphertext material in errors.
    throw new GscTokenCryptoError('Failed to decrypt token (wrong key or corrupted value).')
  }
}
