import Link from 'next/link'
import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Partner Program Agreement | Go Top SEO',
  description:
    'The terms that govern participation in the Go Top SEO partner program — commissions, attribution, payouts and the duties of a partner.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Partner Program Agreement | Go Top SEO',
    description: 'The terms that govern participation in the Go Top SEO partner program',
    url: 'https://www.gotopseo.com/en/affiliate-terms',
    locale: 'en_US',
  },
}

export default function EnglishAffiliateTermsPage() {
  return (
    <LegalDoc
      locale="en"
      breadcrumbs={[{ label: 'Partner Program Agreement', href: '/en/affiliate-terms' }]}
      title="Partner Program Agreement"
      subtitle="Go Top SEO"
    >
      <section>
        <h2>1. The parties and what this agreement is</h2>
        <p>
          This agreement governs participation in the Go Top SEO partner program (the
          &ldquo;Program&rdquo;). It is made between GO TOP MARKETING GRUO LTD (company number
          517274346) (the &ldquo;Company&rdquo;, &ldquo;we&rdquo;, &ldquo;us&rdquo;) and the person or
          entity whose application to the Program we approve (the &ldquo;Partner&rdquo;,
          &ldquo;you&rdquo;). It takes effect on the date we notify you that your application is
          approved, and it applies to every referral you make from that date on.
        </p>
        <p>
          This agreement is in addition to our{' '}
          <Link href="/en/terms">Terms of Use</Link> and our{' '}
          <Link href="/en/privacy">Privacy Policy</Link>, and it does not change either of them. If
          you also use the Service as a customer, your customer relationship is governed by those
          documents and nothing here affects it.
        </p>
      </section>

      <section>
        <h2>2. Definitions</h2>
        <ul>
          <li>
            <strong>Referral Link</strong> — the personal link or code we issue to you after approval,
            which identifies you as the source of a visit.
          </li>
          <li>
            <strong>Referral</strong> — a visit that reached our site through your Referral Link, and
            the signup that followed it on the way from that link.
          </li>
          <li>
            <strong>Referred Customer</strong> — a new customer who opens an account with us in a
            Referral we attribute to you under section 4.
          </li>
          <li>
            <strong>Qualifying Payment</strong> — a subscription payment that a Referred Customer has
            actually made to us, that we have actually received, and that has not been refunded,
            reversed or charged back.
          </li>
          <li>
            <strong>Commission</strong> — the amount payable to you on a Qualifying Payment under
            section 5.
          </li>
        </ul>
      </section>

      <section>
        <h2>3. Application and approval</h2>
        <p>
          Participation requires an application and our approval. We review every application
          individually and may approve or decline it at our discretion, and we are not required to give
          reasons. You must be at least 18 years old and legally able to enter into this agreement.
        </p>
        <p>
          You must give accurate and current details in your application, including the email address of
          the account you will use, the website, list or channel through which you intend to promote the
          Service, and your payout details. If any of those details change, you must update them.
          Approval obtained with inaccurate details may be revoked.
        </p>
        <p>
          We do not accept partners in countries or territories we are not permitted to serve, as set out
          in our Terms of Use.
        </p>
      </section>

      <section>
        <h2>4. The Referral Link and how a referral is attributed</h2>
        <p>
          Attribution is by the last click on your Referral Link on the way to signing up: where a
          visitor has reached us through more than one Referral Link, the account is attributed to the
          most recent one.
        </p>
        <p>
          Your code travels in the Referral Link itself. We set no cookie for the Partner Program and
          store nothing on the visitor&rsquo;s device, so what the visitor chooses in our cookie notice
          does not affect your attribution either way. What it does mean is that a visitor who leaves
          and comes back later without your link, on the same device or another, may not be attributed
          to you. We do not guarantee that every visit through your Referral Link will result in
          attribution, and we are not liable for a referral we were unable to record. If we ever extend
          crediting to a visit that returns later, which would require storing something, we will tell
          partners in writing before it starts and say what is stored.
        </p>
        <p>
          A click on your link is counted, and what is counted is a number: we add one to your daily total,
          and that is the whole record of that click. We do not keep the visitor&rsquo;s IP address, their
          browser, the site they came from or any identifier, so the figure you see in your dashboard is a
          count and not a list of visitors. The attribution itself is done from the code carried in the page
          address, read once at the moment the account is opened.
        </p>
        <p>
          Our records are what we act on. If you believe a referral was recorded incorrectly, write to us
          within 60 days of the account being opened and we will review the record and tell you what we
          find.
        </p>
      </section>

      <section>
        <h2>5. Commission</h2>
        <p>
          You earn <strong>30%</strong> of each Qualifying Payment of a Referred Customer, for as long as
          that customer&rsquo;s subscription remains paid. Once you have ten or more Referred Customers
          with an active paid subscription at the same time, the rate on Qualifying Payments from that
          point on is <strong>40%</strong>. A change in rate is not retroactive.
        </p>
        <p>
          Commission is calculated on the amount we actually received, excluding value added tax or any
          other tax, and after any discount, credit or coupon applied to that payment. Commission is
          calculated in the currency the customer paid in and paid in that currency or in the currency of
          your payout method, converted at the rate our payment provider applies on the day of payment.
        </p>
        <p>
          No commission is payable on a trial, on a payment that was never received, on a payment made by
          you or by an account within the meaning of section 8, or on a payment under a plan or agreement
          we negotiated directly and separately with that customer.
        </p>
        <p>
          <strong>A customer billed through Shopify is recorded by hand.</strong> Shopify tells the app that a
          plan is active rather than that a charge was taken, so we have no automatic payment event to
          calculate from. Such a referral is marked as one on our side and its commission is recorded by hand
          against the Shopify charge reference &mdash; at the same rate, with the same holding period and the
          same approval. If you referred such a customer and time has passed with no commission recorded,
          write to us.
        </p>
      </section>

      <section>
        <h2>6. Approval, holding period and payout</h2>
        <p>
          Every Commission is recorded as pending and becomes payable only after we approve it. We hold an
          approved Commission for <strong>30 days</strong> from the Qualifying Payment it relates to, which
          matches the period in which that customer may still obtain a refund under our{' '}
          <Link href="/en/refund-policy">Cancellation and Refund Policy</Link>.
        </p>
        <p>
          We pay out once your approved and held balance reaches <strong>USD 100</strong>, or{' '}
          <strong>ILS 350</strong> where you are paid in shekels. Below that, the balance carries forward.
          Payout is by PayPal, by Wise, by bank transfer, or as credit against your own subscription,
          according to what you chose and what is available in your country. Fees charged by the payout
          provider are borne by you unless we have agreed otherwise in writing.
        </p>
        <p>
          A balance we are unable to pay because your payout details are missing, wrong or rejected is
          held for you. We will try to reach you at the email address on your partner account. Nothing in
          this section lets us keep a Commission you have earned.
        </p>
      </section>

      <section>
        <h2>7. Refunds, chargebacks and recovery of commission</h2>
        <p>
          If a payment that a Commission was calculated on is later refunded, reversed or charged back, or
          if we find that it was obtained by fraud or in breach of this agreement, that Commission is
          cancelled. Where it has already been paid to you, we may set it off against your future
          Commissions; where there are none, you will repay it within 30 days of our written demand.
        </p>
      </section>

      <section>
        <h2>8. No self-referral</h2>
        <p>
          The Program pays for customers you bring to us, not for your own purchases. You may buy and use
          the Service, but you may not use your own Referral Link to do so. No Commission is payable, and
          we may cancel one already recorded, on a subscription of:
        </p>
        <ul>
          <li>your own account, or any project or website in your own account;</li>
          <li>an account you opened in another name, or under another email address, for yourself;</li>
          <li>an account of a member of your household or of your family;</li>
          <li>an account you control, administer or have access to, whether or not it is in your name;</li>
          <li>
            an entity you own, control, direct or are employed by, and an account opened on its behalf.
          </li>
        </ul>
        <p>
          Offering, in substance, a discount to the person buying through your Referral Link in order to
          share your Commission with them is a breach of this section where the buyer is a person listed
          above. We may cancel the Commissions concerned, close your partner account and keep any amount
          already recovered from you. This does not affect Commissions properly earned on genuine
          referrals.
        </p>
      </section>

      <section>
        <h2>9. You must say that you are paid</h2>
        <p>
          Wherever you promote the Service, you must disclose clearly, in plain language and before or
          together with the content itself, that you receive a commission. The disclosure must be easy to
          notice without looking for it: not in a profile only, not behind a link, not at the bottom of a
          long page, and not in words a reader would not understand. In a video or a story, say it as well
          as writing it.
        </p>
        <p>
          This is a legal duty in the places our customers are, and it is yours as much as it is ours:
        </p>
        <ul>
          <li>
            <strong>United States</strong> — the Federal Trade Commission&rsquo;s Guides Concerning the Use
            of Endorsements and Testimonials in Advertising (16 CFR Part 255, as revised in 2023) treat a
            commission as a material connection that must be disclosed clearly and conspicuously, every
            time, in or before the content.
          </li>
          <li>
            <strong>European Union</strong> — commercial communication must be identifiable as such under
            the Unfair Commercial Practices Directive, and in Spain also under article 20 of Law 34/2002
            (LSSI), which requires a commercial communication and the person on whose behalf it is made to
            be clearly identifiable.
          </li>
          <li>
            <strong>Brazil</strong> — article 36 of the Consumer Code (Lei 8.078/1990) requires advertising
            to be published so that a consumer identifies it, easily and immediately, as advertising; the
            CONAR guide for advertising by digital influencers asks for a visible marker such as #publi.
          </li>
          <li>
            <strong>Israel</strong> — there is no separate statute on undisclosed advertising online;
            promoting a product for payment without saying so is treated under the deception provisions of
            the Consumer Protection Law, 1981, and the Consumer Protection and Fair Trade Authority has
            been requiring disclosure from both the promoter and the advertiser.
          </li>
        </ul>
        <p>
          We may ask you to correct or remove content that does not carry a proper disclosure, and you must
          do so promptly. We monitor the Program and may suspend or terminate your participation over a
          disclosure failure, and we may withhold Commissions arising from the content concerned.
        </p>
      </section>

      <section>
        <h2>10. How you may not promote the Service</h2>
        <p>You may not:</p>
        <ul>
          <li>
            state or imply any result, ranking, position or revenue we do not promise ourselves, or give a
            guarantee on our behalf;
          </li>
          <li>
            describe the Service inaccurately, use a price, plan, trial or offer that is not ours, or
            present a review, rating or testimonial that is not genuine;
          </li>
          <li>
            run paid search or paid social advertising on our name, our brand, our domain or a misspelling
            of them, or bid on them as keywords, without our written permission;
          </li>
          <li>
            register or use a domain, subdomain, social account, app or page name that contains our name or
            brand or a misspelling of it, or that a reader could take for us;
          </li>
          <li>
            send unsolicited email, messages or comments, post to forums, comment sections or review sites
            in a way that breaks their rules, or promote the Service through automated or incentivised
            traffic;
          </li>
          <li>
            place your Referral Link through link schemes, paid links, private blog networks, hidden text
            or any other practice that breaches Google&rsquo;s spam policies;
          </li>
          <li>copy our pages, our text or our design, or present our content as your own;</li>
          <li>
            promote the Service alongside content that is unlawful, hateful, sexual, violent, or aimed at
            children.
          </li>
        </ul>
      </section>

      <section>
        <h2>11. Use of our name and brand</h2>
        <p>
          For as long as this agreement is in force we grant you a limited, non-exclusive, revocable right
          to use our name, our logo and the screenshots and descriptions we publish, for the sole purpose
          of promoting the Service. You may not alter the logo, present it as your own, or use it in a way
          that suggests we endorse you, employ you or are responsible for your content. The right ends when
          this agreement ends, and you must then stop using our brand and remove your Referral Links.
        </p>
      </section>

      <section>
        <h2>12. You are independent</h2>
        <p>
          You act as an independent contractor. This agreement does not create an employment relationship,
          an agency, a legal partnership or a joint venture, and you may not represent us, make a
          commitment in our name, open an account on a customer&rsquo;s behalf, negotiate a price, give a
          service undertaking or handle a customer&rsquo;s support or billing. You bear your own costs and
          your own taxes.
        </p>
      </section>

      <section>
        <h2>13. Tax and invoicing</h2>
        <p>
          Commission is a payment for your services and the tax on it is yours. You are responsible for
          reporting and paying every tax, levy and contribution that applies to you.
        </p>
        <p>
          If you are in Israel, we pay against a lawful tax invoice issued to the Company, and we are
          required to withhold tax at source from the payment at the rate the law sets, unless you give us
          a valid certificate of exemption from withholding and a certificate of proper bookkeeping, both
          in force at the time of payment. Where we withhold, we pay the amount withheld to the Tax
          Authority on your account and the invoice is still issued for the full amount.
        </p>
        <p>
          If you are outside Israel, you are responsible for your own tax reporting where you live. We may
          ask you for the tax details or declarations we need before paying, and we will withhold where the
          law requires us to.
        </p>
      </section>

      <section>
        <h2>14. Data protection</h2>
        <p>
          We process your partner details — the details in your application, your payout details and the
          record of your referrals and Commissions — in order to run the Program and to pay you, and we
          keep them for as long as the law requires us to keep accounting records. When you apply we also
          record the IP address the application came from, for fraud detection and rate limiting and for
          nothing else; <strong>a rejected application is deleted in full after 12 months, and in every
          other case the IP address is deleted after 12 months</strong>. Your referral may carry a flag
          asking for human review before a commission is approved, and such a flag disqualifies nothing by
          itself. What we do with them, and
          the providers we use for the payout, is set out in our{' '}
          <Link href="/en/privacy">Privacy Policy</Link>.
        </p>
        <p>
          You do not receive the personal data of the customers you refer. We show you the number of
          referrals, the state of each subscription for the purpose of your Commission, and the amounts; we
          do not give you a customer&rsquo;s name, email address, website or any other identifying detail,
          and you may not ask a customer to pass you ours.
        </p>
        <p>
          Where you promote the Service to a list of your own, that list is yours and you are responsible
          for it: you must have your own lawful basis and your own consents for it, and you may not send us
          another person&rsquo;s personal data. Each of us is an independent controller of the data it holds;
          neither of us processes personal data on the other&rsquo;s behalf under this agreement.
        </p>
      </section>

      <section>
        <h2>15. Confidentiality</h2>
        <p>
          Figures we give you about the Program that are not published — conversion data, customer numbers,
          revenue, rates we agreed with you individually — are confidential, and you may not publish them or
          pass them on while this agreement is in force or after it ends.
        </p>
      </section>

      <section>
        <h2>16. No promise of earnings</h2>
        <p>
          We do not promise you any income, any number of referrals or any level of conversion, and nothing
          we publish about the Program is a forecast of what you will earn. Participation is at your own
          commercial risk.
        </p>
      </section>

      <section>
        <h2>17. Liability</h2>
        <p>
          We are not liable to you for lost profit, lost opportunity, loss of data or any indirect or
          consequential loss. Our total liability to you under this agreement, for any cause, is limited to
          the Commissions we paid you in the 12 months before the event. Nothing in this section limits
          liability that cannot be limited by law — including, where you are an individual acting outside a
          trade or profession, your rights under the mandatory consumer law of your country of residence,
          and in Brazil the rights given by the Consumer Code, which cannot be waived.
        </p>
      </section>

      <section>
        <h2>18. Indemnity</h2>
        <p>
          You will indemnify us for any damage, loss, fine or expense, including reasonable legal costs,
          caused to us by the way you promoted the Service, by content you published, by a breach of this
          agreement, or by a claim that your promotion infringed a third party&rsquo;s rights or broke the
          law. We will tell you of such a claim without delay and let you take part in its defence.
        </p>
      </section>

      <section>
        <h2>19. Term, suspension and termination</h2>
        <p>
          Either of us may end this agreement at any time by written notice, with no need for a reason and
          with no notice period. We may also suspend your Referral Link or hold a Commission while we look
          into a suspected breach, and we will tell you that we have done so.
        </p>
        <p>
          While you are suspended, and after this agreement ends, <strong>the link you published keeps leading
          to our site and clicks on it keep being counted</strong>: the link is out in the world, in a post or
          a video that is not ours to change, and a visitor who clicks it should not meet an error. What stops
          is entitlement &mdash; an account opened after that earns you nothing, even if it came through your
          link. If you want the link to stop working, remove it from wherever you published it.
        </p>
        <p>
          When this agreement ends in the ordinary way no further
          Commission accrues, but Commissions you have already earned and that have not been cancelled under
          section 7 or section 8 are still paid: we will pay them at the next payout run after the holding
          period ends, and the minimum payout in section 6 does not apply to that final payment.
        </p>
        <p>
          Where we end this agreement because you breached section 8, section 9 or section 10, or because of
          fraud, we may cancel the Commissions arising from the conduct concerned and withhold payment of
          them.
        </p>
      </section>

      <section>
        <h2>20. Changes to the Program and to this agreement</h2>
        <p>
          We may change the commission rate, the way a referral is attributed, the holding period, the minimum payout
          or any other term of the Program. We will give you notice by email to the address on your partner
          account at least 14 days before the change takes effect. A change is not retroactive: a Commission
          already earned is calculated under the terms in force when the Qualifying Payment was made. If you
          do not accept a change, you may end this agreement before it takes effect; continuing to use your
          Referral Link after that date is acceptance of it.
        </p>
      </section>

      <section>
        <h2>21. Assignment</h2>
        <p>
          You may not transfer this agreement, your partner account or your Referral Link to anyone else
          without our written consent. We may transfer this agreement as part of a transfer of our business,
          and your rights under it will not be reduced by the transfer.
        </p>
      </section>

      <section>
        <h2>22. Governing law and forum</h2>
        <p>
          This agreement is governed by the laws of the State of Israel, and the competent courts of Tel
          Aviv-Jaffa have jurisdiction over it. Where you are an individual acting outside a trade or
          profession, this does not take away a right you have to the protection of the mandatory law of
          your country of residence or to bring a claim in the courts of the place where you live — in
          Brazil, article 101 of the Consumer Code; in the European Union and the United Kingdom, the
          consumer rules of their own law.
        </p>
      </section>

      <section>
        <h2>23. Language</h2>
        <p>
          We publish this agreement in Hebrew, English, Spanish and Portuguese. The version governing your
          participation is the one in the language in which you accepted it. We prepare each version to say
          the same thing; where a translation nevertheless differs from the version you accepted, the version
          you accepted prevails.
        </p>
      </section>

      <section>
        <h2>24. Miscellaneous</h2>
        <p>
          If a provision of this agreement is found to be unenforceable, the rest remains in force. Our not
          enforcing a provision on one occasion is not a waiver of it. This agreement, together with the
          Terms of Use and the Privacy Policy, is the whole of what was agreed between us about the Program,
          and it replaces anything said before it.
        </p>
        <p>
          Questions about the Program, or a notice under this agreement:{' '}
          <a href="mailto:oren@gotop.co.il">oren@gotop.co.il</a>.
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>Last updated: 9 October 2026</p>
      </section>
    </LegalDoc>
  )
}
