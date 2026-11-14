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
 * AND IT RENDERS NOTHING FROM THE QUERY STRING. Digistore24 append their own
 * GET parameters to this URL (order_id, product_id, email and more), and
 * every one of them is a value a stranger can type into a browser. Rendering
 * an order id would publish whatever was supplied; rendering an email would
 * echo an address chosen by whoever opened the link; keying anything off
 * `product_id` would let a visitor pick which plan the page describes. So no
 * parameter reaches this page's text, and the words are the same for every
 * visitor.
 *
 * ONE THING IS NOW READ FROM IT, AND ONLY AFTER IT IS PROVEN. Digistore24
 * sign the parameters they append, with a key separate from the webhook's, so
 * a set that verifies against it came from the platform rather than from a
 * visitor. `thankyouActivation` verifies that signature, uses the order id
 * ONLY as a lookup key against a receipt our own webhook recorded from a
 * signed delivery, and answers with that receipt's claim token or with
 * nothing. The page turns a successful answer into one button and still
 * renders no supplied value. A set that does not verify is treated exactly as
 * no parameters at all, which is why the page is unchanged for the visitor
 * who simply opened the URL.
 *
 * WHY IT IS WORTH READING AT ALL. Delivery is an email with a claim link, and
 * a buyer who does not open it signs up at the front door and lands on a free
 * trial while their paid receipt sits unclaimed. Digistore24's own reviewer
 * did that on 14.11.2026 and reported the product as broken. The button is
 * the fix, and the email stays exactly as it was for everyone who does open
 * it.
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
import {
  MARKETPLACE_CLAIM_PATH,
  MARKETPLACE_SUPPORT_EMAIL,
  marketplacePolicyUrl,
  marketplaceProvider,
} from '@/lib/marketplace/config'
import { createAdminClient } from '@/lib/supabase/admin'
import { thankyouActivation } from '@/lib/marketplace/thankyou-handoff'

export const dynamic = 'force-dynamic'

export const metadata: Metadata = {
  robots: { index: false, follow: false },
}

export default async function MarketplaceThanksPage({
  params,
  searchParams,
}: {
  params: Promise<{ platform: string }>
  searchParams: Promise<Record<string, string | string[] | undefined>>
}) {
  const { platform } = await params
  const provider = marketplaceProvider(platform)
  if (!provider) notFound()
  const policyUrl = marketplacePolicyUrl(provider.slug)
  // Only ever 'claimable' or 'none'. The reason behind a 'none' is not shown
  // to the visitor and not rendered: it names a receipt's state, and the page
  // may not confirm to a stranger that an order id exists.
  const activation = await thankyouActivation(createAdminClient, provider, await searchParams)

  return (
    <main className="mx-auto max-w-2xl px-4 py-16">
      <h1 className="text-display text-ink">Thank you for your purchase</h1>

      <p className="mt-6 text-copy text-body">
        Your Go Top SEO plan is ready to be activated. Everything you bought is software you
        use in your browser, so there is nothing to download and nothing to install.
      </p>

      {/* THE ONE-CLICK ROUTE, rendered only for a verified redirect that
          matches an unspent receipt. It is an ordinary link to /claim with
          that receipt's own token — the same capability the email carries,
          spent once by the same locked database function — so a buyer who
          clicks it and a buyer who opens the email end up in exactly the same
          place, and nothing here activates anything by itself. */}
      {activation.kind === 'claimable' ? (
        <div className="mt-8" data-thankyou-activation={provider.slug}>
          <Link
            className="inline-block rounded-lg bg-ink px-6 py-3 text-body font-semibold text-white"
            href={`${MARKETPLACE_CLAIM_PATH}?order=${encodeURIComponent(activation.claimToken)}`}
          >
            Activate my plan now
          </Link>
          <p className="mt-3 text-copy text-muted">
            Sign in, or create your account if you do not have one yet, and your plan is
            activated the moment you do. You do not need to wait for the email.
          </p>
        </div>
      ) : null}

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
        <a className="underline" href={`mailto:${MARKETPLACE_SUPPORT_EMAIL}`}>
          {MARKETPLACE_SUPPORT_EMAIL}
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
          {/* THEIR OWN SENTENCE, verbatim. The paragraph above says the same
              thing at greater length and more precisely, and that is exactly
              why this one is also here: a platform's approval checklist asks
              whether a NAMED reference is included, and an accurate
              paraphrase is not that reference. Printed only where the
              platform publishes a required form of words. */}
          {provider.statementReferenceSentence ? (
            <p
              className="mt-4 text-copy text-body"
              data-statement-reference={provider.slug}
            >
              {provider.statementReferenceSentence}
            </p>
          ) : null}
          {/* THE STRING ON THE STATEMENT, not just the platform's name.
              ClickBank require this on the thank-you page by name, and for a
              reason the sentence above only half answers: what the buyer
              actually sees is CLKBANK*COM, which is not the word
              "ClickBank". Printed only where the platform publishes the
              string, never guessed, because a wrong descriptor sends a buyer
              to their bank with the wrong name. */}
          {provider.billingDescriptor ? (
            <p className="mt-4 text-copy text-body" data-billing-descriptor={provider.slug}>
              On the statement itself it appears as{' '}
              <span dir="ltr">{provider.billingDescriptor}</span> rather than as{' '}
              {provider.label} or Go Top SEO.
            </p>
          ) : null}
          {/* ORDER SUPPORT, where the platform publishes a route for it. A
              refund or an unrecognised charge belongs to the party holding
              the money, and ClickBank's rules state the line verbatim. */}
          {provider.orderSupportUrl ? (
            <p className="mt-4 text-copy text-body">
              For Order Support, please contact {provider.label}{' '}
              <a className="underline" href={provider.orderSupportUrl} rel="nofollow">
                HERE
              </a>
            </p>
          ) : null}
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
        <a className="underline" href={`mailto:${MARKETPLACE_SUPPORT_EMAIL}`}>
          {MARKETPLACE_SUPPORT_EMAIL}
        </a>{' '}
        and a person will answer. Go Top SEO is operated by GO TOP DIGITAL MARKETING AND
        ADVERTISING LTD, Harakasim 24/2, Ramat Gan 5235524, Israel.
      </p>

      {/* The same line in the words ClickBank dictate for it, so a reviewer
          reading for their own format finds it, and the paragraph above still
          says it in ours. */}
      <p className="mt-4 text-copy text-muted" data-seller-contact={provider.slug}>
        For Product Support, please contact the seller{' '}
        <a className="underline" href={`mailto:${MARKETPLACE_SUPPORT_EMAIL}`} dir="ltr">
          HERE
        </a>
      </p>

      {/* The platform's mandated disclaimer, on the same terms as on the
          sales page: rendered only once the legal thread has passed the exact
          wording, and attributed, because text a platform dictates is not our
          own statement. See MarketplaceProvider.requiredDisclaimer. */}
      {provider.requiredDisclaimer ? (
        <section className="mt-8" data-required-disclaimer={provider.slug}>
          <h2 className="text-copy text-body">Notice required by {provider.label}:</h2>
          <p className="mt-2 text-copy text-muted">{provider.requiredDisclaimer}</p>
        </section>
      ) : null}
    </main>
  )
}
