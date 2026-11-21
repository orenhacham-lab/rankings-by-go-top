/**
 * THE BLOG LOOKS AT WHAT HAPPENED TO WHAT IT PUBLISHED.
 *
 * Run: npx tsx lib/blog/auto/__qa__/blog-outcomes.qa.ts
 *
 * Measured 21 Nov 2026: 4 of the 221 published articles had ever been updated,
 * and nothing in the system read Search Console for our own property although
 * the same sync runs for 28 customer projects. The whole blog earns one click.
 *
 * Every case below is a real row from the 28-day window ending 13 Nov 2026, so
 * the thresholds are tested against the numbers they were set from rather than
 * against invented ones.
 */
import { keywordOverlap } from '@/lib/blog/auto/keyword-plan'
import {
  IMPROVE_MIN_IMPRESSIONS, RETARGET_MAX_OVERLAP, SETTLE_DAYS, UNWINNABLE_IMPRESSIONS,
  articleOutcome, outcomeSummary, outcomeTable, rowsBySlug, slugOfArticleUrl,
  type ArticleOutcomeInput, type OutcomeRow,
} from '../outcomes'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else { failed++; console.log('FAIL', name) }
}

const NOW = Date.parse('2026-11-21T06:00:00Z')
const daysAgo = (n: number): string => new Date(NOW - n * 24 * 60 * 60 * 1000).toISOString()

const row = (over: Partial<OutcomeRow> = {}): OutcomeRow => ({
  query: 'q', page: 'https://www.gotopseo.com/articles/a', impressions: 10, clicks: 0, position: 30, ...over,
})
const article = (over: Partial<ArticleOutcomeInput> = {}): ArticleOutcomeInput => ({
  locale: 'he', slug: 'a', plannedKeyword: 'q', publishedAt: daysAgo(90), rows: [row()], ...over,
})

// ── A: the page that is nearly on the first page ───────────────────────────

const nearlyThere = article({
  slug: 'website-optimization-guide-israel',
  plannedKeyword: 'אופטימיזציה לאתר',
  rows: [
    // The real row: 183 impressions at position 20.8, one click in 28 days.
    row({ query: 'אופטימיזציה לאתר', impressions: 183, clicks: 1, position: 20.8 }),
    row({ query: 'שיפור אתר', impressions: 4, clicks: 0, position: 8.2 }),
  ],
})
const a = articleOutcome(nearlyThere, NOW)
check('A1 a page at position 20.8 with 183 impressions is one to improve', a.verdict === 'improve')
check('A2 and the action names that query, not the four-impression one at position 8',
  a.target?.query === 'אופטימיזציה לאתר' && a.target?.impressions === 183)
check('A3 the reason a report would print says the position and the demand',
  a.reason.includes('20.8') && a.reason.includes('183'))
check('A4 a position inside the band on two impressions is NOISE, not an opportunity',
  articleOutcome(article({ rows: [row({ impressions: 2, position: 7 })] }), NOW).verdict !== 'improve')
check('A5 the floor is the thing that decides that',
  articleOutcome(article({ rows: [row({ impressions: IMPROVE_MIN_IMPRESSIONS, position: 7 })] }), NOW).verdict === 'improve'
  && articleOutcome(article({ rows: [row({ impressions: IMPROVE_MIN_IMPRESSIONS - 1, position: 7 })] }), NOW).verdict !== 'improve')
check('A6 a page already in the first four is not "nearly there"',
  articleOutcome(article({ rows: [row({ impressions: 50, position: 3 })] }), NOW).verdict !== 'improve')
check('A7 nor is one at position 30',
  articleOutcome(article({ rows: [row({ impressions: 50, position: 30 })] }), NOW).verdict !== 'improve')

// ── B: the page that earns on something it was not written for ─────────────

const b = articleOutcome(article({
  slug: 'seo-expert-guide-israel',
  plannedKeyword: 'מקדם אתרים תותח',
  rows: [row({ query: 'ניתוח אתרים', impressions: 27, clicks: 0, position: 42.3 })],
}), NOW)
check('B1 a page earning on a different subject is told to take that query in', b.verdict === 'retarget')
check('B2 and the reason names both the planned keyword and the earned one',
  b.reason.includes('מקדם אתרים תותח') && b.reason.includes('ניתוח אתרים'))
check('B3 the same query under a Hebrew preposition is NOT a different subject', (() => {
  // keywordOverlap knows that "למחקר" is "מחקר"; a retarget here would be the
  // loop telling itself to add the keyword the article already has.
  const out = articleOutcome(article({
    plannedKeyword: 'מחקר מילות מפתח',
    rows: [row({ query: 'כלי למחקר מילות מפתח', impressions: 40, position: 45 })],
  }), NOW)
  return out.verdict !== 'retarget'
})())
check('B4 a handful of impressions on another query is not a retarget either',
  articleOutcome(article({
    plannedKeyword: 'מקדם אתרים',
    rows: [row({ query: 'משהו אחר לגמרי', impressions: 5, position: 45 })],
  }), NOW).verdict !== 'retarget')
check('B5 an article with no planned keyword is never retargeted, because there is nothing to compare',
  articleOutcome(article({
    plannedKeyword: null,
    rows: [row({ query: 'משהו אחר לגמרי', impressions: 40, position: 45 })],
  }), NOW).verdict !== 'retarget')

// ── C: the keyword family this site cannot win ─────────────────────────────

