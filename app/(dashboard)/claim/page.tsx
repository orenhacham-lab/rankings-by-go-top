/**
 * Where a buyer who paid on an external marketplace turns that purchase into
 * their own account's plan — /claim?order=<token>.
 *
 * WHY IT LIVES IN THE DASHBOARD GROUP. The claim attaches the order to the
 * SIGNED-IN account, so the visitor has to have one. This group's layout
 * already requires a session and sends a visitor without one through the
 * normal front door, which means the buyer signs up or signs in exactly as
 * anybody else does and comes back here — no account is ever created from a
 * payment callback, and no password is ever mailed to anyone.
 *
 * THE TOKEN IS A CAPABILITY, NOT A CREDENTIAL (lib/marketplace/claim.ts). It
 * says a receipt is claimable, not who may claim it; the database function
 * attaches it to whoever is signed in, once, under a row lock.
 *
 * WHAT THIS SCREEN DOES NOT SAY. 'unavailable' is four different facts — no
 * such link, already spent, refunded, cancelled — and it distinguishes none
 * of them: the page cannot know which one belongs to the person reading it,
 * and confirming that a token exists is itself an answer to someone guessing.
 *
 * NO robots METADATA OF ITS OWN. A claim URL is nobody's search result and it
 * carries a token, but the noindex for it belongs to the group's layout, which
 * already sets it for every dashboard page; a page that states its own robots
 * is a page that can quietly disagree with that (lib/site-links/gsc-import).
 */
import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { getServerPublicLocale } from '@/lib/i18n/server-locale'
import { MARKETPLACE_CLAIM_COPY } from '@/lib/i18n/public/marketplace-claim'
import { claimMarketplaceOrder } from '@/lib/marketplace/claim'

export const dynamic = 'force-dynamic'

export default async function ClaimPage({
  searchParams,
}: {
  searchParams: Promise<{ order?: string | string[] }>
}) {
  const { order } = await searchParams
  // A repeated query parameter arrives as an array; only one token can be
  // meant, and picking "the first of several" silently is how a page ends up
  // acting on a value the visitor cannot see.
  const token = typeof order === 'string' ? order : null

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  // The group's layout normally settles this; the redirect is here so the
  // page is correct on its own and never calls the claim with no account.
  if (!user) redirect('/login')

  const locale = await getServerPublicLocale()
  const copy = MARKETPLACE_CLAIM_COPY[locale]

  const message = await (async () => {
    if (!token) return copy.missingToken
    const outcome = await claimMarketplaceOrder(createAdminClient(), user.id, token)
    switch (outcome.kind) {
      case 'claimed':
        return copy.claimed
      case 'already_claimed':
        return copy.alreadyClaimed
      case 'unavailable':
        return copy.unavailable
      case 'needs_operator':
        // The buyer is told their money is safe and nothing more; the reason
        // is a code for us, not an explanation for them.
        console.error('[marketplace-claim] needs an operator', { why: outcome.why })
        return copy.needsOperator
      case 'failed':
        console.error('[marketplace-claim] claim failed', { message: outcome.message })
        return copy.failed
    }
  })()

  return (
    <main className="mx-auto max-w-xl px-4 py-16">
      <h1 className="text-2xl font-semibold">{copy.title}</h1>
      <p className="mt-4 text-base leading-relaxed">{message}</p>
      <Link href="/dashboard" className="mt-8 inline-block underline">
        {copy.toDashboard}
      </Link>
    </main>
  )
}
