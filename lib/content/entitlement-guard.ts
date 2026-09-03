/**
 * Phase 2 (blocker fix, Blocker D) — the central gate for every AI-generation
 * action (article body, featured/inline image, topic-title suggestion, the
 * recommendation/topic-idea engine). Installed at the narrowest function
 * each subsystem's manual/queue/cron/retry paths all share — see the call
 * sites in lib/content/article-generation.ts, lib/content/featured-image.ts,
 * lib/content/inline-images.ts, lib/content/gemini-topics.ts, and the two
 * recommendation-engine route entry points (the recommendation engine's own
 * low-level Gemini caller, generateRecommendationJSON, is a pure
 * DB-free function with no project context — gating it directly would mean
 * threading admin+projectId into a function 7 different callers share for a
 * reason; the route layer is the actual narrowest shared point there, since
 * that subsystem has no queue/cron/retry indirection).
 *
 * Evaluation order (matches lib/subscription.ts's getUserEntitlement):
 *   1. a verified administrator is allowed through, before any billing check;
 *   2. otherwise Shopify governance decides, when it governs this account.
 *
 * Deliberately narrow in scope: this enforces ONLY the new
 * 'shopify_billing_required' zero-entitlement state introduced by Phase 2.
 * A website-only trial or PayPal user's content-generation behavior is
 * unchanged — this repo has no pre-existing content-generation quota system
 * to extend (confirmed by a full-codebase audit: getUserEntitlement/
 * hasAccess/PLAN_LIMITS appear nowhere in app/api/content/** or
 * lib/content/** before this file), so "unchanged" for those two
 * populations means "still ungated by quota", exactly as before.
 *
 * Checked at EXECUTION time, not queue-insertion time — a pool item queued
 * while the merchant was entitled and processed later (by cron) after
 * entitlement was lost is denied HERE, before generateArticleForTopic ever
 * reaches generateValidatedArticle/callGemini — never after the AI provider
 * has been charged. Reuses resolveShopifyGovernedEntitlement's own
 * short-lived cache/live-check policy — a Partner API outage denies ONLY a
 * Shopify-governed user; a non-Shopify (WordPress or website-only) user is
 * never affected, since resolveShopifyGovernedEntitlement returns null
 * immediately for them without any Shopify/Partner API involvement.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { isAdminUser } from '@/lib/auth/admin-role'
import { resolveShopifyGovernedEntitlement } from '@/lib/shopify/entitlement-resolver'

type Admin = ReturnType<typeof createAdminClient>

export type ContentGenerationGateResult =
  | { allowed: true }
  /** Shopify governs this account and it has no verified plan — a real billing answer. */
  | { allowed: false; reason: 'shopify_billing_required' }
  /**
   * The entitlement could not be DETERMINED: the governance record, the
   * connection or the migration state was unreadable. This is an infrastructure
   * failure, and it must never be presented as "buy a plan" — the caller should
   * surface a retryable 503-shaped error.
   */
  | { allowed: false; reason: 'entitlement_unavailable'; detail: string }

/**
 * Resolve straight from a known, already-trusted userId (e.g.
 * generateArticleForTopic's opts.userId, which its caller stamps as the
 * project owner — see that file's own header comment on the ownership
 * contract).
 */
export async function assertContentGenerationAllowedForUser(
  admin: Admin,
  userId: string,
  /** Injectable clock, threaded to the Shopify cache-freshness check. */
  nowFn: () => Date = () => new Date(),
): Promise<ContentGenerationGateResult> {
  // PRODUCTION BUG this closes. lib/subscription.ts's getUserEntitlement() and
  // hasAccess() both let a verified administrator through BEFORE consulting
  // Shopify governance, and app/api/shopify/billing/start-intent keeps admins
  // away from Shopify billing entirely. This gate — which every AI-generation
  // action funnels through — went straight to resolveShopifyGovernedEntitlement
  // with no such check, so an administrator whose account happened to carry a
  // Shopify connection was refused with `billing_required` while the rest of
  // the app treated them as fully entitled.
  //
  // The role is read server-side from profiles.role with the service-role
  // client (lib/auth/admin-role.ts). It cannot be asserted by a request
  // parameter, a body field or a header, and it fails closed: an unreadable or
  // absent role is NOT an admin. Ownership and authentication checks upstream
  // are untouched — this only decides billing entitlement, never access.
  if (await isAdminUser(admin, userId)) return { allowed: true }

  const resolution = await resolveShopifyGovernedEntitlement(admin, userId, nowFn)
  // An outage is NOT a billing verdict. Telling a paying customer to purchase a
  // plan because a query failed is worse than refusing the request honestly.
  if (resolution.kind === 'unavailable') {
    return { allowed: false, reason: 'entitlement_unavailable', detail: resolution.reason }
  }
  if (resolution.kind === 'governed' && resolution.entitlement.planCode === null) {
    return { allowed: false, reason: 'shopify_billing_required' }
  }
  return { allowed: true }
}

