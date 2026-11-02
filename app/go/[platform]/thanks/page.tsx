/**
 * Where a marketplace sends the buyer after they have paid —
 * /go/<platform>/thanks.
 *
 * WHY IT EXISTS AT ALL, rather than letting the platform show its own
 * confirmation. Digistore24 review the vendor's thank-you page together with
 * the product, and their own guidance asks for four things on it: what the
 * buyer just bought and in what form, what happens next, who took the money,
 * and how to reach support. Their stated reason for the last two is
 * chargebacks: a buyer who cannot tell who debited their card disputes the
 * charge. All four are things we should be saying anyway, because our own
 * delivery is an email with an activation link and a buyer who does not know
 * that is a buyer who thinks nothing arrived.
 *
 * THIS PAGE IS NOT A RECEIPT, AND IT MUST NEVER READ AS ONE. Its URL is
 * public and anybody may open it, so it cannot assert that a payment
 * happened — it says what happens AFTER one, in the second person, which is
 * true for the buyer who was redirected here and makes no false claim to
 * anyone else.
 *
 * AND IT READS NOTHING FROM THE QUERY STRING. Digistore24 append their own
 * GET parameters to this URL (order_id, product_id, email and more), and
 * every one of them is a value a stranger can type into a browser. Rendering
 * an order id would publish whatever was supplied; rendering an email would
 * echo an address chosen by whoever opened the link; keying anything off
 * `product_id` would let a visitor pick which plan the page describes. The
 * only trustworthy statement of what was bought is the order our webhook
 * recorded from a signed delivery, and the buyer reaches that through the
 * claim link in their email. So this page is the same for every visitor.
 *
 * noindex, for the reason the sales page is: a thin near-duplicate per
 * platform on a domain whose ranking is the product.
 *
 * ENGLISH ONLY, like the sales page it follows: /go is registered in
 * ENGLISH_ONLY_SEGMENTS (lib/i18n/request-locale.ts) and the audience is a
 * marketplace's international buyers.
 */
import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { MARKETPLACE_CLAIM_PATH, marketplacePolicyUrl, marketplaceProvider } from '@/lib/marketplace/config'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function MarketplaceThanksPage({
  params,
}: {
  params: Promise<{ platform: string }>
}) {
  const { platform } = await params
  const provider = marketplaceProvider(platform)
  if (!provider) notFound()
  const policyUrl = marketplacePolicyUrl(provider.slug)

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-display text-ink">Thank you for your purchase</h1>

      <p className="mt-6 text-copy text-body">
        Your Go Top SEO plan is ready to be activated. Everything you bought is software you
        use in your browser, so there is nothing to download and nothing to install.
      </p>

      <h2 className="mt-10 text-title text-ink">What happens next</h2>
      <ol className="mt-4 list-decimal space-y-3 pl-6 text-copy text-body">
        <li>
          We have sent an activation link to the email address you used at checkout. It is the
          only way to attach this purchase to an account, so nobody else can claim it.
        </li>
        <li>
          Open that link and sign in, or create your account if you do not have one yet. Your
          plan is activated the moment you do.
        </li>
        <li>
          Add the website you want worked on, and the first rank check and site review run from
          there.
        </li>
      </ol>

      <p className="mt-6 text-copy text-muted">
        If the email has not arrived within a few minutes, check the spam folder first, then
        write to us at{' '}
        <a className="underline" href="mailto:support@gotopseo.com">
          support@gotopseo.com
        </a>{' '}
        and we will send the link again. You can also open{' '}
        <Link className="underline" href={MARKETPLACE_CLAIM_PATH}>
          the activation page
        </Link>{' '}
        directly if you already have the link.
      </p>

      {/* WHO TOOK THE MONEY, which is the sentence their guidance is really
          about: the name on the buyer's statement is the platform's, not
          ours, and a buyer who does not recognise it disputes the charge. It
          is stated for a seller-of-record platform because there it is also
          who they contracted with; where WE are the seller the sentence would
          be false, so it is not printed at all rather than adapted. */}
      {provider.sellerOfRecord ? (
        <>
          <h2 className="mt-10 text-title text-ink">Your payment and your receipt</h2>
          <p className="mt-4 text-copy text-body">
            The debiting is performed by {provider.label}, which is the seller for this
            purchase. {provider.label} charges you, issues your invoice and is the name that
            appears on your card or bank statement. Your receipt and your invoice come from
            them, and any refund or cancellation of the payment is handled by them under their
            own terms.
          </p>
          {policyUrl ? (
            <p className="mt-4 text-copy text-muted">
              <a className="underline" href={policyUrl} rel="noopener noreferrer" target="_blank">
                {provider.label}&rsquo;s terms and return policy
              </a>{' '}
              apply to this purchase. Your Go Top SEO account is governed by our own Terms and
              Privacy Policy.
            </p>
          ) : null}
        </>
      ) : null}

      <h2 className="mt-10 text-title text-ink">If you need help</h2>
      <p className="mt-4 text-copy text-body">
        Write to{' '}
        <a className="underline" href="mailto:support@gotopseo.com">
          support@gotopseo.com
        </a>{' '}
        and a person will answer. Go Top SEO is operated by GO TOP DIGITAL MARKETING AND
        ADVERTISING LTD, Harakasim 24/2, Ramat Gan 5235524, Israel.
      </p>
    </main>
  )
}
