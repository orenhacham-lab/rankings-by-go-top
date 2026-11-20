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
import { checkTruthLimits, encodeGateReason, decodeGateReason } from '../truth-limits'
import { retryAvoidances, retryBriefNotes } from '../brief'

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

  console.log('D) denying a promise is not making one')
  {
    // 16 Nov 2026: Polish was the only one of eleven locales that published
    // nothing, after five attempts inside the morning window refused on
    // `truth:ranking_guarantee`. Every Polish topic in the plan is a
    // `pozycjonowanie` keyword — ranking work — and an honest article about
    // ranking work almost has to say that rankings cannot be promised.
    const denials: [string, string][] = [
      ['Polish', 'Żadna agencja nie da gwarancji pozycji w Google.'],
      ['Polish (no guarantee exists)', 'Nie ma gwarancji pozycji — jest tylko praca, którą da się zmierzyć.'],
      ['English', 'No agency can guarantee rankings.'],
      ['Hebrew', 'אף אחד לא יכול להבטיח מקום ראשון בגוגל.'],
      ['German', 'Keine Agentur kann Platzierungen garantieren.'],
      ['French', 'Aucune agence ne peut garantir un classement.'],
      ['Spanish', 'Ninguna agencia puede garantizar posiciones.'],
      ['Japanese (negated verb ending)', '検索順位を保証しません。'],
    ]
    for (const [lang, text] of denials) {
      check(`D: ${lang} — saying a ranking CANNOT be promised still publishes`,
        !verdict(text).failures.includes('ranking_guarantee'), verdict(text).failures.join(','))
    }

    // The promise itself must still be refused, including the two shapes that
    // could hide behind the negation rule.
    const promises: [string, string][] = [
      ['Polish', 'Gwarantujemy pierwsze pozycje w Google w trzy miesiące.'],
      ['Polish (noun form)', 'Nasza oferta to gwarancja pozycji w pierwszej dziesiątce.'],
      ['English', 'We guarantee first page rankings in three months.'],
      ['Hebrew', 'אנחנו מבטיחים מקום ראשון בגוגל.'],
      ['German', 'Wir garantieren den ersten Platz bei Google.'],
      ['Japanese', '検索順位を保証します。'],
      // A denial and a promise in one text: the promise is in its own sentence,
      // and a sentence-bounded rule must not let the denial excuse it.
      ['a denial followed by a promise', 'No one can guarantee rankings. We guarantee you the first position.'],
      // "not just X, we also X": the second claim carries no negation.
      ['the "don\'t just" shape', "We don't just guarantee rankings, we guarantee results."],
    ]
    for (const [lang, text] of promises) {
      check(`D: ${lang} — the promise is still refused`,
        verdict(text).failures.includes('ranking_guarantee'))
    }

    // MUTATION CONTROL — the pre-fix rule: one test over the whole text, with no
    // negation and a two-word gap.
    const OLD_VERBS = '(?:guarantee[ds]?|garantiza(?:mos|do)?|garant(?:imos|ido|ia|e)|garant(?:it|ie|issons)|garan(?:tiamo|tito|zia)|garantier(?:t|te|en)|Garantie|gegarandeerde?|garanderen|gwarantujemy|gwarancj[aąęi]|gwarantowan\\w*)'
    const OLD_NOUNS = '(?:rankings?|positions?|results|posici[óo]n|resultados|posi[çc][ãa]o|classement|r[ée]sultats|posizion\\w*|risultati|Platz\\w*|Ergebnisse|positie|resultaten|pozycj\\w*|wynik\\w*|miejsc\\w*|dziesi[ąa]tce)'
    const OLD = new RegExp('מובטח|מבטיח(?:ים|ה)?\\s+(?:מקום|דירוג|עלייה)'
      + `|${OLD_VERBS}\\s+(?:\\S+\\s+){0,2}${OLD_NOUNS}` + '|(?:順位|掲載|上位)[^。]{0,6}保証', 'i')
    check('MUTATION: the old rule refused the Polish sentence that denies a guarantee (so D would fail)',
      OLD.test('Żadna agencja nie da gwarancji pozycji w Google.'))
    check('MUTATION: and the English one', OLD.test('No agency can guarantee rankings.'))
    check('MUTATION: and it let "guarantee you the first position" through (the gap was two words)',
      !OLD.test('We guarantee you the first position.'))
  }

  console.log('E) saying an engine is NOT checked automatically is not a coverage claim')
  {
    // 17 Nov 2026: Italian was the only locale besides Polish that published
    // nothing. Three attempts inside the window, all refused on
    // `truth:ai_engine_coverage_claim`, and the row kept only the rule's name.
    // An article about AI visibility almost has to say WHICH engines the
    // automatic check covers, which means naming the ones it does not.
    const denials: [string, string][] = [
      ['Italian', 'Il controllo automatico non include Perplexity.'],
      ['Italian, the other order', 'Perplexity non fa parte del controllo automatico.'],
      ['English', 'The automatic check does not cover Perplexity or Copilot.'],
      ['Hebrew', 'הבדיקה האוטומטית אינה כוללת את Perplexity.'],
      ['Polish', 'Automatyczne sprawdzanie nie obejmuje Perplexity.'],
      ['German', 'Die automatische Prüfung umfasst Perplexity nicht, ohne Copilot und Grok.'],
      ['French', 'La vérification automatique ne couvre pas Perplexity.'],
      ['Spanish', 'La comprobación automática no incluye Perplexity.'],
      ['Japanese', '自動チェックはPerplexityに対応していません。'],
    ]
    for (const [lang, text] of denials) {
      const v = verdict(text)
      check(`E: ${lang} — the denial publishes`, !v.failures.includes('ai_engine_coverage_claim'), v.failures.join(','))
    }
    // And the claim itself is still refused, including beside a denial.
    const claims: [string, string][] = [
      ['Polish', 'Automatyczne sprawdzanie obejmuje Perplexity i Copilot.'],
      ['Japanese', '自動チェックはPerplexityにも対応しています。'],
      ['Italian', 'Il controllo automatico include anche Perplexity.'],
      ['a denial then a claim', 'The automatic check does not cover Grok. It covers Perplexity automatically.'],
    ]
    for (const [lang, text] of claims) {
      check(`E: ${lang} — the claim is still refused`,
        verdict(text).failures.includes('ai_engine_coverage_claim'), verdict(text).failures.join(','))
    }

    // HEBREW WRITES THIS NEGATION WITH A DIFFERENT LETTER. "אין" ends in a final
    // nun (ן); "אינה / אינו / אינם" use the medial nun (נ), so one is NOT a prefix
    // of the other and the list that held only "אין" matched neither. That gap was
    // in the ranking rule too, from the day it shipped.
    check('E: אינה is not spelled with the same nun as אין',
      !'אינה'.includes('אין'))
    check('E: so the Hebrew denial of a ranking promise also publishes now',
      !verdict('הדירוג בגוגל אינו מובטח על ידי אף אחד.').failures.includes('ranking_guarantee'),
      verdict('הדירוג בגוגל אינו מובטח על ידי אף אחד.').failures.join(','))

    // MUTATION CONTROL — the pre-fix rule: two tests over the sentence, no negation.
    const OLD = (sentence: string) => /perplexity|copilot|grok/i.test(sentence)
      && /אוטומט|automatic|automátic|automatically|automatis|automatiqu|automatyczn|自動/i.test(sentence)
    check('MUTATION: the old rule refused the Italian denial (so E would fail)',
      OLD('Il controllo automatico non include Perplexity.'))
    check('MUTATION: and the Japanese one', OLD('自動チェックはPerplexityに対応していません。'))
  }

  console.log('F) a refusal keeps the sentence it refused')
  {
    const v = verdict('Il controllo automatico include anche Perplexity.')
    check('F: the sample is the offending sentence',
      v.samples.ai_engine_coverage_claim === 'Il controllo automatico include anche Perplexity.', JSON.stringify(v.samples))
    const long = verdict(`Il controllo automatico include anche Perplexity ${'e Copilot '.repeat(40)}.`)
    check('F: a sample is cut to 160 characters', (long.samples.ai_engine_coverage_claim ?? '').length === 160)
    check('F: a clean article carries no samples', Object.keys(verdict('Un articolo onesto.').samples).length === 0)

    // The round trip through blog_plan.last_error.
    const stored = encodeGateReason(`truth:${v.failures.join(',')}`, v.samples)
    check('F: the codes stay first and unchanged', stored.startsWith('truth:ai_engine_coverage_claim'), stored)
    check('F: the rules are still read from the stored reason',
      retryAvoidances(stored).length === 1 && retryAvoidances(stored)[0].includes('Perplexity'), retryAvoidances(stored).join(' / '))
    check('F: and the sentence comes back out',
      decodeGateReason(stored).samples.ai_engine_coverage_claim === 'Il controllo automatico include anche Perplexity.')
    check('F: the brief quotes it to the next attempt',
      (retryBriefNotes(stored) ?? '').includes('[THE SENTENCE THAT WAS REFUSED] Il controllo automatico include anche Perplexity.'),
      retryBriefNotes(stored) ?? '')
    // A reason with no samples, and a corrupt one, must both behave like before.
    check('F: a bare reason still yields its rules', retryAvoidances('truth:ranking_guarantee').length === 1)
    check('F: a corrupt sample suffix is ignored, not thrown',
      decodeGateReason('truth:ranking_guarantee ¦ {not json').codes === 'truth:ranking_guarantee'
      && Object.keys(decodeGateReason('truth:ranking_guarantee ¦ {not json').samples).length === 0)
    check('F: nothing to keep means nothing is appended',
      encodeGateReason('truth:x', {}) === 'truth:x')
  }

