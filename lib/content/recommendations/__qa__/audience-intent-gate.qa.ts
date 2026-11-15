/**
 * WANTING A JOB IS NOT WANTING THE SERVICE (15 November 2026).
 *
 * From Oren's report on topic accuracy: 1cln.co.il, an office-cleaning company,
 * had a queue of job-search topics — "דרושים מנקה", "איך למצוא עבודה בתל אביב",
 * "משרדי השמה". Measured in Production, the cause was the project's ONE cached
 * keyword-research row, seeded from the domain itself, whose 32 keywords were all
 * job-search terms; the relevance vocabulary already blocked 29, and the three it
 * kept carried the site's own service words ("עבודה ניקיון משרדים"). What was
 * wrong with them was the AUDIENCE, and the engine had no word for that.
 *
 *   A) the unambiguous hiring words, with the escape hatch the noise terms use:
 *      the site's own word is kept (4Dogs sells "צעצועי תעסוקה");
 *   B) 'עבודה' is judged by POSITION, not by ownership: measured over the fleet,
 *      another cleaning company (הלהיט בניקיון) holds 53 cached keywords on
 *      'עבודה' while its own blog says "סביבת עבודה" and "עבודות ניסור", so a
 *      term-level hatch would hand all 53 back;
 *   C) 'עובד/עובדת/עובדים' are NOT hiring words: the gift shop הסוד בלונים holds
 *      26 keywords on "מתנות לעובדים", its best commercial terms, and JUP's
 *      "עובדת ניקיון" is a customer hiring a cleaner;
 *   D) a business that is itself in hiring keeps the lot;
 *   E) nothing to judge by, nothing rejected.
 *
 * MUTATION CONTROLS throughout.
 * Run: npx tsx lib/content/recommendations/__qa__/audience-intent-gate.qa.ts
 */
import { tokens } from '@/lib/content/recommendations/dedupe'
import { heStem, researchKeywordIssue, siteOwnsTerm } from '@/lib/content/recommendations/keyword-research'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** The vocabulary exactly as buildSiteVocabulary builds it (engine.ts absorb). */
function vocabularyOf(titles: readonly string[]): Set<string> {
  const vocab = new Set<string>()
  for (const t of titles) for (const tk of tokens(t)) {
    vocab.add(tk)
    if (tk.length >= 4 && /^[בלמהושכ]/.test(tk)) vocab.add(tk.slice(1))
    const stem = heStem(tk)
    if (stem && stem !== tk) vocab.add(stem)
  }
  return vocab
}
const issue = (kw: string, vocab: Set<string> | null) => researchKeywordIssue(kw, { brandTokens: new Set(), vocab })

// 1cln.co.il: a thin site, so the vocabulary is the business name and the
// merchant's own tracked keywords (the real ones, 17 of them).
const CLEANER = vocabularyOf([
  'מספר 1 בניקיון - חברת ניקיון משרדים', 'ניקיון משרדים בפתח תקווה', 'ניקיון משרדים בהרצליה',
  'ניקיון משרדים במרכז', 'ניקיון משרדים בתל אביב', 'ניקיון משרדים בגבעתיים', 'ניקיון משרדים ברמת גן',
  'ניקיון משרדים בראשון לציון', 'ניקיון משרדים בערב', 'ניקיון משרדים בחיפה', 'ניקיון מבנים',
  'ניקיון בניינים', 'ניקיון משרדים בכפר סבא', 'ניקיון משרדים באשדוד', 'ניקיון משרדים בבת ים',
  'ניקיון משרדים בירושלים', 'ניקיון משרדים ברעננה',
])
// הלהיט בניקיון: the same trade, but a real blog — its OWN pages say 'עבודה'.
const CLEANER_WITH_BLOG = vocabularyOf([
  'הלהיט בניקיון', 'ניקיון משרדים בערב', 'חברת ניקיון משרדים בתל אביב', 'ניקיון בניינים / מבנים',
  'סדר וניקיון במשרד: המדריך המלא לסביבה פרודוקטיבית', 'ניקיון לאחר עבודות ניסור בטון',
  'האם עובש במשרד מסכן את בריאות העובדים?', 'העסקת עובדת ניקיון באופן ישיר מול חברת ניקיון',
  'כוח אדם', 'שירותי ניקיון למשרדים', 'ניקוי חלונות למשרדים', 'ניקיון משרדים הייטק',
])
// הסוד בלונים ומתנות: gifts, whose best keywords are gifts FOR employees.
const GIFTS = vocabularyOf([
  'הסוד בלונים ומתנות', 'מתנות לעובדים', 'שי לחג לעובדים', 'מארזי מתנה לעובדים',
  'מתנות ממותגות ללקוחות', 'מארז המנהלים', 'מתנה לבוס', 'מתנות למשרד', 'משלוחי מתנות מהיום למחר',
])
// 4Dogs: a dog-products store whose vocabulary carries 'תעסוקה' — enrichment toys.
const DOG_TOYS = vocabularyOf([
  '4Dogs Original', 'צעצועי תעסוקה לכלבים', 'מיטות לכלבים', 'רצועות לכלבים', 'חטיפים לכלבים',
])
// A staffing company: hiring IS its subject.
const STAFFING = vocabularyOf([
  'חברת השמה כוח אדם', 'דרושים עובדים', 'משרות פנויות', 'קורות חיים', 'ראיון עבודה',
  'גיוס עובדים', 'מועמדים', 'קריירה', 'תעסוקה', 'משרדי השמה',
])

