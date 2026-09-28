/**
 * Why not every project showed its site's icon, one fixture per real pattern,
 * and the second look for projects whose finished scan stored none.
 *
 * ROOT CAUSES (lib/site-icon.ts says what is accepted now):
 *   M1  icons on the site's own platform CDN (Shopify, Wix, Squarespace,
 *       Webflow, Duda, GoDaddy, Jetpack) were refused as "another site", and
 *       those platforms often have no /favicon.ico either;
 *   M2  a home page served over http (production: be-cln.co.il was read at
 *       http://www.be-cln.co.il/) turned every relative href into http://,
 *       which was refused;
 *   M3  the only fallback was /favicon.ico on the typed host: a site that
 *       answers only on www (or only without it), or keeps only an
 *       apple-touch-icon, showed its initial;
 *   M4  typed domains with spaces ("Agibor. Co. Il", production) had no host;
 *   M5  an icon printed after a stray </head>, or past 300 KB of inline script,
 *       or behind a <base href>, or with entity-encoded slashes, was missed;
 *   M6  an SVG icon with only a viewBox decodes at 0x0 in some browsers and
 *       was dropped as "not an icon";
 *   M7  runs that finished before the icon was read (every production run)
 *       never had their page read again.
 *
 * Every fix has a mutation control: the source is broken on purpose (a copy
 * written next to it, loaded, deleted) and the fixture must then fail.
 *
 * Run: npx tsx lib/seed-scan/__qa__/site-icon-misses.qa.ts
 */
