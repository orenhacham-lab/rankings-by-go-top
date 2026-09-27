/**
 * A project's site icon (lib/site-icon.ts, lib/seed-scan/site-icon.ts,
 * components/ui/SiteIcon.tsx, GET /api/projects/active).
 *
 *  I) only an https icon on the project's own site, with a public host name, is
 *     ever shown; everything else falls back to /favicon.ico, then the initial;
 *  H) the icon the home page declares is read off the HTML a1 already has, in
 *     linear time on hostile markup;
 *  R) a stored icon is checked again when the summary is read;
 *  G) source guards: a plain <img> with no referrer, no next/image, no
 *     third-party favicon service, and no server-side fetch of an icon anywhere;
 *     a1 stores what it found; the switcher, the dashboard hero and the research
 *     summary hero show it with the initial as their fallback.
 * Every guard has a mutation control.
 *
 * Run: npx tsx lib/seed-scan/__qa__/site-icon.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { safeSiteIcon, siteHost, siteIconCandidates } from '@/lib/site-icon'
import { siteIconFromHtml } from '../site-icon'
import { readSummary, initialSummary } from '../summary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/[^\n]*/g, '$1')

console.log('I) what may be shown')
{
  check('I1: the host of a bare domain, a URL and an IDN, in ASCII',
    siteHost('gotopseo.com') === 'gotopseo.com' && siteHost('https://www.Shop.co.il/path?q=1') === 'www.shop.co.il'
    && /^xn--/.test(siteHost('אתר.co.il') ?? ''), show([siteHost('https://www.Shop.co.il/path?q=1'), siteHost('אתר.co.il')]))
  const bad = ['', 'localhost', 'intranet', '127.0.0.1', '10.0.0.8', 'http://[::1]/', 'a..b.com', '-x.com', 'x.c0m1']
  check('I2: no host for a single label, an IP literal or a malformed name; a port is dropped, never kept', bad.every((d) => siteHost(d) === null) && siteHost('x.com:8443') === 'x.com', show(bad.map(siteHost)))
  const ok = ['https://gotopseo.com/favicon.png', 'https://www.gotopseo.com/wp-content/uploads/icon-32x32.png', 'https://cdn.gotopseo.com/i.svg']
  check('I3: https on the site, its www twin or a subdomain is kept', ok.every((u) => safeSiteIcon(u, 'gotopseo.com') === u))
  const no = [
    'http://gotopseo.com/favicon.png', 'https://evil.com/x.png', 'https://gotopseo.com.evil.com/x.png', 'https://notgotopseo.com/x.png',
    'https://static.wixstatic.com/x.png', 'data:image/png;base64,AAAA', 'javascript:alert(1)', 'https://user:pw@gotopseo.com/x.png',
    'https://gotopseo.com:8443/x.png', `https://gotopseo.com/${'a'.repeat(600)}.png`, 'https://127.0.0.1/x.png', '/relative.png',
  ]
  check('I4: http, another site, a look-alike host, data:/javascript:, credentials, a port, an overlong or relative URL are refused',
    no.every((u) => safeSiteIcon(u, 'gotopseo.com') === null), show(no.filter((u) => safeSiteIcon(u, 'gotopseo.com') !== null)))
  check('I5: candidates: the declared icon first, then /favicon.ico',
    show(siteIconCandidates('gotopseo.com', 'https://gotopseo.com/i.png')) === show(['https://gotopseo.com/i.png', 'https://gotopseo.com/favicon.ico']))
  check('I6: an unsafe declared icon is dropped; no host, no candidate (the initial stays)',
    show(siteIconCandidates('gotopseo.com', 'https://evil.com/i.png')) === show(['https://gotopseo.com/favicon.ico'])
    && siteIconCandidates('localhost', null).length === 0 && siteIconCandidates(null, null).length === 0)
  check('MUT: a check that trusts any https host fails I4', no.some((u) => {
    try { const x = new URL(u); return x.protocol === 'https:' } catch { return false }
  }))
}

