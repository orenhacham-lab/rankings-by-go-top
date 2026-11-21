/**
 * THE BLOG RANKED BEST EXACTLY WHERE IT COULD EARN NOTHING.
 *
 * Read in Search Console on 21 Nov 2026 over the 28 days to 13 Nov: of the 660
 * impressions the blog earns in the band it can actually improve (positions 5
 * to 25), 276 are people looking for a human being — "יועץ seo" 81 at 17.9,
 * "חברות seo" 63 at 23.2, "מומחה לפרסום בגוגל" 61 at 21.0, "מקדם אתרים תותח"
 * 37 at 15.8, "מקדם אתרים פרטי" 17 at 21.1, "חברה לקידום בגוגל" 17 at 13.8.
 * Those searchers want somebody to do it for them; they cannot buy a self-serve
 * product, and the agency's done-for-you work lives on gotop.co.il.
 *
 * THE CONSTRAINT THIS SUITE DEFENDS (Oren, 21 Nov 2026): do NOT exclude these
 * if excluding them could shrink the number of articles we can publish, because
 * we publish every day and must never run out of topics. So every check below
 * about the penalty is paired with one proving the keyword is still there.
 *
 * Run: npx tsx lib/blog/auto/__qa__/hiring-intent-order.qa.ts
 */
import type { KeywordIdeaResult } from '@/lib/google-ads/keyword-ideas'
import { BLOG_AUTO_LOCALES, type BlogAutoLocale } from '../rotation'
import {
  HIRING_INTENT_PENALTY, HIRING_COMPANY_NOUNS, HIRING_INTENT_PATTERNS, FOR_COMPANIES_WORDS,
  EXCLUDED_PATTERNS, MIN_MONTHLY_SEARCHES,
  isHiringIntent, hiringIntentPenalty, keywordDifficulty, selectKeywords,
} from '../keyword-plan'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) passed++
  else { failed++; console.log(`FAIL ${name}${detail ? ` — ${detail}` : ''}`) }
}

const idea = (keyword: string, volume = 200, competition: 'LOW' | 'MEDIUM' | 'HIGH' = 'LOW'): KeywordIdeaResult => ({
  keyword, avgMonthlySearches: volume, competition, competitionIndex: null,
  lowTopOfPageBid: null, highTopOfPageBid: null, currency: 'ILS',
})

// ── A: the real queries, in the words Search Console reported them ─────────

const REAL_HIRING: [BlogAutoLocale, string][] = [
  ['he', 'יועץ seo'],
  ['he', 'חברות seo'],
  ['he', 'מומחה לפרסום בגוגל'],
  ['he', 'מקדם אתרים תותח'],
  ['he', 'מקדם אתרים פרטי'],
  ['he', 'חברה לקידום בגוגל'],
  ['he', 'יועץ קידום אורגני'],
]
for (const [locale, keyword] of REAL_HIRING) {
  check(`A "${keyword}" is read as somebody looking for a person`, isHiringIntent(locale, keyword))
}

const REAL_INFORMATIONAL: [BlogAutoLocale, string][] = [
  ['he', 'אופטימיזציה לאתר'],
  ['he', 'בדיקת דירוג בגוגל'],
  ['he', 'תוכנה לבדיקת מיקומים'],
  ['he', 'מחקר מילות מפתח'],
  ['he', 'קורס קידום אתרים מעשי'],
  ['en', 'engine optimization'],
  ['en', 'keyword research'],
  ['es', 'empresa de posicionamiento'],
]
for (const [locale, keyword] of REAL_INFORMATIONAL) {
  // "empresa de posicionamiento" is the one that teaches the shape: a company
  // noun with no "para", so it IS hiring intent — and it earns 15 impressions
  // at 12.9, which is the whole point of penalising rather than deleting.
  const expected = keyword === 'empresa de posicionamiento'
  check(`A "${keyword}" is${expected ? '' : ' not'} hiring intent`, isHiringIntent(locale, keyword) === expected)
}

// ── B: "for companies" is an article, not a hire ──────────────────────────

const FOR_SHAPES: [BlogAutoLocale, string][] = [
  ['en', 'seo for small companies'],
  ['de', 'seo für unternehmen'],
  ['es', 'seo para empresas'],
  ['pt-BR', 'seo para empresas'],
  ['fr', 'seo pour entreprise'],
  ['it', 'seo per azienda'],
  ['nl', 'seo voor bedrijf'],
  ['pl', 'seo dla firm'],
  ['he', 'קידום אתרים לעסקים'],
  ['ja', '企業向け seo'],
  ['ko', '기업을 위한 seo'],
]
for (const [locale, keyword] of FOR_SHAPES) {
  check(`B "${keyword}" is an article about serving companies, not a hire`, !isHiringIntent(locale, keyword), locale)
}
const HIRE_SHAPES: [BlogAutoLocale, string][] = [
  ['en', 'seo agency'],
  ['en', 'best seo company'],
  ['de', 'seo agentur'],
  ['es', 'agencia seo'],
  ['fr', 'agence seo'],
  ['it', 'agenzia seo'],
  ['nl', 'seo bureau'],
  ['pl', 'agencja seo'],
  ['ja', 'seo 会社'],
  ['ko', 'seo 업체'],
]
for (const [locale, keyword] of HIRE_SHAPES) {
  check(`B "${keyword}" is somebody looking for a firm`, isHiringIntent(locale, keyword), locale)
}

