/**
 * /features — THE HUB THE MENU IS NAMED AFTER.
 *
 * It answered 404 in every language while all twelve /features/* pages existed
 * and sat in the sitemap (measured 15.11.2026). What is proven here:
 *
 *   A) the route exists in every language the public site serves, and each one
 *      renders the one component with its own locale;
 *   B) the hub lists exactly the feature pages the nav menu links to — no page
 *      missing from it, and no card pointing at a page that is not there;
 *   C) its words are the menu's own in every language, and its own two lines
 *      (the subtitle and the search description) exist and are not English
 *      left in another language's file;
 *   D) the menu and the sitemap lead to it.
 *
 * Every check has a mutation control.
 *
 * Run: npx tsx lib/i18n/__qa__/features-index.qa.ts
 */
import { existsSync, readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX, type PublicLocale } from '../locales'
import { getPublicDictionary } from '../getPublicDictionary'
import { FEATURES_INDEX_COPY } from '../public/features-index'
import { FEATURE_INDEX, FEATURE_GROUP_ORDER, featuresOfGroup } from '../../marketing/feature-index'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const dirOf = (l: PublicLocale) => `app/(public)${LOCALE_PREFIX[l]}/features`

console.log('A) the route exists, in every language')
{
  for (const l of PUBLIC_LOCALES) {
    const file = `${dirOf(l)}/page.tsx`
    const there = existsSync(join(ROOT, file))
    check(`A1 (${l}): /features is a page, not a 404`, there, file)
    if (!there) continue
    const src = strip(read(file))
    check(`A2 (${l}): it renders the one hub component in its own locale`,
      new RegExp(`<FeaturesIndexPage locale="${l}" />`).test(src))
    check(`A3 (${l}): it names itself and describes itself to search engines`,
      /title:/.test(src) && /description: FEATURES_INDEX_COPY\['/.test(src)
      && new RegExp(`canonical: 'https://www\\.gotopseo\\.com${LOCALE_PREFIX[l]}/features'`).test(src))
  }
  check('A1-MUT (CONTROL): a language without the file would be caught',
    !existsSync(join(ROOT, 'app/(public)/zz/features/page.tsx')))
}

console.log('\nB) it lists exactly the feature pages that exist')
{
  const onDisk = readdirSync(join(ROOT, 'app/(public)/features'), { withFileTypes: true })
    .filter((e) => e.isDirectory()).map((e) => e.name).sort()
  const listed = FEATURE_INDEX.map((f) => f.slug).sort()
  check('B1: every feature page is on the hub, and every card has a page', JSON.stringify(onDisk) === JSON.stringify(listed),
    `disk=${onDisk.join(',')} hub=${listed.join(',')}`)
  check('B1-MUT (CONTROL): a card for a page that does not exist is caught',
    JSON.stringify(onDisk) !== JSON.stringify([...listed, 'no-such-feature'].sort()))
  // The nav menu links the same twelve: the hub cannot offer a different product.
  const nav = strip(read('components/PublicNav.tsx'))
  const navSlugs = [...nav.matchAll(/feature\('(\w+)', '([a-z0-9-]+)'/g)].map((m) => m[2]).sort()
  check('B2: the nav menu and the hub link the same pages', JSON.stringify(navSlugs) === JSON.stringify(listed),
    `nav=${navSlugs.join(',')}`)
  check('B2-MUT (CONTROL): a page in the menu and not on the hub is caught',
    JSON.stringify([...navSlugs, 'keyword-research'].sort()) !== JSON.stringify(listed))
  check('B3: every card belongs to one of the three groups, and none is empty',
    FEATURE_GROUP_ORDER.every((g) => featuresOfGroup(g).length > 0)
    && FEATURE_INDEX.every((f) => FEATURE_GROUP_ORDER.includes(f.group))
    && FEATURE_GROUP_ORDER.flatMap((g) => featuresOfGroup(g)).length === FEATURE_INDEX.length)
}

console.log('\nC) its words, in every language')
{
  const page = strip(read('components/public/FeaturesIndexPage.tsx'))
  check('C1: the cards read the menu\'s own labels, never strings of their own',
    /fm\[f\.id\]\.label/.test(page) && /fm\[f\.id\]\.description/.test(page)
    && /dict\.nav\.featureGroups\[group\]/.test(page))
  check('C1-MUT (CONTROL): a hub with its own hard-coded label is caught',
    !/fm\[f\.id\]\.label/.test(page.replace(/fm\[f\.id\]\.label/g, "'Rank tracking'")))
  for (const l of PUBLIC_LOCALES) {
    const menu = getPublicDictionary(l).nav.featuresMenu as unknown as Record<string, { label: string; description: string }>
    const missing = FEATURE_INDEX.filter((f) => !menu[f.id]?.label?.trim() || !menu[f.id]?.description?.trim()).map((f) => f.id)
    check(`C2 (${l}): every card has a label and a description in this language`, missing.length === 0, missing.join(','))
    const own = FEATURES_INDEX_COPY[l]
    check(`C3 (${l}): the hub's own subtitle and search description are written`,
      !!own?.subtitle?.trim() && !!own?.metaDescription?.trim() && own.subtitle.length > 40)
    check(`C4 (${l}): it has a name of its own in this language`, !!getPublicDictionary(l).nav.features?.trim())
  }
  // Not one language's file left holding another's text.
  const he = FEATURES_INDEX_COPY.he
  check('C5: Hebrew is Hebrew and English is English', /[֐-׿]/.test(he.subtitle)
    && !/[֐-׿]/.test(FEATURES_INDEX_COPY.en.subtitle))
  check('C5-MUT (CONTROL): English text left in the Hebrew file would be caught',
    !/[֐-׿]/.test('Everything the system does, in one place'))
  const copies = PUBLIC_LOCALES.map((l) => FEATURES_INDEX_COPY[l].subtitle)
  check('C6: no two languages share the same sentence', new Set(copies).size === copies.length)
}

console.log('\nD) it is reachable')
{
  const nav = strip(read('components/PublicNav.tsx'))
  check('D1: the features menu leads to the hub, on the desktop panel and on a phone',
    (nav.match(/data-features-all/g) ?? []).length === 2 && /href=\{`\$\{prefix\}\/features`\}/.test(nav))
  check('D1-MUT (CONTROL): a menu with no way into the hub is caught',
    !/data-features-all/.test(nav.replace(/data-features-all/g, 'data-zz')))
  const sitemap = read('app/sitemap.xml/route.ts')
  check('D2: the sitemap offers it in Hebrew, in English and in every translated tree',
    /\$\{baseUrl\}\/features`/.test(sitemap) && /\$\{baseUrl\}\/en\/features`/.test(sitemap)
    && /\{ path: '\/features', changefreq/.test(sitemap))
  check('D2-MUT (CONTROL): a sitemap that only lists the pages under it is caught',
    !/\{ path: '\/features', changefreq/.test(sitemap.replace(/\{ path: '\/features', changefreq[^\n]*\n/, '')))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
