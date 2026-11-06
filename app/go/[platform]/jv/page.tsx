/**
 * The affiliate recruitment page for one marketplace — /go/<platform>/jv.
 *
 * WHY IT EXISTS, measured rather than assumed. All four JVZoo products were
 * released on 2026-11-04 and sold nothing. The sales page /go/jvzoo took no
 * traffic that day and the webhook took no delivery, and a search for the
 * product name in JVZoo's own Find Products returned "No products matching
 * your search were found" — their documented behaviour, which hides a new
 * product from affiliate search until it has ten or more sales. So the
 * marketplace cannot send us an affiliate until we have sold ten plans, and
 * until then every affiliate has to be recruited by hand.
 *
 * The one link the product's affiliate page offered them was the External JV
 * Page field, and it pointed at /en/affiliates — our own in-house 30/40
 * programme. That page answers a different question for a different reader:
 * it has no commission terms for this platform, no approval link and nothing
 * an affiliate could send. This page is the one that field should point at.
 *
 * WHAT AN AFFILIATE DECIDES WITH. They choose between products by what a
 * click is worth and how much work promoting it is, so the page leads with
 * the commission and the price, then hands over copy they can actually send.
 * Everything else is cut.
 *
 * TOP-LEVEL AND ENGLISH, for the reasons the sales page beside it is: `go`
 * is registered in ENGLISH_ONLY_SEGMENTS (lib/i18n/request-locale.ts), the
 * audience is a marketplace's international affiliates, and nothing here has
 * a Hebrew reader. It inherits that registration, so it adds no second
 * mechanism and needs no locale twin.
 *
 * noindex, like the sales page: it is a page for people who were sent to it,
 * and letting a crawler index it would put a recruitment page in the way of
 * the marketing pages we rank.
 *
 * NOTHING HERE PROMISES AN AFFILIATE A RESULT, and that is not only this
 * project's copy rule. An earnings figure on a recruitment page is a
 * statement about someone's income, and we have no sales to compute one
 * from. So the page states the commission rate the account is configured to
 * pay and the published price, which are terms, and never a per-click or
 * per-month figure, which would be a forecast.
 *
 * THE SWIPE COPY IS HELD TO THE PRODUCT'S REAL LIMITS, because an affiliate
 * sends it in our name: rank tracking is reported monthly, the AI check
 * covers ChatGPT, Gemini and Google AI, and no line promises a position.
 * Nothing mentions the free trial — the trial was deliberately removed from
 * this channel's offer, so copy that advertised it would advertise something
 * the checkout does not sell.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import {
  marketplaceAffiliateUrl,
  marketplaceCommission,
  marketplaceProvider,
} from '@/lib/marketplace/config'
import { PLAN_CATALOG, PLAN_CODES } from '@/lib/plans/catalog'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

/** What the affiliate is sending people to. Capabilities, at their limits. */
const WHAT_THE_BUYER_GETS: readonly string[] = [
  'Rank tracking on Google, reported every month.',
  'A check of whether ChatGPT, Gemini and Google AI mention the business.',
  'Technical fixes applied to the site, each one after the owner approves it.',
  'Articles written and published to the owner’s own site, on WordPress or Shopify.',
  'Google Business Profile posts and review monitoring, where the owner opts in.',
]

/** Who converts, so an affiliate can tell whether their list is the one. */
const WHO_IT_IS_FOR: readonly string[] = [
  'Owners of small service businesses with a site they never have time for.',
  'Agencies and freelancers who want the monthly SEO work done for a client.',
  'Shopify and WordPress store owners who need content published regularly.',
]

/**
 * Copy an affiliate can send as it stands. Held to the same truth limits as
 * every other page: capabilities, no positions promised, no numbers invented.
 */
