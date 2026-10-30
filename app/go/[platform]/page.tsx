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
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { MarketplacePixel } from '@/components/consent/MarketplacePixel'
import { MarketplacePixelUnconditional } from '@/components/consent/MarketplacePixelUnconditional'
import { consentRequiredForRequest } from '@/lib/consent/eprivacy-territory'
import {
  marketplaceBuyUrl,
  marketplacePixelUrl,
  marketplacePolicyUrl,
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
  'Finds what is holding the site back and applies the technical fixes you approve.',
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

  const policyUrl = marketplacePolicyUrl(provider.slug)
  // One beacon per plan the page actually offers, de-duplicated: a platform
  // whose pixel is per product (JVZoo) needs each listed product's own URL,
  // and a platform with one provider-wide URL still contributes exactly one.
  const pixelUrls = [
    ...new Set(
      PLAN_CODES.filter((code) => marketplaceBuyUrl(provider.slug, code))
        .map((code) => marketplacePixelUrl(provider.slug, code))
        .filter((url): url is string => url !== null),
    ),
  ]
  // WHERE the beacon may fire without being asked first, decided on the
  // server from the CDN's country header and nowhere else. A browser-side
  // guess here would write a cookie we could not recall whenever it guessed
  // wrong, and the whole point of this check is that the write is the thing
  // consent protects. See lib/consent/eprivacy-territory.ts for why the
  // beacon counts as storage at all.
  const consentRequired = consentRequiredForRequest(await headers())

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-h2-mkt text-ink">
        SEO that keeps working after you close the tab
      </h1>
      <p className="mt-4 text-lead-mkt text-body">
        Go Top SEO watches your rankings, tells you what is wrong, applies the fixes you
        approve and publishes the content your site is missing. You pick the website and the plan; the
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

      {/* Everything a buyer is owed before they are bound: who they are
          buying FROM, who charges them, that the price is before tax, whose
          terms govern the purchase as opposed to the account, that it renews,
          and where to stop it.
          "Seller of record" is a term of art a buyer may not know, so the
          sentence says what it means instead.

          WHICH SENTENCE IS PRINTED IS A LEGAL FACT, NOT A TEMPLATE CHOICE.
          Telling a buyer the platform is their seller when the platform's own
          vendor agreement makes us the seller is a misstatement about who
          they contracted with and who owes the tax on the sale, published on
          our own domain. So the wording follows provider.sellerOfRecord,
          which is read from each platform's agreement and nowhere else. */}
      {provider.sellerOfRecord ? (
        <p className="mt-6 text-copy text-muted">
          You buy this plan from {provider.label}, which is the seller for this purchase: it
          charges you, issues your invoice, calculates tax by your billing address and shows
          the final amount before you pay. The prices above are before tax. {provider.label}&rsquo;s
          own terms and return policy apply to this purchase; your Go Top SEO account is
          governed by our Terms and Privacy Policy.
        </p>
      ) : (
        /* NO INVOICE PROMISE HERE, AND NOTHING TAKES ITS PLACE.
           This branch used to add "and issues your invoice". JVZoo's Terms of
           Use s.5.3 allocate the merchant-of-record role per transaction flow,
           and where it is theirs they issue the tax document for that sale. We
           cannot read our own flow from here, so the sentence promised a
           document we may not be the one to issue. A hedge is worse than
           silence: "Go Top SEO or JVZoo issues your invoice" answers one
           question twice, which is what CRD Art. 6 and UCPD Art. 6 judge as
           misleading however small the print. Who the SELLER is does not
           depend on the flow - Terms s.5.2 puts the purchase contract between
           the customer and the vendor and says JVZoo is not a party - so that
           half of the sentence stays exactly as it was. */
        <p className="mt-6 text-copy text-muted">
          Go Top SEO is the seller for this purchase. {provider.label} runs
          the checkout and takes the payment on our behalf; its own terms apply to the payment
          itself. The prices above are in US dollars and do not include VAT or any other tax due
          in your country. Your Go Top SEO account is governed by our Terms and Privacy Policy.
        </p>
      )}

      <p className="mt-4 text-copy text-muted">
        The plan is a monthly subscription and renews every month until you cancel it. You
        cancel it at {provider.label}, where you bought it, and the plan stays active until
        the end of the period you have paid for.
      </p>

      <p className="mt-10 text-copy text-body">
        After payment you will be sent back here to open your account and the plan becomes
        active on it.
      </p>

      {/* Only the links these platforms allow — and NOT our own refund
          policy. That page says Go Top SEO does not refund, which is true of a
          purchase made from us and is not this buyer's policy at all: their
          seller is the platform, so the platform's return policy governs what
          they just bought. Linking ours here would point them at the wrong
          document. The platform's own policy page is configured per provider
          and omitted rather than guessed. */}
      <nav className="mt-10 flex flex-wrap gap-4 text-copy text-action">
        <Link href="/en/terms">Account terms</Link>
        <Link href="/en/privacy">Privacy</Link>
        {policyUrl ? (
          <a href={policyUrl} rel="nofollow">{provider.label} terms and refunds</a>
        ) : null}
      </nav>

      {/* Rendered only once the legal thread has passed the platform's exact
          wording; see MarketplaceProvider.requiredDisclaimer.

          SET IN THE BODY SIZE ON PURPOSE. JVZoo's review states the condition
          in the same breath as the text: it "must be clear and conspicuous
          (no use of smaller font for the disclaimer)". text-caption is the
          smaller font, so using it would fail the review while appearing to
          satisfy it - the failure mode a reviewer is specifically looking
          for. Bottom of the page is allowed; small is not.

          THE ATTRIBUTION LINE IS LOAD-BEARING AND IS NOT DECORATION. JVZoo's
          block contains "JVZoo serves as the retailer for the products
          featured on this site", which contradicts s.11 of the agreement we
          signed and the seller paragraph above. The first fix tried was our
          own true sentence in full size above their block; legal rejected it,
          because CRD Art. 6(1)(b)-(c) and UCPD Art. 6 judge what the average
          consumer understands, and a page that answers "who am I buying
          from" twice misleads at any font size. Naming the speaker is what
          resolves it: their text is published unedited, as THEIR required
          notice rather than as our statement. So the heading may not be
          dropped while the block is rendered, and the block may not be
          edited to agree with us - both would put us back in front of the
          same article. */}
      {provider.requiredDisclaimer ? (
        <section className="mt-8" data-required-disclaimer={provider.slug}>
          <h2 className="text-copy text-body">Notice required by {provider.label}:</h2>
          <p className="mt-2 text-copy text-muted">{provider.requiredDisclaimer}</p>
        </section>
      ) : null}

      {/* THE PLATFORM'S TRACKING PIXEL, BEHIND THE CONSENT GATE.

          This page carried no pixel at all, and the reasoning held: an
          affiliate platform's conversion pixel is a marketing tag by this
          project's own classification (lib/consent/categories.ts), so it may
          not fire before a prior affirmative act, and this page is read by
          buyers in the EU and the UK. The purchase also happens on the
          platform's own checkout, so the affiliate's credit rides the click
          id in the buy link and the platform's server-side postback.

          JVZoo's compliance review does not accept that and makes the pixel a
          condition of listing. So it is rendered — never unconditionally. The
          component shows it only once the marketing category is granted and
          removes it on withdrawal, and a platform with no configured URL
          still renders nothing. If the review then reports the pixel missing,
          the answer is a note to compliance, not a tag that fires before the
          visitor has been asked. */}
      {pixelUrls.map((url) =>
        consentRequired ? (
          <MarketplacePixel key={url} src={url} alt={`${provider.label} tracking`} />
        ) : (
          <MarketplacePixelUnconditional key={url} src={url} alt={`${provider.label} tracking`} />
        ),
      )}
    </main>
  )
}
