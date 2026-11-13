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
import { beaconSuppressedForRequest, consentRequiredForRequest } from '@/lib/consent/eprivacy-territory'
import { koreaOwnSaleBlockedForRequest } from '@/lib/billing/korea-sale'
import {
  MARKETPLACE_SUPPORT_EMAIL,
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
  const requestHeaders = await headers()
  const consentRequired = consentRequiredForRequest(requestHeaders)
  // Korea is a third state, not a stricter gate: see
  // BEACON_SUPPRESSED_COUNTRIES in lib/consent/eprivacy-territory.ts. Consent
  // would answer 제15조 and still leave the transfer to an independent
  // controller abroad without the 별도의 동의 제28조의8 제1항 제1호 requires, so
  // neither the beacon nor the badge is rendered there at all.
  const beaconSuppressed = beaconSuppressedForRequest(requestHeaders)
  // KOREA, ON THE ROUTE WHERE WE ARE THE SELLER. provider.sellerOfRecord is
  // read from each platform's own agreement: ClickBank and Digistore24 are
  // resellers and carry the buyer's tax themselves, so a Korean sale through
  // them is theirs to make. JVZoo is NOT a reseller — its Terms s.5.2 put the
  // purchase contract between the customer and the vendor, and s.7 charges a
  // 5% network commission rather than a reseller's margin — so a Korean sale
  // through it is OUR sale, and it carries the same VAT Act art. 53-2 and
  // 전자상거래법 art. 13 duties as the PayPal path. Same rule, same flag:
  // lib/billing/korea-sale.ts.
  const koreaOwnSaleBlocked = !provider.sellerOfRecord && koreaOwnSaleBlockedForRequest(requestHeaders)

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
              {/* THE THREE FIGURES THE REVIEWER ASKED FOR, ON THE PLAN ITSELF.
                  ClickBank rejected the second submission on 11.11.2026 with
                  one sentence: the pitch page must clearly state the initial
                  price, the rebill price and the rebill schedule. All three
                  were already on the page, but the schedule sat in a
                  paragraph far below that says "the price above", so beside a
                  plan there was a monthly rate and nothing else. This line
                  carries all three next to the button that charges them, and
                  it is built from the same `plan.priceUSD` the grid and the
                  catalogue use, so a price can never be stated twice
                  differently. The paragraph below stays: it answers the number
                  of payments and where the plan is cancelled, which this line
                  does not. */}
              {/* "CANCEL AT ANY TIME" IS THERE BECAUSE A REVIEWER ASKED FOR
                  THOSE WORDS. Digistore24's rejection of 2026-11-12 says
                  "please provide full billing info on each of the price
                  points, should say 'cancel at any time'". It is a true
                  statement about every plan on every platform — there is no
                  minimum term anywhere — so it is printed for all of them
                  rather than hidden behind a provider flag. The sentence
                  below it is the paragraph's job and not this line's: this
                  line answers what is charged, when, and that it can be
                  stopped. */}
              <p className="mt-1 text-copy text-body">
                ${plan.priceUSD} today, then ${plan.priceUSD} every month until you cancel. Cancel
                at any time.
              </p>
              {/* THE GUARANTEE BESIDE THE PRICE, not only in the section
                  below, because the reviewer asked for it "directly on the
                  sales page" and a buyer reads the plan card. The number is
                  provider.returnGuaranteeDays and nothing else, so it cannot
                  drift from the window configured inside the platform. */}
              {provider.returnGuaranteeDays ? (
                <p className="mt-1 text-copy text-body">
                  {provider.returnGuaranteeDays}-day money-back guarantee.
                </p>
              ) : null}
              <p className="mt-2 text-copy text-body">
                {plan.maxProjects === 1 ? 'One website' : `${plan.maxProjects} websites`},{' '}
                {plan.maxKeywordsPerProject} keywords, {plan.maxArticlesPerPeriodAccountWide} articles a month.
              </p>
              {koreaOwnSaleBlocked ? (
                /* Not "unavailable in your country", which would be false — the
                   site and the trial are open. What is true is that this plan
                   is not sold here yet, and that nothing is charged. */
                <p className="mt-4 text-copy text-muted" data-korea-no-sale>
                  This plan is not sold in Korea at the moment. Nothing will be charged. The free
                  trial is open, and you can write to us at contact@gotopseo.com.
                </p>
              ) : buyUrl ? (
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

      {/* DELIVERY METHOD AND SPEED, which ClickBank's pitch-page rules require
          by name and which this page used to leave to be inferred from one
          line near the bottom. Their rules also ask, for a recurring product,
          WHEN the recurring delivery happens; the honest answer is that there
          is no second delivery, because access continues. What is written
          here is the real mechanism: the platform's callback records the
          order and lib/marketplace/claim-email.ts mails the link that opens
          the account. */}
      <section className="mt-12">
        <h2 className="text-section text-ink">How you get it, and how fast</h2>
        <p className="mt-2 text-copy text-body">
          This is an online service, not a file. Within a few minutes of your payment we email the
          address you paid with, with a link that opens your Go Top SEO account on the plan you
          bought. You open it, set a password, add your website, and the monthly work starts on it.
          Nothing is shipped and there is nothing to download.
        </p>
        <p className="mt-2 text-copy text-body">
          Because it is a monthly subscription there is no second delivery to wait for: the same
          account stays open and the work continues every month for as long as the subscription is
          paid. If the email has not arrived, look in the spam folder and then write to the product
          support address in the footer, with the order number from your receipt.
        </p>
      </section>

      {/* FILE FORMAT AND WHAT IS NEEDED TO USE THE PRODUCT, also required by
          name. A service has no file format, and saying so plainly is the
          answer: no download, no plugin, no operating system of its own. The
          connections are named because a buyer who expects publishing to
          their own site needs to know what it attaches to. */}
      <section className="mt-10">
        <h2 className="text-section text-ink">What you need to use it</h2>
        <p className="mt-2 text-copy text-body">
          A web browser. The service runs at www.gotopseo.com and there is no software to install, no
          plugin to buy and no particular operating system: it is used on a computer, a tablet or a
          phone. To publish articles and apply fixes to your own site automatically it connects to
          WordPress or Shopify, and to read your search data it connects to Google Search Console.
          Without those connections you still get the tracking, the AI checks and the reports, and
          you apply the changes yourself.
        </p>
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

      {/* THE REBILL SCHEDULE IN FULL. ClickBank's rules ask for "all of the
          details of the rebill schedule, including the number of times a
          customer is billed and how frequently", and "renews every month
          until you cancel it" answers the second half only. The number of
          payments is not a number here, and the page says so rather than
          leaving the buyer to assume a term that ends. */}
      <p className="mt-4 text-copy text-muted">
        The plan is a monthly subscription and renews every month until you cancel it: you are
        billed the price above once when you buy it and then the same amount every month, on the
        same day of the month, with no fixed number of payments, no minimum term and no end date.
        You cancel it at {provider.label}, where you bought it, and the plan stays active until the
        end of the month you have already paid for.
      </p>

      <p className="mt-10 text-copy text-body">
        After payment you will be sent back here to open your account and the plan becomes
        active on it.
      </p>

      {/* CANCELLING IS NOT RETURNING, which is the distinction buyers get
          wrong most often and the one ClickBank's return policy draws itself.
          It costs nothing to state and it is not a guarantee, so it does not
          touch the term their contract forbids us to contradict.

          AND NOTE WHAT IS ABSENT: our own no-refund term. For a reseller
          purchase the governing policy is theirs, section 6A of our refund
          policy says so, and their return policy — part of their Client
          Contract — forbids a seller to "make any guarantee that conflicts"
          with it. Restating ours here, or linking it as the policy for this
          purchase, would be that conflict on a published page. No period is
          quoted either: their Flexible Refunds feature sets the window per
          product, so the link is the answer and a number would be a term we
          had not read off the product. */}
      <p className="mt-4 text-copy text-muted">
        Cancelling stops the future charges; by itself it does not return money already paid. A
        return, where one is available, is handled by {provider.label} under its own return and
        cancellation policy, which is the policy that governs this purchase and is linked below.
      </p>

      {/* THE GUARANTEE IN FULL, AND ONLY WHERE THE CHANNEL ACTUALLY GIVES ONE.

          Digistore24 rejected all four products on 2026-11-12 asking for "an
          unconditional refund policy (minimum 60 days) directly on the sales
          page", and separately for the stated period to MATCH the return
          period configured on the product inside Digistore24. Both halves are
          answered by rendering provider.returnGuaranteeDays: there is one
          number, it is in lib/marketplace/config.ts beside the note that it
          must equal the platform setting, and a page cannot state a window
          the configuration does not hold.

          WHY THIS DOES NOT TOUCH OUR OWN POLICY. The guarantee is given by the
          seller of this purchase, and on this page that seller is the
          platform. Our own refund policy — no refund beyond what the law
          requires — governs a purchase made from us, which this is not, and
          section 6A of it already says the reseller's policy governs a
          reseller purchase. So this section names the giver in its first
          words rather than promising in our own voice something a buyer could
          read as site-wide. A platform with no guarantee renders nothing at
          all, which keeps ClickBank's contractual ban on publishing a
          conflicting guarantee untouched.

          AND IT SITS AFTER THE CANCELLATION SENTENCE DELIBERATELY. That
          sentence says cancelling does not return money already paid, which
          is true and is about cancelling; left alone on a page that now has a
          guarantee it would read as a denial of one. Putting the guarantee
          directly beneath it is what makes the pair say the real thing: stop
          the charges here, ask for the money back there. */}
      {provider.returnGuaranteeDays ? (
        <section className="mt-10" data-return-guarantee={provider.slug}>
          <h2 className="text-section text-ink">
            {provider.returnGuaranteeDays}-day money-back guarantee
          </h2>
          <p className="mt-2 text-copy text-body">
            {provider.label} is the seller for this purchase and gives you an unconditional{' '}
            {provider.returnGuaranteeDays}-day money-back guarantee. Ask {provider.label} for a
            refund within {provider.returnGuaranteeDays} days of your payment, for any reason or
            for none, and you get your money back. You do not have to explain why, and you do not
            have to cancel first. The guarantee is given and paid by {provider.label} under its own
            return policy, which is the policy that governs this purchase.
          </p>
        </section>
      ) : null}

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

      {/* THE SELLER CONTACT BLOCK, in the footer and in the words the
          platform dictates. ClickBank's rules say a seller may display
          contact information "only" in this format and that both lines must
          be present: ours, and theirs. Which is the point of the second one —
          a refund or an unrecognised charge belongs to the party holding the
          money, and sending that buyer to our mailbox wastes their time and
          fails the review. The second line is rendered from
          provider.orderSupportUrl, so a platform that publishes no such route
          prints one line rather than a borrowed one. */}
      <section className="mt-10 border-t border-line pt-6" data-seller-contact={provider.slug}>
        <p className="text-copy text-muted">
          For Product Support, please contact the seller{' '}
          <a href={`mailto:${MARKETPLACE_SUPPORT_EMAIL}`} dir="ltr">
            HERE
          </a>
        </p>
        {provider.orderSupportUrl ? (
          <p className="mt-2 text-copy text-muted">
            For Order Support, please contact {provider.label}{' '}
            <a href={provider.orderSupportUrl} rel="nofollow">
              HERE
            </a>
          </p>
        ) : null}
        {/* WHICH IS WHICH, said plainly. Without this the two lines above are
            two addresses and a buyer picks one: they write to us for a refund
            we cannot process, on a purchase whose seller is the platform. */}
        {provider.orderSupportUrl ? (
          <p className="mt-2 text-copy text-muted">
            Questions about the product, your site or what the system does come to us. Anything
            about the order itself — the payment, the invoice, cancelling the subscription or
            asking for a return — goes to {provider.label}, which is the seller for this purchase.
          </p>
        ) : null}
      </section>

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
      {(beaconSuppressed ? [] : pixelUrls).map((url) =>
        consentRequired ? (
          <MarketplacePixel key={url} src={url} alt={`${provider.label} tracking`} />
        ) : (
          <MarketplacePixelUnconditional key={url} src={url} alt={`${provider.label} tracking`} />
        ),
      )}

    </main>
  )
}
