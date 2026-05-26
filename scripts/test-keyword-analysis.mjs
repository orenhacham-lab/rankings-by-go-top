/**
 * Isolated test script for Phase 1 + Phase 2.
 *
 * Run with:  node scripts/test-keyword-analysis.mjs
 *
 * No UI, no API, no network — pure deterministic logic only.
 */

// ── Inline re-implementation of the patterns so this script runs without
//    TypeScript compilation (Node ESM, no tsx). The patterns mirror exactly
//    what is in keyword-analysis.ts.
// ──────────────────────────────────────────────────────────────────────────

const CHANNEL_GOOGLE_ADS = /(google\s*ads|גוגל\s*אדס|פרסום\s*ממומן\s*בגוגל|פרסום\s*בגוגל|adwords|ניהול\s*קמפיינים\s*בגוגל|קמפיין\s*בגוגל)/i
const CHANNEL_FACEBOOK   = /(פרסום\s*(ב)?פייסבוק|פייסבוק\s*אדס|facebook\s*ads|קמפיין\s*בפייסבוק|לידים\s*בפייסבוק|פרסום\s*ממומן\s*בפייסבוק)/i
const CHANNEL_INSTAGRAM  = /(פרסום\s*(ב)?אינסטגרם|instagram\s*ads|קמפיין\s*באינסטגרם|פרסום\s*ממומן\s*באינסטגרם)/i
const CHANNEL_TIKTOK     = /(פרסום(\s*ממומן)?\s*(ב)?טיקטוק|tiktok\s*ads|קמפיין\s*(ב)?טיקטוק)/i
const CHANNEL_LINKEDIN   = /(פרסום(\s*ממומן)?\s*(ב)?לינקדאין|linkedin\s*ads)/i
const CHANNEL_PAID_ADS   = /(^פרסום\s*ממומן$|^קידום\s*ממומן$|paid\s*ads?|performance\s*marketing|ניהול\s*קמפיינים$|^פרסום\s*ממומן\b(?!\s*ב))/i
const IS_MARKETING_CH    = /(פרסום|קמפיין|ads?\b|marketing|performance|paid|ממומן|קידום\s*ממומן|google\s*ads|facebook\s*ads|instagram\s*ads)/i

const SERVICE_SEO        = /(קידום\s*אתר|קידום\s*אורגני|seo\b|ניהול\s*seo)/i
const SERVICE_WEB_DEV    = /(בניית\s*אתר|פיתוח\s*אתר|web\s*dev(elopment)?|website\s*build|עיצוב\s*אתר)/i
const SERVICE_HOME_IMP   = /(שיפוץ|שיפוצים|renovation|remodel|carpent|נגרות|אינסטלציה|חשמלאי|צבעי|kitchen\s*remodel|bathroom\s*remodel|home\s*improvement)/i
const SERVICE_CLEANING   = /(ניקיון|cleaning|ניקוי|חברת\s*ניקיון)/i