// ── A) the unambiguous hiring words ──────────────────────────────────────────
console.log('\nA) a hiring word on a business that sells a service')
{
  check('A1: "דרושים מנקה" is a job seeker', issue('דרושים מנקה', CLEANER) === 'job_seeker')
  check('A2: "משרדי השמה" is a job seeker', issue('משרדי השמה', CLEANER) === 'job_seeker')
  check('A3: "דרושים ניקיון משרדים בערב בתל אביב" — the site\'s own service words do not save it',
    issue('דרושים ניקיון משרדים בערב בתל אביב', CLEANER) === 'job_seeker')
  check('A4: "בניית מסלול קריירה" is a job seeker', issue('בניית מסלול קריירה', CLEANER) === 'job_seeker')
  check('A5: and the service itself is untouched', issue('ניקיון משרדים בערב', CLEANER) === null)
  check('A6: as is a guide about it', issue('ניקיון בניינים מקצועי', CLEANER_WITH_BLOG) === null,
    String(issue('ניקיון בניינים מקצועי', CLEANER_WITH_BLOG)))
  // MUTATION CONTROL A — the escape hatch is what keeps a legitimate owner of the
  // term: a store that sells "צעצועי תעסוקה" keeps its own word.
  check('A7: 4Dogs keeps "צעצועי תעסוקה לכלבים"', issue('צעצועי תעסוקה לכלבים', DOG_TOYS) === null)
  check('A7-MUT: the same keyword on the cleaning company is a job seeker',
    issue('צעצועי תעסוקה לכלבים', CLEANER) === 'job_seeker')
}

// ── B) 'עבודה' is judged by position ─────────────────────────────────────────
console.log('\nB) \'עבודה\' at the head of the phrase, on a site that owns the word')
{
  check('B1: the site really does own it', CLEANER_WITH_BLOG.has('עבודה') || CLEANER_WITH_BLOG.has('עבודות'))
  check('B2: "עבודה בניקיון משרדים" is still a job seeker', issue('עבודה בניקיון משרדים', CLEANER_WITH_BLOG) === 'job_seeker')
  check('B3: "עבודה ניקיון" too', issue('עבודה ניקיון', CLEANER_WITH_BLOG) === 'job_seeker')
  check('B4: "עבודה תל אביב" too', issue('עבודה תל אביב', CLEANER_WITH_BLOG) === 'job_seeker')
  // MUTATION CONTROL B — the position is the whole rule: the same word in the
  // middle of a phrase is the trade's own vocabulary and is kept.
  check('B5: "ניקיון לאחר עבודות ניסור בטון" is kept', issue('ניקיון לאחר עבודות ניסור בטון', CLEANER_WITH_BLOG) === null)
  check('B6: "העסקת עובדת ניקיון" is kept', issue('העסקת עובדת ניקיון', CLEANER_WITH_BLOG) === null)
  check('B7-MUT: a term-level hatch would keep the job searches — the hatch says the site owns the word',
    siteOwnsTerm('עבודה', CLEANER_WITH_BLOG))
}

// ── C) 'עובדים' is not a hiring word ─────────────────────────────────────────
console.log('\nC) gifts for employees are the gift shop\'s own market')
{
  for (const kw of ['מתנות לעובדים', 'שי לחג לעובדים', 'מארזי מתנה לעובדים', 'מתנות ממותגות לעובדים']) {
    check(`C: "${kw}" is kept`, issue(kw, GIFTS) === null, String(issue(kw, GIFTS)))
  }
  check('C5: a customer hiring a cleaner is kept', issue('עובדת ניקיון בתל אביב', CLEANER_WITH_BLOG) === null,
    String(issue('עובדת ניקיון בתל אביב', CLEANER_WITH_BLOG)))
  check('C6: and "השכרת רכב" is not a salary question', issue('השכרת רכב בטוקיו', vocabularyOf(['Japan4U', 'השכרת רכב ביפן', 'טיולים ביפן', 'מלונות בטוקיו'])) === null)
  // MUTATION CONTROL C — a real hiring phrase on the same gift shop is rejected,
  // so section C is not simply "the gate is off for this project".
  check('C7-MUT: "דרושים עובדים לאריזת מתנות" on the gift shop is a job seeker',
    issue('דרושים עובדים לאריזת מתנות', GIFTS) === 'job_seeker')
}

