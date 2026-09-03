/**
 * Security fix — the authentication/ownership/entitlement gate for
 * POST /api/keyword-research/generate-ai-questions, extracted only so it is
 * directly unit-testable (the route itself resolves the session via
 * createClient()/cookies(), which isn't mockable in a plain script — this
 * function takes the already-resolved userId so it can be tested with
 * FakeAdmin, same pattern as lib/shopify/billing-return-processing.ts).
 * The generation pipeline itself is untouched and stays in the route.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { assertContentGenerationAllowedForUser, gateDenialHttp } from '@/lib/content/entitlement-guard'

type Admin = ReturnType<typeof createAdminClient>

export type AiQuestionsAuthResult =
  | { ok: true; userId: string }
  | { ok: false; status: 401; error: 'Unauthorized' }
  | { ok: false; status: 403; error: 'Forbidden' }
  | { ok: false; status: 403; error: 'Shopify billing required'; reason: 'shopify_billing_required' }
  /** The entitlement could not be determined — an outage, so retryable (503),
   *  and deliberately NOT phrased as a billing requirement. */
  | { ok: false; status: 503; error: 'Entitlement temporarily unavailable'; reason: 'entitlement_unavailable' }

/**
 * Runs BEFORE any billable provider call: session presence, project
 * ownership, then the centralized Shopify entitlement gate. `userId` is
 * whatever the caller's own session resolution produced (null if
 * unauthenticated) — never trusted from the request body.
 */
export async function authorizeAiQuestionGeneration(
  admin: Admin,
  userId: string | null,
  projectId: string,
): Promise<AiQuestionsAuthResult> {
  if (!userId) return { ok: false, status: 401, error: 'Unauthorized' }

  const { data: project } = await admin.from('projects').select('id, user_id').eq('id', projectId).maybeSingle()
  if (!project || (project as { user_id: string }).user_id !== userId) {
    return { ok: false, status: 403, error: 'Forbidden' }
  }

  const gate = await assertContentGenerationAllowedForUser(admin, userId)
  if (!gate.allowed) {
    // Through the SHARED mapping, so this route cannot drift from the others:
    // an infrastructure failure is a retryable 503, a verified no-plan is 403.
    const d = gateDenialHttp(gate)
    return d.status === 503
      ? { ok: false, status: 503, error: d.error, reason: 'entitlement_unavailable' }
      : { ok: false, status: 403, error: d.error, reason: 'shopify_billing_required' }
  }

  return { ok: true, userId }
}
