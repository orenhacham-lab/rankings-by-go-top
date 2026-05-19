import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'

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
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav locale="en" />
      <div className="flex-1 pt-28 lg:pt-36 pb-12 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Breadcrumbs items={[{ label: 'Terms of Use', href: '/en/terms' }]} locale="en" />
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Terms of Use</h1>
          <p className="text-slate-600 mb-8">Rankings by Go Top</p>

          <div className="prose prose-sm max-w-none space-y-6 text-slate-700 leading-relaxed">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Introduction and Service Definition</h2>
              <p>
                Rankings by Go Top (the &ldquo;Service&rdquo; or the &ldquo;Platform&rdquo;) is a SaaS service
                operated by Go Top Digital Marketing &amp; Advertising Ltd. (the &ldquo;Company&rdquo;). The
                Service allows customers to track keyword rankings on Google search, monitor Google Maps
                visibility, measure visibility on AI engines such as ChatGPT, Gemini and Perplexity, conduct
                keyword research, and generate professional reports.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Acceptance of Terms</h2>
              <p>
                By registering for, accessing or using the Service, you confirm that you have read, understood
                and agree to be bound by these Terms of Use. If you do not agree to any of these terms, you
                must not register for or use the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Account Registration and User Responsibility</h2>
              <p>
                When creating an account, you agree to provide accurate, complete and current information.
                You are responsible for maintaining the confidentiality of your account credentials and for
                all activity that takes place under your account. You must notify the Company without delay
                of any suspected unauthorized access.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Trial Period</h2>
              <p>
                The Service offers a 7-day trial period for new customers. The limits applicable during the
                trial are displayed in the Service and may change from time to time at the Company&rsquo;s
                discretion. Continued use of the Service after the end of the trial period requires an active
                paid subscription.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Subscriptions and Payments</h2>
              <p>
                The Service operates on a monthly subscription model. Payments are processed through a
                third-party payment provider (PayPal). As long as the subscription remains active, billing
                renews automatically each month according to the selected plan. Prices, plans and limits
                may change from time to time and updates will be reflected in the Service and on the
                pricing page.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Cancellation</h2>
              <p>
                You may cancel renewal of your subscription at any time through your account settings.
                Access to the Service will be retained until the end of the billing period that has already
                been paid. No retroactive cancellation of a period that has already been paid will be granted,
                except as required by applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Refunds</h2>
              <p>
                As a rule, subscription fees are non-refundable for a period that has already begun or been
                paid. The Company may, at its sole discretion or as required by law, grant a refund in
                exceptional circumstances. Refund requests should be submitted in writing to the
                Company&rsquo;s email address.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Usage Limits</h2>
              <p>
                Each plan includes limits as set out on the pricing page and in the account dashboard,
                including:
              </p>
              <ul className="list-disc list-inside space-y-1 ml-4">
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
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. Third-Party Data and Services</h2>
              <p>
                The Service relies, or may rely, on data and services provided by third parties, including:
                Google, Google Ads API, Google Maps, various search providers, AI providers (ChatGPT, Gemini,
                Perplexity and others), payment providers (PayPal), and infrastructure and hosting providers
                (Supabase and others). Data obtained from third parties may be partial, estimated, delayed
                or unavailable, and its accuracy and availability are not within the Company&rsquo;s control.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">10. Data Accuracy and No Warranty of Accuracy</h2>
              <p>
                The Company does not warrant the absolute accuracy of ranking data, search volumes,
                competition levels, CPC estimates, AI visibility results or reports. Data is provided
                &ldquo;AS-IS&rdquo; and there may be differences between Service results and manual checks
                or data from other sources.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">11. No Guarantee of Business Results</h2>
              <p>
                The Company does not guarantee any business outcomes, including improvements in rankings,
                traffic, leads, sales, revenue or visibility on AI engines. The Service provides tracking
                and analytics tools only.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">12. Service Availability</h2>
              <p>
                The Service is provided as-is and may be subject to outages, maintenance windows, planned
                or unplanned downtime, limitations of third-party APIs and issues at third-party providers.
                The Company will make commercially reasonable efforts to minimize service interruptions but
                does not guarantee continuous 100% availability.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">13. Prohibited Use</h2>
              <p>The following actions are strictly prohibited:</p>
              <ul className="list-disc list-inside space-y-1 ml-4">
                <li>Damaging or attempting to disrupt the Service infrastructure</li>
                <li>Circumventing usage limits or security mechanisms</li>
                <li>Reverse engineering, decompiling or extracting source code</li>
                <li>Using the Service for unauthorized scraping</li>
                <li>Sharing access credentials with unauthorized parties</li>
                <li>Using the Service in violation of any applicable law</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">14. Intellectual Property</h2>
              <p>
                All rights in the Service, including its interface, design, source code, reports, logo and
                brand, belong to the Company. You may not copy, duplicate, distribute, sell or make any
                unauthorized use of the Service&rsquo;s content or components. Permitted use is limited to
                the subscriber&rsquo;s own needs in accordance with the purchased plan.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">15. User Content</h2>
              <p>
                You are solely responsible for any content you enter into the Service, including domains,
                keywords, AI questions, client details and any other information. You confirm that you hold
                the necessary rights and permissions to use this content within the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">16. Privacy</h2>
              <p>
                Use of the Service is also governed by the Company&rsquo;s Privacy Policy, which forms an
                integral part of these terms. Where a separate privacy policy is published on the website,
                it should be read together with these terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">17. Limitation of Liability</h2>
              <p>
                Subject to applicable law, the Company shall not be liable for any indirect, consequential,
                special or punitive damages, including loss of profits, loss of data, business impact or
                reliance on Service data. The Company&rsquo;s aggregate liability, if any, shall not exceed
                the amounts actually paid by the user during the 12 months preceding the event giving rise
                to the claim.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">18. Account Suspension or Termination</h2>
              <p>
                The Company may suspend or terminate a user account, temporarily or permanently, in case
                of a breach of these terms, non-payment, suspected misuse, attempts to harm the Service or
                any other reasonable cause. Upon termination, stored data may be deleted in accordance with
                Company policy and applicable law.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">19. Changes to the Terms</h2>
              <p>
                The Company may update these terms from time to time. The updated version will be published
                on the website and will take effect upon publication. Continued use of the Service after
                the terms are updated constitutes acceptance of the updated terms.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">20. Governing Law and Jurisdiction</h2>
              <p>
                These terms are governed by the laws of the State of Israel. Exclusive jurisdiction over
                any dispute arising from or related to these terms or the use of the Service lies with the
                competent courts in Israel.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">21. Contact</h2>
              <p>For any question regarding these terms or the Service, please contact us:</p>
              <p className="mt-4">
                <strong>Go Top Digital Marketing &amp; Advertising Ltd.</strong>
                <br />
                Email:{' '}
                <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                  oren@gotop.co.il
                </a>
              </p>
            </section>

            <section>
              <p className="mt-8 pt-8 border-t border-slate-200 text-sm text-slate-500">
                This document is a business draft. We recommend having it reviewed by legal counsel before
                final use.
                <br />
                Last updated: May 2026
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer locale="en" />
    </div>
  )
}
