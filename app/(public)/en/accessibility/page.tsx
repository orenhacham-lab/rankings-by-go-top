import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

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
    <LegalDoc
      locale="en"
      breadcrumbs={[{ label: 'Accessibility', href: '/en/accessibility' }]}
      title="Accessibility"
      subtitle="Accessibility statement for Rankings by Go Top"
    >
      <section>
        <h2>Our Accessibility Commitment</h2>
        <p>
          At Rankings by Go Top, we are committed to making our platform accessible to everyone, including people with
          disabilities. We strive to meet high standards of digital accessibility and to continuously improve.
        </p>
      </section>

      <section>
        <h2>Standards We Follow</h2>
        <p>
          Our platform is built in alignment with the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. We
          use semantic HTML, appropriate ARIA labels, and focus on sufficient color contrast.
        </p>
      </section>

      <section>
        <h2>Accessibility Features</h2>
        <ul>
          <li>Full screen reader support</li>
          <li>Keyboard-only navigation</li>
          <li>Descriptive labels for form fields</li>
          <li>Sufficient color contrast for readable text</li>
          <li>Large text sizes and adequate time for orientation</li>
          <li>Smooth, non-disruptive transitions</li>
        </ul>
      </section>

      <section>
        <h2>Supported Browsers</h2>
        <p>Our platform supports modern browsers:</p>
        <ul>
          <li>Chrome (latest version)</li>
          <li>Firefox (latest version)</li>
          <li>Safari (latest version)</li>
          <li>Edge (latest version)</li>
        </ul>
      </section>

      <section>
        <h2>Reporting Accessibility Issues</h2>
        <p>If you experience an accessibility issue, please contact our support team:</p>
        <p className="mt-2">
          <strong>Email:</strong>{' '}
          <a href="mailto:oren@gotop.co.il">
            oren@gotop.co.il
          </a>
        </p>
        <p>
          <strong>Phone:</strong>{' '}
          <a href="tel:0549489377">
            054-9489377
          </a>
        </p>
        <p className="mt-2">
          We aim to respond within 48 hours and work to resolve the issue.
        </p>
      </section>

      <section>
        <h2>Updates &amp; Improvements</h2>
        <p>
          We update the platform regularly to maintain and improve accessibility. If you have suggestions for
          improvement, please send us an email.
        </p>
      </section>

      <section>
        <h2>Additional Resources</h2>
        <ul>
          <li>
            <a href="https://www.w3.org/WAI/WCAG21/quickref/" target="_blank" rel="noopener noreferrer">
              WCAG 2.1 Quick Reference
            </a>
          </li>
          <li>
            <a href="https://www.w3.org/WAI/" target="_blank" rel="noopener noreferrer">
              W3C Web Accessibility Initiative
            </a>
          </li>
        </ul>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>
          This page was last updated in May 2026
        </p>
      </section>
    </LegalDoc>
  )
}
