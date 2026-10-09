import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { isFreshSignup } from '@/lib/notifications/signup-email'
import { reportSignupConversion } from '@/lib/analytics/meta-capi'

/**
 * POST /api/analytics/signup-conversion — report a new account to Meta.
 *
 * WHY THE BROWSER HAS TO ASK FOR THIS. The conversion needs two things the
 * server cannot get on its own. The identity comes from the session, so that
 * part is safe. The visitor's consent does not: the banner's decision lives in
 * localStorage (lib/consent/client-store.ts), and `consent_events` keeps only
 * a digest of the IP, so no server-side lookup can tell us what this person
 * chose. Legal review (2026-10-09) made consent the basis in all three
 * regions, with no regional split, so the only honest design is the one where
 * the page that holds the decision hands it over.
 *
 * WHAT IS TRUSTED FROM THE BODY, AND WHAT IS NOT. The body contributes exactly
 * one boolean, and only in the restrictive direction: `marketing: true` is
 * what allows the send. Everything identifying — who this is, their email,
 * whether the account is new — comes from the verified session, never from the
 * request. A body that is missing, malformed, or anything other than literal
 * `true` counts as a refusal, because under GDPR Art. 4(11) silence is not
 * consent and an unanswered banner is a no.
 *
 * NOT THE FREE CHECK'S CONSENT. The marketing box on the free check
 * (MARKETING_CONSENT_VERSION, 'marketing-email-v1') is consent to receive
 * email from us. It is deliberately not read here: consent that was not
 * specific to this purpose is not consent for it.
 *
 * WITHDRAWAL STOPS THE NEXT ONE, NOT THE LAST ONE. Turning marketing off means
 * nothing further is sent. An event already delivered cannot be recalled by
 * us, and the privacy policy says so rather than promising otherwise.
 */
export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Only a brand new account is a signup conversion. Any session can reach
  // this route, and without the gate one account would be reported on every
  // visit to the dashboard.
  if (!isFreshSignup(user)) return NextResponse.json({ reported: false, reason: 'not_fresh' })

  if (!(await marketingConsented(request))) {
    return NextResponse.json({ reported: false, reason: 'no_consent' })
  }

  await reportSignupConversion({
    userId: user.id,
    email: user.email,
    createdAt: user.created_at,
    sourceUrl: new URL(request.url).origin + '/signup',
  })
  return NextResponse.json({ reported: true })
}

/** Literal `true` and nothing else. A throw, a wrong shape, or absence is a no. */
async function marketingConsented(request: Request): Promise<boolean> {
  try {
    const body: unknown = await request.json()
    return typeof body === 'object' && body !== null && (body as { marketing?: unknown }).marketing === true
  } catch {
    return false
  }
}
