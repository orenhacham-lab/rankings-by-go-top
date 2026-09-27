/**
 * THE RESEARCH TAB, FED BY THE SEEDING SCAN — what a merchant sees, rendered from
 * the REAL page (first render, both languages) in every state of the scan.
 *
 *  O) seeded: the opening card ("we found N keywords, X searches a month") and its
 *     four tiles, computed from the deduplicated research; the screen's order;
 *     the form folded to one line that opens it;
 *  W) the easy battles to win: the 8 best, each with its one "why" sentence and
 *     one click to track it in the current project;
 *  T) the table: the chips with their counts, the rows the chip picks (the
 *     suggestions in their ranked order), a line per keyword saying where it
 *     comes from; one-click tracking goes to the current project through the
 *     existing action and its quota check;
 *  R) stage B running: the site's 5 seed keywords and "the full research is
 *     running", the form open; still running with research: the note;
 *  E) a failed or partial scan: a clean empty state with the form, our own words
 *     only; a failed read: a retry; pending: a placeholder;
 *  M) a research the merchant ran takes the screen, with the way back;
 *  G) Search Console as the "from Google" source: switched off, nothing; each
 *     setup state, a title, one sentence and one link to its settings; an error,
 *     a retry; ready, its keywords as rows with their clicks and impressions;
 *  X) nothing raw on screen, English without Hebrew, RTL and LTR, the copy in
 *     both languages placed right after keywordResearch;
 *  N) opening the tab only reads: no fetch during any render, no effect in the
 *     page or its new components, every Google Ads, AI or tracking call reachable
 *     only from a click or a submit.
 *
 * No scan at all (flag off, an older project) is today's screen byte for byte:
 * legacy-screen.qa.ts. Mutation controls: lib/keyword-research/__qa__/mutation-controls.mjs.
 *
 * Run: npx tsx components/keyword-research/__qa__/keyword-research-screen.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const HARNESS = require('./_page-harness') as typeof import('./_page-harness')
const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const gscData = require('../../gsc/gsc-data') as typeof import('../../gsc/gsc-data')
const { formatCount, formatCompact } = require('../../gsc/format') as typeof import('../../gsc/format')
const { getDashboardDictionary } = require('../../../lib/i18n/dashboard/getDashboardDictionary') as typeof import('../../../lib/i18n/dashboard/getDashboardDictionary')
const { researchModel } = require('../../../lib/keyword-research/model') as typeof import('../../../lib/keyword-research/model')
const { RESEARCH_CHIPS, rowsForChip } = require('../../../lib/keyword-research/chips') as typeof import('../../../lib/keyword-research/chips')
const { EASY_WINS_SHOWN } = require('../../../lib/keyword-research/easy-wins') as typeof import('../../../lib/keyword-research/easy-wins')
const { formatMoney, formatResearchDate } = require('../../../lib/keyword-research/format') as typeof import('../../../lib/keyword-research/format')
const { scanView, readSeedAnswer } = require('../../../lib/keyword-research/scan-state') as typeof import('../../../lib/keyword-research/scan-state')

type Locale = 'he' | 'en'
type ScanKeyword = import('../../../lib/keyword-research/scan-research').ScanKeyword
type TrackedKeyword = import('../../../lib/keyword-research/scan-research').TrackedKeyword
type KeywordIdea = import('../../../lib/keyword-research/scan-research').KeywordIdea
type ResearchChip = import('../../../lib/keyword-research/chips').ResearchChip
type ScanView = import('../../../lib/keyword-research/scan-state').ScanView

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const esc = (s: string) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')
const HEBREW = /[֐-׿]/
const count = (hay: string, needle: string) => hay.split(needle).length - 1
const ROOT = HARNESS.ROOT
const P = HARNESS.PROJECT_ID

/** The element that starts at `from` (its opening tag), through its matching close tag. */
function elementAt(html: string, from: number): string {
  const open = /^<([a-z0-9]+)/i.exec(html.slice(from))
  if (!open) return ''
  const tag = open[1]
  const re = new RegExp(`<${tag}\\b[^>]*?(/?)>|</${tag}>`, 'gi')
  re.lastIndex = from
  let depth = 0
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    if (m[0].startsWith('</')) depth--
    else if (m[1] !== '/') depth++
    if (depth === 0) return html.slice(from, re.lastIndex)
  }
  return html.slice(from)
}
/** The element carrying this attribute (e.g. `data-scan-overview="scan"`). */
function el(html: string, attr: string): string {
  const at = html.indexOf(attr)
  if (at < 0) return ''
  return elementAt(html, html.lastIndexOf('<', at))
}

// ── Fixtures ────────────────────────────────────────────────────────────────
const idea = (keyword: string, v: number | null, c: 'LOW' | 'MEDIUM' | 'HIGH' | null, lo: number | null, hi: number | null, currency: string): KeywordIdea =>
  ({ keyword, avgMonthlySearches: v, competition: c, competitionIndex: null, lowTopOfPageBid: lo, highTopOfPageBid: hi, currency })
const kw = (keyword: string, v: number | null, c: 'LOW' | 'MEDIUM' | 'HIGH' | null, lo: number | null, hi: number | null, origins: ScanKeyword['origins'], relevant = true, competitors: string[] = [], currency = 'ILS'): ScanKeyword =>
  ({ ...idea(keyword, v, c, lo, hi, currency), origins, competitors, relevant })