const SWIPE: readonly { label: string; subject?: string; body: string }[] = [
  {
    label: 'Email 1 — the problem',
    subject: 'Your site is not the problem. Nobody looking after it is.',
    body: `Most small business sites are built once and then left alone.

Rankings drift, pages break, and nobody notices until the phone stops ringing. Not because the owner does not care, but because SEO is a monthly job and nobody has the month.

Go Top SEO does that monthly job. It tracks where your pages rank on Google and reports the movement every month, it checks whether ChatGPT, Gemini and Google AI mention your business, and it applies the technical fixes you approve rather than handing you a list.

It also writes and publishes articles to your own site, on WordPress or Shopify.

[YOUR LINK]`,
  },
  {
    label: 'Email 2 — the AI angle',
    subject: 'Does ChatGPT know your business exists?',
    body: `People ask an assistant before they ask a search engine now. If ChatGPT, Gemini or Google AI has nothing to say about your business, that is a question you cannot see the answer to.

Go Top SEO checks it for you, and keeps checking.

The same system tracks your Google rankings month by month, applies the technical fixes you approve, and publishes articles to your own site so there is something for an assistant to find.

[YOUR LINK]`,
  },
  {
    label: 'Email 3 — the close',
    subject: 'The monthly SEO work, done without you',
    body: `Short version of what Go Top SEO does every month, so you can decide:

- Tracks your rankings on Google and reports what moved.
- Checks whether ChatGPT, Gemini and Google AI mention you.
- Finds what is holding the site back and applies the fixes you approve.
- Writes and publishes articles to your own site.

One website or many, depending on the plan. It renews monthly and you cancel it yourself whenever you want.

[YOUR LINK]`,
  },
  {
    label: 'Short post — social or a newsletter blurb',
    body: `SEO is a monthly job and nobody has the month. Go Top SEO does it: tracks your Google rankings and reports the movement, checks whether ChatGPT, Gemini and Google AI mention your business, applies the technical fixes you approve, and publishes articles to your own site. [YOUR LINK]`,
  },
]

/**
 * What an affiliate may NOT do in our name. Published because it is cheaper
 * to say it here than to take it down later: a promise of a ranking or an
 * income made by someone promoting us is still a claim attached to this
 * product, and the platform's compliance reads it as ours.
 */
const RULES: readonly string[] = [
  'No promise of a ranking, a position or a timeframe: the product does the monthly work and no outcome is promised.',
  'No earnings or income claims, for the buyer or for other affiliates.',
  'No invented customer numbers, review scores or testimonials.',
  'No bidding on the Go Top SEO name or on our domain in paid search.',
  'No unsolicited bulk email, and no promotion to buyers outside the United States on this platform.',
  'No cookie stuffing, no self-referred purchases and no incentives for a signup.',
]

