/**
 * Bedrijfsgegevens — the one legal page Dutch has and six of the other eight
 * languages do not. German has /de/impressum and Japanese /ja/tokusho; this is
 * the third of that shape.
 *
 * WHY IT IS A PAGE AND NOT A SIXTH LEGAL SLUG: the five slugs in
 * lib/legal/markdown.ts are the documents every translated language owes, and
 * the QA contract reads them as a set (components/public/__qa__/translated-legal-coverage.qa.ts
 * compares each language's five against the English pages). A sixth slug would
 * oblige Spanish, Brazilian Portuguese, French, Italian and Japanese to publish
 * a Dutch statute's disclosure. So this is a hand-written route inside the /nl
 * tree, gated by the same layout as every other /nl page.
 *
 * WHY WE PUBLISH IT AT ALL: artikel 3:15d lid 1 BW requires a provider of an
 * information-society service to make a listed set of data "gemakkelijk,
 * rechtstreeks en permanent toegankelijk" to those who use the service. The
 * article carries no establishment qualifier, so being established in Israel is
 * no exemption, and lid 3's definition — a service normally provided for
 * remuneration, by electronic means, at a distance and at the individual
 * request of the recipient — covers a paid monthly SaaS plainly. Artikel 3:15f
 * lid 3 BW names the officials charged with detecting breaches of 3:15d, so the
 * duty is publicly enforced and not only a matter between us and a customer.
 *
 * WHAT THE FOOTER AND THE TERMS DID NOT ALREADY CARRY, and is therefore the
 * reason this page exists rather than a line somewhere:
 *   - sub c: where the provider is entered in a trade register, "het register
 *     waar hij is ingeschreven en zijn inschrijvingsnummer" — the register has
 *     to be NAMED, not only the number;
 *   - sub f: where the provider carries on a VAT-liable activity, the VAT
 *     identification number. We have no Dutch one, so the page says that and
 *     says who the seller of record is instead.
 * sub a (identity and address) and sub b (contact, including the e-mail
 * address) were already in the footer and the terms. sub d, the supervisory
 * authority, is for licensed activities and does not reach us.
 *
 * WHY IT IS NOT CALLED "IMPRESSUM": that is a German word for a German statute.
 * Lid 1 asks only that the data be easy, direct and permanently accessible; it
 * prescribes no title, so the title is Dutch.
 *
 * WHAT IS DELIBERATELY ABSENT: the German page carries a line naming the person
 * responsible for journalistic-editorial content, which § 18 Absatz 2 MStV
 * requires. The Netherlands has no MStV analogue, so presenting such a line as
 * something Dutch law demands would be a claim about the law that is not true.
 *
 * "Rechtstreeks" is what makes this a footer link on every Dutch page and not a
 * page buried two clicks deep, and why the gate and this page go live in the
 * same deploy (see lib/i18n/dutch-site.ts).
 *
 * The details are the owner's — the registered company, its registration
 * number, the Ramat Gan address, his name, the mailbox and the phone. Nothing
 * here may be edited without him.
 */
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalDoc } from '@/components/public/LegalDoc'
import Link from 'next/link'

const TITLE = 'Bedrijfsgegevens | Go Top SEO'
const DESCRIPTION = 'De gegevens die artikel 3:15d van het Burgerlijk Wetboek van een dienstverlener van de informatiemaatschappij verlangt.'

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // The whole legal tree is noindex, and this page is part of it. Noindex does
  // not hide it: it is linked from the footer of every Dutch page, which is
  // what "rechtstreeks toegankelijk" in artikel 3:15d lid 1 BW asks for — that
  // the visitor can find it without searching.
  robots: 'noindex, nofollow',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://www.gotopseo.com/nl/bedrijfsgegevens',
    locale: 'nl_NL',
  },
}

