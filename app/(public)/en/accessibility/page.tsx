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
        <p className="mt-3">
          <strong>Conformance statement:</strong> the site and the platform are <em>partially</em>
          conformant with the standard at Level AA. Partially, not fully, because some parts have not
          yet been tested end to end, and because third-party content is outside our control. The
          parts we know are not fully accessible are listed further down this page.
        </p>
        <p className="mt-3">
          <strong>How we are checked:</strong> every public page is audited automatically in a real
          browser against the full set of WCAG 2.1 Level A and AA rules, in Hebrew and in English,
          together with its heading structure, its declared language and direction, its focus order
          and an alternative text on every image. The cookie notice is checked separately from the
          keyboard alone, including that refusing is reached first. These checks run on every change
          to the code, and a change that breaks them does not ship. An automated pass finds some
          barriers and not all of them: it cannot judge whether an alternative text is actually
          meaningful, or how a screen reader announces a widget in practice. Those are judged by a
          person using assistive technology, and such an audit has not been carried out here yet.
          That is why the statement says &ldquo;partially&rdquo;.
        </p>
        <p className="mt-3">
          <strong>Visitors from the European Union:</strong> the European Accessibility Act
          (Directive (EU) 2019/882), which applies from 28 June 2025, exempts microenterprise service
          providers — fewer than ten employees and an annual turnover or balance sheet total not
          exceeding EUR 2 million — from its accessibility requirements. We meet that definition, so
          those requirements do not apply to us. We follow WCAG 2.1 Level AA anyway, because
          accessibility is not a question of obligation.
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
          {/*
            The languages are described by how each is HANDLED, not as a list of
            the languages the product happens to offer today. A list dates: the
            Spanish site and dashboard exist on preview, so "Hebrew and English"
            was already on its way to being untrue, and an accessibility
            statement that overstates what it covers is exactly the kind of
            claim that costs more than it buys. This wording stays true before
            and after any language is added, and each language version of the
            statement names the language it is written in.
          */}
          <li>Text direction, layout and navigation are handled for every language the site is published in:
          Hebrew right-to-left (RTL), English and any further language left-to-right (LTR). This statement
          applies to all language versions of the site</li>
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
        <p>
          If you run into an accessibility problem — a page that does not read, an action you cannot
          complete with the keyboard, text a screen reader skips — write to us and we will deal with
          it. The service&rsquo;s accessibility coordinator:
        </p>
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
          We answer within 48 hours, and the answer says what we are doing and when. If your message
          asks for a particular adjustment, we will say whether it is possible and on what timetable.
        </p>
        <p className="mt-4">
          <strong>If we do not answer, or our answer did not solve the problem:</strong> you may
          contact the Commission for Equal Rights of Persons with Disabilities at the Israeli
          Ministry of Justice
          (<a href="https://www.gov.il/en/departments/commission_for_equal_rights_of_persons_with_disabilities" target="_blank" rel="noopener noreferrer">
            Commission for Equal Rights of Persons with Disabilities
          </a>). Contacting us first is not a condition.
        </p>

      </section>

      <section>
        <h2>Parts That Are Not Yet Fully Accessible</h2>
        <p>
          A blanket claim of full accessibility is one nobody can keep, so here is what we know:
        </p>
        <ul>
          <li><strong>Third-party content</strong> shown inside the platform (results from Google,
          views from external providers): outside our control and not guaranteed accessible.</li>
          <li><strong>Files uploaded to us</strong> by users, including CSV files and reports: stored
          as they are and not remediated automatically.</li>
          <li><strong>New screens</strong> in their first weeks: they are tested by hand, and until
          that testing is finished gaps may remain.</li>
        </ul>
        <p className="mt-4">
          If you come across one of these, or anything else, write to us and we will deal with it. A
          request for an individual adjustment will be considered on its merits.
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
          This page was last updated on October 5, 2026
        </p>
      </section>
    </LegalDoc>
  )
}
