/**
 * THE AUDIENCE GATE, MEASURED OVER THE WHOLE FLEET (15 November 2026).
 *
 * Oren asked the right question about the audience rule: "did you make a full fix,
 * so situations like these do not happen again?" — after the first version of it
 * blocked "מתנות לעובדים" on a gift shop and "השכרת רכב ביפן" on a travel site.
 * A rule written from one project's keywords is tested on one project's keywords.
 * This suite is the net: every keyword in Production that the rule TOUCHES, taken
 * from `keyword_research_cache` across all projects on 15 Nov 2026, with each
 * project's own vocabulary built the way buildSiteVocabulary builds it.
 *
 * The sweep found a third false block nobody had reported — "עבודת אינסטלציה" on
 * ניאגרות סמויות, a plumber, whose own trade that is. The construct form 'עבודת'
 * came out of the head rule because of it.
 *
 * SO: when the hiring word lists change, run this. A keyword that belongs to a
 * merchant's trade or market must never come back as `job_seeker`, whatever else
 * the relevance gate decides about it, and a job search must never pass.
 * Run: npx tsx lib/content/recommendations/__qa__/audience-intent-fleet.qa.ts
 */
import { readFileSync } from 'fs'
import { tokens } from '@/lib/content/recommendations/dedupe'
import { heStem, researchKeywordIssue } from '@/lib/content/recommendations/keyword-research'

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
    const stem = heStem(tk)
    if (stem && stem !== tk) vocab.add(stem)
  }
  return vocab
}
const issue = (kw: string, vocab: Set<string>) => researchKeywordIssue(kw, { brandTokens: new Set(), vocab })

interface FleetProject {
  /** The project as Production holds it. */
  name: string
  /** Business name + the merchant's own page titles + its real tracked keywords. */
  vocabSources: string[]
  /** Cached research keywords the audience rule touches, and MUST reject. */
  jobSearch: string[]
  /** Keywords of the merchant's own trade or market it must NEVER reject. */
  ownMarket: string[]
}