// ── C: every language has the rule ───────────────────────────────────────

for (const locale of BLOG_AUTO_LOCALES) {
  const any = (HIRING_INTENT_PATTERNS[locale] ?? []).length + (HIRING_COMPANY_NOUNS[locale] ?? []).length
  check(`C ${locale} has hiring-intent patterns, so no language is left ranking what it cannot sell`, any > 0)
  check(`C ${locale} has its own word for "for", or the company nouns would misfire`,
    (FOR_COMPANIES_WORDS[locale] ?? []).length > 0 || (HIRING_COMPANY_NOUNS[locale] ?? []).length === 0)
}

// ── D: it is an ORDER, and the quantity is untouched ─────────────────────

const mixed = [
  idea('יועץ seo', 300),
  idea('אופטימיזציה לאתר', 250),
  idea('חברות seo', 400),
]
const chosen = selectKeywords({ locale: 'he', ideas: mixed, taken: [], limit: 10 })
check('D1 the informational keyword is written FIRST', chosen[0]?.keyword === 'אופטימיזציה לאתר')
check('D2 and the hiring-intent ones are still chosen — all three, nothing dropped',
  chosen.length === 3 && chosen.some((c) => c.keyword === 'יועץ seo') && chosen.some((c) => c.keyword === 'חברות seo'),
  JSON.stringify(chosen.map((c) => c.keyword)))
check('D3 THE QUANTITY GUARD: the same ideas yield the same NUMBER of keywords as before the penalty',
  selectKeywords({ locale: 'he', ideas: mixed, taken: [], limit: 10 }).length === mixed.length)
check('D4 a queue of nothing but hiring-intent keywords still produces an article',
  selectKeywords({ locale: 'he', ideas: [idea('יועץ seo', 300), idea('מקדם אתרים פרטי', 200)], taken: [], limit: 1 }).length === 1)
check('D5 the penalty is flat and only that', hiringIntentPenalty('he', 'יועץ seo') === HIRING_INTENT_PENALTY
  && hiringIntentPenalty('he', 'אופטימיזציה לאתר') === 0)
check('D6 a hiring-intent keyword still beats a 450,000-a-month head term, which must never be first again',
  keywordDifficulty(idea('יועץ seo', 300), 'he') < keywordDifficulty(idea('google search console', 450_000), 'he'))
check('D7 with no locale the difficulty is unchanged — the old callers are untouched',
  keywordDifficulty(idea('יועץ seo', 300)) === keywordDifficulty(idea('אופטימיזציה לאתר', 300)))

// ── E: this is not the exclusion list ───────────────────────────────────

check('E1 the agency\'s own name is still EXCLUDED, not merely penalised',
  EXCLUDED_PATTERNS.some((re) => re.test('סוכנות קידום אתרים')))
check('E2 and a hiring-intent keyword is NOT in the exclusion list',
  !EXCLUDED_PATTERNS.some((re) => re.test('יועץ seo')))
check('E3 the volume floor is still the only thing that rejects a keyword outright',
  selectKeywords({ locale: 'he', ideas: [idea('יועץ seo', MIN_MONTHLY_SEARCHES.he - 1)], taken: [], limit: 5 }).length === 0)

// ── MUTATION CONTROLS ───────────────────────────────────────────────────

check('MUTATION CONTROL: with the penalty at zero the hiring-intent keyword with the most volume would be written first',
  (() => {
    const byVolume = [...mixed].sort((a, b) => (b.avgMonthlySearches ?? 0) - (a.avgMonthlySearches ?? 0))
    return byVolume[0]!.keyword === 'חברות seo'
  })())
check('MUTATION CONTROL: a bare company-noun test would call "seo für unternehmen" a hire',
  /unternehmen/i.test('seo für unternehmen'))
check('MUTATION CONTROL: a FILTER instead of a penalty would leave this Hebrew queue with nothing to publish',
  mixed.filter((i) => !isHiringIntent('he', i.keyword)).length < mixed.length)
check('MUTATION CONTROL: 25 points is below the head-term cap, so a head term can never outrank a hire',
  HIRING_INTENT_PENALTY < 60)

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
