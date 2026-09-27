/**
 * Cache, rate limit and model-spend ceiling for the public free check.
 *
 * The route is unauthenticated and each run costs an outbound crawl plus a
 * model call, so this module is what stands between a curious visitor and a
 * bill. All three controls read the one ledger table
 * (supabase/migrations/20260926000000_free_site_check.sql) through the
 * service-role client, and every one of them FAILS CLOSED: if the ledger cannot
 * be read we refuse the run rather than scan and spend blindly.
 *
 * Owner filtering (the CLAUDE.md rule for createAdminClient) does not apply
 * here in its usual form — these rows have no owner, they are anonymous public
 * runs — so the equivalent discipline is that every query is scoped by the
 * narrow key it is about (this domain, this hashed client, today) and nothing
 * ever selects the table unscoped.
 */
import { createHash } from 'crypto'
import { createAdminClient, type ServiceRoleClient } from '@/lib/supabase/admin'
import type { FreeCheckResult } from './types'
import type { FreeCheckSeed } from './run'
import type { Locale } from '@/lib/i18n/locales'

/** A cached result is replayed for this long. Matches "one check per day per domain". */
export const CACHE_TTL_MS = 24 * 60 * 60 * 1000
/** Per-client burst window and allowance. */
export const RATE_WINDOW_MS = 10 * 60 * 1000
export const RATE_MAX_IN_WINDOW = 5
/** Model calls per UTC day across all visitors. Env-overridable for incidents. */
export const DEFAULT_DAILY_AI_CAP = 300

function dailyAiCap(): number {
  const raw = Number(process.env.FREE_CHECK_DAILY_AI_CAP)
  return Number.isFinite(raw) && raw >= 0 ? raw : DEFAULT_DAILY_AI_CAP
}

/**
 * One-way client identifier. The raw IP is never stored or logged; the salt
 * (FREE_CHECK_IP_SALT) makes the hash unguessable, and without it the hash is
 * still one-way — just enumerable in principle by someone holding the table,
 * which only the service role can.
 */
export function hashClient(ip: string): string {
  return createHash('sha256').update(`${process.env.FREE_CHECK_IP_SALT ?? ''}|${ip}`).digest('hex')
}

/**
 * The client's address as the platform reports it. `x-forwarded-for` is
 * attacker-controllable in general, so this is a best-effort throttle key, not
 * an identity: on Vercel the left-most entry is the real client, and a forged
 * one only ever buys a fresh bucket, never someone else's.
 */
export function clientIpFrom(headers: Headers): string {
  const xff = headers.get('x-forwarded-for')
  if (xff) {
    const first = xff.split(',')[0]?.trim()
    if (first) return first
  }
  return headers.get('x-real-ip')?.trim() || 'unknown'
}

type LedgerRow = { id: string; result: FreeCheckResult; created_at: string }

export type Gate =
  | { allowed: true; cached?: FreeCheckResult; cachedCheckId?: string; allowAi: boolean }
  | { allowed: false; reason: 'rate_limited' | 'internal' }

/**
 * Decide, in one place, whether this run may proceed — and if so whether it may
 * spend a model call.
 */
export async function checkGate(
  args: { domain: string; locale: Locale; clientHash: string },
  admin: ServiceRoleClient = createAdminClient(),
  now: Date = new Date(),
): Promise<Gate> {
  // 1) Per-client burst. Refused first, so an abuser cannot even warm the cache.
  const windowStart = new Date(now.getTime() - RATE_WINDOW_MS).toISOString()
  const recent = await admin
    .from('free_site_checks')
    .select('id', { count: 'exact', head: true })
    .eq('client_hash', args.clientHash)
    .gt('created_at', windowStart)
  if (recent.error) return { allowed: false, reason: 'internal' }
  if ((recent.count ?? 0) >= RATE_MAX_IN_WINDOW) return { allowed: false, reason: 'rate_limited' }

  // 2) Cache: the newest run for this domain and locale inside the TTL.
  const cacheStart = new Date(now.getTime() - CACHE_TTL_MS).toISOString()
  const cachedRow = await admin
    .from('free_site_checks')
    .select('id, result, created_at')
    .eq('domain', args.domain)
    .eq('locale', args.locale)
    .gt('created_at', cacheStart)
    .order('created_at', { ascending: false })
    .limit(1)
  if (cachedRow.error) return { allowed: false, reason: 'internal' }
  const hit = (cachedRow.data as LedgerRow[] | null)?.[0]
  if (hit?.result) return { allowed: true, cached: { ...hit.result, cached: true }, cachedCheckId: hit.id, allowAi: false }

  // 3) Daily model-spend ceiling. Reaching it does not refuse the check — the
  //    deterministic part still runs and is still useful; only the model call
  //    is dropped.
  const dayStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate())).toISOString()
  const spent = await admin
    .from('free_site_checks')
    .select('id', { count: 'exact', head: true })
    .eq('ai_used', true)
    .gt('created_at', dayStart)
  if (spent.error) return { allowed: false, reason: 'internal' }

  return { allowed: true, allowAi: (spent.count ?? 0) < dailyAiCap() }
}

/**
 * Record a completed run and hand back its row id, which is what a claim token
 * is later issued against. A write failure must never fail the response — the
 * visitor gets their result, and only the cache, the throttle record and the
 * account handoff are lost with it, so the id comes back null instead.
 */
export async function recordRun(
  args: { domain: string; locale: Locale; url: string; result: FreeCheckResult; seed: FreeCheckSeed; clientHash: string },
  admin: ServiceRoleClient = createAdminClient(),
): Promise<string | null> {
  const { data, error } = await admin
    .from('free_site_checks')
    .insert({
      domain: args.domain,
      locale: args.locale,
      url: args.url,
      result: args.result,
      // The ungated set lives in its OWN column, never inside `result`: the
      // public replay path reads `result` and nothing else, so the teaser
      // cannot leak what it locks even if a later edit forgets why.
      seed: args.seed,
      ai_used: args.result.aiUsed,
      client_hash: args.clientHash,
    })
    .select('id')
  if (error) {
    console.error('[free-check] ledger insert failed', { code: error.code })
    return null
  }
  return (data as { id: string }[] | null)?.[0]?.id ?? null
}
