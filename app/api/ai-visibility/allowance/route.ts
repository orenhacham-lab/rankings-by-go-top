/**
 * GET /api/ai-visibility/allowance — how many AI checks this account may still
 * run in the current billing period.
 *
 * WHY IT EXISTS. The Shopify plan promises "up to 20 AI checks per monthly
 * billing period" and nothing in the product ever showed that number. A
 * reviewer looking at AI Visibility, Scans and Billing could not tell an
 * exhausted allowance from a broken button — which is precisely the report this
 * answers.
 *
 * It reads the SAME ledger and the SAME period the dispatcher enforces (see
 * lib/billing/usage-allowance.ts), so the number shown cannot disagree with the
 * number that decides. It is a READ: it reserves nothing and consumes nothing.
 *
 * ── THE AUTHORITY IS THE SESSION, AND ONLY THE SESSION ──────────────────────
 *
 * This handler takes NO argument. Not `(request: Request)`, not a context — so
 * there is no body, no query string and no header it could read a user id,
 * project id or plan from, and no future edit can quietly start honouring one
 * without changing this signature. The only identity in play is `user.id`, read
 * from the session the server just verified. That is what makes "never accepts
 * another user id as authority" a property of the shape rather than a promise.
 *
 * ── AND THE ANSWER IS THE MINIMUM ───────────────────────────────────────────
 *
 * `readUsageAllowance` returns the period boundaries, the plan code and, when
 * it cannot answer, which of its two reads failed. The UI displays none of
 * that: it shows used/limit and, at zero remaining, one sentence. So the wire
 * carries used/limit/remaining and nothing else — the plan code and billing
 * period stay server-side, and the failure `reason` is logged rather than
 * published, because it describes the server's internals, not the merchant's
 * allowance.
 *
 * Gated by ENABLE_AI_VISIBILITY, like every other route in this section.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readUsageAllowance } from '@/lib/billing/usage-allowance'

/** Exactly what the UI renders — see AIVisibilitySection's `allowance` state. */
type AllowanceResponse =
  | { state: 'known'; limit: number; used: number; remaining: number }
  | { state: 'unmetered' }
  | { state: 'unknown' }

export async function GET() {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    // SERVICE-ROLE: the allowance depends on billing_governance, which an
    // `authenticated` client may not read at all. The user id is the one the
    // server just verified from the session — never one supplied by the caller.
    const allowance = await readUsageAllowance(createAdminClient(), {
      userId: user.id,
      usageType: 'ai_check',
      limitFor: (limits) => limits.maxAIScansPerPeriodPerProject,
    })

    if (allowance.state === 'unknown') {
      // `reason` distinguishes an unreadable entitlement from an unresolvable
      // period. Useful to an operator, meaningless to the merchant, and not the
      // merchant's to see — so it is logged, not returned.
      console.error('[ai-visibility] allowance unavailable', { reason: allowance.reason })
    }

    // `unknown` is answered as such, never as zero — a UI that cannot read the
    // allowance must say so rather than imply the merchant has none left.
    const body: AllowanceResponse =
      allowance.state === 'known'
        ? { state: 'known', limit: allowance.limit, used: allowance.used, remaining: allowance.remaining }
        : allowance.state === 'unmetered'
        ? { state: 'unmetered' }
        : { state: 'unknown' }
    return Response.json(body)
  } catch {
    // FAIL CLOSED, AND STILL TYPED. Every read above is a database call and any
    // of them can throw — a missing service-role key, a dropped connection, a
    // driver error. Letting that escape produced an untyped 500 whose body the
    // UI could only guess at; the merchant is now told the allowance could not
    // be read, in their own language, by the same branch that handles a
    // returned `unknown`. Nothing of the underlying error is published.
    console.error('[ai-visibility] allowance read threw')
    const body: AllowanceResponse = { state: 'unknown' }
    return Response.json(body)
  }
}
