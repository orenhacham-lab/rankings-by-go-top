/**
 * THE QUEUE STAYS ON THE SITE'S OWN SUBJECT
 * (18 October 2026, from Oren's report: 4dogsoriginal.co.il, a dog-products
 * store, had children's toys and dog-adoption topics approved in its queue —
 * "צעצועים מונטסוריים", "משחקים מעץ לילדים", "אימוץ כלבים קטנים", "כלבים
 * למסירה מיידית").
 *
 * The drift had three parts, one section each:
 *
 *   A/B) WHERE THE SITE'S WORDS COME FROM. The relevance vocabulary read one
 *        source, the content index, which 43 of the 51 live projects do not
 *        have. It then fell back to the business name and the project's tracked
 *        keywords — and every tracked keyword of that store was written by our
 *        OWN articles, so "כלבי צעצוע" made "צעצוע" a site word and "אימוץ
 *        חיות" made "אימוץ" one. The drift taught the gate its own words. The
 *        words now come from the merchant's own mapped pages, ours left out.
 *
 *   C)   WHAT THE GATE ASKS. A "noise" term was kept whenever ANY word of the
 *        keyword was on the site, which "כלבים לאימוץ בחינם" satisfies on a
 *        dog-bed store. It now asks for the TERM ITSELF, so a shelter keeps it
 *        and a products store does not.
 *
 *   D)   WHERE THE GATE RUNS. It existed only in the keyword-research path. The
 *        toy topics came from project_data, and the monthly top-up promoted
 *        months-old plan ideas into the queue with no relevance check at all.
 *
 * MUTATION CONTROLS throughout.
 * Run: npx tsx lib/content/recommendations/__qa__/site-subject-gate.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { buildSiteVocabulary } from '../engine'
import { isOurTrackedKeyword, merchantTitles, readMerchantTrackedKeywords, urlKey, titleKey, MAX_MERCHANT_TITLES } from '../site-subject'
import { MIN_SITE_VOCAB_TOKENS, researchKeywordIssue, siteOwnsTerm, sharesSiteVocab } from '../keyword-research'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const read = (p: string) => strip(readFileSync(join(process.cwd(), p), 'utf8'))

const PROJECT = 'p-4dogs'
const OWNER = 'u-owner'
const SITE = 'https://www.4dogsoriginal.co.il'

/** The store's own catalogue and guides, as the full-site mapping holds them. */
const MERCHANT_PAGES = [
  'מיטות לכלבים', 'מיטות מעוצבות לכלבים', 'מזרנים לכלבים', 'בתים לכלבים', 'אביזרים',
  'מיטה אורטופדית לכלב גדול – איכות חיים שנמדדת בנוחות', 'מיטה פלאפי לכלב – הנוחות שפוגשים פעם אחת ומתאהבים',
  'מיטת מערה לכלב – נוחות, פרטיות ובריאות', 'מיטת פיתה לכלב – נוחות, חמימות ועיצוב מושלם לכל האופי',
  'מיטה לגורים – הבסיס לשינה בטוחה והתפתחות רגועה', 'מיטה לכלב בינוני – איך לבחור את המיטה המושלמת לכלב שלכם?',
  'CAZO מזרן אורטופדי לכלב בינוני גדול מקולקצית VELVET GOLD', 'CAZO תיק נשיאה לכלב קטן  EXCLUSIVE חום קרם',
  'CAZO בית איגלו לכלב קטן/חתול NOIR BROWN', 'קרני אייל טבעיים לכלבים', 'אבקת קרני אייל',
  'קרן באפלו לכלב – הפינוק הטבעי והבריא שכל כלב אוהב', 'קרן יחמור לכלבים &#8211; חטיף טבעי ובריא לכלב שלכם',
  'עצם סידן לכלב – איך לבחור נכון ולמה זה חשוב', 'חטיפי בריאות טבעיים לכלבים',
  'עוגיות בריאות טבעיות לכלבים PSIACHA  ארנב', 'אוכל טרי לכלבים – הבחירה הבריאה ביותר לכלב שלכם',
  'תוספי תזונה לכלבים: איך לבחור את הטוב ביותר', 'תוסף למפרקים לכלבים – גלו כיצד קרן אייל טבעית יכולה לתרום לבריאותם',
  'משטח ליקוק לכלבים וחתולים Fiboowl Mat', 'כדור צעצוע לכלבים Fiboo Snack Fibooll Jumbo',
  'קערת האכלה איטית לכלבים וחתולים Fiboo Slow Fiboowl', 'תבנית גלידה ביתית לכלבים וחתולים Fiboo Iceboo',
  'ביטוח רפואי לכלב – כדאי? כל מה שצריך לדעת לפני שמחליטים', 'מוצרים לכלב מבוגר – המדריך המלא',
  'שקיות איסוף מתכלות ריחניות &#8211; 8 יח\'', 'צור קשר', 'אודות', 'חנות',
]
/** Articles WE generated on that site — among them the two that drifted. */
const OUR_ARTICLES = [
  { title: 'שוקלים אימוץ חיות? צ\'קליסט ההכנות המלא לקראת קבלת חבר חדש', url: `${SITE}/pet-adoption-checklist/` },
  { title: 'כלבי צעצוע: המדריך המלא לגזעים הקטנים הפופולריים ביותר', url: `${SITE}/toy-dogs-complete-guide-israel/` },
  { title: 'צעצועים מעץ: כל היתרונות למשחק התפתחותי, יצירתי ובטוח', url: `${SITE}/wooden-toys-benefits-for-child-development/` },
  { title: 'מזונות רעילים לכלבים: הרשימה המלאה של מה שאסור להם לאכול', url: `${SITE}/dog-toxic-foods/` },
]
const mapEntries = [
  ...MERCHANT_PAGES.map((t, i) => ({ u: `${SITE}/page-${i + 1}/`, t })),
  // Our own articles, as the mapping holds them: one with the same URL, one
  // whose URL the mapping normalized differently (www/query), one title-only.
  { u: `${SITE}/pet-adoption-checklist/`, t: OUR_ARTICLES[0].title },
  { u: 'https://4dogsoriginal.co.il/toy-dogs-complete-guide-israel?utm_source=nl', t: 'כלבי צעצוע: משהו אחר לגמרי' },
  { u: `${SITE}/other/`, t: OUR_ARTICLES[2].title },
]

