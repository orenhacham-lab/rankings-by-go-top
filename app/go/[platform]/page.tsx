/**
 * The sales page an external marketplace reviews and its affiliates send
 * traffic to — /go/<platform>.
 *
 * A PAGE OF ITS OWN, NOT THE HOME PAGE. Every one of these platforms requires
 * that their buy button is the only way to pay on the page, and that the page
 * carries no links away from it except terms, privacy, disclaimer and
 * support. Our home page is the opposite of that by design: a free check, a
 * blog, a WhatsApp button, a 7-day trial and no buy button at all. So the
 * marketplace gets its own page, and the funnel we actually sell through is
 * left exactly as it is.
 *
 * noindex, AND THAT IS NOT A DETAIL. These pages are thin, nearly identical
 * to each other, and sit on the same domain as the marketing pages we rank.
 * Letting a crawler index three near-copies of a sales page is how a site
 * competes with itself, which is a poor advertisement for an SEO product.
 *
 * TOP-LEVEL, NOT UNDER app/(public), and for the same reason app/shopify is:
 * everything in that group is a Hebrew document by the route contract
 * (lib/i18n/request-locale.ts), and this page is an English one. The segment
 * is registered in ENGLISH_ONLY_SEGMENTS there, so the contract carries the
 * fact outward instead of this page inventing a second mechanism for it.
 *
 * ENGLISH ONLY, for the reason the Shopify surfaces are
 * (lib/i18n/shopify-english-journey.qa.ts): the audience is a marketplace's
 * international affiliates and their buyers, who arrived from a
 * latin-script, left-to-right listing. A Hebrew right-to-left document would
 * be a worse answer than one they can read.
 *
 * NOTHING IS LIVE UNTIL IT IS CONFIGURED. A platform with no configured buy
 * URL for a plan shows that plan as unavailable rather than linking to our
 * own checkout — which the platforms refuse, and which would take the sale
 * away from the affiliate who sent the visitor. An unregistered platform is
 * a 404.
 *
 * NO CLAIMS WE CANNOT STAND BEHIND. The copy below says what the product
 * does and nothing about anybody's results: no customer counts, no
 * percentages, no income implied. That is this project's standing rule for
 * marketing copy, and on a marketplace page it is also what a compliance
 * review is looking for.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  marketplaceBuyUrl,
  marketplacePixelSrc,
  marketplaceProvider,
} from '@/lib/marketplace/config'
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/plans/catalog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/** What the product does. Capabilities only, stated at their real limits. */
const WHAT_IT_DOES: readonly string[] = [
  'Tracks where your pages rank on Google and reports the movement every month.',
  'Checks whether AI assistants mention your business — ChatGPT, Gemini and Google AI.',
  'Finds what is holding the site back and fixes the technical items it can fix itself.',
  'Writes and publishes articles to your own site, on WordPress or Shopify.',
  'Works on one website or on many, depending on the plan.',
]

export default async function MarketplaceSalesPage({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  const { platform } = await params
  const provider = marketplaceProvider(platform)
  if (!provider) notFound()

  const pixel = marketplacePixelSrc(provider.slug)

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-h2-mkt text-ink">
        SEO that keeps working after you close the tab
      </h1>
      <p className="mt-4 text-lead-mkt text-body">
        Go Top SEO watches your rankings, tells you what is wrong, fixes what it can and
        publishes the content your site is missing. You pick the website and the plan; the
        system does the monthly work.
      </p>

      <ul className="mt-8 space-y-2">
        {WHAT_IT_DOES.map((line) => (
          <li key={line} className="text-copy text-body">
            {line}
          </li>
        ))}
      </ul>

      <section className="mt-12 grid gap-4 sm:grid-cols-2">
        {PLAN_CODES.map((code) => {
          const plan = PLAN_CATALOG[code]
          const buyUrl = marketplaceBuyUrl(provider.slug, code)
          return (
            <div key={code} className="rounded-card border border-line bg-surface p-5">
              <h2 className="text-section capitalize text-ink">{plan.displayNameKey}</h2>
              <p className="mt-1 text-metric text-ink">${plan.priceUSD}
                <span className="text-copy text-muted"> / month</span>
              </p>
              <p className="mt-2 text-copy text-body">
                {plan.maxProjects === 1 ? 'One website' : `${plan.maxProjects} websites`},{' '}
                {plan.maxKeywordsPerProject} keywords, {plan.maxArticlesPerPeriodAccountWide} articles a month.
              </p>
              {buyUrl ? (
                <a
                  href={buyUrl}
                  className="mt-4 inline-block rounded-control bg-action px-4 py-2 text-copy text-action-ink"
                  rel="nofollow"
                >
                  Buy
                </a>
              ) : (
                <p className="mt-4 text-copy text-muted">Currently unavailable</p>
              )}
            </div>
          )
        })}
      </section>

      {/* The same two facts the pricing page states for a card payment
          (lib/i18n/public/pricing-en.ts taxNote.USD), with this platform in
          the seller's place: who the counterparty is, and that the price here
          is before tax. A page that shows a price and leaves the tax unsaid
          is the thing the standing rule forbids. */}
      <p className="mt-6 text-copy text-muted">
        The seller of record for this purchase is {provider.label}, which calculates tax by
        your billing address and shows the final amount before you pay. The prices above do
        not include it.
      </p>

      <p className="mt-10 text-copy text-body">
        After payment you will be sent back here to open your account and the plan becomes
        active on it.
      </p>

      {/* Only the links these platforms allow: terms, privacy, refunds. */}
      <nav className="mt-10 flex flex-wrap gap-4 text-copy text-action">
        <Link href="/en/terms">Terms</Link>
        <Link href="/en/privacy">Privacy</Link>
        <Link href="/en/refund-policy">Refunds</Link>
      </nav>

      {/* Rendered only once the legal thread has passed the platform's exact
          wording; see MarketplaceProvider.requiredDisclaimer. */}
      {provider.requiredDisclaimer ? (
        <p className="mt-8 text-caption text-muted">{provider.requiredDisclaimer}</p>
      ) : null}

      {/* The platform's own tracking pixel, without which the affiliate who
          sent this visitor cannot see the sale. Absolute https only. */}
      {pixel ? <script async src={pixel} /> : null}
    </main>
  )
}