// ── C2) the fleet's own stock: every idea the rule would drop ────────────────
console.log('\nC2) measured over the fleet\'s 996 pending/approved ideas')
{
  // 21 ideas carry a hiring word or head 'עבודה'. These three are NOT job
  // searches and must survive, each for a different reason.
  const PERFUME = vocabularyOf(['אוליגרך פרפיום', 'בשמי יוקרה לגבר', 'בשמים לאישה', 'אאו דה פרפיום', 'בושם לגבר'])
  const WEB_STUDIO = vocabularyOf(['hm soft', 'בניית אתרים', 'עיצוב אתרים', 'חנויות אונליין', 'קידום אתרים', 'מעצבי אתרים'])
  // (The relevance vocabulary still judges it on its own words — "ראיון" and
  //  "עבודה" are not a perfume shop's — but it is not thrown out as a job search.)
  check('C2a: "בושם לראיון עבודה" on a perfume shop is not a job search',
    issue('בושם לראיון עבודה', PERFUME) !== 'job_seeker', String(issue('בושם לראיון עבודה', PERFUME)))
  check('C2a2: and "בושם מתנה לראיון עבודה" with the shop\'s own words passes',
    issue('בושם יוקרה לגבר לראיון עבודה', PERFUME) === null, String(issue('בושם יוקרה לגבר לראיון עבודה', PERFUME)))
  check('C2b: "עבודה מול מעצבי אתרים" on a web studio is a relation, not a position',
    issue('עבודה מול מעצבי אתרים', WEB_STUDIO) === null, String(issue('עבודה מול מעצבי אתרים', WEB_STUDIO)))
  check('C2c: "פעילות ותעסוקה לכלבים" on the dog store is its own word',
    issue('פעילות ותעסוקה לכלבים', DOG_TOYS) === null, String(issue('פעילות ותעסוקה לכלבים', DOG_TOYS)))
  // MUTATION CONTROL C2 — the relation exception is narrow: the same head with a
  // place or a trade after it is still a position.
  check('C2d-MUT: "עבודה בניקיון משרדים" and "עבודת מזכירות" stay job seekers',
    issue('עבודה בניקיון משרדים', CLEANER_WITH_BLOG) === 'job_seeker' && issue('עבודת מזכירות', CLEANER_WITH_BLOG) === 'job_seeker')
  check('C2e-MUT: and a real job search on the web studio is still one',
    issue('דרושים מפתחי אתרים', WEB_STUDIO) === 'job_seeker', String(issue('דרושים מפתחי אתרים', WEB_STUDIO)))
}

// ── D) a business that is itself in hiring ───────────────────────────────────
console.log('\nD) the hiring business keeps its own subject')
{
  check('D1: "דרושים עובדים" is kept', issue('דרושים עובדים', STAFFING) === null)
  // (The relevance vocabulary still has its own say: a staffing company whose
  //  pages never mention cleaning is a different rejection, not this one.)
  check('D2: "משרות השמה" is kept', issue('משרות השמה', STAFFING) === null,
    String(issue('משרות השמה', STAFFING)))
  check('D2b: a cleaning keyword is rejected on its merits, not as a job seeker',
    issue('משרות ניקיון בתל אביב', STAFFING) === 'unrelated', String(issue('משרות ניקיון בתל אביב', STAFFING)))
  check('D3: "עבודה בניקיון משרדים" is kept — the head rule is off for this project',
    issue('עבודה בניקיון משרדים', STAFFING) === null)
  // MUTATION CONTROL D — one careers page does not make a cleaning company a
  // staffing company: its vocabulary does not say the words.
  check('D4-MUT: the same three on the cleaning company are all job seekers',
    ['דרושים עובדים', 'משרות ניקיון בתל אביב', 'עבודה בניקיון משרדים']
      .every((k) => issue(k, CLEANER_WITH_BLOG) === 'job_seeker'))
}

// ── E) nothing to judge by ───────────────────────────────────────────────────
console.log('\nE) no vocabulary, no rejection')
{
  check('E1: an empty vocabulary rejects nothing', issue('דרושים מנקה', new Set()) === null)
  check('E2: a null vocabulary rejects nothing', issue('דרושים מנקה', null) === null)
  check('E3: and the head rule is off too', issue('עבודה בניקיון משרדים', null) === null)
  // MUTATION CONTROL E — with a vocabulary, the same keywords are rejected.
  check('E4-MUT: with the cleaning company\'s vocabulary both are job seekers',
    issue('דרושים מנקה', CLEANER) === 'job_seeker' && issue('עבודה בניקיון משרדים', CLEANER) === 'job_seeker')
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