const FLEET: FleetProject[] = [
  {
    name: 'מספר 1 בניקיון (1cln.co.il) — office cleaning, a thin site',
    vocabSources: [
      'מספר 1 בניקיון - חברת ניקיון משרדים', 'ניקיון משרדים בפתח תקווה', 'ניקיון משרדים בהרצליה',
      'ניקיון משרדים במרכז', 'ניקיון משרדים בתל אביב', 'ניקיון משרדים בגבעתיים', 'ניקיון משרדים ברמת גן',
      'ניקיון משרדים בראשון לציון', 'ניקיון משרדים בערב', 'ניקיון משרדים בחיפה', 'ניקיון מבנים',
      'ניקיון בניינים', 'ניקיון משרדים בכפר סבא', 'ניקיון משרדים באשדוד', 'ניקיון משרדים בבת ים',
      'ניקיון משרדים בירושלים', 'ניקיון משרדים ברעננה',
    ],
    jobSearch: [
      'אחרי דרושים', 'דרושות מזכירות', 'דרושים מנקה', 'דרושים מפקחים', 'דרושים קריירה',
      'דרושים שיפוצניקים', 'מזכירות דרושים', 'משרדי השמה', 'עם עובד דרושים', 'תעסוקה משרד',
      'דרושים ניקיון משרדים בערב בתל אביב', 'עבודה בגנים', 'עבודה במשרדים', 'עבודה בניקיון',
      'עבודה בניקיון משרדים', 'עבודה היום', 'עבודה ניקיון', 'עבודה ניקיון משרדים', 'עבודה תל אביב',
    ],
    ownMarket: ['ניקיון משרדים בערב', 'ניקיון בניינים', 'חברת ניקיון משרדים בתל אביב', 'ניקיון מבנים'],
  },
  {
    name: 'הלהיט בניקיון — the same trade, but a blog that says \'עבודה\'',
    vocabSources: [
      'הלהיט בניקיון', 'ניקיון משרדים בערב', 'חברת ניקיון משרדים בתל אביב', 'ניקיון בניינים / מבנים',
      'סדר וניקיון במשרד: המדריך המלא לסביבה פרודוקטיבית', 'ניקיון לאחר עבודות ניסור בטון',
      'האם עובש במשרד מסכן את בריאות העובדים?', 'העסקת עובדת ניקיון באופן ישיר מול חברת ניקיון',
      'כוח אדם', 'שירותי ניקיון למשרדים', 'ניקוי חלונות למשרדים', 'ניקיון משרדים הייטק',
      'ניקיון משרדים בשעות הבוקר בתל אביב', 'תחזוקת משרדים שוטפת',
    ],
    jobSearch: [
      'אתגרים דרושים', 'דרושה מנקה', 'דרושה עבודה', 'דרושה עובדת ניקיון', 'דרושות מנקות',
      'דרושים בנייה', 'דרושים מאבטח', 'דרושים מנקים', 'דרושים שמירה', 'דרושים תכנות',
      'חברת השמה כח אדם', 'חיפוש עבודה', 'חיפוש עבודה בתל אביב', 'מאבטחים דרושים',
      'מחפשת עבודה בתל אביב', 'מקום עבודה', 'משרדי השמה', 'משרות תוכנה', 'שירותי השמה',
      'עבודה באזור המרכז', 'עבודה בבוקר', 'עבודה בבית', 'עבודה בגבעתיים', 'עבודה במטבח',
      'עבודה במרכז', 'עבודה במשרד', 'עבודה בניקיון', 'עבודה בניקיון משרדים', 'עבודה בערב',
      'עבודה בשמירה', 'עבודה בתל אביב', 'עבודה חדשה', 'עבודה יומית', 'עבודה כוח אדם',
      'עבודה לנשים', 'עבודה מזכירות', 'עבודה משרדית', 'עבודה נוספת בערב', 'עבודה ניקיון',
      'עבודה ניקיון משרדים', 'עבודה צדדית', 'עבודה שמירה בלילה',
    ],
    ownMarket: [
      'ניקיון לאחר עבודות ניסור בטון', 'העסקת עובדת ניקיון', 'ניקיון משרדים הייטק',
      'תחזוקת משרדים שוטפת', 'ניקוי חלונות למשרדים',
    ],
  },
  {
    name: 'Janitorial NYC — English, commercial cleaning',
    vocabSources: [
      'Janitorial NYC', 'commercial cleaning company', 'office cleaning services nyc',
      'commercial janitorial services', 'restaurant cleaning services', 'office cleaning prices',
      'industrial cleaning companies', 'building cleaning services', 'facility cleaning services',
      'corporate office cleaning', 'commercial deep cleaning services',
    ],
    jobSearch: [
      'commercial cleaning jobs', 'commercial cleaning jobs near me', 'contract cleaning jobs',
      'office cleaning jobs', 'office cleaning jobs near me',
    ],
    ownMarket: ['office cleaning prices', 'commercial janitorial services', 'restaurant deep cleaning services'],
  },
  {
    name: 'מטלון — a web studio with a careers page',
    vocabSources: [
      'מטלון', 'בניית אתרים', 'קידום אתרים', 'עיצוב אתרים', 'חנות אונליין', 'וורדפרס',
      'קריירה', 'מאמרים', 'אתרי תדמית', 'דף נחיתה',
    ],
    jobSearch: ['דרושים וורדפרס'],
    ownMarket: ['בניית אתרים בוורדפרס', 'קידום אתרים אורגני', 'עיצוב אתרי תדמית'],
  },
  // ── and the merchants the FIRST version of the rule got wrong ──────────────
  {
    name: 'הסוד בלונים ומתנות — gifts, whose best keywords are gifts FOR employees',
    vocabSources: [
      'הסוד בלונים ומתנות', 'מתנות לעובדים', 'שי לחג לעובדים', 'מארזי מתנה לעובדים',
      'מארז המנהלים', 'מתנה לבוס', 'מתנות למשרד', 'מתנות ממותגות ללקוחות',
      'משלוחי מתנות מהיום למחר', 'מתנות לפורים לעובדים', 'מתנות סוף שנה לצוות',
    ],
    jobSearch: [],
    ownMarket: [
      'מתנות לעובדים', 'מתנות ממותגות לעובדים', 'שי לעובדים', 'מארזים לעובדים לראש השנה',
      'כרטיסי מתנה לעובדים', 'משלוח מנות לעובדים', 'מתנות לחגים לעובדים', 'מתנות קטנות לעובדים',
      'גיפט קארד מתנה לעובדים', 'מתנות זולות לעובדים', 'רעיונות למתנות לעובדים',
      'מתנות ליום האישה לעובדות',
    ],
  },
  {
    name: 'Japan4U — travel, where \'שכר\' lives inside \'השכרה\'',
    vocabSources: [
      'Japan4U', 'מדריך טיולים ליפן', 'השכרת רכב ביפן', 'מלונות בטוקיו', 'כרטיס רכבות ביפן',
      'טיסות זולות ליפן', 'מסעדות כשרות ביפן', 'אונסן יפן', 'קיוטו', 'אוסקה',
    ],
    jobSearch: [],
    ownMarket: ['השכרת רכב ביפן', 'השכרת רכב בטוקיו'],
  },
  {
    name: 'ניאגרות סמויות (ירון סלמון) — a plumber, whose trade IS \'עבודת אינסטלציה\'',
    vocabSources: [
      'ניאגרות סמויות - ירון סלמון', 'ניאגרה סמויה', 'תיקון ניאגרה סמויה', 'אסלות סמויות',
      'אינסטלטור בנתניה', 'אינסטלטור מומלץ', 'יועץ אינסטלציה', 'הכנת תשתית לניאגרה סמויה',
      'שלבי ההתקנה של ניאגרות סמויות: המדריך המלא', 'תקלות נפוצות בצנרת גיבריט',
    ],
    jobSearch: [],
    ownMarket: ['עבודת אינסטלציה', 'עבודות אינסטלציה בבית', 'יועץ אינסטלציה'],
  },
  {
    name: '4Dogs Original — a dog store whose own word is \'תעסוקה\'',
    vocabSources: [
      '4Dogs Original', 'צעצועי תעסוקה לכלבים', 'מיטות לכלבים', 'רצועות לכלבים', 'חטיפים לכלבים',
      'משחקי תעסוקה לכלבים', 'מזרן לכלבים גדולים',
    ],
    jobSearch: [],
    ownMarket: ['צעצועי תעסוקה לכלבים', 'פעילות ותעסוקה לכלבים', 'משחקי תעסוקה לכלבים'],
  },
  {
    name: 'JUP — a professionals directory, where \'עובדת ניקיון\' is a customer hiring one',
    vocabSources: [
      'JUP', 'מנקה בתל אביב', 'ניקיון לבית', 'הנדימן', 'אינסטלטור', 'חשמלאי', 'מנעולן מומלץ',
      'הובלות', 'ניהול בניינים משותפים', 'חברת ניקיון בתל אביב: המדריך המלא לבחירה נכונה',
      'מנקה לבית: המדריך המלא לבחירה, תיאום ציפיות וניהול נכון',
    ],
    jobSearch: [],
    ownMarket: ['עובדת ניקיון', 'עובדות ניקיון', 'מנקה בתל אביב'],
  },
  {
    name: 'אוליגרך פרפיום — a perfume shop, where a job interview is an occasion to buy for',
    vocabSources: [
      'אוליגרך פרפיום', 'בשמי יוקרה לגבר', 'בשמים לאישה', 'אאו דה פרפיום', 'בושם לגבר',
      'בשמי נישה', 'מארזי בשמים', 'בושם לאישה מתנה',
    ],
    jobSearch: [],
    ownMarket: ['בושם יוקרה לגבר לראיון עבודה', 'מארזי בשמים לגבר'],
  },
  {
    name: 'hm soft — a web studio, where \'עבודה מול\' is a relation, not a position',
    vocabSources: [
      'hm soft', 'בניית אתרים', 'עיצוב אתרים', 'חנויות אונליין', 'קידום אתרים', 'מעצבי אתרים',
      'מערכות ניהול תוכן', 'אפיון אתרים',
    ],
    jobSearch: [],
    ownMarket: ['עבודה מול מעצבי אתרים', 'עבודה עם מעצב גרפי'],
  },
]

