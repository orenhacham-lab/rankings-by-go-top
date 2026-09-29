/**
 * How the app proves itself to the Go Top WordPress plugin. Server-side only.
 *
 * Every request to a signed plugin route carries four headers:
 *
 *   X-GoTop-Key        the key id ("gtk_" + 16 hex), which secret to check with
 *   X-GoTop-Timestamp  unix seconds; the plugin refuses anything more than
 *                      SIGNATURE_WINDOW_S away from its own clock
 *   X-GoTop-Nonce      32 random hex characters, used once: the plugin remembers
 *                      every nonce it accepted for twice the window and refuses a
 *                      second use (replay)
 *   X-GoTop-Signature  "v1=" + hex HMAC-SHA256(secret, canonical string)
 *
 * The canonical string binds the method, the REST route, the time, the nonce,
 * the key id and a SHA-256 of the exact body, so a captured request cannot be
 * replayed, re-aimed at another route, or given another body. The plugin
 * compares with hash_equals (constant time); `verifyPluginSignature` below is
 * the same check in TypeScript, and the QA suite runs the PHP one against
 * signatures made here.
 *
 * The secret is 32 random bytes, generated here, stored encrypted
 * (site_fix_plugin_links.secret_encrypted) and handed to the plugin exactly once
 * — pasted as a pairing code in wp-admin, or pushed over the site's existing
 * application-password connection. It is never logged or shown again.
 */
import crypto from 'crypto'

export const SIGNATURE_WINDOW_S = 300
export const HEADER_KEY = 'X-GoTop-Key'
export const HEADER_TIMESTAMP = 'X-GoTop-Timestamp'
export const HEADER_NONCE = 'X-GoTop-Nonce'
export const HEADER_SIGNATURE = 'X-GoTop-Signature'
export const PAIRING_PREFIX = 'GT1'

const KEY_ID = /^gtk_[0-9a-f]{16}$/
const SECRET = /^[A-Za-z0-9_-]{43}$/
const NONCE = /^[0-9a-f]{32}$/

export interface SignParts {
  method: 'POST'
  /** The REST route as WordPress names it, e.g. "/gotop/v1/fix". */
  route: string
  timestamp: string
  nonce: string
  keyId: string
  body: string
}

export function canonicalString(p: SignParts): string {
  const bodyHash = crypto.createHash('sha256').update(p.body, 'utf8').digest('hex')
  return ['GOTOP-HMAC-V1', p.method, p.route, p.timestamp, p.nonce, p.keyId, bodyHash].join('\n')
}

export function signPluginRequest(secret: string, p: SignParts): string {
  return `v1=${crypto.createHmac('sha256', secret).update(canonicalString(p), 'utf8').digest('hex')}`
}

/** The signed headers for one request (a fresh nonce each call). */
export function signedHeaders(
  link: { keyId: string; secret: string },
  route: string,
  body: string,
  now: () => number = Date.now,
  random: (n: number) => Buffer = crypto.randomBytes,
): Record<string, string> {
  const timestamp = String(Math.floor(now() / 1000))
  const nonce = random(16).toString('hex')
  const signature = signPluginRequest(link.secret, { method: 'POST', route, timestamp, nonce, keyId: link.keyId, body })
  return { [HEADER_KEY]: link.keyId, [HEADER_TIMESTAMP]: timestamp, [HEADER_NONCE]: nonce, [HEADER_SIGNATURE]: signature }
}

export type VerifyResult = { ok: true } | { ok: false; code: 'bad_headers' | 'unknown_key' | 'stale' | 'replay' | 'bad_signature' }

/**
 * The plugin's check, in TypeScript (the reference the PHP is tested against).
 * `seen` remembers accepted nonces; a nonce is recorded only after the
 * signature verified, so a forged request cannot burn a real one.
 */
export function verifyPluginSignature(
  req: { method: string; route: string; headers: Record<string, string | undefined>; body: string },
  keys: (keyId: string) => string | null,
  nowSeconds: number,
  seen: Set<string>,
): VerifyResult {
  const keyId = req.headers[HEADER_KEY] ?? ''
  const ts = req.headers[HEADER_TIMESTAMP] ?? ''
  const nonce = req.headers[HEADER_NONCE] ?? ''
  const sig = req.headers[HEADER_SIGNATURE] ?? ''
  if (req.method !== 'POST' || !KEY_ID.test(keyId) || !/^\d{9,11}$/.test(ts) || !NONCE.test(nonce) || !/^v1=[0-9a-f]{64}$/.test(sig)) {
    return { ok: false, code: 'bad_headers' }
  }
  const secret = keys(keyId)
  if (!secret) return { ok: false, code: 'unknown_key' }
  if (Math.abs(nowSeconds - Number(ts)) > SIGNATURE_WINDOW_S) return { ok: false, code: 'stale' }
  const expected = Buffer.from(signPluginRequest(secret, { method: 'POST', route: req.route, timestamp: ts, nonce, keyId, body: req.body }))
  const given = Buffer.from(sig)
  if (expected.length !== given.length || !crypto.timingSafeEqual(expected, given)) return { ok: false, code: 'bad_signature' }
  if (seen.has(`${keyId}:${nonce}`)) return { ok: false, code: 'replay' }
  seen.add(`${keyId}:${nonce}`)
  return { ok: true }
}

/** A new key: its public id and its secret (32 random bytes, base64url, 43 characters). */
export function generatePluginKey(random: (n: number) => Buffer = crypto.randomBytes): { keyId: string; secret: string } {
  return { keyId: `gtk_${random(8).toString('hex')}`, secret: random(32).toString('base64url') }
}

/** The one-time pairing code the merchant pastes into the plugin's settings page. */
export function pairingCode(key: { keyId: string; secret: string }): string {
  return `${PAIRING_PREFIX}.${key.keyId}.${key.secret}`
}

export function parsePairingCode(code: string): { keyId: string; secret: string } | null {
  const parts = String(code ?? '').trim().split('.')
  if (parts.length !== 3 || parts[0] !== PAIRING_PREFIX || !KEY_ID.test(parts[1]) || !SECRET.test(parts[2])) return null
  return { keyId: parts[1], secret: parts[2] }
}
