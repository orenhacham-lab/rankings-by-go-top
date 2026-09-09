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
 * Gated by ENABLE_AI_VISIBILITY, like every other route in this section.
 */

import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { readUsageAllowance } from '@/lib/billing/usage-allowance'

export async function GET() {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  // SERVICE-ROLE: the allowance depends on billing_governance, which an
  // `authenticated` client may not read at all. The user id is the one the
  // server just verified from the session.
  const allowance = await readUsageAllowance(createAdminClient(), {
    userId: user.id,
    usageType: 'ai_check',
    limitFor: (limits) => limits.maxAIScansPerPeriodPerProject,
  })

  // `unknown` is returned as such, never as zero — a UI that cannot read the
  // allowance must say so rather than imply the merchant has none left.
  return Response.json(allowance)
}