// ── A) the merchant's own pages ───────────────────────────────────────────────

console.log('\nA) which pages count as the site')

check('A1: a keyword one of our articles created is recognised, and only it',
  isOurTrackedKeyword('source=generated_article article=173f982 topic=x') === true
  && isOurTrackedKeyword(' source=generated_article article=1') === true
  && isOurTrackedKeyword('source=gsc') === false
  && isOurTrackedKeyword(null) === false && isOurTrackedKeyword('') === false)

const titles = merchantTitles(mapEntries, OUR_ARTICLES.map((a) => ({ title: a.title, urls: [a.url] })))
check('A2: our own article is left out although the mapping lists it', !titles.includes(OUR_ARTICLES[0].title))
check('A3: and when its URL differs by www, a query or a trailing slash, the URL still matches',
  !titles.includes('כלבי צעצוע: משהו אחר לגמרי')
  && urlKey('https://4dogsoriginal.co.il/toy-dogs-complete-guide-israel?utm_source=nl') === urlKey(`${SITE}/toy-dogs-complete-guide-israel/`))
check('A4: and when only the title matches, the page is still ours',
  !titles.includes(OUR_ARTICLES[2].title) && titleKey('  שוקלים   אימוץ  ') === 'שוקלים אימוץ')
// 18 Oct 2026: the mapping's utility pages (here 'צור קשר', 'אודות', 'חנות')
// are left out too — they say nothing about what the merchant sells
// (site-subject.ts isUtilityTitle, guarded in gate-precision.qa.ts).
const UTILITY_IN_FIXTURE = ['צור קשר', 'אודות', 'חנות']
check('A5: the merchant\'s own product pages are all kept, in the mapping\'s order',
  titles.length === MERCHANT_PAGES.length - UTILITY_IN_FIXTURE.length && titles[0] === MERCHANT_PAGES[0])
check('A5b: and the mapping\'s utility pages are the only ones left out',
  UTILITY_IN_FIXTURE.every((t) => MERCHANT_PAGES.includes(t) && !titles.includes(t)))
