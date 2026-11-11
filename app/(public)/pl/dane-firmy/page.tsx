/**
 * Dane firmy — the one legal page Polish has and six of the other nine
 * languages do not. German has /de/impressum, Dutch /nl/bedrijfsgegevens and
 * Japanese /ja/tokusho; this is the fourth of that shape.
 *
 * WHY IT IS A PAGE AND NOT A SIXTH LEGAL SLUG: the five slugs in
 * lib/legal/markdown.ts are the documents every translated language owes, and
 * the QA contract reads them as a set (components/public/__qa__/translated-legal-coverage.qa.ts
 * compares each language's five against the English pages). A sixth slug would
 * oblige Spanish, Brazilian Portuguese, French, Italian and Japanese to publish
 * a Polish statute's disclosure. So this is a hand-written route inside the /pl
 * tree, gated by the same layout as every other /pl page.
 *
 * WHY WE PUBLISH IT AT ALL, and the correction to an earlier reading: the Dutch
 * twin rests on artikel 3:15d lid 1 BW, which carries no establishment
 * qualifier. The Polish e-services act is NOT the same instrument and must not
 * be presented as if it were. Art. 5 ustawy o świadczeniu usług drogą
 * elektroniczną does list the identity data an e-service provider makes
 * available, but art. 3a of the same act writes the conflict rule around
 * providers established in an EU or EEA state, and a company established in
 * Israel sits outside that rule, so whether art. 5 binds this seller at all is
 * an open question of law and nothing on this page claims that it does.
 *
 * The duty that DOES reach us is the information duty of the ustawa o prawach
 * konsumenta. Art. 12 ust. 1 obliges a trader contracting at a distance with a
 * consumer to give, before the contract, the trader's identifying details
 * (pkt 2) and, as ONE item, the address of the business, the e-mail address and
 * the TELEPHONE NUMBER (pkt 3) — Polish does not split the address from the
 * contact details the way the Dutch act does, so pkt 3 is cited once for all
 * three. Art. 12 ust. 1 pkt 5, the total price with taxes, is NOT cited here:
 * its home is the pricing page and section 5 of the terms, and citing it on an
 * identity page would invite the reader to expect a price list. Art. 26 upk
 * settles the overlap with the e-services act: where both reach the same
 * matter, the consumer-rights act prevails. Rome I art. 6 points a
 * consumer contract at the law of the consumer's habitual residence whatever
 * the trader's seat, so the Polish consumer's protection travels with the
 * consumer and our Israeli establishment is no exemption. Art. 12 ust. 1 pkt 2
 * is also why the REGISTER is named here and not only the number.
 *
 * WHAT THE FOOTER AND THE TERMS DID NOT ALREADY CARRY, and is therefore the
 * reason this page exists rather than a line somewhere:
 *   - the register in which the company is entered, named, with its number;
 *   - that we hold no Polish tax identification number, and who the seller of
 *     record is instead.
 *   - the answer to art. 12 ust. 1 pkt 21, the out-of-court routes.
 * Identity, address, e-mail and telephone were already in the footer and the
 * terms; they are repeated here so the whole set is in one place. No online
 * contact channel beyond e-mail and telephone is listed, because art. 12 ust. 1
 * pkt 3a requires any further channel to preserve dated written correspondence
 * on a durable medium, and a chat widget does none of that. The complaints
 * address of pkt 4 is the same address as pkt 3, and the page says so rather
 * than inventing a second one.
 *
 * WHY IT IS NOT CALLED "IMPRESSUM": that is a German word for a German statute.
 * Polish law prescribes no title for such a page, so the title is the plain
 * Polish one.
 *
 * WHAT IS DELIBERATELY ABSENT: the German page carries a line naming the person
 * responsible for journalistic-editorial content, which § 18 Absatz 2 MStV
 * requires. Poland has no MStV analogue, so presenting such a line as something
 * Polish law demands would be a claim about the law that is not true.
 *
 * NO DISPUTE-RESOLUTION BODY IS NAMED, and that is now a measured answer rather
 * than an open question. Art. 4 ust. 1 ustawy z dnia 23 września 2016 r. o
 * pozasądowym rozwiązywaniu sporów konsumenckich (Dz.U. 2016 poz. 1823) applies
 * that act to disputes with a trader "mającym siedzibę na terytorium
 * Rzeczypospolitej Polskiej", and ust. 2 reads that seat as the managing
 * organ's seat or the place of business activity, in particular a branch. We
 * have neither, so no Polish podmiot uprawniony is competent for us; art. 31
 * ust. 1 obliges naming one only where the trader has undertaken, or is obliged
 * by separate provisions, to use ADR, and we have not. Art. 12 ust. 1 pkt 21 is
 * still a mandatory information item, so it is answered truthfully: no entity,
 * the consumer's own court under Brussels Ia art. 18, and the powiatowy
 * (miejski) rzecznik konsumentów as a free ADVISORY route only — never as a
 * body that could decide a dispute with us, which has not been verified. The EU
 * ODR platform is deliberately not named, in any locale.
 *
 * CONFIRMED BY THE LEGAL THREAD on 5 November 2026, from the consolidated
 * statutes: the reading above of art. 12 ustawy o prawach konsumenta, and the
 * decision to leave art. 5 uśude unclaimed because of art. 3a.
 *
 * The details are the owner's — the registered company, its registration
 * number, the Ramat Gan address, his name, the mailbox and the phone. Nothing
 * here may be edited without him.
 */
