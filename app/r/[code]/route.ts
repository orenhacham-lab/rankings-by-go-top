/**
 * GET /r/<code> — a partner's link.
 *
 * It does exactly two things: add one to that partner's counter for today, and
 * send the visitor to the site with the code on the URL so the signup form can
 * read it.
 *
 * WHAT IS RECORDED: a number. `affiliate_count_click` increments one row per
 * partner per day and there is no other write — no IP, no user agent, no
 * referrer, no cookie, no identifier of any kind. That is not an oversight: the
 * privacy policy promises in four languages that a partner link stores nothing
 * on the visitor's device and keeps no record of the visitor, and a counter is
 * the only shape of "clicks" that keeps the promise.
 *
 * AN UNKNOWN CODE lands on the home page with no code attached, exactly like a
 * rejected one and a pending one — the answer never says whether a code exists,
 * because a published link is guessable and a partner's existence is their
 * business, not a visitor's.
 *
 * WHERE IT LANDS is chosen from a closed list (lib/affiliate/link.ts). `?to=`
 * selects a KEY, never a path and never a URL: a marketing link is published and
 * anyone can edit its query, so an open `?to=` would be an open redirect on our
 * own domain.
 *
 * A SUSPENDED partner's link still resolves and is still counted. The link is
 * out in the world on somebody's blog and must keep working for the visitor;
 * what suspension stops is earning (lib/affiliate/commissions.ts refuses a
 * commission for a partner who is not approved).
 */
import { NextResponse } from 'next/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { normalizeReferralCode } from '@/lib/affiliate/referral'
import { affiliateDestination, affiliateRedirectPath, AFFILIATE_DESTINATION_PARAM } from '@/lib/affiliate/link'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: Promise<{ code: string }> }) {
  const { code: raw } = await params
  const requested = new URL(request.url).searchParams.get(AFFILIATE_DESTINATION_PARAM)
  const code = normalizeReferralCode(raw)
  const origin = new URL(request.url).origin

  // A visitor is never left staring at an error because our bookkeeping failed:
  // every path below ends in a redirect to a page on this site.
  const land = (path: string) => NextResponse.redirect(new URL(path, origin), { status: 302 })
  if (!code) return land(affiliateDestination(requested))

  try {
    const admin = createAdminClient()
    const { data, error } = await admin
      .from('affiliates')
      .select('id')
      .eq('code', code)
      .in('status', ['approved', 'suspended'])
      .maybeSingle()
    if (error || !data) return land(affiliateDestination(requested))

    // The counter is an INSERT ... ON CONFLICT DO UPDATE inside the database, so
    // two visitors clicking at the same moment both count. A read-then-write here
    // would lose one of them.
    const day = new Date().toISOString().slice(0, 10)
    const counted = await admin.rpc('affiliate_count_click', { p_affiliate_id: data.id, p_day: day })
    if (counted.error) console.error('[affiliate-link] click not counted:', counted.error.message)

    return land(affiliateRedirectPath(code, requested))
  } catch (err) {
    console.error('[affiliate-link] failed:', err instanceof Error ? err.name : 'unknown')
    return land(affiliateDestination(requested))
  }
}