export default function DutchCompanyInfoPage() {
  return (
    <LegalDoc
      locale="nl"
      breadcrumbs={[{ label: 'Bedrijfsgegevens', href: '/nl/bedrijfsgegevens' }]}
      title="Bedrijfsgegevens"
      subtitle={DESCRIPTION}
    >
      <section>
        <h2>Dienstverlener</h2>
        <p>GO TOP DIGITAL MARKETING AND ADVERTISING LTD</p>
        <p className="mt-3">
          Rechtsvorm: vennootschap met beperkte aansprakelijkheid naar Israëlisch recht (Private Limited Company)
        </p>
      </section>

      <section>
        <h2>Inschrijving in het register</h2>
        <p>
          Register: Registrar of Companies, Israël
        </p>
        <p className="mt-3">
          Inschrijvingsnummer: 517274346
        </p>
      </section>

      <section>
        <h2>Vertegenwoordigd door</h2>
        <p>Oren Hacham, bestuurder</p>
      </section>

      <section>
        <h2>Adres</h2>
        <p>HaRechasim 24/2</p>
        <p>Ramat Gan 5235524</p>
        <p>Israël</p>
      </section>

      <section>
        <h2>Contact</h2>
        <p>
          E-mail:{' '}
          <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>contact@gotopseo.com</a>
        </p>
        <p className="mt-3">
          Telefoon:{' '}
          <a href="tel:+972549489377" className={LEGAL_LINK}>+972-54-9489377</a>
        </p>
        <p className="mt-3">
          De Israëlische werkdagen zijn zondag tot en met donderdag. De e-mail is de betrouwbare weg, en wij antwoorden binnen 48 uur.
        </p>
      </section>

      <section>
        <h2>Btw-identificatienummer</h2>
        <p>
          Wij zijn een Israëlische vennootschap en hebben <strong>geen Nederlands btw-identificatienummer</strong>. Bij een betaling vanuit Nederland wordt het geld geïnd door <strong>Creem</strong> (Armitage Labs OÜ) als verkoper van record (merchant of record); Creem berekent en toont de verschuldigde belasting bij de betaling en stelt het betaalbewijs op. Wordt uw account via Shopify afgerekend, dan voert Shopify de facturering en het betaalbewijs.
        </p>
      </section>

      <section>
        <h2>Prijzen en belasting</h2>
        <p>
          Artikel 3:15d lid 2 BW verlangt dat wij uitdrukkelijk vermelden of, en zo mogelijk welke, belasting in een prijs is inbegrepen. Daarom: de prijs op de{' '}
          <Link href="/nl/pricing" className={LEGAL_LINK}>prijspagina</Link>
          {' '}is in Amerikaanse dollars en <strong>zonder belasting</strong>; de Nederlandse btw wordt daar tegen het wettelijke tarief bij opgeteld, en het exacte totaal met btw staat op het scherm van Creem voordat u gebonden bent.
        </p>
      </section>

      <section>
        <h2>De dienst</h2>
        <p>
          Go Top SEO is een maandelijkse dienst voor bedrijven en website-eigenaren. Daarin zitten het meten van de posities in het zoeken, het controleren van de website en het toepassen van goedgekeurde correcties, het schrijven van artikelen en het publiceren daarvan op de verbonden website, het meten van de zichtbaarheid in de AI, berichten voor het Google-bedrijfsprofiel en het opstellen van rapporten.
        </p>
      </section>

      <section>
        <h2>Opzeggen en ontbinden</h2>
        <p>
          Het abonnement is op elk moment op te zeggen in de instellingen van uw account, zonder opzegtermijn langer dan de lopende maand. Het recht van ontbinding binnen veertien dagen van artikel 6:230o BW staat in ons{' '}
          <Link href="/nl/refund-policy" className={LEGAL_LINK}>opzeg- en terugbetaalbeleid</Link>
          {' '}en geldt los daarvan. Loopt uw abonnement via Creem, Shopify of een externe marktplaats, dan gebeurt het opzeggen langs dezelfde elektronische weg bij die partij, en het beleid noemt waar.
        </p>
      </section>

      <section>
        <h2>Gegevensbescherming en de overige teksten</h2>
        <p>
          Hoe wij met uw gegevens omgaan, staat in de{' '}
          <Link href="/nl/privacy" className={LEGAL_LINK}>privacyverklaring</Link>, met de toezichthouder bij wie u terecht kunt. De voorwaarden van de dienst staan in de{' '}
          <Link href="/nl/terms" className={LEGAL_LINK}>gebruiksvoorwaarden</Link>, en de verklaring over de toegankelijkheid onder{' '}
          <Link href="/nl/accessibility" className={LEGAL_LINK}>toegankelijkheid</Link>.
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>Laatst bijgewerkt: 5 november 2026</p>
      </section>
    </LegalDoc>
  )
}