import { readFileSync, writeFileSync, unlinkSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import * as rules from '@/lib/site-icon'
import * as extract from '../site-icon'
import * as refresh from '../site-icon-refresh'
import { OffHostRequestError } from '../site-access'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

let mutants = 0
/** Load a copy of `file` with `from` replaced by `to` (the replacement must happen); each copy under its own name. */
function mutant<T>(file: string, from: string | RegExp, to: string): T {
  const src = read(file)
  const out = src.replace(from, to)
  if (out === src) throw new Error(`mutation did not apply to ${file}: ${String(from)}`)
  const dir = file.slice(0, file.lastIndexOf('/'))
  // The copy lives in this suite's own __qa__ folder (tree-walking suites skip __qa__, so a
  // concurrent walker never sees a file that is about to vanish); relative imports are pinned
  // to the original folder so the copy resolves exactly what the source does.
  const pinned = out.replace(/(from\s+|require\(|import\()(['"])(\.\.?\/[^'"]*)\2/g, (_m, pre: string, q: string, spec: string) => `${pre}${q}${join(ROOT, dir, spec)}${q}`)
  const path = join(__dirname, `.qa-mut-misses-${++mutants}-${file.slice(file.lastIndexOf('/') + 1)}`)
  writeFileSync(path, pinned)
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(path) as T
  } finally {
    unlinkSync(path)
  }
}

const head = (links: string, page = '') => `<!doctype html><html><head><title>x</title>${links}</head><body>${page}</body></html>`

type Fixture = { id: string; what: string; domain: string; pageUrl: string; html: string; want: string }
const FIXTURES: Fixture[] = [
  { id: 'P1', what: 'rel="icon", root-relative', domain: 'gotopseo.com', pageUrl: 'https://gotopseo.com/',
    html: head('<link rel="icon" href="/favicon.png">'), want: 'https://gotopseo.com/favicon.png' },
  { id: 'P2', what: 'rel="icon", path-relative from a sub-path', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/he/',
    html: head('<link rel="icon" href="favicon.png">'), want: 'https://shop.co.il/he/favicon.png' },
  { id: 'P3', what: 'protocol-relative, rel="shortcut icon"', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: head('<link rel="shortcut icon" href="//shop.co.il/fav.ico">'), want: 'https://shop.co.il/fav.ico' },
  { id: 'P4', what: 'apple-touch-icon only', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: head('<link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon.png">'), want: 'https://shop.co.il/apple-touch-icon.png' },
  { id: 'P5', what: 'an SVG icon', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: head('<link rel="icon" type="image/svg+xml" href="/favicon.svg">'), want: 'https://shop.co.il/favicon.svg' },
  { id: 'P6', what: 'Shopify: the icon on cdn.shopify.com, protocol-relative (M1)', domain: '014zk1-w8.myshopify.com', pageUrl: 'https://014zk1-w8.myshopify.com/',
    html: head('<link rel="icon" type="image/png" href="//cdn.shopify.com/s/files/1/0712/files/favicon.png?crop=center&amp;height=32&amp;v=1&amp;width=32">'),
    want: 'https://cdn.shopify.com/s/files/1/0712/files/favicon.png?crop=center&height=32&v=1&width=32' },
  { id: 'P7', what: 'Wix: the icon on static.wixstatic.com (M1)', domain: 'be-cln.co.il', pageUrl: 'https://www.be-cln.co.il/',
    html: head('<link rel="icon" sizes="192x192" href="https://static.wixstatic.com/media/8e6c_f3.png/v1/fill/w_192%2Ch_192%2Clg_1%2Cusm_0.66_1.00_0.01/8e6c_f3.png" type="image/png"/>'),
    want: 'https://static.wixstatic.com/media/8e6c_f3.png/v1/fill/w_192%2Ch_192%2Clg_1%2Cusm_0.66_1.00_0.01/8e6c_f3.png' },
  { id: 'P8', what: 'WordPress + Jetpack: the site icon on i0.wp.com (M1)', domain: 'japan4u.co.il', pageUrl: 'https://japan4u.co.il/',
    html: head('<link rel="icon" href="https://i0.wp.com/japan4u.co.il/wp-content/uploads/2023/05/cropped-icon.png?fit=32%2C32&#038;ssl=1" sizes="32x32" />'),
    want: 'https://i0.wp.com/japan4u.co.il/wp-content/uploads/2023/05/cropped-icon.png?fit=32%2C32&ssl=1' },
  { id: 'P9', what: 'a home page served over http, relative href (M2, production: http://www.be-cln.co.il/)', domain: 'be-cln.co.il', pageUrl: 'http://www.be-cln.co.il/',
    html: head('<link rel="shortcut icon" href="/favicon.ico">'), want: 'https://www.be-cln.co.il/favicon.ico' },
  { id: 'P10', what: 'redirected to www: the page on www, the project typed bare', domain: 'gotopseo.com', pageUrl: 'https://www.gotopseo.com/',
    html: head('<link rel="icon" href="/wp-content/uploads/cropped-icon-32x32.png" sizes="32x32">'), want: 'https://www.gotopseo.com/wp-content/uploads/cropped-icon-32x32.png' },
  { id: 'P11', what: 'the icon on the site\'s own CDN subdomain', domain: 'www.idosport.co.il', pageUrl: 'https://www.idosport.co.il/',
    html: head('<link rel="icon" href="https://cdn.idosport.co.il/icon.png">'), want: 'https://cdn.idosport.co.il/icon.png' },
  { id: 'P12', what: 'printed after a stray </head> (M5)', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: '<html><head><title>x</title></head><body><link rel="icon" href="/late.png"></body></html>', want: 'https://shop.co.il/late.png' },
  { id: 'P13', what: 'past 400 KB of inline script in the head (M5)', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: `<html><head><script>${'var a=1;'.repeat(50_000)}</script><link rel="icon" href="/deep.png"></head><body></body></html>`, want: 'https://shop.co.il/deep.png' },
  { id: 'P14', what: 'behind a <base href> (M5)', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: head('<base href="https://shop.co.il/wp/"><link rel="icon" href="icon.png">'), want: 'https://shop.co.il/wp/icon.png' },
  { id: 'P15', what: 'entity-encoded slashes (M5)', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: head('<link rel="icon" href="&#x2F;img&#47;icon.png">'), want: 'https://shop.co.il/img/icon.png' },
  { id: 'P16', what: 'an empty data: icon first, the real one next', domain: 'shop.co.il', pageUrl: 'https://shop.co.il/',
    html: head('<link rel="icon" href="data:,"><link rel="icon" href="/real.png">'), want: 'https://shop.co.il/real.png' },
]

async function main() {
  console.log('P) one fixture per pattern: the icon read off the page, then kept for the project')
  const run = (x: typeof extract, y: typeof rules, f: Fixture) => y.safeSiteIcon(x.siteIconFromHtml(f.html, f.pageUrl), f.domain)
  for (const f of FIXTURES) check(`${f.id}: ${f.what}`, run(extract, rules, f) === f.want, show(run(extract, rules, f)))

  console.log('\nF) the browser\'s fallbacks when nothing is declared')
  check('F1: typed with spaces and capitals (M4, production: "Agibor. Co. Il")', rules.siteHost('Agibor. Co. Il') === 'agibor.co.il' && rules.siteHost(' Www.misgeret.co.il ') === 'www.misgeret.co.il')
  check('F2: a bare domain tries its www twin, then its touch icon (M3)',
    show(rules.siteIconCandidates('nagler.co.il')) === show(['https://nagler.co.il/favicon.ico', 'https://www.nagler.co.il/favicon.ico', 'https://nagler.co.il/apple-touch-icon.png']))
  check('F3: a www domain tries its bare twin; a deep subdomain gets no invented www twin',
    rules.siteIconCandidates('www.jup.co.il')[1] === 'https://jup.co.il/favicon.ico' && !rules.siteIconCandidates('a.b.shop.co.il').some((u) => u.includes('www.')))
  check('F4: a site that blocks our fetcher still gets the browser\'s candidates (no declared icon needed)', rules.siteIconCandidates('b144.co.il', null).length === 3)

  console.log('\nS) the <img> in the browser (M6)')
  const comp = await import('@/components/ui/SiteIcon')
  check('S1: an icon has more than 1x1 pixels', comp.isIconSize(32, 32) && !comp.isIconSize(1, 1) && !comp.isIconSize(0, 0))
  check('S2: an SVG is known by its path, the query aside', comp.isSvg('https://x.co.il/favicon.svg?v=2') && !comp.isSvg('https://x.co.il/favicon.ico') && !comp.isSvg(null))
  const src = strip(read('components/ui/SiteIcon.tsx'))
  const svgAccepted = (s: string) => /isSvg\(src\) && img\.naturalWidth === 0 && img\.naturalHeight === 0\)\) \{\s*settled\.current = src\s*setLoaded\(true\)/.test(s)
  check('S3: an SVG that loaded at 0x0 is shown, only from the load event (a broken image fires error, not load)', svgAccepted(src) && /onLoad=\{\(e\) => onLoad\(e\.currentTarget\)\}/.test(src))
  check('MUT: dropping the SVG case fails S3', !svgAccepted(src.replace('|| (isSvg(src) && img.naturalWidth === 0 && img.naturalHeight === 0)', '')))

  // S4-S9: an <img> already "complete" when the tile mounts. Chromium reports a
  // complete image with no size both for one that really failed and for one
  // whose outcome is not known yet; the mount check waits for decode() instead
  // of failing it on sight, and a cancelled check never reports.
  type Mounted = Parameters<typeof comp.checkMountedImage>[0]
  const tick = () => new Promise((r) => setTimeout(r, 0))
  async function mount(check_: typeof comp.checkMountedImage, img: Mounted, cancelEarly = false) {
    const seen: string[] = []
    const cancel = check_(img, { load: () => seen.push('load'), fail: () => seen.push('fail') })
    if (cancelEarly) cancel()
    await tick(); await tick()
    return seen.join(',')
  }
  const img = (over: Partial<NonNullable<Mounted>>): Mounted => ({ complete: true, naturalWidth: 0, naturalHeight: 0, ...over })
  const decodes = () => Promise.resolve()
  const breaks = () => Promise.reject(new Error('EncodingError'))
  const cases = async (c: typeof comp.checkMountedImage) => ({
    pending: await mount(c, img({ complete: false })),
    loaded: await mount(c, img({ naturalWidth: 32, naturalHeight: 32 })),
    notYetDecoded: await mount(c, img({ decode: decodes })),
    broken: await mount(c, img({ decode: breaks })),
    cancelled: await mount(c, img({ decode: breaks }), true),
    noDecode: await mount(c, img({})),
  })
  const real = await cases(comp.checkMountedImage)
  check('S4: an image still loading is left to its own load/error event', real.pending === '', real.pending)
  check('S5: an image that loaded before hydration is taken at once', real.loaded === 'load', real.loaded)
  check('S6: complete with no size is NOT failed on sight: once decode() resolves it is taken', real.notYetDecoded === 'load', real.notYetDecoded)
  check('S7: an image that really failed before hydration (decode rejects) moves to the next candidate', real.broken === 'fail', real.broken)
  check('S8: a check cancelled first (a newer candidate, or unmounted) never reports', real.cancelled === '', real.cancelled)
  check('S9: a browser without decode() keeps the old rule (fail)', real.noDecode === 'fail', real.noDecode)
  const failOnSight = await cases(mutant<typeof comp>('components/ui/SiteIcon.tsx', "if (typeof img.decode !== 'function') { on.fail(); return cancel }", 'on.fail(); return cancel').checkMountedImage)
  check('MUT: failing a complete, size-less image on sight (the old rule) fails S6', failOnSight.notYetDecoded === 'fail')
  const noCancel = await cases(mutant<typeof comp>('components/ui/SiteIcon.tsx', "() => { if (!cancelled) on.fail() },", '() => on.fail(),').checkMountedImage)
  check('MUT: a decode that ignores its cancellation fails S8', noCancel.cancelled === 'fail')
  const once = /const next = \(\) => \{\s*if \(src\) \{\s*if \(settled\.current === src\) return/.test(src) && /const onLoad = \(img: MountedImage\) => \{\s*if \(src && settled\.current === src\) return/.test(src)
  const wired = /return checkMountedImage\(imgRef\.current, \{ load: onLoad, fail: next \}\)/.test(src)
  check('S10: the tile runs that check on mount and settles each candidate once (its event and the check cannot both advance it)', once && wired)
  check('MUT: a tile back to failing on complete alone fails S10', !/return checkMountedImage\(/.test(src.replace(/return checkMountedImage\([^\n]*/, 'if (imgRef.current?.complete) next()')))

  console.log('\nMUT) each fix broken on purpose makes its fixture fail')
  const byId = (id: string) => FIXTURES.find((f) => f.id === id) as Fixture
  const noCdn = mutant<typeof rules>('lib/site-icon.ts', '&& !PLATFORM_ICON_HOSTS.has(u.hostname)', '')
  check('MUT M1: without the platform CDN hosts, Shopify, Wix and Jetpack fail', ['P6', 'P7', 'P8'].every((id) => run(extract, noCdn, byId(id)) === null))
  const noUpgrade = mutant<typeof rules>('lib/site-icon.ts', "if (u.protocol === 'http:' && !u.port) u.protocol = 'https:'", '')
  // What P9's relative href resolves to on the http page, before the rules see it.
  const p9 = new URL('/favicon.ico', byId('P9').pageUrl).toString()
  check('MUT M2: without the https upgrade, the http home page\'s icon is refused', rules.safeSiteIcon(p9, 'be-cln.co.il') === byId('P9').want && noUpgrade.safeSiteIcon(p9, 'be-cln.co.il') === null)
  const noTwin = mutant<typeof rules>('lib/site-icon.ts', /const twin = wwwTwin\(host\)\n\s*if \(twin\) add\(`https:\/\/\$\{twin\}\/favicon\.ico`\)/, '')
  check('MUT M3: without the www twin, a bare domain never tries www', !noTwin.siteIconCandidates('nagler.co.il').includes('https://www.nagler.co.il/favicon.ico'))
  const noSpaces = mutant<typeof rules>('lib/site-icon.ts', ".replace(/\\s+/g, '')", '.trim()')
  check('MUT M4: without dropping spaces, "Agibor. Co. Il" has no host', noSpaces.siteHost('Agibor. Co. Il') === null)
  const headOnly = mutant<typeof extract>('lib/seed-scan/site-icon.ts', 'if (inHead || headEnd < 0) return inHead', 'return inHead')
  check('MUT M5a: reading the head only misses the icon after a stray </head>', run(headOnly, rules, byId('P12')) === null)
  const noBase = mutant<typeof extract>('lib/seed-scan/site-icon.ts', 'const base = baseHref(html, lower, headEnd >= 0 ? headEnd : lower.length, page)', 'const base = page')
  check('MUT M5b: ignoring <base href> resolves the icon to the wrong path', run(noBase, rules, byId('P14')) !== byId('P14').want)
  const shortScan = mutant<typeof extract>('lib/seed-scan/site-icon.ts', 'const SCAN_LIMIT = 1_500_000', 'const SCAN_LIMIT = 300_000')
  check('MUT M5c: the old 300 KB limit misses the icon past the inline script', run(shortScan, rules, byId('P13')) === null)

  console.log('\nR) the second look for finished runs without an icon (M7)')
  const now = new Date('2026-09-28T12:00:00Z')
  const day = 86_400_000
  const runOf = (status: string, summary: Record<string, unknown> | null) => ({ id: 'run-1', project_id: 'p-1', status, summary })
  check('R1: a finished run without an icon, never looked at again: yes', refresh.needsIconRetry(runOf('done', {}), now) && refresh.needsIconRetry(runOf('partial', {}), now))
  check('R2: a running or failed run, or one with an icon: no',
    !refresh.needsIconRetry(runOf('running', {}), now) && !refresh.needsIconRetry(runOf('failed', {}), now)
    && !refresh.needsIconRetry(runOf('done', { siteIcon: 'https://x.co.il/i.png' }), now) && !refresh.needsIconRetry(null, now))
  check('R3: looked at 2 days ago: no; 8 days ago: yes (once a week)',
    !refresh.needsIconRetry(runOf('done', { siteIconCheckedAt: new Date(now.getTime() - 2 * day).toISOString() }), now)
    && refresh.needsIconRetry(runOf('done', { siteIconCheckedAt: new Date(now.getTime() - 8 * day).toISOString() }), now))
  const weekless = mutant<typeof refresh>('lib/seed-scan/site-icon-refresh.ts', 'now.getTime() - checked < RETRY_AFTER_MS', 'false')
  check('MUT: without the weekly limit, a run looked at 2 days ago is read again (R3 fails)',
    weekless.needsIconRetry(runOf('done', { siteIconCheckedAt: new Date(now.getTime() - 2 * day).toISOString() }), now))

  // The network, faked: what the base fetch was asked for, and what the page says.
  const PAGE = head('<link rel="icon" href="//cdn.shopify.com/s/files/1/icon.png">')
  const netOf = (opts: { redirectTo?: string; status?: number } = {}) => {
    const asked: string[] = []
    const base = (async (input: RequestInfo | URL) => {
      asked.push(String(input))
      return new Response(PAGE, { status: opts.status ?? 200, headers: { 'content-type': 'text/html' } })
    }) as typeof fetch
    const deps: refresh.IconRefreshDeps = {
      fetchImpl: base,
      assertHost: async (h: string) => (h.startsWith('rebind.') ? { ok: false, reason: 'private' } : { ok: true, addresses: ['93.184.216.34'] }) as never,
      // The engine follows redirects through the fetchImpl it is given, like fetchSiteHtml does.
      fetchHtml: (async (start: URL, d: { fetchImpl?: typeof fetch } = {}) => {
        const f = d.fetchImpl ?? base
        try {
          if (opts.redirectTo) await f(opts.redirectTo)
          const res = await f(start.toString())
          if (!res.ok) return { ok: false, reason: 'http_error', status: res.status }
          return { ok: true, url: start.toString(), status: res.status, html: await res.text(), truncated: false }
        } catch (e) {
          return { ok: false, reason: e instanceof OffHostRequestError ? 'blocked' : 'network' }
        }
      }) as never,
      now: () => now,
    }
    return { asked, deps }
  }

  const store = () => new FakeAdmin({
    project_seed_runs: [
      { id: 'run-1', project_id: 'p-1', user_id: 'u-1', status: 'done', summary: { domain: 'shop.myshopify.com', url: 'https://shop.myshopify.com/' } },
      { id: 'run-2', project_id: 'p-2', user_id: 'u-2', status: 'done', summary: { domain: 'other.co.il' } },
    ],
  })
  {
    const admin = store()
    const { asked, deps } = netOf()
    const row = admin.tables.project_seed_runs[0] as unknown as refresh.IconRunRow
    const out = await refresh.refreshRunIcon(admin as never, { run: row, userId: 'u-1', targetDomain: 'shop.myshopify.com' }, deps)
    const saved = admin.tables.project_seed_runs[0].summary as Record<string, unknown>
    check('R4: the home page is read once, the icon found and stored with the time of the look', out === 'found'
      && saved.siteIcon === 'https://cdn.shopify.com/s/files/1/icon.png' && saved.siteIconCheckedAt === now.toISOString()
      && saved.url === 'https://shop.myshopify.com/' && show(asked) === show(['https://shop.myshopify.com/']), show({ out, saved, asked }))
    check('R5: the icon URL itself is never requested by the server', !asked.some((u) => u.includes('cdn.shopify.com')))
    check('R6: another owner\'s run is never written', (admin.tables.project_seed_runs[1].summary as Record<string, unknown>).siteIconCheckedAt === undefined)
  }
  {
    const admin = store()
    const { deps } = netOf()
    const row = { ...(admin.tables.project_seed_runs[1] as unknown as refresh.IconRunRow) }
    await refresh.refreshRunIcon(admin as never, { run: row, userId: 'u-1', targetDomain: 'other.co.il' }, deps)
    check('R7: a run of another user, passed in anyway, is not written (the write is fenced by owner)',
      (admin.tables.project_seed_runs[1].summary as Record<string, unknown>).siteIconCheckedAt === undefined)
  }
  {
    const admin = store()
    const { asked, deps } = netOf({ redirectTo: 'https://evil.example/steal' })
    const row = admin.tables.project_seed_runs[0] as unknown as refresh.IconRunRow
    const out = await refresh.refreshRunIcon(admin as never, { run: row, userId: 'u-1', targetDomain: 'shop.myshopify.com' }, deps)
    check('R8: a redirect off the project\'s host is refused before it leaves (host pinning), and the look is recorded',
      out === 'none' && !asked.some((u) => u.includes('evil.example')) && typeof (admin.tables.project_seed_runs[0].summary as Record<string, unknown>).siteIconCheckedAt === 'string', show({ out, asked }))
    const unpinned = mutant<typeof refresh>('lib/seed-scan/site-icon-refresh.ts',
      /const fetchImpl = hostPinnedFetch\(\{[\s\S]*?\} \}\)/, 'const fetchImpl = deps.fetchImpl')
    const net2 = netOf({ redirectTo: 'https://evil.example/steal' })
    await unpinned.readDeclaredIcon('shop.myshopify.com', net2.deps)
    check('MUT: without hostPinnedFetch the off-host request leaves (R8 fails)', net2.asked.some((u) => u.includes('evil.example')))
  }
  {
    const { asked, deps } = netOf()
    const out = await refresh.readDeclaredIcon('rebind.shop.co.il', deps)
    const bad = await refresh.readDeclaredIcon('http://127.0.0.1/', deps)
    check('R9: a host whose DNS answers a private address, or an IP literal, is never requested', out === null && bad === null && asked.length === 0, show(asked))
    const unguarded = mutant<typeof refresh>('lib/seed-scan/site-icon-refresh.ts', 'if (!host.ok) return null', '')
    const net3 = netOf()
    await unguarded.readDeclaredIcon('rebind.shop.co.il', net3.deps)
    check('MUT: without the DNS admission the private host is requested (R9 fails)', net3.asked.length === 1)
  }
  {
    const { deps } = netOf({ status: 403 })
    check('R10: a site that blocks our fetcher (403) is "no icon this time", nothing thrown', (await refresh.readDeclaredIcon('b144.co.il', deps)) === null)
  }
  {
    const admin = store()
    admin.tables.project_seed_runs[0].status = 'running'
    const { asked, deps } = netOf()
    const row = admin.tables.project_seed_runs[0] as unknown as refresh.IconRunRow
    const out = await refresh.refreshRunIcon(admin as never, { run: row, userId: 'u-1', targetDomain: 'shop.myshopify.com' }, deps)
    check('R11: a run in progress is left to the pipeline: nothing read, nothing written', out === 'skipped' && asked.length === 0)
  }

  console.log('\nG) where the second look is started')
  const route = strip(read('app/api/projects/active/route.ts'))
  const scheduled = (s: string) => /after\(async \(\) =>/.test(s) && /refreshRunIcon\(/.test(s) && /needsIconRetry\(run, now\)/.test(s)
    && /if \(out\.length >= MAX_PER_REQUEST\) break/.test(s) && /\.eq\('id', runId\)\s*\.eq\('user_id', userId\)/.test(s)
  check('G1: the project list schedules it after the response, for at most MAX_PER_REQUEST of the caller\'s own runs', scheduled(route) && refresh.MAX_PER_REQUEST <= 2)
  check('MUT: no per-request cap fails G1', !scheduled(route.replace('if (out.length >= MAX_PER_REQUEST) break', '')))
  check('MUT: reading the run without the owner filter fails G1', !scheduled(route.replace(".eq('user_id', userId)", '')))
  const mod = strip(read('lib/seed-scan/site-icon-refresh.ts'))
  const guarded = (s: string) => /normalizeCheckUrl\(/.test(s) && /deps\.assertHost\(start\.hostname\)/.test(s) && /hostPinnedFetch\(\{ siteKey: domainKey\(start\)/.test(s)
    && /\.in\('status', \[\.\.\.FINISHED\]\)/.test(s) && !/fetch\w*\([^)]*siteIcon/.test(s)
  check('G2: the look uses a1\'s guards (admission, DNS, host pinning), writes only a finished run, never fetches an icon', guarded(mod))
  check('MUT: dropping the finished-run fence fails G2', !guarded(mod.replace(".in('status', [...FINISHED])", '')))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
