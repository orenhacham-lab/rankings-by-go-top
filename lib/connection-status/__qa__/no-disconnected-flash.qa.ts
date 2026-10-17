/**
 * "NOT CONNECTED" IS AN ANSWER, NEVER A DEFAULT (the owner's report, 2026-09-28:
 * "the page loads and for a second you see things like the Search Console account
 * not connected although it is connected").
 *
 * The cause, measured in the browser (scratchpad w7-flash filmstrips): the content
 * screens' setup line started from Search Console 'none' and from a platform read off
 * an overview of no project, so for as long as the two requests took it said "your
 * site is not connected for publishing · Search Console is not connected" to a
 * merchant who had both. The connection cards drew a failed read the same way.
 *
 *  A) the pure decisions (lib/connection-status, lib/content/content-hub-setup):
 *     only a 2xx answer with `connection: null` is "not connected"; a failed read,
 *     a missing key, a network error are errors; the setup line is 'loading' while
 *     either half is unknown and leaves Search Console out when it failed;
 *  B) FIRST PAINT of every connection component, rendered for real (static render =
 *     the frame before any request answered), in both languages: none of them paints
 *     a "not connected" sentence, a connect button or "choose a platform"; each
 *     paints its loading shape instead;
 *  C) with the answer already in hand (primed, as when the screen prefetched it),
 *     the first paint IS the final state: connected shows connected, a real
 *     "nothing connected" shows its sentence, a failed read shows "could not check"
 *     with a retry and never "not connected";
 *  D) the workspace never passes another project's (or no project's) overview as
 *     this one's; the screens wait for it before an empty state.
 *
 * Every guard has a mutation control that breaks the rule on purpose and shows the
 * guard fails. Source guards strip comments first.
 *
 * Run: npx tsx lib/connection-status/__qa__/no-disconnected-flash.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// Next's router hooks need a request outside of Next; they return plain values here.
const Module: any = require('module')
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/content'
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
const K = require('../known') as typeof import('../known')
const PC = require('../project-connections') as typeof import('../project-connections')
const R = require('../useKnownRead') as typeof import('../useKnownRead')
const HUB = require('../../content/content-hub-setup') as typeof import('../../content/content-hub-setup')
const GSC = require('../../../components/gsc/gsc-data') as typeof import('../../../components/gsc/gsc-data')
const { disconnectedCopy } = require('./disconnected-copy') as typeof import('./disconnected-copy')

type Locale = 'he' | 'en'
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const code = (p: string) => strip(read(p))
const comp = (p: string) => require(join(ROOT, p)).default
const render = (locale: Locale, node: unknown) =>
  renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ')

/** The "not connected" copy this markup paints (empty = none). */
function paintsDisconnected(locale: Locale, html: string): string[] {
  const t = text(html)
  return disconnectedCopy(locale).filter((phrase) => t.includes(phrase))
}