/**
 * Resolve via a project id, for call sites that only have project_id (not
 * yet the owning user id) at the point they need to check. A project whose
 * owner can't be resolved is NOT a Shopify-governance concern — let the
 * caller's own not-found/ownership handling take over downstream.
 */
export async function assertContentGenerationAllowedForProject(
  admin: Admin,
  projectId: string,
  nowFn: () => Date = () => new Date(),
): Promise<ContentGenerationGateResult> {
  const { data, error } = await admin.from('projects').select('user_id').eq('id', projectId).maybeSingle()
  // A FAILED owner lookup used to fall through to `allowed: true`, so a
  // database error opened the gate for everyone. It is an infrastructure
  // failure and is reported as one.
  if (error) return { allowed: false, reason: 'entitlement_unavailable', detail: 'project_owner_lookup_failed' }
  const userId = (data as { user_id?: string } | null)?.user_id
  // A project with no resolvable owner is not a Shopify-governance question —
  // the caller's own not-found/ownership handling takes over downstream.
  if (!userId) return { allowed: true }
  return assertContentGenerationAllowedForUser(admin, userId, nowFn)
}

/** A denied gate result — the only shape the mappings below accept. */
export type DeniedContentGenerationGate = Extract<ContentGenerationGateResult, { allowed: false }>

/**
 * THE ONE MAPPING every consumer uses. Blocker D left the two denial reasons
 * distinguished at the source and then collapsed at every consumer: a
 * governance/connection/Partner-API failure was reported to the merchant as
 * "Shopify billing required" with a 403. That is wrong twice over — it tells a
 * PAYING customer to buy a plan because a query failed, and 403 tells the
 * caller not to retry something that is purely transient.
 *
 * Centralised so the routes cannot drift apart again:
 *
 *   shopify_billing_required → 403, a verified billing verdict, terminal;
 *   entitlement_unavailable  → 503, an infrastructure failure, retryable.
 *
 * An `entitlement_unavailable` is NEVER rewritten as a billing failure.
 */
export type GateDenialHttp =
  | { status: 403; reason: 'shopify_billing_required'; error: 'Shopify billing required' }
  | { status: 503; reason: 'entitlement_unavailable'; error: 'Entitlement temporarily unavailable' }

export function gateDenialHttp(gate: DeniedContentGenerationGate): GateDenialHttp {
  return gate.reason === 'entitlement_unavailable'
    ? { status: 503, reason: 'entitlement_unavailable', error: 'Entitlement temporarily unavailable' }
    : { status: 403, reason: 'shopify_billing_required', error: 'Shopify billing required' }
}

/**
 * The stable failure CODE for non-HTTP consumers (the generation core, the
 * image pipelines) — the same distinction, in the vocabulary those callers
 * already store in `last_error` / return as `error`.
 */
export function gateDenialCode(gate: DeniedContentGenerationGate): 'billing_required' | 'entitlement_unavailable' {
  return gate.reason === 'entitlement_unavailable' ? 'entitlement_unavailable' : 'billing_required'
}

/**
 * True when the denial is an OUTAGE rather than a verdict: safe and correct to
 * retry, and it must not burn an automation retry attempt or permanently mark
 * a row as a billing failure.
 */
export function isTransientGateDenial(gate: DeniedContentGenerationGate): boolean {
  return gate.reason === 'entitlement_unavailable'
}
