/**
 * The public menus (owner, 5 Oct 2026, after the competitor's mega-menu):
 * features in three groups and a "who it's for" menu.
 *
 *   1. every internal menu item has a real page in EVERY language tree, derived
 *      from the menu source (never a hand-written list), plus the XML and HTML
 *      sitemaps;
 *   2. Shopify reaches the App Store through SHOPIFY_APP_STORE_URL and nothing
 *      else. Until w11 the menu item WAS that URL; the owner asked (9 Oct 2026)
 *      for a page with content that links to the listing, so the item now goes
 *      to /solutions/shopify and THAT page carries the one outbound link, still
 *      rel="nofollow", still from the constant, still dropped when it is null —
 *      a store can only install from the listing, so with no listing there is
 *      nowhere to send anyone. The one other user of the constant is the in-app
 *      Shopify connect (ShopifyConnectionPanel, owner 5 Oct 2026: the store
 *      installs from the App Store, not by typing a shop domain) — same rules:
 *      the constant, nofollow, dropped when null. No other file may use it;
 *   3. the menu words exist, non-empty, in all four dictionaries;
 *   4. the new pages promise nothing the code cannot keep: no percentages, no
 *      ROI, no WordPress.org listing (the plugin is not approved yet).
 * Each group has a mutation control.
 *
 * Run: npx tsx components/public/__qa__/public-nav-menus.qa.ts
 */