const PID = 'p-flash'
const WP = { id: 'wp1', project_id: PID, site_url: 'https://blog.example.com', wp_username: 'editor', connection_status: 'connected', last_tested_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }
const GSC_READY = { ok: true, oauthConfigured: true, connection: { id: 'g', status: 'connected', grantedScope: null, lastErrorCode: null, updatedAt: '2026-09-01T00:00:00Z' }, property: { siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner', selectedAt: '2026-09-01T00:00:00Z' }, windows: { 28: { finishedAt: '2026-09-20T00:00:00Z', clicks: 10, impressions: 100, ctr: 0.1, avgPosition: 5, startDate: '2026-08-24', endDate: '2026-09-20', summaryResyncRequired: false }, 90: null } }
const GSC_NONE = { ok: true, oauthConfigured: true, connection: null, property: null, windows: {} }
let pidN = 0
/** A fresh project id per render, so nothing primed for one case leaks into the next. */
const fresh = () => `${PID}-${++pidN}`

async function main() {
  console.log('"Not connected" is an answer, never a default')

  // ── A) the pure decisions ───────────────────────────────────────────────
  console.log('\nA) only an answer can say "not connected"')
  {
    const a = (status: number, body: unknown) => K.connectionAnswer({ status, body })
    const ok = a(200, { connection: null })
    check('A1: 200 { connection: null } is a ready "nothing connected"', ok.state === 'ready' && ok.value.connection === null)
    check('A2: 200 { connection: row } is ready with the row', (() => { const r = a(200, { connection: WP }); return r.state === 'ready' && r.value.connection === WP })())
    check('A3: a 500, a 401, a 404 are errors, not "nothing connected"', [500, 401, 404].every((s) => a(s, { error: 'x' }).state === 'error'))
    check('A4: a network failure (status 0) is an error', a(0, null).state === 'error')
    check('A5: a 2xx whose body is not the route\'s answer (no `connection` key) is an error', a(200, { error: 'x' }).state === 'error' && a(200, null).state === 'error')
    check('A6: no response yet is loading', K.connectionAnswer(null).state === 'loading')
    // Mutation control: the old reading, `res.ok ? body : {}` then `!!body.connection`.
    const oldReading = (status: number, body: any) => ({ connected: !!((status >= 200 && status < 300 ? body : {}) ?? {}).connection })
    check('A7 MUT: the old reading turns a 500 into "not connected" — the guard above would catch it', oldReading(500, { error: 'x' }).connected === false && a(500, { error: 'x' }).state !== 'ready')

    const all = (w: any, s: any, x: any) => PC.projectConnectionsFrom({ wordpress: w, shopify: s, site: x })
    const r200 = (connection: unknown, extra: Record<string, unknown> = {}) => ({ status: 200, body: { connection, ...extra } })
    check('A8: the three connections are loading until all three answered', all(r200(null), r200(null), null).state === 'loading')
    check('A9: any one failed read makes the whole answer an error (no "choose a platform" on it)', all(r200(null), { status: 500, body: {} }, r200(null)).state === 'error')
    const three = all(r200(WP), r200(null, { counts: { product: 3 } }), r200(null, { switchLocked: true }))
    check('A10: all answered: the connections, the switch lock and the counts', three.state === 'ready' && three.value.wordpress === WP && three.value.shopify === null && three.value.switchLocked && three.value.shopifyCounts?.product === 3)

    const view = (state: string, extra: object = {}) => ({ state, ...extra }) as any
    const row = (platform: any, gsc: any) => HUB.setupRowFromKnown(platform, gsc)
    check('A11: the setup line waits while the platform is unknown', row(null, view('ready', { summary: null })) === 'loading')
    check('A12: …and while Search Console is unknown, even with the platform known', row({ platform: 'none' }, view('loading')) === 'loading')
    const failed = row({ platform: 'wordpress' }, view('error'))
    check('A13: a failed Search Console read is left out, never "not connected"', failed !== 'loading' && failed.gscCard === null && !failed.showSetup)
    const off = row({ platform: 'wordpress' }, view('disabled'))
    check('A14: Search Console switched off is left out too', off !== 'loading' && off.gscCard === null && !off.showSetup)
    const both = row({ platform: 'wordpress' }, view('ready', { summary: null }))
    check('A15: connected platform + connected Search Console: nothing to say', both !== 'loading' && !both.showSetup)
    const none = row({ platform: 'none' }, view('not_connected'))
    check('A16: a real "nothing connected" answer still draws both parts', none !== 'loading' && none.platformCard === 'none' && none.gscCard === 'none')
    const np = row({ platform: 'wordpress' }, view('no_property'))
    const ra = row({ platform: 'wordpress' }, view('reauth_required'))
    check('A17: no property / reauth keep their own cards', np !== 'loading' && np.gscCard === 'no_property' && ra !== 'loading' && ra.gscCard === 'reauth')
    // Mutation control: the old default (Search Console 'none' until it answers).
    const oldDefault = HUB.selectSetupCards({ platform: 'wordpress', gscStatus: 'none' })
    check('A18 MUT: the old default draws "Search Console is not connected" before any answer', oldDefault.gscCard === 'none' && oldDefault.showSetup)
  }

  // ── B) first paint, before any answer ───────────────────────────────────
  console.log('\nB) the first paint (no answer yet) never says "not connected"')
  const ContentHubSetup = comp('components/content/ContentHubSetup.tsx')
  const ContentSection = comp('components/content/ContentSection.tsx')
  const WordPressConnectionPanel = comp('components/content/WordPressConnectionPanel.tsx')
  const GscPanel = comp('components/content/GscPanel.tsx')
  const GscMetricsTable = comp('components/content/GscMetricsTable.tsx')
  const ContentHubPlatformCard = comp('components/content/ContentHubPlatformCard.tsx')
  // The detector itself (mutation control for every B/C check): it finds the copy in a
  // real "not connected" paint.
  for (const locale of ['he', 'en'] as Locale[]) {
    const pid = fresh()
    GSC.primeGscResponse(GSC.gscStatusUrl(pid), { status: 200, body: GSC_NONE })
    const html = render(locale, createElement(ContentHubSetup, { projectId: pid, platform: 'none' }))
    check(`B0 MUT (${locale}): the detector finds the copy of a real "nothing connected" line`, paintsDisconnected(locale, html).length >= 2, text(html).slice(0, 200))
  }
  const firstPaints: { name: string; el: (pid: string) => unknown; loadingMark?: string }[] = [
    { name: 'the content screens\' setup line (platform unknown)', el: (pid) => createElement(ContentHubSetup, { projectId: pid, platform: null }) },
    { name: 'the content screens\' setup line (platform "none" known, Search Console not yet)', el: (pid) => createElement(ContentHubSetup, { projectId: pid, platform: 'none' }) },
    { name: 'the settings platform card', el: (pid) => createElement(ContentSection, { projectId: pid }), loadingMark: 'data-connection-loading="platform"' },
    { name: 'the WordPress panel', el: (pid) => createElement(WordPressConnectionPanel, { projectId: pid }), loadingMark: 'data-connection-loading="wordpress"' },
    { name: 'the Search Console panel', el: (pid) => createElement(GscPanel, { projectId: pid }), loadingMark: 'data-connection-loading="gsc"' },
    { name: 'the Search Console data table', el: (pid) => createElement(GscMetricsTable, { projectId: pid }), loadingMark: 'data-connection-loading="gsc-metrics"' },
    { name: 'the content hub platform card', el: (pid) => createElement(ContentHubPlatformCard, { projectId: pid, children: 'wp' }), loadingMark: 'aria-busy="true"' },
  ]
  for (const locale of ['he', 'en'] as Locale[]) {
    for (const c of firstPaints) {
      const html = render(locale, c.el(fresh()))
      const said = paintsDisconnected(locale, html)
      check(`B (${locale}) ${c.name}: nothing "not connected" before the answer${c.loadingMark ? ', its loading shape instead' : ', nothing at all'}`,
        said.length === 0 && (c.loadingMark ? html.includes(c.loadingMark) : html === ''), said.join(' | ') || text(html).slice(0, 160))
    }
  }

  // ── C) the answer in hand: the first paint is the final state ─────────
  console.log('\nC) with the answer in hand, the first paint is the answer')
  for (const locale of ['he', 'en'] as Locale[]) {
    const d = getDashboardDictionary(locale)
    const loadFailed = d.connectionStatus.loadFailed
    const primeAll = (pid: string, wp: any, sh: any, site: any) => {
      const u = PC.projectConnectionUrls(pid)
      R.primeKnownRead(u.wordpress, wp); R.primeKnownRead(u.shopify, sh); R.primeKnownRead(u.site, site)
    }
    const ok = (connection: unknown, extra: Record<string, unknown> = {}) => ({ status: 200, body: { connection, ...extra } });
    {
      const pid = fresh(); primeAll(pid, ok(WP), ok(null), ok(null))
      const html = render(locale, createElement(ContentSection, { projectId: pid }))
      check(`C1 (${locale}): WordPress connected, prefetched: the card names WordPress, no skeleton, nothing "not connected"`,
        html.includes('data-platform-card="wordpress"') && !html.includes('data-connection-loading') && paintsDisconnected(locale, html).length === 0,
        paintsDisconnected(locale, html).join(' | '))
    }
    {
      const pid = fresh(); primeAll(pid, ok(null), ok(null), ok(null))
      const html = render(locale, createElement(ContentSection, { projectId: pid }))
      check(`C2 (${locale}): nothing connected, answered: the card says so`, html.includes('data-platform-card="none"') && text(html).includes(d.sitePlatforms.noneTitle))
    }
    {
      const pid = fresh(); primeAll(pid, ok(WP), { status: 500, body: { error: 'Failed to load connection' } }, ok(null))
      const html = render(locale, createElement(ContentSection, { projectId: pid }))
      check(`C3 (${locale}): one read failed: "could not check" with a retry, never "choose a platform"`,
        text(html).includes(loadFailed) && html.includes('<button') && paintsDisconnected(locale, html).length === 0, text(html).slice(0, 200))
    }
    {
      const pid = fresh(); R.primeKnownRead(PC.projectConnectionUrls(pid).wordpress, ok(WP))
      const html = render(locale, createElement(WordPressConnectionPanel, { projectId: pid }))
      check(`C4 (${locale}): the WordPress panel with its answer in hand shows the site at once`, html.includes('blog.example.com') && !html.includes('data-connection-loading'))
      const pid2 = fresh(); R.primeKnownRead(PC.projectConnectionUrls(pid2).wordpress, { status: 0, body: null })
      const html2 = render(locale, createElement(WordPressConnectionPanel, { projectId: pid2 }))
      check(`C5 (${locale}): …a failed read says "could not check", not "no WordPress site connected"`, text(html2).includes(loadFailed) && paintsDisconnected(locale, html2).length === 0, text(html2).slice(0, 200))
    }
    {
      const pid = fresh(); GSC.primeGscResponse(GSC.gscStatusUrl(pid), { status: 200, body: GSC_READY })
      const html = render(locale, createElement(GscPanel, { projectId: pid }))
      check(`C6 (${locale}): Search Console connected, prefetched: the panel says connected at once`, html.includes('data-gsc-card="connected"') && paintsDisconnected(locale, html).length === 0)
      const pid2 = fresh(); GSC.primeGscResponse(GSC.gscStatusUrl(pid2), { status: 500, body: { ok: false, error: 'gsc_error' } })
      const html2 = render(locale, createElement(GscPanel, { projectId: pid2 }))
      check(`C7 (${locale}): …a failed status read says "could not check", no "connect" button`, text(html2).includes(loadFailed) && paintsDisconnected(locale, html2).length === 0 && !html2.includes('data-gsc-connect'), text(html2).slice(0, 200))
      const pid3 = fresh(); GSC.primeGscResponse(GSC.gscStatusUrl(pid3), { status: 404, body: { error: 'Not found' } })
      check(`C8 (${locale}): …switched off on the server: nothing at all (no dead-end "connect")`, render(locale, createElement(GscPanel, { projectId: pid3 })) === '')
      const pid4 = fresh(); GSC.primeGscResponse(GSC.gscStatusUrl(pid4), { status: 200, body: GSC_NONE })
      const html4 = render(locale, createElement(GscPanel, { projectId: pid4 }))
      check(`C9 (${locale}): …a real "not connected" answer still says so, with its connect button`, text(html4).includes(d.projectDetail.contentSection.gsc.notConnected) && html4.includes('data-gsc-connect'))
    }
    {
      const pid = fresh(); GSC.primeGscResponse(GSC.gscStatusUrl(pid), { status: 200, body: GSC_READY })
      check(`C10 (${locale}): the setup line, everything connected: nothing`, render(locale, createElement(ContentHubSetup, { projectId: pid, platform: 'wordpress' })) === '')
      const pid2 = fresh(); GSC.primeGscResponse(GSC.gscStatusUrl(pid2), { status: 500, body: { ok: false } })
      check(`C11 (${locale}): …Search Console unreadable: nothing, not "Search Console is not connected"`, render(locale, createElement(ContentHubSetup, { projectId: pid2, platform: 'wordpress' })) === '')
    }
  }

  // ── D) the workspace's overview is this project's, or nothing ─────────
  console.log('\nD) the content workspace never draws another project\'s overview')
  {
    const provider = code('components/content/workspace/ContentWorkspaceProvider.tsx')
    const guard = (src: string) => /const data = overviewRead && \(!projectId \|\| overviewRead\.selected === projectId\) \? overviewRead : null/.test(src)
      && /overviewSettled = !!data \|\| overviewFailed/.test(src)
    check('D1: the provider exposes the overview only when it is the active project\'s', guard(provider))
    check('D1 MUT: exposing whatever overview arrived last is caught', !guard(provider.replace('const data = overviewRead && (!projectId || overviewRead.selected === projectId) ? overviewRead : null', 'const data = overviewRead')))
    const articles = code('components/content/workspace/ArticlesScreen.tsx')
    const waits = (src: string) => /!overviewSettled \? \(/.test(src) && src.indexOf('!overviewSettled ? (') < src.indexOf('articlesEmptyTitle') && /\{data && activePlatform !== 'none' && \(/.test(src)
    check('D2: the articles screen shows its skeleton, not "no articles yet", until the overview answered; no platform card on a guess', waits(articles))
    check('D2 MUT: an empty state straight from missing data is caught', !waits(articles.replace('!overviewSettled ? (', 'false ? (')))
    const existing = code('components/content/workspace/ExistingContentScreen.tsx')
    const waitsEx = (src: string) => /if \(!payload \|\| \(payload\.source === 'none' && !overviewSettled\)\)/.test(src)
    check('D3: "existing content" waits for the overview before "connect your site"', waitsEx(existing))
    check('D3 MUT: deciding "connect your site" without the overview is caught', !waitsEx(existing.replace("(payload.source === 'none' && !overviewSettled)", 'false')))
    const shell = code('components/content/workspace/ContentWorkspaceShell.tsx')
    const early = (src: string) => /const setup = projectId \? \(/.test(src) && /platform=\{overview \? overview\.platform\?\.platform \?\? 'none' : null\}/.test(src)
    check('D4: the setup line mounts with the project (its status read runs beside the overview) and gets no platform until this project\'s overview', early(shell))
    check('D4 MUT: the old "platform ?? none" from any overview is caught', !early(shell.replace("platform={overview ? overview.platform?.platform ?? 'none' : null}", "platform={data?.platform?.platform ?? 'none'}")))
    const strategy = code('components/content-strategy/ContentStrategyScreen.tsx')
    // The button sits in the section header now, in both views, since it replaced "swap".
    const addWaits = (src: string) => /automationEnabled && !!board && !planEmpty && <AddKeywordButton/.test(src)
    check('D5: the strategy screen offers "add keyword" only once the plan answered (not while it loads, then gone)', addWaits(strategy))
    check('D5 MUT: the button drawn while the plan loads is caught', !addWaits(strategy.replace('automationEnabled && !!board && !planEmpty', 'automationEnabled && !planEmpty')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
export {}
