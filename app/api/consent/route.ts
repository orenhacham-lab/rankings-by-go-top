/**
 * POST /api/consent — write one row to the cookie-consent log.
 *
 * PUBLIC and unauthenticated by necessity: the decision is made before a
 * visitor has an account, and most decisions are made by people who never will
 * have one. proxy.ts's matcher excludes `/api/*`, so, as with /api/free-check,
 * what replaces authentication is a set of deliberate controls:
 *
 *   - nothing is read back. The route only ever INSERTs, so there is no shape
 *     of request that can make it disclose another visitor's record;
 *   - the body is parsed into a fixed set of fields with fixed lengths. Nothing
 *     from the caller reaches the row unchecked, and nothing extra is stored;
 *   - the address is hashed before it is used, for the rate limit AND for the
 *     row, so the table never holds an IP;
 *   - a hashed client may write 20 decisions an hour. A visitor changing their
 *     mind a few times is normal; a script filling the table is not;
 *   - the answer is always 204 with no body and no-store. A caller learns
 *     nothing from it, including whether the write landed.
 *
 * IT MUST NOT BE ABLE TO BREAK THE BANNER. Every failure — a missing table
 * before the migration is applied, a database that is down, a malformed body —
 * is logged server-side and answered 204. The visitor's refusal is already in
 * force in their browser before this request is sent; failing their page
 * because our audit trail stumbled would be the worse outcome.
 */
import { createHash } from 'node:crypto'
import { NextResponse } from 'next/server'
import {
  isConsentAction,
  normalizeChoices,
  type ConsentAction,
  type ConsentChoices,
} from '@/lib/consent/categories'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const NO_STORE = { 'cache-control': 'no-store' }

/** 204, always. See the header comment: the caller learns nothing either way. */
function done() {
  return new NextResponse(null, { status: 204, headers: NO_STORE })
}

/**
 * The address as the platform reports it, hashed with a salt before any use.
 * `x-forwarded-for` is attacker-controllable in general; on Vercel the
 * left-most entry is the real client, and a forged one only ever buys its
 * forger a fresh rate-limit bucket. Same reasoning as lib/free-check/store.ts.
 */
function hashedClient(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  const ip = xff?.split(',')[0]?.trim() || headers.get('x-real-ip')?.trim() || 'unknown'
  const salt = process.env.CONSENT_IP_SALT ?? process.env.FREE_CHECK_IP_SALT ?? ''
  return createHash('sha256').update(`${salt}|${ip}`).digest('hex')
}

const WINDOW_MS = 60 * 60 * 1000
const MAX_PER_WINDOW = 20

/**
 * In-process throttle. A serverless instance holds it for its own lifetime,
 * which is the right size of defence here: the table is append-only, carries
 * nothing sensitive and is never read by a browser, so the risk is volume, not
 * disclosure, and volume does not justify a database round trip per decision.
 */
const seen = new Map<string, number[]>()

function throttled(key: string): boolean {
  const now = Date.now()
  const hits = (seen.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
  if (hits.length >= MAX_PER_WINDOW) {
    seen.set(key, hits)
    return true
  }
  hits.push(now)
  seen.set(key, hits)
  // Keep the map from growing without bound on a long-lived instance.
  if (seen.size > 5000) {
    for (const [k, v] of seen) {
      if (v.every((t) => now - t >= WINDOW_MS)) seen.delete(k)
    }
  }
  return false
}

function text(value: unknown, max: number): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  return trimmed ? trimmed.slice(0, max) : null
}

/** An ISO timestamp from the visitor's clock, kept only if it parses. */
function isoOrNull(value: unknown): string | null {
  const raw = text(value, 40)
  if (!raw) return null
  const parsed = Date.parse(raw)
  return Number.isFinite(parsed) ? new Date(parsed).toISOString() : null
}

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return done()
  }
  const payload = (body ?? {}) as Record<string, unknown>

  const consentId = text(payload.consentId, 120)
  const policyVersion = text(payload.policyVersion, 40)
  if (!consentId || !policyVersion || !isConsentAction(payload.action)) return done()

  const action: ConsentAction = payload.action
  const categories: ConsentChoices = normalizeChoices(payload.categories)
  const locale = payload.locale === 'en' ? 'en' : 'he'
  const ipHash = hashedClient(request.headers)

  if (throttled(ipHash)) return done()

  try {
    const admin = createAdminClient()
    const { error } = await admin.from('consent_events').insert({
      consent_id: consentId,
      policy_version: policyVersion,
      action,
      categories,
      locale,
      page_path: text(payload.path, 300),
      ip_hash: ipHash,
      user_agent: text(request.headers.get('user-agent'), 400),
      decided_at: isoOrNull(payload.decidedAt),
    })
    if (error) {
      // 23505 = the dedupe index did its job on a retried keepalive request:
      // the decision is already on record, so this is a success, not a fault.
      if (error.code !== '23505') {
        console.error('[consent] log insert failed', { code: error.code, message: error.message })
      }
    }
  } catch (err) {
    console.error('[consent] log unavailable', { message: err instanceof Error ? err.message : String(err) })
  }

  return done()
}
