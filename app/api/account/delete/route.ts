/**
 * POST /api/account/delete — the merchant deletes their own account.
 *
 * `proxy.ts` excludes `/api/*`, so this route authenticates itself. It acts only
 * ever on the session's OWN user: the id comes from `getUser()` and never from the
 * request body, so there is no id to tamper with and no cross-account shape to
 * guard against.
 *
 * WHY THERE IS NO 90-DAY UNDO. The privacy policy promised that a deleted account
 * is kept "up to 90 days ... so an accidental deletion can be undone", for a
 * deletion route that did not exist. Building the grace period would have meant a
 * new column, a scheduled erase and a production migration, and it would have kept
 * a person's data for 90 days AFTER they asked to be erased — which needs its own
 * justification under Art. 17 and is a weaker answer to an explicit request than
 * doing it. So the deletion is immediate and irreversible, the typed confirmation
 * below is what replaces the undo, and the policy sentence changes with this PR
 * rather than being left as a promise about machinery nobody built.
 *
 * TWO REFUSALS, BOTH DELIBERATE.
 *
 * `subscription_active` — a live paid subscription is not cancelled here. We are
 * not allowed to touch billing from this code, and nor should we: the charge lives
 * at PayPal, Creem or Shopify, and only the merchant can stop it where they
 * started it. Deleting the account first would erase the only record of who was
 * being charged while the charge went on, so the order is: cancel, then delete.
 * (For a Shopify-billed store the cancel is uninstalling the app; the copy says so,
 * because `hasActiveSubscription` cannot be relied on to describe a Shopify charge.)
 *
 * `admin_account` — an operator account is refused outright. It is the account that
 * administers everyone else's data, and a self-service button is not how it should
 * ever go.
 */
import { NextResponse, type NextRequest } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getUserEntitlement } from '@/lib/subscription'
import { deleteAccount } from '@/lib/account/delete-account'

/** Codes the settings screen maps to its own translated copy. Never raw provider text. */
type Refusal =
  | 'not_signed_in'
  | 'confirmation_mismatch'
  | 'subscription_active'
  | 'admin_account'
  | 'storage_incomplete'
  | 'delete_failed'

const refuse = (error: Refusal, status: number) => NextResponse.json({ ok: false, error }, { status })

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return refuse('not_signed_in', 401)

  // The confirmation is the merchant's own email address, typed. It proves the
  // click was deliberate and that the person at the keyboard knows whose account
  // this is — which a one-click button in a dashboard someone left open does not.
  let typed = ''
  try {
    const body = (await request.json()) as { confirm?: unknown }
    typed = typeof body.confirm === 'string' ? body.confirm : ''
  } catch {
    return refuse('confirmation_mismatch', 400)
  }
  const expected = (user.email ?? '').trim().toLowerCase()
  if (!expected || typed.trim().toLowerCase() !== expected) return refuse('confirmation_mismatch', 400)

  const admin = createAdminClient()
  const entitlement = await getUserEntitlement(user.id, admin)
  if (entitlement.isAdmin) return refuse('admin_account', 403)
  if (entitlement.hasActiveSubscription) return refuse('subscription_active', 409)

  const result = await deleteAccount(admin, user.id)
  if (!result.ok) {
    // `storage_incomplete` is its own answer because it is the one the merchant can
    // act on: nothing was deleted, and trying again is the right next step.
    return refuse(result.error === 'storage_incomplete' ? 'storage_incomplete' : 'delete_failed', 500)
  }

  // The user row is gone, so the session's refresh token can no longer be redeemed;
  // signing out clears the cookies as well, so the browser does not keep showing a
  // dashboard for an account that no longer exists.
  await supabase.auth.signOut()

  console.log('[account-delete] done', { projects: result.projects, filesRemoved: result.filesRemoved })
  return NextResponse.json({ ok: true })
}
