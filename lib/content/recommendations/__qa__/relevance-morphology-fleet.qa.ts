/**
 * THE RELEVANCE GATE AND HEBREW MORPHOLOGY, MEASURED OVER THE WHOLE FLEET
 * (16 November 2026).
 *
 * The weekly gate sweep found the relevance rule rejecting "עבודת אינסטלציה" as
 * `unrelated` on ניאגרות סמויות — a plumber, whose own trade that is, and who
 * tracks the plural "עבודות אינסטלציה" himself. Hebrew puts a feminine noun into
 * the construct state by turning its final ה into ת (עבודה → עבודת), and heStem
 * stripped ה/ות/ים but not that ת, so the two forms of one word reduced to
 * different stems and never met.
 *
 * It is a CLASS, not a keyword: swept over all 37 Production projects that hold a
 * cached keyword pool (7,085 distinct keywords), 679 keywords across 24 projects
 * carry a construct form the gate could not read — "התקנת ניאגרה", "פתיחת אתר",
 * "חולצת ספורט נשים", "הכנת הזמנה לחתונה", "בדיקת…", "החלפת…".
 *
 * What the sweep decided, and what this suite holds:
 *  A) heConstructBase / heStemForms — the morphology itself, and its two guards.
 *  B) the fold is ADDITIVE: no keyword that passes today may start failing. An
 *     earlier version folded the ת inside heStem and silently blocked three live
 *     keywords on a flower shop ("פרחים קרית אונו", whose site spells it
 *     "קריית"). That is the control that caught it.
 *  C) the 28 keywords the fix recovers, each on its own project's vocabulary.
 *  D) what must STAY rejected: the adjectival 'ית' (a car is not a machine) and
 *     the wrong-market phrases the `matched >= 2` floor is there for.
 *
 * MUTATION CONTROLS throughout.
 * Run: npx tsx lib/content/recommendations/__qa__/relevance-morphology-fleet.qa.ts
 */
import { tokens } from '@/lib/content/recommendations/dedupe'
import { heConstructBase, heStem, heStemForms, isVocabAligned, researchKeywordIssue } from '@/lib/content/recommendations/keyword-research'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
/** buildSiteVocabulary's absorb (engine.ts), verbatim. */
function vocabularyOf(sources: readonly string[]): Set<string> {
  const vocab = new Set<string>()
  for (const t of sources) for (const tk of tokens(t)) {
    vocab.add(tk)
    if (tk.length >= 4 && /^[בלמהושכ]/.test(tk)) vocab.add(tk.slice(1))
    for (const form of tk.length >= 4 && /^[בלמהושכ]/.test(tk) ? [tk, tk.slice(1)] : [tk]) {
      for (const stem of heStemForms(form)) if (stem && stem !== tk) vocab.add(stem)
    }
  }
  return vocab
}
const aligned = (kw: string, vocab: Set<string>) => isVocabAligned(kw, vocab)

// ── A) the morphology ────────────────────────────────────────────────────────
console.log('\nA) the construct form folds back to its base')
{
  check('A1: a construct noun gives its base', heConstructBase('עבודת') === 'עבודה' && heConstructBase('התקנת') === 'התקנה')
  check('A2: and both forms share a stem', heStemForms('עבודת').includes(heStem('עבודה')) && heStemForms('עבודת').includes(heStem('עבודות')))
  check('A3: the plural the merchant tracks meets the singular the searcher types',
    heStemForms('עבודת').some((s) => heStemForms('עבודות').includes(s)))
  // GUARD 1 — the adjectival 'ית' is not a construct ending.
  check('A4: "מכונית" (a car) is not the construct of "מכונה" (a machine)',
    heConstructBase('מכונית') === null && heConstructBase('חשמלית') === null && heConstructBase('ביתית') === null)
  // GUARD 2 — a word whose ת is a root letter is left alone.
  check('A5: "דלת", "שבת", "בית" are words, not constructs',
    heConstructBase('דלת') === null && heConstructBase('שבת') === null && heConstructBase('בית') === null)
  check('A6: non-Hebrew is untouched', heConstructBase('student') === null && heConstructBase('123') === null)
  check('A7: a plural already handled by heStem is not folded twice', heConstructBase('עבודות') === null)
  // MUTATION CONTROL A — the fold is what makes the two forms meet. Without it
  // (heStem alone, as before) they do not.
  check('A8-MUT: heStem alone still parts them, which is the bug being fixed',
    heStem('עבודת') !== heStem('עבודות') && heStem('התקנת') !== heStem('התקנה'))
}

