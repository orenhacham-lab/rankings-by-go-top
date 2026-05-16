import { PublicNav } from '@/components/PublicNav'
import { Footer } from '@/components/Footer'
import { Breadcrumbs } from '@/components/Breadcrumbs'

export const metadata = {
  title: 'Accessibility | Rankings by Go Top',
  description: 'Accessibility statement for Rankings by Go Top',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Accessibility | Rankings by Go Top',
    description: 'Accessibility statement for Rankings by Go Top',
    url: 'https://www.gotopseo.com/en/accessibility',
    locale: 'en_US',
  },
}

export default function EnglishAccessibilityPage() {
  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-slate-100 flex flex-col">
      <PublicNav locale="en" />
      <main className="flex-1 py-12 px-4">
        <div className="max-w-3xl mx-auto bg-white rounded-2xl shadow-sm border border-slate-200 p-8">
          <Breadcrumbs items={[{ label: 'Accessibility', href: '/en/accessibility' }]} locale="en" />
          <h1 className="text-4xl font-bold text-slate-900 mb-2">Accessibility</h1>
          <p className="text-slate-600 mb-8">Accessibility statement for Rankings by Go Top</p>

          <div className="prose prose-sm max-w-none space-y-6 text-slate-700">
            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Our Accessibility Commitment</h2>
              <p>
                At Rankings by Go Top, we are committed to making our platform accessible to everyone, including people with
                disabilities. We strive to meet high standards of digital accessibility and to continuously improve.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Standards We Follow</h2>
              <p>
                Our platform is built in alignment with the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. We
                use semantic HTML, appropriate ARIA labels, and focus on sufficient color contrast.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Accessibility Features</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>Full screen reader support</li>
                <li>Keyboard-only navigation</li>
                <li>Descriptive labels for form fields</li>
                <li>Sufficient color contrast for readable text</li>
                <li>Large text sizes and adequate time for orientation</li>
                <li>Smooth, non-disruptive transitions</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Supported Browsers</h2>
              <p>Our platform supports modern browsers:</p>
              <ul className="list-disc list-inside space-y-2">
                <li>Chrome (latest version)</li>
                <li>Firefox (latest version)</li>
                <li>Safari (latest version)</li>
                <li>Edge (latest version)</li>
              </ul>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Reporting Accessibility Issues</h2>
              <p>If you experience an accessibility issue, please contact our support team:</p>
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
              <p className="mt-2">
                We aim to respond within 48 hours and work to resolve the issue.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Updates &amp; Improvements</h2>
              <p>
                We update the platform regularly to maintain and improve accessibility. If you have suggestions for
                improvement, please send us an email.
              </p>
            </section>

            <section>
              <h2 className="text-2xl font-bold text-slate-900 mt-8 mb-4">Additional Resources</h2>
              <ul className="list-disc list-inside space-y-2">
                <li>
                  <a href="https://www.w3.org/WAI/WCAG21/quickref/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                    WCAG 2.1 Quick Reference
                  </a>
                </li>
                <li>
                  <a href="https://www.w3.org/WAI/" className="text-blue-600 hover:underline" target="_blank" rel="noopener noreferrer">
                    W3C Web Accessibility Initiative
                  </a>
                </li>
              </ul>
            </section>

            <section>
              <p className="text-slate-500 text-sm mt-8 pt-8 border-t border-slate-200">
                This page was last updated in May 2026
              </p>
            </section>
          </div>
        </div>
      </main>
      <Footer locale="en" />
    </div>
  )
}
