import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Cancellation and Refund Policy | Go Top SEO',
  description: 'How to cancel a Go Top SEO subscription and when a refund is given.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Cancellation and Refund Policy | Go Top SEO',
    description: 'Cancellation and refund policy for Go Top SEO',
    url: 'https://www.gotopseo.com/en/refund-policy',
    locale: 'en_US',
  },
}

export default function EnglishRefundPolicyPage() {
  return (
    <LegalDoc
      locale="en"
      breadcrumbs={[{ label: 'Cancellation and Refund Policy', href: '/en/refund-policy' }]}
      title="Cancellation and Refund Policy"
      subtitle="How to cancel a subscription and when a refund is given"
    >
      <section>
        <h2>1. Monthly subscription and renewal</h2>
        <p>
          Go Top SEO is a service for businesses and website owners, sold as a monthly subscription.
          It renews automatically every month until you cancel it. Each plan&rsquo;s price is shown on
          the pricing page and on the &ldquo;Billing&rdquo; screen in your account.
        </p>
      </section>

      <section>
        <h2>2. Trial</h2>
        <p>
          New customers get a 7-day trial. You are not charged during the trial, and nothing is
          charged automatically when it ends. Billing starts only after you choose a plan and pay
          for it.
        </p>
      </section>

      <section>
        <h2>3. Cancellation</h2>
        <ul>
          <li>You can cancel renewal at any time from the &ldquo;Billing&rdquo; screen in your account.</li>
          <li>After you cancel, you will not be charged again.</li>
          <li>You keep access to your plan until the end of the period you have already paid for. The subscription then ends.</li>
        </ul>
      </section>

      <section>
        <h2>4. Refunds</h2>
        <p>
          Subscription payments are not refunded, even if you cancel before the end of the period
          and even if you did not use the Service.
        </p>
        <p className="mt-3">
          The only exception is where the law requires a refund. For example, a consumer who bought
          the Service mainly for personal use, rather than for a business, may have a right to cancel
          under the Israeli Consumer Protection Law or under the consumer protection law of the
          country where they live. In that case we will honor that right to the extent and on the
          terms the law sets.
        </p>
      </section>

      <section>
        <h2>5. How to request a cancellation under the law</h2>
        <p>
          Email <a href="mailto:oren@gotop.co.il">oren@gotop.co.il</a> from your account&rsquo;s email
          address, with the charge date and the reason for the request. We answer every request in
          writing. An approved refund goes back to the payment method you used. How long the credit
          takes depends on the payment provider and your card issuer.
        </p>
      </section>

      <section>
        <h2>6. Accounts billed through Shopify</h2>
        <p>
          If your account is billed through Shopify (for example, you installed the app from the
          Shopify App Store), billing and cancellation are handled through Shopify. The refund rules
          in section 4 apply to those charges too.
        </p>
      </section>

      <section>
        <h2>7. Contact</h2>
        <p>
          <strong>Go Top Digital Marketing &amp; Advertising Ltd.</strong>
          <br />
          Email: <a href="mailto:oren@gotop.co.il">oren@gotop.co.il</a>
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>
          Last updated: October 3, 2026
        </p>
      </section>
    </LegalDoc>
  )
}
