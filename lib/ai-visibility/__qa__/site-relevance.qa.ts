/**
 * The recommended AI questions and the research's opportunities are judged by
 * the site's own content (w8-relevance): site-topics.ts, question-worth.ts
 * (SITE CONTENT), the question prompt, keyword-research/site-relevance.ts and
 * the research model and screen.
 *
 *   A  the site's profile on japan4u's real page titles (Production, read-only):
 *      the subject is "יפן", not the field's words; names, half-names and the
 *      page each question is about
 *   B  question worth with the profile: page and gap questions first, the
 *      niche's after, generic ones dropped; without a profile nothing changes
 *   C  generation: the prompt carries the site's titles, niche and the
 *      no-generic rule; the route reads the pages owner-fenced; title questions
 *   D  keyword research: related first, the rest apart and collapsed, never
 *      dropped; the route, the wire and the screen
 *
 * Every rule has a mutation control.
 *
 * Run: npx tsx lib/ai-visibility/__qa__/site-relevance.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import * as T from '../site-topics'
import * as W from '../question-worth'
import { siteContentPromptBlock } from '../gemini-semantic-classifier'
import { createI18n } from '../i18n'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import * as R from '../../keyword-research/site-relevance'
import * as M from '../../keyword-research/model'
import { handleScanResearchGet, type ScanRouteDeps } from '../../keyword-research/scan-route'
import { readResearchAnswer } from '../../keyword-research/scan-state'
import type { ScanKeyword } from '../../keyword-research/scan-research'
import { dashboardHe as dashHe } from '../../i18n/dashboard/he'
import { dashboardEn as dashEn } from '../../i18n/dashboard/en'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
let mutants = 0
function mutant<X>(file: string, from: string | RegExp, to: string): X {
  const src = read(file)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${file}: ${String(from)}`)
  const dir = file.slice(0, file.lastIndexOf('/'))
  const pinned = out.replace(/(from\s+|require\(|import\()(['"])(\.\.?\/[^'"]*)\2/g, (_m, pre: string, q: string, spec: string) => `${pre}${q}${join(ROOT, dir, spec)}${q}`)
  const path = join(__dirname, `.qa-mut-site-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, pinned)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as X
  } finally {
    unlinkSync(path)
  }
}

// japan4u's page titles as site_page_map holds them (Production, read-only SELECT, 2026-09-29).
const TITLES = [
  'מדריך טיולים ליפן', 'טיסות זולות ליפן', 'כרטיס סים ליפן &#8211; ESIM ליפן של חברת Airalo', 'מסעדות כשרות ביפן',
  'כמה זמן מראש מומלץ לסגור חופשה ביפן?', 'ביטוח טיול ליפן', 'ביטוח נסיעות ליפן', 'ביטוח רפואי ליפן',
  'עובדות על יפן &#8211; המסלולים המומלצים, האטרקציות ועוד', 'טבע ביפן', 'אוקינאווה', 'כרטיס רכבות ביפן', 'איך לבחור מלונות בטוקיו?',
  'טקיאמה', 'טוקיו', 'ניקו', 'הוקאידו', 'קיוטו', 'אוסקה', 'נארה', 'נגויה', 'יוקוהמה', 'קנזאווה', 'האקונה', 'הירושימה',
  '7 טיפים לטיול עם ילדים ביפן', '6 טיפים לשילוב אטרקציות בטיול שלכם ליפן', 'תכנון טיול ליפן – הנה מה שחשוב לתכנן לפני',
  'סודות הזן והיפן: הרצאה מרתקת על אמנות יפנית', 'מתי כדאי לטוס ליפן – מדריך עונות, מזג אוויר ועונת הפריחה',
  'ניתוק תושבות מס הכנסה במעבר ליפן: מדריך מעשי לפני רילוקיישן', 'האלפים היפנים: מסלולי הליכה ונופים עוצרי נשימה',
  'היכן למצוא את השלכת היפה ביותר ביפן: 10 יעדים מומלצים', 'טיול ביפן בתקציב מוגבל: 10 טיפים לחסכון מבלי לוותר על החוויה',
  'היעדים המושלמים לבילוי ביפן בחורף: שלג, מעיינות חמים ותרבות', 'יפן מול דרום קוריאה: המדריך המלא לבחירת היעד המושלם עבורך',
  'עלויות טיול ליפן: כמה יעלה לכם מסע של שבועיים?', 'טיול ביפן עם ילדים: המדריך המלא למשפחות מטיילות',
  'מנהגי אירוח ביפן: המדריך המלא לנימוסים, מנהגים וטיפים למטייל', 'המדריך המלא לאוכל רחוב יפן: מה חייבים לטעום ומאיפה להתחיל?',
  'טיול יפן אביב: המדריך המלא לפריחת הדובדבן והאטרקציות המומלצות', 'מזג אוויר יפן: המדריך המלא לתכנון טיול בכל עונה',
  'טירת אוסקה: המדריך המלא להיסטוריה, ארכיטקטורה וביקור', 'מסלול 7 ימים ביפן: המדריך המלא לטוקיו, קיוטו והאקונה',
  'אונסן יפן: המדריך המלא לחוויית המעיינות החמים המסורתיים', 'קיוטו למטייל הראשון: המדריך המלא לביקור בעיר המקדשים והגנים',
  'הכירו את הראמן היפני: המדריך המלא לסוגים, מרכיבים ואיפה לאכול', 'הקדמה ליפן: המדריך המלא לתכנון טיול ראשוני ביפן',
  'טוקיו מול קיוטו: המדריך המלא לבחירת היעד המושלם ביפן', 'איים ביפן: חמשת האיים המומלצים ביותר שכדאי לכם להכיר',
  'סיור קולינרי בשוק הדגים טוקיו (טויסו): המדריך המלא', 'טיול רומנטי ביפן: המדריך המלא לחופשה זוגית בלתי נשכחת',
  'טיול ביפן עם ילדים: המדריך המלא למשפחות (אטרקציות וטיפים)', 'טיול בסתיו ביפן: המדריך המלא לשלכת, פסטיבלים ומסלולים',
  'הכירו את סוגי הלינה ביפן: מהו ריוקן, מינשוקו וקפסולה?', 'איך להתמודד עם מחסום השפה ביפן: מדריך לימוד יפנית למטייל',
  'הקודקס של חובב הסושי: המדריך המלא על סוגי סושי ביפן', 'גני שעשועים ופארקי שעשועים ביפן: המדריך המלא לדיסני, יוניברסל ועוד',
  'קניות ביפן למטייל: המדריך המלא לקנייה חכמה', 'איך להזמין טיסה ליפן: המדריך המלא לבחירת חברת תעופה, תאריכים ומחירים',
  'יפן 2025 &#8211; המדריך המלא למטיילים למדינת השמש העולה', 'בלוג', 'יצירת קשר', 'מדיניות פרטיות', 'תנאי שימוש', 'הצהרת נגישות',
]
const NICHE = 'מדריך טיולים ליפן לישראלים'
const KEYWORDS = ['אוכל רחוב יפן', 'טיול יפן אביב', 'מזג אוויר יפן', 'טירת אוסקה', 'מסלול 7 ימים יפן', 'אונסן יפן', 'עלויות טיול יפן', 'טוקיו', 'קיוטו', 'הזמנת טיסה ליפן']
const PAGES = TITLES.map((title, i) => ({ title, url: `https://japan4u.co.il/p${i}/` }))
const INPUT: T.SiteTopicsInput = { pages: PAGES, niche: NICHE, businessName: 'Japan4U', domain: 'japan4u.co.il', category: 'travel', terms: KEYWORDS }
const topics = T.buildSiteTopics(INPUT)
if (!topics) throw new Error('no profile for the fixture')
const pageTitle = (q: string, t: T.SiteTopics = topics) => T.pageFor(q, t)?.title ?? null
const LESS = ['טיולים בדרום', 'טיול בדרום', 'מסלולי טיול בצפון', 'אטרקציות בדרום', 'תכנון טיול']
const MORE = ['טוקיו', 'מלונות בטוקיו', 'דרום קוריאה', 'קיוטו יפן', 'אונסן']
const scoreOf = (k: string, t: T.SiteTopics = topics) => T.topicMatch(k, t).score

console.log('\nA) the site\'s profile, from its own page titles')
{
  check('A1: the site\'s subject is "יפן" alone, not the field\'s words ("טיול", "מדריך")', show(topics.core.map((c) => topics.display[c] ?? c)) === show(['יפן']), show(topics.core))
  const low = LESS.filter((k) => scoreOf(k) >= T.RELATED_MIN)
  check('A2: trips in Israel\'s south and north and plain trip planning are below RELATED_MIN', low.length === 0, show(LESS.map((k) => [k, T.topicMatch(k, topics)])))
  const high = MORE.filter((k) => scoreOf(k) < T.RELATED_MIN)
  check('A3: the site\'s places and subjects (and the South Korea page) are related', high.length === 0, show(MORE.map((k) => [k, T.topicMatch(k, topics)])))
  check('A4: the subject outranks a page\'s subject, which outranks a name, which outranks the field\'s words',
    scoreOf('קיוטו יפן') > scoreOf('קיוטו') && scoreOf('קיוטו') > scoreOf('אונסן') && scoreOf('אונסן') > scoreOf('טיולים בדרום'),
    show(['קיוטו יפן', 'קיוטו', 'אונסן', 'טיולים בדרום'].map((k) => T.topicMatch(k, topics))))
  check('A5: each question opens the page it is about (Kinkaku-ji → Kyoto, flights → how to book a flight, family → the family guide)',
    /^קיוטו/.test(pageTitle("מה המחיר של כרטיס כניסה למקדש קינקאקו-ג'י בקיוטו?") ?? '') &&
    /טיס/.test(pageTitle('כמה עולה טיסה הלוך ושוב ליפן מישראל?') ?? '') &&
    /ילדים/.test(pageTitle('איזה סוג טיול ביפן הכי מתאים למשפחות עם ילדים קטנים?') ?? ''),
    show(["מה המחיר של כרטיס כניסה למקדש קינקאקו-ג'י בקיוטו?", 'כמה עולה טיסה הלוך ושוב ליפן מישראל?', 'איזה סוג טיול ביפן הכי מתאים למשפחות עם ילדים קטנים?'].map((q) => pageTitle(q))))
  const HALF = ['מה עלות השכירות של כיס אוויר (pocket wifi) לטיול ביפן?', 'מה עושים בדרום יפן?', 'איך מזג האוויר ביפן באביב?', 'מה עדיף, יפן או דרום קוריאה?']
  check('A6: a half-name opens nothing alone ("כיס אוויר" is not the weather page, "דרום יפן" not the South Korea page); the whole name does',
    !/מזג/.test(pageTitle(HALF[0]) ?? '') && pageTitle(HALF[1]) === null && /מזג/.test(pageTitle(HALF[2]) ?? '') && /קוריאה/.test(pageTitle(HALF[3]) ?? ''),
    show(HALF.map((q) => pageTitle(q))))
  check('A7: a word several subjects start with picks none alone: a SIM question is not the rail pass page',
    !/רכבות/.test(pageTitle('האם ניתן לרכוש כרטיס SIM מקומי ביפן מראש?') ?? ''), show(pageTitle('האם ניתן לרכוש כרטיס SIM מקומי ביפן מראש?')))
  check('A8: a page scoped to the subject answers nothing outside it ("ביטוח נסיעות ליפן" is not a trip-abroad insurance answer)',
    pageTitle('איך בוחרים ביטוח נסיעות לחו״ל?') === null && /ביטוח/.test(pageTitle('מה העלות של ביטוח נסיעות לטיול ביפן?') ?? ''),
    show([pageTitle('איך בוחרים ביטוח נסיעות לחו״ל?'), pageTitle('מה העלות של ביטוח נסיעות לטיול ביפן?')]))
  check('A9: too few titled pages (utility pages do not count) → no profile',
    T.buildSiteTopics({ ...INPUT, pages: [...PAGES.slice(0, 4), ...PAGES.slice(-5)] }) === null)
  check('A10: the wire reader keeps a real profile and drops a malformed one',
    show(T.readSiteTopics(JSON.parse(show(topics)))) === show(topics) && T.readSiteTopics({ ...topics, core: 'יפן' }) === null && T.readSiteTopics(null) === null)

  const noField = mutant<typeof T>('lib/ai-visibility/site-topics.ts', '.filter((c) => !hasStem(fieldStems, c))', '')
  const nt = noField.buildSiteTopics(INPUT)!
  check('A11: MUT the field\'s words kept in the subject fails A2 ("טיולים בדרום" becomes related)', LESS.some((k) => noField.topicMatch(k, nt).score >= noField.RELATED_MIN))
  const oneSided = mutant<typeof T>('lib/ai-visibility/site-topics.ts', '.filter((p) => partners.get(p)?.has(c))', '')
  const ot = oneSided.buildSiteTopics(INPUT)!
  check('A12: MUT one-sided binding fails A6 or A7 (a half-name or a shared word opens the wrong page)',
    /מזג/.test(oneSided.pageFor('מה עלות השכירות של כיס אוויר (pocket wifi) לטיול ביפן?', ot)?.title ?? '') ||
    /רכבות/.test(oneSided.pageFor('האם ניתן לרכוש כרטיס SIM מקומי ביפן מראש?', ot)?.title ?? '') ||
    oneSided.topicMatch('רכבות מהירות', ot).score < T.RELATED_MIN)
  const noHalf = mutant<typeof T>('lib/ai-visibility/site-topics.ts', 'if (halfName(key, topics) &&', 'if (false &&')
  check('A13: MUT a half-name opening its page alone fails A6', /קוריאה/.test(noHalf.pageFor(HALF[1], noHalf.buildSiteTopics(INPUT)!)?.title ?? ''))
  const noScope = mutant<typeof T>('lib/ai-visibility/site-topics.ts', 'if (!namesCore && page.words.some((w) => hasStem(topics.core, w))) continue', '')
  check('A14: MUT dropping the subject-scoped page rule fails A8', noScope.pageFor('איך בוחרים ביטוח נסיעות לחו״ל?', noScope.buildSiteTopics(INPUT)!) !== null)
  const noShared = mutant<typeof T>('lib/ai-visibility/site-topics.ts', 'ownHits < (shared ? 2 : 1)', 'ownHits < 1')
  check('A15: MUT a shared first word opening a page alone fails A7', /רכבות|סים/.test(noShared.pageFor('איזה כרטיס כדאי לקנות ביפן?', noShared.buildSiteTopics(INPUT)!)?.title ?? '') &&
    T.pageFor('איזה כרטיס כדאי לקנות ביפן?', topics) === null)
}

// The suggestion list: page and gap questions, the niche's, and the generic ones that ranked high before.
const CTX: W.WorthContext = {
  businessName: 'Japan4U', identityLabel: NICHE, category: 'travel', keywords: KEYWORDS,
  scanTerms: ['מטיילים ישראלים המתכננים טיול ליפן', 'תכנון טיול ליפן'], pages: PAGES, plannedTopics: [],
}
const SITE_CTX: W.WorthContext = { ...CTX, siteTopics: topics }
const GENERIC: Array<[string, string]> = [
  ['איזה אתר מומלץ לתכנון טיול לחו״ל?', 'recommendation'], ['עדיף טיול מאורגן או טיול עצמאי?', 'comparison'],
  ['איך מתכננים מסלול לטיול עצמאי?', 'informational'], ['כמה עולה טיול מאורגן לחו״ל?', 'commercial'],
]
const PAGE_Q: Array<[string, string]> = [
  ['כמה עולה טיסה הלוך ושוב ליפן מישראל?', 'commercial'], ['מה העלות של ביטוח נסיעות לטיול ביפן?', 'commercial'],
  ["מה המחיר של כרטיס כניסה למקדש קינקאקו-ג'י בקיוטו?", 'commercial'], ['איזה סוג טיול ביפן הכי מתאים למשפחות עם ילדים קטנים?', 'pre_purchase'],
]
const GAP_Q: Array<[string, string]> = [['איפה אפשר למצוא מידע אמין על תרבות ואתיקה ביפן?', 'informational']]
const NICHE_Q: Array<[string, string]> = [['מה המחיר הממוצע לטיול מאורגן של שבועיים ביפן?', 'commercial']]
const LIST = [...GENERIC, ...NICHE_Q, ...GAP_Q, ...PAGE_Q].map(([prompt, intent], i) => ({ id: `q${i}`, prompt, intent }))

console.log('\nB) question worth, judged by the site\'s content')
{
  const ranked = W.rankByWorth(LIST, SITE_CTX)
  const kept = new Set(ranked.map((r) => r.prompt))
  check('B1: the generic questions any travel business could get are not shown', GENERIC.every(([p]) => !kept.has(p)), show(ranked.map((r) => [r.prompt, r.worth.score])))
  const pages = ranked.filter((r) => r.worth.specificity === 'page')
  check('B2: every question a page answers is shown, pointing at that page ("improve it")',
    PAGE_Q.every(([p]) => pages.some((r) => r.prompt === p && r.worth.answeringPage && r.worth.why.win === 'page')), show(ranked.map((r) => [r.prompt, r.worth.specificity, r.worth.answeringPage?.title])))
  const gap = ranked.find((r) => r.prompt === GAP_Q[0][0])
  check('B3: a subject the site covers with no page is a gap ("write a complementary article"), naming the subject',
    gap?.worth.specificity === 'gap' && gap.worth.why.relevance.kind === 'gap' && gap.worth.answeringPage === null, show(gap?.worth))
  const order = ranked.map((r) => W.SPECIFICITY_ORDER[r.worth.specificity!])
  check('B4: site-specific first: page and brand, then gaps, then the niche\'s', order.every((o, i) => i === 0 || order[i - 1] <= o) && order.length === ranked.length, show(ranked.map((r) => [r.worth.specificity, r.worth.score])))
  const niche = W.scoreQuestion(NICHE_Q[0][0], NICHE_Q[0][1], SITE_CTX)
  const nicheLegacy = W.scoreQuestion(NICHE_Q[0][0], NICHE_Q[0][1], CTX)
  check('B5: a question naming only the niche scores below the site-specific ones', niche.specificity === 'niche' && pages.every((p) => p.worth.score > niche.score) && niche.score < nicheLegacy.score, show([niche, nicheLegacy.score]))
  const brand = W.scoreQuestion('חוות דעת על Japan4U', 'brand', SITE_CTX)
  check('B6: a question naming the business stays', brand.specificity === 'brand' && brand.score >= W.WORTH_THRESHOLD, show(brand))
  const legacy = W.rankByWorth(LIST, CTX)
  check('B7: without the site\'s profile nothing changes (the legacy rules keep the generic site question, no specificity)',
    legacy.some((r) => r.prompt === GENERIC[0][0]) && legacy.every((r) => r.worth.specificity === null), show(legacy.map((r) => r.prompt)))

  const scoreOnly = mutant<typeof W>('lib/ai-visibility/question-worth.ts', '.sort((a, b) => rank(a.worth) - rank(b.worth) || b.worth.score - a.worth.score)', '.sort((a, b) => b.worth.score - a.worth.score)')
  const so = scoreOnly.rankByWorth(LIST, SITE_CTX).map((r) => W.SPECIFICITY_ORDER[r.worth.specificity!])
  check('B8: MUT ranking by score alone fails B4', !so.every((o, i) => i === 0 || so[i - 1] <= o), show(so))
  const keepAll = mutant<typeof W>('lib/ai-visibility/question-worth.ts', 'specificity = null; winnability = 0; win = \'new\'', 'specificity = \'niche\'; winnability = 20; win = \'new\'')
  const ka = new Set(keepAll.rankByWorth(LIST, SITE_CTX).map((r) => r.prompt))
  check('B9: MUT keeping questions tied to nothing on the site fails B1', GENERIC.some(([p]) => ka.has(p)))
  const noGap = mutant<typeof W>('lib/ai-visibility/question-worth.ts', '} else if (entity) {', '} else if (false) {')
  check('B10: MUT no gap tier fails B3', noGap.scoreQuestion(GAP_Q[0][0], GAP_Q[0][1], SITE_CTX).specificity !== 'gap')

  const he = createI18n('he'), en = createI18n('en')
  const card = code('components/ai-visibility/sections/SmartQuestionCard.tsx')
  const gapLine = (s: string) => /r\.kind === 'gap'[\s\S]{0,80}t\('worth_rel_gap'\)\.replace\('\{term\}', r\.term\)/.test(s)
  check('B11: the card states the gap reason in dictionary words, Hebrew and English',
    gapLine(card) && /[א-ת]/.test(he('worth_rel_gap' as never)) && /\{term\}/.test(he('worth_rel_gap' as never)) && /\{term\}/.test(en('worth_rel_gap' as never)) && !/[א-ת]/.test(en('worth_rel_gap' as never)))
  check('B12: MUT dropping it fails B11', !gapLine(card.replace("t('worth_rel_gap')", "t('worth_rel_business')")))
  const section = code('components/ai-visibility/AIVisibilitySection.tsx')
  const wired = (s: string) => /const siteTopics = useMemo\(\(\) => buildSiteTopics\(\{\s*pages: questionContext\?\.pages/.test(s) && /\n\s*siteTopics,\n\s*\}\), \[/.test(s) &&
    /siteQuestionsRef\.current\.filter/.test(s) && /siteTitleQuestions\(questionContext\?\.pages/.test(s)
  check('B13: the tab builds the profile from the site\'s pages, scores by it, and adds the site\'s title questions', wired(section))
  check('B14: MUT the profile left out of the worth context fails B13', !wired(section.replace(/\n(\s*)siteTopics,\n(\s*)\}\), \[/, '\n$1\n$2}), [')))
}

console.log('\nC) generation from the site\'s content')
{
  const site = { pages: TITLES.slice(0, 50).map((t) => T.decodeTitle(t)), niche: NICHE, location: 'יפן' }
  const heBlock = siteContentPromptBlock('he', site)
  const enBlock = siteContentPromptBlock('en', site)
  check('C1: the Hebrew prompt lists the site\'s titles (at most 40), niche and location, and rules out generic questions',
    heBlock.includes('1. מדריך טיולים ליפן') && heBlock.includes('40. ') && !heBlock.includes('41. ') && heBlock.includes(NICHE) && heBlock.includes('מיקום: יפן') && /70%/.test(heBlock) && /אסור לכתוב שאלות כלליות/.test(heBlock))
  check('C2: the English prompt says the same', /70%/.test(enBlock) && /Do NOT write generic questions/.test(enBlock) && enBlock.includes(NICHE))
  check('C3: without pages the prompt is exactly what it was (no block)', siteContentPromptBlock('he', null) === '' && siteContentPromptBlock('en', { pages: [] }) === '')
  const gem = code('lib/ai-visibility/gemini-semantic-classifier.ts')
  const inPrompts = (s: string) => (s.match(/\$\{siteContentPromptBlock\('he', siteContent\)\}/g) ?? []).length === 1 && (s.match(/\$\{siteContentPromptBlock\('en', siteContent\)\}/g) ?? []).length === 1 &&
    /siteContent: SiteContentForPrompt \| null = null/.test(s)
  check('C4: both system prompts carry the block; the parameter defaults to none', inPrompts(gem))
  check('C5: MUT the Hebrew prompt without it fails C4', !inPrompts(gem.replace("${siteContentPromptBlock('he', siteContent)}", '')))
  const route = code('app/api/ai-visibility/enriched-suggestions/route.ts')
  const passes = (s: string) => /candidateCount,\s*await readSiteContent\(admin, projectId, user\.id, /.test(s) &&
    /readSiteMap\(admin, \{ projectId, userId \}, \{ entries: true \}\)/.test(s) && /readSeedScopeTerms\(admin, projectId, userId\)/.test(s)
  check('C6: the route passes the site\'s pages, read for the project AND its owner', passes(route))
  check('C7: MUT the route without them fails C6', !passes(route.replace(/await readSiteContent\(admin, projectId, user\.id, [^)]*\),/, '')))
  const store = code('lib/content/existing-content/site-map-store.ts')
  check('C8: readSiteMap filters by the project and the owner', /export async function readSiteMap[\s\S]{0,400}\.eq\('project_id', scope\.projectId\)\s*\.eq\('user_id', scope\.userId\)/.test(store))
  const qs = T.siteTitleQuestions(PAGES)
  check('C9: the site\'s own title questions: whole-title questions only, none addressed to the reader',
    qs.includes('איך לבחור מלונות בטוקיו?') && qs.includes('כמה זמן מראש מומלץ לסגור חופשה ביפן?') && qs.every((q) => !/[:–]|לכם/.test(q)) && qs.length <= T.MAX_TITLE_QUESTIONS, show(qs))
  const addr = mutant<typeof T>('lib/ai-visibility/site-topics.ts', '|| DIRECT_ADDRESS.test(title)) continue', ') continue')
  check('C10: MUT allowing direct address fails C9', addr.siteTitleQuestions([...PAGES, { title: 'מה חשוב לכם לדעת לפני טיסה ליפן?', url: '' }]).some((q) => /לכם/.test(q)))
}

// ── D) keyword research ─────────────────────────────────────────────────────
const kw = (keyword: string, volume = 1300): ScanKeyword => ({
  keyword, avgMonthlySearches: volume, competition: 'LOW', competitionIndex: 10, lowTopOfPageBid: 0.5, highTopOfPageBid: 2, currency: 'ILS',
  origins: ['site'], competitors: [], relevant: true,
})
// The research's own order put the south first (the biggest volume): the site's relevance must re-rank it.
const SCAN: ScanKeyword[] = [kw('טיולים בדרום', 9900), kw('מסלולי טיול בצפון', 8100), kw('הוקאידו יפן', 1900), kw('קיוטו יפן', 2400), kw('דרום קוריאה', 1600), kw('מלונות בטוקיו', 1000), kw('טיול בדרום', 880), kw('אונסן', 720)]
const researchTopics = R.researchSiteTopics({ titles: TITLES, niche: NICHE, businessName: 'Japan4U', domain: 'japan4u.co.il', terms: KEYWORDS })

async function sectionD() {
  console.log('\nD) keyword research: related first, the rest apart, nothing dropped')
  if (!researchTopics) { check('D0: a profile for the research', false); return }
  const base = { scanKeywords: SCAN, tracked: [], manual: null, google: null, chip: 'suggested' as const }
  const legacy = M.researchModel(base)
  const m = M.researchModel({ ...base, siteTopics: researchTopics })
  const less = m.lessRelatedWins.map((w) => w.row.keyword)
  check('D1: the south and north of Israel are "less related", the site\'s subjects are not', ['טיולים בדרום', 'מסלולי טיול בצפון', 'טיול בדרום'].every((k) => less.includes(k)) &&
    ['הוקאידו יפן', 'קיוטו יפן', 'דרום קוריאה', 'מלונות בטוקיו', 'אונסן'].every((k) => m.wins.some((w) => w.row.keyword === k)), show({ wins: m.wins.map((w) => w.row.keyword), less }))
  check('D2: nothing is dropped: related + less related = every easy win', m.wins.length + m.lessRelatedWins.length === legacy.wins.length &&
    [...m.wins, ...m.lessRelatedWins].every((w) => legacy.wins.some((l) => l.row.keyword === w.row.keyword)))
  const scores = m.wins.map((w) => m.relevance.get(w.row.keyword.toLowerCase())?.score ?? -1)
  check('D3: the most related first (the subject, then a page\'s subject, then a name)', scores.every((s, i) => i === 0 || scores[i - 1] >= s) && m.wins[0].row.keyword.includes('יפן'), show(m.wins.map((w, i) => [w.row.keyword, scores[i]])))
  check('D4: the "suggested" chip keeps every row, the related first', m.chipRows.length === legacy.chipRows.length &&
    show([...m.chipRows].map((r) => r.keyword).sort()) === show([...legacy.chipRows].map((r) => r.keyword).sort()) &&
    m.chipRows.slice(-3).every((r) => less.includes(r.keyword)), show(m.chipRows.map((r) => r.keyword)))
  check('D5: without a profile the model is exactly what it was', show(legacy.wins) === show(M.researchModel({ ...base, siteTopics: null }).wins) && legacy.lessRelatedWins.length === 0 &&
    legacy.wins[0].row.keyword === 'טיולים בדרום' && show(legacy.chipRows.map((r) => r.keyword)) === show(M.researchModel({ ...base, siteTopics: null }).chipRows.map((r) => r.keyword)))
  const allRelated = mutant<typeof M>('lib/keyword-research/model.ts', "const related = (r: KeywordIdea) => relevance.get(keywordKey(r.keyword))?.related !== false", 'const related = (_r: KeywordIdea) => true')
  check('D6: MUT every keyword related fails D1', allRelated.researchModel({ ...base, siteTopics: researchTopics }).lessRelatedWins.length === 0)
  const noSort = mutant<typeof M>('lib/keyword-research/model.ts', '.filter((w) => related(w.row)).sort(bySite)', '.filter((w) => related(w.row))')
  const ns = noSort.researchModel({ ...base, siteTopics: researchTopics })
  const nss = ns.wins.map((w) => ns.relevance.get(w.row.keyword.toLowerCase())?.score ?? -1)
  check('D7: MUT no ranking by relevance fails D3', !nss.every((s, i) => i === 0 || nss[i - 1] >= s))

  // The route: the profile is read for the owner, added only when there is one.
  const OWNER = '0a000000-0000-4000-8000-000000000001', STRANGER = '0a000000-0000-4000-8000-000000000002'
  const PROJECT = 'a1111111-2222-3333-4444-555555555555'
  const tables = () => ({
    projects: [{ id: PROJECT, user_id: OWNER, business_name: 'Japan4U' }],
    keyword_research_cache: [{ id: 'r1', user_id: OWNER, project_id: PROJECT, seed_type: 'url', seed_value: 'seed:site:japan4u.co.il', country: 'IL', language: 'he', fetched_at: '2026-09-20T08:00:00Z', results_json: SCAN.map((k) => ({ keyword: k.keyword, avgMonthlySearches: k.avgMonthlySearches, competition: k.competition, competitionIndex: k.competitionIndex, lowTopOfPageBid: k.lowTopOfPageBid, highTopOfPageBid: k.highTopOfPageBid, currency: k.currency })) }],
    tracking_targets: [{ id: 't1', user_id: OWNER, project_id: PROJECT, keyword: 'טוקיו' }],
    project_seed_runs: [{ id: 'run-1', project_id: PROJECT, user_id: OWNER, trigger: 'project_created', stage: 'b', status: 'done', error_code: null, created_at: '2026-09-20T08:00:00Z',
      summary: { version: 1, domain: 'japan4u.co.il', url: 'https://japan4u.co.il/', seedKeywords: ['טיול ליפן מישראל'], business: { companyName: 'Japan4U', niche: NICHE } } }],
    site_page_map: [
      { project_id: PROJECT, user_id: STRANGER, entries: [{ t: 'LEAK' }, { t: 'LEAK 2' }] },
      { project_id: PROJECT, user_id: OWNER, entries: TITLES.map((t) => ({ t })) },
    ],
    wordpress_content_index: [{ project_id: PROJECT, user_id: OWNER, targets: [{ targetTitle: 'מהכרטיסייה' }] }],
  })
  const vocab = new Set(TITLES.flatMap((t) => t.split(/\s+/)).concat(['יפן', 'דרום', 'צפון', 'טיול', 'טיולים', 'בדרום', 'מסלולי', 'בצפון']))
  const call = async (siteTitles?: ScanRouteDeps['siteTitles']) => {
    const db = new FakeAdmin(tables(), {})
    const deps: ScanRouteDeps = {
      session: async () => ({ userId: OWNER, db: db as never }),
      admin: () => new FakeAdmin(tables(), {}) as never,
      vocabulary: async () => vocab,
      ...(siteTitles ? { siteTitles } : {}),
    }
    const res = await handleScanResearchGet(new Request(`http://localhost/api/keyword-research/scan?projectId=${PROJECT}`), deps)
    return { status: res.status, body: await res.json() as Record<string, unknown> }
  }
  const without = await call()
  const withTitles = await call((db, scope) => R.readSiteTitles(db, scope))
  check('D8: without the titles reader the answer\'s keys are exactly what they were', without.status === 200 && !('siteTopics' in without.body) && Array.isArray(without.body.keywords), show(Object.keys(without.body)))
  const wire = readResearchAnswer(withTitles.status, withTitles.body)
  check('D9: with it, the answer carries the site\'s profile, and the screen reads it back', withTitles.status === 200 && wire.kind === 'ok' && !!wire.research.siteTopics &&
    show(wire.research.siteTopics!.core) === show(researchTopics.core), show(withTitles.body.siteTopics))
  const failing = await call(async () => { throw new Error('boom') })
  check('D10: a failing titles read answers as before (no profile, 200)', failing.status === 200 && !('siteTopics' in failing.body))
  const bad = readResearchAnswer(200, { ...withTitles.body, siteTopics: { core: 7 } })
  check('D11: a malformed profile on the wire is dropped (every keyword related)', bad.kind === 'ok' && !('siteTopics' in bad.research))

  const titles = await R.readSiteTitles(new FakeAdmin(tables(), {}) as never, { projectId: PROJECT, userId: OWNER })
  check('D12: the titles are the owner\'s only (another account\'s row on the same project never leaks)', titles.length > 50 && !titles.some((t) => /LEAK/.test(t)) && !titles.includes('מהכרטיסייה'), show(titles.slice(0, 3)))
  const t2 = tables(); t2.site_page_map = []
  const fallback = await R.readSiteTitles(new FakeAdmin(t2, {}) as never, { projectId: PROJECT, userId: OWNER })
  check('D13: without the site mapping, the content index\'s titles (also the owner\'s)', show(fallback) === show(['מהכרטיסייה']))
  const noOwner = mutant<typeof R>('lib/keyword-research/site-relevance.ts', ".select('entries')\n      .eq('project_id', scope.projectId)\n      .eq('user_id', scope.userId)", ".select('entries')\n      .eq('project_id', scope.projectId)")
  let leaked = false
  try { leaked = (await noOwner.readSiteTitles(new FakeAdmin(tables(), {}) as never, { projectId: PROJECT, userId: OWNER })).some((t) => /LEAK/.test(t)) } catch { leaked = true }
  check('D14: MUT reading the mapping without the owner fails D12', leaked)
  const routeFile = code('app/api/keyword-research/scan/route.ts')
  check('D15: the route wires the titles reader', /siteTitles: \(db, scope\) => readSiteTitles\(db, scope\)/.test(routeFile))

  const wins = code('components/keyword-research/EasyWins.tsx')
  const collapsed = (s: string) => /<details data-less-related=""(?![^>]*\sopen\b)[^>]*>/.test(s) && /t\.lessRelated\(/.test(s) && /motion-reduce:transition-none/.test(s)
  check('D16: the less related are one collapsed group ("פחות קשורים לאתר שלכם"), motion-safe', collapsed(wins))
  check('D17: MUT the group opened by default fails D16', !collapsed(wins.replace('<details data-less-related=""', '<details data-less-related="" open')))
  const page = code('app/(dashboard)/keyword-research/page.tsx')
  check('D18: the screen ranks by the profile and passes the less related group', /siteTopics: scanSiteTopics,/.test(page) && /lessRelated=\{scanSiteTopics \? model\.lessRelatedWins : undefined\}/.test(page))
  const heW = dashHe.keywordResearchScan?.easyWins as unknown as Record<string, unknown> | undefined
  const enW = dashEn.keywordResearchScan?.easyWins as unknown as Record<string, unknown> | undefined
  const heLess = typeof heW?.lessRelated === 'function' ? (heW.lessRelated as (n: number) => string)(41) : ''
  const enLess = typeof enW?.lessRelated === 'function' ? (enW.lessRelated as (n: number) => string)(41) : ''
  check('D19: the words are in both dictionaries (Hebrew fully Hebrew)', heLess === 'פחות קשורים לאתר שלכם (41)' && /^Less related to your site \(41\)$/.test(enLess) &&
    /[א-ת]/.test(String(heW?.lessRelatedHint)) && /[א-ת]/.test(String(heW?.rankedBySite)) && !/[א-ת]/.test(String(enW?.lessRelatedHint)) && !/[א-ת]/.test(String(enW?.rankedBySite)), show([heLess, enLess]))
}

sectionD().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}, (e) => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1) })

export {}
