/**
 * WAVE-7 REVIEW, keyword research: the competitor section and the notices beside it.
 *
 *   P1-2  the competitor section is on the screen for EVERY project: without a
 *         seeding scan, on the empty start, on the legacy screen and after a manual
 *         search (it used to mount only with the scan's research on screen);
 *   P1-3  ONE competitor section: the scan's cards are its first part (not a second
 *         "מול מי אתם מתחרים"); a card never says "no keyword" beside "ahead on 6
 *         of 8"; on a phone three cards show before "show more"; the long tables
 *         (who is ahead per keyword, the page map, the rankings) open on demand;
 *   P1-4  the Search Console line never claims "nothing for your TRACKED keywords"
 *         from a manual search's rows;
 *   P2-16 "who searches for you" draws a card only for an audience the research
 *         names, and names the rest in one line.
 *
 * Every rule has a mutation control.
 *
 * Run: npx tsx components/keyword-research/__qa__/competitor-section-w7.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const HARNESS = require('./_page-harness') as typeof import('./_page-harness')
const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement } = require('react') as { createElement: (...a: any[]) => any }
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../../../lib/i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary')
const { buildCompetitiveModel } = require('../../../lib/keyword-research/competitive')
const LandscapeRivals: any = require('../LandscapeRivals').default
const { RIVALS_SHOWN, RIVALS_SHOWN_PHONE } = require('../LandscapeRivals')
const LandscapeAudiences: any = require('../LandscapeAudiences').default
const ScanGscNotice: any = require('../ScanGscNotice').default
const CompetitorStanding: any = require('../competitive/CompetitorStanding').default
const Fold: any = require('../competitive/Fold').default

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = HARNESS.ROOT
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const count = (hay: string, needle: string) => hay.split(needle).length - 1
type Locale = 'he' | 'en'
const render = (locale: Locale, node: unknown) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')

const kw = (keyword: string, v: number | null, origins: string[], competitors: string[] = []) =>
  ({ keyword, avgMonthlySearches: v, competition: 'LOW', competitionIndex: null, lowTopOfPageBid: null, highTopOfPageBid: null, currency: 'ILS', origins, competitors, relevant: true })
const KEYWORDS = [kw('אינסטלטור בתל אביב', 2400, ['seed_keywords', 'competitor'], ['rival.co.il']), kw('פתיחת סתימות', 5400, ['site'], [])]
const tracked = [{ id: 't1', keyword: 'אינסטלטור בתל אביב', metrics: null }]
const SEEDED = {
  view: { kind: 'seeded', research: { market: { country: 'IL', language: 'he' }, fetchedAt: '2026-09-26T08:30:00Z', keywords: KEYWORDS, truncated: false, tracked },
    running: false, steps: [], seedKeywords: ['אינסטלטור'], domain: 'plumber.co.il', tracked },
  landscape: { domain: 'plumber.co.il', siteIcon: null, niche: 'אינסטלציה', audiences: ['בעלי דירות'], competitors: [{ domain: 'rival.co.il', validated: true, seenIn: 2 }] },
  reloadTracked() {}, retry() {},
}
const NONE = { view: { kind: 'none' }, reloadTracked() {}, retry() {} }
const UNSEEDED = { view: { kind: 'unseeded', seedKeywords: [], domain: null, tracked: [] }, reloadTracked() {}, retry() {} }
const RESULTS_STATE = HARNESS.LEGACY_SCENARIOS[Object.keys(HARNESS.LEGACY_SCENARIOS).find((k) => /result/i.test(k)) ?? Object.keys(HARNESS.LEGACY_SCENARIOS)[0]]

const realFetch = globalThis.fetch
;(globalThis as any).fetch = async () => { throw new Error('no fetch during a render') }

// ── P1-2: every project ────────────────────────────────────────────────────
console.log('\nA) the competitor section is on the screen for every project (P1-2)')
{
  const page = readFileSync(HARNESS.PAGE_PATH, 'utf8')
  const screens = (source?: string, tag = 'current') => ({
    legacy: HARNESS.renderPage('he', { scan: NONE, state: RESULTS_STATE, tag: `${tag}-l`, source }),
    unseeded: HARNESS.renderPage('he', { scan: UNSEEDED, tag: `${tag}-u`, source }),
    seeded: HARNESS.renderPage('he', { scan: SEEDED, tag: `${tag}-s`, source }),
    // A seeded project right after a manual search: its results take the screen.
    manual: HARNESS.renderPage('he', { scan: SEEDED, state: { ...RESULTS_STATE, manualActive: true }, tag: `${tag}-m`, source }),
  })
  const everywhere = (s: Record<string, string>) => Object.values(s).every((h) => count(h, 'id="research-competitive"') === 1)
  const now = screens()
  check('A1: once on the legacy screen, the empty start, the scan\'s research and after a manual search', everywhere(now),
    JSON.stringify(Object.fromEntries(Object.entries(now).map(([k, h]) => [k, count(h, 'id="research-competitive"')]))))
  check('A2: after a manual search it follows the results table (the search stays right under its form)',
    now.manual.indexOf('id="research-table"') >= 0 && now.manual.indexOf('id="research-competitive"') > now.manual.indexOf('id="research-table"')
    && /data-competitive-after=""/.test(now.manual))
  check('A3: with the scan\'s research it sits in the scan\'s story, before the table',
    now.seeded.indexOf('id="research-competitive"') < now.seeded.indexOf('id="research-table"') && !/data-competitive-after=""/.test(now.seeded))
  const gated = page.replace('const competitorSection = activeProjectId ? (', 'const competitorSection = landscapeOn && activeProjectId ? (')
  const mut = gated === page ? null : screens(gated, 'mut-gated')
  check('A1-MUT: gating the section on the scan\'s research again loses it without a scan and after a search',
    !!mut && !everywhere(mut) && count(mut.seeded, 'id="research-competitive"') === 1, gated === page ? 'anchor missing' : undefined)
}

// ── P1-3: one section ──────────────────────────────────────────────────────
console.log('\nB) one competitor section, short, never contradicting itself (P1-3)')
{
  const he = getDashboardDictionary('he')
  const seeded = HARNESS.renderPage('he', { scan: SEEDED, tag: 'one' })
  const comp = seeded.indexOf('id="research-competitive"')
  const rivals = seeded.indexOf('id="research-rivals"')
  const aud = seeded.indexOf('id="research-audiences"')
  check('B1: the scan\'s cards are INSIDE the competitor section (after its header, before "who searches for you")',
    comp >= 0 && rivals > comp && aud > rivals)
  check('B2: "מול מי אתם מתחרים" is one section title, not two', count(text(seeded), he.researchCompetitive.title) === 1 && he.researchCompetitive.title === he.researchInsights.rivals.title,
    String(count(text(seeded), he.researchCompetitive.title)))
  const rivalsSrc = strip(read('components/keyword-research/LandscapeRivals.tsx'))
  check('B2b: the cards are a part (h3), not a section of their own with its own card and h2',
    !/<section\b/.test(rivalsSrc) && !/<h2\b/.test(rivalsSrc) && !/<Card\b/.test(rivalsSrc))
  check('B2-MUT: the old second section would fail B2b', /<section\b/.test(rivalsSrc + '<section id={id} data-landscape-rivals="">'))
  const nav = strip(readFileSync(HARNESS.PAGE_PATH, 'utf8'))
  check('B3: the section nav links the one section (no separate "rivals" entry)',
    /\{ id: COMPETITIVE_ID, label: dict\.researchCompetitive\.nav \}/.test(nav) && !/\{ id: LANDSCAPE_IDS\.rivals/.test(nav))

  // The self-contradicting card: tracked, compared (ahead on 6 of 8), but in no research keyword.
  const landscape = (competitors: any[]) => ({ own: { found: 10, searches: 18720 }, maxSearches: 18720, competitors })
  const card = (over: any) => ({ domain: 'pipes-pro.co.il', validated: true, tracked: true, seenIn: 2, found: 0, searches: 0, shared: 0, gaps: 0, gapSearches: 0, topGaps: [], standing: null, ...over })
  for (const locale of ['he', 'en'] as Locale[]) {
    const t = getDashboardDictionary(locale).researchInsights.rivals
    const compared = render(locale, createElement(LandscapeRivals, { id: 'research-rivals', landscape: landscape([card({ standing: { ahead: 6, compared: 8 } })]), domain: 'plumber.co.il', siteIcon: null, gapSearches: 0 }))
    const notCompared = render(locale, createElement(LandscapeRivals, { id: 'research-rivals', landscape: landscape([card({})]), domain: 'plumber.co.il', siteIcon: null, gapSearches: 0 }))
    check(`B4-${locale}: a compared card says what it was compared on, never "no keyword" beside "ahead on 6 of 8"`,
      !/data-rival-no-overlap/.test(compared) && /data-rival-compared-only/.test(compared) && text(compared).includes(t.comparedOnly('8'))
      && text(compared).includes(t.ahead('6', '8')) && !text(compared).includes(t.noOverlapSeen))
    check(`B4-${locale}: without a comparison the honest "no keyword" line stays`, /data-rival-no-overlap/.test(notCompared) && !/data-rival-compared-only/.test(notCompared))
  }
  check('B4-MUT: a card that keys the line on the research alone shows both (the reviewer\'s contradiction)',
    /c\.standing\s*\?\s*<p data-rival-compared-only/.test(rivalsSrc) && !/c\.standing\s*\?\s*<p data-rival-compared-only/.test(rivalsSrc.replace('c.standing\n          ? <p data-rival-compared-only', 'false\n          ? <p data-rival-compared-only')))

  // Phone: the first three competitor cards, the rest behind "show more".
  const many = Array.from({ length: 6 }, (_, i) => card({ domain: `rival${i}.co.il`, found: 3, searches: 1000 - i, shared: 1, gaps: 2 }))
  const phone = render('he', createElement(LandscapeRivals, { id: 'research-rivals', landscape: landscape(many), domain: 'plumber.co.il', siteIcon: null, gapSearches: 0 }))
  const cards = phone.match(/<li[^>]*data-rival="[^"]+"[^>]*>/g) ?? []
  const hiddenOnPhone = cards.filter((c) => /max-sm:hidden/.test(c)).length
  check(`B5: a phone shows ${RIVALS_SHOWN_PHONE} competitor cards; the rest wait behind a phone-only "show more" (${many.length - RIVALS_SHOWN_PHONE})`,
    RIVALS_SHOWN_PHONE === 3 && cards.length === RIVALS_SHOWN && hiddenOnPhone === RIVALS_SHOWN - RIVALS_SHOWN_PHONE
    && /<div class="mt-4 flex justify-center sm:hidden"><button type="button" data-rivals-more-phone=""/.test(phone)
    && text(phone).includes(getDashboardDictionary('he').contentStrategy.showMore.replace('{n}', String(many.length - RIVALS_SHOWN_PHONE))),
    JSON.stringify({ cards: cards.length, hiddenOnPhone }))
  check('B5-MUT: without the phone limit every card shows on a phone', !/max-sm:hidden/.test(phone.replace(/max-sm:hidden/g, '')))

  // The long tables open on demand.
  const folded = render('he', createElement(Fold, { title: 'T', gist: 'G' }, createElement('table', null)))
  const open = render('he', createElement(Fold, { title: 'T', gist: 'G', defaultOpen: true }, createElement('table', null)))
  check('B6: a fold starts closed: a real button (aria-expanded="false") with its gist, and none of its content',
    /<button type="button" aria-expanded="false" aria-controls="[^"]+"/.test(folded) && folded.includes('>G<') && !/<table/.test(folded) && /hidden=""/.test(folded))
  check('B6-MUT: an open fold renders its content', /<table/.test(open) && /aria-expanded="true"/.test(open))
  const compSrc = strip(read('components/keyword-research/competitive/CompetitiveResearch.tsx'))
  const foldsTables = (s: string) => /<Fold title=\{dict\.mapping\.title\}[^\n]*data-competitive-fold="mapping">\s*<KeywordMapping\b/.test(s)
    && /<Fold title=\{dict\.rankings\.title\}[^\n]*data-competitive-fold="rankings">\s*<ExistingRankings\b/.test(s)
    && !/<Fold\b[^\n]*defaultOpen/.test(s) && /\{rivals && <div/.test(s)
  check('B7: the page map and the rankings sit in closed folds; the scan\'s cards open the section', foldsTables(compSrc))
  check('B7-MUT: an open-by-default fold fails B7', !foldsTables(compSrc.replace('<Fold title={dict.mapping.title}', '<Fold defaultOpen title={dict.mapping.title}')))
  const T = (id: string, k: string, v: number, p: number | null) => ({ id, keyword: k, volume: v, check: { checkedAt: '2026-09-21T03:00:00Z', found: p != null, position: p, url: null } })
  const P = (t: string, d: string, p: number | null) => ({ tracking_target_id: t, competitor_domain: d, position: p, url: p ? `https://${d}/` : null, checked_at: '2026-09-21T03:00:00Z' })
  const model = buildCompetitiveModel({ ownDomain: 'plumber.co.il', competitors: [{ name: 'A', domain: 'a.co.il' }], gsc: null,
    targets: [T('t1', 'אינסטלטור', 2400, 3), T('t2', 'סתימות', 5400, 9)], rows: [P('t1', 'a.co.il', 5), P('t2', 'a.co.il', 2)] })
  const standing = render('he', createElement(CompetitorStanding, { model, domain: 'plumber.co.il', siteIcon: null, manageHref: '/ai-visibility?tab=competitors', suggested: [], onAddCompetitor() {}, addingCompetitor: null }))
  check('B8: "who is ahead" shows its tiles and records; its per-keyword table waits behind a closed toggle',
    /data-battles-toggle=""/.test(standing) && /aria-expanded="false"/.test(standing) && !/<table/.test(standing) && /data-competitive-records=""/.test(standing))
  const none = buildCompetitiveModel({ ownDomain: 'plumber.co.il', competitors: [], gsc: null, targets: [], rows: [] })
  const noneHtml = render('he', createElement(CompetitorStanding, { model: none, domain: 'plumber.co.il', siteIcon: null, manageHref: '/ai-visibility?tab=competitors', suggested: [], onAddCompetitor() {}, addingCompetitor: null }))
  check('B9: no competitors → one line and the one link to pick them (not a full empty card)',
    /data-competitive-state="no-competitors"/.test(noneHtml) && /href="\/ai-visibility\?tab=competitors"/.test(noneHtml)
    && text(noneHtml).includes(getDashboardDictionary('he').researchCompetitive.competitors.noneLine) && !/py-8/.test(noneHtml))
}

// ── P1-4: the Search Console line ──────────────────────────────────────────
console.log('\nC) the Search Console line claims only what it counted (P1-4)')
{
  for (const locale of ['he', 'en'] as Locale[]) {
    const t = getDashboardDictionary(locale).keywordResearchScan.gsc
    const ready = { state: 'ready', data: {} }
    const at = (scope: 'tracked' | 'search', n: number) => text(render(locale, createElement(ScanGscNotice, { projectId: 'p', data: ready, count: n, scope, retry() {} })))
    check(`C1-${locale}: a manual search with no Google rows says so about THIS search, never "nothing for your tracked keywords"`,
      at('search', 0).includes(t.noneInSearch) && !at('search', 0).includes(t.noneYet) && at('search', 2).includes(t.legendSearch('2')))
    check(`C2-${locale}: the scan's research (which lists every tracked keyword Google reports) keeps its tracked wording`,
      at('tracked', 0).includes(t.noneYet) && at('tracked', 2).includes(t.legend('2')))
  }
  const page = strip(readFileSync(HARNESS.PAGE_PATH, 'utf8'))
  const scoped = (s: string) => /<ScanGscNotice [^>]*scope=\{model\.mode === 'manual' \? 'search' : 'tracked'\}/.test(s)
  check('C3: the page tells the notice what its count counts', scoped(page))
  check('C3-MUT: a notice left on the default scope fails C3', !scoped(page.replace(" scope={model.mode === 'manual' ? 'search' : 'tracked'}", '')))
}

// ── P2-16: audiences ───────────────────────────────────────────────────────
console.log('\nD) "who searches for you": a card only for an audience the research names (P2-16)')
{
  const a = (label: string, keywords: string[]) => ({ label, keywords: keywords.map((k) => ({ keyword: k, volume: 100 })), searches: keywords.length * 100 })
  const mix: any[] = []
  for (const locale of ['he', 'en'] as Locale[]) {
    const t = getDashboardDictionary(locale).researchInsights.audiences
    const some = render(locale, createElement(LandscapeAudiences, { id: 'research-audiences', audiences: [a('בעלי דירות', ['אינסטלטור']), a('ועדי בתים', []), a('מסעדות', []), a('משכירים', [])], mix, niche: null }))
    check(`D1-${locale}: one card for the one audience with keywords; the three without are named once, in one line`,
      count(some, 'data-audience="') === 1 && /data-audiences-missing="3"/.test(some) && text(some).includes(t.missingSome('ועדי בתים, מסעדות, משכירים')) && !text(some).includes(t.none))
    const nothing = render(locale, createElement(LandscapeAudiences, { id: 'research-audiences', audiences: [a('ועדי בתים', []), a('מסעדות', [])], mix, niche: null }))
    check(`D2-${locale}: none named → no empty cards, one line`, count(nothing, 'data-audience="') === 0 && text(nothing).includes(t.missingAll('ועדי בתים, מסעדות')))
  }
  const src = strip(read('components/keyword-research/LandscapeAudiences.tsx'))
  check('D-MUT: drawing every audience again brings the empty cards back', /\{matched\.map\(/.test(src) && !/\{matched\.map\(/.test(src.replace('{matched.map(', '{audiences.map((a, i) => ({ a, i })).map(')))
}

;(globalThis as any).fetch = realFetch
console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
