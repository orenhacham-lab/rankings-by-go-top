import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Terms of Use | Rankings by Go Top',
  description: 'Terms of use for Rankings by Go Top — the terms that govern your use of our service.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Terms of Use | Rankings by Go Top',
    description: 'Terms of use for Rankings by Go Top',
    url: 'https://www.gotopseo.com/en/terms',
    locale: 'en_US',
  },
}

export default function EnglishTermsPage() {
  return (
    <LegalDoc
      locale="en"
      breadcrumbs={[{ label: 'Terms of Use', href: '/en/terms' }]}
      title="Terms of Use"
      subtitle="Rankings by Go Top"
    >
      <section>
        <h2>1. Introduction and Service Definition</h2>
        <p>
          Rankings by Go Top (the &ldquo;Service&rdquo; or the &ldquo;Platform&rdquo;) is a SaaS service
          operated by Go Top Digital Marketing &amp; Advertising Ltd. (the &ldquo;Company&rdquo;). The
          Service allows customers to track keyword rankings on Google search, monitor Google Maps
          visibility, measure visibility on AI engines such as ChatGPT, Gemini and Perplexity, conduct
          keyword research, and generate professional reports.
        </p>
      </section>

      <section>
        <h2>2. Acceptance of Terms</h2>
        <p>
          By registering for, accessing or using the Service, you confirm that you have read, understood
          and agree to be bound by these Terms of Use. If you do not agree to any of these terms, you
          must not register for or use the Service.
        </p>
      </section>

      <section>
        <h2>3. Account Registration and User Responsibility</h2>
        <p>
          When creating an account, you agree to provide accurate, complete and current information.
          You are responsible for maintaining the confidentiality of your account credentials and for
          all activity that takes place under your account. You must notify the Company without delay
          of any suspected unauthorized access.
        </p>
      </section>

      <section>
        <h2>4. Trial Period</h2>
        <p>
          The Service offers a 7-day trial period for new customers. The limits applicable during the
          trial are displayed in the Service and may change from time to time at the Company&rsquo;s
          discretion. Continued use of the Service after the end of the trial period requires an active
          paid subscription.
        </p>
      </section>

      <section>
        <h2>5. Subscriptions and Payments</h2>
        <p>
          The Service operates on a monthly subscription model. As long as the subscription remains
          active, billing renews automatically each month according to the selected plan. Prices,
          plans and limits may change from time to time and updates will be reflected in the Service
          and on the pricing page.
        </p>
        <p className="mt-3">
          <strong>How you are billed depends on how your account was opened:</strong>
        </p>
        <ul>
          <li>
            <strong>Merchants who installed the app through Shopify</strong> (and any account whose
            billing authority is Shopify) are billed exclusively through Shopify App Pricing, as part
            of their Shopify invoice. These merchants are never directed to PayPal or to any other
            checkout outside Shopify, and we do not charge them through a second channel.
          </li>
          <li>
            <strong>Customers who signed up directly on our website</strong>, whose billing authority
            is not Shopify, pay through a third-party payment provider (PayPal).
          </li>
          <li>
            Connecting a Shopify store in order to publish content, by a customer who is already
            billed through the website, does not create double billing: an account is billed through
            one channel only at any given time.
          </li>
        </ul>
      </section>

      <section>
        <h2>6. Cancellation</h2>
        <p>
          You may cancel renewal of your subscription at any time through your account settings.
          Access to the Service will be retained until the end of the billing period that has already
          been paid. No retroactive cancellation of a period that has already been paid will be granted,
          except as required by applicable law.
        </p>
      </section>

      <section>
        <h2>7. Refunds</h2>
        <p>
          As a rule, subscription fees are non-refundable for a period that has already begun or been
          paid. The Company may, at its sole discretion or as required by law, grant a refund in
          exceptional circumstances. Refund requests should be submitted in writing to the
          Company&rsquo;s email address.
        </p>
      </section>

      <section>
        <h2>8. Usage Limits</h2>
        <p>
          Each plan includes limits as set out on the pricing page and in the account dashboard,
          including:
        </p>
        <ul>
          <li>Number of projects</li>
          <li>Number of keywords per project</li>
          <li>Monthly ranking scans</li>
          <li>Monthly AI visibility scans</li>
          <li>Keyword research usage</li>
          <li>Report generation</li>
        </ul>
        <p>
          Limits are displayed in the Service and may change in accordance with the plan and Company
          policy. Exceeding these limits may result in restricted usage or a requirement to upgrade
          the plan.
        </p>
      </section>

      <section>
        <h2>9. Third-Party Data and Services</h2>
        <p>
          The Service relies, or may rely, on data and services provided by third parties, including:
          Google, Google Ads API, Google Maps, various search providers, AI providers (ChatGPT, Gemini,
          Perplexity and others), payment providers (Shopify for accounts billed through Shopify,
          PayPal for customers billed through the website), and infrastructure and hosting providers
          (Supabase and others). Data obtained from third parties may be partial, estimated, delayed
          or unavailable, and its accuracy and availability are not within the Company&rsquo;s control.
        </p>
      </section>

      <section>
        <h2>10. Data Accuracy and No Warranty of Accuracy</h2>
        <p>
          The Company does not warrant the absolute accuracy of ranking data, search volumes,
          competition levels, CPC estimates, AI visibility results or reports. Data is provided
          &ldquo;AS-IS&rdquo; and there may be differences between Service results and manual checks
          or data from other sources.
        </p>
      </section>

      <section>
        <h2>11. No Guarantee of Business Results</h2>
        <p>
          The Company does not guarantee any business outcomes, including improvements in rankings,
          traffic, leads, sales, revenue or visibility on AI engines. The Service provides tracking
          and analytics tools only.
        </p>
      </section>

      <section>
        <h2>12. Service Availability</h2>
        <p>
          The Service is provided as-is and may be subject to outages, maintenance windows, planned
          or unplanned downtime, limitations of third-party APIs and issues at third-party providers.
          The Company will make commercially reasonable efforts to minimize service interruptions but
          does not guarantee continuous 100% availability.
        </p>
      </section>

      <section>
        <h2>13. Prohibited Use</h2>
        <p>The following actions are strictly prohibited:</p>
        <ul>
          <li>Damaging or attempting to disrupt the Service infrastructure</li>
          <li>Circumventing usage limits or security mechanisms</li>
          <li>Reverse engineering, decompiling or extracting source code</li>
          <li>Using the Service for unauthorized scraping</li>
          <li>Sharing access credentials with unauthorized parties</li>
          <li>Using the Service in violation of any applicable law</li>
        </ul>
      </section>

      <section>
        <h2>14. Intellectual Property</h2>
        <p>
          All rights in the Service, including its interface, design, source code, reports, logo and
          brand, belong to the Company. You may not copy, duplicate, distribute, sell or make any
          unauthorized use of the Service&rsquo;s content or components. Permitted use is limited to
          the subscriber&rsquo;s own needs in accordance with the purchased plan.
        </p>
      </section>

      <section>
        <h2>15. User Content</h2>
        <p>
          You are solely responsible for any content you enter into the Service, including domains,
          keywords, AI questions, client details and any other information. You confirm that you hold
          the necessary rights and permissions to use this content within the Service.
        </p>
      </section>

      {/* DRAFT, NEW SECTION (link network, lib/link-network) — wording for the owner's review before publishing. */}
      <section id="link-network">
        <h2>15A. Link Network (draft wording, under review)</h2>
        <p>
          The link network is an optional service in which the Service may place a link between the
          sites of customers who joined it, inside articles the Service writes for them. It is off by
          default and is not available for Shopify stores.
        </p>
        <ul>
          <li>
            <strong>Joining and consent.</strong> Each project joins separately, only by its owner, after
            explicitly accepting the network terms on screen. Consent works both ways: to an outgoing link
            in articles written for you, and to links to your site in articles written for other
            customers in the network. We keep who accepted, when, the wording accepted and the link type
            in force at the time.
          </li>
          <li>
            <strong>Closed scope.</strong> At most one outgoing link per article, inside a sentence already
            in the body of the article, on words already in it. The Service changes no words, adds no text
            and touches no other content on your site.
          </li>
          <li>
            <strong>Link type.</strong> The link type (regular or nofollow) is set for the whole network and
            shown on screen and when joining. A change of link type is shown on screen and applies to new
            links only.
          </li>
          <li>
            <strong>Placement rules.</strong> No link is placed between competitors or businesses in the same
            field, between sites of the same owner, or between sites that already link to each other; no
            reciprocal links are placed; the number of links is capped per article and per site each
            month; and a link is placed only where the page is relevant to the paragraph.
          </li>
          <li>
            <strong>Transparency and control.</strong> Every placement is logged and shown to both sides. A
            link added to your article is shown before the article is published and can be removed. Once
            published, the article is on your site and under your control.
          </li>
          <li>
            <strong>Leaving.</strong> You can leave the network at any time. Leaving stops new placements;
            links already published stay as they are unless you remove them from your site.
          </li>
          <li>
            <strong>Privacy.</strong> The Company does not publish a list of network members. The receiving
            side sees the address of the site that links to it and, once published, the page where the link
            appeared.
          </li>
          <li>
            <strong>No guaranteed results.</strong> The Company does not commit to a number of links, to a
            ranking improvement or to how search engines treat the links, and may pause or end the service.
            The site owner is responsible for the site&rsquo;s content and for following search engine
            guidelines.
          </li>
        </ul>
      </section>

      <section>
        <h2>16. Privacy</h2>
        <p>
          Use of the Service is also governed by the Company&rsquo;s Privacy Policy, which forms an
          integral part of these terms. Where a separate privacy policy is published on the website,
          it should be read together with these terms.
        </p>
      </section>

      <section>
        <h2>17. Limitation of Liability</h2>
        <p>
          Subject to applicable law, the Company shall not be liable for any indirect, consequential,
          special or punitive damages, including loss of profits, loss of data, business impact or
          reliance on Service data. The Company&rsquo;s aggregate liability, if any, shall not exceed
          the amounts actually paid by the user during the 12 months preceding the event giving rise
          to the claim.
        </p>
      </section>

      <section>
        <h2>18. Account Suspension or Termination</h2>
        <p>
          The Company may suspend or terminate a user account, temporarily or permanently, in case
          of a breach of these terms, non-payment, suspected misuse, attempts to harm the Service or
          any other reasonable cause. Upon termination, stored data may be deleted in accordance with
          Company policy and applicable law.
        </p>
      </section>

      <section>
        <h2>19. Changes to the Terms</h2>
        <p>
          The Company may update these terms from time to time. The updated version will be published
          on the website and will take effect upon publication. Continued use of the Service after
          the terms are updated constitutes acceptance of the updated terms.
        </p>
      </section>

      <section>
        <h2>20. Governing Law and Jurisdiction</h2>
        <p>
          These terms are governed by the laws of the State of Israel. Exclusive jurisdiction over
          any dispute arising from or related to these terms or the use of the Service lies with the
          competent courts in Israel.
        </p>
      </section>

      <section>
        <h2>21. Contact</h2>
        <p>For any question regarding these terms or the Service, please contact us:</p>
        <p className="mt-4">
          <strong>Go Top Digital Marketing &amp; Advertising Ltd.</strong>
          <br />
          Email:{' '}
          <a href="mailto:oren@gotop.co.il">
            oren@gotop.co.il
          </a>
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>
          This document is a business draft. We recommend having it reviewed by legal counsel before
          final use.
          <br />
          Last updated: May 2026
        </p>
      </section>
    </LegalDoc>
  )
}
