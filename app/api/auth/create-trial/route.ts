import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'

/**
 * POST /api/auth/create-trial — make sure the SIGNED-IN user has a trial row.
 *
 * SECURITY CONTRACT. This route used to take `{ userId, trialEndsAt }` from the
 * request body with no session check and write them with the service-role
 * client. Anyone could therefore grant any account (their own included) a
 * trial ending in 2099, or turn a cancelled/expired subscription back into a
 * trial. Now:
 *   - the user is the one Supabase verifies from the session cookie — the body
 *     is never read, so there is nothing to forge;
 *   - the trial length is decided HERE, from the account's own creation time,
 *     so repeating the call can never extend it;
 *   - an existing subscription row of any status is never modified. The
 *     `on_auth_user_created` trigger (handle_new_user) already inserts the
 *     7-day trial at signup; this route only back-fills a missing row.
 */
const TRIAL_DAYS = 7

export async function POST() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const admin = createAdminClient()

    const { data: existing, error: readError } = await admin
      .from('subscriptions')
      .select('status')
      .eq('user_id', user.id)
      .maybeSingle()

    if (readError) {
      console.error('[create-trial] subscription read failed:', readError.code)
      return Response.json({ error: 'Trial creation failed' }, { status: 500 })
    }

    // Any existing row — trial, active, cancelled, expired — stays as it is.
    if (existing) return Response.json({ success: true })

    const createdAt = user.created_at ? new Date(user.created_at) : new Date()
    const base = Number.isNaN(createdAt.getTime()) ? new Date() : createdAt
    const trialEndsAt = new Date(base.getTime() + TRIAL_DAYS * 24 * 60 * 60 * 1000)

    // Trial is identified by status='trial' + trial_ends_at; the `plan` column
    // is only set when the user upgrades to a paid plan via PayPal activation.
    const { error: insertError } = await admin.from('subscriptions').insert({
      user_id: user.id,
      status: 'trial',
      trial_ends_at: trialEndsAt.toISOString(),
    })

    // 23505: the trigger (or a concurrent call) inserted it first — fine.
    if (insertError && insertError.code !== '23505') {
      console.error('[create-trial] insert failed:', insertError.code)
      return Response.json({ error: 'Trial creation failed' }, { status: 500 })
    }

    return Response.json({ success: true })
  } catch (error) {
    console.error('[create-trial] unexpected error:', error instanceof Error ? error.name : 'unknown')
    return Response.json({ error: 'Trial creation failed' }, { status: 500 })
  }
}
