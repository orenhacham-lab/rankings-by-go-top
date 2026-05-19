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
          <p className="text-slate-600 mb-8">Terms of use for Rankings by Go Top</p>

          <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
            <section>
              <div className="bg-blue-50 border border-blue-200 rounded-lg p-4 mb-4">
                <p className="text-sm text-slate-700">
                  <strong>Disclaimer:</strong> These terms are provided for informational purposes and are not legal advice.
                  Please consult with a legal professional for advice specific to your situation.
                </p>
              </div>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">1. Service Definition</h2>
              <p>
                Rankings by Go Top (&ldquo;Service&rdquo;) is a web-based platform operated by Go Top Digital Marketing & Advertising Ltd.
                that allows users to track keyword rankings on Google search results, Google Maps visibility, AI visibility in answers from
                ChatGPT, Gemini, Perplexity, and other AI engines, conduct keyword research, and generate professional reports.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">2. Use Policy</h2>
              <p>You agree to use the Service only for lawful purposes and in a way that does not infringe upon the rights of others or
              restrict their use and enjoyment of the Service. Prohibited behavior includes:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Harassing or causing distress or inconvenience to any person</li>
                <li>Obscene or abusive messages</li>
                <li>Disruption of the normal flow of dialogue within the Service</li>
                <li>Attempting to gain unauthorized access to systems or networks</li>
                <li>Reverse engineering or attempting to discover passwords or authentication mechanisms</li>
                <li>Using the Service to automate data scraping beyond fair use</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">3. Account Responsibility</h2>
              <p>
                You are responsible for maintaining the confidentiality of your account login credentials and password.
                You agree to accept responsibility for all activities that occur under your account. You must notify us
                immediately of any unauthorized use of your account.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">4. Free Trial Period</h2>
              <p>
                The Service offers a 7-day free trial period to new users. During the trial, you have full access to the trial plan features.
                You may cancel at any time during the trial period without charge. If you do not cancel before the trial period ends,
                you will be automatically charged for your selected plan.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">5. Subscriptions and Payments</h2>
              <p>
                Subscriptions are charged monthly on a recurring basis. By providing payment information, you authorize us to charge
                your account monthly for your selected plan. Subscription fees are non-refundable except as provided by law or this agreement.
                We accept payment through PayPal. All payment processing is handled through third-party secure payment systems.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">6. Billing and Cancellation</h2>
              <p>
                You may cancel your subscription at any time through your account settings. Cancellation takes effect immediately.
                You will retain access to your account and data until the end of your current billing cycle. No prorated refunds are
                provided for mid-month cancellations.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">7. Refunds</h2>
              <p>
                Generally, subscription fees are non-refundable. However, we may provide refunds at our sole discretion for certain
                circumstances such as service failures or billing errors. Refund requests must be made within 30 days of the charge.
                Any refunds will be processed through the original payment method.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">8. Usage Limits</h2>
              <p>
                Each plan includes specific limits on projects, keywords, keyword checks, and AI scans. These limits are reset monthly
                on your subscription renewal date. Exceeding usage limits may result in service suspension or requirement to upgrade to
                a higher plan. We reserve the right to enforce fair usage policies.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">9. Third-Party Data</h2>
              <p>
                The Service provides access to data from Google Search, Google Maps, Google Ads, and various AI services.
                This data is provided as-is. We do not guarantee accuracy, completeness, or real-time updates. You acknowledge
                that rankings, search volumes, and competition data are estimates and may vary from actual results. Always validate
                data independently.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">10. No Warranty</h2>
              <p>
                THE SERVICE IS PROVIDED ON AN &ldquo;AS IS&rdquo; BASIS WITHOUT WARRANTIES OF ANY KIND, EITHER EXPRESS OR IMPLIED,
                INCLUDING BUT NOT LIMITED TO WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE, OR NON-INFRINGEMENT.
                WE DO NOT WARRANT THAT THE SERVICE WILL BE UNINTERRUPTED, ERROR-FREE, OR MEET YOUR REQUIREMENTS.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">11. Data Accuracy Disclaimer</h2>
              <p>
                While we strive to provide accurate information, we make no guarantees regarding the accuracy of ranking data,
                search volumes, competition levels, or AI visibility results. Search engine algorithms change frequently.
                The Service should be used as one tool among many for your SEO strategy, not as the sole source of truth.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">12. Service Availability</h2>
              <p>
                We aim to maintain 99% uptime but do not guarantee continuous availability. The Service may be unavailable due to
                maintenance, updates, technical issues, or circumstances beyond our control. We are not responsible for losses resulting
                from temporary service interruptions or downtime.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">13. Limited Liability</h2>
              <p>
                TO THE FULLEST EXTENT PERMITTED BY LAW, WE SHALL NOT BE LIABLE FOR ANY INDIRECT, INCIDENTAL, SPECIAL, CONSEQUENTIAL,
                OR PUNITIVE DAMAGES, INCLUDING LOSS OF PROFIT, LOSS OF DATA, OR LOSS OF USE, EVEN IF ADVISED OF THE POSSIBILITY OF
                SUCH DAMAGES. OUR TOTAL LIABILITY SHALL NOT EXCEED THE AMOUNT YOU PAID IN THE 12 MONTHS PRECEDING THE EVENT.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">14. Privacy</h2>
              <p>
                Your use of the Service is also governed by our Privacy Policy. Please review the Privacy Policy to understand our
                practices regarding the collection and use of your personal information.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">15. Intellectual Property</h2>
              <p>
                The Service, including all content, features, and functionality, is owned by Go Top Digital Marketing & Advertising Ltd.,
                its licensors, or other providers of such material and is protected by international copyright, trademark, and other
                intellectual property laws. You may use the Service only for your personal, non-commercial use, unless specifically
                permitted otherwise.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">16. User Content</h2>
              <p>
                Any keywords, notes, or other content you input into the Service (&ldquo;User Content&rdquo;) remains your property.
                By using the Service, you grant us a non-exclusive, worldwide license to use, store, and process your User Content
                for the purpose of providing the Service. We will not share User Content with third parties except as necessary to
                provide the Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">17. Account Termination</h2>
              <p>
                We may terminate or suspend your account immediately if you violate these terms or engage in prohibited behavior.
                Upon termination, your right to use the Service ceases immediately. Data may be permanently deleted 90 days after
                account termination. You may request your data be deleted upon account closure.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">18. Changes to Terms</h2>
              <p>
                We reserve the right to modify these terms at any time. Changes will be effective upon posting to the Service.
                Your continued use of the Service following the posting of revised terms means you accept and agree to the changes.
                It is your responsibility to check these terms regularly for updates.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">19. Jurisdiction and Governing Law</h2>
              <p>
                These terms are governed by and construed in accordance with the laws of Israel, and you irrevocably submit to the
                exclusive jurisdiction of the courts located in Israel. This choice of law and jurisdiction applies without regard to
                your location.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">20. Contact Information</h2>
              <p>
                If you have questions about these terms or the Service, please contact us at:
              </p>
              <p className="mt-4">
                <strong>Go Top Digital Marketing & Advertising Ltd.</strong><br />
                Email: <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">oren@gotop.co.il</a><br />
                Country: Israel
              </p>
            </section>

            <section>
              <p className="mt-8 pt-8 border-t border-slate-200 text-sm text-slate-600">
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
