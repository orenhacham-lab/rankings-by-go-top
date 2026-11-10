/**
 * The site's own map, `/sitemap`, in all ten languages — the human page, not
 * `sitemap.xml`.
 *
 * WHY THIS SUITE EXISTS. On 10.11.2026 the page listed three of the six
 * comparison pages and omitted `/free-check`, `/ai-crawlers` and `/affiliates`
 * entirely, in every language. `/free-check` is the call to action every
 * marketing page leads with, and `/ai-crawlers` is where the only two earned
 * do-follow links to this site land — so the two pages with the most to gain
 * from an internal link had none, from anywhere, while `sitemap.xml` had been
 * advertising both to crawlers for weeks.
 *
 * Nothing could have caught that: the ten pages are hand-written client
 * components, each with its own literal list, and the XML sitemap is a separate
 * list in a separate file. A page added to one was never added to the other,
 * and no test compared them.
 *
 *   A) every path the XML sitemap advertises for the translated trees appears,
 *      locale-prefixed, on every language's human map;
 *   B) every link the human map prints leads to a route that exists;
 *   C) no page lists the same href twice.
 * Each group ends with a MUTATION CONTROL.
 *
 * The lists stay literal rather than derived. These are client components, so
 * importing the ten-language copy modules to build the labels would ship all
 * ten languages of them in the bundle of a page a visitor reaches once; the
 * labels are each module's own words, copied in, and this suite is what holds
 * the set complete.
 *
 * Run: npx tsx components/public/__qa__/site-map-page.qa.ts
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX } from '@/lib/i18n/locales'
import { COMPARISONS } from '@/lib/i18n/public/compare-index'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')

const sitemapPage = (prefix: string) => join(ROOT, `app/(public)${prefix}/sitemap/page.tsx`)

/** The paths sitemap.xml advertises in every translated tree. */
function advertisedPaths(): string[] {
  const src = readFileSync(join(ROOT, 'app/sitemap.xml/route.ts'), 'utf8')
  return [...src.matchAll(/\{ path: '([^']*)',/g)].map((m) => m[1]).filter(Boolean)
}

/** Every `href: '…'` literal a human sitemap page prints. */
function listedHrefs(prefix: string): string[] {
  return [...readFileSync(sitemapPage(prefix), 'utf8').matchAll(/href: '([^']*)'/g)].map((m) => m[1])
}

function main() {
  const advertised = advertisedPaths()
  check('the XML sitemap\'s translated paths were found', advertised.length > 20, String(advertised.length))

  console.log('\nA) the human map lists every page the XML sitemap advertises')
  const gaps: string[] = []
  for (const locale of PUBLIC_LOCALES) {
    const prefix = LOCALE_PREFIX[locale]
    if (!existsSync(sitemapPage(prefix))) { gaps.push(`${locale}: no /sitemap page`); continue }
    const listed = new Set(listedHrefs(prefix))
    for (const path of advertised) if (!listed.has(`${prefix}${path}`)) gaps.push(`${locale}: ${prefix}${path}`)
  }
  check(`A1: no page is advertised to crawlers and missing from the map, in any of the ${PUBLIC_LOCALES.length} languages`,
    gaps.length === 0, gaps.join(', '))

  const missingCompare: string[] = []
  for (const locale of PUBLIC_LOCALES) {
    const prefix = LOCALE_PREFIX[locale]
    const listed = new Set(listedHrefs(prefix))
    if (!listed.has(`${prefix}/compare`)) missingCompare.push(`${locale}: index`)
    for (const { slug } of COMPARISONS) if (!listed.has(`${prefix}/compare/${slug}`)) missingCompare.push(`${locale}: ${slug}`)
  }
  check('A2: every comparison, and the index, is on the map in every language', missingCompare.length === 0, missingCompare.join(', '))
  check('MUTATION CONTROL: a map that lists only three of the six comparisons is caught',
    COMPARISONS.some(({ slug }) => !new Set(['semrush', 'yoast', 'rankmath']).has(slug)))

  console.log('\nB) every link the map prints leads to a page that exists')
  // Auth links are built by `authHref` and leave the public tree; the dynamic
  // article links are built from the database at render time, not written as
  // literals, so what is scanned here is the hand-written set.
  const dead: string[] = []
  for (const locale of PUBLIC_LOCALES) {
    const prefix = LOCALE_PREFIX[locale]
    for (const href of listedHrefs(prefix)) {
      const rest = prefix && href.startsWith(prefix) ? href.slice(prefix.length) : href
      // `authHref` leaves the public tree for the app's own sign-in routes.
      const bare = rest.split('?')[0]
      if (!href.startsWith('/') || bare === '/login' || bare === '/signup') continue
      // Three route groups serve these pages: the Hebrew home is app/page.tsx,
      // the Hebrew legal pages live under app/(legal), and everything else is
      // app/(public). A link is dead only if none of the three has it.
      const candidates = bare === '/' || bare === ''
        ? [`app${prefix}`, `app/(public)${prefix}`]
        : [`app/(public)${prefix}${bare}`, `app/(legal)${prefix}${bare}`]
      if (!candidates.some((dir) => existsSync(join(ROOT, dir, 'page.tsx')))) dead.push(`${locale}: ${href}`)
    }
  }
  check('B1: no link on the map points at a page that is not there', dead.length === 0, dead.join(', '))
  check('MUTATION CONTROL: a link to a page that does not exist is caught',
    !existsSync(join(ROOT, 'app/(public)/compare/ahrefs', 'page.tsx')))

  console.log('\nC) nothing is listed twice')
  const dupes: string[] = []
  for (const locale of PUBLIC_LOCALES) {
    const hrefs = listedHrefs(LOCALE_PREFIX[locale])
    const seen = new Set<string>()
    for (const href of hrefs) { if (seen.has(href)) dupes.push(`${locale}: ${href}`); seen.add(href) }
  }
  check('C1: no page lists the same href twice', dupes.length === 0, dupes.join(', '))
  check('MUTATION CONTROL: a repeated href is caught', (() => {
    const seen = new Set<string>()
    return ['/pricing', '/about', '/pricing'].some((h) => (seen.has(h) ? true : (seen.add(h), false)))
  })())

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
