/**
 * Impressum — the one legal page German has and the other seven languages do not.
 *
 * WHY IT IS A PAGE AND NOT A SIXTH LEGAL SLUG: the five slugs in
 * lib/legal/markdown.ts are the documents every translated language owes, and
 * the QA contract reads them as a set (components/public/__qa__/translated-legal-coverage.qa.ts
 * compares each language's five against the English pages). A sixth slug would
 * oblige Spanish, Brazilian Portuguese, French, Italian and Japanese to publish
 * a German statute's disclosure. So this is a hand-written route inside the /de
 * tree, gated by the same layout as every other /de page — exactly the shape
 * /ja/tokusho already has.
 *
 * WHY WE PUBLISH IT AT ALL: § 5 of the Digitale-Dienste-Gesetz (DDG), the
 * provision the old § 5 TMG became, requires a commercially operated digital
 * service to keep the provider's identity, address and contact details easily
 * recognizable, directly reachable and permanently available. It binds anyone who
 * offers such a service in Germany, so being established in Israel is no
 * exemption, and the duty does not turn on whether the buyer is a consumer or a
 * business. § 18 Abs. 2 of the Medienstaatsvertrag (MStV) adds a named
 * responsible person for a service that offers journalistic-editorial content;
 * our blog is such content, so that line is here too rather than argued about.
 *
 * "Directly reachable" is what makes this a footer link on every German page and
 * not a page buried two clicks deep, and why the gate and this page go live in
 * the same deploy (see lib/i18n/german-site.ts).
 *
 * The details are the owner's — the registered company, its registration number,
 * the Ramat Gan address, his name, the mailbox and the phone. Nothing here may be
 * edited without him.
 */
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalDoc } from '@/components/public/LegalDoc'
import Link from 'next/link'

const TITLE = 'Impressum | Go Top SEO'
const DESCRIPTION = 'Angaben nach § 5 des Digitale-Dienste-Gesetzes (DDG) und § 18 Absatz 2 des Medienstaatsvertrags (MStV).'

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // The whole legal tree is noindex, and this page is part of it. Noindex does
  // not hide it: it is linked from the footer of every German page, which is
  // what § 5 DDG asks for — that the visitor can find it without searching.
  robots: 'noindex, nofollow',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://www.gotopseo.com/de/impressum',
    locale: 'de_DE',
  },
}

export default function GermanImpressumPage() {
  return (
    <LegalDoc
      locale="de"
      breadcrumbs={[{ label: 'Impressum', href: '/de/impressum' }]}
      title="Impressum"
      subtitle={DESCRIPTION}
    >
      <section>
        <h2>Diensteanbieter</h2>
        <p>GO TOP DIGITAL MARKETING AND ADVERTISING LTD</p>
        <p className="mt-3">
          Rechtsform: Gesellschaft mit beschränkter Haftung nach israelischem Recht (Private Limited Company)
        </p>
        <p className="mt-3">
          Handelsregisternummer: 517274346, Registrar of Companies, Israel
        </p>
      </section>

      <section>
        <h2>Vertreten durch</h2>
        <p>Oren Hacham, Geschäftsführer</p>
      </section>

      <section>
        <h2>Anschrift</h2>
        <p>HaRechasim 24/2</p>
        <p>Ramat Gan 5235524</p>
        <p>Israel</p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          E-Mail:{' '}
          <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>contact@gotopseo.com</a>
        </p>
        <p className="mt-3">
          Telefon:{' '}
          <a href="tel:+972549489377" className={LEGAL_LINK}>+972-54-9489377</a>
        </p>
        <p className="mt-3">
          Die israelischen Arbeitstage sind Sonntag bis Donnerstag. Die E-Mail ist der zuverlässige Weg, und wir antworten innerhalb von 48 Stunden.
        </p>
      </section>

      <section>
        <h2>Verantwortlich für journalistisch-redaktionelle Inhalte</h2>
        <p>
          Nach § 18 Absatz 2 des Medienstaatsvertrags (MStV): Oren Hacham, HaRechasim 24/2, Ramat Gan 5235524, Israel.
        </p>
      </section>

      <section>
        <h2>Umsatzsteuer</h2>
        <p>
          Wir sind ein israelisches Unternehmen und haben keine deutsche Umsatzsteuer-Identifikationsnummer nach § 27a des Umsatzsteuergesetzes. Bei einer Zahlung aus Deutschland zieht <strong>Creem</strong> (Armitage Labs OÜ) das Geld als registrierter Verkäufer (merchant of record) ein; die geschuldete Steuer berechnet und zeigt Creem bei der Zahlung an, und Creem stellt den Beleg aus. Wird Ihr Konto über Shopify abgerechnet, führt Shopify Abrechnung und Beleg.
        </p>
      </section>

      <section>
        <h2>Der Dienst</h2>
        <p>
          Go Top SEO ist ein monatlicher Dienst für Unternehmen und Website-Inhaber. Er umfasst die Messung der Positionen in der Suche, die Prüfung der Website und das Anwenden freigegebener Korrekturen, das Schreiben von Artikeln und ihre Veröffentlichung auf der verbundenen Website, die Messung der Sichtbarkeit in der KI, Beiträge für das Google Unternehmensprofil und das Erstellen von Berichten. Die Preise stehen auf der{' '}
          <Link href="/de/pricing" className={LEGAL_LINK}>Preisseite</Link>.
        </p>
      </section>

      <section>
        <h2>Verbraucherstreitbeilegung</h2>
        <p>
          Wir sind nicht verpflichtet und nicht bereit, an einem Streitbeilegungsverfahren vor einer Verbraucherschlichtungsstelle teilzunehmen (§ 36 des Verbraucherstreitbeilegungsgesetzes). Das nimmt Ihnen nichts: das vierzehntägige Widerrufsrecht, das Ihnen die §§ 312g und 355 BGB geben, steht in der{' '}
          <Link href="/de/refund-policy" className={LEGAL_LINK}>Kündigungs- und Rückerstattungsrichtlinie</Link>
          {' '}und gilt unabhängig davon, und der Rechtsweg bleibt offen. Schreiben Sie uns zuerst: wir antworten auf jeden Antrag schriftlich.
        </p>
      </section>

      <section>
        <h2>Datenschutz und weitere Angaben</h2>
        <p>
          Wie wir mit Ihren Daten umgehen, steht in der{' '}
          <Link href="/de/privacy" className={LEGAL_LINK}>Datenschutzerklärung</Link>, einschließlich der Aufsichtsbehörde, an die Sie sich wenden können. Die Bedingungen des Dienstes stehen in den{' '}
          <Link href="/de/terms" className={LEGAL_LINK}>Nutzungsbedingungen</Link>, und die Erklärung zur Barrierefreiheit unter{' '}
          <Link href="/de/accessibility" className={LEGAL_LINK}>Barrierefreiheit</Link>.
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>Letzte Aktualisierung: 4. November 2026</p>
      </section>
    </LegalDoc>
  )
}