const FIXTURE = {
  he: {
    domain: 'runshop.co.il',
    market: { country: 'IL', language: 'he' },
    seeds: ['נעלי ריצה', 'נעלי שטח', 'גרבי ריצה', 'נעלי ריצה לנשים', 'נעלי טיולים'],
    keywords: [
      kw('נעלי ריצה', 12100, 'HIGH', 2.1, 7.3, ['seed_keywords', 'competitor'], true, ['rival.co.il']),
      kw('נעלי ריצה לנשים', 2900, 'MEDIUM', 1.2, 4.8, ['seed_keywords', 'home_page'], true),
      kw('נעלי ריצה לגברים', 2400, 'MEDIUM', 1.1, 4.2, ['home_page'], true),
      kw('נעלי שטח', 1900, 'LOW', 0.9, 3.1, ['site', 'competitor'], true, ['rival.co.il', 'trail.co.il']),
      kw('נעלי טיולים', 3600, 'HIGH', 1.8, 6.1, ['home_page'], true),
      kw('run shop', 1500, 'LOW', 1, 2, ['site'], false),
      kw('נעלי הליכה נוחות', 1300, 'LOW', 0.8, 2.6, ['site'], true),
      kw('נעלי ריצה לשטח', 880, 'LOW', null, 3.1, ['competitor'], true, ['trail.co.il']),
      kw('נעלי ריצה במבצע', 720, 'MEDIUM', 1.5, 5.5, ['competitor'], true, ['rival.co.il']),
      kw('גרבי ריצה', 590, null, null, null, ['seed_keywords'], true),
      kw('נעלי ריצה לילדים', 480, 'LOW', 0.7, 2.3, ['competitor'], true, ['kids.co.il']),
      kw('איך לבחור נעלי ריצה', 320, 'LOW', 0.6, 2.2, ['site'], true),
      kw('מה ההבדל בין נעלי ריצה להליכה', 140, 'LOW', 0.4, 1.3, ['site'], true),
      kw('שרוכים לנעלי ריצה', 90, 'LOW', 0.2, 0.7, ['site'], true),
    ],
    tracked: [
      { id: 't1', keyword: 'נעלי ריצה', metrics: idea('נעלי ריצה', 12100, 'HIGH', 2.1, 7.3, 'ILS') },
      { id: 't2', keyword: 'נעלי שטח', metrics: idea('נעלי שטח', 1900, 'LOW', 0.9, 3.1, 'ILS') },
      { id: 't9', keyword: 'חנות נעלי ריצה', metrics: idea('חנות נעלי ריצה', 260, 'MEDIUM', 1, 3, 'ILS') },
    ] as TrackedKeyword[],
    gscOnly: 'חנות נעלי ריצה',
  },
  en: {
    domain: 'runshop.com',
    market: { country: 'US', language: 'en' },
    seeds: ['running shoes', 'trail shoes', 'running socks', 'womens running shoes', 'hiking shoes'],
    keywords: [
      kw('running shoes', 165000, 'HIGH', 1.4, 4.9, ['seed_keywords', 'competitor'], true, ['rival.com'], 'USD'),
      kw('womens running shoes', 49500, 'MEDIUM', 1.1, 3.8, ['seed_keywords', 'home_page'], true, [], 'USD'),
      kw('trail running shoes', 40500, 'MEDIUM', 1.0, 3.2, ['site', 'competitor'], true, ['rival.com', 'trail.com'], 'USD'),
      kw('run shop', 2900, 'LOW', 0.5, 1.2, ['site'], false, [], 'USD'),
      kw('running socks', 9900, 'LOW', 0.4, 1.1, ['seed_keywords'], true, [], 'USD'),
      kw('how to choose running shoes', 1300, 'LOW', 0.6, 1.9, ['site'], true, [], 'USD'),
      kw('best running shoes for flat feet', 8100, 'LOW', 0.9, 2.8, ['competitor'], true, ['trail.com'], 'USD'),
      kw('marathon shoes', 2400, null, null, null, ['home_page'], true, [], 'USD'),
      kw('what are zero drop shoes', 880, 'LOW', 0.3, 1.0, ['site'], true, [], 'USD'),
      kw('running shoe laces', 390, 'LOW', 0.2, 0.6, ['site'], true, [], 'USD'),
      kw('kids running shoes', 1600, 'LOW', 0.8, 2.1, ['competitor'], true, ['kids.com'], 'USD'),
      kw('cheap running shoes', 3600, 'MEDIUM', 0.9, 3.3, ['home_page'], true, [], 'USD'),
    ],
    tracked: [
      { id: 't1', keyword: 'running shoes', metrics: idea('running shoes', 165000, 'HIGH', 1.4, 4.9, 'USD') },
      { id: 't9', keyword: 'run shop store', metrics: idea('run shop store', 170, 'MEDIUM', 1, 2, 'USD') },
    ] as TrackedKeyword[],
    gscOnly: 'run shop store',
  },
}
/** A research the merchant runs from the form, in each language. */
const MANUAL: Record<Locale, KeywordIdea[]> = {
  he: HARNESS.LEGACY_RESULTS as KeywordIdea[],
  en: [
    idea('trail running shoes', 40500, 'MEDIUM', 1.0, 3.2, 'USD'),
    idea('waterproof trail shoes', 2900, 'LOW', 0.8, 2.4, 'USD'),
    idea('how to clean running shoes', 1900, 'LOW', 0.3, 0.9, 'USD'),
    idea('trail shoes for women', 1300, null, null, null, 'USD'),
  ],
}
const FIGURES = { t1: { clicks: 40, impressions: 1800 }, t9: { clicks: 12, impressions: 950 } }
const STATUS_BODY: Record<string, unknown> = {
  not_connected: { ok: true, oauthConfigured: true, connection: null, property: null, windows: {} },
  reauth_required: { ok: true, oauthConfigured: true, connection: { status: 'reauth_required' }, property: null, windows: {} },
  no_property: { ok: true, oauthConfigured: true, connection: { status: 'connected' }, property: null, windows: {} },
  never_synced: { ok: true, oauthConfigured: true, connection: { status: 'connected' }, property: { siteUrl: 'sc-domain:runshop.co.il' }, windows: { 28: null, 90: null } },
}
const READY_BODY = {
  ok: true, oauthConfigured: true, connection: { status: 'connected' }, property: { siteUrl: 'sc-domain:runshop.co.il' },
  windows: { 28: { summaryResyncRequired: false, clicks: 52, impressions: 2750, ctr: 0.019, avgPosition: 11.2, startDate: '2026-08-30', endDate: '2026-09-26' }, 90: null },
}
function primeGsc(state: 'disabled' | 'error' | 'ready' | keyof typeof STATUS_BODY) {
  const url = gscData.gscStatusUrl(P)
  if (state === 'disabled') gscData.primeGscResponse(url, { status: 404, body: { error: 'Not found' } })
  else if (state === 'error') gscData.primeGscResponse(url, { status: 500, body: { ok: false, error: 'gsc_error' } })
  else if (state === 'ready') gscData.primeGscResponse(url, { status: 200, body: READY_BODY })
  else gscData.primeGscResponse(url, { status: 200, body: STATUS_BODY[state] })
  gscData.primeGscResponse(gscData.gscMetricsUrl(P, 'keywords'), { status: 200, body: { ok: true, run: {}, keywords: FIGURES } })
}