import { LEGAL_FOOTNOTE, LEGAL_LINK, LegalDoc } from '@/components/public/LegalDoc'
import Link from 'next/link'

const TITLE = 'Dane firmy | Go Top SEO'
const DESCRIPTION = 'Dane naszej firmy, rejestr, w którym jest wpisana, kontakt oraz informacja o podatku w cenie.'

export const metadata = {
  title: TITLE,
  description: DESCRIPTION,
  // The whole legal tree is noindex, and this page is part of it. Noindex does
  // not hide it: it is linked from the footer of every Polish page, so a
  // visitor reaches it without searching, which is what an information duty
  // given "before the contract" asks for.
  robots: 'noindex, nofollow',
  openGraph: {
    title: TITLE,
    description: DESCRIPTION,
    url: 'https://www.gotopseo.com/pl/dane-firmy',
    locale: 'pl_PL',
  },
}

export default function PolishCompanyInfoPage() {
  return (
    <LegalDoc
      locale="pl"
      breadcrumbs={[{ label: 'Dane firmy', href: '/pl/dane-firmy' }]}
      title="Dane firmy"
      subtitle={DESCRIPTION}
    >
      <section>
        <h2>Usługodawca</h2>
        <p>GO TOP DIGITAL MARKETING AND ADVERTISING LTD</p>
        <p className="mt-3">
          Forma prawna: spółka z ograniczoną odpowiedzialnością prawa izraelskiego (Private Limited Company)
        </p>
      </section>

      <section>
        <h2>Wpis do rejestru</h2>
        <p>
          Rejestr: Registrar of Companies, Izrael
        </p>
        <p className="mt-3">
          Numer wpisu: 517274346
        </p>
      </section>

      <section>
        <h2>Reprezentacja</h2>
        <p>Oren Hacham, członek zarządu</p>
      </section>

      <section>
        <h2>Adres</h2>
        <p>HaRechasim 24/2</p>
        <p>Ramat Gan 5235524</p>
        <p>Izrael</p>
      </section>

      <section>
        <h2>Kontakt</h2>
        <p>
          Adres e-mail:{' '}
          <a href="mailto:contact@gotopseo.com" className={LEGAL_LINK}>contact@gotopseo.com</a>
        </p>
        <p className="mt-3">
          Telefon:{' '}
          <a href="tel:+972549489377" className={LEGAL_LINK}>+972-54-9489377</a>
        </p>
        <p className="mt-3">
          Izraelskie dni pracy to niedziela do czwartku. Pewną drogą jest e-mail, na który odpowiadamy w ciągu 48 godzin.
        </p>
      </section>

      <section>
        <h2>Numer identyfikacji podatkowej</h2>
        <p>
          Jesteśmy spółką izraelską i <strong>nie mamy polskiego numeru identyfikacji podatkowej</strong>. Przy płatności z Polski pieniądze pobiera <strong>Creem</strong> (Armitage Labs OÜ) jako sprzedawca będący podatnikiem (merchant of record); Creem wylicza i pokazuje należny podatek przy płatności oraz wystawia dowód zapłaty. Jeśli rozliczenie Państwa konta idzie przez Shopify, fakturowanie i dowód zapłaty prowadzi Shopify.
        </p>
      </section>

      <section>
        <h2>Ceny i podatek</h2>
        <p>
          Cena na{' '}
          <Link href="/pl/pricing" className={LEGAL_LINK}>stronie cennika</Link>
          {' '}jest podana w dolarach amerykańskich i <strong>bez podatku</strong>. Podatek należny według obowiązującej stawki jest do niej doliczany, a dokładną kwotę łączną z podatkiem widzą Państwo na ekranie Creem, zanim cokolwiek Państwa wiąże.
        </p>
      </section>

      <section>
        <h2>Usługa</h2>
        <p>
          Go Top SEO to usługa miesięczna dla firm i właścicieli witryn. Obejmuje mierzenie pozycji w wyszukiwaniu, sprawdzanie witryny i wprowadzanie zatwierdzonych poprawek, pisanie artykułów i publikowanie ich na połączonej witrynie, mierzenie widoczności w usługach AI, posty do Profilu Firmy w Google oraz raporty.
        </p>
      </section>

      <section>
        <h2>Rezygnacja i odstąpienie</h2>
        <p>
          Abonament można wypowiedzieć w każdej chwili w ustawieniach konta, bez okresu wypowiedzenia dłuższego niż trwający miesiąc. Prawo odstąpienia w ciągu czternastu dni, które daje konsumentowi ustawa o prawach konsumenta, opisuje nasza{' '}
          <Link href="/pl/refund-policy" className={LEGAL_LINK}>polityka rezygnacji i zwrotów</Link>
          {' '}i działa niezależnie od wypowiedzenia. Jeśli Państwa abonament idzie przez Creem, Shopify albo zewnętrzny serwis sprzedaży, rezygnacja odbywa się tą samą drogą elektroniczną u tego podmiotu, a polityka wskazuje gdzie.
        </p>
      </section>

      <section>
        <h2>Reklamacje i spory pozasądowe</h2>
        <p>
          Reklamacje przyjmujemy pod tym samym adresem i tym samym e-mailem, które podaliśmy wyżej; innego adresu do reklamacji nie ma.
          Nie zobowiązaliśmy się do korzystania z pozasądowego rozwiązywania sporów konsumenckich i żaden przepis nas do tego nie zobowiązuje,
          a ustawa o pozasądowym rozwiązywaniu sporów konsumenckich obejmuje spory z przedsiębiorcą mającym siedzibę w Polsce, której nie mamy,
          więc <strong>nie wskazujemy żadnego podmiotu uprawnionego</strong>, bo żaden nie jest dla nas właściwy. Mówimy to wprost, zamiast
          wymieniać instytucję, która Państwa sprawy nie rozpozna. Realne drogi są dwie: bezpłatna pomoc i porada powiatowego (miejskiego)
          rzecznika konsumentów w Państwa miejscu zamieszkania, oraz sąd Państwa miejsca zamieszkania, który art. 18 rozporządzenia (UE)
          nr 1215/2012 (Bruksela I bis) pozostawia Państwu niezależnie od tego, gdzie my mamy siedzibę. Najprostsza droga pozostaje najkrótsza:
          e-mail do nas, na który odpowiadamy w ciągu 48 godzin.
        </p>
      </section>

      <section>
        <h2>Ochrona danych i pozostałe dokumenty</h2>
        <p>
          Jak postępujemy z Państwa danymi, opisuje{' '}
          <Link href="/pl/privacy" className={LEGAL_LINK}>polityka prywatności</Link>, razem z organem nadzorczym, do którego mogą się Państwo zwrócić. Warunki usługi są w{' '}
          <Link href="/pl/terms" className={LEGAL_LINK}>regulaminie</Link>, a oświadczenie o dostępności pod adresem{' '}
          <Link href="/pl/accessibility" className={LEGAL_LINK}>dostępność</Link>.
        </p>
      </section>

      <section>
        <p className={LEGAL_FOOTNOTE}>Ostatnia aktualizacja: 5 listopada 2026</p>
      </section>
    </LegalDoc>
  )
}
