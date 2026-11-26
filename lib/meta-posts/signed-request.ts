/**
 * Verifying Meta's `signed_request`, the body of the Data Deletion and the
 * Deauthorize callbacks. Pure: no network, no database.
 *
 * Format (Meta's documented one): "<signature>.<payload>", both base64url. The
 * signature is HMAC-SHA256 of the payload STRING (as received, still encoded)
 * keyed with the app secret. Only a request whose signature matches names a
 * user, so anyone can POST to the callback and nobody can delete a stranger's
 * data. The comparison is constant-time.
 */
import crypto from 'crypto'

const b64urlToBuffer = (s: string) => Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64')

export type SignedRequestResult =
  | { ok: true; userId: string }
  | { ok: false }

export function parseSignedRequest(signedRequest: unknown, appSecret: string): SignedRequestResult {
  if (typeof signedRequest !== 'string' || !appSecret) return { ok: false }
  const parts = signedRequest.split('.')
  if (parts.length !== 2 || !parts[0] || !parts[1]) return { ok: false }
  const [sigPart, payloadPart] = parts
  let payload: { algorithm?: unknown; user_id?: unknown }
  try {
    const expected = crypto.createHmac('sha256', appSecret).update(payloadPart).digest()
    const given = b64urlToBuffer(sigPart)
    if (given.length !== expected.length || !crypto.timingSafeEqual(given, expected)) return { ok: false }
    payload = JSON.parse(b64urlToBuffer(payloadPart).toString('utf8'))
  } catch {
    return { ok: false }
  }
  if (!payload || typeof payload !== 'object') return { ok: false }
  if (typeof payload.algorithm !== 'string' || payload.algorithm.toUpperCase() !== 'HMAC-SHA256') return { ok: false }
  const userId = typeof payload.user_id === 'string' || typeof payload.user_id === 'number' ? String(payload.user_id) : ''
  if (!/^[0-9]{1,32}$/.test(userId)) return { ok: false }
  return { ok: true, userId }
}

/** Test helper: builds a request the way Meta does. */
export function signRequestForTest(payload: Record<string, unknown>, appSecret: string): string {
  const enc = (b: Buffer) => b.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '')
  const body = enc(Buffer.from(JSON.stringify(payload)))
  return `${enc(crypto.createHmac('sha256', appSecret).update(body).digest())}.${body}`
}