const c = articleOutcome(article({
  slug: 'google-search-console-guide',
  plannedKeyword: 'google search console',
  rows: [
    row({ query: 'google search console', impressions: 6489, clicks: 0, position: 76.4 }),
    row({ query: 'search console google', impressions: 300, clicks: 0, position: 71.2 }),
  ],
}), NOW)
check('C1 impressions with nothing better than position 40 ends the family', c.verdict === 'drop_family')
check('C2 and the reason carries the number that makes the case', c.reason.includes('6789'))
check('C3 the same shape with too few impressions is not yet a verdict',
  articleOutcome(article({ rows: [row({ impressions: UNWINNABLE_IMPRESSIONS - 1, position: 80 })] }), NOW).verdict !== 'drop_family')
check('C4 a page with a query at position 20 is improved, never dropped — the rules are in that order',
  articleOutcome(article({
    rows: [row({ query: 'big', impressions: 5000, position: 76 }), row({ query: 'small', impressions: 30, position: 18 })],
  }), NOW).verdict === 'improve')

// ── D: silence, and the time it takes to mean something ────────────────────

check('D1 sixty days with no impressions demotes the seed',
  articleOutcome(article({ publishedAt: daysAgo(SETTLE_DAYS + 1), rows: [] }), NOW).verdict === 'demote_seed')
check('D2 a week old with no impressions is not a verdict, it is a week',
  articleOutcome(article({ publishedAt: daysAgo(7), rows: [] }), NOW).verdict === 'waiting')
check('D3 and an article with no publish date at all is simply held',
  articleOutcome(article({ publishedAt: null, rows: [] }), NOW).verdict === 'holding')
check('D4 a young article with a real opportunity is still acted on',
  articleOutcome(article({ publishedAt: daysAgo(3), rows: [row({ impressions: 60, position: 12 })] }), NOW).verdict === 'improve')

// ── E: the week's table ────────────────────────────────────────────────────

const table = outcomeTable([
  article({ slug: 'silent-one', publishedAt: daysAgo(90), rows: [] }),
  article({ slug: 'hopeless', plannedKeyword: 'קידום אתרים', rows: [row({ query: 'קידום אתרים', impressions: 4000, position: 70 })] }),
  article({ slug: 'small-chance', plannedKeyword: 'בדיקת דירוג בגוגל', rows: [row({ query: 'בדיקת דירוג בגוגל', impressions: 30, position: 14 })] }),
  article({ slug: 'big-chance', plannedKeyword: 'אופטימיזציה לאתר', rows: [row({ query: 'אופטימיזציה לאתר', impressions: 183, position: 20.8 })] }),
], NOW)
check('E1 the most actionable verdict comes first', table[0]?.verdict === 'improve')
check('E2 and within it the one with the most demand behind it', table[0]?.slug === 'big-chance')
check('E3 the opportunity at 30 impressions comes next', table[1]?.slug === 'small-chance')
check('E4 the hopeless family is reported after both', table[2]?.slug === 'hopeless')
check('E5 the summary counts every article exactly once', (() => {
  const counts = outcomeSummary(table)
  return Object.values(counts).reduce((n, v) => n + v, 0) === table.length
    && counts.improve === 2 && counts.drop_family === 1 && counts.demote_seed === 1
})())
check('E6 a keyword with nothing comparable in it is never retargeted onto the query it already has',
  articleOutcome(article({ plannedKeyword: 'k', rows: [row({ query: 'k', impressions: 4000, position: 70 })] }), NOW)
    .verdict === 'drop_family')

// ── F: a page URL belongs to one article of one language ───────────────────

check('F1 the slug is read out of the URL', slugOfArticleUrl('https://www.gotopseo.com/articles/foo') === 'foo')
check('F2 under a language prefix too', slugOfArticleUrl('https://www.gotopseo.com/ja/articles/foo') === 'foo')
check('F3 a query string or a trailing slash is not a different page',
  slugOfArticleUrl('https://www.gotopseo.com/articles/foo?utm=x') === 'foo'
  && slugOfArticleUrl('https://www.gotopseo.com/articles/foo/') === 'foo')
check('F4 a percent-encoded Hebrew slug is decoded',
  slugOfArticleUrl('https://www.gotopseo.com/articles/%D7%A7%D7%99%D7%93%D7%95%D7%9D') === 'קידום')
check('F5 a page that is not an article is not one', slugOfArticleUrl('https://www.gotopseo.com/features/site-links') === null)
check('F6 the rows are grouped by the article they belong to', (() => {
  const grouped = rowsBySlug([
    row({ page: 'https://www.gotopseo.com/articles/x', query: 'a' }),
    row({ page: 'https://www.gotopseo.com/articles/x?utm=1', query: 'b' }),
    row({ page: 'https://www.gotopseo.com/en/articles/y', query: 'c' }),
    row({ page: 'https://www.gotopseo.com/pricing', query: 'd' }),
  ])
  return grouped.get('x')?.length === 2 && grouped.get('y')?.length === 1 && grouped.size === 2
})())

// ── MUTATION CONTROLS ─────────────────────────────────────────────────────

check('MUTATION CONTROL: with no impressions floor, two impressions at position 7 would be an opportunity',
  articleOutcome({ ...article({ rows: [row({ impressions: 2, position: 7 })] }) }, NOW).bestPosition === null)
const earned: string = 'כלי למחקר מילות מפתח'
const planned: string = 'מחקר מילות מפתח'
check('MUTATION CONTROL: a plain string comparison would call "כלי למחקר מילות מפתח" a different subject',
  earned !== planned && keywordOverlap(earned, planned) > RETARGET_MAX_OVERLAP)
check('MUTATION CONTROL: ordering by impressions alone would put the hopeless family first',
  4000 > 183)
check('MUTATION CONTROL: a slug read by splitting on "/" alone keeps the query string',
  'foo?utm=x'.split('/').pop() === 'foo?utm=x')

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
