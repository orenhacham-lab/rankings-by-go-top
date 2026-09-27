/**
 * Which site a kept claim token scanned, WITHOUT redeeming it.
 *
 * Redeeming the token (lib/free-check consumeClaimToken, through the seed
 * route) is single-use, and the seed route spends it even when the scan turns
 * out to be another site's. So before a project is seeded from the token, the
 * server looks first: the new-project screen fills the address in with the site
 * the visitor checked, and the start route asks for a claim run only when the
 * project IS that site. Anything else starts an ordinary scan and leaves the
 * token alone.
 *
 * The rows are read with the service role and filtered by the token's hash,
 * which is the only key a claim has: it belongs to no user until it is
 * redeemed. Nothing here writes, and nothing read here reaches a response
 * except the scanned site's address, and only to the signed-in merchant whose
 * browser holds the token.
 */
import { hashClaimToken } from '@/lib/free-check'
import { CACHE_TTL_MS } from '@/lib/free-check/store'
import type { ServiceRoleClient } from '@/lib/supabase/admin'

export type ClaimPeek =
  /** Unspent, unexpired, and its scan is on record. `domain` is the scan's site key. */
  | { state: 'usable'; domain: string; url: string }
  /** Unknown, spent, expired, or its scan is gone: the cookie is worth nothing now. */
  | { state: 'gone' }
  /** The database did not answer: decide nothing, keep the cookie. */
  | { state: 'unreadable' }

export async function peekSeedClaim(admin: ServiceRoleClient, token: string, now: Date): Promise<ClaimPeek> {
  const claim = await admin
    .from('free_site_check_claims')
    .select('check_id, consumed_at, created_at')
    .eq('token_hash', hashClaimToken(token))
    .limit(1)
  if (claim.error) return { state: 'unreadable' }
  const row = (claim.data as { check_id: string; consumed_at: string | null; created_at: string }[] | null)?.[0]
  if (!row || row.consumed_at) return { state: 'gone' }
  const issuedAt = new Date(row.created_at).getTime()
  // The same window consumeClaimToken redeems in: strictly newer than now minus the TTL.
  if (!Number.isFinite(issuedAt) || issuedAt <= now.getTime() - CACHE_TTL_MS) return { state: 'gone' }

  const scan = await admin.from('free_site_checks').select('domain, url').eq('id', row.check_id).limit(1)
  if (scan.error) return { state: 'unreadable' }
  const found = (scan.data as { domain: unknown; url: unknown }[] | null)?.[0]
  if (!found || typeof found.domain !== 'string' || typeof found.url !== 'string' || !found.domain) return { state: 'gone' }
  return { state: 'usable', domain: found.domain.slice(0, 253), url: found.url.slice(0, 2_000) }
}