const PRODUCT_FASHION    = /(שמלה|שמלות|חולצה|מכנסיים|ג'ינס|מעיל|חצאית|נעל|נעלים|נעלי\s*\w+|תיק|אביזרי\s*אופנה|fashion|clothing|apparel)/i
const PRODUCT_SPORTS     = /(הליכון|אופניים|כדורגל|כדורסל|ציוד\s*ספורט|treadmill|bicycle|gym|sports?\s*equipment)/i
const PRODUCT_PERFUME    = /(בושם|ניחוח|parfum|perfume|cologne|fragrance)/i
const PRODUCT_APPLIANCE  = /(מכונת\s*כביסה|מקרר|מדיח|תנור|מיקרוגל|מזגן|dishwasher|washing\s*machine|fridge|appliance)/i

const IRRELEVANT         = /(^(איראן|ישראל|פוליטיקה|חדשות|מזג\s*אוויר|ספורט\s*עולמי)$|breaking\s*news|weather|politics|iran|ukraine|war\b|celebrity|gossip)/i

// ── Minimal classifier ──────────────────────────────────────────────────────
function classify(kw) {
  kw = kw.trim()
  if (IRRELEVANT.test(kw))           return { type: 'irrelevant', topics: [], conf: 'low' }
  if (CHANNEL_GOOGLE_ADS.test(kw))   return { type: 'marketing_channel', topics: ['google_ads'], conf: 'high' }
  if (CHANNEL_FACEBOOK.test(kw))     return { type: 'marketing_channel', topics: ['facebook_ads'], conf: 'high' }
  if (CHANNEL_INSTAGRAM.test(kw))    return { type: 'marketing_channel', topics: ['instagram_ads'], conf: 'high' }
  if (CHANNEL_TIKTOK.test(kw))       return { type: 'marketing_channel', topics: ['social_media'], conf: 'high' }
  if (CHANNEL_LINKEDIN.test(kw))     return { type: 'marketing_channel', topics: ['social_media'], conf: 'high' }
  const isManagementService = /ניהול\s*(מדיה|רשתות|תוכן|עמוד|פרופיל|community)/i.test(kw)
  if ((CHANNEL_PAID_ADS.test(kw) || IS_MARKETING_CH.test(kw)) && !isManagementService)
                                     return { type: 'marketing_channel', topics: ['paid_ads'], conf: 'medium' }
  if (SERVICE_SEO.test(kw))          return { type: 'service', topics: ['seo'], conf: 'high' }
  if (SERVICE_WEB_DEV.test(kw))      return { type: 'service', topics: ['web_dev'], conf: 'high' }
  if (SERVICE_HOME_IMP.test(kw))     return { type: 'service', topics: ['home_improvement'], conf: 'high' }
  if (SERVICE_CLEANING.test(kw))     return { type: 'service', topics: ['cleaning'], conf: 'high' }
  if (PRODUCT_FASHION.test(kw))      return { type: 'product', topics: ['fashion'], conf: 'high' }
  if (PRODUCT_SPORTS.test(kw))       return { type: 'product', topics: ['sports_product'], conf: 'high' }
  if (PRODUCT_PERFUME.test(kw))      return { type: 'product', topics: ['perfume_product'], conf: 'high' }
  if (PRODUCT_APPLIANCE.test(kw))    return { type: 'product', topics: [], conf: 'high' }
  return                               { type: 'uncertain', topics: [], conf: 'low' }
}

// ── Test runner ─────────────────────────────────────────────────────────────
const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const RED   = '\x1b[31m'
const GRAY  = '\x1b[90m'
const BOLD  = '\x1b[1m'

let pass = 0, fail = 0

function test(label, keyword, expect) {
  const result = classify(keyword)

  const typeOk = !expect.type   || result.type === expect.type
  const confOk = !expect.conf   || result.conf === expect.conf
  const topicOk = !expect.topics || expect.topics.every(t => result.topics.includes(t))
  const notTopicOk = !expect.notTopics || expect.notTopics.every(t => !result.topics.includes(t))

  const ok = typeOk && confOk && topicOk && notTopicOk

  if (ok) {
    pass++
    console.log(`${GREEN}✅ PASS${RESET}  ${label}`)
    console.log(`       ${GRAY}keyword:${RESET} ${JSON.stringify(keyword)}`)
    console.log(`       ${GRAY}result: ${RESET} type=${result.type}, topics=[${result.topics}], conf=${result.conf}`)
  } else {
    fail++
    console.log(`${RED}❌ FAIL${RESET}  ${label}`)
    console.log(`       ${GRAY}keyword:${RESET} ${JSON.stringify(keyword)}`)
    console.log(`       ${GRAY}expect: ${RESET} type=${expect.type ?? '*'}, topics=[${expect.topics ?? '*'}], conf=${expect.conf ?? '*'}`)
    console.log(`       ${GRAY}notTopics: [${expect.notTopics ?? ''}]${RESET}`)
    console.log(`       ${GRAY}actual: ${RESET} type=${result.type}, topics=[${result.topics}], conf=${result.conf}`)
    if (!typeOk)     console.log(`         ${RED}✗ type mismatch: got ${result.type}${RESET}`)
    if (!confOk)     console.log(`         ${RED}✗ confidence mismatch: got ${result.conf}${RESET}`)
    if (!topicOk)    console.log(`         ${RED}✗ missing topics: expected ${expect.topics}${RESET}`)
    if (!notTopicOk) console.log(`         ${RED}✗ forbidden topics found: ${expect.notTopics?.filter(t => result.topics.includes(t))}${RESET}`)
  }
  console.log()
}

// ── Test suite ──────────────────────────────────────────────────────────────

console.log(`\n${BOLD}=== Keyword Analysis Phase 1 Tests ===${RESET}\n`)

// ──────────────────────────────────────────────────────────────────────────
// REQUIRED TEST CASES FROM SPEC
// ──────────────────────────────────────────────────────────────────────────
console.log(`${BOLD}── Required Spec Cases ──${RESET}\n`)

test(
  'Case 1 — Go Top + קידום אתרים אורגני → service, seo, high',
  'קידום אתרים אורגני',
  { type: 'service', topics: ['seo'], conf: 'high' },
)

test(
  'Case 2 — Go Top + פרסום באינסטגרם → marketing_channel, instagram_ads, NOT google_ads',
  'פרסום באינסטגרם',
  { type: 'marketing_channel', topics: ['instagram_ads'], conf: 'high', notTopics: ['google_ads'] },
)

test(
  'Case 3 — Go Top + קידום ממומן → marketing_channel, paid_ads, NOT google_ads',
  'קידום ממומן',
  { type: 'marketing_channel', topics: ['paid_ads'], notTopics: ['google_ads'] },
)

test(
  'Case 4 — Go Top + פרסום בגוגל → marketing_channel, google_ads',
  'פרסום בגוגל',
  { type: 'marketing_channel', topics: ['google_ads'] },
)

test(
  'Case 5 — Cleaning + קידום אתרים → service, seo (mismatch but classified correctly)',
  'קידום אתרים אורגני',
  { type: 'service', topics: ['seo'] },
)

test(
  'Case 6 — Sports + הליכון ביתי → product, sports_product',
  'הליכון ביתי',
  { type: 'product', topics: ['sports_product'], conf: 'high' },
)

test(
  'Case 7a — Fashion + נעלי נשים → product, fashion',
  'נעלי נשים',
  { type: 'product', topics: ['fashion'], conf: 'high' },
)

test(
  'Case 7b — Fashion + שמלות → product, fashion',
  'שמלות',
  { type: 'product', topics: ['fashion'], conf: 'high' },
)

test(
  'Case 8 — English construction + kitchen remodeling → service, home_improvement',
  'kitchen remodeling',
  { type: 'service', topics: ['home_improvement'], conf: 'high' },
)

test(
  'Case 9 — איראן → irrelevant, low confidence',
  'איראן',
  { type: 'irrelevant', conf: 'low' },
)

test(
  'Case 10 — פרסום ממומן → paid_ads NOT google_ads',
  'פרסום ממומן',
  { type: 'marketing_channel', topics: ['paid_ads'], notTopics: ['google_ads'] },
)

test(
  'Case 11 — פרסום ממומן בגוגל → google_ads',
  'פרסום ממומן בגוגל',
  { type: 'marketing_channel', topics: ['google_ads'] },
)

test(
  'Case 12 — פרסום ממומן באינסטגרם → instagram_ads, NOT google_ads',
  'פרסום ממומן באינסטגרם',
  { type: 'marketing_channel', topics: ['instagram_ads'], notTopics: ['google_ads'] },
)

// ──────────────────────────────────────────────────────────────────────────
// ADDITIONAL COVERAGE CASES
// ──────────────────────────────────────────────────────────────────────────
console.log(`${BOLD}── Additional Coverage Cases ──${RESET}\n`)

test('Google Ads → google_ads',
  'Google Ads', { type: 'marketing_channel', topics: ['google_ads'], conf: 'high' })

test('גוגל אדס → google_ads',
  'גוגל אדס', { type: 'marketing_channel', topics: ['google_ads'], conf: 'high' })

test('ניהול קמפיינים בגוגל → google_ads',
  'ניהול קמפיינים בגוגל', { type: 'marketing_channel', topics: ['google_ads'] })

test('קמפיין בגוגל → google_ads',
  'קמפיין בגוגל', { type: 'marketing_channel', topics: ['google_ads'] })

test('Adwords → google_ads',
  'Adwords', { type: 'marketing_channel', topics: ['google_ads'] })

test('פרסום בפייסבוק → facebook_ads NOT google_ads',
  'פרסום בפייסבוק', { type: 'marketing_channel', topics: ['facebook_ads'], notTopics: ['google_ads'] })

test('קמפיין לידים בפייסבוק → facebook_ads',
  'קמפיין לידים בפייסבוק', { type: 'marketing_channel', topics: ['facebook_ads'] })

test('פרסום ממומן בפייסבוק → facebook_ads NOT google_ads',
  'פרסום ממומן בפייסבוק', { type: 'marketing_channel', topics: ['facebook_ads'], notTopics: ['google_ads'] })

test('פרסום ממומן בטיקטוק → social_media NOT google_ads',
  'פרסום ממומן בטיקטוק', { type: 'marketing_channel', topics: ['social_media'], notTopics: ['google_ads'] })

test('Instagram ads (English) → instagram_ads',
  'Instagram ads', { type: 'marketing_channel', topics: ['instagram_ads'] })

test('Facebook ads (English) → facebook_ads',
  'Facebook ads', { type: 'marketing_channel', topics: ['facebook_ads'] })

test('paid ads (English) → paid_ads NOT google_ads',
  'paid ads', { type: 'marketing_channel', topics: ['paid_ads'], notTopics: ['google_ads'] })

test('performance marketing → marketing_channel',
  'performance marketing', { type: 'marketing_channel' })

test('קידום אתרים → service, seo',
  'קידום אתרים', { type: 'service', topics: ['seo'] })

test('SEO לעסקים → service, seo',
  'SEO לעסקים', { type: 'service', topics: ['seo'] })

test('בניית אתר → service',
  'בניית אתר', { type: 'service' })

test('שיפוץ מטבח → service, home_improvement',
  'שיפוץ מטבח', { type: 'service', topics: ['home_improvement'] })

test('bathroom remodel (English) → service, home_improvement',
  'bathroom remodel', { type: 'service', topics: ['home_improvement'] })

test('ניקיון משרדים → service, cleaning',
  'ניקיון משרדים', { type: 'service', topics: ['cleaning'] })

test('home cleaning (English) → service, cleaning',
  'home cleaning', { type: 'service', topics: ['cleaning'] })

test('בושם לגבר → product, perfume',
  'בושם לגבר', { type: 'product', topics: ['perfume_product'] })

test('מכונת כביסה → product',
  'מכונת כביסה', { type: 'product' })

test('חדשות → irrelevant',
  'חדשות', { type: 'irrelevant', conf: 'low' })

test('מזג אוויר → irrelevant',
  'מזג אוויר', { type: 'irrelevant', conf: 'low' })

// ──────────────────────────────────────────────────────────────────────────
// SUMMARY
// ──────────────────────────────────────────────────────────────────────────
console.log('─'.repeat(60))
const total = pass + fail
const pct = Math.round(100 * pass / total)
const icon = fail === 0 ? GREEN + '✅' : RED + '⚠️'
console.log(`\n${icon}  Results: ${pass}/${total} passed (${pct}%)${RESET}`)
if (fail > 0) {
  console.log(`${RED}   ${fail} test(s) failed — see above.${RESET}`)
  process.exit(1)
} else {
  console.log(`${GREEN}   All tests passed.${RESET}`)
}
console.log()
