import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'

export const metadata = {
  title: 'Privacy Policy | Rankings by Go Top',
  description: 'Privacy policy for Rankings by Go Top — how we collect, use and protect your data.',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Privacy Policy | Rankings by Go Top',
    description: 'Privacy policy for Rankings by Go Top',
    url: 'https://www.gotopseo.com/en/privacy',
    locale: 'en_US',
  },
}

export default function EnglishPrivacyPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav locale="en" />
      <div className="flex-1 pt-28 lg:pt-36 pb-12 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Breadcrumbs items={[{ label: 'Privacy Policy', href: '/en/privacy' }]} locale="en" />
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Privacy Policy</h1>
          <p className="text-slate-600 mb-8">Privacy policy for Rankings by Go Top</p>

          <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Introduction</h2>
              <p>
                Go Top Digital Marketing &amp; Advertising Ltd. (&ldquo;we&rdquo;, &ldquo;our&rdquo;, or &ldquo;the company&rdquo;) operates the Rankings by Go Top service
                at https://www.gotopseo.com (the &ldquo;Service&rdquo;). This privacy policy describes our practices regarding the collection,
                use, and disclosure of personal information when you use our Service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Information We Collect</h2>
              <p>We collect different types of information, including:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Authentication information:</strong> name, email address, password (encrypted)</li>
                <li><strong>Profile information:</strong> plan details and subscription information</li>
                <li><strong>Business information:</strong> company name, domain, keywords, ranking data</li>
                <li><strong>Technical information:</strong> IP address, browser type, referring page</li>
                <li><strong>Payment information:</strong> credit card data (processed through PayPal only)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">How We Use Your Data</h2>
              <p>We use your information to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Provide the rank tracking service</li>
                <li>Authenticate users and manage accounts</li>
                <li>Process payments</li>
                <li>Send service updates and news</li>
                <li>Improve our service</li>
                <li>Comply with legal requirements</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Information Sharing</h2>
              <p>We do not share your personal information with third parties, except:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>PayPal:</strong> for payment processing only</li>
                <li><strong>Supabase:</strong> for secure data storage</li>
                <li><strong>Serper:</strong> for Google search queries</li>
                <li><strong>Vercel:</strong> for site hosting</li>
                <li>When required by law</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Data Security</h2>
              <p>
                We use SSL/TLS encryption for all communication. Your passwords are stored encrypted via Supabase Auth.
                We maintain high data security standards, but we cannot guarantee 100% security.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Your Rights</h2>
              <p>Under applicable privacy law, you have the right to:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Access your personal data</li>
                <li>Correct inaccurate data</li>
                <li>Delete your account</li>
                <li>Object to certain processing</li>
                <li>Request data portability</li>
              </ul>
              <p className="mt-4">To exercise these rights, contact us at:</p>
              <p className="mt-2">
                <strong>Email:</strong>{' '}
                <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                  oren@gotop.co.il
                </a>
              </p>
              <p>
                <strong>Phone:</strong>{' '}
                <a href="tel:0549489377" className="text-blue-600 hover:underline">
                  054-9489377
                </a>
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Cookies</h2>
              <p>We use cookies for essential purposes:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Session cookies:</strong> for secure server communication and session management</li>
                <li><strong>Analytics cookies:</strong> for site usage analysis via Google Analytics and Google Tag Manager</li>
              </ul>
              <p className="mt-4">By continuing to use the site, you agree to the use of cookies as described above.</p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Analytics &amp; Marketing Services</h2>
              <p>We use the following services for user behavior analysis and marketing channel management:</p>
              <ul className="list-disc list-inside space-y-2">
                <li><strong>Google Analytics:</strong> to analyze traffic and acquisition channels</li>
                <li><strong>Google Tag Manager:</strong> to manage tags and analyze user composition</li>
              </ul>
              <p className="mt-4">
                These cookies do not personally identify you and are used to improve user experience and the service.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Contacting Us via WhatsApp</h2>
              <p>
                Our site and services may offer an option to contact us via WhatsApp. When a user chooses to contact us
                through WhatsApp, we may receive and process the information provided as part of that contact, including
                name, phone number, the content of the messages, files or images sent to us at the user&rsquo;s initiative,
                and any additional contact details shared during the conversation.
              </p>
              <p className="mt-4">
                The information provided to us via WhatsApp will be used to respond to the inquiry, provide service and
                support, handle requests, document inquiries, improve the service, maintain information security and
                protect our rights, as well as to comply with legal requirements where necessary.
              </p>
              <p className="mt-4">
                Use of WhatsApp is also subject to the terms of use and privacy policy of WhatsApp and/or Meta, and we
                recommend reviewing them before using this channel. Please do not send us, via WhatsApp, sensitive
                information that is not required to handle your inquiry, including passwords, full payment details, medical
                information, identification documents or other sensitive personal information, unless you have been
                expressly asked to do so for a defined purpose.
              </p>
              <p className="mt-4">
                We may retain the correspondence records for as long as necessary for the purposes of providing the
                service, handling inquiries, documentation, monitoring, legal defense and compliance with the law. Users
                may contact us to request access to, correction of, or deletion of the personal information they provided,
                subject to applicable law and this privacy policy.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Updates to This Policy</h2>
              <p>
                We may update this policy from time to time. Changes take effect immediately upon publication. We encourage you
                to review this policy regularly.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Contact</h2>
              <p>If you have questions about this privacy policy, please contact:</p>
              <p className="mt-2">
                <strong>Email:</strong>{' '}
                <a href="mailto:oren@gotop.co.il" className="text-blue-600 hover:underline">
                  oren@gotop.co.il
                </a>
              </p>
              <p>
                <strong>Phone:</strong>{' '}
                <a href="tel:0549489377" className="text-blue-600 hover:underline">
                  054-9489377
                </a>
              </p>
            </section>

            <section>
              <p className="text-slate-500 text-sm mt-8 pt-8 border-t border-slate-200">
                This policy was last updated in May 2026
              </p>
            </section>
          </div>
        </div>
      </div>
      <Footer locale="en" />
    </div>
  )
}
