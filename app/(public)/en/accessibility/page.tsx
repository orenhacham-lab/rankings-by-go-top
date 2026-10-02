import { LEGAL_FOOTNOTE, LegalDoc } from '@/components/public/LegalDoc'

export const metadata = {
  title: 'Accessibility | Go Top SEO',
  description: 'Accessibility statement for Go Top SEO',
  robots: 'noindex, nofollow',
  openGraph: {
    title: 'Accessibility | Go Top SEO',
    description: 'Accessibility statement for Go Top SEO',
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
      subtitle="Accessibility statement for Go Top SEO"
    >
      <section>
        <h2>Our Accessibility Commitment</h2>
        <p>
          At Go Top SEO, we are committed to making our platform accessible to everyone, including people with
          disabilities. We strive to meet high standards of digital accessibility and to continuously improve.
        </p>
      </section>

      <section>
        <h2>Standards We Follow</h2>
        <p>
          Our platform is built in alignment with the Web Content Accessibility Guidelines (WCAG) 2.1 at Level AA. We
          use semantic HTML, appropriate ARIA labels, and focus on sufficient color contrast.
        </p>
        <p className="mt-3">
          In Israel, web services are subject to the Israeli Standard SI 5568, which is based on WCAG 2.0 at Level AA,
          under the Equal Rights for Persons with Disabilities (Service Accessibility Adjustments) Regulations, 2013.
          We work to bring the site and the platform in line with this standard at Level AA; the WCAG 2.1 Level AA
          guidelines we apply also include the WCAG 2.0 requirements.
        </p>
      </section>

      <section>
        <h2>Accessibility Features</h2>
        <ul>
          <li>Full screen reader support</li>
          <li>Keyboard-only navigation</li>
          <li>Clear labels for every form field</li>
          <li>Level AA color contrast for text and interface components, in the platform&rsquo;s new design</li>
          <li>Large text sizes and adequate time for orientation</li>
          <li>Clear focus indication for keyboard navigation, and an accessibility menu on the site for adjusting text size, contrast and more</li>
          <li>Support for the operating system&rsquo;s &ldquo;reduce motion&rdquo; preference (prefers-reduced-motion): animations and
          transitions are reduced or removed for people who ask for it</li>
          <li>Full support for Hebrew (right-to-left, RTL) and English (left-to-right, LTR), including text
          direction, layout and navigation</li>
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
        <p>If you experience an accessibility issue, please contact our support team, who also act as the service&rsquo;s accessibility coordinator:</p>
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
        <h2>Parts That Are Not Yet Fully Accessible</h2>
        <p>
          Some parts, mainly third-party content and files uploaded to us, may not yet be fully accessible. If you
          come across one, write to us and we will deal with it.
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
          This page was last updated on September 29, 2026
        </p>
      </section>
    </LegalDoc>
  )
}