<<<<<<< HEAD
  console.log('G) the contrast is not a claim, and the sample follows the match')
  {
    // MEASURED, after the negation reading of 17 Nov shipped: Italian lost 18 Nov
    // and Spanish lost 19 Nov, both three attempts, both on
    // `ai_engine_coverage_claim`. The stored sentences are these two, and neither
    // denies anything — they draw the line with "su richiesta" / "bajo demanda",
    // which is how the line is actually drawn, and is true.
    const contrasts: [string, string][] = [
      ['Italian, 18 Nov', 'Nella nostra piattaforma abbiamo integrato controlli automatici per ChatGPT, Gemini e Google AI, mentre Perplexity e Grok si interrogano su richiesta.'],
      ['Spanish, 19 Nov', 'Verificamos de forma automática si un negocio es mencionado en ChatGPT, Gemini y Google AI, ofreciendo además consultas individuales bajo demanda para Perplexity.'],
      ['English', 'The check runs automatically for ChatGPT, Gemini and Google AI; Perplexity and Copilot are answered on request.'],
      ['German', 'Die Prüfung läuft automatisch für ChatGPT, Gemini und Google AI, Perplexity und Grok auf Anfrage.'],
      ['French', 'Le contrôle automatique couvre ChatGPT, Gemini et Google AI ; Perplexity est interrogé à la demande.'],
      ['Polish', 'Sprawdzanie automatyczne obejmuje ChatGPT, Gemini i Google AI, a Perplexity na żądanie.'],
      ['Hebrew', 'הבדיקה האוטומטית מכסה את ChatGPT, Gemini ו-Google AI, ו-Perplexity נבדק לפי דרישה.'],
      ['Dutch', 'De controle loopt automatisch voor ChatGPT, Gemini en Google AI; Perplexity op aanvraag.'],
    ]
    for (const [lang, text] of contrasts) {
      const v = verdict(text)
      check(`G: ${lang} — the contrast publishes`, !v.failures.includes('ai_engine_coverage_claim'), v.failures.join(','))
    }
    // The claim stays refused even where the word "automatically" is far away.
    check('G: and claiming the automatic check includes it is still refused',
      verdict('Il controllo automatico include Perplexity, Copilot e Grok.').failures.includes('ai_engine_coverage_claim'))

    // MUTATION CONTROL — the rule as it stood on 18 Nov: negation only.
    const OLD = (sentence: string) =>
      /perplexity|copilot|grok/i.test(sentence)
      && /אוטומט|automatic|automátic|automatically|automatis|automatiqu|automatyczn|自動/i.test(sentence)
      && !/\b(?:no|not|non|nie|nicht|pas)\b|לא|אינ/i.test(sentence)
    check('MUTATION: the 18 Nov rule refused the Italian contrast (so G would fail)',
      OLD(contrasts[0][1]))
    check('MUTATION: and the Spanish one', OLD(contrasts[1][1]))

    // THE SAMPLE MUST CONTAIN WHAT IT ACCUSES. A table has no sentence
    // punctuation in it, so `plainText` hands the rules one very long "sentence"
    // and the first 160 characters of it are a heading, not the offence.
    const table = `Modelo de Cobro Cómo Funciona Ventaja Principal Punto Crítico a Vigilar ${'Porcentaje de la inversión publicitaria '.repeat(4)} el coste sube un 35% cada trimestre.`
    const long = verdict(table)
    const sample = long.samples.percentage_claim ?? ''
    check('G: percentage_claim is still raised', long.failures.includes('percentage_claim'), long.failures.join(','))
    check('G: and its sample holds the number that tripped it', sample.includes('35%'), sample)
    check('G: the window says it was cut', sample.startsWith('…'), sample)
    check('G: and it is still bounded', sample.length <= 161, String(sample.length))
    // MUTATION CONTROL — the first-160-characters sample of 17 Nov.
    const OLD_SAMPLE = table.replace(/\s+/g, ' ').trim().slice(0, 160)
    check('MUTATION: the old sample missed the number (so G would fail)', !OLD_SAMPLE.includes('35%'))
  }

=======
>>>>>>> origin/claude/project-thread-8pehq4
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()

export {}
