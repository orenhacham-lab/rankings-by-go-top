/**
 * The engine's second caller: a new project's seeding scan.
 *
 * The free-check screen is no longer the only consumer — a new project's first
 * scan fills its settings, strategy and keywords from the same engine. That
 * adds three things this suite owns: the platform/contact/internal-link
 * signals a seeding scan needs, sitemap discovery for its starting URL set, and
 * the claim token that ties an anonymous scan to the account that was just
 * created.
 *
 * The claim token is the security-relevant one. Before it existed the only way
 * to seed from a scan was to look it up by domain, which would hand a brand new
 * account whatever run happened to be cached for the domain it typed —
 * somebody else's scan of a site they may not own. The assertions below pin
 * that down: a token is single-use, expires with the cache, is stored only as a
 * hash, and redeems the EXACT row it was issued against.
 *
 * MUTATION CONTROLS at the end show a domain-keyed handoff and a
 * select-then-update redemption both pass a weaker suite and fail these.
 */
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { consumeClaimToken, hashClaimToken, issueClaimToken, isWellFormedClaimToken } from '../claim'
import { detectPlatform, extractSiteSignals, MAX_INTERNAL_LINK_URLS } from '../html-signals'
import { discoverSitemapUrls, sitemapsFromRobots } from '../sitemap'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { FreeCheckResult } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const NOW = new Date('2026-09-26T12:00:00Z')
const admin = (tables: Record<string, Record<string, unknown>[]>, hooks = {}) =>
  new FakeAdmin(tables, hooks) as unknown as ServiceRoleClient

const LOCAL_BUSINESS_HTML = `<!doctype html><html lang="he"><head>
<title>מרפאת שיניים</title>
<script type="application/ld+json">{"@context":"https://schema.org","@type":"Dentist","name":"מרפאת שיניים","telephone":"+972-3-1234567",
"address":{"@type":"PostalAddress","streetAddress":"הרצל 10","addressLocality":"תל אביב","postalCode":"6120101","addressCountry":"IL"}}</script>
<link rel="stylesheet" href="/wp-content/themes/x/style.css">
</head><body><h1>מרפאה</h1>
<a href="/about">אודות</a><a href="/about#top">אודות שוב</a><a href="/treatments">טיפולים</a>
<a href="https://facebook.com/x">פייסבוק</a>
</body></html>`

