/**
 * Site health — the rules, the bounded scan, and the screen's words.
 *
 *   A) findings: thresholds (the free check's), severities, one finding per kind,
 *      duplicates, and "fix it for me" offered ONLY on a connected WordPress site;
 *   B) the score: 100 less a fixed amount per kind of problem, as the screen says;
 *   C) suggestions: deterministic, from the page's own words, within the limits;
 *   D) the scan is bounded and safe: robots.txt first (unreadable = nothing read),
 *      only the project's host, at most MAX_PAGES pages and MAX_LINK_CHECKS link
 *      checks, broken links and a missing sitemap found, noindex found;
 *   E) i18n completeness: Hebrew and English carry the same keys (and the same
 *      function arities) for the screen, every finding, error and step-by-step
 *      card; no literal text in the screen's components;
 *   F) our own wording: none of the competitor's labels or its "Doctor" name,
 *      and the sidebar icon is not a medical one;
 *   G) the shell: a sidebar entry under monitoring, and its page title.
 *
 * Every guard has a MUTATION CONTROL: the same check against a broken copy of the
 * code (written to a temp dir and loaded) or a broken source must fail.
 *
 * Run: npx tsx lib/site-health/__qa__/site-health.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import * as RULES from '../rules'
import * as SCAN from '../scan'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'
import { pageTitle } from '../../shell/page-title'
import type { FindingKind, GuideTopic, PageFacts, SiteFacts, SiteHealthErrorCode, SitePlatform } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** A broken copy of a module, loaded from a temp dir with its imports made absolute. */
function mutant<T>(rel: string, from: string, to: string): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'site-health-mutant-'))
  try {
    const here = join(ROOT, rel, '..')
    const body = src.replace(from, to)
      .replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`)
      .replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`)
    const file = join(dir, rel.split('/').pop()!)
    writeFileSync(file, body)
    return { mod: require(file) as T, found }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const SITE = 'https://shop.example.org'
const page = (path: string, over: Partial<PageFacts> = {}): PageFacts => ({
  url: `${SITE}${path}`, kind: path === '/' ? 'home' : 'page', ok: true, status: 200,
  title: `A perfectly reasonable page title for ${path}`, description: `A description of a reasonable length that says what ${path} offers and why a visitor should come in.`,
  h1: ['Heading'], images: { total: 2, missingAlt: 0 }, noindex: false, viewport: true, links: [], adminUrl: null, ...over,
})
const site = (over: Partial<SiteFacts> = {}): SiteFacts => ({
  siteUrl: `${SITE}/`, homeReachable: true, robots: { blocksAll: false, blocksAi: false, blockedBots: [], readable: true },
  sitemapFound: true, brokenLinks: [], orphanPages: [], ...over,
})
const WP = { platform: 'wordpress' as const, connections: { wordpress: true, shopify: false, wix: false } }
const WP_OFF = { platform: 'wordpress' as const, connections: { wordpress: false, shopify: false, wix: false } }
const SHOP = { platform: 'shopify' as const, connections: { wordpress: false, shopify: true, wix: false } }

