/**
 * "Can this account open another project?" — for the switcher's "New project"
 * entry, so the limit is visible BEFORE the merchant fills in a site address,
 * instead of after the form is submitted.
 *
 * DISPLAY ONLY. It reads the limit the create route enforces and changes no plan,
 * quota or subscription. The numbers are the create route's own: the account's
 * ACTIVE projects against PLAN_LIMITS[entitlement.plan].maxProjects, with an
 * administrator never limited (app/api/projects/create/route.ts). The route stays
 * the authority; this only avoids offering what it would refuse.
 *
 * An answer that cannot be read is 'unknown', and 'unknown' never disables the
 * entry: a failed read is not an exhausted quota.
 */
import type { PlanType } from '@/lib/subscription'

export type ProjectQuota =
  | { state: 'unlimited' }
  | { state: 'unknown' }
  | { state: 'known'; used: number; limit: number; atLimit: boolean }

export function projectQuota(input: {
  isAdmin: boolean
  plan: PlanType
  maxProjects: number
  /** Active projects the account owns; null when the count could not be read. */
  activeCount: number | null
}): ProjectQuota {
  if (input.isAdmin) return { state: 'unlimited' }
  if (input.plan === 'entitlement_unavailable') return { state: 'unknown' }
  if (input.activeCount === null || !Number.isFinite(input.activeCount) || !Number.isFinite(input.maxProjects)) {
    return { state: 'unknown' }
  }
  const used = Math.max(0, Math.floor(input.activeCount))
  const limit = Math.max(0, Math.floor(input.maxProjects))
  return { state: 'known', used, limit, atLimit: used >= limit }
}

/** Only a KNOWN, reached limit turns the entry off. */
export function newProjectBlocked(quota: ProjectQuota | null): quota is { state: 'known'; used: number; limit: number; atLimit: true } {
  return quota?.state === 'known' && quota.atLimit
}

/** Reads a response body defensively: anything unexpected is 'unknown'. */
export function parseProjectQuota(body: unknown): ProjectQuota {
  const b = body as { state?: unknown; used?: unknown; limit?: unknown; atLimit?: unknown } | null
  if (b?.state === 'unlimited') return { state: 'unlimited' }
  if (b?.state === 'known' && typeof b.used === 'number' && typeof b.limit === 'number' && typeof b.atLimit === 'boolean') {
    return { state: 'known', used: b.used, limit: b.limit, atLimit: b.atLimit }
  }
  return { state: 'unknown' }
}