// ── B) additive: the gate can only ever recognise MORE ───────────────────────
console.log('\nB) additive — nothing that passes may start failing')
{
  check('B1: a token keeps the stem heStem gives it', heStemForms('מזרון').includes(heStem('מזרון')) && heStemForms('קרית').includes(heStem('קרית')))
  // The flower shop that an earlier, non-additive version broke: its own pages
  // spell the city "קריית", the searcher types "קרית", and the two met through
  // heStem's skeleton. Folding the ת inside heStem destroyed that match.
  const LOUIZ = vocabularyOf([
    'Louiz Flowers - פרחי לואיז', 'משלוחי פרחים בקריית אונו', 'זר פרחים', 'סידורי פרחים',
    'משלוח פרחים לבית חולים', 'פרחים לאירועים', 'הזמנת פרחים אונליין', 'חנות פרחים קריית אונו',
  ])
  check('B2: "פרחים קרית אונו" is still the flower shop\'s own keyword',
    aligned('פרחים קרית אונו', LOUIZ) && aligned('פרחים בקרית אונו', LOUIZ) && aligned('פרחים קריית אונו', LOUIZ))
  // …and the fold still earns its keep on the same project.
  check('B3: and "פרחים להזמנה" is recovered by it (the site writes "הזמנת פרחים")',
    aligned('פרחים להזמנה', LOUIZ))
  // MUTATION CONTROL B — every stem heStem produces is among the forms, for
  // every token in every fixture here. If a future edit replaces a stem instead
  // of adding to it, this fails.
  const corpus = ['קרית', 'קריית', 'עבודת', 'עבודות', 'התקנת', 'מכונית', 'חולצת', 'פתיחת', 'דלת', 'מזרן', 'כלבים', 'student']
  check('B4-MUT: heStemForms never replaces heStem\'s own answer',
    corpus.every((t) => heStemForms(t)[0] === heStem(t)))
}

// ── C) the 28 keywords the fleet sweep recovers ──────────────────────────────
console.log('\nC) the merchant\'s own trade, measured per project')
{
  const PLUMBER = vocabularyOf([
    'ניאגרות סמויות - ירון סלמון', 'אינסטלטור בנתניה', 'ניאגרה סמויה', 'תיקון ניאגרה סמויה',
    'החלפת מנגנון ניאגרה סמויה', 'עבודות אינסטלציה', 'התקנת ניאגרה סמויה', 'אינסטלטור בשרון',
  ])
  check('C1: the keyword the sweep reported — "עבודת אינסטלציה" on the plumber',
    researchKeywordIssue('עבודת אינסטלציה', { brandTokens: new Set(), vocab: PLUMBER }) === null,
    String(researchKeywordIssue('עבודת אינסטלציה', { brandTokens: new Set(), vocab: PLUMBER })))
  check('C2: and "התקנת ניאגרה" with it', aligned('התקנת ניאגרה', PLUMBER))

  const WEB_STUDIO = vocabularyOf([
    'מטלון', 'בניית אתרים', 'בניית אתר תדמית', 'קידום אתרים', 'עיצוב אתרים',
    'חנות אונליין', 'אתרי וורדפרס', 'הדפסה בתלת מימד', 'מעצב גרפי', 'איך לפתוח חנות אונליין',
  ])
  check('C3: "פתיחת אתר" / "פתיחת אתרים" / "מעצבת אתרים" on the web studio',
    aligned('פתיחת אתר', WEB_STUDIO) && aligned('פתיחת אתרים', WEB_STUDIO) && aligned('מעצבת אתרים', WEB_STUDIO))

  const CLOTHES = vocabularyOf([
    'ששקה - חנות בגדי יד שנייה לנשים', 'חולצות נשים', 'שמלות יד שנייה', 'מכנסי ספורט',
    'בגדי אימון לנשים', 'בגדי ים', 'חנות בגדים יד שנייה',
  ])
  check('C4: "חולצת ספורט נשים" / "חולצת אימון נשים" on the second-hand clothes shop',
    aligned('חולצת ספורט נשים', CLOTHES) && aligned('חולצת אימון נשים', CLOTHES))

  const APPLIANCES = vocabularyOf([
    'buy-buy פשוט לקנות מהבית', 'מדיח כלים', 'התקנה של מדיח כלים', 'טלוויזיה', 'מקרר',
    'מכונת כביסה', 'תנור בנוי', 'מוצרי חשמל לבית',
  ])
  check('C5: "התקנת מדיח" / "התקנת טלוויזיה" on the appliances shop',
    aligned('התקנת מדיח', APPLIANCES) && aligned('התקנת טלוויזיה', APPLIANCES))

  const WEDDING = vocabularyOf([
    'My Marriage', 'הזמנות לחתונה', 'הזמנה לחתונה בעיצוב אישי', 'עיצוב הזמנות',
    'הכנה של הזמנות', 'מעטפות לחתונה',
  ])
  check('C6: "הכנת הזמנה לחתונה" on the wedding-invitations studio', aligned('הכנת הזמנה לחתונה', WEDDING))

  // The same gate read the site's own words only through the UNSTRIPPED token, so
  // a site writing "לפתוח" stored 'לפתח' and never 'פתח'. 49 more keywords across
  // 17 projects came back when the stripped variant was stemmed too — "מדפסת תלת
  // מימד מחיר" on the web studio, "פריחת הדובדבן ביפן" on the Japan travel site.
  check('C8: a site word carrying a prefix answers for the same word without one',
    aligned('פתיחת אתר', WEB_STUDIO) && aligned('פתיחת אתרים', WEB_STUDIO) && aligned('מעצבת אתרים', WEB_STUDIO),
    `${JSON.stringify([aligned('פתיחת אתר', WEB_STUDIO), aligned('פתיחת אתרים', WEB_STUDIO)])}`)
  // MUTATION CONTROL C8 — the vocabulary is still the site's. A prefixed word it
  // never writes does not become one of its words.
  check('C8-MUT: and a word the studio never writes is still not its own',
    !aligned('להתעמל בחדר כושר', WEB_STUDIO) && !aligned('לבשל אוכל איטלקי', WEB_STUDIO))

  // MUTATION CONTROL C — the fold does not hand a project words it does not own.
  // Each of these shares ONE token with the vocabulary above and no more.
  check('C7-MUT: and none of these four projects gains a wrong-market phrase',
    !aligned('אינסטלציה בתעשייה כבדה', PLUMBER)
    && !aligned('אתרי הימורים', WEB_STUDIO)
    && !aligned('חולצת כדורגל ברצלונה', CLOTHES)
    && !aligned('טלוויזיה בכבלים מחיר', APPLIANCES))
}

