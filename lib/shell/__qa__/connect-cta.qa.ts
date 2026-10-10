/**
 * Connecting the site is the first thing, everywhere (owner's report of 10 October 2026).
 *
 *   A) a notification for a section of the screen already open scrolls there
 *      (it did nothing on main: same address, nothing for the router to do);
 *   B) every project screen says the site is not connected, with one button;
 *   C) the settings put the connections not made yet first, decided once;
 *   D) "Start here" marks its next step; every new string exists in four languages.
 *
 *   npx tsx lib/shell/__qa__/connect-cta.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { samePageSection } from '../section-link'
import { connectBannerOnPath, showConnectBanner } from '../connect-banner'
import { connectFirst } from '../../project-settings/connect-first'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const code = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))

console.log('A) a link to a section of this screen')
{
  const href = '/settings?projectId=p1#platform'
  check('A1: on the settings (with or without ?projectId) the row is a same-screen section',
    samePageSection({ pathname: '/settings' }, href) === 'platform' && samePageSection({ pathname: '/settings' }, '/settings#search-console') === 'search-console')
  check('A2: from another screen it is left to the router', samePageSection({ pathname: '/keywords' }, href) === null)
  check('A3: a link with no section, or to another site, is left alone',
    samePageSection({ pathname: '/settings' }, '/settings?projectId=p1') === null
    && samePageSection({ pathname: '/settings' }, 'https://evil.example/settings#platform') === null
    && samePageSection({ pathname: '/settings' }, '//evil.example/settings#platform') === null)
  check('A1-MUT: comparing the whole address (main\'s behaviour) would miss the sidebar\'s /settings',
    new URL(href, 'http://x/').search !== new URL('/settings', 'http://x/').search)
  const bell = code('components/layout/TopBarActions.tsx')
  const follows = (src: string) => /onClick=\{\(e\) => \{ followSectionLink\(e, row\.href\); setOpen\(false\) \}\}/.test(src)
  check('A4: the notifications rows follow a same-screen section link in place', follows(bell))
  check('A4-MUT: a row that only closes the menu (main) fails A4', !follows(bell.replace('followSectionLink(e, row.href); ', '')))
  const handler = code('components/layout/section-link.ts')
  check('A5: in place = the address is updated through the History API and the section scrolled to',
    /window\.history\.replaceState\(null, '', /.test(handler) && /el\.scrollIntoView\(/.test(handler) && /e\.preventDefault\(\)/.test(handler)
    && handler.indexOf('if (!el) return false') < handler.indexOf('e.preventDefault()'))
}

console.log('\nB) the banner on every project screen')
{
  const screens = ['/keyword-research', '/keywords', '/content', '/content/strategy', '/content/articles/a1', '/site-links', '/ai-visibility', '/site-health', '/reports']
  check('B1: every screen of a project carries it', screens.every(connectBannerOnPath), screens.filter((p) => !connectBannerOnPath(p)).join(' '))
  const not = ['/dashboard', '/settings', '/billing', '/affiliate', '/projects', '/projects/new', '/projects/p1/summary', '/admin/logs', '/keywordsx', null]
  check('B2: not the dashboard (it places its own), the settings (the connection is right there), nor screens about no one project',
    not.every((p) => !connectBannerOnPath(p)), not.filter((p) => connectBannerOnPath(p)).join(' '))
  check('B3: only when the site is KNOWN not to be connected', showConnectBanner(false) && !showConnectBanner(true) && !showConnectBanner(null) && !showConnectBanner(undefined))
  const layout = code('app/(dashboard)/layout.tsx')
  const mounted = (src: string) => /id=\{MAIN_CONTENT_ID\}[^>]*>\s*(\{\}\s*)?<ConnectSiteBanner \/>\s*\{children\}/.test(src)
  check('B4: the app shell puts it above every screen\'s content', mounted(layout))
  check('B4-MUT: a shell without it (main) fails B4', !mounted(layout.replace('<ConnectSiteBanner />', '')))
  const dash = code('app/(dashboard)/dashboard/page.tsx')
  check('B5: the dashboard puts it first, above its opening card (not on "Start here", whose next step it already is)',
    /<>\s*(\{\}\s*)?<ConnectSiteBanner where="dashboard" className="mb-0" \/>\s*<HeroCard/.test(dash))
  const banner = code('components/layout/ConnectSiteBanner.tsx')
  check('B6: one button, to the settings\' platform section, from the shared waiting read',
    /href=\{platformSetupHref\(activeProjectId\)\}/.test(banner) && /useWaiting\(/.test(banner) && /showConnectBanner\(waiting\?\.siteConnected\)/.test(banner)
    && (banner.match(/<Link\b/g) ?? []).length === 1)
}

console.log('\nC) the settings: what is not connected comes first')
{
  const ok = (body: unknown) => ({ status: 200, body })
  const none = { wordpress: ok({ connection: null }), shopify: ok({ connection: null }), site: ok({ connection: null }) }
  const gscOff = ok({ ok: true, connection: null })
  const gscOn = ok({ ok: true, connection: { status: 'connected' }, property: 'sc-domain:x', windows: { 28: { clicks: 1, impressions: 2 } } })
  const a = connectFirst({ ...none, gsc: gscOff })
  check('C1: nothing connected: the platform and Search Console both lead', a.platform && a.gsc)
  const b = connectFirst({ ...none, wordpress: ok({ connection: { id: 'w' } }), gsc: gscOn })
  check('C2: both connected: nothing moves', !b.platform && !b.gsc)
  check('C3: a WordPress site publishing through the plugin alone counts as connected',
    !connectFirst({ ...none, wordpress: ok({ connection: null, publishingPlugin: { siteUrl: 'https://x', version: '3.1.0' } }), gsc: gscOn }).platform)
  check('C4: a failed read moves nothing (it says nothing about the connection)',
    !connectFirst({ ...none, wordpress: { status: 500, body: {} }, gsc: { status: 500, body: {} } }).platform
    && !connectFirst({ ...none, wordpress: { status: 500, body: {} }, gsc: { status: 500, body: {} } }).gsc)
  check('C5: Search Console off on the server (never asked) does not move', !connectFirst({ ...none, gsc: null }).gsc)
  check('C6: Search Console connected without a property still needs the owner',
    connectFirst({ ...none, gsc: ok({ ok: true, connection: { status: 'connected' }, property: null }) }).gsc)
  check('C1-MUT: a connected platform is not "first"', !connectFirst({ ...none, shopify: ok({ connection: { id: 's' } }), gsc: gscOff }).platform)

  const page = code('app/(dashboard)/settings/page.tsx')
  const leads = (src: string) => /\{\(topPlatform \|\| topGsc\) && \(\s*<section id=\{topId\} data-connect-first=""/.test(src)
    && src.indexOf('data-connect-first=""') < src.indexOf('<ScanBand') && src.indexOf('data-connect-first=""') < src.indexOf('<BusinessCard')
  check('C7: the top section comes before the scan band and the business card', leads(page))
  check('C7-MUT: the connections only in their usual place (main) fails C7', !leads(page.replace('data-connect-first=""', '')))
  const once = (src: string) => /if \(!done\) setFirst\(connectFirst\(/.test(src) && (src.match(/setFirst\(/g) ?? []).length === 1
  check('C8: the order is decided once, before the screen first draws, and never changes under the reader', once(page))
  check('C8-MUT: re-deciding after the screen drew fails C8', !once(page.replace('if (!done) setFirst(', 'setFirst(')))
  check('C9: each block keeps its anchor wherever it is, and #connections always exists',
    /<div id=\{PROJECT_CONNECTION_ANCHOR\} className="scroll-mt-20">/.test(page) && /<div id=\{SETTINGS_GSC_ANCHOR\} className="scroll-mt-20">/.test(page)
    && /const topId = lowerEmpty \? SECTION\.connections : SECTION\.connectFirst/.test(page) && /\{!lowerEmpty && \(\s*<section id=\{SECTION\.connections\}/.test(page)
    && /\{topPlatform && platformBlock\}/.test(page) && /\{!topPlatform && platformBlock\}/.test(page) && /\{topGsc && gscBlock\}/.test(page) && /\{!topGsc && gscBlock\}/.test(page))
}

console.log('\nD) "Start here" and the words')
{
  const start = code('components/dashboard/StartHere.tsx')
  const marks = (src: string) => /next\?\.key === step\.key && 'relative z-\[1\] ring-2 ring-inset ring-action\/45'/.test(src) && /\{primary && step\.state === 'open' && <span[^>]*>\{t\.next\}<\/span>\}/.test(src)
  check('D1: the next step is framed and labelled "Next step"', marks(start))
  check('D1-MUT: an unmarked next step (main) fails D1', !marks(start.replace('{t.next}', '')))
  const he = getDashboardDictionary('he')
  for (const locale of ['he', 'en', 'es', 'pt-BR'] as const) {
    const d = getDashboardDictionary(locale)
    const strings = [d.dashboardStart.next, d.dashboardStart.connectBanner.title, d.dashboardStart.connectBanner.body, d.projectSettings.connectFirst.title, d.projectSettings.connectFirst.body]
    const filled = strings.every((s) => typeof s === 'string' && s.trim().length > 0)
    const own = locale === 'he' || strings.every((s, i) => s !== [he.dashboardStart.next, he.dashboardStart.connectBanner.title, he.dashboardStart.connectBanner.body, he.projectSettings.connectFirst.title, he.projectSettings.connectFirst.body][i])
    const hebrew = strings.some((s) => /[֐-׿]/.test(s))
    check(`D2 (${locale}): every new string is written in that language`, filled && own && (locale === 'he' ? hebrew : !hebrew))
    if (locale !== 'en') {
      const en = getDashboardDictionary('en')
      check(`D3 (${locale}): …and is not the English fallback`, locale === 'he' || d.dashboardStart.connectBanner.body !== en.dashboardStart.connectBanner.body)
    }
  }
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