console.log('\nH) the icon the page declares')
{
  const page = 'https://www.gotopseo.com/'
  const head = (links: string) => `<!doctype html><html><head><title>x</title>${links}</head><body><link rel="icon" href="/body.png"></body></html>`
  check('H1: rel="icon", relative, resolved against the page',
    siteIconFromHtml(head('<link rel="icon" type="image/png" href="/wp-content/uploads/cropped-icon-32x32.png" sizes="32x32">'), page)
      === 'https://www.gotopseo.com/wp-content/uploads/cropped-icon-32x32.png')
  check('H2: "shortcut icon", protocol-relative, upper case, single quotes and &amp;',
    siteIconFromHtml(head("<LINK REL='Shortcut Icon' HREF='//gotopseo.com/fav.ico?v=1&amp;x=2'>"), page) === 'https://gotopseo.com/fav.ico?v=1&x=2')
  check('H3: an explicit icon wins over the touch icon, whatever the order',
    siteIconFromHtml(head('<link rel="apple-touch-icon" href="/touch.png"><link rel="icon" href="/icon.svg">'), page) === 'https://www.gotopseo.com/icon.svg')
  check('H4: the touch icon when it is all there is', siteIconFromHtml(head('<link rel="apple-touch-icon" href="/touch.png">'), page) === 'https://www.gotopseo.com/touch.png')
  check('H5: an icon on another host is skipped for the next one on the site',
    siteIconFromHtml(head('<link rel="icon" href="https://static.wixstatic.com/x.png"><link rel="shortcut icon" href="/f.ico">'), page) === 'https://www.gotopseo.com/f.ico')
  check('H6: nothing declared (or only in <body>, or only stylesheets): null',
    siteIconFromHtml(head('<link rel="stylesheet" href="/s.css">'), page) === null && siteIconFromHtml('<html><head></head></html>', page) === null)
  check('H7: data:, javascript: and http icons are never kept',
    siteIconFromHtml(head('<link rel="icon" href="data:image/png;base64,AAAA"><link rel="icon" href="javascript:alert(1)"><link rel="icon" href="http://www.gotopseo.com/i.png">'), page) === null)
  const hostile = [
    '<link rel="icon" href="'.repeat(60_000),
    `<head>${'<link '.repeat(250_000)}`,
    `<head><link rel="icon" href="${'a'.repeat(1_400_000)}`,
    `<head>${'<link rel=icon href=x '.repeat(70_000)}>`,
  ]
  const times = hostile.map((h) => { const t = Date.now(); siteIconFromHtml(h, page); return Date.now() - t })
  check('H8: hostile, unclosed or huge markup (1.5 MB) is read in linear time (< 300 ms each)', times.every((ms) => ms < 300), show(times))
}

console.log('\nR) a stored icon is checked again when read')
{
  const base = { ...initialSummary({ source: 'scan', domain: 'gotopseo.com', url: 'https://gotopseo.com/', locale: 'he' }) }
  const withIcon = (siteIcon: unknown) => readSummary({ ...base, siteIcon })
  check('R1: a safe icon is kept', withIcon('https://gotopseo.com/i.png')?.siteIcon === 'https://gotopseo.com/i.png')
  check('R2: an icon on another site, or not https, is dropped on read',
    withIcon('https://evil.com/i.png')?.siteIcon === undefined && withIcon('http://gotopseo.com/i.png')?.siteIcon === undefined && withIcon(42)?.siteIcon === undefined)
  check('R3: a summary without one has no such key (older runs read as before)', !('siteIcon' in (readSummary(base) ?? {})))
}

