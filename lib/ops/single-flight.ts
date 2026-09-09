/**
 * SERVER-SIDE SINGLE FLIGHT for merchant operations that call a provider.
 *
 * WHY A SERVER CONTROL AND NOT A CLIENT ONE. The protections that existed were
 * not protections. A React ref stops a second click inside one component and
 * nothing else — not two tabs, not a reload while the request is in flight, not
 * two direct POSTs, not the automatic volume refresh racing a manual one. The
 * ranking scan had no guard at all beyond a comment asserting "no concurrent-job
 * race risk for a single trial user clicking scan from one browser session",
 * which the reviewer disproved by doing exactly that: the first attempt looked
 * stuck, so they clicked again.
 *
 * WHY NOT A REQUEST ID. The paid path keyed its usage reservation on the
 * server's per-request id. That is regenerated for every HTTP request, so two
 * clicks produced two keys, two reservations and two provider calls. An
 * idempotency key has to identify the OPERATION, not the request that happened
 * to start it — which is what `operationKey` below is: the claim's own start
 * instant, identical for every request that joins one operation and different
 * for a legitimate later retry.
 *
 * The atomicity is the DATABASE's, not this module's: `claim_operation` is a
 * single INSERT ... ON CONFLICT DO UPDATE ... WHERE statement against a primary
 * key. Twenty parallel Postgres backends racing for one scope were measured
 * returning exactly one `claimed` and nineteen `in_progress`, with one row.
 * See supabase/migrations/20260909000000_operation_claims.sql.
 */

import type { ServiceRoleClient } from '@/lib/supabase/admin'

export type OperationName = 'ranking_scan' | 'search_volume'

export type ClaimOutcome =
  /** This caller owns the operation and must release it when finished. */
  | 'claimed'
  /** Someone else is already running this exact operation. */
  | 'in_progress'
  /** The claim could not be evaluated. The caller must fail closed. */
  | 'unavailable'
  /**
   * The claim mechanism is not deployed yet (table/function absent). The caller
   * proceeds WITHOUT protection and says so in its diagnostics — a deploy that
   * lands before its migration must degrade, not take the feature offline. This
   * is not a state production should ever be in; see the migration's header.
   */
  | 'not_deployed'

export interface OperationClaim {
  outcome: ClaimOutcome
  /** The request that owns the live operation — this one, or the one it joined. */
  holderRequestId: string | null
  /**
   * The OPERATION's identity, for use as an idempotency-key component. Stable
   * across every request that joins the same claim; different for a later
   * legitimate retry. Never a per-request value.
   */
  operationKey: string | null
  expiresAt: string | null
}

/** Postgres/PostgREST codes meaning the function or table is not there yet. */
const NOT_DEPLOYED = new Set(['42883', '42P01', 'PGRST202', 'PGRST205'])

function isNotDeployed(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false
  if (error.code && NOT_DEPLOYED.has(error.code)) return true
  const m = (error.message ?? '').toLowerCase()
  return m.includes('could not find the function') || m.includes('does not exist')
}

/** The scan and the volume update have different natural scopes; both are
 *  built here so a route cannot invent an inconsistent one. */
export function rankingScanScope(projectId: string, targetId: string | null): string {
  return targetId ? `project:${projectId}:target:${targetId}` : `project:${projectId}:all`
}
export function searchVolumeScope(projectId: string): string {
  return `project:${projectId}`
}

export async function claimOperation(
  admin: ServiceRoleClient,
  args: { userId: string; operation: OperationName; scope: string; requestId: string; ttlSeconds: number },
): Promise<OperationClaim> {
  const { data, error } = await admin.rpc('claim_operation', {
    p_user_id: args.userId,
    p_operation: args.operation,
    p_scope: args.scope,
    p_request_id: args.requestId,
    p_ttl_seconds: args.ttlSeconds,
  })
  if (error) {
    if (isNotDeployed(error)) {
      return { outcome: 'not_deployed', holderRequestId: null, operationKey: null, expiresAt: null }
    }
    return { outcome: 'unavailable', holderRequestId: null, operationKey: null, expiresAt: null }
  }
  const row = (Array.isArray(data) ? data[0] : data) as
    | { outcome?: string; holder_request_id?: string | null; claimed_at?: string | null; expires_at?: string | null }
    | null
  if (!row || typeof row.outcome !== 'string') {
    return { outcome: 'unavailable', holderRequestId: null, operationKey: null, expiresAt: null }
  }
  const outcome: ClaimOutcome =
    row.outcome === 'claimed' ? 'claimed' : row.outcome === 'in_progress' ? 'in_progress' : 'unavailable'
  return {
    outcome,
    holderRequestId: row.holder_request_id ?? null,
    // The claim's start instant IS the operation's identity.
    operationKey: row.claimed_at ?? null,
    expiresAt: row.expires_at ?? null,
  }
}

/**
 * Releases the claim, but only if this request still holds it. A first attempt
 * that was superseded after its claim expired must never release the claim its
 * successor now owns. Never throws: a release failure must not turn a completed
 * operation into an error.
 */
export async function releaseOperationClaim(
  admin: ServiceRoleClient,
  args: { userId: string; operation: OperationName; scope: string; requestId: string },
): Promise<'released' | 'not_holder' | 'unavailable'> {
  try {
    const { data, error } = await admin.rpc('release_operation_claim', {
      p_user_id: args.userId,
      p_operation: args.operation,
      p_scope: args.scope,
      p_request_id: args.requestId,
    })
    if (error) return 'unavailable'
    const row = (Array.isArray(data) ? data[0] : data) as { outcome?: string } | null
    return row?.outcome === 'released' ? 'released' : 'not_holder'
  } catch {
    return 'unavailable'
  }
}