let jobSeekerTotal = 0
for (const p of FLEET) {
  console.log(`\n${p.name}`)
  const vocab = vocabularyOf(p.vocabSources)
  let rejected = 0, byAudience = 0
  for (const kw of p.jobSearch) {
    const got = issue(kw, vocab)
    if (got) rejected++
    else check(`  "${kw}" must not pass`, false, 'PASS')
    if (got === 'job_seeker') byAudience++
  }
  if (p.jobSearch.length > 0) {
    check(`none of the ${p.jobSearch.length} job searches passes`, rejected === p.jobSearch.length)
    // An earlier rule may get there first (a support word, the relevance
    // vocabulary); what matters is that the audience rule carries most of them,
    // because on these projects the other rules were what let them through.
    check(`and the audience rule is what rejects most of them (${byAudience}/${p.jobSearch.length})`, byAudience >= Math.ceil(p.jobSearch.length * 0.8), `${byAudience}/${p.jobSearch.length}`)
    jobSeekerTotal += byAudience
  }
  let wrong = 0
  for (const kw of p.ownMarket) {
    const got = issue(kw, vocab)
    if (got === 'job_seeker') { wrong++; check(`  "${kw}" must NOT be a job seeker`, false, 'job_seeker') }
  }
  check(`none of the ${p.ownMarket.length} own-market keywords is rejected as job_seeker`, wrong === 0)
}

