/**
 * THE CANNIBALISATION TABLE AND THE WEEKLY READING.
 *
 * Every fixture in group A is a real row from the 21 Nov 2026 reading of our
 * own property (the 90-day window synced 15 Nov), not an invented string —
 * including the eight pages on "בדיקת מיקומים בגוגל" and the Italian pair at
 * 9.4 and 12.4 that are cannibalising each other near page one.
 *
 * The guards that matter most here are the ones about what this code may NOT
 * do: the passenger cannot write, cannot run on a day that is not its day, and
 * cannot run outside production. Each has a mutation control.
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import {
  CANNIBAL_MIN_IMPRESSIONS, CANNIBAL_MIN_QUERY_IMPRESSIONS, OWNER_PREFERENCE_MARGIN,
  cannibalCluster, cannibalSummary, cannibalTable, ownedQueries, pageKind, pagePath,
} from '../cannibal'
import type { OutcomeRow } from '../outcomes'
import { REVIEW_DAY, REVIEW_HOUR, buildWeeklyReview, reviewDue, runIsolatedBlogWeeklyReview, type WeeklyReviewData } from '../weekly-review-isolated'

let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail?: string) {
  if (ok) { passed++; return }
  failed++
  console.log(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`)
}

const SITE = 'https://www.gotopseo.com'
const row = (page: string, impressions: number, position: number, query = 'q', clicks = 0): OutcomeRow =>
  ({ query, page: page.startsWith('http') ? page : `${SITE}${page}`, impressions, clicks, position })

// ── A. the real clusters ────────────────────────────────────────────────────

// "בדיקת מיקומים בגוגל", 1,377 impressions over 8 of our pages.
const RANKINGS_TEST = 'בדיקת מיקומים בגוגל'
const eightPages: OutcomeRow[] = [
  row('/articles/keywords-rankings-test', 409, 37.8, RANKINGS_TEST),
  row('/features/google-maps-rank-tracking', 358, 35.6, RANKINGS_TEST),
  row('/', 223, 37.7, RANKINGS_TEST),
  row('/features/google-organic-rank-tracking', 167, 35.4, RANKINGS_TEST),
  row('/login', 79, 90.9, RANKINGS_TEST),
  row('/articles/seo-keywords-ranking-software', 60, 37.9, RANKINGS_TEST),
  row('/articles/google-position-check', 52, 40.6, RANKINGS_TEST),
  row('/articles', 29, 67.1, RANKINGS_TEST),
]

function groupA() {
  const c = cannibalCluster(RANKINGS_TEST, eightPages)
  check('A1 the eight-page query is a cluster', !!c)
  check('A2 every page is counted', c?.pages.length === 8, String(c?.pages.length))
  check('A3 impressions are the sum', c?.impressions === 1377, String(c?.impressions))
  // /features/google-organic-rank-tracking is the best claimable position (35.4)
  // and it sells, so it owns the query outright.
  check('A4 the owner is the feature page at the front', c?.owner?.path === '/features/google-organic-rank-tracking', c?.owner?.path)
  check('A5 the owner keeps it', c?.owner?.verdict === 'keep')
  check('A6 the owner is listed first', c?.pages[0]?.path === '/features/google-organic-rank-tracking')
  check('A7 split is everything not on the owner', c?.split === 1377 - 167, String(c?.split))
  const verdictOf = (path: string) => c?.pages.find((p) => p.path === path)?.verdict
  check('A8 an article is merged, never distinguished', verdictOf('/articles/keywords-rankings-test') === 'merge', verdictOf('/articles/keywords-rankings-test'))
  check('A9 a second selling page is distinguished, never merged', verdictOf('/features/google-maps-rank-tracking') === 'distinguish', verdictOf('/features/google-maps-rank-tracking'))
  check('A10 the home page sells too, so it is distinguished', verdictOf('/') === 'distinguish', verdictOf('/'))
  check('A11 /login is noise, not an edit', verdictOf('/login') === 'noise', verdictOf('/login'))
  check('A12 the article index is noise, not an article', verdictOf('/articles') === 'noise', verdictOf('/articles'))
  check('A13 the reason names the owner and the split', !!c && c.reason.includes('/features/google-organic-rank-tracking') && c.reason.includes(String(c.split)))

  // "תוכנה לבדיקת מיקומים": an ARTICLE at 8.3 against a feature page at 17.0.
  // 17.0 - 8.3 = 8.7, outside the margin, so the page already on page one is
  // not handed over to the page that sells. This is the case the margin exists for.
  const SOFTWARE = 'תוכנה לבדיקת מיקומים'
  const software = cannibalCluster(SOFTWARE, [
    row('/articles/seo-keywords-ranking-software', 70, 8.3, SOFTWARE),
    row('/articles', 41, 18.1, SOFTWARE),
    row('/articles/keywords-rankings-test', 28, 10.1, SOFTWARE),
    row('/features/google-organic-rank-tracking', 23, 17.0, SOFTWARE),
    row('/articles/google-position-check', 13, 24.2, SOFTWARE),
    row('/', 4, 45.8, SOFTWARE),
  ])
  check('A14 a page on page one is not given to a selling page behind it', software?.owner?.path === '/articles/seo-keywords-ranking-software', software?.owner?.path)
  check('A15 the 4-impression row is below the noise floor and dropped', !!software?.pages.every((p) => p.impressions >= CANNIBAL_MIN_IMPRESSIONS))
  check('A16 the owner carries its slug', software?.owner?.slug === 'seo-keywords-ranking-software', String(software?.owner?.slug))

  // "בדיקת מיקום בגוגל": the selling page is at 19.6, the best article at 26.3.
  const ONE_POSITION = 'בדיקת מיקום בגוגל'
  const onePos = cannibalCluster(ONE_POSITION, [
    row('/features/google-maps-rank-tracking', 205, 19.6, ONE_POSITION),
    row('/articles/keywords-rankings-test', 66, 26.3, ONE_POSITION),
    row('/', 55, 21.9, ONE_POSITION),
    row('/features/google-organic-rank-tracking', 14, 26.0, ONE_POSITION),
  ])
  check('A17 the selling page in front owns it', onePos?.owner?.path === '/features/google-maps-rank-tracking', onePos?.owner?.path)

  // The Italian pair, both nearly on page one, on the same query.
  const IT = 'monitoraggio della posizione di google'
  const italian = cannibalCluster(IT, [
    row('/it/features/google-maps-rank-tracking', 136, 12.4, IT),
    row('/it/features/google-organic-rank-tracking', 83, 9.4, IT),
  ])
  check('A18 the Italian pair is caught', !!italian)
  check('A19 the locale is read off the path', !!italian?.pages.every((p) => p.locale === 'it'))
  check('A20 the better of the two owns it', italian?.owner?.path === '/features/google-organic-rank-tracking', italian?.owner?.path)
  check('A21 the other sells, so it is distinguished', italian?.pages.find((p) => p.path === '/features/google-maps-rank-tracking')?.verdict === 'distinguish')

  // A query where only an index and a login rank: nothing to own, nothing to write.
  const ownerless = cannibalCluster('q', [row('/articles', 60, 40), row('/login', 40, 70)])
  check('A22 a query only noise ranks for has no owner', ownerless !== null && ownerless.owner === null)
  check('A23 and its whole split is the whole query', ownerless?.split === 100, String(ownerless?.split))
  check('A24 the reason says so plainly', !!ownerless?.reason.includes('not one of them'))
}

// ── B. the floors, and what is NOT a cluster ────────────────────────────────

function groupB() {
  check('B1 one page alone is not cannibalisation', cannibalCluster('q', [row('/articles/a', 500, 10)]) === null)
  check('B2 two pages below the per-row floor are not a cluster',
    cannibalCluster('q', [row('/articles/a', CANNIBAL_MIN_IMPRESSIONS - 1, 10), row('/articles/b', CANNIBAL_MIN_IMPRESSIONS - 1, 12)]) === null)
  check('B3 a query under the query floor is not worth an afternoon',
    cannibalCluster('q', [row('/articles/a', 12, 10), row('/articles/b', 12, 12)]) === null)
  check('B4 exactly at the query floor it is', cannibalCluster('q', [row('/articles/a', 13, 10), row('/articles/b', 12, 12)]) !== null)
  check('B5 a row with no finite position cannot vote',
    cannibalCluster('q', [row('/articles/a', 100, Number.NaN), row('/articles/b', 100, 12)]) === null)
  check('B6 an empty reading makes an empty table', cannibalTable([]).length === 0)
  check('B7 a query with no text is skipped', cannibalTable([row('/articles/a', 100, 10, ''), row('/articles/b', 100, 12, '')]).length === 0)

  const table = cannibalTable([...eightPages,
    row('/articles/x', 200, 10, 'other'), row('/articles/y', 100, 12, 'other'),
  ])
  check('B8 the table holds both queries', table.length === 2, String(table.length))
  check('B9 and the worst split comes first', table[0]?.query === RANKINGS_TEST, table[0]?.query)
  const summary = cannibalSummary(table)
  check('B10 the summary counts the queries', summary.queries === 2)
  check('B11 one keep per query with an owner', summary.verdicts.keep === 2, String(summary.verdicts.keep))
  check('B12 the split is the sum of the splits', summary.split === table.reduce((n, c) => n + c.split, 0))
  check('B13 ownerless queries are counted', cannibalSummary([cannibalCluster('q', [row('/articles', 60, 40), row('/login', 40, 70)])!]).withoutOwner === 1)

  check('B14 ownedQueries names a query held at the front', ownedQueries([cannibalCluster('q', [row('/articles/a', 100, 8), row('/articles/b', 50, 30)])!]).length === 1)
  check('B15 and says nothing about one held at position 40', ownedQueries([cannibalCluster('q', [row('/articles/a', 100, 40), row('/articles/b', 50, 50)])!]).length === 0)
  check('B16 ownedQueries returns queries and nothing else',
    ownedQueries(cannibalTable(eightPages), 40).every((q) => typeof q === 'string'))
}

// ── C. paths and kinds ──────────────────────────────────────────────────────

function groupC() {
  check('C1 the language prefix comes off', pagePath(`${SITE}/ja/articles/foo`).path === '/articles/foo')
  check('C2 and is remembered', pagePath(`${SITE}/ja/articles/foo`).locale === 'ja')
  check('C3 pt-BR is one prefix, not two', pagePath(`${SITE}/pt-BR/features/x`).path === '/features/x')
  check('C4 no prefix means Hebrew', pagePath(`${SITE}/features/x`).locale === 'he')
  check('C5 a query string is not part of the path', pagePath(`${SITE}/articles/foo?utm=1`).path === '/articles/foo')
  check('C6 a trailing slash is not a different page', pagePath(`${SITE}/articles/foo/`).path === '/articles/foo')
  check('C7 the home page survives the trailing-slash rule', pagePath(`${SITE}/`).path === '/')
  check('C8 a bare path with no host still works', pagePath('/articles/foo').path === '/articles/foo')
  check('C9 the locale root is the home page', pagePath(`${SITE}/de`).path === '/')
  check('C10 the home page is a home page', pageKind('/').kind === 'home')
  check('C11 an article is an article', pageKind('/articles/foo').kind === 'article')
  check('C12 and carries its slug', pageKind('/articles/foo').slug === 'foo')
  check('C13 the index is NOT an article', pageKind('/articles').kind === 'index')
  check('C14 nor is a paginated index', pageKind('/articles/page/2').kind === 'index')
  check('C15 a feature page is commercial', pageKind('/features/x').kind === 'commercial')
  check('C16 a comparison page is commercial', pageKind('/compare/x').kind === 'commercial')
  check('C17 pricing is commercial', pageKind('/pricing').kind === 'commercial')
  check('C18 login is neither', pageKind('/login').kind === 'other')
  check('C19 an encoded slug is decoded', pageKind('/articles/%D7%A7').slug === 'ק')
}

// ── D. the weekly reading ───────────────────────────────────────────────────

const reviewData = (): WeeklyReviewData => ({
  syncedAt: '2026-11-15T05:40:38.771Z',
  windowStart: '2026-08-16',
  windowEnd: '2026-11-13',
  rows: [
    ...eightPages,
    // an article that is nearly there on a query somebody searches
    row('/articles/near', 120, 12.0, 'כלי לבדיקת מיקומים'),
  ],
  articles: [
    { slug: 'near', locale: 'he', plannedKeyword: 'כלי לבדיקת מיקומים', publishedAt: '2026-01-01T00:00:00.000Z' },
    { slug: 'keywords-rankings-test', locale: 'he', plannedKeyword: RANKINGS_TEST, publishedAt: '2026-01-01T00:00:00.000Z' },
    { slug: 'silent', locale: 'de', plannedKeyword: 'nichts', publishedAt: '2026-01-01T00:00:00.000Z' },
  ],
})

function groupD() {
  const r = buildWeeklyReview(reviewData(), Date.parse('2026-11-22T06:00:00.000Z'))
  check('D1 the reading says which sync it came from', r.syncedAt === '2026-11-15T05:40:38.771Z')
  check('D2 and over which window', r.windowStart === '2026-08-16' && r.windowEnd === '2026-11-13')
  check('D3 every row is counted', r.rows === 9, String(r.rows))
  check('D4 the nearly-there article is told to improve, not replaced', r.outcomes.improve >= 1, JSON.stringify(r.outcomes))
  check('D5 an article with no impressions at all is demoted, not guessed about', r.outcomes.demote_seed === 1, JSON.stringify(r.outcomes))
  check('D6 the article lines name the slug and the verdict', r.top.some((l) => l.includes('near') && l.includes('improve')), r.top[0])
  check('D7 the cannibal table reached the report', r.cannibal.queries >= 1, JSON.stringify(r.cannibal))
  check('D8 and its worst line names the split', r.cannibalTop.some((l) => l.includes('split') && l.includes(RANKINGS_TEST)))
  check('D9 nothing in the report is a write', JSON.stringify(r).includes('update') === false)

  check('D10 Sunday at 06:00 UTC is due', reviewDue(new Date('2026-11-22T06:30:00.000Z')))
  check('D11 Sunday at 07:00 is not', !reviewDue(new Date('2026-11-22T07:00:00.000Z')))
  check('D12 Monday at 06:00 is not', !reviewDue(new Date('2026-11-23T06:00:00.000Z')))
  check('D13 the day is Sunday and the hour is after the 05:00 GSC sync', REVIEW_DAY === 0 && REVIEW_HOUR > 5)
}

// ── E. the passenger, and what it refuses ───────────────────────────────────

async function groupE() {
  const due = { env: { VERCEL_ENV: 'production' }, now: new Date('2026-11-22T06:00:00.000Z'), startedAtMs: Date.now(), maxDurationMs: 300_000 }
  let reads = 0
  const read = async () => { reads++; return reviewData() }

  const ran = await runIsolatedBlogWeeklyReview(read, due)
  check('E1 it runs when it is due, in production', ran.status === 'ran', ran.status)
  check('E2 and it read exactly once', reads === 1, String(reads))
  check('E3 the outcome carries the tables', ran.status === 'ran' && ran.cannibal.queries >= 1)

  reads = 0
  const preview = await runIsolatedBlogWeeklyReview(read, { ...due, env: { VERCEL_ENV: 'preview' } })
  check('E4 Preview shares the Production database, so it does not run', preview.status === 'not_production', preview.status)
  check('E5 and it did not even read', reads === 0)

  reads = 0
  const monday = await runIsolatedBlogWeeklyReview(read, { ...due, now: new Date('2026-11-23T06:00:00.000Z') })
  check('E6 on a day that is not its day it does not run', monday.status === 'not_due', monday.status)
  check('E7 and does not read', reads === 0)

  const noTime = await runIsolatedBlogWeeklyReview(read, { ...due, startedAtMs: Date.now() - 299_000, maxDurationMs: 300_000 })
  check('E8 with a second left it starts nothing', noTime.status === 'no_time', noTime.status)

  const empty = await runIsolatedBlogWeeklyReview(async () => ({ ...reviewData(), rows: [] }), due)
  check('E9 an empty reading is said to be empty, not reported as zero findings', empty.status === 'no_data', empty.status)

  const missing = await runIsolatedBlogWeeklyReview(async () => null, due)
  check('E10 no sync of our own property is no data', missing.status === 'no_data', missing.status)

  const threw = await runIsolatedBlogWeeklyReview(async () => { throw new Error('boom') }, due)
  check('E11 it never throws into the cron', threw.status === 'error', threw.status)
}

// ── F. source guards: the passenger cannot write ────────────────────────────

function groupF() {
  const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  const src = strip(readFileSync(join(process.cwd(), 'lib/blog/auto/weekly-review-isolated.ts'), 'utf8'))
  const cannibal = strip(readFileSync(join(process.cwd(), 'lib/blog/auto/cannibal.ts'), 'utf8'))
  for (const [name, text] of [['the passenger', src], ['the cannibal module', cannibal]] as const) {
    check(`F1 ${name} never updates a row`, !/\.update\(/.test(text))
    check(`F2 ${name} never inserts one`, !/\.insert\(|\.upsert\(/.test(text))
    check(`F3 ${name} never deletes one`, !/\.delete\(/.test(text))
  }
  check('F4 the project is found by its site URL, not a hard-coded id', !/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/.test(src))
  check('F5 the schedule cannot be moved by an environment variable', !/REVIEW_DAY\s*=\s*Number|env\.[A-Z_]*REVIEW/.test(src))
  check('F6 the production gate is on VERCEL_ENV', /VERCEL_ENV !== 'production'/.test(src))
}

// ── G. mutation controls ────────────────────────────────────────────────────

function groupG() {
  // 1. A naive owner rule — best position wins, full stop — hands
  //    "בדיקת מיקום בגוגל" to whichever page is nearest even when a page that
  //    sells is right behind it. Show the margin is doing work.
  const ONE = 'בדיקת מיקום בגוגל'
  const marginCase = cannibalCluster(ONE, [
    row('/articles/keywords-rankings-test', 66, 22.0, ONE),
    row('/features/google-maps-rank-tracking', 205, 24.0, ONE),
  ])
  check('G1 CONTROL: a selling page 2 behind still takes the query', marginCase?.owner?.path === '/features/google-maps-rank-tracking', marginCase?.owner?.path)
  const outsideMargin = cannibalCluster(ONE, [
    row('/articles/keywords-rankings-test', 66, 10.0, ONE),
    row('/features/google-maps-rank-tracking', 205, 10.0 + OWNER_PREFERENCE_MARGIN + 0.1, ONE),
  ])
  check('G2 CONTROL: one step past the margin it does not', outsideMargin?.owner?.kind === 'article', outsideMargin?.owner?.kind)

  // 2. If the index were classified as an article it would become an owner
  //    candidate and the report would propose rewriting a listing page.
  check('G3 CONTROL: the index can never be an owner',
    cannibalCluster('q', [row('/articles', 500, 5), row('/articles/a', 100, 30)])?.owner?.path === '/articles/a')

  // 3. If `rowsBySlug` and the cluster shared a page filter, a cluster with no
  //    article in it would vanish. The Italian pair has no article at all.
  check('G4 CONTROL: a cluster of two feature pages and no article still exists',
    cannibalTable([row('/it/features/a', 136, 12.4, 'it-q'), row('/it/features/b', 83, 9.4, 'it-q')]).length === 1)

  // 4. The noise floor: raise a row to the floor and the cluster appears, drop
  //    it below and it does not. Both directions, so the floor is not vacuous.
  check('G5 CONTROL: at the floor the cluster exists',
    cannibalCluster('q', [row('/articles/a', CANNIBAL_MIN_IMPRESSIONS, 10), row('/articles/b', CANNIBAL_MIN_QUERY_IMPRESSIONS, 12)]) !== null)
  check('G6 CONTROL: one impression below it, it does not',
    cannibalCluster('q', [row('/articles/a', CANNIBAL_MIN_IMPRESSIONS - 1, 10), row('/articles/b', CANNIBAL_MIN_QUERY_IMPRESSIONS, 12)]) === null)
}

async function main() {
  groupA()
  groupB()
  groupC()
  groupD()
  await groupE()
  groupF()
  groupG()
  console.log(`${passed} passed, ${failed} failed`)
  if (failed) process.exitCode = 1
}

void main()

export {}
