/**
 * The handoff from an anonymous scan to a real account.
 *
 * The problem this solves: at signup we want to seed the new project from the
 * scan the visitor just watched. Looking that scan up BY DOMAIN would mean a
 * new account gets whatever run happens to be cached for the domain it typed —
 * someone else's scan, possibly of a site they do not own. So the free check
 * hands out a capability instead: one random, single-use token per response,
 * stored only as a SHA-256, redeemable once, valid for the same 24h the cache
 * is. Redemption returns the exact ledger row the token was issued against.
 *
 * The token is high-entropy (32 random bytes), so the hash needs no salt: there
 * is no dictionary to run against it.
 */
import { createHash, randomBytes } from 'crypto'
import { createAdminClient, type ServiceRoleClient } from '@/lib/supabase/admin'
import { CACHE_TTL_MS } from './store'
import type { FreeCheckResult } from './types'
import type { Locale } from '@/lib/i18n/locales'

export function hashClaimToken(token: string): string {
  return createHash('sha256').update(token).digest('hex')
}

/** Shape a claim token must have before it is worth a database round trip. */
export function isWellFormedClaimToken(token: string): boolean {
  return /^[a-f0-9]{64}$/.test(token)
}

/**
 * Mint a token for one response and record its hash against that ledger row.
 * Returns null when the claim cannot be recorded — the check itself still
 * succeeds, the visitor simply signs up without a seeded project, which is the
 * pre-existing behaviour rather than a failure.
 */
export async function issueClaimToken(
  checkId: string,
  admin: ServiceRoleClient = createAdminClient(),
): Promise<string | null> {
  const token = randomBytes(32).toString('hex')
  const { error } = await admin.from('free_site_check_claims').insert({
    token_hash: hashClaimToken(token),
    check_id: checkId,
  })
  if (error) {
    console.error('[free-check] claim insert failed', { code: error.code })
    return null
  }
  return token
}

export type ClaimedScan = {
  checkId: string
  domain: string
  url: string
  locale: Locale
  result: FreeCheckResult
}

export type ClaimOutcome =
  | { ok: true; scan: ClaimedScan }
  | { ok: false; reason: 'malformed' | 'not_found' | 'already_used' | 'expired' | 'internal' }

/**
 * Redeem a token exactly once.
 *
 * The single-use guarantee is the UPDATE's own WHERE clause — `consumed_at is
 * null` is evaluated by Postgres, so two simultaneous redemptions cannot both
 * match; the loser gets zero rows back and is told the token was already used.
 * Doing the check as a SELECT followed by an UPDATE would be a race, and the
 * prize for winning it is somebody else's scan.
 */
export async function consumeClaimToken(
  token: string,
  admin: ServiceRoleClient = createAdminClient(),
  now: Date = new Date(),
): Promise<ClaimOutcome> {
  if (!isWellFormedClaimToken(token)) return { ok: false, reason: 'malformed' }
  const cutoff = new Date(now.getTime() - CACHE_TTL_MS).toISOString()

  const claimed = await admin
    .from('free_site_check_claims')
    .update({ consumed_at: now.toISOString() })
    .eq('token_hash', hashClaimToken(token))
    .is('consumed_at', null)
    .gt('created_at', cutoff)
    .select('check_id')
  if (claimed.error) {
    console.error('[free-check] claim redeem failed', { code: claimed.error.code })
    return { ok: false, reason: 'internal' }
  }
  const row = (claimed.data as { check_id: string }[] | null)?.[0]
  if (!row) {
    // Distinguish "never existed" from "spent or expired" for the caller's
    // copy, without telling an unauthenticated caller anything it could probe:
    // both answers require holding a well-formed token in the first place.
    const existing = await admin
      .from('free_site_check_claims')
      .select('consumed_at, created_at')
      .eq('token_hash', hashClaimToken(token))
      .limit(1)
    const found = (existing.data as { consumed_at: string | null; created_at: string }[] | null)?.[0]
    if (!found) return { ok: false, reason: 'not_found' }
    return { ok: false, reason: found.consumed_at ? 'already_used' : 'expired' }
  }

  const scan = await admin
    .from('free_site_checks')
    .select('id, domain, url, locale, result')
    .eq('id', row.check_id)
    .limit(1)
  if (scan.error) return { ok: false, reason: 'internal' }
  const found = (scan.data as { id: string; domain: string; url: string; locale: Locale; result: FreeCheckResult }[] | null)?.[0]
  if (!found) return { ok: false, reason: 'not_found' }

  return { ok: true, scan: { checkId: found.id, domain: found.domain, url: found.url, locale: found.locale, result: found.result } }
}