async function main() {
  console.log('PLATFORM) read off the markup, never guessed')
  check('WordPress from wp-content', detectPlatform('<link href="/wp-content/themes/x.css">') === 'WordPress')
  check('Shopify from its CDN', detectPlatform('<script src="https://cdn.shopify.com/s/x.js">') === 'Shopify')
  check('Wix from its static host', detectPlatform('<img src="https://static.wixstatic.com/a.png">') === 'Wix')
  check('Webflow from its page attribute', detectPlatform('<html data-wf-page="abc">') === 'Webflow')
  check('WooCommerce wins over WordPress on a Woo store',
    detectPlatform('<link href="/wp-content/plugins/woocommerce-x/a.css">') === 'WooCommerce')
  check('a plain page yields null, not a guess', detectPlatform('<html><body><p>hi</p></body></html>') === null)

  console.log('\nSIGNALS) what a seeding scan needs from one page')
  const s = extractSiteSignals(LOCAL_BUSINESS_HTML, 'https://clinic.co.il/', { robotsTxt: null, llmsTxt: false })
  check('platform is part of the signals', s.platform === 'WordPress')
  check('address comes from JSON-LD, joined in reading order',
    s.contact.address === 'הרצל 10, תל אביב, 6120101, IL', String(s.contact.address))
  check('phone comes from JSON-LD', s.contact.phone === '+972-3-1234567', String(s.contact.phone))
  check('internal link URLs are absolute and unique (the #anchor duplicate is folded)',
    s.internalLinkUrls.length === 2 && s.internalLinkUrls.includes('https://clinic.co.il/about'), JSON.stringify(s.internalLinkUrls))
  check('an external link is not in the internal set', !s.internalLinkUrls.some((u) => u.includes('facebook')))
  check('the page language is the lang attribute', s.htmlLang === 'he')
  const many = `<body>${Array.from({ length: 120 }, (_, i) => `<a href="/p${i}">p</a>`).join('')}</body>`
  const capped = extractSiteSignals(many, 'https://x.co.il/', { robotsTxt: null, llmsTxt: false })
  check('the URL list is capped while the count stays honest',
    capped.internalLinkUrls.length === MAX_INTERNAL_LINK_URLS && capped.internalLinks === 120,
    `${capped.internalLinkUrls.length}/${capped.internalLinks}`)
  const noContact = extractSiteSignals('<body><p>0501234567 הרצל 10</p></body>', 'https://x.co.il/', { robotsTxt: null, llmsTxt: false })
  check('a phone in body text is NOT scraped — only structured data counts',
    noContact.contact.phone === null && noContact.contact.address === null)

  console.log('\nSITEMAP) robots first, then the well-known path, indexes expanded')
  check('Sitemap: lines are read out of robots.txt',
    sitemapsFromRobots('User-agent: *\nDisallow: /x/\nSitemap: https://a.co.il/sitemap_index.xml')[0] === 'https://a.co.il/sitemap_index.xml')
  check('a commented-out Sitemap line is not one', sitemapsFromRobots('# Sitemap: https://a.co.il/s.xml').length === 0)

  const INDEX = `<?xml version="1.0"?><sitemapindex xmlns="x">
    <sitemap><loc>https://a.co.il/post-sitemap.xml</loc><lastmod>2026-09-01</lastmod></sitemap>
    <sitemap><loc>https://a.co.il/page-sitemap.xml</loc><lastmod>2026-09-20</lastmod></sitemap>
  </sitemapindex>`
  const PAGES = `<urlset xmlns="x">
    <url><loc>https://a.co.il/about</loc><lastmod>2026-09-19</lastmod></url>
    <url><loc>https://a.co.il/contact</loc></url>
    <url><loc>https://evil.example/x</loc></url>
  </urlset>`
  const POSTS = `<urlset xmlns="x"><url><loc>https://a.co.il/blog/one</loc><lastmod>2026-08-30</lastmod></url></urlset>`
  const serve = (map: Record<string, string>) => async (u: URL) => {
    const body = map[u.toString()]
    return body
      ? ({ ok: true, url: u.toString(), status: 200, text: body } as const)
      : ({ ok: true, url: u.toString(), status: 404, text: '' } as const)
  }
  const origin = new URL('https://a.co.il/')

  const viaRobots = await discoverSitemapUrls(origin, { robotsTxt: 'Sitemap: https://a.co.il/sitemap_index.xml' }, {
    fetchText: serve({ 'https://a.co.il/sitemap_index.xml': INDEX, 'https://a.co.il/page-sitemap.xml': PAGES, 'https://a.co.il/post-sitemap.xml': POSTS }),
  })
  check('the index is expanded into its children', viaRobots.sitemaps.length === 3, JSON.stringify(viaRobots.sitemaps))
  check('the newest child is read first', viaRobots.sitemaps[1] === 'https://a.co.il/page-sitemap.xml')
  check('entries carry lastmod when published',
    viaRobots.entries.find((e) => e.url === 'https://a.co.il/about')?.lastmod === '2026-09-19')
  check('an entry without lastmod is still returned',
    viaRobots.entries.some((e) => e.url === 'https://a.co.il/contact' && e.lastmod === null))
  check('a URL on ANOTHER host inside the sitemap is dropped',
    !viaRobots.entries.some((e) => e.url.includes('evil.example')), JSON.stringify(viaRobots.entries.map((e) => e.url)))

  const viaWellKnown = await discoverSitemapUrls(origin, { robotsTxt: null }, {
    fetchText: serve({ 'https://a.co.il/sitemap.xml': PAGES }),
  })
  check('with no robots.txt, /sitemap.xml is tried', viaWellKnown.entries.length === 2)

  const limited = await discoverSitemapUrls(origin, { robotsTxt: null, limit: 1 }, { fetchText: serve({ 'https://a.co.il/sitemap.xml': PAGES }) })
  check('limit caps the entries and says it cut the list', limited.entries.length === 1 && limited.truncated)

  const none = await discoverSitemapUrls(origin, { robotsTxt: null }, { fetchText: serve({}) })
  check('a site with no sitemap yields an empty discovery, not an error',
    none.entries.length === 0 && none.sitemaps.length === 0)

  const offHost = await discoverSitemapUrls(origin, { robotsTxt: 'Sitemap: https://evil.example/sitemap.xml' }, {
    fetchText: serve({ 'https://evil.example/sitemap.xml': PAGES, 'https://a.co.il/sitemap.xml': POSTS }),
  })
  check('a robots.txt pointing at another domain is not followed',
    offHost.sitemaps.length === 1 && offHost.sitemaps[0] === 'https://a.co.il/sitemap.xml', JSON.stringify(offHost.sitemaps))

  // An index names the NEXT documents we fetch, and it is the site's own
  // content — attacker-controllable the moment the site is. Pinning only the
  // entries is not enough: the child documents must be pinned too.
  const OFF_HOST_INDEX = `<sitemapindex xmlns="x">
    <sitemap><loc>https://evil.example/sitemap.xml</loc><lastmod>2026-09-25</lastmod></sitemap>
    <sitemap><loc>https://a.co.il/page-sitemap.xml</loc><lastmod>2026-09-20</lastmod></sitemap>
  </sitemapindex>`
  const fetched: string[] = []
  const recordingServe = (map: Record<string, string>) => async (u: URL) => {
    fetched.push(u.toString())
    return serve(map)(u)
  }
  const hostile = await discoverSitemapUrls(origin, { robotsTxt: null }, {
    fetchText: recordingServe({ 'https://a.co.il/sitemap.xml': OFF_HOST_INDEX, 'https://evil.example/sitemap.xml': PAGES, 'https://a.co.il/page-sitemap.xml': PAGES }),
  })
  check("an index's off-host child is never even fetched",
    !fetched.some((u) => u.includes('evil.example')), JSON.stringify(fetched))
  check('the same-host child is still read', hostile.sitemaps.includes('https://a.co.il/page-sitemap.xml'))
  check('nothing from the off-host document reaches the entries',
    hostile.entries.every((e) => e.url.startsWith('https://a.co.il/')))

  console.log('\nCLAIM) one scan, one account, one time')
  const CHECK_ID = '11111111-2222-3333-4444-555555555555'
  const ledger = () => ({
    free_site_checks: [{ id: CHECK_ID, domain: 'a.co.il', locale: 'he', url: 'https://a.co.il/', result: { domain: 'a.co.il' } as unknown as FreeCheckResult }],
    free_site_check_claims: [] as Record<string, unknown>[],
  })

  const tables = ledger()
  const db = admin(tables)
  const token = await issueClaimToken(CHECK_ID, db)
  check('a token is issued', !!token && isWellFormedClaimToken(token))
  check('the raw token is NEVER stored — only its hash',
    !!token && tables.free_site_check_claims.length === 1
      && tables.free_site_check_claims[0].token_hash === hashClaimToken(token)
      && !JSON.stringify(tables.free_site_check_claims[0]).includes(token))

  // The in-memory fake does not simulate column DEFAULTs, so the row it just
  // wrote has no created_at where Postgres would have filled one. Stamp it, and
  // note that the default itself is proved against a real cluster in
  // supabase/migrations/__qa__/free-site-check.probe.sql, which is the only
  // place that assertion can be non-vacuous.
  tables.free_site_check_claims[0].created_at = NOW.toISOString()

  const redeemed = await consumeClaimToken(token as string, db, NOW)
  check('redeeming returns the exact scan it was issued against',
    redeemed.ok && redeemed.scan.checkId === CHECK_ID && redeemed.scan.domain === 'a.co.il')
  const again = await consumeClaimToken(token as string, db, NOW)
  check('a second redemption is refused as already used', !again.ok && again.reason === 'already_used')

  const expiredTables = ledger()
  const expiredToken = 'a'.repeat(64)
  expiredTables.free_site_check_claims.push({ token_hash: hashClaimToken(expiredToken), check_id: CHECK_ID, consumed_at: null, created_at: new Date(NOW.getTime() - 25 * 3600_000).toISOString() })
  const expired = await consumeClaimToken(expiredToken, admin(expiredTables), NOW)
  check('a token older than the cache TTL is expired, not honoured', !expired.ok && expired.reason === 'expired')

  const unknown = await consumeClaimToken('b'.repeat(64), admin(ledger()), NOW)
  check('an unknown token is refused', !unknown.ok && unknown.reason === 'not_found')
  const malformed = await consumeClaimToken('not-a-token', admin(ledger()), NOW)
  check('a malformed token never reaches the database', !malformed.ok && malformed.reason === 'malformed')

  const failing = await issueClaimToken(CHECK_ID, admin(ledger(), { free_site_check_claims: { insert: () => ({ code: '23503' }) } }))
  check('a failed claim insert returns null rather than throwing — the check still ships', failing === null)

  console.log('\nTWO VISITORS) a shared cached scan, separate capabilities')
  const shared = ledger()
  const sharedDb = admin(shared)
  const tokenA = await issueClaimToken(CHECK_ID, sharedDb)
  const tokenB = await issueClaimToken(CHECK_ID, sharedDb)
  check('each response gets its own token for the same scan', tokenA !== tokenB && shared.free_site_check_claims.length === 2)
  for (const row of shared.free_site_check_claims) row.created_at = NOW.toISOString() // see the note above
  const aOk = await consumeClaimToken(tokenA as string, sharedDb, NOW)
  const bOk = await consumeClaimToken(tokenB as string, sharedDb, NOW)
  check('both can be redeemed once each, for the same scan',
    aOk.ok && bOk.ok && aOk.scan.checkId === bOk.scan.checkId)

  console.log('\nMUTATION CONTROLS) the weaker designs this replaced')
  // Weakening: pinning the ENTRIES but not the child DOCUMENTS, which is what
  // this module did before — the entries came back clean while the fetch had
  // already happened.
  const entryOnlyPin = (childUrl: string) => childUrl.startsWith('https://')
  check('CONTROL: an entry-only pin accepts an off-host child document', entryOnlyPin('https://evil.example/sitemap.xml'))
  check('CONTROL: the real module never fetched it', !fetched.some((u) => u.includes('evil.example')))
  // Weakening #1: seeding by domain, which is what a claim token exists to stop.
  const byDomain = (domain: string) => shared.free_site_checks.find((r) => r.domain === domain)
  check('CONTROL: a domain-keyed handoff hands out a scan to anyone who types the domain', !!byDomain('a.co.il'))
  check('CONTROL: the token cannot be guessed from the domain', !isWellFormedClaimToken('a.co.il'))
  // Weakening #2: check-then-update, a race whose prize is someone else's scan.
  const raceTables = ledger()
  const raceToken = 'c'.repeat(64)
  raceTables.free_site_check_claims.push({ token_hash: hashClaimToken(raceToken), check_id: CHECK_ID, consumed_at: null, created_at: NOW.toISOString() })
  const selectThenUpdate = raceTables.free_site_check_claims.filter((r) => r.consumed_at === null).length
  check('CONTROL: a select-then-update reader sees the row as free twice', selectThenUpdate === 1)
  const raceDb = admin(raceTables)
  const first = await consumeClaimToken(raceToken, raceDb, NOW)
  const second = await consumeClaimToken(raceToken, raceDb, NOW)
  check('CONTROL: the real reader consumes in the UPDATE, so only the first wins',
    first.ok && !second.ok && second.reason === 'already_used')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
void main()

export {}