// The sweep is only a net if it covers what the rule can reach. Every keyword the
// rule touched in Production on 15 Nov 2026 is above; this counts them, so a
// future thinning of the fixtures is visible in the diff rather than silent.
const jobs = FLEET.reduce((n, p) => n + p.jobSearch.length, 0)
const own = FLEET.reduce((n, p) => n + p.ownMarket.length, 0)
console.log('\ncoverage')
check(`every job-search keyword the rule touched in Production is here (${jobs})`, jobs >= 67, String(jobs))
check(`and ${own} own-market keywords from 11 projects stand against them`, own >= 40, String(own))
check(`the audience rule itself rejects ${jobSeekerTotal} of the ${jobs}`, jobSeekerTotal >= 60, String(jobSeekerTotal))

// ── the net AFTER a merge: the production log line ───────────────────────────
// The sweep above catches a bad rule before it ships. This catches one that
// ships anyway: every run writes how many keywords each gate removed, per
// project, so a project whose own words are being thrown away is visible in the
// Vercel logs instead of just going quiet.
console.log('\nthe production log line')
{
  const engine = readFileSync('lib/content/recommendations/engine.ts', 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const line = engine.slice(engine.indexOf("'[keyword-research] gate'"), engine.indexOf("'[keyword-research] gate'") + 600)
  check('the gate counts are logged in production, not only in the dev debug block', line.length > 100 && /filteredJobSeekerCount/.test(line))
  check('…by project, so one project can be read on its own', /projectId/.test(line))
  check('…with the other gates beside it, so a shift between them is visible',
    /filteredUnrelatedCount/.test(line) && /filteredGenericCount/.test(line) && /candidateCount/.test(line))
  // A runtime log is not a place for a customer's content (funnel-log.ts's rule).
  check('…and it carries NO merchant text: counts and our own names only',
    !/Examples/.test(line) && !/keyword:/.test(line) && !/title/.test(line))
  check('it cannot fail a run', /try \{/.test(engine.slice(engine.indexOf("'[keyword-research] gate'") - 200, engine.indexOf("'[keyword-research] gate'"))))
  // MUTATION CONTROLS: the guards above must fail on a line that lost the count,
  // lost the project, or gained a merchant's keyword.
  const withoutCount = line.replace(/filteredJobSeekerCount/g, 'x')
  const withoutProject = line.replace(/projectId/g, 'x')
  const withExamples = line.replace('projectId', 'filteredJobSeekerExamples, projectId')
  check('MUT: a line without the job-seeker count fails the guard', !/filteredJobSeekerCount/.test(withoutCount))
  check('MUT: a line without the project fails the guard', !/projectId/.test(withoutProject))
  check('MUT: a line carrying examples fails the no-merchant-text guard', /Examples/.test(withExamples))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
