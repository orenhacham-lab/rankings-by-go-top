'use server'

/**
 * Records where one new account came from, once, at sign-up.
 *
 * The sign-up page calls this straight after `supabase.auth.signUp` succeeds,
 * with the address it is sitting on and the referrer the browser gave it. The
 * derivation is pure and lives in lib/attribution/source.ts, which also
 * explains why there is no cookie anywhere in this path.
 *
 * WHAT THIS ACTION REFUSES, because the caller is a browser and the row is
 * written with the service role:
 *   - a user id that is not a uuid;
 *   - an account that does not exist, or was created more than ten minutes
 *     ago — so a passer-by cannot label somebody else's old account;
 *   - a second row for an account that already has one (the primary key
 *     refuses it; the conflict is swallowed, not reported).
 *
 * It answers nothing in every case. Attribution must never be able to fail a
 * sign-up or tell a caller anything about an account, so every path returns
 * void and nothing about the account is logged.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { readSignupSource } from '@/lib/attribution/source'

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const FRESH_ACCOUNT_MS = 10 * 60 * 1000

export async function recordSignupSource(
  userId: unknown,
  arrival: { search?: unknown; referrer?: unknown; path?: unknown },
): Promise<void> {
  try {
    if (typeof userId !== 'string' || !UUID.test(userId)) return

    const row = readSignupSource(arrival ?? {})
    if (!row) return

    const admin = createAdminClient()

    const { data, error } = await admin.auth.admin.getUserById(userId)
    if (error || !data?.user?.created_at) return
    const createdAt = Date.parse(data.user.created_at)
    if (!Number.isFinite(createdAt) || Date.now() - createdAt > FRESH_ACCOUNT_MS) return

    await admin.from('signup_attribution').insert({
      user_id: userId,
      source: row.source,
      medium: row.medium,
      campaign: row.campaign,
      referrer_host: row.referrerHost,
      landing_path: row.landingPath,
    })
  } catch {
    // Never surfaces: a sign-up is worth more than its attribution.
  }
}