export default async function MarketplaceJvPage({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  const { platform } = await params
  const provider = marketplaceProvider(platform)
  if (!provider) notFound()

  const commission = marketplaceCommission(provider.slug)

  return (
    <main className="mx-auto max-w-3xl px-4 py-16">
      <h1 className="text-h2-mkt text-ink">Promote Go Top SEO on {provider.label}</h1>
      <p className="mt-4 text-lead-mkt text-body">
        A recurring SEO subscription for small business owners and the people who look after
        their sites. Monthly rank tracking, an AI visibility check, technical fixes and
        published articles, all in one plan.
      </p>

      {/* The terms first, because they are what the decision turns on. Shown
          only when the account is configured to pay them: see
          marketplaceCommission for why a rate is never hard-coded here. */}
      {commission ? (
        <p className="mt-6 text-copy text-ink" data-commission={provider.slug}>
          Commission: <strong>{commission.first}%</strong> on the first payment
          {commission.rebill !== null ? (
            <> and <strong>{commission.rebill}%</strong> on every renewal</>
          ) : null}
          . Every plan is a monthly subscription, so a customer you send keeps paying for as long
          as they stay.
        </p>
      ) : null}

      <section className="mt-10">
        <h2 className="text-section text-ink">The plans, and where to request approval</h2>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          {PLAN_CODES.map((code) => {
            const plan = PLAN_CATALOG[code]
            const affiliateUrl = marketplaceAffiliateUrl(provider.slug, code)
            return (
              <div key={code} className="rounded-card border border-line bg-surface p-5">
                <h3 className="text-section capitalize text-ink">{plan.displayNameKey}</h3>
                <p className="mt-1 text-metric text-ink">
                  ${plan.priceUSD}
                  <span className="text-copy text-muted"> / month</span>
                </p>
                <p className="mt-2 text-copy text-body">
                  {plan.maxProjects === 1 ? 'One website' : `${plan.maxProjects} websites`},{' '}
                  {plan.maxKeywordsPerProject} keywords, {plan.maxArticlesPerPeriodAccountWide}{' '}
                  articles a month.
                </p>
                {affiliateUrl ? (
                  <a
                    href={affiliateUrl}
                    className="mt-4 inline-block rounded-control bg-action px-4 py-2 text-copy text-action-ink"
                    rel="nofollow"
                  >
                    Request approval
                  </a>
                ) : (
                  <p className="mt-4 text-copy text-muted">Not open to affiliates yet</p>
                )}
              </div>
            )
          })}
        </div>
        <p className="mt-4 text-copy text-muted">
          {provider.label} issues your tracking link once your request is approved, and pays your
          commission on its own schedule under its own affiliate terms.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-section text-ink">What the buyer gets</h2>
        <ul className="mt-4 space-y-2">
          {WHAT_THE_BUYER_GETS.map((line) => (
            <li key={line} className="text-copy text-body">
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-section text-ink">Who it converts for</h2>
        <ul className="mt-4 space-y-2">
          {WHO_IT_IS_FOR.map((line) => (
            <li key={line} className="text-copy text-body">
              {line}
            </li>
          ))}
        </ul>
      </section>

      <section className="mt-12">
        <h2 className="text-section text-ink">Copy you can send</h2>
        <p className="mt-2 text-copy text-muted">
          Use these as they are or rewrite them. Replace [YOUR LINK] with the tracking link{' '}
          {provider.label} gives you, and read the rules below before you send anything.
        </p>
        {SWIPE.map((item) => (
          <article key={item.label} className="mt-6 rounded-card border border-line bg-surface p-5">
            <h3 className="text-copy text-ink">{item.label}</h3>
            {item.subject ? (
              <p className="mt-2 text-copy text-body">
                Subject: {item.subject}
              </p>
            ) : null}
            <pre className="mt-3 whitespace-pre-wrap text-copy text-body">{item.body}</pre>
          </article>
        ))}
      </section>

      <section className="mt-12">
        <h2 className="text-section text-ink">What you may not say in our name</h2>
        <ul className="mt-4 space-y-2">
          {RULES.map((line) => (
            <li key={line} className="text-copy text-body">
              {line}
            </li>
          ))}
        </ul>
        <p className="mt-4 text-copy text-muted">
          Promotion that breaks these costs the commission on the affected sales and the approval.
        </p>
      </section>

      <section className="mt-12">
        <h2 className="text-section text-ink">The page you are sending people to</h2>
        <p className="mt-2 text-copy text-body">
          Your link lands on our {provider.label} sales page, which carries the buy buttons and
          nothing else. Read it before you promote it.
        </p>
        <nav className="mt-4 flex flex-wrap gap-4 text-copy text-action">
          <Link href={`/go/${provider.slug}`}>Sales page</Link>
          <Link href="/en/terms">Account terms</Link>
          <Link href="/en/privacy">Privacy</Link>
        </nav>
      </section>

      <p className="mt-12 text-copy text-muted">
        Questions, a co-promotion or a review account:{' '}
        <a className="text-action underline" href="mailto:support@gotopseo.com">
          support@gotopseo.com
        </a>
        .
      </p>
    </main>
  )
}