// ── D) what must stay rejected ───────────────────────────────────────────────
console.log('\nD) the floor the gate is there for')
{
  const DOG_STORE = vocabularyOf([
    '4Dogs Original', 'מיטות לכלבים', 'מזרן אורטופדי לכלב', 'רצועות לכלבים',
    'חטיפים לכלבים', 'עגלת כלבים', 'צעצועים לכלבים',
  ])
  check('D1: "כלבים לאימוץ" is still not a dog-products store\'s subject', !aligned('כלבים לאימוץ', DOG_STORE))
  check('D2: and "סמי הכבאי צעצועים" is still a different entity class', !aligned('סמי הכבאי צעצועים', DOG_STORE))
  // The adjectival 'ית' guard, on the project that measured it: folding it let
  // cars into a home-appliances shop through its "מכונת כביסה".
  const APPLIANCES = vocabularyOf([
    'buy-buy פשוט לקנות מהבית', 'מכונת כביסה', 'מדיח כלים', 'מקרר', 'תנור בנוי',
    'מוצרי חשמל לבית', 'התקנה של מדיח כלים',
  ])
  check('D3: "מכונית חשמלית" is not the appliances shop\'s "מכונת כביסה"',
    !aligned('מכונית חשמלית', APPLIANCES) && !aligned('סקודה חשמלית מחיר', APPLIANCES),
    `${aligned('מכונית חשמלית', APPLIANCES)} / ${aligned('סקודה חשמלית מחיר', APPLIANCES)}`)
  // MUTATION CONTROL D — the same shop's real construct phrases do pass, so D3
  // is the 'ית' guard at work and not the gate being shut.
  check('D4-MUT: while "התקנת מדיח" and "מכונת כביסה צרה" are its own',
    aligned('התקנת מדיח', APPLIANCES) && aligned('מכונת כביסה צרה', APPLIANCES))
  // The construct head's hatch reads the vocabulary LITERALLY, so the stemmer's
  // slack cannot open it: measured, "עבודת שליחויות" (courier work) reached a
  // cleaning company's words only through the stemmer and must stay a job search,
  // while the plumber's "עבודת אינסטלציה" names a word his site really writes.
  const CLEANER = vocabularyOf([
    'הלהיט בניקיון', 'ניקיון משרדים בערב', 'חברת ניקיון משרדים בתל אביב', 'ניקיון בניינים',
    'ניקיון לאחר עבודות ניסור בטון', 'סדר וניקיון במשרד', 'עובדת ניקיון', 'שליחות מהירה',
  ])
  check('D6: "עבודת שליחויות" on the cleaning company is a job search, not its trade',
    researchKeywordIssue('עבודת שליחויות', { brandTokens: new Set(), vocab: CLEANER }) === 'job_seeker',
    String(researchKeywordIssue('עבודת שליחויות', { brandTokens: new Set(), vocab: CLEANER })))
  // MUTATION CONTROL D6 — the literal word it DOES write keeps the phrase.
  check('D6-MUT: while "עבודות ניסור בטון", whose words it writes, is its own work',
    researchKeywordIssue('עבודות ניסור בטון', { brandTokens: new Set(), vocab: CLEANER }) !== 'job_seeker',
    String(researchKeywordIssue('עבודות ניסור בטון', { brandTokens: new Set(), vocab: CLEANER })))

  check('D5: a vocabulary too small to judge by still rejects nothing',
    isVocabAligned('עבודת אינסטלציה', null) && isVocabAligned('כלבים לאימוץ', new Set()))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
export {}
