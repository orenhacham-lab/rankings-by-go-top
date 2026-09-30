/**
 * WAVE 9 (owner's message, 2026-09-30), the Links tab, the top bar and new customers'
 * account structure. Every rule has a MUTATION CONTROL: the same check on a deliberately
 * broken copy must fail.
 *
 *   A  Links: the customer link network always leads the screen; when it cannot run it
 *      says why (Shopify store OR Shopify-billed account) instead of vanishing; the hero
 *      names Go Top SEO customers and states the promises (no reciprocal links, anchors
 *      from the article, never a competitor). The network's rules and routes are untouched.
 *   B  Free listings: only sites where the business adds itself for free; no outreach,
 *      no paid directories, no "best of" / association / media list; by country.
 *   C  "Links Google already found": the Search Console API has no links report, so the
 *      screen shows no number and opens the report on the owner's own property.
 *   D  Top bar: a settings link to the current project, and a bell with every waiting
 *      row (the card's rule, uncapped) and a count badge; accessible menu.
 *   E  One business, one client: an account with one client sees no client column or
 *      picker; two or more keep the full client management; nothing is written.
 *
 * Run: npx tsx lib/__qa__/w9-links.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
const { readFileSync, existsSync } = require('fs') as typeof import('fs')
const { join, resolve } = require('path') as typeof import('path')
const { createElement } = require('react') as { createElement: (...a: any[]) => any }
const { renderToStaticMarkup } = require('react-dom/server') as typeof import('react-dom/server')
const { DashboardLanguageProvider } = require('../i18n/dashboard/useDashboardLanguage')
const { getDashboardDictionary } = require('../i18n/dashboard/getDashboardDictionary')
const { withMutant } = require('../reminders/__qa__/_mutant') as typeof import('../reminders/__qa__/_mutant')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = resolve(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
type Locale = 'he' | 'en'
const render = (locale: Locale, node: unknown) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale, children: node }) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, '\'').replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
const he = getDashboardDictionary('he')
const en = getDashboardDictionary('en')
;(globalThis as any).fetch = async () => { throw new Error('no fetch during a render') }

async function main() {
  // ── A. the network leads, always ──────────────────────────────────────────
  console.log('\nA) Links: the customer link network always leads the screen')
  {
    const screen = strip(read('components/site-links/network/SiteLinksScreen.tsx'))
    const leads = (s: string) => /kind === 'hidden'\)\s*\{[\s\S]*?top=\{<NetworkUnavailable reason=\{load\.reason\}/.test(s) && !/<SiteLinksView projectId=\{projectId\} outreach=/.test(s)
    check('A1: a hidden network keeps its place at the top, with the reason (NetworkUnavailable)', leads(screen))
    check('A1-MUT: the old "vanish and lead with outreach" is caught', !leads(screen.replace(/if \(load\.kind === 'hidden'\) \{[\s\S]*?\n  \}\n/, "if (load.kind === 'hidden') return <SiteLinksView projectId={projectId} outreach={load.reason} />\n")))

    const NetworkUnavailable: any = require('../../components/site-links/network/NetworkUnavailable').default
    const draw = (reason: string, locale: Locale = 'he', mod: any = NetworkUnavailable) => render(locale, createElement(mod, { reason, onRetry() {} }))
    const shop = text(draw('shopify'))
    check('A2: Shopify: the title, the reason that names a Shopify store AND a Shopify-billed account, no switch, no retry',
      shop.includes('רשת הקישורים לא זמינה לאתר הזה') && shop.includes('חנות Shopify, או חשבון שהמנוי שלו משולם דרך Shopify') && !/role="switch"/.test(draw('shopify')) && !shop.includes('נסו שוב'))
    const off = text(draw('off'))
    check('A3: a failed read says so and offers a retry', off.includes('לא הצלחנו לטעון עכשיו את רשת הקישורים') && off.includes('נסו שוב') && !off.includes('Shopify'))
    check('A4: the figures stay as "—" (nothing counted for a site outside the network)', (draw('shopify').match(/—/g) ?? []).length >= 3)
    const mutUn = await withMutant<any, boolean>('components/site-links/network/NetworkUnavailable.tsx', [["{reason === 'shopify' ? u.shopify : u.off}", '{u.off}']], (m) => text(draw('shopify', 'he', m.default)).includes('משולם דרך Shopify'))
    check('A2-MUT: the Shopify reason dropped → caught', !mutUn)
    const enShop = text(draw('shopify', 'en'))
    check('A2 English: the same, in English only', enShop.includes('The link network is not available for this site') && enShop.includes('billed through Shopify') && !/[א-ת]/.test(enShop))

    // The hero's words: Go Top SEO customers, and the three promises in every state.
    check('A5: the figures say they are links between Go Top SEO customers (both languages)',
      he.siteLinks.network.stats.received === 'קישורים שקיבלתם מלקוחות Go Top SEO' && he.siteLinks.network.stats.given === 'קישורים שנתתם ללקוחות Go Top SEO'
      && en.siteLinks.network.stats.received === 'Links received from Go Top SEO customers' && en.siteLinks.network.stats.given === 'Links given to Go Top SEO customers')
    const promisesOk = (d: any) => d.siteLinks.network.hero.promises.length === 3 && /הדדיים|reciprocal/.test(d.siteLinks.network.hero.promises[0]) && /המאמר|article/.test(d.siteLinks.network.hero.promises[1]) && /מתחרה|competitor/.test(d.siteLinks.network.hero.promises[2])
    check('A6: the promises: no reciprocal links, anchors from the article, never a competitor', promisesOk(he) && promisesOk(en))
    const NetworkPanel: any = require('../../components/site-links/network/NetworkPanel').default
    const base: any = {
      ok: true, available: true, memberCount: 3, linkRel: 'follow', consentVersion: 'v1',
      membership: { active: false, since: null, leftAt: null }, readiness: 'ready',
      caps: { receivedThisMonth: 0, receivedCap: 1, givenThisMonth: 0, givenCap: 4, perArticle: 1 },
      totals: { received: 0, given: 0 }, received: [], given: [],
    }
    const panel = (data: any, mod: any = NetworkPanel) => render('he', createElement(mod, { projectId: 'a1111111-2222-3333-4444-555555555555', data, onChanged() {} }))
    const offHtml = panel(base)
    check('A7: the off hero shows the turn-on button, the switch and the promises', /data-link-network-turn-on/.test(offHtml) && /role="switch"/.test(offHtml) && /data-link-network="promises"/.test(offHtml) && text(offHtml).includes('בלי קישורים הדדיים'))
    const mutP = await withMutant<any, boolean>('components/site-links/network/NetworkPanel.tsx', [['<NetworkPromises label={h.promisesLabel} items={h.promises} />', '']], (m) => /data-link-network="promises"/.test(panel(base, m.default)))
    check('A7-MUT: the promises removed from the hero → caught', !mutP)
    // The network's server side is not part of this change.
    const store = read('lib/link-network/store.ts')
    check('A8: the network rules are unchanged: a Shopify-billed account is still outside the network', /shopifyBilled\.has\(p\.user_id\)/.test(store) && /billing_authority === 'shopify'/.test(store))
  }

  // ── B. free listings ──────────────────────────────────────────────────────
  console.log('\nB) Free listings: only sites where the business adds itself, for free')
  {
    const fl = require('../site-links/free-listings') as typeof import('../site-links/free-listings')
    const PAID_OR_OUTREACH = ['zap.co.il', 'midrag.co.il', 'zips.co.il', 'foursquare.com', 'ynet.co.il', 'mako.co.il', 'wanderlog.com']
    const listOk = (list: readonly any[]) => {
      const problems: string[] = []
      const ids = new Set<string>()
      for (const l of list) {
        if (ids.has(l.id)) problems.push(`dup ${l.id}`); ids.add(l.id)
        let u: URL | null = null
        try { u = new URL(l.url) } catch { problems.push(`bad url ${l.id}`) }
        if (u && (u.protocol !== 'https:' || !(u.hostname === l.domain || u.hostname.endsWith(`.${l.domain}`) || l.domain.endsWith(`.${u.hostname.replace(/^www\./, '')}`) || u.hostname.replace(/^www\./, '') === l.domain))) problems.push(`url not on its own domain ${l.id}`)
        if (PAID_OR_OUTREACH.some((d) => l.domain === d || l.domain.endsWith(`.${d}`))) problems.push(`paid/outreach ${l.domain}`)
        if (!he.siteLinks.listings.items[l.id] || !en.siteLinks.listings.items[l.id]) problems.push(`no words for ${l.id}`)
        if (!he.siteLinks.listings.fit[l.fit] || !en.siteLinks.listings.fit[l.fit]) problems.push(`no fit label ${l.fit}`)
      }
      return problems
    }
    const p = listOk(fl.FREE_LISTINGS)
    check('B1: every entry is https on its own domain, has words in both languages, and none is paid or outreach', p.length === 0, p)
    check('B1-MUT: a paid comparison site (zap.co.il) on the list → caught', listOk([...fl.FREE_LISTINGS, { id: 'zap', name: 'Zap', domain: 'zap.co.il', url: 'https://www.zap.co.il/', fit: 'local', region: 'il' }]).length > 0)
    check('B1-MUT: an address off the site\'s own domain → caught', listOk([{ ...fl.FREE_LISTINGS[0], url: 'https://evil.example/business/' }]).length > 0)
    const il = fl.listingsFor('IL', 'he').map((l) => l.id), us = fl.listingsFor('US', 'en').map((l) => l.id)
    check('B2: an Israeli project gets the Israeli directories and not Yelp; a US one the reverse', il.includes('dapei_zahav') && il.includes('b144') && !il.includes('yelp') && us.includes('yelp') && !us.includes('dapei_zahav'))
    check('B3: every business first: Google, Bing and Apple lead the list', il.slice(0, 3).join() === 'google,bing,apple' && us.slice(0, 3).join() === 'google,bing,apple')
    check('B4: no country: a Hebrew project counts as Israeli', fl.isIsraeliProject(null, 'he') && !fl.isIsraeliProject(null, 'en') && !fl.isIsraeliProject('US', 'he'))
    const seen = fl.listingsSeen(fl.listingsFor('IL', 'he'), ['www.d.co.il', 'notb144.co.il', 'm.easy.co.il'])
    check('B5: "shows up in your searches" is an exact domain or a subdomain, never a substring', seen.has('dapei_zahav') && seen.has('easy') && !seen.has('b144'))
    const mutSeen = await withMutant<any, boolean>('lib/site-links/free-listings.ts', [["found.some((f) => f === d || f.endsWith(`.${d}`))", 'found.some((f) => f.includes(d))']], (m) => m.listingsSeen(m.listingsFor('IL', 'he'), ['notb144.co.il']).has('b144'))
    check('B5-MUT: a substring match → caught', mutSeen)

    // The screen: the outreach list and its marks are gone.
    const view = strip(read('components/site-links/SiteLinksView.tsx'))
    const noOutreach = (s: string) => /<FreeListings /.test(s) && !/OpportunityList|OutreachHero|OutreachMeter|useOpportunityStatus|contacted|got_link/.test(s)
    check('B6: the screen shows the free listings, and no outreach list, hero, meter or "contacted" marks', noOutreach(view) && !existsSync(join(ROOT, 'components/site-links/OpportunityList.tsx')))
    check('B6-MUT: the outreach list back → caught', !noOutreach(view + '\n<OpportunityList />'))
    const outreachWords = (d: any) => 'outreachHero' in d.siteLinks || 'opportunities' in d.siteLinks
    check('B7: no outreach words left in either dictionary (steps to ask for a link, "contacted", "link received")', !outreachWords(he) && !outreachWords(en))
    check('B7-MUT: an outreach block back → caught', outreachWords({ siteLinks: { ...he.siteLinks, opportunities: {} } }))
    const FreeListings: any = require('../../components/site-links/FreeListings').default
    const html = render('he', createElement(FreeListings, { copy: he.siteLinks, listings: fl.listingsFor('IL', 'he'), seen: new Set(['b144']) }))
    check('B8: each card has the site\'s own sign-up link (new tab, noopener) and "shows up in your searches" only where true',
      /href="https:\/\/www\.google\.com\/business\/"[^>]*target="_blank"[^>]*rel="noopener noreferrer"/.test(html) && (html.match(/data-listing-seen/g) ?? []).length === 1 && /data-listing="b144"[\s\S]*?data-listing-seen/.test(html))
    check('B9: Hebrew screen: the Israeli directory is named in Hebrew', text(html).includes('דפי זהב'))
    const pol = he.siteLinks.policy
    check('B10: the policy note no longer speaks of reaching out', pol.title === 'קישורים בתשלום והחלפות' && en.siteLinks.policy.title === 'Paid links and swaps')
  }

  // ── C. links Google already found ────────────────────────────────────────
  console.log('\nC) Links Google already found: no number the API cannot give')
  {
    const sc = require('../site-links/search-console-links') as typeof import('../site-links/search-console-links')
    const good = { 'sc-domain:plumber-tlv.co.il': 'https://search.google.com/search-console/links?resource_id=sc-domain%3Aplumber-tlv.co.il', 'https://www.plumber-tlv.co.il/': 'https://search.google.com/search-console/links?resource_id=https%3A%2F%2Fwww.plumber-tlv.co.il%2F' } as Record<string, string>
    const bad = ['javascript:alert(1)', '//evil.com', 'https://user:pw@evil.com/', 'sc-domain:', 'ftp://x.co.il/', '', 'https://localhost/']
    const ok = (fn: typeof sc.searchConsoleLinksUrl) => Object.entries(good).every(([k, v]) => fn(k) === v) && bad.every((b) => fn(b) === null)
    check('C1: the report\'s address is Google\'s host with the encoded property; anything else is null', ok(sc.searchConsoleLinksUrl))
    const mut = await withMutant<any, boolean>('lib/site-links/search-console-links.ts', [["if ((u.protocol !== 'https:' && u.protocol !== 'http:') || !u.hostname.includes('.') || u.username || u.password) return null", '']], (m) => ok(m.searchConsoleLinksUrl))
    check('C1-MUT: without the property checks, credentials and localhost get through → caught', !mut)
    const { connectedProperty } = require('../../components/site-links/SearchConsoleLinks')
    check('C2: the property only from a live connection', connectedProperty({ ok: true, connection: { status: 'connected' }, property: { siteUrl: 'sc-domain:a.co.il' } }) === 'sc-domain:a.co.il'
      && connectedProperty({ ok: true, connection: { status: 'revoked' }, property: { siteUrl: 'sc-domain:a.co.il' } }) === null && connectedProperty({ ok: true, connection: null, property: null }) === null)
    const src = strip(read('components/site-links/SearchConsoleLinks.tsx'))
    const honest = (s: string) => !/\/api\//.test(s) && /useGscResponse\(off \? null : gscStatusUrl\(projectId\)\)/.test(s) && !/count|total|\.length/.test(s.replace(/copy\.opensNewTab/g, ''))
    check('C3: it shows no count, and reads the shared Search Console status (no route of its own)', honest(src))
    check('C3-MUT: a made-up count → caught', !honest(src + '\nconst total = links.length'))
    check('C4: the words say the API cannot read the report (both languages)', he.siteLinks.gscLinks.body.includes('גוגל לא מאפשר לקרוא את הדוח הזה מחוץ ל-Search Console') && en.siteLinks.gscLinks.body.includes('Google does not let anyone read that report outside Search Console'))
  }

  // ── D. top bar ────────────────────────────────────────────────────────────
  console.log('\nD) Top bar: settings and the notifications bell')
  {
    const rows = require('../nudges/rows') as typeof import('../nudges/rows')
    const w: any = { ok: true, articles: 3, topics: 12, queued: 5, queueEndsAt: null, pluginConnected: true, connectionDown: 'platform' }
    const all = rows.allWaitingRows('p1', w, 4)
    check('D1: the bell lists every waiting row (the card stops at three)', all.map((r) => r.kind).join() === 'connection,articles,topics,fixes' && rows.waitingRows('p1', w, 4).length === 3)
    check('D2: the badge counts each thing to do; a lost connection is one', rows.bellCount(all) === 1 + 3 + 12 + 4 && rows.bellCount([]) === 0)
    const mutCount = await withMutant<any, number>('lib/nudges/rows.ts', [["(r.kind === 'connection' ? 1 : Math.max(0, r.n))", '1']], (m) => m.bellCount(m.allWaitingRows('p1', w, 4)))
    check('D2-MUT: a badge that counts rows instead of things → caught', mutCount !== 20)
    const bar = strip(read('components/layout/TopBarActions.tsx'))
    const barOk = (s: string) => /useWaiting\(activeProjectId, pathname\)/.test(s) && /allWaitingRows\(activeProjectId, waiting, safeFixes\)/.test(s)
      && /aria-expanded=\{open\}/.test(s) && /aria-haspopup="menu"/.test(s) && /aria-label=\{t\.notificationsCount\(count\)\}/.test(s) && /e\.key === 'Escape'/.test(s)
      && /settingsHref\(activeProjectId\)/.test(s) && /aria-label=\{t\.settings\}/.test(s)
    check('D3: the bell reads the shared waiting answer with the card\'s rule, is an accessible menu, and settings is the project\'s', barOk(bar))
    check('D3-MUT: the bell reading its own capped list → caught', !barOk(bar.replace('allWaitingRows(activeProjectId, waiting, safeFixes)', 'waitingRows(activeProjectId, waiting, safeFixes)')))
    const hrefs = [...bar.matchAll(/href=\{([^}]+)\}/g)].map((m) => m[1])
    check('D4: every link in the bar is internal (settingsHref, the rows\' own internal paths)', hrefs.every((h) => /^settings as|^row\.href as/.test(h.trim())) && all.every((r) => r.href.startsWith('/') && !r.href.startsWith('//')), hrefs)
    const layout = strip(read('app/(dashboard)/layout.tsx'))
    check('D5: the layout mounts it in the top bar, after the Guide', /<GuideMenu [^>]*\/>\s*(\{\s*\}\s*)?<TopBarActions \/>/.test(layout))
    // 390px: the switcher gives way to the two icons (it truncates the name), so the bar never scrolls sideways.
    const sw = strip(read('components/layout/WorkspaceSwitcher.tsx'))
    const fits = (s: string) => /className="relative min-w-0 shrink" ref=\{boxRef\}/.test(s) && /inline-flex h-9 max-w-full sm:max-w-\[min\(70vw,22rem\)\]/.test(s)
    check('D7: at 390 the switcher shrinks to make room for settings and the bell', fits(sw))
    check('D7-MUT: the fixed 70vw switcher back (it pushed the bar 44px wide) → caught', !fits(sw.replace('max-w-full sm:max-w-[min(70vw,22rem)]', 'max-w-[min(70vw,22rem)]')))
    check('D6: the words exist in both languages', he.topBarActions.notificationsCount(3) === 'התראות: 3 דברים מחכים לכם' && en.topBarActions.notificationsCount(1) === 'Notifications: 1 thing is waiting for you' && he.topBarActions.settings === 'הגדרות הפרויקט')
  }

  // ── E. one business, one client ──────────────────────────────────────────
  console.log('\nE) One business, one client')
  {
    const sc = require('../clients/single-client') as typeof import('../clients/single-client')
    check('E1: one (or no) client → the client layer is hidden; two or more keep it', sc.isSingleClientAccount([{ id: 'c1' }]) && sc.isSingleClientAccount([]) && !sc.isSingleClientAccount([{ id: 'c1' }, { id: 'c2' }]))
    check('E2: a new project goes to the only client without asking; with several, the form asks', sc.implicitClientId([{ id: 'c1' }]) === 'c1' && sc.implicitClientId([{ id: 'c1' }, { id: 'c2' }]) === null && sc.implicitClientId([]) === null)
    const mut = await withMutant<any, boolean>('lib/clients/single-client.ts', [['clients.length <= 1', 'clients.length <= 100']], (m) => m.isSingleClientAccount([{ id: 'a' }, { id: 'b' }]))
    check('E1-MUT: an agency with two clients losing its client management → caught', mut)
    const form = strip(read('components/projects/ProjectForm.tsx'))
    const formOk = (s: string) => /\{!project && onlyClient && <input type="hidden" name="client_id" value=\{onlyClient\} \/>\}/.test(s) && /\{!project && !onlyClient && \(\s*<Select/.test(s)
    check('E3: the form sends the only client as a hidden field, and shows the picker otherwise', formOk(form))
    check('E3-MUT: the picker for everyone → caught', !formOk(form.replace('{!project && !onlyClient && (', '{!project && (')))
    const page = strip(read('app/(dashboard)/projects/page.tsx'))
    check('E4: the projects list hides the client column for one client and keeps a quiet way to add clients', /showClient=\{!isSingleClientAccount\(clients\)\}/.test(page) && /href="\/clients"/.test(page))
    const plans = read('lib/subscription.ts')
    check('E5: plans untouched (legacy client limits as before)', /LEGACY_MAX_CLIENTS: Record<PlanCode, number> = \{ regular: 5, advanced: 20, premium: 100, large_agency: 1000 \}/.test(plans) && /maxClients: 1, maxKeywordsPerProject: TRIAL_CATALOG/.test(plans))
    const writes = (s: string) => /\.(insert|update|upsert|delete)\(/.test(strip(s))
    check('E6: presentation only: the helper writes nothing', !writes(read('lib/clients/single-client.ts')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}
void main()
export {}
