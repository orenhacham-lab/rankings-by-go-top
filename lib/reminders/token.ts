/**
 * The signed token in a reminder email's unsubscribe link.
 *
 * `<projectId>.<signature>`: the signature is HMAC-SHA256, base64url, over a fixed
 * purpose label, the project and its OWNER, keyed with a key derived from an existing
 * server secret (CRON_SECRET) under its own label, so the same secret never signs
 * anything else the same way. The route that receives it (a public one: proxy.ts does
 * not cover /api/*) recomputes the signature from the owner it reads itself, so:
 *   - a project id alone (however it was learned or guessed) unsubscribes nothing;
 *   - a token for one project is no good for another, and stops working for a project
 *     that changed hands;
 *   - no secret configured means no token is made and none is accepted (fail closed);
 *   - the compare is constant-time.
 * The token carries no expiry: an unsubscribe link in an old email must keep working.
 */
import { createHmac, timingSafeEqual } from 'crypto'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const KEY_LABEL = 'gotop:reminder-unsubscribe:key:v1'
const MSG_LABEL = 'gotop:reminder-unsubscribe:v1'

function key(env: Record<string, string | undefined>): Buffer | null {
  const secret = env.CRON_SECRET
  if (!secret) return null
  return createHmac('sha256', secret).update(KEY_LABEL).digest()
}

function sign(k: Buffer, projectId: string, ownerId: string): string {
  return createHmac('sha256', k).update(`${MSG_LABEL}:${projectId.toLowerCase()}:${ownerId.toLowerCase()}`).digest('base64url')
}

/** The token for one project of one owner, or null when no secret is configured. */
export function makeUnsubscribeToken(projectId: string, ownerId: string, env: Record<string, string | undefined> = process.env): string | null {
  const k = key(env)
  if (!k || !UUID.test(projectId) || !UUID.test(ownerId)) return null
  return `${projectId.toLowerCase()}.${sign(k, projectId, ownerId)}`
}

/** The project a token names, before it is checked: only ever used to look the owner up. */
export function tokenProjectId(token: unknown): string | null {
  if (typeof token !== 'string' || token.length > 200) return null
  const [id, sig, extra] = token.split('.')
  return extra === undefined && sig && UUID.test(id ?? '') ? id.toLowerCase() : null
}

/** True only when the token is the one this project's CURRENT owner was given. */
export function verifyUnsubscribeToken(token: unknown, projectId: string, ownerId: string, env: Record<string, string | undefined> = process.env): boolean {
  const k = key(env)
  if (!k || typeof token !== 'string' || !UUID.test(projectId) || !UUID.test(ownerId)) return false
  const named = tokenProjectId(token)
  if (!named || named !== projectId.toLowerCase()) return false
  const got = Buffer.from(token.split('.')[1] ?? '', 'utf8')
  const want = Buffer.from(sign(k, projectId, ownerId), 'utf8')
  return got.length === want.length && timingSafeEqual(got, want)
}