console.log('\nG) source guards')
{
  const comp = strip(read('components/ui/SiteIcon.tsx'))
  const browserOnly = (src: string) =>
    /<img\b[\s\S]*?referrerPolicy="no-referrer"/.test(src) && !/from 'next\/image'|<Image\b/.test(src) && /siteIconCandidates\(/.test(src) && !/\bfetch\(/.test(src)
  check('G1: the icon is a plain <img> the browser loads, with no referrer, from siteIconCandidates only', browserOnly(comp))
  check('MUT: next/image instead fails G1', !browserOnly(`import Image from 'next/image'\n${comp}`))
  check('MUT: the referrer sent again fails G1', !browserOnly(comp.replace('referrerPolicy="no-referrer"', '')))

  // No third-party favicon service anywhere in the app's own code.
  const files: string[] = []
  const walk = (dir: string) => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`
      if (name === 'node_modules' || name === '__qa__' || name.startsWith('.')) continue
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
      else if (/\.(ts|tsx)$/.test(name)) files.push(rel)
    }
  }
  for (const d of ['app', 'components', 'lib']) walk(d)
  const SERVICES = /google\.com\/s2\/favicons|gstatic\.com\/favicon|icons\.duckduckgo\.com|favicone\.com|icon\.horse|besticon|faviconkit|logo\.clearbit\.com|favicon\.yandex/i
  const offenders = (sources: [string, string][]) => sources.filter(([, s]) => SERVICES.test(s)).map(([f]) => f)
  const sources = files.map((f) => [f, read(f)] as [string, string])
  check(`G2: no third-party favicon service in ${files.length} files of app, components and lib`, files.length > 300 && offenders(sources).length === 0, show(offenders(sources)))
  check('MUT: a Google favicon URL fails G2', offenders([...sources, ['x.tsx', 'const u = `https://www.google.com/s2/favicons?domain=${d}`']]).length === 1)

  // Nothing server-side ever requests an icon URL.
  const serverSide = ['lib/site-icon.ts', 'lib/seed-scan/site-icon.ts', 'app/api/projects/active/route.ts', 'lib/seed-scan/summary.ts'].map((f) => strip(read(f)))
  const noFetch = (srcs: string[]) => srcs.every((s) => !/\bfetch\s*\(|fetchSite(Html|Text)\(|hostPinnedFetch\(|\baxios\b|\bhttps?\.get\(/.test(s))
  check('G3: the icon helpers, the summary reader and the list route fetch nothing', noFetch(serverSide))
  check('MUT: a route that fetches the icon fails G3', !noFetch([...serverSide, 'const r = await fetch(icons.get(id))']))
  const everywhere = sources.filter(([f]) => /^(app\/api|lib)\//.test(f)).map(([, s]) => strip(s))
  const iconFetched = (srcs: string[]) => srcs.some((s) => /fetch\w*\s*\([^)]*\b(siteIcon|site_icon|favicon)\b/i.test(s))
  check('G4: no server code passes an icon or a favicon URL to a fetch', !iconFetched(everywhere))
  check('MUT: fetch(summary.siteIcon) in server code fails G4', iconFetched([...everywhere, 'await fetch(summary.siteIcon)']))

  const steps = strip(read('lib/seed-scan/steps.ts'))
  const stores = (src: string) => /const siteIcon = siteIconFromHtml\(fetched\.html, fetched\.url\)/.test(src) && /\.\.\.\(siteIcon \? \{ siteIcon \} : \{\}\)/.test(src)
  check('G5: a1 reads the icon off the page it already fetched and stores it in the summary', stores(steps))
  check('MUT: a1 that does not store it fails G5', !stores(steps.replace('...(siteIcon ? { siteIcon } : {}),', '')))

  const route = strip(read('app/api/projects/active/route.ts'))
  const rechecks = (src: string) => /site_icon: safeSiteIcon\(icons\.get\(r\.id\), r\.target_domain\)/.test(src) && /\.eq\('user_id', user\.id\)/.test(src)
  check('G6: the list route re-checks each stored icon against the project\'s own domain, for the caller\'s projects only', rechecks(route))
  check('MUT: a route that passes the stored icon through unchecked fails G6', !rechecks(route.replace('safeSiteIcon(icons.get(r.id), r.target_domain)', 'icons.get(r.id) ?? null')))

  const where: [string, RegExp][] = [
    ['components/layout/WorkspaceSwitcher.tsx', /<SiteIcon[\s\S]*?domain=\{current\?\.target_domain\}[\s\S]*?<SiteIcon[\s\S]*?domain=\{p\.target_domain\}/],
    ['components/dashboard/HeroCard.tsx', /<SiteIcon[\s\S]*?domain=\{domain\}[\s\S]*?fallback=\{initial\}/],
    ['components/onboarding/ResearchSummary.tsx', /<SiteIcon[\s\S]*?icon=\{summary\.siteIcon\}[\s\S]*?fallback=\{initial\}/],
  ]
  const shown = (entries: [string, string, RegExp][]) => entries.filter(([, src, re]) => !re.test(src)).map(([f]) => f)
  const entries = where.map(([f, re]) => [f, strip(read(f)), re] as [string, string, RegExp])
  check('G7: the switcher (its button and its list), the dashboard hero and the summary hero show the icon, the initial as fallback', shown(entries).length === 0, show(shown(entries)))
  check('MUT: a hero back to the bare initial fails G7', shown(entries.map(([f, s, re]) => [f, f.includes('HeroCard') ? s.replace(/<SiteIcon[\s\S]*?\/>/, '<span>{initial}</span>') : s, re])).length === 1)

  const config = read('next.config.ts')
  check('G8: next.config keeps its one image host (no icon host was opened) and sets no img-src', /hostname: '\*\.supabase\.co'/.test(config) && (config.match(/hostname:/g) ?? []).length === 1 && !/img-src/.test(config))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
