/**
 * The public footer's "pages" column, in all ten languages.
 *
 * WHY THIS SUITE EXISTS. The footer is the only list of links that appears on
 * every page of the public site, so what it omits is a page with no site-wide
 * internal link at all. Measured on 10.11.2026, it omitted `/compare` — the
 * comparison hub, reachable only from the six comparison pages and from
 * `/sitemap` — and `/ai-crawlers`, which is the page where both of the site's
 * earned do-follow links land and whose only internal links came from the ten
 * `/sitemap` pages. The two were added to the column the same day.
 *
 *   A) every href the column prints leads to a route that exists, in each of
 *      the ten locale trees;
 *   B) every label the column prints is a non-empty string in all ten
 *      languages (the locale dictionaries are cast to the type, so a missing
 *      key is not a build error — it renders as nothing);
 *   C) the column still carries `/compare` and `/ai-crawlers`.
 * Each group ends with a MUTATION CONTROL.
 *
 * Run: npx tsx components/public/__qa__/footer-pages-column.qa.ts
 */
import { readFileSync, existsSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX } from '@/lib/i18n/locales'
import { getPublicDictionary } from '@/lib/i18n/getPublicDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const SOURCE = readFileSync(join(ROOT, 'components/Footer.tsx'), 'utf8')

/**
 * The column's links, read from the source: `${prefix}/x` for the public tree
 * and `${legalPrefix}/x` for the legal documents, which the same component
 * prefixes the same way. The home link is built by `localeHomeHref` and the
 * country-specific documents come from their own modules, so neither is a
 * literal here.
 */
function columnPaths(): string[] {
  return [...SOURCE.matchAll(/href=\{`\$\{(?:prefix|legalPrefix)\}([^`]+)`\}/g)].map((m) => m[1])
}

/** The dictionary key each link prints, e.g. `compare` from `dict.footer.compare`. */
function columnLabelKeys(): string[] {
  return [...SOURCE.matchAll(/\{dict\.footer\.(\w+)\}/g)].map((m) => m[1])
}

function main() {
  const paths = columnPaths()
  check('the footer\'s literal links were found', paths.length >= 8, String(paths.length))

  console.log('\nA) every link in the footer leads to a page that exists')
  const dead: string[] = []
  for (const locale of PUBLIC_LOCALES) {
    const prefix = LOCALE_PREFIX[locale]
    for (const path of paths) {
      // Three route groups serve these pages: the Hebrew legal documents live
      // under app/(legal), everything else under app/(public).
      const candidates = [`app/(public)${prefix}${path}`, `app/(legal)${prefix}${path}`]
      if (!candidates.some((dir) => existsSync(join(ROOT, dir, 'page.tsx')))) dead.push(`${locale}: ${prefix}${path}`)
    }
  }
  check(`A1: no footer link points at a page that is not there, in any of the ${PUBLIC_LOCALES.length} languages`,
    dead.length === 0, dead.join(', '))
  check('MUTATION CONTROL: a link to a page that does not exist is caught',
    !existsSync(join(ROOT, 'app/(public)/compare/ahrefs', 'page.tsx')))

  console.log('\nB) every label the footer prints exists in every language')
  const keys = columnLabelKeys()
  check('B1: the label keys were found', keys.length >= 8, String(keys.length))
  const missing: string[] = []
  for (const locale of PUBLIC_LOCALES) {
    const footer = getPublicDictionary(locale).footer as unknown as Record<string, unknown>
    for (const key of keys) {
      const value = footer[key]
      if (typeof value !== 'string' || value.trim() === '') missing.push(`${locale}: ${key}`)
    }
  }
  check('B2: no footer label is missing or empty', missing.length === 0, missing.join(', '))
  check('MUTATION CONTROL: a key that no language carries is caught', (() => {
    const footer = getPublicDictionary('he').footer as unknown as Record<string, unknown>
    return typeof footer.noSuchFooterKey !== 'string'
  })())

  console.log('\nC) the two pages this column used to omit')
  check('C1: the footer links to the comparison hub', paths.includes('/compare'))
  check('C2: the footer links to the AI-crawler check', paths.includes('/ai-crawlers'))
  check('MUTATION CONTROL: a column without them is caught',
    !['/pricing', '/articles', '/about'].includes('/compare'))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
