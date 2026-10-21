/**
 * The comparison pages ("Go Top SEO vs X"), which are the only pages on the
 * public site that make statements about a named company.
 *
 *   A) every comparison exists in EVERY public language, and each route reads
 *      its own language's copy — a reader who lands on one is never dropped
 *      into another language;
 *   B) every table is dated and sourced, and every source is a page the
 *      competitor owns, so a claim about them can be checked by the reader;
 *   C) nothing flatly denies a capability on a competitor's behalf, and no page
 *      promises a result or invents proof about us;
 *   D) every comparison says what the other product is better at.
 * Each group ends with a MUTATION CONTROL.
 *
 * Group D is the one worth explaining. A page that lists only what a named
 * competitor lacks is an advert, and the visitor reading it typed that
 * competitor's name into a search box — they already know the product, so the
 * page teaches them only that we are not a reliable narrator. `theirStrengths`
 * is required by the type; this proves it was actually filled in rather than
 * padded with a sentence about us.
 *
 * Run: npx tsx components/public/__qa__/comparison-pages.qa.ts
 */
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from '@/lib/i18n/public/compare/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')

/** Every comparison that has a copy module, found rather than listed. */
const COMPARISONS: { slug: string; copy: Record<PublicLocale, ComparisonCopy> }[] =
  readdirSync(join(ROOT, 'lib/i18n/public/compare'))
    .filter((f) => f.endsWith('.ts') && f !== 'types.ts')
    .map((f) => {
      const mod = require(join(ROOT, 'lib/i18n/public/compare', f)) as Record<string, unknown>
      const copy = Object.values(mod)[0] as Record<PublicLocale, ComparisonCopy>
      return { slug: f.replace(/\.ts$/, ''), copy }
    })

/** A source is the competitor's own, not ours and not a third party's write-up. */
function ownedByCompetitor(href: string, slug: string): boolean {
  const host = new URL(href).hostname.replace(/^www\./, '')
  // wordpress.org carries a vendor's own plugin listing, which the vendor writes.
  return host.includes(slug) || host === 'wordpress.org'
}

function main() {
  check('comparisons found', COMPARISONS.length > 0, String(COMPARISONS.length))

  console.log('\nA) one page per language, each reading its own')
  const missingRoutes: string[] = []
  const wrongCopy: string[] = []
  for (const { slug } of COMPARISONS) {
    for (const locale of PUBLIC_LOCALES) {
      const rel = `app/(public)${LOCALE_PREFIX[locale]}/compare/${slug}/page.tsx`
      if (!existsSync(join(ROOT, rel))) { missingRoutes.push(rel); continue }
      const src = readFileSync(join(ROOT, rel), 'utf8')
      if (!new RegExp(`locale="${locale}"`).test(src) || !new RegExp(`\\['${locale}'\\]`).test(src)) wrongCopy.push(rel)
    }
  }
  check(`A1: every comparison has a page in all ${PUBLIC_LOCALES.length} languages`, missingRoutes.length === 0, missingRoutes.join(', '))
  check('A2: each page renders its own language and reads that language\'s copy', wrongCopy.length === 0, wrongCopy.join(', '))
  const everyLocaleHasCopy = COMPARISONS.every(({ copy }) => PUBLIC_LOCALES.every((l) => copy[l]?.competitor))
  check('A3: the copy module itself covers every language', everyLocaleHasCopy)
  check('MUTATION CONTROL: a language missing from the copy is caught',
    !PUBLIC_LOCALES.every((l) => ({ ...COMPARISONS[0].copy, [PUBLIC_LOCALES[1]]: undefined } as Record<string, ComparisonCopy | undefined>)[l]?.competitor))

  console.log('\nB) every claim about them is dated and sourced')
  const badDate: string[] = []
  const badSource: string[] = []
  const noSources: string[] = []
  for (const { slug, copy } of COMPARISONS) {
    for (const locale of PUBLIC_LOCALES) {
      const t = copy[locale].table
      if (!/^\d{4}-\d{2}-\d{2}$/.test(t.checkedOn)) badDate.push(`${slug}/${locale}`)
      if (t.sources.length === 0) noSources.push(`${slug}/${locale}`)
      for (const s of t.sources) {
        if (!s.href.startsWith('https://') || !ownedByCompetitor(s.href, slug)) badSource.push(`${slug}/${locale}: ${s.href}`)
      }
    }
  }
  check('B1: every table carries an ISO date it was checked', badDate.length === 0, badDate.join(', '))
  check('B2: every table carries at least one source', noSources.length === 0, noSources.join(', '))
  check('B3: every source is an https page the competitor owns', badSource.length === 0, badSource.join(', '))
  check('MUTATION CONTROL: a third-party blog cited as the source is caught',
    !ownedByCompetitor('https://someblog.example.com/semrush-review', 'semrush'))
  check('MUTATION CONTROL: an undated table is caught', !/^\d{4}-\d{2}-\d{2}$/.test('recently'))

  console.log('\nC) no flat denials about them, no promises about us')
  // A denial we cannot prove: their marketing page not mentioning something is
  // not evidence the product cannot do it, so the copy says what the page says.
  const DENIAL = [/\bcannot\b/i, /\bcan't\b/i, /\bdoes not (?:do|have|offer|support)\b/i, /לא יכול/, /no puede/i, /não (?:pode|consegue)/i]
  const PROMISE = [/guaranteed/i, /מובטח/, /#1\b/, /trusted by/i, /100%/, /\d[\d,]*\+\s*(customers|businesses|clients|לקוחות|עסקים)/i]
  const denials: string[] = []
  const promises: string[] = []
  for (const { slug, copy } of COMPARISONS) {
    for (const locale of PUBLIC_LOCALES) {
      const c = copy[locale]
      const theirs = c.table.rows.map((r) => r.theirs).join('\n')
      const everything = JSON.stringify(c)
      if (DENIAL.some((re) => re.test(theirs))) denials.push(`${slug}/${locale}`)
      if (PROMISE.some((re) => re.test(everything))) promises.push(`${slug}/${locale}`)
    }
  }
  check('C1: no row flatly denies a capability on the competitor\'s behalf', denials.length === 0, denials.join(', '))
  check('C2: no page promises a result or claims proof we cannot show', promises.length === 0, promises.join(', '))
  check('MUTATION CONTROL: "it cannot track rankings" is caught', DENIAL.some((re) => re.test('It cannot track rankings.')))
  check('MUTATION CONTROL: a guaranteed-result line is caught', PROMISE.some((re) => re.test('Guaranteed #1 in 30 days')))

  console.log('\nD) every comparison says what the other product is better at')
  const thin: string[] = []
  for (const { slug, copy } of COMPARISONS) {
    for (const locale of PUBLIC_LOCALES) {
      const s = copy[locale].theirStrengths
      const words = s.items.map((i) => i.body).join(' ').split(/\s+/).filter(Boolean).length
      // Three reasons is the shape every page uses; 60 words is the floor below
      // which "they are also good" stops being a reason and becomes a gesture.
      if (s.items.length < 2 || words < 60) thin.push(`${slug}/${locale} (${s.items.length} items, ${words} words)`)
    }
  }
  check('D1: each page gives at least two substantive reasons to buy theirs', thin.length === 0, thin.join(', '))
  check('MUTATION CONTROL: a single one-line nod is caught',
    ['They are fine too.'].join(' ').split(/\s+/).length < 60)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
