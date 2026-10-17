/**
 * The signed token in the unsubscribe link of an outbound prospecting email.
 *
 * `<base64url(address)>.<signature>`: the signature is HMAC-SHA256, base64url, over a
 * fixed purpose label and the NORMALIZED address, keyed with a key derived from an
 * existing server secret (CRON_SECRET) under its own label, so the same secret never
 * signs anything else the same way.
 *
 * The address travels in the link because the link only ever reaches that address, and
 * because the list is keyed by a hash: the route needs the plaintext to compute the key.
 * The signature is what stops a stranger from filling the list with addresses we never
 * wrote to.
 *
 * Fail closed: no secret configured means no token is made and none is accepted. The
 * token carries no expiry — CAN-SPAM requires the link to work for at least 30 days
 * after the message, and a link in an old message must keep working after that.
 */
import { createHmac, timingSafeEqual } from 'crypto'
import { normalizeEmail } from '@/lib/email-suppression'

const KEY_LABEL = 'gotop:outreach-unsubscribe:key:v1'
const MSG_LABEL = 'gotop:outreach-unsubscribe:v1'
const MAX_TOKEN = 600

function key(env: Record<string, string | undefined>): Buffer | null {
  const secret = env.CRON_SECRET
  if (!secret) return null
  return createHmac('sha256', secret).update(KEY_LABEL).digest()
}

function sign(k: Buffer, email: string): string {
  return createHmac('sha256', k).update(`${MSG_LABEL}:${normalizeEmail(email)}`).digest('base64url')
}

/** An address the link could never be useful for, whatever it is signed with. */
function unusable(email: unknown): email is string {
  if (typeof email !== 'string') return false
  const normalized = normalizeEmail(email)
  return normalized.length === 0 || normalized.length > 320 || normalized.indexOf('@') < 1
}

/** The token for one address, or null when no secret is configured. */
export function makeOutreachUnsubscribeToken(email: string, env: Record<string, string | undefined> = process.env): string | null {
  const k = key(env)
  if (!k || unusable(email)) return null
  const normalized = normalizeEmail(email)
  return `${Buffer.from(normalized, 'utf8').toString('base64url')}.${sign(k, normalized)}`
}

/**
 * The address a token names, only once its signature is the one we issued for it.
 * Returns null for anything else, so an unsigned or edited token suppresses nothing.
 */
export function readOutreachUnsubscribeToken(token: unknown, env: Record<string, string | undefined> = process.env): string | null {
  const k = key(env)
  if (!k || typeof token !== 'string' || token.length === 0 || token.length > MAX_TOKEN) return null
  const parts = token.split('.')
  if (parts.length !== 2) return null
  const [encoded, signature] = parts
  if (!encoded || !signature) return null
  let email: string
  try {
    email = Buffer.from(encoded, 'base64url').toString('utf8')
  } catch {
    return null
  }
  if (unusable(email)) return null
  const normalized = normalizeEmail(email)
  // Only the exact encoding we issue is accepted, so one address has one token.
  if (Buffer.from(normalized, 'utf8').toString('base64url') !== encoded) return null
  const got = Buffer.from(signature, 'utf8')
  const want = Buffer.from(sign(k, normalized), 'utf8')
  if (got.length !== want.length || !timingSafeEqual(got, want)) return null
  return normalized
}
