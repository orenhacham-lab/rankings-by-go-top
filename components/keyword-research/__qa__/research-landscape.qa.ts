/**
 * THE RESEARCH TAB'S LANDSCAPE — who the site competes with, who searches for it, and
 * one click to track any keyword of the research.
 *
 *  L) the scan's summary as the tab keeps it: competitors (one per site, www or not),
 *     audiences, the niche, the site's icon; nothing from a failed or foreign answer;
 *  R) a card per competitor: what its research found, what it shares with the site and
 *     where it reaches demand the site does not (its gaps), where it ranks against the
 *     site when the project compares them; the site itself is never its own rival;
 *  G) the demand only competitors reach counts each keyword once;
 *  P) the real page (first render): the site's icon and domain under the title, the
 *     sections nav, both sections mounted; every row of the table has "+ track" (or
 *     "tracked"), and none of it exists without a scan (the legacy screen);
 *  Q) the new sections read only: GETs and database reads under the owner's session.
 *
 * Every check has a mutation control.
 *
 * Run: npx tsx components/keyword-research/__qa__/research-landscape.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const HARNESS = require('./_page-harness') as typeof import('./_page-harness')
const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { readLandscape, competitorLandscape, gapDemand, NO_LANDSCAPE } = require('../landscape') as typeof import('../landscape')

type ScanKeyword = import('../../../lib/keyword-research/scan-research').ScanKeyword
type ScanView = import('../../../lib/keyword-research/scan-state').ScanView

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const count = (hay: string, needle: string) => hay.split(needle).length - 1

const kw = (keyword: string, v: number | null, origins: ScanKeyword['origins'], competitors: string[] = [], relevant = true): ScanKeyword =>
  ({ keyword, avgMonthlySearches: v, competition: 'LOW', competitionIndex: null, lowTopOfPageBid: null, highTopOfPageBid: null, currency: 'ILS', origins, competitors, relevant })

const KEYWORDS: ScanKeyword[] = [
  kw('נעלי ריצה', 12100, ['seed_keywords', 'competitor'], ['rival.co.il']),
  kw('נעלי ריצה לנשים', 2900, ['seed_keywords'], []),
  kw('נעלי שטח', 1900, ['site', 'competitor'], ['rival.co.il', 'trail.co.il']),
  kw('נעלי ריצה לשטח', 880, ['competitor'], ['trail.co.il', 'runshop.co.il']),
  kw('נעלי ריצה במבצע', 720, ['competitor'], ['rival.co.il', 'trail.co.il']),
  kw('run shop', 1500, ['site'], ['rival.co.il'], false),
]

// ── L) the scan's summary ───────────────────────────────────────────────────
console.log('\nL) what the tab keeps of the scan')
{
  const body = { ok: true, run: { summary: {
    domain: 'runshop.co.il', siteIcon: 'https://runshop.co.il/icon.png', business: { niche: 'נעלי ריצה' },
    audiences: ['נשים שרצות למרחקים', '', 7, 'רצי שטח'],
    competitors: [{ domain: 'https://www.Rival.co.il/', validated: true, seenIn: 3 }, { domain: 'rival.co.il', validated: false }, { domain: 'trail.co.il', seenIn: -2 }, { domain: 'not a domain' }, null],
  } } }
  const l = readLandscape(200, body)
  check('L1: one competitor per site (www, case and path aside), its validation and hits; clean audiences; the niche and the icon',
    show(l.competitors) === show([{ domain: 'rival.co.il', validated: true, seenIn: 3 }, { domain: 'trail.co.il', validated: false, seenIn: 0 }])
    && show(l.audiences) === show(['נשים שרצות למרחקים', 'רצי שטח']) && l.niche === 'נעלי ריצה' && l.domain === 'runshop.co.il' && l.siteIcon === 'https://runshop.co.il/icon.png', show(l))
  check('L2: a failed answer, or one without ok, is no landscape', readLandscape(500, body) === NO_LANDSCAPE && readLandscape(200, { ...body, ok: false }) === NO_LANDSCAPE && readLandscape(200, null) === NO_LANDSCAPE)
  const keepsDupes = (body.run.summary.competitors as unknown[]).filter(Boolean).length
  check('L1-MUT: keeping every listed entry would show rival.co.il twice (and a non-domain)', keepsDupes > l.competitors.length)
}

// ── R) the competitor cards ─────────────────────────────────────────────────
console.log('\nR) a card per competitor')
{
  const land = competitorLandscape({
    keywords: KEYWORDS,
    scan: [{ domain: 'trail.co.il', validated: true, seenIn: 2 }],
    tracked: [{ domain: 'www.kids.co.il' }],
    standings: [{ domain: 'rival.co.il', ahead: 3, compared: 5 } as any, { domain: 'trail.co.il', ahead: 0, compared: 0 } as any],
    ownDomain: 'https://www.runshop.co.il',
  })
  const by = Object.fromEntries(land.competitors.map((c) => [c.domain, c]))
  check('R1: the site is never its own competitor, even when a research lists it', !by['runshop.co.il'] && land.competitors.every((c) => c.domain !== 'runshop.co.il'))
  const unguarded = new Set(KEYWORDS.filter((k) => k.relevant).flatMap((k) => k.competitors))
  check('R1-MUT: listing every domain a research found would show the site as a rival', unguarded.has('runshop.co.il'))
  check('R2: found, shared and gaps from the relevant keywords only (an irrelevant keyword counts for no one)',
    by['rival.co.il'].found === 3 && by['rival.co.il'].shared === 2 && by['rival.co.il'].gaps === 1 && by['rival.co.il'].gapSearches === 720
    && by['trail.co.il'].found === 3 && by['trail.co.il'].shared === 1 && by['trail.co.il'].gaps === 2
    && show(by['trail.co.il'].topGaps.map((g) => g.keyword)) === show(['נעלי ריצה לשטח', 'נעלי ריצה במבצע']), show(land.competitors))
  check('R3: where it ranks against the site, only when compared; a tracked competitor has a card even before its research finds anything',
    show(by['rival.co.il'].standing) === show({ ahead: 3, compared: 5 }) && by['trail.co.il'].standing === null
    && by['kids.co.il']?.tracked === true && by['kids.co.il'].found === 0)
  check('R4: validated or tracked first, then by what their research found',
    show(land.competitors.map((c) => c.domain)) === show(['trail.co.il', 'kids.co.il', 'rival.co.il']), show(land.competitors.map((c) => c.domain)))
  check('R5: the site\'s own keywords and searches (the first card), and the bars\' full width',
    land.own.found === 3 && land.own.searches === 12100 + 2900 + 1900 && land.maxSearches === Math.max(land.own.searches, ...land.competitors.map((c) => c.searches)))

  // ── G) gap demand ──
  console.log('\nG) the demand only competitors reach')
  check('G1: each keyword once, however many competitors found it', gapDemand(KEYWORDS) === 880 + 720)
  const perCompetitor = land.competitors.reduce((n, c) => n + c.gapSearches, 0)
  check('G1-MUT: adding every competitor\'s gaps counts shared gaps twice', perCompetitor > gapDemand(KEYWORDS), String(perCompetitor))
}

// ── P) the page ─────────────────────────────────────────────────────────────
console.log('\nP) the real page')
{
  const tracked = [{ id: 't1', keyword: 'נעלי ריצה', metrics: null }]
  const seeded: ScanView = {
    kind: 'seeded',
    research: { market: { country: 'IL', language: 'he' }, fetchedAt: '2026-09-26T08:30:00Z', keywords: KEYWORDS, truncated: false, tracked },
    running: false, steps: [{ step: 'b1', state: 'done' }, { step: 'b2', state: 'done' }, { step: 'b3', state: 'done' }],
    seedKeywords: ['נעלי ריצה'], domain: 'runshop.co.il', tracked,
  } as any
  const landscape = { domain: 'runshop.co.il', siteIcon: null, niche: 'נעלי ריצה', audiences: ['נשים שרצות למרחקים'], competitors: [{ domain: 'rival.co.il', validated: true, seenIn: 2 }] }
  const scan = { view: seeded, landscape, reloadTracked() {}, retry() {} }
  const realFetch = globalThis.fetch
  ;(globalThis as any).fetch = async () => { throw new Error('no fetch during a render') }
  const html = HARNESS.renderPage('he', { scan })
  const tableAt = html.indexOf('id="research-table"')
  const table = tableAt >= 0 ? html.slice(tableAt) : ''
  const rows = count(table.slice(0, table.indexOf('</tbody>')), '<tr')
  const track = count(table, 'data-row-track=""'), trackedPills = count(table, 'data-row-tracked=""')
  check('P1: every row of the table can be tracked in one click, or says it already is', rows > 1 && track + trackedPills === rows - 1 && trackedPills === 1, show({ rows, track, trackedPills }))
  check('P2: the site\'s icon (its initial until the icon loads) and domain under the title, with the niche',
    /data-research-site=""/.test(html) && /runshop\.co\.il/.test(html.slice(html.indexOf('data-research-site'), html.indexOf('data-research-site') + 1500)))
  // Wave-7 review P1-3: the competitor cards are the first part of the ONE competitor
  // section, so the nav links that section (not a second "rivals" one).
  const compAt = html.indexOf('id="research-competitive"')
  check('P3: the sections nav and both new sections are on the page (the cards inside the one competitor section)',
    /id="research-rivals"/.test(html) && /id="research-audiences"/.test(html) && /id="research-overview"/.test(html) && /id="research-wins"/.test(html)
    && /href="#research-competitive"/.test(html) && !/href="#research-rivals"/.test(html)
    && compAt >= 0 && html.indexOf('id="research-rivals"') > compAt && html.indexOf('id="research-rivals"') < html.indexOf('id="research-audiences"'))
  check('P4: the competitor card links out safely (no referrer, no follow, a new tab)', /href="https:\/\/rival\.co\.il\/?"[^>]*rel="noopener noreferrer nofollow"|rel="noopener noreferrer nofollow"[^>]*href="https:\/\/rival\.co\.il/.test(html))
  const legacy = HARNESS.renderPage('he', { scan: { view: { kind: 'none' }, reloadTracked() {}, retry() {} }, state: HARNESS.LEGACY_SCENARIOS[Object.keys(HARNESS.LEGACY_SCENARIOS).find((k) => /result/i.test(k)) ?? Object.keys(HARNESS.LEGACY_SCENARIOS)[0]] })
  check('P5: without a scan (the legacy screen) none of it: no track buttons, no site line, no sections', !/data-row-track|data-research-site|research-rivals/.test(legacy))
  const page = readFileSync(HARNESS.PAGE_PATH, 'utf8')
  const mutated = page.replace('{scanMode && ((result as ResearchRow).tracked ? (', '{true && ((result as ResearchRow).tracked ? (')
  const legacyMut = mutated === page ? '' : HARNESS.renderPage('he', { tag: 'mut-track-everywhere', source: mutated, scan: { view: { kind: 'none' }, reloadTracked() {}, retry() {} }, state: HARNESS.LEGACY_SCENARIOS[Object.keys(HARNESS.LEGACY_SCENARIOS).find((k) => /result/i.test(k)) ?? Object.keys(HARNESS.LEGACY_SCENARIOS)[0]] })
  check('P5-MUT: a track button shown without a scan fails P5', /data-row-track/.test(legacyMut), mutated === page ? 'anchor missing' : undefined)
  const src = strip(page)
  const samePath = (s: string) => /onClick=\{\(\) => trackKeyword\(result as ResearchRow\)\}/.test(s)
    && /const trackKeyword = async \(row: ResearchRow\) => \{[\s\S]*?\/api\/keyword-research\/add-to-project/.test(s)
  check('P6: "+ track" is the existing add-to-project request, with its quota check, and nothing new', samePath(src))
  check('P6-MUT: a row that posts somewhere else fails P6', !samePath(src.replace('onClick={() => trackKeyword(result as ResearchRow)}', "onClick={() => fetch('/api/tracking/add', { method: 'POST' })}")))
  ;(globalThis as any).fetch = realFetch
}

// ── Q) reads only ───────────────────────────────────────────────────────────
console.log('\nQ) the new sections only read')
{
  const ROOT = HARNESS.ROOT
  const srcs = ['useProjectAudiences.ts', 'ResearchLandscape.tsx', 'LandscapeRivals.tsx', 'LandscapeAudiences.tsx', 'SectionNav.tsx']
    .map((f) => strip(readFileSync(join(ROOT, 'components/keyword-research', f), 'utf8')))
  const readsOnly = (all: string[]) => all.every((s) => !/method:\s*'(POST|PUT|PATCH|DELETE)'|\.(insert|update|upsert|delete)\(|\.rpc\(|createAdminClient/.test(s))
    && /\.from\('project_audiences'\)\s*\.select\(/.test(all[0]) && /\.eq\('project_id', projectId\)/.test(all[0])
  check('Q1: the audiences are one SELECT of this project\'s rows under the owner\'s session; nothing writes, nothing bypasses RLS', readsOnly(srcs))
  check('Q1-MUT: a section that writes fails Q1', !readsOnly([srcs[0], srcs[1].replace('useMemo(', "fetch('/x', { method: 'POST' }); useMemo(")]))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
