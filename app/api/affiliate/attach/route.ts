/**
 * POST /api/affiliate/attach — credit the account that was just created to the
 * partner whose link brought it.
 *
 * WHY A ROUTE AT ALL. Email+password signup creates the session in the BROWSER
 * (supabase.auth.signUp), so there is no server hop of ours to hang this on —
 * unlike Google and the email-confirmation link, which both come through
 * app/api/auth/callback and are credited there. Both doors call the same
 * function, lib/affiliate/attribution.ts, so they cannot drift apart.
 *
 * IT IS NOT A PLACE TO DECIDE ANYTHING. Every rule — the account must be new,
 * one account belongs to one partner for ever, the code must be an approved
 * partner's, a partner never earns on their own account — lives in that one
 * module, checked against the account Supabase itself verified from the session
 * cookie. The body carries the code and nothing else; it cannot carry a user id,
 * so there is nothing to forge. (/api/auth/create-trial was rewritten for
 * exactly this reason and its header says so; this route does not reopen that
 * door by reading an id.)
 *
 * It answers 200 for every outcome a signup can reach, with a reason. The
 * signup form ignores the answer: a referral that cannot be created must never
 * be the reason an account fails to be created.
 */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { attachReferral } from '@/lib/affiliate/attribution'
import { notifyOperatorOfFlaggedReferral } from '@/lib/affiliate/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })

  let code: unknown
  try {
    code = ((await request.json()) as { code?: unknown } | null)?.code
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  try {
    const outcome = await attachReferral(createAdminClient(), {
      account: { id: user.id, email: user.email ?? null, created_at: user.created_at ?? null },
      code: typeof code === 'string' ? code : null,
    })
    if (outcome.kind === 'attached' && outcome.flags.length) {
      try {
        await notifyOperatorOfFlaggedReferral({ affiliateCode: outcome.code, flags: outcome.flags })
      } catch { /* a notice is never the reason a signup fails */ }
    }
    if (outcome.kind === 'failed') console.error('[affiliate-attach] failed:', outcome.reason)
    return Response.json({ status: outcome.kind })
  } catch (err) {
    console.error('[affiliate-attach] unexpected:', err instanceof Error ? err.name : 'unknown')
    return Response.json({ status: 'failed' })
  }
}