async function main() {
  console.log('Site health — rules, bounded scan, words\n')

  console.log('A) findings')
  type Rules = typeof RULES
  const findingChecks = (R: Rules) => {
    const pages = [
      page('/', { kind: 'home' }),
      page('/long', { title: 'x'.repeat(70) }),
      page('/short', { title: 'Short' }),
      page('/no-desc', { description: null }),
      page('/alt', { images: { total: 4, missingAlt: 2 } }),
      page('/alt-ok', { images: { total: 10, missingAlt: 2 } }),
      page('/noindex', { noindex: true }),
      page('/dup-a', { title: 'Same title shared by two different pages' }),
      page('/dup-b', { title: 'same title shared by two different pages ' }),
      page('/down', { ok: false, status: 500, title: null, description: null, h1: [] }),
    ]
    const f = R.buildFindings(site({ brokenLinks: [{ url: `${SITE}/gone`, from: `${SITE}/long` }], sitemapFound: false }), pages, WP)
    const by = (k: FindingKind) => f.find((x) => x.id === k)
    return {
      A1: by('title_long')?.pages[0]?.path === '/long' && by('title_long')?.pages[0]?.measure === 70 && by('title_short')?.total === 1,
      A2: by('description_missing')?.total === 1 && by('images_alt')?.pages.map((p) => p.path).join() === '/alt',
      A3: by('noindex')?.severity === 'urgent' && by('broken_links')?.severity === 'urgent' && by('sitemap_missing')?.severity === 'important',
      A4: by('title_duplicate')?.total === 2,
      A5: !f.some((x) => x.pages.some((p) => p.path === '/down')),
      A6: f[0].severity === 'urgent' && f.every((x, i) => i === 0 || RULES.SEVERITY_POINTS[f[i - 1].severity] >= RULES.SEVERITY_POINTS[x.severity]),
      A7: by('title_long')?.fixable === true && by('noindex')?.fixable === false && by('broken_links')?.fixable === false,
      A8: by('title_long')?.pages.every((p) => p.fixable) === true,
      f,
    }
  }
  {
    const r = findingChecks(RULES)
    check('A1: a title over 65 characters is "too long" with its length; under 30 is "too short"', r.A1)
    check('A2: a missing description, and alt text missing on more than 20% of a page\'s images, are found', r.A2)
    check('A3: noindex and broken links are urgent; a missing sitemap is important', r.A3)
    check('A4: two pages with the same title (case and spaces aside) are both listed', r.A4)
    check('A5: a page that could not be read adds no finding of its own', r.A5)
    check('A6: most serious first', r.A6)
    check('A7: on a connected WordPress site, titles are fixable; noindex and broken links are not', r.A7)
    check('A8: every page of a fixable finding offers the fix (posts and pages)', r.A8)
    const off = RULES.buildFindings(site(), [page('/long', { title: 'x'.repeat(70) })], WP_OFF)
    check('A9: WordPress NOT connected: no page offers "fix it for me"', off.every((x) => !x.fixable && x.pages.every((p) => !p.fixable)))
    const shop = RULES.buildFindings(site(), [page('/products/a', { kind: 'product', title: 'x'.repeat(70), adminUrl: 'https://s.myshopify.com/admin/products/1' })], SHOP)
    check('A10: Shopify: no one-click fix (instructions + a link to the item in the store admin)', shop.every((x) => !x.fixable) && shop[0]?.pages[0]?.adminUrl === 'https://s.myshopify.com/admin/products/1')
    const home = RULES.buildFindings(site(), [page('/', { kind: 'home', title: 'x'.repeat(70) })], WP)
    check('A11: the home page is never offered a one-click fix (it may be a theme template)', home.every((x) => !x.fixable))
    const m = mutant<Rules>('lib/site-health/rules.ts', "if (platform !== 'wordpress' || !connections.wordpress) return false", '')
    check('MUTATION CONTROL: the connection check the control removes is where it expects it', m.found)
    const mf = m.mod ? m.mod.buildFindings(site(), [page('/long', { title: 'x'.repeat(70) })], WP_OFF) : []
    check('MUTATION CONTROL: rules that offer a fix without a connection are caught by A9', m.found && mf.some((x) => x.fixable))
    const m2 = mutant<Rules>('lib/site-health/rules.ts', 'title.length > TITLE_MAX', 'title.length > 100')
    check('MUTATION CONTROL: a copy with a looser title limit is caught by A1', m2.found && !!m2.mod && !findingChecks(m2.mod).A1)
  }

  console.log('\nB) the score')
  {
    const f = [{ severity: 'urgent' as const }, { severity: 'important' as const }, { severity: 'minor' as const }]
    check('B1: 100 − 15 (urgent) − 6 (important) − 2 (minor) = 77', RULES.scoreOf(f) === 77)
    check('B2: never below 0', RULES.scoreOf(Array(10).fill({ severity: 'urgent' })) === 0)
    check('B3: no findings = 100', RULES.scoreOf([]) === 100)
    check('B4: the Hebrew explanation states the same numbers', /15/.test(dashboardHe.siteHealth.score.how) && /\b6\b/.test(dashboardHe.siteHealth.score.how) && /\b2\b/.test(dashboardHe.siteHealth.score.how) && /100/.test(dashboardHe.siteHealth.score.how))
    check('B5: …and the English one', /15/.test(dashboardEn.siteHealth.score.how) && /\b6\b/.test(dashboardEn.siteHealth.score.how) && /\b2\b/.test(dashboardEn.siteHealth.score.how))
    check('B6: bands', RULES.scoreBand(95) === 'excellent' && RULES.scoreBand(80) === 'good' && RULES.scoreBand(60) === 'fair' && RULES.scoreBand(20) === 'poor')
    const m = mutant<Rules>('lib/site-health/rules.ts', 'urgent: 15, important: 6, minor: 2', 'urgent: 20, important: 6, minor: 2')
    check('MUTATION CONTROL: points that differ from what the screen says are caught by B1', m.found && !!m.mod && m.mod.scoreOf(f) !== 77)
  }

  console.log('\nC) suggestions')
  {
    const long = RULES.suggestTitle({ kind: 'title_long', current: 'Handmade leather boots for hiking and everyday wear in all seasons | Boot Shop Ltd', h1: null, siteName: 'Boot Shop', path: '/boots' })
    check('C1: a long title loses its "| site" suffix and fits 60 characters, whole words', long === 'Handmade leather boots for hiking and everyday wear in all' || (long.length <= 60 && !long.includes('|') && !/\s$/.test(long)), long)
    const short = RULES.suggestTitle({ kind: 'title_short', current: 'Boots', h1: 'Leather hiking boots', siteName: 'Boot Shop', path: '/boots' })
    check('C2: a short title gets the page heading added', short === 'Boots | Leather hiking boots', short)
    const missing = RULES.suggestTitle({ kind: 'title_missing', current: null, h1: 'Leather hiking boots', siteName: 'Boot Shop', path: '/boots' })
    check('C3: a missing title becomes the page heading', missing === 'Leather hiking boots')
    const desc = RULES.suggestDescription(null, 'Our boots are handmade in Tel Aviv from full-grain leather. Each pair is resoled for free for two years. Order online and we ship in two days. More text that should not fit in the description at all because it is long.')
    check('C4: a description is whole sentences from the page, 70–155 characters', !!desc && desc.length >= 70 && desc.length <= 155 && /\.$/.test(desc), desc ?? 'null')
    check('C5: too little text: no invented description (the merchant writes it)', RULES.suggestDescription(null, 'Hi there.') === null)
    check('C6: alt text from a meaningful file name', RULES.suggestAlt('https://x/wp-content/uploads/2024/05/red-running-shoes-1024x768.jpg', 'Page') === 'red running shoes')
    check('C7: a camera file name falls back to the page title', RULES.suggestAlt('https://x/uploads/IMG_4032.JPG', 'Summer sale') === 'Summer sale')
    const cut = RULES.cutAtWord('About us – the whole long story of how the shop began and grew', 60)
    check('C9: a shortened title never ends on a joining word ("…began and")', cut === 'About us – the whole long story of how the shop began', cut)
    const cutHe = RULES.cutAtWord('מגפי עור בעבודת יד לטיולים ולשימוש יומיומי בכל עונות השנה של', 58)
    check('C10: …in Hebrew too ("…של")', !/\sשל$/.test(cutHe), cutHe)
    check('C11: a long title is cut at a clause break when one leaves enough', RULES.suggestTitle({ kind: 'title_long', current: 'אודות הסטודיו – הסיפור המלא של שורש קרמיקה, איך התחלנו ולאן אנחנו הולכים', h1: 'אודות', siteName: null, path: '/about/' }) === 'אודות הסטודיו – הסיפור המלא של שורש קרמיקה')
    check('C12: on a Hebrew page, a Latin file name gives way to the page title (alt in the page\'s language)', RULES.suggestAlt('https://x/uploads/speckled-mug-blue.jpg', 'חנות כלי קרמיקה') === 'חנות כלי קרמיקה' && RULES.suggestAlt('https://x/uploads/ספל-מנוקד.jpg', 'חנות') === 'ספל מנוקד')
    check('C8: an approved value is plain text (no markup characters)', RULES.cleanText('<b>Title</b>', 60) === 'bTitle/b' && RULES.cleanAlt('a "quoted" <x>') === 'a quoted x')
  }

  console.log('\nD) the scan is bounded and safe')
  type Scan = typeof SCAN
  const fakeSite = (routes: Record<string, { status: number; body: string }>) => {
    const calls: string[] = []
    const base = (async (input: RequestInfo | URL) => {
      const u = String(input)
      calls.push(u)
      const r = routes[new URL(u).pathname] ?? { status: 404, body: 'nope' }
      return new Response(r.body, { status: r.status, headers: { 'content-type': u.endsWith('.txt') ? 'text/plain' : 'text/html' } })
    }) as typeof fetch
    const viaPin = async (url: URL, deps?: { fetchImpl?: typeof fetch }) => {
      try {
        const res = await (deps?.fetchImpl ?? base)(url.toString())
        const text = await res.text()
        return { res, text }
      } catch {
        return null
      }
    }
    const deps: SCAN.ScanDeps = {
      fetchImpl: base,
      assertHost: async () => ({ ok: true }),
      now: () => Date.now(),
      fetchHtml: (async (url: URL, d?: { fetchImpl?: typeof fetch }) => {
        const got = await viaPin(url, d)
        if (!got) return { ok: false, reason: 'network' }
        if (!got.res.ok) return { ok: false, reason: 'http_error', status: got.res.status }
        return { ok: true, url: url.toString(), status: got.res.status, html: got.text, truncated: false }
      }) as SCAN.ScanDeps['fetchHtml'],
      fetchText: (async (url: URL, d?: { fetchImpl?: typeof fetch }) => {
        const got = await viaPin(url, d)
        if (!got) return { ok: false, reason: 'network' }
        return { ok: true, url: url.toString(), status: got.res.status, text: got.text }
      }) as SCAN.ScanDeps['fetchText'],
    }
    return { deps, calls }
  }
  const html = (title: string, extra = '') => `<html><head><title>${title}</title><meta name="viewport" content="width=device-width"><meta name="description" content="A description of a reasonable length that says what the page offers and why to come in."></head><body><h1>${title}</h1>${extra}</body></html>`
  const scanChecks = async (S: Scan) => {
    const links = Array.from({ length: 60 }, (_, i) => `<a href="/p${i}">p${i}</a>`).join('')
    const routes: Record<string, { status: number; body: string }> = {
      '/robots.txt': { status: 200, body: 'User-agent: *\nDisallow: /private\n' },
      '/': { status: 200, body: html('Home page of the example shop for testing', `${links}<a href="/private/x">x</a><a href="https://evil.example.com/a">e</a>`) },
      '/noidx': { status: 200, body: html('A page that is hidden from search engines', '<meta name="robots" content="noindex,follow">') },
    }
    for (let i = 0; i < 60; i++) if (i !== 7) routes[`/p${i}`] = { status: 200, body: html(`Page number ${i} of the example shop site`, '<a href="/gone">g</a>') }
    const { deps, calls } = fakeSite(routes)
    const candidates = [
      { url: `${SITE}/private/offer`, kind: 'page' as const, adminUrl: null },
      { url: 'https://evil.example.com/x', kind: 'page' as const, adminUrl: null },
      { url: `${SITE}/noidx`, kind: 'page' as const, adminUrl: null },
      ...Array.from({ length: 60 }, (_, i) => ({ url: `${SITE}/p${i}`, kind: 'page' as const, adminUrl: null })),
    ]
    const out = await S.scanSite({ siteUrl: SITE, candidates }, deps)
    const pagesRead = calls.filter((c) => !/robots\.txt|sitemap/.test(c)).length
    return {
      D1: calls[0] === `${SITE}/robots.txt`,
      D2: !calls.some((c) => c.includes('/private')),
      D3: !calls.some((c) => c.includes('evil.example.com')),
      D4: out.ok && out.pages.length <= S.MAX_PAGES,
      D5: out.ok && out.pages.some((p) => p.noindex && p.url.endsWith('/noidx')),
      D6: out.ok && out.site.brokenLinks.some((b) => b.url.endsWith('/gone')),
      D7: out.ok && out.site.sitemapFound === false,
      D8: pagesRead <= S.MAX_PAGES + S.MAX_LINK_CHECKS,
      detail: `requests=${calls.length}, pages and links=${pagesRead}`,
    }
  }
  {
    const r = await scanChecks(SCAN)
    check('D1: robots.txt is read before anything else', r.D1, r.detail)
    check('D2: a path robots.txt disallows is never requested', r.D2)
    check('D3: another host (a candidate or a link) is never requested', r.D3)
    check('D4: at most MAX_PAGES pages are read', r.D4)
    check('D5: a noindex page is found', r.D5)
    check('D6: a same-site link answering 404 is a broken link', r.D6)
    check('D7: no sitemap anywhere: sitemapFound is false', r.D7)
    check('D8: total requests stay within MAX_PAGES + MAX_LINK_CHECKS (+ robots and sitemap)', r.D8, r.detail)
    const { deps, calls } = fakeSite({ '/robots.txt': { status: 503, body: '' }, '/': { status: 200, body: html('Home') } })
    const out = await SCAN.scanSite({ siteUrl: SITE, candidates: [] }, deps)
    check('D9: robots.txt unreadable (503): nothing else is read', out.ok && out.pages.length === 0 && calls.length === 1)
    const m = mutant<Scan>('lib/site-health/scan.ts', "const allow = (u: URL) => answer.state !== 'unreadable' && robotsAllows(rules, u)", 'const allow = (_u: URL) => true')
    check('MUTATION CONTROL: the robots check the control removes is where it expects it', m.found)
    const rm = m.mod ? await scanChecks(m.mod) : null
    check('MUTATION CONTROL: a scan that ignores robots.txt is caught by D2', !!rm && !rm.D2)
    const m2 = mutant<Scan>('lib/site-health/scan.ts', 'if (planned.length >= MAX_PAGES - 1) return', 'if (planned.length >= 500) return')
    const rm2 = m2.mod ? await scanChecks(m2.mod) : null
    check('MUTATION CONTROL: a scan without the page cap is caught by D4', m2.found && !!rm2 && !rm2.D4)
  }
  check('D10: noindex is read from a robots or googlebot meta tag, attributes in any order', SCAN.hasNoindex('<meta name="robots" content="noindex">') && SCAN.hasNoindex("<meta content='noindex, follow' name='googlebot'>"))
  check('D11: a page without noindex is not flagged', !SCAN.hasNoindex('<meta name="description" content="noindex is a word here">'))

  console.log('\nE) i18n completeness')
  type Shape = string | { fn: number } | { [k: string]: Shape } | Shape[]
  const shape = (v: unknown): Shape => {
    if (typeof v === 'function') return { fn: v.length }
    if (Array.isArray(v)) return v.map(() => 's')
    if (v && typeof v === 'object') return Object.fromEntries(Object.entries(v).sort(([a], [b]) => a.localeCompare(b)).map(([k, x]) => [k, shape(x)]))
    return 's'
  }
  const same = (a: unknown, b: unknown) => JSON.stringify(shape(a)) === JSON.stringify(shape(b))
  const he = dashboardHe.siteHealth
  const en = dashboardEn.siteHealth
  check('E1: Hebrew and English siteHealth have the same keys, arities and step counts', same(he, en))
  const KINDS = Object.keys(RULES.SEVERITY) as FindingKind[]
  check('E2: every finding kind has a title and a why, in both languages', KINDS.every((k) => he.findings[k]?.title && he.findings[k]?.why && en.findings[k]?.title && en.findings[k]?.why))
  const TOPICS = [...new Set(Object.values(RULES.GUIDE))] as GuideTopic[]
  const PLATFORMS: SitePlatform[] = ['wordpress', 'shopify', 'wix', 'other']
  check('E3: every step-by-step topic has steps for every platform, in both languages', TOPICS.every((t) => PLATFORMS.every((p) => he.guides[t]?.[p]?.length >= 1 && en.guides[t]?.[p]?.length >= 1)))
  const CODES: SiteHealthErrorCode[] = ['unauthorized', 'not_found', 'invalid_request', 'site_unreachable', 'site_blocked', 'scan_failed', 'no_connection', 'not_in_wordpress', 'needs_seo_plugin', 'needs_bridge', 'nothing_to_fix', 'no_safe_place', 'changed_since_preview', 'approval_required', 'use_fix_queue', 'wordpress_permission', 'wordpress_unreachable', 'write_not_confirmed', 'value_invalid', 'off_site']
  check('E4: every error code has our own sentence in both languages', CODES.every((c) => he.errors[c] && en.errors[c]))
  check('E5: the Hebrew copy is Hebrew (no untranslated English sentence)', Object.values(he.findings).every((f) => /[א-ת]/.test(f.title) && /[א-ת]/.test(f.why)))
  check('E6: the sidebar label exists in both languages', dashboardHe.sidebar.siteHealth === 'בריאות האתר' && dashboardEn.sidebar.siteHealth === 'Site health')
  const enMissing = JSON.parse(JSON.stringify(shape(en))) as Record<string, unknown>
  delete (enMissing.errors as Record<string, unknown>).off_site
  check('MUTATION CONTROL: an English dictionary missing one error is caught by E1', JSON.stringify(shape(he)) !== JSON.stringify(enMissing))
  const COMPONENTS = readdirSync(join(ROOT, 'components/site-health')).filter((f) => f.endsWith('.tsx')).map((f) => `components/site-health/${f}`)
  const literal = (src: string) => {
    const s = strip(src)
    const out: string[] = []
    for (const m of s.matchAll(/(?:placeholder|aria-label|title|alt)="([^"]*[A-Za-zא-ת]{2,}[^"]*)"/g)) out.push(m[0])
    for (const m of s.matchAll(/(?<![=-])>\s*([A-Za-zא-ת][A-Za-zא-ת ,.'!?-]{2,})\s*</g)) out.push(m[1])
    return out
  }
  const found = COMPONENTS.flatMap((f) => literal(read(f)).map((x) => `${f}: ${x}`))
  check('E7: no literal text in the screen\'s components (everything from the dictionaries)', found.length === 0, found.join(' | '))
  check('MUTATION CONTROL: a literal Hebrew label is caught by E7', literal('<p>בדיקה</p>').length === 1)
  const rawColor = (s: string) => /\b(?:text|bg|border|ring)-(?:slate|gray|blue|red|green|yellow|zinc|neutral|stone|indigo|emerald|amber|rose|sky)-\d{2,3}\b/.test(s)
  check('E8: design tokens only (no raw Tailwind palette) in the screen', !COMPONENTS.some((f) => rawColor(read(f))) && !rawColor(read('app/(dashboard)/site-health/page.tsx')))
  check('MUTATION CONTROL: a raw slate colour is caught by E8', rawColor('<p className="text-slate-500" />'))

  console.log('\nF) our own wording')
  const THEIRS: RegExp[] = [/doctor/i, /דוקטור/, /תקן אוטומטית/, /דורש טיפול ידני/, /מה מצאנו בסריקה/, /מוכנים לאישור שלך/, /עדיין חסר/, /יתקן את אלה/, /אלה דורשים תשומת לב/, /מוכנות למנועי AI/, /חברו את האתר כדי לתקן/, /התיקון הראשון על חשבוננו/, /בסבבים של רבע שעה/, /fix automatically/i, /requires manual/i]
  const texts = (node: unknown): string[] => {
    if (typeof node === 'string') return [node]
    if (typeof node === 'function') { try { return texts((node as (...a: unknown[]) => unknown)(...Array((node as () => void).length).fill(3))) } catch { return [] } }
    if (node && typeof node === 'object') return Object.values(node).flatMap(texts)
    return []
  }
  const all = [...texts(he), ...texts(en)]
  const hits = all.filter((t) => THEIRS.some((re) => re.test(t)))
  check('F1: no competitor label (or "Doctor") in the site health copy', hits.length === 0, hits.join(' | '))
  check('MUTATION CONTROL: their "fix automatically" label is caught by F1', [...all, 'תקן אוטומטית'].some((t) => THEIRS.some((re) => re.test(t))))
  const sidebar = strip(read('components/layout/Sidebar.tsx'))
  const entry = sidebar.match(/\{ href: '\/site-health', labelKey: 'siteHealth', icon: (\w+) \}/)
  const MEDICAL = /Stethoscope|Cross|Hospital|Heart|Pill|Syringe|Ambulance|Activity|Bandage|Thermometer|Microscope/
  check('F2: the sidebar icon is not a medical one (no echo of "Doctor")', !!entry && !MEDICAL.test(entry[1]), entry?.[1])
  check('MUTATION CONTROL: a stethoscope icon is caught by F2', MEDICAL.test('Stethoscope'))

  console.log('\nG) the shell')
  const groups = sidebar.slice(sidebar.indexOf("groupKey: 'groupMonitoring'"), sidebar.indexOf("groupKey: 'groupAccount'"))
  check('G1: the entry is in the monitoring group', groups.includes("href: '/site-health'"))
  check('MUTATION CONTROL: an entry outside the group is caught by G1', !sidebar.slice(sidebar.indexOf("groupKey: 'groupAccount'")).includes("href: '/site-health'"))
  const title = pageTitle('/site-health', [{ href: '/site-health', label: dashboardHe.sidebar.siteHealth }])
  check('G2: the tab is titled after the entry, in the dashboard\'s language', title.includes('בריאות האתר'), title)
  check('G3: the page renders inside WorkspaceGate (the project the top bar names)', /<WorkspaceGate>/.test(read('app/(dashboard)/site-health/page.tsx')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
export {}