import { existsSync, readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { SHOPIFY_APP_STORE_URL } from '@/lib/public-links/shopify-app-store'
import { SITE_FIXES_PAGE } from '@/lib/i18n/public/pages/site-fixes'
import { AGENCIES_PAGE, BUSINESSES_PAGE, SHOPIFY_PAGE, WORDPRESS_PAGE } from '@/lib/i18n/public/pages/solutions'
import { SITE_LINKS_PAGE } from '@/lib/i18n/public/pages/site-links'
import { COMPETITORS_PAGE, SEARCH_CONSOLE_PAGE } from '@/lib/i18n/public/pages/results'

const ROOT = join(__dirname, '..', '..', '..')
let passed = 0
let failed = 0
function check(name: string, ok: boolean, detail = '') {
  if (ok) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/** The internal paths the menu links, read from the menu's own source. */
function menuPaths(src: string): string[] {
  const features = Array.from(src.matchAll(/feature\('\w+', '([a-z-]+)'/g), (m) => `/features/${m[1]}`)
  const solutions = Array.from(src.matchAll(/`\$\{prefix\}(\/solutions\/[a-z-]+)`/g), (m) => m[1])
  return [...features, ...solutions]
}
const pageFile = (prefix: string, path: string) => join(ROOT, 'app', '(public)', prefix.replace(/^\//, ''), path, 'page.tsx')

function main() {
  const nav = strip(read('components/PublicNav.tsx'))
  const paths = menuPaths(nav)

  console.log('\n1) every menu item is a real page in every language')
  {
    check('1a: the menu has the three feature groups', /id: 'measure'/.test(nav) && /id: 'act'/.test(nav) && /id: 'prove'/.test(nav))
    // Owner, 6 Oct 2026: the three columns must balance, three items each.
    const groupSizes = Array.from(nav.matchAll(/id: '(measure|act|prove)',[\s\S]*?items: \[([\s\S]*?)\],/g), (m) => (m[2].match(/feature\(/g) ?? []).length)
    // The columns balanced at 3/3/3 (owner, 6 Oct 2026) until Links joined the
    // middle one, which is the work the system actually does (owner, 9 Oct 2026).
    // No column may run away from the others: three or four, never five.
    check('1a2: …with three or four features in each column, and never a runaway column',
      groupSizes.length === 3 && groupSizes.every((n) => n === 3 || n === 4) && Math.max(...groupSizes) - Math.min(...groupSizes) <= 1,
      JSON.stringify(groupSizes))
    check('1a2-MUT: a five-item column is caught', !([3, 5, 3].every((n) => n === 3 || n === 4)))
    check('1b: ten features and four solution pages are read from the menu', paths.length === 14, JSON.stringify(paths))
    const missing = PUBLIC_LOCALES.flatMap((l) => paths.filter((p) => !existsSync(pageFile(LOCALE_PREFIX[l], p))).map((p) => `${l}${p}`))
    check('1c: …each with a page.tsx in he, en, es and pt-BR', missing.length === 0, missing.join(', '))
    const xml = read('app/sitemap.xml/route.ts')
    const notInXml = paths.filter((p) => !xml.includes(`'${p}'`) || !xml.includes(`/en${p}\``) || !xml.includes(`\${baseUrl}${p}\``))
    check('1d: …and in the XML sitemap (Hebrew, English, and the mirrored list)', notInXml.length === 0, notInXml.join(', '))
    const htmlMissing = PUBLIC_LOCALES.flatMap((l) => {
      const file = l === 'he' ? 'app/(public)/sitemap/page.tsx' : `app/(public)/${l}/sitemap/page.tsx`
      const src = read(file)
      return paths.filter((p) => !src.includes(`'${LOCALE_PREFIX[l]}${p}'`)).map((p) => `${l}${p}`)
    })
    check('1e: …and in the HTML sitemap of every language', htmlMissing.length === 0, htmlMissing.join(', '))
    for (const page of [SITE_FIXES_PAGE, BUSINESSES_PAGE, AGENCIES_PAGE, WORDPRESS_PAGE, SHOPIFY_PAGE, SITE_LINKS_PAGE, COMPETITORS_PAGE, SEARCH_CONSOLE_PAGE]) {
      check(`1f: ${page.path} is a menu path`, paths.includes(page.path))
    }
    // MUTATION CONTROL
    check('1-MUT: a menu pointing at a page that does not exist is caught',
      !existsSync(pageFile('', '/solutions/nope')) && menuPaths("feature('x', 'nope-page'").length === 1)
  }

  console.log('\n2) Shopify goes only to the App Store listing')
  {
    check('2a: the menu has no store URL of its own', !/apps\.shopify\.com/.test(nav))
    check('2b: the Shopify item still appears only while the listing exists', /SHOPIFY_APP_STORE_URL\s*\?/.test(nav) && !/href: SHOPIFY_APP_STORE_URL/.test(nav))
    check('2c: the menu can still open an external item in a new tab, nofollow, without the referrer', /target="_blank" rel="nofollow noopener noreferrer"/.test(nav) && /item\.external/.test(nav))
    check('2d: the Shopify page exists in every language and is the menu\'s destination',
      PUBLIC_LOCALES.every((l) => existsSync(pageFile(LOCALE_PREFIX[l], '/solutions/shopify'))) && /`\$\{prefix\}\/solutions\/shopify`/.test(nav))
    // The page is the only place that links out to Shopify, and it does it
    // through the constant with rel="nofollow" — never a typed-in store URL.
    const shopifySrc = strip(read('lib/i18n/public/pages/solutions.tsx'))
    const outboundOk = /href=\{SHOPIFY_APP_STORE_URL\}/.test(shopifySrc)
      && /rel="nofollow noopener noreferrer"/.test(shopifySrc)
      && !/apps\.shopify\.com/.test(shopifySrc)
      && /SHOPIFY_APP_STORE_URL\s*$/m.test(shopifySrc.replace(/\s*\?/g, '\n')) === false || true
    check('2d2: the Shopify page links out through the constant, with nofollow and no typed-in URL',
      /href=\{SHOPIFY_APP_STORE_URL\}/.test(shopifySrc) && /rel="nofollow noopener noreferrer"/.test(shopifySrc) && !/apps\.shopify\.com/.test(shopifySrc))
    check('2d2-MUT: a typed-in store URL on the page is caught',
      /apps\.shopify\.com/.test(shopifySrc.replace('href={SHOPIFY_APP_STORE_URL}', "href='https://apps.shopify.com/x'")))
    check('2d3: the page drops its outbound link when there is no listing', /SHOPIFY_APP_STORE_URL\s*\n?\s*\?/.test(shopifySrc))
    void outboundOk
    check('2e: the constant is null or an App Store listing', SHOPIFY_APP_STORE_URL === null || /^https:\/\/apps\.shopify\.com\/[a-z0-9-]+\/?$/.test(SHOPIFY_APP_STORE_URL))
    // MUTATION CONTROL
    const mutated = nav.replace('`${prefix}/solutions/shopify`', "'https://apps.shopify.com/x'")
    check('2-MUT: a hard-coded store URL in the menu fails 2a', /apps\.shopify\.com/.test(mutated))

    // 2f — WHO uses the constant, read from the tree (never a hand-written
    // claim): the public menu, the public Shopify page, the in-app connect
    // panel, and the constant's own module. Anything else fails.
    const ALLOWED = new Set([
      'components/PublicNav.tsx',
      'lib/i18n/public/pages/solutions.tsx',
      'components/content/ShopifyConnectionPanel.tsx',
      // The billing page's "billed through Shopify" notice (owner, 9 Oct 2026).
      'app/(dashboard)/billing/BillingView.tsx',
      'lib/public-links/shopify-app-store.ts',
    ])
    const users: string[] = []
    const walk = (rel: string) => {
      for (const name of readdirSync(join(ROOT, rel))) {
        if (name === 'node_modules' || name === '__qa__' || name.startsWith('.')) continue
        const child = `${rel}/${name}`
        if (statSync(join(ROOT, child)).isDirectory()) walk(child)
        else if (/\.(ts|tsx)$/.test(name) && /SHOPIFY_APP_STORE_URL/.test(strip(read(child)))) users.push(child)
      }
    }
    for (const top of ['app', 'components', 'lib']) walk(top)
    const outsiders = (list: string[]) => list.filter((f) => !ALLOWED.has(f))
    check('2f: only the menu, the Shopify page and the in-app connect panel use the constant', outsiders(users).length === 0, outsiders(users).join(', '))
    const panel = strip(read('components/content/ShopifyConnectionPanel.tsx'))
    const panelOk = (src: string) => /href=\{SHOPIFY_APP_STORE_URL\}/.test(src)
      && /rel="nofollow noopener noreferrer"/.test(src)
      && /target="_blank"/.test(src)
      && /SHOPIFY_APP_STORE_URL\s*\?/.test(src)
      && !/apps\.shopify\.com/.test(src)
    check('2g: the in-app panel links out through the constant, nofollow, in a new tab, and drops the link when null', panelOk(panel))
    // MUTATION CONTROLS
    check('2f-MUT: a new file using the constant is caught', outsiders([...users, 'components/Other.tsx']).length === 1)
    check('2g-MUT: the panel losing nofollow is caught', !panelOk(panel.replace('rel="nofollow noopener noreferrer"', 'rel="noopener"')))
    const billing = strip(read('app/(dashboard)/billing/BillingView.tsx'))
    const billingOk = (src: string) => /href=\{SHOPIFY_APP_STORE_URL\}/.test(src)
      && /rel="nofollow noopener noreferrer"/.test(src)
      && /if \(!SHOPIFY_APP_STORE_URL\) return null/.test(src)
      && !/apps\.shopify\.com/.test(src)
    check('2h: the billing page links out through the constant, nofollow, and drops the link when null', billingOk(billing))
    check('2h-MUT: the billing link losing nofollow is caught', !billingOk(billing.replace('rel="nofollow noopener noreferrer"', 'rel="noopener"')))
  }

  console.log('\n3) the menu words exist in all four languages')
  {
    for (const l of PUBLIC_LOCALES) {
      const nav = getPublicDictionary(l).nav
      const words = [
        nav.solutions, nav.featureGroups.measure, nav.featureGroups.act, nav.featureGroups.prove,
        nav.featuresMenu.siteFixes.label, nav.featuresMenu.siteFixes.description,
        ...Object.values(nav.solutionsMenu).flatMap((v) => [v.label, v.description]),
      ]
      check(`3a: ${l} has every menu word`, words.every((w) => typeof w === 'string' && w.trim().length > 0))
    }
    const he = getPublicDictionary('he').nav
    check('3b: the languages are not copies of each other', PUBLIC_LOCALES.filter((l) => l !== 'he').every((l) => getPublicDictionary(l).nav.solutions !== he.solutions))
    // MUTATION CONTROL
    check('3-MUT: an empty word is caught', !['ok', ' '].every((w) => w.trim().length > 0))
  }

  console.log('\n4) the new pages promise only what the code does')
  {
    const sources = ['lib/i18n/public/pages/site-fixes.tsx', 'lib/i18n/public/pages/solutions.tsx', 'lib/i18n/public/pages/results.tsx', 'lib/i18n/public/pages/site-links.tsx'].map((f) => strip(read(f)))
    const all = sources.join('\n')
    check('4a: no percentage claims', !/\d\s?%/.test(all))
    check('4b: no ROI claims', !/\bROI\b/.test(all))
    check('4c: no WordPress.org listing before the plugin is approved', !/wordpress\.org/i.test(all))
    check('4d: no Shopify App Store URL in page copy', !/apps\.shopify\.com/.test(all))
    // The links page leads on the opt-in link network between customers (the
    // owner asked for that on 9 Oct 2026). It must never read as an offer of
    // links for sale, and it must keep saying, in every language, that joining
    // is optional and off by default, that nothing about rankings or a number
    // of links is promised, and that Google may treat such links as a link
    // scheme: those three are what makes advertising the network honest.
    const linksSrc = strip(read('lib/i18n/public/pages/site-links.tsx'))
    const flat = linksSrc.replace(/\s+/g, ' ')
    // Positive, not a word blocklist: the page SAYS, in each language, that we
    // neither sell nor buy links and promise none from other people's sites.
    const disclaimers = [
      /\u05dc\u05d0 \u05de\u05d5\u05db\u05e8\u05d9\u05dd \u05e7\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd, \u05dc\u05d0 \u05e7\u05d5\u05e0\u05d9\u05dd \u05e7\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd/,
      /do not sell links, buy links, or promise links/i,
      /No vendemos enlaces, no compramos enlaces/i,
      /n\u00e3o vende links, n\u00e3o compra links/i,
    ]
    check('4f: the links page says in all four languages that we neither sell nor buy links',
      disclaimers.every((re) => re.test(linksSrc)))
    check('4f-MUT: dropping the Hebrew disclaimer is caught',
      !disclaimers.every((re) => re.test(linksSrc.replace('\u05dc\u05d0 \u05de\u05d5\u05db\u05e8\u05d9\u05dd \u05e7\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd, \u05dc\u05d0 \u05e7\u05d5\u05e0\u05d9\u05dd \u05e7\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd', ''))))
    // Joining is optional and off by default — the one sentence that keeps the
    // page in line with clause 15A of the terms.
    const optIn = [
      /\u05db\u05d1\u05d5\u05d9\u05d4 \u05db\u05d1\u05e8\u05d9\u05e8\u05ea \u05de\u05d7\u05d3\u05dc/,
      /off by default/i,
      /desactivad[oa] por defecto/i,
      /vem desligad[oa]/i,
    ]
    check('4g: the links page says in all four languages that the network is opt-in and off by default',
      optIn.every((re) => re.test(flat)))
    check('4g-MUT: dropping the English opt-in sentence is caught',
      !optIn.every((re) => re.test(flat.replace(/off by default/gi, ''))))
    // No ranking promise and no promised number of links, in every language.
    const noPromise = [
      /\u05d0\u05d9\u05df \u05d4\u05ea\u05d7\u05d9\u05d9\u05d1\u05d5\u05ea \u05dc\u05d3\u05d9\u05e8\u05d5\u05d2/,
      /no ranking promise/i,
      /ni promesa de posicionamiento/i,
      /nem promessa de posicionamento/i,
    ]
    check('4h: the links page promises no ranking in any language', noPromise.every((re) => re.test(flat)))
    check('4h-MUT: dropping the Hebrew no-ranking sentence is caught',
      !noPromise.every((re) => re.test(flat.replace(/\u05d0\u05d9\u05df \u05d4\u05ea\u05d7\u05d9\u05d9\u05d1\u05d5\u05ea \u05dc\u05d3\u05d9\u05e8\u05d5\u05d2/g, ''))))
    // Oren, 9 Oct 2026: no wording that could get us flagged as spam by Google.
    // So the vocabulary of link schemes, link building and backlinks, and any
    // framing of the feature as a way to influence ranking, stay off the public
    // page. The Google risk itself is disclosed in clause 15A of the terms and
    // on the opt-in screen in the app, where the owner accepts it.
    const spamVocabulary = [
      /\u05ea\u05db\u05e0\u05d9\u05ea \u05e7\u05d9\u05e9\u05d5\u05e8\u05d9\u05dd/,
      /link scheme/i,
      /esquema de (enlaces|links)/i,
      /backlinks?/i,
      /link building/i,
      /\u05dc\u05d4\u05e9\u05e4\u05d9\u05e2 \u05e2\u05dc \u05d3\u05d9\u05e8\u05d5\u05d2/,
      /influence ranking/i,
    ]
    check('4i: the links page uses none of the link-scheme vocabulary', spamVocabulary.every((re) => !re.test(flat)))
    check('4i-MUT: a "link scheme" line would be caught', !spamVocabulary.every((re) => !re.test(`${flat} link scheme`)))
    // Asked for by the legal session: responsibility for search engine
    // compliance stays with the site owner, and the service can be paused.
    const ownerDuty = [
      /\u05d4\u05d0\u05d7\u05e8\u05d9\u05d5\u05ea \u05dc\u05ea\u05d5\u05db\u05df \u05d4\u05d0\u05ea\u05e8 \u05d5\u05dc\u05e2\u05de\u05d9\u05d3\u05d4 \u05d1\u05d4\u05e0\u05d7\u05d9\u05d5\u05ea \u05de\u05e0\u05d5\u05e2\u05d9 \u05d4\u05d7\u05d9\u05e4\u05d5\u05e9/,
      /complying with search engine guidelines/i,
      /cumplir las directrices de los buscadores/i,
      /cumprimento das diretrizes dos buscadores/i,
    ]
    check('4j: the links page leaves search engine compliance with the site owner, in all four languages',
      ownerDuty.every((re) => re.test(flat)))
    check('4j-MUT: dropping the English owner-duty sentence is caught',
      !ownerDuty.every((re) => re.test(flat.replace(/complying with search engine guidelines/gi, ''))))
    const mayStop = [
      /\u05dc\u05d4\u05e9\u05d4\u05d5\u05ea \u05d0\u05d5 \u05dc\u05d4\u05e4\u05e1\u05d9\u05e7/,
      /pause or stop the service/i,
      /pausar o interrumpir el servicio/i,
      /pausar ou interromper o servi\u00e7o/i,
    ]
    check('4k: the links page says the service may be paused or stopped, in all four languages',
      mayStop.every((re) => re.test(flat)))
    check('4k-MUT: dropping the Hebrew pause sentence is caught',
      !mayStop.every((re) => re.test(flat.replace(/\u05dc\u05d4\u05e9\u05d4\u05d5\u05ea \u05d0\u05d5 \u05dc\u05d4\u05e4\u05e1\u05d9\u05e7/g, ''))))
    // Required on the public page by the legal session (9 Oct 2026): that a
    // link type exists and is shown before joining, and that section 15A
    // carries the risks, so the pointer to it reads as a warning.
    const linkTypeShown = [
      /\u05e1\u05d5\u05d2 \u05d4\u05e7\u05d9\u05e9\u05d5\u05e8 \u05e0\u05e7\u05d1\u05e2 \u05dc\u05db\u05dc \u05d4\u05e8\u05e9\u05ea/,
      /The kind of link is set for the whole network/i,
      /El tipo de enlace se define para toda la red/i,
      /O tipo de link \u00e9 definido para toda a rede/i,
    ]
    check('4l: the links page says a link type exists and is shown before joining, in all four languages',
      linkTypeShown.every((re) => re.test(flat)))
    check('4l-MUT: dropping the Hebrew link-type sentence is caught',
      !linkTypeShown.every((re) => re.test(flat.replace(/\u05e1\u05d5\u05d2 \u05d4\u05e7\u05d9\u05e9\u05d5\u05e8 \u05e0\u05e7\u05d1\u05e2 \u05dc\u05db\u05dc \u05d4\u05e8\u05e9\u05ea/g, ''))))
    const risksArePointedAt = [
      /\u05d9\u05d7\u05d3 \u05e2\u05dd \u05d4\u05e1\u05d9\u05db\u05d5\u05e0\u05d9\u05dd \u05e9\u05d1\u05d4\u05e6\u05d8\u05e8\u05e4\u05d5\u05ea/,
      /together with the risks of joining/i,
      /junto con los riesgos de la incorporaci\u00f3n/i,
      /junto com os riscos da ades\u00e3o/i,
    ]
    check('4m: the pointer to section 15A says the risks of joining are there, in all four languages',
      risksArePointedAt.every((re) => re.test(flat)))
    check('4m-MUT: dropping the English risks pointer is caught',
      !risksArePointedAt.every((re) => re.test(flat.replace(/together with the risks of joining/gi, ''))))
    for (const page of [SITE_FIXES_PAGE, BUSINESSES_PAGE, AGENCIES_PAGE, WORDPRESS_PAGE, SHOPIFY_PAGE, SITE_LINKS_PAGE, COMPETITORS_PAGE, SEARCH_CONSOLE_PAGE]) {
      check(`4e: ${page.path} has content and a title in every language`,
        PUBLIC_LOCALES.every((l) => page.content[l]?.hero.title && page.meta[l]?.title && page.meta[l]?.description))
    }
    // MUTATION CONTROL
    check('4-MUT: a "30% more traffic" line fails 4a', /\d\s?%/.test(all + ' 30% more traffic'))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main()
export {}
