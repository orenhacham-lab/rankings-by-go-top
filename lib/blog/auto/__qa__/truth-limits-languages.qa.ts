/**
 * THE TRUTH LIMITS, IN EVERY LANGUAGE THE BLOG WRITES IN — offline, pure.
 *
 * Until 7 Nov 2026 the word lists in lib/blog/auto/truth-limits.ts held Hebrew,
 * English, Spanish and Portuguese, so the check covered four of ten languages:
 * a French, Italian, Japanese, German, Dutch or Polish article could promise a
 * ranking, invent a star rating, claim a customer count or sell daily rank
 * tracking and be published. No test could fail over it, because a guard that
 * asks "is this sentence refused" needs a sentence in that language to ask
 * about. These are those sentences.
 *
 * Group A: a forbidden claim in each language must be refused.
 * Group B: legitimate prose must still publish — including the two real
 *   sentences, taken from the French and Italian Search Console guides already
 *   on the blog, that an over-broad cadence rule would have refused.
 * Each group ends with a MUTATION CONTROL: the pre-fix pattern, proving the
 * sentence really does slip through without the languages added.
 */
import { checkTruthLimits } from '../truth-limits'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const verdict = (text: string) =>
  checkTruthLimits({ title: text, metaDescription: '', html: `<p>${text}</p>` })

/** One sentence per rule, per language, as that language actually writes it. */
const CLAIMS: Record<string, Record<string, string>> = {
  fr: {
    percentage_claim: 'Nos clients gagnent 30 pour cent de trafic.',
    customer_count_claim: 'Plus de 500 clients utilisent la plateforme.',
    tracking_cadence_claim: 'Le suivi de positionnement quotidien est inclus.',
    rating_claim: 'Noté 4,8 étoiles sur 120 avis.',
    ranking_guarantee: 'Nous garantissons la première position dans Google.',
  },
  it: {
    percentage_claim: 'I nostri clienti crescono del 30 per cento.',
    customer_count_claim: 'Oltre 500 clienti usano la piattaforma.',
    tracking_cadence_claim: 'Il monitoraggio giornaliero è incluso.',
    rating_claim: 'Valutato 4,8 stelle su 120 recensioni.',
    ranking_guarantee: 'Garantiamo la prima posizione su Google.',
  },
  de: {
    percentage_claim: 'Unsere Kunden gewinnen 30 Prozent mehr Besucher.',
    customer_count_claim: 'Mehr als 500 Kunden nutzen die Plattform.',
    tracking_cadence_claim: 'Die tägliche Überwachung der Platzierungen ist inbegriffen.',
    rating_claim: 'Bewertet mit 4,8 Sternen aus 120 Bewertungen.',
    ranking_guarantee: 'Wir garantieren den ersten Platz bei Google.',
  },
  nl: {
    percentage_claim: 'Onze klanten groeien 30 procent.',
    customer_count_claim: 'Meer dan 500 klanten gebruiken het platform.',
    tracking_cadence_claim: 'Dagelijkse monitoring van je posities is inbegrepen.',
    rating_claim: 'Beoordeeld met 4,8 sterren uit 120 beoordelingen.',
    ranking_guarantee: 'Wij garanderen een positie op de eerste pagina.',
  },
  pl: {
    percentage_claim: 'Nasi klienci zyskują 30 procent ruchu.',
    customer_count_claim: 'Ponad 500 klientów korzysta z platformy.',
    tracking_cadence_claim: 'Codzienne monitorowanie pozycji jest w cenie.',
    rating_claim: 'Ocena 4,8 gwiazdki na podstawie 120 opinii.',
    ranking_guarantee: 'Gwarantujemy pozycję w pierwszej dziesiątce.',
  },
  ja: {
    percentage_claim: 'お客様のアクセスは30パーセント増えています。',
    customer_count_claim: '500社の顧客が利用しています。',
    tracking_cadence_claim: '毎日の順位追跡が含まれます。',
    rating_claim: '120件のレビューで星4.8の評価です。',
    ranking_guarantee: '検索順位を保証します。',
  },
}

/** Prose that must publish. The first two are live articles, word for word. */
const LEGITIMATE: [string, string][] = [
  ['fr: a weekly look at Search Console is a habit, not our product',
    'Pour une petite entreprise, une vérification hebdomadaire est une bonne habitude pour surveiller les performances.'],
  ['it: the same, in the Italian guide',
    'Per monitorare errori critici o azioni manuali, un controllo settimanale è consigliabile.'],
  ['fr: daily surveillance after a migration is advice to the reader',
    'Après une refonte de site ou une migration, une surveillance quotidienne est recommandée pendant quelques jours.'],
  ['de: ordinary German prose about visibility',
    'Dieser Leitfaden erklärt, wie Sie Ihre Sichtbarkeit in Google verbessern und welche Schritte sinnvoll sind.'],
  ['nl: ordinary Dutch prose',
    'Deze gids legt uit hoe u uw vindbaarheid in Google verbetert en welke stappen zinvol zijn.'],
  ['pl: ordinary Polish prose',
    'Ten przewodnik wyjaśnia, jak poprawić widoczność strony w Google i od czego zacząć.'],
  ['ja: ordinary Japanese prose',
    'このガイドでは、検索での見つけやすさを高める手順を説明します。'],
  ['de: the monthly cadence we really do run',
    'Die Platzierungen werden monatlich automatisch erfasst, und eine Prüfung ist jederzeit von Hand möglich.'],
]