const STEPS_DONE = [{ step: 'b1', state: 'done' }, { step: 'b2', state: 'done' }, { step: 'b3', state: 'done' }] as const
const seeded = (locale: Locale, over: Partial<{ running: boolean; truncated: boolean }> = {}): ScanView => {
  const f = FIXTURE[locale]
  return {
    kind: 'seeded',
    research: { market: f.market, fetchedAt: '2026-09-26T08:30:00Z', keywords: f.keywords, truncated: over.truncated ?? false, tracked: f.tracked },
    running: over.running ?? false,
    steps: over.running ? [{ step: 'b1', state: 'done' }, { step: 'b2', state: 'done' }, { step: 'b3', state: 'running' }] : [...STEPS_DONE],
    seedKeywords: f.seeds, domain: f.domain, tracked: f.tracked,
  }
}
const scanOf = (view: ScanView) => ({ view, reloadTracked() {}, retry() {} })
/** A run as the seed route answers it, read the way the hook reads it. */
function runView(locale: Locale, steps: [string, string, string?][], status: string, research: 'none' | 'empty' | 'error'): ScanView {
  const answer = readSeedAnswer(200, {
    ok: true,
    run: {
      id: 'run-1', stage: 'b', status, stalled: false, startedAt: '2026-09-27T11:58:00Z',
      steps: steps.map(([step, s, errorCode]) => ({ step, status: s, errorCode: errorCode ?? null })),
      summary: { domain: FIXTURE[locale].domain, seedKeywords: FIXTURE[locale].seeds },
    },
  })
  const r = research === 'none' ? null : research === 'error' ? { kind: 'error' as const } : { kind: 'ok' as const, research: { market: null, fetchedAt: null, keywords: [], truncated: false, tracked: [] } }
  return scanView(answer, r, new Date('2026-09-27T12:00:00Z'))
}

