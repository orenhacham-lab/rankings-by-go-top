/**
 * The public menus (owner, 5 Oct 2026, after the competitor's mega-menu):
 * features in three groups and a "who it's for" menu.
 *
 *   1. every internal menu item has a real page in EVERY language tree, derived
 *      from the menu source (never a hand-written list), plus the XML and HTML
 *      sitemaps;
 *   2. Shopify is never a page of ours and never a hard-coded store URL: the
 *      item exists only through SHOPIFY_APP_STORE_URL, opens in a new tab, and
 *      is left out while that constant is null;
 *   3. the menu words exist, non-empty, in all four dictionaries;
 *   4. the new pages promise nothing the code cannot keep: no percentages, no
 *      ROI, no WordPress.org listing (the plugin is not approved yet).
 * Each group has a mutation control.
 *
 * Run: npx tsx components/public/__qa__/public-nav-menus.qa.ts
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'
import { SHOPIFY_APP_STORE_URL } from '@/lib/shopify/app-store-listing'
import { SITE_FIXES_PAGE } from '@/lib/i18n/public/pages/site-fixes'
import { AGENCIES_PAGE, BUSINESSES_PAGE, WORDPRESS_PAGE } from '@/lib/i18n/public/pages/solutions'

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
    check('1b: seven features and three solution pages are read from the menu', paths.length === 10, JSON.stringify(paths))
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
    for (const page of [SITE_FIXES_PAGE, BUSINESSES_PAGE, AGENCIES_PAGE, WORDPRESS_PAGE]) {
      check(`1f: ${page.path} is a menu path`, paths.includes(page.path))
    }
    // MUTATION CONTROL
    check('1-MUT: a menu pointing at a page that does not exist is caught',
      !existsSync(pageFile('', '/solutions/nope')) && menuPaths("feature('x', 'nope-page'").length === 1)
  }

  console.log('\n2) Shopify goes only to the App Store listing')
  {
    check('2a: the menu has no store URL of its own', !/apps\.shopify\.com/.test(nav))
    check('2b: the Shopify item exists only through SHOPIFY_APP_STORE_URL', /SHOPIFY_APP_STORE_URL\s*\?/.test(nav) && /href: SHOPIFY_APP_STORE_URL/.test(nav))
    check('2c: …and opens it in a new tab, nofollow, without the referrer', /target="_blank" rel="nofollow noopener noreferrer"/.test(nav) && /item\.external/.test(nav))
    check('2d: there is no Shopify page of ours', PUBLIC_LOCALES.every((l) => !existsSync(pageFile(LOCALE_PREFIX[l], '/solutions/shopify'))))
    check('2e: the constant is null or an App Store listing', SHOPIFY_APP_STORE_URL === null || /^https:\/\/apps\.shopify\.com\/[a-z0-9-]+\/?$/.test(SHOPIFY_APP_STORE_URL))
    // MUTATION CONTROL
    const mutated = nav.replace('href: SHOPIFY_APP_STORE_URL', "href: 'https://apps.shopify.com/x'")
    check('2-MUT: a hard-coded store URL fails 2a', /apps\.shopify\.com/.test(mutated))
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
    const sources = ['lib/i18n/public/pages/site-fixes.tsx', 'lib/i18n/public/pages/solutions.tsx'].map((f) => strip(read(f)))
    const all = sources.join('\n')
    check('4a: no percentage claims', !/\d\s?%/.test(all))
    check('4b: no ROI claims', !/\bROI\b/.test(all))
    check('4c: no WordPress.org listing before the plugin is approved', !/wordpress\.org/i.test(all))
    check('4d: no Shopify App Store URL in page copy', !/apps\.shopify\.com/.test(all))
    for (const page of [SITE_FIXES_PAGE, BUSINESSES_PAGE, AGENCIES_PAGE, WORDPRESS_PAGE]) {
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
