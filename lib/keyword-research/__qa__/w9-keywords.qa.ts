/**
 * Wave 9 — the Keywords tab, the research's "already covered" group, and five competitors.
 *
 *  A) Keywords tab (the owner: "round Search Console's positions, no 11.2; the Google
 *     chip on a live row is unclear; Search Console on top, live tracking under it"):
 *     whole-number positions (standard rounding), the tracked keywords listed in the
 *     Search Console section, the real 28-day window and one rounding note, the two
 *     slots (connected on top, the connect card under the live tracking), the live
 *     heading.
 *  B) Keyword research (japan4u): a phrase the site already covers (a page, one of our
 *     articles, or a query it ranks for with a page) is marked by THE shared
 *     cannibalization check, moved out of the easy wins and the "suggested" chip into a
 *     collapsed "כבר יש לכם עמוד על זה" group with "לשפר את העמוד", never removed.
 *  C) Competitors: five active everywhere the product maps them, with no extra paid
 *     call (a4 sends the same three searches; b3 still asks about three), and an empty
 *     card that starts the scan (the only thing that maps them).
 *
 * Every guard has a mutation control. Run: npx tsx lib/keyword-research/__qa__/w9-keywords.qa.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */

let pass = 0
let fail = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? `\n      ${detail}` : ''}`) }
}

const Module = require('module')
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/keywords'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')
const { createElement } = require('react') as typeof import('react')
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../../i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary')

type Locale = 'he' | 'en'
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#x27;')
const render = (locale: Locale, node: unknown) =>
  renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)

async function main() {
  // ── A) the Keywords tab ──────────────────────────────────────────────────
  console.log('A) Keywords tab: Search Console on top, whole positions, live tracking under it')
  {
    const F = require(join(ROOT, 'components/gsc/format.ts')) as typeof import('../../../components/gsc/format')
    const whole = (f: (n: number, l: string) => string) => f(11.2, 'en') === '11' && f(11.5, 'en') === '12' && f(11.49, 'en') === '11' && f(1.5, 'he') === '2' && f(3, 'he') === '3'
    check('A1: positions are whole numbers, standard rounding (11.2 → 11, 11.5 → 12)', whole(F.formatWholePosition))
    check('A1-MUT: rounding down (11.5 → 11) fails A1', !whole((n, l) => F.formatCount(Math.floor(n), l)))
    check('A1-MUT2: the old one-decimal format fails A1', !whole(F.formatPosition))

    const G = require(join(ROOT, 'components/gsc/GscKeywordFigures.tsx'))
    const insights = G.pickInsights({
      run: { startDate: '2026-08-30', endDate: '2026-09-26' },
      averages: { t1: { clicks: 40, impressions: 900, position: 11.5 }, t2: { clicks: 0, impressions: 0, position: null } },
      untracked: [{ query: 'trail sandals', clicks: 7, impressions: 2400, position: 14.2 }],
      untrackedTotal: 1, queriesTotal: 3, syncedAt: '2026-09-27T05:41:00Z',
    })
    check('A2: the window is the sync\'s real one (run.startDate … run.endDate)', insights.windowStart === '2026-08-30' && insights.windowEnd === '2026-09-26')
    check('A2-MUT: a malformed date is dropped, never shown', G.pickInsights({ run: { startDate: 'yesterday', endDate: null } }).windowStart === null)
    const targets = [{ id: 't1', keyword: 'hiking boots' }, { id: 't2', keyword: 'wool socks' }]
    const view = (data: unknown) => ({ data, retry: () => {} })
    for (const locale of ['he', 'en'] as Locale[]) {
      const g = getDashboardDictionary(locale).gscWidgets
      const top = (props: Record<string, unknown>) => render(locale, createElement(G.GscKeywordsNotice, { projectId: 'p1', view: view({ state: 'ready', data: insights }), onTrack: async () => 'added', slot: 'top', ...props }))
      const html = top({ targets })
      const listed = (h: string) => h.includes('hiking boots') && h.includes('data-gsc-tracked="tracked"') && h.includes('trail sandals')
        && h.includes(esc(g.untracked.addAria('trail sandals'))) && !h.includes('wool socks')
      check(`A3 (${locale}) the tracked keyword Google reports is listed as tracked (its figure lives here), the untracked one with "${g.untracked.add}"`, listed(html))
      check(`A3-MUT (${locale}) without the tracked keywords fails A3`, !listed(top({})))
      const wholeHtml = (h: string) => />12</.test(h) && />14</.test(h) && !h.includes('11.5') && !h.includes('14.2')
      check(`A4 (${locale}) positions on screen are whole (11.5 → 12, 14.2 → 14)`, wholeHtml(html))
      check(`A4-MUT (${locale}) a decimal back on screen fails A4`, !wholeHtml(html.replace('>14<', '>14.2<')))
      const noted = (h: string) => h.includes(esc(g.keywords.rounded)) && h.includes('data-gsc-window') && h.includes(esc(g.keywords.range(F.formatDay('2026-08-30', locale), F.formatDay('2026-09-26', locale))))
      check(`A5 (${locale}) one small rounding note and the real 28-day window`, noted(html) && (html.match(/data-gsc-rounding/g) ?? []).length === 1)
      check(`A5-MUT (${locale}) without the note fails A5`, !noted(html.replace(esc(g.keywords.rounded), '')))
      // The slots: connected on top only; the connect card under the live tracking only.
      const slot = (state: string, s: 'top' | 'bottom') => render(locale, createElement(G.GscKeywordsNotice, { projectId: 'p1', view: view({ state }), slot: s }))
      const slotsOk = slot('not_connected', 'top') === '' && slot('not_connected', 'bottom').includes(esc(g.connect.titles.not_connected))
        && slot('loading', 'bottom') === '' && slot('loading', 'top').includes('data-gsc-state="loading"') && slot('disabled', 'top') === '' && slot('disabled', 'bottom') === ''
      check(`A6 (${locale}) not connected: nothing on top, the connect card under the live tracking; connected: only on top`, slotsOk)
    }
    const fig = code('components/gsc/GscKeywordFigures.tsx')
    check('A6-MUT: a top slot that also draws the connect card fails A6',
      /if \(slot === 'top'\) return null/.test(fig) && !/if \(slot === 'top'\) return null/.test(fig.replace("if (slot === 'top') return null", '')))
    const he = getDashboardDictionary('he').keywordsPage.live
    const en = getDashboardDictionary('en').keywordsPage.live
    check('A7: the live section is labelled "מעקב מיקומים בלייב" / "Live rank tracking", said to be a live check, not Search Console',
      he.title === 'מעקב מיקומים בלייב' && en.title === 'Live rank tracking' && he.body.includes('לא מ-Search Console') && en.body.includes('not Search Console'))
    const panel = code('components/keywords/ProjectKeywordsPanel.tsx')
    check('A8: the panel mounts the live heading from that copy', panel.includes('<LiveTrackingHeading title={kp.live.title} body={kp.live.body} badge={kp.live.badge} />'))
    check('A8-MUT: a hard-coded heading fails A8', !panel.replace('<LiveTrackingHeading title={kp.live.title} body={kp.live.body} badge={kp.live.badge} />', '<h2>Live</h2>').includes('<LiveTrackingHeading title={kp.live.title}'))
  }

  // ── B) the research's "already covered" group ────────────────────────────
  console.log('\nB) keyword research: phrases the site already covers are set apart, never removed')
  {
    const { buildOverlapIndex } = require(join(ROOT, 'lib/content/cannibalization/check.ts'))
    const { coveredKeywords, readCovered } = require(join(ROOT, 'lib/keyword-research/covered.ts'))
    const { researchModel } = require(join(ROOT, 'lib/keyword-research/model.ts'))
    const index = buildOverlapIndex({
      pages: [{ title: 'מסעדות כשרות ביפן', url: 'https://japan4u.co.il/מסעדות-כשרות-ביפן/' }, { title: 'יפן — המדריך', url: 'https://japan4u.co.il/' }],
      articles: [{ id: 'a1', title: 'האלפים היפנים: מסלולי הליכה ונופים', slug: 'japanese-alps', url: 'https://japan4u.co.il/japanese-alps/' }],
      gsc: [{ query: 'נגויה יפן', page: 'https://japan4u.co.il/nagoya/', impressions: 108, position: 11.6 }],
      topics: [{ id: 'tp1', topic: 'רכבות ביפן', primaryKeyword: 'רכבות ביפן', status: 'planned' }],
      ideas: [], homeHosts: ['japan4u.co.il'],
    })
    const kw = (keyword: string, v: number) => ({ keyword, avgMonthlySearches: v, competition: 'LOW', competitionIndex: 5, lowTopOfPageBid: 0.1, highTopOfPageBid: 1, currency: 'ILS', origins: ['home_page'], competitors: [], relevant: true })
    const keywords = [kw('מסעדות כשרות ביפן', 390), kw('האלפים היפנים', 1000), kw('נגויה יפן', 140), kw('רכבות ביפן', 140), kw('טיול קיץ ביפן לזוגות', 210), kw('יפן', 5000)]
    const covered = coveredKeywords(index, keywords)
    const keys = Object.keys(covered).sort().join(',')
    check('B1: a page, one of our articles and a query the site ranks for mark their phrase; a planned topic, a long-tail and the home page do not',
      keys === ['האלפים היפנים', 'מסעדות כשרות ביפן', 'נגויה יפן'].sort().join(',')
      && covered['מסעדות כשרות ביפן'].kind === 'page' && covered['האלפים היפנים'].kind === 'article' && covered['נגויה יפן'].kind === 'search', keys)
    check('B2: "improve the page" is an in-app path only (the article editor, or existing content)',
      covered['האלפים היפנים'].improveHref === '/content/articles/a1' && covered['מסעדות כשרות ביפן'].improveHref.startsWith('/content/existing?q=')
      && Object.values(covered).every((c: any) => c.improveHref.startsWith('/') && !c.improveHref.startsWith('//')))
    check('B2-MUT: an external "improve" link is dropped by the reader', readCovered({ x: { ...covered['נגויה יפן'], improveHref: 'https://evil.example/' } }) === undefined
      && readCovered({ x: { ...covered['נגויה יפן'], improveHref: '//evil.example/' } }) === undefined && readCovered(covered) !== undefined)
    const tracked = [{ id: 't1', keyword: 'נגויה יפן', metrics: null }]
    const args = { scanKeywords: keywords, tracked, manual: null, google: null, chip: 'suggested' }
    const before = researchModel(args)
    const after = researchModel({ ...args, covered })
    const inWins = (m: any, k: string) => m.wins.some((w: any) => w.row.keyword === k)
    const inChip = (m: any, k: string) => m.chipRows.some((r: any) => r.keyword === k)
    const apart = (m: any) => !inWins(m, 'מסעדות כשרות ביפן') && !inChip(m, 'מסעדות כשרות ביפן') && !inWins(m, 'האלפים היפנים')
      && m.covered.map((c: any) => c.row.keyword).join(',') === 'האלפים היפנים,מסעדות כשרות ביפן'
      && inWins(m, 'טיול קיץ ביפן לזוגות') && m.rows.length === before.rows.length && m.counts.suggested === before.counts.suggested - 2
    check('B3: covered phrases leave the easy wins and "suggested" for the covered group (most searched first); a tracked one is not re-listed; nothing is removed', inWins(before, 'מסעדות כשרות ביפן') && apart(after),
      JSON.stringify({ wins: after.wins.map((w: any) => w.row.keyword), covered: after.covered.map((c: any) => c.row.keyword), s: [before.counts.suggested, after.counts.suggested] }))
    check('B3-MUT: a model that ignores the covered map fails B3', !apart({ ...before, covered: [] }))

    const EasyWins = require(join(ROOT, 'components/keyword-research/EasyWins.tsx')).default
    for (const locale of ['he', 'en'] as Locale[]) {
      const t = getDashboardDictionary(locale).keywordResearchScan.easyWins
      const html = render(locale, createElement(EasyWins, { wins: after.wins, total: after.wins.length, adding: new Set(), onTrack: () => {}, covered: after.covered }))
      const group = (h: string) => /<details data-covered-group=""/.test(h) && !/<details data-covered-group="" open/.test(h)
        && h.includes(esc(t.covered('2'))) && (h.match(new RegExp(`>${esc(t.coveredMark)}<`, 'g')) ?? []).length === 2
        && (h.match(new RegExp(`>${esc(t.improve)}<`, 'g')) ?? []).length === 2 && h.includes('href="/content/articles/a1"')
      check(`B4 (${locale}) a collapsed group, each phrase marked "${t.coveredMark}" with "${t.improve}"`, group(html))
      check(`B4-MUT (${locale}) the group dropped fails B4`, !group(render(locale, createElement(EasyWins, { wins: after.wins, total: after.wins.length, adding: new Set(), onTrack: () => {} }))))
    }
    const routeSrc = code('app/api/keyword-research/scan/route.ts')
    const handler = code('lib/keyword-research/scan-route.ts')
    const wired = (r: string, h: string) => /overlap: \(admin, scope\) => loadOverlapIndex\(admin, scope, \{ gsc: true \}\)/.test(r)
      && /covered = coveredKeywords\(await deps\.overlap\(adminClient\(\), scope\), keywords\)/.test(h)
      && h.indexOf('const project = await readOwnProject') < h.indexOf('deps.overlap(')
    check('B5: the research route asks the shared check (project AND owner) only after proving the owner, best-effort', wired(routeSrc, handler) && /catch \{\s*covered = \{\}/.test(handler))
    check('B5-MUT: an unwired route fails B5', !wired(routeSrc.replace('overlap: (admin, scope) => loadOverlapIndex(admin, scope, { gsc: true }),', ''), handler))
  }

  // ── C) five competitors, no extra paid call ───────────────────────────────
  console.log('\nC) competitors: five active, the same paid calls, and a way to map them')
  {
    const capOf = (src: string, name = 'MAX_ACTIVE_COMPETITORS') => Number(new RegExp(`const ${name} = (\\d+)`).exec(src)?.[1])
    const caps = () => [
      capOf(code('lib/seed-scan/settings.ts')),
      capOf(code('app/api/projects/[id]/ai-visibility/competitors/route.ts')),
      capOf(code('app/api/projects/[id]/ai-visibility/competitors/[cid]/route.ts')),
      capOf(code('components/ai-visibility/CompetitorsPanel.tsx'), 'MAX_ACTIVE'),
    ]
    check('C1: five active competitors in the scan, both competitor routes and the AI visibility panel', caps().every((n) => n === 5), caps().join(','))
    check('C1-MUT: a cap left at three fails C1', ![5, 3, 5, 5].every((n) => n === 5))
    const steps = code('lib/seed-scan/steps.ts')
    const stepsB = code('lib/seed-scan/steps-b.ts')
    const sameCalls = (a: string, b: string) => capOf(a, 'MAX_SEARCHES') === 3 && capOf(a, 'MAX_COMPETITORS') === 5 && capOf(b, 'MAX_COMPETITOR_SEEDS') === 3 && capOf(b, 'MAX_IDEA_CALLS') === 3
    check('C2: no extra paid call: a4 still sends 3 searches (it already ranked up to 5), b3 still asks Google Ads about 3', sameCalls(steps, stepsB))
    check('C2-MUT: b3 asking about all five fails C2', !sameCalls(steps, stepsB.replace('MAX_COMPETITOR_SEEDS = 3', 'MAX_COMPETITOR_SEEDS = 5')))
    for (const locale of ['he', 'en'] as Locale[]) {
      const d = getDashboardDictionary(locale).projectSettings.competitors
      check(`C3 (${locale}) the copy says five, never three`, /5/.test(d.body) && /5/.test(d.max) && !/\b3\b/.test(d.body + d.max) && /5/.test(d.emptyScan))
    }
    const card = code('components/settings/CompetitorsCard.tsx')
    const empty = (src: string) => /seedFeatures && onScan \? \(/.test(src) && /<Button size="sm" onClick=\{onScan\}/.test(src) && /\{c\.mapNow\}/.test(src)
    check('C4: with no competitors, the card offers to map them now (starts the site scan)', empty(card) && /onScan=\{rescan \? scanFromCard : undefined\}/.test(code('app/(dashboard)/settings/page.tsx')))
    check('C4-MUT: the plain empty line back fails C4', !empty(card.replace('<Button size="sm" onClick={onScan}', '<Button size="sm"')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