async function main() {
  console.log('A) a forbidden claim is refused in every language')
  {
    for (const [lang, rules] of Object.entries(CLAIMS)) {
      for (const [code, sentence] of Object.entries(rules)) {
        const got = verdict(sentence).failures
        check(`A1 ${lang} ${code}`, got.includes(code), `got [${got.join(',')}]`)
      }
    }
    // Every language is covered, so a language added to the blog without a case
    // here is a gap: the list must hold one per language beyond the original four.
    check('A2: all six added languages have a case',
      ['fr', 'it', 'de', 'nl', 'pl', 'ja'].every((l) => Object.keys(CLAIMS[l] || {}).length === 5))
    // And the four that were always covered still are.
    check('A3: Hebrew still refused', verdict('אנחנו מבטיחים מקום ראשון בגוגל').failures.includes('ranking_guarantee'))
    check('A4: English still refused', verdict('We guarantee a ranking on page one.').failures.includes('ranking_guarantee'))
    check('A5: Spanish still refused', verdict('Garantizamos resultados en Google.').failures.includes('ranking_guarantee'))
    check('A6: Portuguese still refused', verdict('Garantimos a posição no Google.').failures.includes('ranking_guarantee'))

    // MUTATION CONTROL — the pre-fix patterns, in the four languages they held.
    const OLD_GUARANTEE = /מובטח|מבטיח(?:ים|ה)?\s+(מקום|דירוג|עלייה)|guarantee[ds]?\s+(ranking|position|results)|garantiza(?:mos|do)?\s+(posición|resultados)|garant(?:imos|ido|ia|e)\s+(posi[çc][ãa]o|resultados|ranking)/i
    const OLD_RATING = /\d(?:[.,]\d)?\s*(כוכבים|כוכב|stars?|estrellas?|estrelas?)|(ביקורות|reviews|reseñas|avalia[çc][õo]es)\s*\d|\d[\d.,]*\s*(ביקורות|reviews|reseñas|avalia[çc][õo]es)/i
    check('MUTATION: the old pattern let the German guarantee through (so A1 would fail)',
      !OLD_GUARANTEE.test(CLAIMS.de.ranking_guarantee))
    check('MUTATION: the old pattern let the Polish star rating through',
      !OLD_RATING.test(CLAIMS.pl.rating_claim))
    check('MUTATION: the old pattern let the Japanese guarantee through',
      !OLD_GUARANTEE.test(CLAIMS.ja.ranking_guarantee))
  }

  console.log('B) legitimate prose still publishes')
  {
    for (const [name, sentence] of LEGITIMATE) {
      const got = verdict(sentence).failures
      check(`B1 ${name}`, got.length === 0, `refused with [${got.join(',')}]`)
    }

    // MUTATION CONTROL — the over-broad cadence rule written first, which read a
    // reader's weekly habit as a claim about our product and would have refused
    // two articles already on the blog.
    const TOO_BROAD = /(suivi|contr[ôo]le|v[ée]rification|analyse|scan)\s+(quotidien(?:ne)?|hebdomadaire)|(monitoraggio|controllo|scansione|verifica)\s+(giornalier[oa]|quotidian[oa]|settimanale)/i
    check('MUTATION: the over-broad rule refuses the live French sentence (so B1 would fail)',
      TOO_BROAD.test(LEGITIMATE[0][1]))
    check('MUTATION: and the live Italian one', TOO_BROAD.test(LEGITIMATE[1][1]))
    // The narrow rule still catches the product claim it is for.
    check('B2: the narrow rule still catches "suivi de positionnement quotidien"',
      verdict(CLAIMS.fr.tracking_cadence_claim).failures.includes('tracking_cadence_claim'))
  }

  console.log('C) structured-data and other-engine wording, in the new languages')
  {
    check('C1: German Shopify + structured data is refused',
      verdict('Die Shopify-App liefert strukturierte Daten für jedes Produkt.').failures.includes('shopify_schema_claim'))
    check('C2: Dutch Shopify + structured data is refused',
      verdict('De Shopify-app levert gestructureerde data voor elk product.').failures.includes('shopify_schema_claim'))
    check('C3: Polish automatic Perplexity coverage is refused',
      verdict('Automatyczne sprawdzanie obejmuje Perplexity i Copilot.').failures.includes('ai_engine_coverage_claim'))
    check('C4: Japanese automatic Perplexity coverage is refused',
      verdict('自動チェックはPerplexityにも対応しています。').failures.includes('ai_engine_coverage_claim'))
    check('C5: naming Perplexity without claiming it is automatic still publishes',
      verdict('Perplexity ist eine weitere Antwortmaschine, die Sie von Hand prüfen können.').failures.length === 0,
      verdict('Perplexity ist eine weitere Antwortmaschine, die Sie von Hand prüfen können.').failures.join(','))

    // MUTATION CONTROL — the pre-fix lists.
    const OLD_SCHEMA = /schema|json-?ld|סכימה|נתונים מובנים|datos estructurados|dados estruturados/i
    const OLD_AUTOMATIC = /אוטומט|automatic|automátic|automatically/i
    check('MUTATION: the old schema list misses "strukturierte Daten" (so C1 would fail)',
      !OLD_SCHEMA.test('Die Shopify-App liefert strukturierte Daten für jedes Produkt.'))
    check('MUTATION: the old automatic list misses "Automatyczne" (so C3 would fail)',
      !OLD_AUTOMATIC.test('Automatyczne sprawdzanie obejmuje Perplexity i Copilot.'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