const rendered: { name: string; locale: Locale; html: string }[] = []
const realFetch = globalThis.fetch
const fetchesDuringRender: string[] = []
;(globalThis as any).fetch = async (input: unknown) => { fetchesDuringRender.push(String(input)); throw new Error('no fetch during a render') }
function render(name: string, locale: Locale, view: ScanView, state: Record<string, unknown> = {}): string {
  const html = HARNESS.renderPage(locale, { scan: scanOf(view), state })
  rendered.push({ name, locale, html })
  return html
}
function modelFor(locale: Locale, chip: ResearchChip = 'all', google = true) {
  const f = FIXTURE[locale]
  return researchModel({ scanKeywords: f.keywords, tracked: f.tracked, manual: null, google: google ? FIGURES : null, chip })
}
/** The keywords of the table's rows, in order. */
function tableKeywords(html: string): string[] {
  const table = el(html, 'id="research-table"')
  const body = table.slice(table.indexOf('<tbody'))
  return [...body.matchAll(/<tr\b[^>]*>\s*<td\b[^>]*>[\s\S]*?<\/td>\s*<td\b[^>]*>([^<]*)/g)].map((m) => m[1].replace(/&quot;/g, '"').replace(/&#x27;/g, "'").replace(/&amp;/g, '&').trim())
}

function main() {
  console.log('Keyword research fed by the seeding scan: what a merchant sees')
  // Search Console still loading (nothing answered yet): render that first, before any response is primed.
  const loadingHe = render('seeded, Search Console loading', 'he', seeded('he'))

  console.log('\nO) the opening')
  for (const locale of ['he', 'en'] as Locale[]) {
    primeGsc('ready')
    const html = render(`seeded ${locale}`, locale, seeded(locale))
    const t = getDashboardDictionary(locale).keywordResearchScan
    const m = modelFor(locale)
    const overview = el(html, 'data-scan-overview="scan"')
    const cpc = m.totals.averageCpc
    const headline = t.overview.headline(formatCount(m.totals.keywords, locale), formatCount(m.totals.monthlySearches, locale))
    const tiles: [string, string, string][] = [
      [t.tiles.keywords, formatCount(m.totals.keywords, locale), t.tiles.keywordsSource],
      [t.tiles.searches, formatCount(m.totals.monthlySearches, locale), t.tiles.searchesSource],
      [t.tiles.cpc, cpc ? formatMoney(cpc.value, cpc.currency, locale) : '', cpc ? t.tiles.cpcSource(formatCount(cpc.count, locale)) : ''],
      [t.tiles.easyWins, formatCount(m.wins.length, locale), t.tiles.easyWinsSource],
    ]
    const tileText = tiles.map(([label, value, source]) => [label, value, source].every((s) => overview.includes(esc(s))))
    const date = formatResearchDate('2026-09-26T08:30:00Z', locale) as string
    check(`O1 (${locale}): the opening card says "${headline}" with its source and date, and the 4 tiles (keywords, monthly searches, average CPC, easy wins) carry the deduplicated research's figures`,
      overview.includes(`>${esc(headline)}</h2>`) && overview.includes(esc(t.overview.fromScan(FIXTURE[locale].domain))) && overview.includes(esc(t.overview.asOf(date)))
      && overview.includes(esc(t.overview.badgeDone)) && tileText.every(Boolean) && count(overview, 'rounded-card border border-line bg-surface p-4') === 4
      && m.totals.keywords === FIXTURE[locale].keywords.length && !!cpc,
      show({ headline, tileText, totals: m.totals }))
    const order = ['data-scan-overview=', 'data-research-form="collapsed"', 'data-easy-wins=', 'id="research-table"', 'data-research-chips='].map((a) => html.indexOf(a))
    const bar = el(html, 'data-research-form="collapsed"')
    const formBox = /<div hidden=""[^>]*>\s*<form/.test(html)
    check(`O2 (${locale}): top to bottom: the opening card, the form folded into one line (one button opens it; the form is there, hidden), the easy wins, the table with its chips`,
      order.every((i, n) => i > 0 && (n === 0 || i > order[n - 1])) && count(bar, '<button') === 1 && bar.includes('aria-expanded="false"')
      && bar.includes(esc(t.form.title)) && formBox && !html.includes('data-scan-state='),
      show({ order, formBox }))
  }

  console.log('\nW) the easy battles to win')
  for (const locale of ['he', 'en'] as Locale[]) {
    primeGsc('ready')
    const html = rendered.find((r) => r.name === `seeded ${locale}`)?.html as string
    const t = getDashboardDictionary(locale).keywordResearchScan.easyWins
    const m = modelFor(locale)
    const section = el(html, 'data-easy-wins=')
    const items = [...section.matchAll(/<li data-easy-win="([^"]*)"[^>]*>([\s\S]*?)<\/li>/g)].map((x) => ({ keyword: x[1].replace(/&quot;/g, '"'), html: x[2] }))
    const expected = m.wins.slice(0, EASY_WINS_SHOWN)
    const wrong = expected.filter(({ row, win }, i) => {
      const item = items[i]
      const why = t.why({
        volume: formatCount(win.volume, locale), competition: win.competition,
        cpc: win.cpc !== null && win.currency ? formatMoney(win.cpc, win.currency, locale) : null, cpcHigh: win.cpcAboveAverage,
      })
      const action = row.tracked
        ? item?.html.includes(`>${esc(t.tracked)}</span>`) && !item?.html.includes('<button')
        : item?.html.includes(`aria-label="${esc(`${t.track}: ${row.keyword}`)}"`) && count(item?.html ?? '', '<button') === 1
      return !item || item.keyword !== row.keyword || count(item.html, esc(why)) !== 1 || !action || !item.html.includes(`aria-label="${esc(t.potentialOf(String(win.score)))}"`)
    })
    check(`W1 (${locale}): "${t.title}": the ${EASY_WINS_SHOWN} best, best first, each with one "why" sentence from its searches, competition and click price, its potential, and one button to track it (or "tracked")`,
      m.wins.length > EASY_WINS_SHOWN && items.length === EASY_WINS_SHOWN && wrong.length === 0 && section.includes(`>${esc(t.title)}</h2>`)
      && section.includes(esc(t.showing(formatCount(EASY_WINS_SHOWN, locale), formatCount(m.wins.length, locale)))) && section.includes(`>${esc(t.showAll)}</button>`)
      && !items.some((i) => i.keyword === 'run shop'),
      show({ items: items.map((i) => i.keyword), expected: expected.map((w) => w.row.keyword), wrong: wrong.map((w) => w.row.keyword) }))
  }

  console.log('\nT) the table')
  for (const locale of ['he', 'en'] as Locale[]) {
    const html = rendered.find((r) => r.name === `seeded ${locale}`)?.html as string
    const t = getDashboardDictionary(locale).keywordResearchScan
    const m = modelFor(locale)
    const chips = el(html, 'data-research-chips=')
    const buttons = [...chips.matchAll(/<button[^>]*data-chip="([a-z_]+)"[^>]*aria-pressed="(true|false)"[^>]*>([\s\S]*?)<\/button>/g)].map((x) => ({ chip: x[1], pressed: x[2] === 'true', html: x[3] }))
    const bad = RESEARCH_CHIPS.filter((c, i) => buttons[i]?.chip !== c || !buttons[i].html.includes(esc(t.chips[c])) || !buttons[i].html.includes(`>${formatCount(m.counts[c], locale)}</span>`))
    check(`T1 (${locale}): the chips, in order, each with its count (${RESEARCH_CHIPS.map((c) => `${t.chips[c]} ${m.counts[c]}`).join(', ')}); "all" pressed`,
      buttons.length === RESEARCH_CHIPS.length && bad.length === 0 && buttons.filter((b) => b.pressed).map((b) => b.chip).join() === 'all'
      && m.counts.google === 2 && m.counts.suggested > 0 && m.counts.tracked === FIXTURE[locale].tracked.length,
      show({ buttons: buttons.map((b) => b.chip), bad }))
    const rows = tableKeywords(html)
    const byVolume = [...m.chipRows].sort((a, b) => (b.avgMonthlySearches ?? -1) - (a.avgMonthlySearches ?? -1)).map((r) => r.keyword)
    const table = el(html, 'id="research-table"')
    const gscRow = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((x) => x[0]).find((r) => r.includes(`>${esc(FIXTURE[locale].gscOnly)}<`)) ?? ''
    const withCompetitors = FIXTURE[locale].keywords.find((k) => k.competitors.length > 1) as ScanKeyword
    const competitorRow = [...table.matchAll(/<tr\b[\s\S]*?<\/tr>/g)].map((x) => x[0]).find((r) => r.includes(`>${esc(withCompetitors.keyword)}<`)) ?? ''
    check(`T2 (${locale}): every row of the research (plus the tracked keywords Google reports for), sorted as the table sorts, each with the line saying where it comes from`,
      show(rows) === show(byVolume) && rows.length === FIXTURE[locale].keywords.length + 1
      && table.includes(`>${m.chipRows.length}</span>`) && count(table, 'data-keyword-source=') >= rows.length - 1
      && gscRow.includes(esc(t.source.google(formatCompact(12, locale), formatCompact(950, locale)))) && gscRow.includes(`>${esc(t.source.tracked)}</span>`)
      && competitorRow.includes(esc(t.source.competitor(withCompetitors.competitors[0], withCompetitors.competitors.length - 1)))
      && !table.includes(esc(getDashboardDictionary(locale).keywordResearch.opportunities.show)),
      show({ rows, byVolume }))
    const suggestedHtml = render(`suggested ${locale}`, locale, seeded(locale), { chip: 'suggested', sortBy: 'rank' })
    const suggestedRows = tableKeywords(suggestedHtml)
    const expected = rowsForChip(m.rows, 'suggested', m.totals.averageCpc).map((r) => r.keyword)
    check(`T3 (${locale}): "${t.chips.suggested}" shows the scan's keywords not tracked yet that pass the relevance filter, ranked by the easy-wins score`,
      show(suggestedRows) === show(expected) && expected.length === m.counts.suggested && !expected.includes('run shop')
      && !expected.some((k) => FIXTURE[locale].tracked.some((tr) => tr.keyword === k))
      && /data-chip="suggested"[^>]*aria-pressed="true"/.test(suggestedHtml),
      show({ suggestedRows, expected }))
  }
  {
    const page = readFileSync(HARNESS.PAGE_PATH, 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    const start = page.indexOf('const trackKeyword = async')
    const body = page.slice(start, page.indexOf('\n  }\n', start))
    check('T4: one click tracks a keyword in the current project (no picker) through the existing action and its quota check, in our own words',
      /const selectedProject = activeProjectId \?\? ''/.test(page) && !/setSelectedProject/.test(page)
      && body.includes("fetch('/api/keyword-research/add-to-project'") && /projectId: selectedProject,/.test(body)
      && /response\.status === 402 \? t\.addToProject\.errorQuota/.test(body) && !/result\??\.(message|error)\b/.test(body)
      && /scan\.reloadTracked\(\)/.test(body) && count(body, 'fetch(') === 1,
      start < 0 ? 'trackKeyword missing' : undefined)
  }

  console.log('\nR) stage B still running')
  for (const locale of ['he', 'en'] as Locale[]) {
    primeGsc('ready')
    const t = getDashboardDictionary(locale).keywordResearchScan
    const view = runView(locale, [['b1', 'done'], ['b2', 'running'], ['b3', 'pending']], 'running', 'empty')
    const html = render(`running ${locale}`, locale, view)
    const card = el(html, 'data-scan-state="running"')
    const pills = [...el(card, 'data-seed-keywords=').matchAll(/<li[^>]*>([^<]*)<\/li>/g)].map((x) => x[1])
    const steps = [...card.matchAll(/data-step="(b[123])" data-step-state="([a-z]+)"/g)].map((x) => `${x[1]}:${x[2]}`)
    check(`R1 (${locale}): the site's 5 seed keywords with "${t.running.title}", the three steps; no figures yet; the form open below`,
      view.kind === 'running' && card.includes(`>${esc(t.running.title)}</h2>`) && show(pills) === show(FIXTURE[locale].seeds.map(esc))
      && show(steps) === show(['b1:done', 'b2:running', 'b3:pending'])
      && !html.includes('data-scan-overview') && !html.includes('data-easy-wins') && !html.includes('id="research-table"')
      && !html.includes('data-research-form="collapsed"') && !/<div hidden=""[^>]*>\s*<form/.test(html) && html.includes('<form'),
      show({ kind: view.kind, pills, steps }))
    const still = render(`seeded, still running ${locale}`, locale, seeded(locale, { running: true }))
    const overview = el(still, 'data-scan-overview="scan"')
    check(`R2 (${locale}): research already found while b3 still runs: the figures, the "still running" badge and note`,
      overview.includes(esc(t.overview.badgeRunning)) && overview.includes('data-scan-still-running') && overview.includes(esc(t.overview.stillRunning)))
  }

  console.log('\nE) a scan that failed, a failed read, the first moment')
  for (const locale of ['he', 'en'] as Locale[]) {
    primeGsc('ready')
    const t = getDashboardDictionary(locale).keywordResearchScan
    // b2 found nothing it kept, b3 failed at the provider: a partial run with an empty research.
    const partial = runView(locale, [['b1', 'done'], ['b2', 'done'], ['b3', 'failed', 'serper_http_500']], 'partial', 'empty')
    const failed = runView(locale, [['b1', 'failed', 'fetch_failed'], ['b2', 'skipped', 'google_ads_quota'], ['b3', 'skipped']], 'failed', 'empty')
    const unreadable = runView(locale, [['b1', 'done'], ['b2', 'done'], ['b3', 'done']], 'done', 'error')
    const market = runView(locale, [['b1', 'done'], ['b2', 'skipped', 'market_unsupported'], ['b3', 'skipped']], 'done', 'empty')
    const htmls = {
      partial: render(`partial ${locale}`, locale, partial),
      failed: render(`failed ${locale}`, locale, failed),
      unreadable: render(`unreadable ${locale}`, locale, unreadable),
      market: render(`market ${locale}`, locale, market),
    }
    const reasons = Object.fromEntries(Object.entries(htmls).map(([k, h]) => [k, /data-scan-reason="([a-z_]+)"/.exec(h)?.[1]]))
    const clean = Object.values(htmls).every((h) => {
      const card = el(h, 'data-scan-state="empty"')
      return card.includes(`>${esc(t.empty.title)}</h2>`) && !h.includes('data-scan-overview') && !h.includes('id="research-table"') && !h.includes('data-easy-wins')
        && h.includes('<form') && !/<div hidden=""[^>]*>\s*<form/.test(h) && !/serper|google_ads_quota|fetch_failed|http_500/i.test(h)
        && card.includes(`>${esc(t.empty.useSeeds)}</button>`)
    })
    check(`E1 (${locale}): a failed or partial scan: a clean empty state (our title, one sentence of our own, the site's seed keywords to put into the form), the form open, no provider text`,
      clean && reasons.partial === 'nothing_found' && reasons.failed === 'nothing_found' && reasons.market === 'market_unsupported'
      && htmls.partial.includes(esc(t.empty.reasons.nothing_found)) && htmls.market.includes(esc(t.empty.reasons.market_unsupported))
      && !el(htmls.partial, 'data-scan-state="empty"').includes(`>${esc(t.empty.retry)}</button>`),
      show(reasons))
    check(`E2 (${locale}): a research that could not be read offers a retry, never a provider's message`,
      reasons.unreadable === 'unreadable' && el(htmls.unreadable, 'data-scan-state="empty"').includes(`>${esc(t.empty.retry)}</button>`)
      && htmls.unreadable.includes(esc(t.empty.reasons.unreadable)))
    const pending = render(`pending ${locale}`, locale, runView(locale, [['b1', 'done'], ['b2', 'done'], ['b3', 'done']], 'done', 'none'))
    check(`E3 (${locale}): the first moment (the run is known, its research on its way): a placeholder in the card's place, nothing of today's empty screen`,
      el(pending, 'data-scan-state="pending"').includes('aria-busy="true"') && pending.includes(esc(t.pending))
      && !pending.includes('data-scan-overview') && pending.includes('data-research-form="collapsed"'))
  }

  console.log('\nM) a research the merchant ran')
  for (const locale of ['he', 'en'] as Locale[]) {
    primeGsc('ready')
    const t = getDashboardDictionary(locale).keywordResearchScan
    const html = render(`manual ${locale}`, locale, seeded(locale), { manualActive: true, results: MANUAL[locale] })
    const overview = el(html, 'data-scan-overview="manual"')
    const manual = researchModel({ scanKeywords: FIXTURE[locale].keywords, tracked: FIXTURE[locale].tracked, manual: MANUAL[locale], google: FIGURES, chip: 'all' })
    check(`M1 (${locale}): a research run from the form takes the screen: its own figures, its easy wins and rows, and the way back to the site's research`,
      overview.includes(esc(t.overview.badgeManual)) && overview.includes(`>${esc(t.overview.backToScan)}</button>`)
      && overview.includes(esc(t.overview.headline(formatCount(manual.totals.keywords, locale), formatCount(manual.totals.monthlySearches, locale))))
      && tableKeywords(html).length === MANUAL[locale].length && html.includes('data-research-form="collapsed"')
      && show(tableKeywords(html).slice().sort()) === show(MANUAL[locale].map((k) => k.keyword).sort()))
  }

  console.log('\nG) Search Console as the "from Google" source')
  for (const locale of ['he', 'en'] as Locale[]) {
    const t = getDashboardDictionary(locale).keywordResearchScan
    const w = getDashboardDictionary(locale).gscWidgets
    primeGsc('disabled')
    const off = render(`gsc disabled ${locale}`, locale, seeded(locale))
    check(`G1 (${locale}): Search Console switched off on the server: no "from Google" chip, no notice, no row it would add`,
      !off.includes('data-gsc-widget="keyword-research"') && !off.includes('data-chip="google"') && !tableKeywords(off).includes(FIXTURE[locale].gscOnly)
      && off.includes('data-chip="suggested"'))
    const setupProblems: string[] = []
    for (const state of Object.keys(STATUS_BODY)) {
      primeGsc(state as keyof typeof STATUS_BODY)
      const html = render(`gsc ${state} ${locale}`, locale, seeded(locale))
      const widget = el(html, 'data-gsc-widget="keyword-research"')
      const anchors = widget.match(/<a\b[^>]*>[\s\S]*?<\/a>/g) ?? []
      const problems = [
        !widget.includes(`data-gsc-state="${state}"`) && 'state',
        !widget.includes(esc(t.gsc.title)) && 'title',
        count(widget, esc(t.gsc.about)) !== 1 && 'sentence',
        anchors.length !== 1 && `${anchors.length} links`,
        !anchors[0]?.includes(`href="/settings?projectId=${P}#search-console"`) && 'link target',
        anchors[0] && anchors[0].replace(/<[^>]+>/g, '') !== esc(w.actions[state as keyof typeof w.actions]) && 'link label',
        /<button\b/.test(widget) && 'a button',
        !/data-chip="google"[^>]*>[\s\S]*?>0<\/span>/.test(html) && 'google chip (0)',
      ].filter(Boolean)
      if (problems.length) setupProblems.push(`${state}: ${problems.join(', ')}`)
    }
    check(`G2 (${locale}): before Search Console is set up, each of the four states shows the title, one sentence and one link, to the Search Console section of settings`,
      setupProblems.length === 0, setupProblems.join(' | '))
    primeGsc('error')
    const errored = render(`gsc error ${locale}`, locale, seeded(locale))
    const errWidget = el(errored, 'data-gsc-widget="keyword-research"')
    check(`G3 (${locale}): a failed Search Console read keeps the title and offers a retry, never "connect"`,
      errWidget.includes('data-gsc-state="error"') && errWidget.includes(esc(t.gsc.title)) && errWidget.includes(`>${esc(w.retry)}</button>`) && !/<a\b/.test(errWidget))
    primeGsc('ready')
    const ready = rendered.find((r) => r.name === `seeded ${locale}`)?.html as string
    const readyWidget = el(ready, 'data-gsc-widget="keyword-research"')
    check(`G4 (${locale}): ready: the notice says how many tracked keywords Google reports for; the chip counts them; those keywords are rows with their clicks and impressions`,
      readyWidget.includes('data-gsc-state="ready"') && readyWidget.includes(esc(t.gsc.legend(formatCount(2, locale))))
      && /data-chip="google"[^>]*>[\s\S]*?>2<\/span>/.test(ready) && tableKeywords(ready).includes(FIXTURE[locale].gscOnly) && !/<a\b/.test(readyWidget))
  }
  {
    const widget = el(loadingHe, 'data-gsc-widget="keyword-research"')
    check('G5: while Search Console loads, the "from Google" chip shows no number (never a 0 that means nothing), the notice says it is loading',
      widget.includes('data-gsc-state="loading"') && /data-chip="google"[^>]*>[\s\S]*?aria-busy="true">…<\/span>/.test(loadingHe)
      && !tableKeywords(loadingHe).includes(FIXTURE.he.gscOnly))
    const hidden = rendered.every((r) => !r.html.includes('data-gsc-widget="opportunities"'))
    process.env.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED = 'true'
    const devHtml = HARNESS.renderPage('he', { scan: scanOf(seeded('he')) })
    delete process.env.NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED
    check('G6: the raw Search Console opportunity browser stays a developer tool: absent from every state, there only with NEXT_PUBLIC_GSC_RAW_BROWSER_ENABLED',
      hidden && devHtml.includes('data-gsc-widget="opportunities"'))
  }

  console.log('\nX) nothing raw; both languages; both directions')
  {
    const raw = rendered.filter((r) => /\bNaN\b|\bundefined\b|\[object Object\]|>null<|Infinity|GoogleAdsError|PGRST|\bstack\b/.test(text(r.html)) || /\bnull\b/.test(text(r.html)))
    check('X1: no state shows NaN, undefined, null, an object, or any provider or database text',
      raw.length === 0 && rendered.length >= 30, raw.map((r) => `${r.name}: ${/\bNaN\b|\bundefined\b|\[object Object\]|\bnull\b|Infinity|GoogleAdsError|PGRST|\bstack\b/.exec(text(r.html))?.[0]}`).join(', '))
    const english = rendered.filter((r) => r.locale === 'en')
    const hebrewInEnglish = english.filter((r) => HEBREW.test(r.html))
    check('X2: English screens have no Hebrew at all (every new line of copy exists in English)',
      english.length >= 15 && hebrewInEnglish.length === 0,
      hebrewInEnglish.map((r) => `${r.name}: ${r.html.match(/[^<>]{0,30}[֐-׿][^<>]{0,30}/)?.[0]}`).join(' | '))
    const he = rendered.filter((r) => r.locale === 'he')
    const newFiles = ['EasyWins', 'KeywordSourceLine', 'ResearchChips', 'ResearchFormBar', 'ScanCards', 'ScanGscNotice', 'ScanOverview']
      .map((n) => ({ n, src: readFileSync(join(ROOT, 'components/keyword-research', `${n}.tsx`), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1') }))
    const physical = newFiles.filter(({ src }) => /(?<![\w-])(?:-?m[lr]|p[lr]|left|right|border-[lr]|rounded-[lr]|text-(?:left|right)|float-(?:left|right))-[\w[]/.test(src) || /\b(?:text-left|text-right)\b/.test(src))
    check('X3: Hebrew renders right to left and English left to right; the new parts use logical sides only (start/end), so they mirror',
      he.every((r) => r.html.includes('max-w-6xl mx-auto rtl')) && english.every((r) => r.html.includes('max-w-6xl mx-auto ltr')) && physical.length === 0,
      physical.map((f) => f.n).join(', '))
  }
  {
    const he = getDashboardDictionary('he').keywordResearchScan as any
    const en = getDashboardDictionary('en').keywordResearchScan as any
    const diffs: string[] = []
    const strings: { locale: string; path: string; value: string }[] = []
    const sample = (fn: (...a: any[]) => unknown) => {
      const args = Array.from({ length: fn.length }, (_, i) => (i === 0 ? { volume: '10', competition: 'low', cpc: '1', cpcHigh: true } : '7'))
      try { return String(fn(...(fn.length === 1 && /volume/.test(String(fn)) ? [args[0]] : Array.from({ length: fn.length }, () => '7')))) } catch { return '' }
    }
    const walk = (a: any, b: any, path: string) => {
      const ka = Object.keys(a).sort(), kb = Object.keys(b).sort()
      if (show(ka) !== show(kb)) diffs.push(`${path}: ${show(ka.filter((k) => !kb.includes(k)))} / ${show(kb.filter((k) => !ka.includes(k)))}`)
      for (const k of ka) {
        if (!(k in b)) continue
        const x = a[k], y = b[k]
        if (typeof x !== typeof y) diffs.push(`${path}.${k}: ${typeof x} vs ${typeof y}`)
        else if (typeof x === 'function') {
          if (x.length !== y.length) diffs.push(`${path}.${k}: arity`)
          strings.push({ locale: 'he', path: `${path}.${k}`, value: sample(x) }, { locale: 'en', path: `${path}.${k}`, value: sample(y) })
        } else if (typeof x === 'object') walk(x, y, `${path}.${k}`)
        else strings.push({ locale: 'he', path: `${path}.${k}`, value: String(x) }, { locale: 'en', path: `${path}.${k}`, value: String(y) })
      }
    }
    walk(he, en, 'keywordResearchScan')
    const hebrewInEn = strings.filter((s) => s.locale === 'en' && HEBREW.test(s.value))
    const notHebrew = strings.filter((s) => s.locale === 'he' && s.value && !HEBREW.test(s.value))
    const topKeys = (file: string) => [...readFileSync(join(ROOT, 'lib/i18n/dashboard', file), 'utf8').matchAll(/^ {2}(\w+): [{'"`(]/gm)].map((m) => m[1])
    const place = ['he.ts', 'en.ts'].map((f) => { const keys = topKeys(f); const i = keys.indexOf('keywordResearch'); return { f, next: keys[i + 1], last: keys[keys.length - 1], total: keys.length } })
    check('X4: the new copy exists in both languages with the same keys, English without Hebrew, Hebrew in Hebrew, placed right after keywordResearch (never at the end)',
      diffs.length === 0 && strings.length > 100 && hebrewInEn.length === 0 && notHebrew.length === 0
      && place.every((p) => p.next === 'keywordResearchScan' && p.last !== 'keywordResearchScan'),
      show({ diffs, hebrewInEn: hebrewInEn.map((s) => s.path), notHebrew: notHebrew.map((s) => s.path), place }))
    const heT = getDashboardDictionary('he').keywordResearchScan
    check('X5: the spec\'s Hebrew, word for word: the running line, the headline, the best keywords to start with (our own wording), the nine chips',
      heT.running.title === 'המחקר המלא רץ, זה לוקח כמה דקות' && heT.overview.headline('N', 'X') === 'מצאנו N ביטויים, X חיפושים בחודש'
      && heT.easyWins.title === 'הביטויים הכי משתלמים להתחלה'
      && show(RESEARCH_CHIPS.map((c) => heT.chips[c])) === show(['הכל', 'מהמחקר', 'ממתחרים', 'מגוגל', 'נפח גבוה', 'תחרות נמוכה', 'שאלות', 'מוצע למעקב', 'כבר במעקב'])
      && heT.tiles.cpc.includes('CPC'))
  }

  console.log('\nN) opening the tab only reads')
  {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    const page = strip(readFileSync(HARNESS.PAGE_PATH, 'utf8'))
    const components = ['EasyWins', 'KeywordSourceLine', 'ResearchChips', 'ResearchFormBar', 'ScanCards', 'ScanGscNotice', 'ScanOverview']
      .map((n) => ({ n, src: strip(readFileSync(join(ROOT, 'components/keyword-research', `${n}.tsx`), 'utf8')) }))
    const effects = [
      ...(/\buse(Layout)?Effect\s*\(/.test(page) ? ['page'] : []),
      ...components.filter(({ src }) => /\buse(Layout)?Effect\s*\(|\bfetch\s*\(/.test(src)).map((f) => f.n),
    ]
    // Every fetch in the page sits in a component-level handler; every handler that fetches (or calls one
    // that does) is reachable only from an event prop (onClick, onSubmit, onTrack, onAddQuestions...).
    const defs = [...page.matchAll(/^ {2}const (\w+) = (?:async )?\([^)]*\)(?:: [^=]+)? => \{/gm)].map((m) => {
      let depth = 0
      let end = m.index + m[0].length - 1
      for (let i = end; i < page.length; i++) {
        if (page[i] === '{') depth++
        else if (page[i] === '}' && --depth === 0) { end = i; break }
      }
      return { name: m[1], start: m.index, end }
    })
    const enclosing = (at: number) => defs.find((d) => at > d.start && at < d.end)?.name ?? '(render)'
    const fetching = new Set([...page.matchAll(/\bfetch\s*\(/g)].map((m) => enclosing(m.index)))
    let grew = true
    while (grew) {
      grew = false
      for (const d of defs) {
        if (fetching.has(d.name)) continue
        const body = page.slice(d.start, d.end)
        if ([...fetching].some((f) => new RegExp(`\\b${f}\\s*\\(`).test(body))) { fetching.add(d.name); grew = true }
      }
    }
    const loose: string[] = []
    for (const name of fetching) {
      for (const m of page.matchAll(new RegExp(`\\b${name}\\b`, 'g'))) {
        const at = m.index as number
        const line = page.slice(page.lastIndexOf('\n', at) + 1, page.indexOf('\n', at))
        const inHandler = fetching.has(enclosing(at)) && enclosing(at) !== name
        const isDef = new RegExp(`const ${name} = `).test(line)
        const isEventProp = new RegExp(`\\bon[A-Z]\\w*=\\{(?:\\([^)]*\\) => )?${name}\\b`).test(line)
        if (!inHandler && !isDef && !isEventProp) loose.push(`${name}: ${line.trim()}`)
      }
    }
    check('N1: opening the tab only reads: no fetch in any render of any state; no effect in the page or its new parts; Google Ads, AI and tracking calls run only from a click or a submit',
      fetchesDuringRender.length === 0 && effects.length === 0 && !fetching.has('(render)') && loose.length === 0
      && ['handleSearch', 'handleOpenTrendModal', 'handleAddToProject', 'handleGenerateAIQuestions', 'handleAddAIQuestions', 'trackKeyword', 'submitResearch'].every((n) => fetching.has(n)),
      show({ fetchesDuringRender, effects, fetching: [...fetching], loose }))
    const hook = strip(readFileSync(join(ROOT, 'components/keyword-research/useScanResearch.ts'), 'utf8'))
    const gsc = strip(readFileSync(join(ROOT, 'components/gsc/gsc-data.ts'), 'utf8'))
    check('N2: what reads on opening: the scan\'s run and stored research (GETs, the hook\'s only fetch) and Search Console\'s stored figures; the research route reads the cache only (scan-route.qa.ts A11)',
      count(hook, 'fetch(') === 1 && /fetch\(url, \{ cache: 'no-store' \}\)/.test(hook) && !/method:/.test(hook)
      && /`\/api\/projects\/\$\{encodeURIComponent\(projectId\)\}\/seed`/.test(hook) && /`\/api\/keyword-research\/scan\?projectId=\$\{encodeURIComponent\(projectId\)\}`/.test(hook)
      && count(gsc, 'fetch(') === 1 && /fetch\(url, \{ cache: 'no-store' \}\)/.test(gsc) && /`\/api\/gsc\/status\?projectId=/.test(gsc) && /`\/api\/gsc\/metrics\?projectId=/.test(gsc))
  }

  console.log('\nY) narrow layouts (found in the 768 and 390 screenshots)')
  {
    const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
    const wins = strip(readFileSync(join(ROOT, 'components/keyword-research/EasyWins.tsx'), 'utf8'))
    // Beside the sidebar at 768 the card is ~450px wide: a viewport breakpoint turned
    // its rows into a five-column table and squeezed the keyword to one letter a line.
    check('Y1: the easy battles switch to columns by the card\'s own width (a container query), never by the viewport',
      /<section data-easy-wins="" className="@container /.test(wins)
      && /const GRID = '@3xl:grid-cols-\[/.test(wins)
      && (wins.match(/@3xl:/g) ?? []).length >= 8
      && !/\b(sm|md|lg|xl):(grid|block|col-|row-|w-|ps-)/.test(wins))
    const notice = strip(readFileSync(join(ROOT, 'components/keyword-research/ScanGscNotice.tsx'), 'utf8'))
    // At 390 the sentence shrank to one word a line and pushed the button out of the card.
    check('Y2: the Google notice wraps on a narrow screen: every part beside its title has a basis, and the setup sentence one of its own, so the button drops below it instead of leaving the card',
      /layout="inline" className="min-w-0 flex-1 basis-80 \[&>p\]:basis-52"/.test(notice)
      && (notice.match(/className="min-w-0 flex-1 basis-80/g) ?? []).length === 4
      && !/className="min-w-0 flex-1"/.test(notice))
  }

  globalThis.fetch = realFetch
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