check('A6: an entity in a title is decoded, so its words are readable',
  titles.some((t) => t.includes('–') || t.includes('חטיף טבעי')) && !titles.some((t) => t.includes('&#8211;')))
check('A7: a titleless page is not a title, and the number read is bounded',
  merchantTitles([{ u: `${SITE}/x/`, t: null }, { u: `${SITE}/y/` }], []).length === 0
  && merchantTitles(Array.from({ length: MAX_MERCHANT_TITLES + 50 }, (_, i) => ({ u: `${SITE}/p${i}/`, t: `עמוד ${i} על מיטות` })), []).length === MAX_MERCHANT_TITLES)
check('MUTATION CONTROL A: taking the mapping as it is keeps our adoption article (so A2 would fail)',
  merchantTitles(mapEntries, []).includes(OUR_ARTICLES[0].title))

async function main() {
  // ── B) the vocabulary the gate judges by ──────────────────────────────────────

  console.log('\nB) the words the gate judges by')

  const admin = () => new FakeAdmin({
    site_page_map: [{ project_id: PROJECT, user_id: OWNER, entries: mapEntries }],
    generated_articles: OUR_ARTICLES.map((a, i) => ({ id: `a${i}`, project_id: PROJECT, user_id: OWNER, title: a.title, wp_post_url: a.url, site_post_url: null, shopify_article_url: null })),
    tracking_targets: [
      { project_id: PROJECT, keyword: 'כלבי צעצוע', notes: 'source=generated_article article=ccc5350', avg_monthly_searches: null },
      { project_id: PROJECT, keyword: 'אימוץ חיות', notes: 'source=generated_article article=0544956', avg_monthly_searches: null },
      { project_id: PROJECT, keyword: 'מיטה אורטופדית לכלב', notes: null, avg_monthly_searches: 320 },
    ],
  }) as unknown as Parameters<typeof buildSiteVocabulary>[0]

  const merchantKeywords = await readMerchantTrackedKeywords(admin(), PROJECT)
  check('B1: the keywords our own articles created never seed or widen anything',
    merchantKeywords.length === 1 && merchantKeywords[0] === 'מיטה אורטופדית לכלב')

  const vocab = await buildSiteVocabulary(admin(), PROJECT, merchantKeywords, OWNER)
  check('B2: the catalogue\'s own words are there', ['מיטה', 'מזרן', 'קרן', 'חטיפי', 'כלבים', 'ליקוק'].every((w) => vocab.has(w)))
  check('B3: and it is big enough for the gate to be trusted', vocab.size >= MIN_SITE_VOCAB_TOKENS)
  check('B4: our drifted articles did NOT make their words the site\'s', !vocab.has('אימוץ') && !vocab.has('רעילים'))

  const vocabWithOurs = await buildSiteVocabulary(admin(), PROJECT, ['אימוץ חיות', 'כלבי צעצוע'], OWNER)
  check('MUTATION CONTROL B: feeding our own articles\' keywords back in makes "אימוץ" a site word (so B4 would fail)',
    vocabWithOurs.has('אימוץ'))

  // ── C) what the gate decides ─────────────────────────────────────────────────

  console.log('\nC) the keywords, through the gate')

  const brandTokens = new Set<string>(['4dogs', 'original'])
  const issue = (kw: string, v: Set<string> | null = vocab) => researchKeywordIssue(kw, { brandTokens, vocab: v })

  const DRIFTED = [
    'אימוץ כלבים קטנים', 'כלבים לאימוץ בחינם', 'כלבים למכירה יד 2', 'כלבים למסירה מיידית',
    'צעצועים מונטסוריים', 'צעצועים לבנות', 'משחקים מעץ לילדים', 'משחק גלידה מעץ',
    'סמי הכבאי צעצועים', 'עגלת גלידה לילדים', 'כלבים קטנים למכירה',
  ]
  for (const kw of DRIFTED) check(`C1: off the site's subject — ${kw}`, issue(kw) !== null, String(issue(kw)))

  const GENUINE = [
    'מיטה אורטופדית לכלב', 'מיטה אורטופדית לכלב מבוגר', 'תיק נשיאה לכלב קטן', 'קרן אייל לכלבים',
    'עצם סידן לכלב', 'משטח ליקוק לכלבים', 'חטיפים טבעיים לכלבים', 'תוסף למפרקים לכלבים',
    'מיטת מערה לכלב', 'אוכל טרי לכלבים', 'ביטוח רפואי לכלב', 'מזרנים לכלבים',
    'צעצועים לכלבים איך לבחור', 'תוספי תזונה לכלבים',
  ]
  for (const kw of GENUINE) check(`C2: the store's own subject — ${kw}`, issue(kw) === null, String(issue(kw)))

  /** A shelter: the same keyword, a site whose own pages are about adoption. */
  const shelterVocab = new Set(['אימוץ', 'כלבים', 'כלב', 'קטנים', 'גורים', 'חיות', 'מחמד', 'תרומה', 'כלבייה', 'מסירה', 'אומנה'])
  check('C3: a business whose own pages say "אימוץ" keeps the adoption keyword',
    researchKeywordIssue('אימוץ כלבים קטנים', { brandTokens: new Set(), vocab: shelterVocab }) === null
    && siteOwnsTerm('אימוץ', shelterVocab) && !siteOwnsTerm('אימוץ', vocab))
  check('C4: with no vocabulary to judge by nothing is rejected as off-subject',
    issue('אימוץ כלבים קטנים', null) === null && siteOwnsTerm('אימוץ', null))
  check('MUTATION CONTROL C: the old escape hatch (any shared word) keeps the adoption keyword (so C1 would fail)',
    sharesSiteVocab('כלבים לאימוץ בחינם', vocab))

  // ── D) where the gate runs ───────────────────────────────────────────────────

  console.log('\nD) every way into the queue')

  const engineSrc = read('lib/content/recommendations/engine.ts')
  check('D1: the engine\'s vocabulary reads the merchant\'s pages and only the merchant\'s tracked keywords',
    /for \(const t of await readMerchantTitles\(admin, \{ projectId, userId \}\)\) absorb\(t\)/.test(engineSrc)
    && /const merchantKeywords = await readMerchantTrackedKeywords\(admin, input\.projectId\)/.test(engineSrc)
    && !/from\('tracking_targets'\)\.select\('keyword, avg_monthly_searches'\)/.test(engineSrc))
  check('D2: project_data runs the same gate, with the same floor',
    /const pdGate = pdVocab\.size >= MIN_SITE_VOCAB_TOKENS \? pdVocab : null/.test(engineSrc)
    && /if \(pdGate\) \{\s*const issue = researchKeywordIssue\(s\.primaryKeyword, \{ brandTokens: pdBrandTokens, vocab: pdGate \}\)/.test(engineSrc))
  check('D3: the site\'s offering in the prompts falls back to the merchant\'s pages when there is no scan',
    /if \(out\.length === 0\) \{\s*for \(const t of await readMerchantTitles\(admin, \{ projectId, userId \}\)\)/.test(engineSrc))
  const topupSrc = read('lib/content/automation/topic-topup.ts')
  check('D4: the monthly top-up asks before it queues a months-old plan idea',
    /const subjectGate = vocab\.size >= MIN_SITE_VOCAB_TOKENS \? vocab : null/.test(topupSrc)
    && /if \(subjectGate && researchKeywordIssue\(\(idea\.primary_keyword \?\? ''\)\.trim\(\) \|\| idea\.title/.test(topupSrc)
    && /summary\.skippedOffSubject\+\+/.test(topupSrc))
  check('MUTATION CONTROL D: dropping the project_data gate, or the top-up\'s, is caught (so D2/D4 would fail)',
    !/const pdGate = pdVocab\.size >= MIN_SITE_VOCAB_TOKENS \? pdVocab : null/.test(engineSrc.replace(/const pdGate = pdVocab\.size >= MIN_SITE_VOCAB_TOKENS \? pdVocab : null/, 'const pdGate = null'))
    && !/if \(subjectGate && researchKeywordIssue\(/.test(topupSrc.replace(/if \(subjectGate && researchKeywordIssue\(/, 'if (false && researchKeywordIssue(')))
}

main().then(() => {
  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
})

export {}
