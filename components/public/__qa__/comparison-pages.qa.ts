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
 *   D) every comparison says what the other product is better at;
 *   E) no outbound link a comparison page renders is dofollow, and no copy
 *      module smuggles a competitor URL in beside the sourced ones.
 * Each group ends with a MUTATION CONTROL.
 *
 * Group E is the one that pins a promise made to the owner rather than a
 * property of the copy. These pages are the only ones on the site that link OUT
 * to a named competitor, and they were approved to go live on the condition
 * that those links pass no ranking signal to them: every source link is
 * rendered `rel="nofollow noopener noreferrer"` and opens in a new tab. Nothing
 * in the type system says so, so a refactor of `ComparisonTable` — or a new
 * anchor added to `ComparisonPage` — could turn six dofollow links to
 * competitors on without a single test going red. E1 reads the components
 * themselves and requires `nofollow` on every anchor they render. E3 closes the
 * other door: a URL pasted into a hero, a table cell or an FAQ answer would be
 * rendered as text today, but it is the raw material of a link and it bypasses
 * the dated `sources` list that makes a claim about a competitor checkable, so
 * a URL is allowed in `table.sources` and nowhere else. A bare hostname in
 * prose is NOT a URL and stays allowed — `/compare/surfer` has to be able to
 * say that surferseo.com now redirects to surfer.ai.
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
/* eslint-disable @typescript-eslint/no-require-imports */
import { readdirSync, existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES, LOCALE_PREFIX, type PublicLocale } from '@/lib/i18n/locales'
import type { ComparisonCopy } from '@/lib/i18n/public/compare/types'
import { wordCount, maxPhraseWords } from '@/lib/text/segment'

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
      const body = s.items.map((i) => i.body).join(' ')
      // COUNTED THROUGH THE SEGMENTER, not by splitting on spaces. Japanese is
      // written without word spaces, so a space split reads 「検索順位の計測が
      // 得意です」 as one word and reported the Japanese pages as three-word
      // gestures while they were the longest copy on the site. `wordCount`
      // whitespace-splits a spaced language and ICU-segments Japanese, and
      // `maxPhraseWords` restates the floor in the units THIS text is measured
      // in — a segmented Japanese text yields about 1.7 tokens per spaced word.
      const words = wordCount(body)
      // Three reasons is the shape every page uses; 60 words is the floor below
      // which "they are also good" stops being a reason and becomes a gesture.
      if (s.items.length < 2 || words < maxPhraseWords(body, 60)) thin.push(`${slug}/${locale} (${s.items.length} items, ${words} words)`)
    }
  }
  check('D1: each page gives at least two substantive reasons to buy theirs', thin.length === 0, thin.join(', '))
  check('MUTATION CONTROL: a single one-line nod is caught',
    wordCount('They are fine too.') < maxPhraseWords('They are fine too.', 60))
  // The same control in Japanese: a one-line nod must still be caught, which is
  // what proves the scaled floor did not simply switch the check off for ja.
  check('MUTATION CONTROL: a one-line Japanese nod is caught',
    wordCount('こちらも良い製品です。') < maxPhraseWords('こちらも良い製品です。', 60))

  console.log('\nE) no outbound link is dofollow, and no URL hides in the copy')
  // Source guards strip comments first: a `nofollow` named in a comment is a
  // note about the code, not the code.
  const stripComments = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')
  /** The attributes of every `<a …>` a file opens. */
  const anchors = (src: string) => [...stripComments(src).matchAll(/<a\b([^>]*)>/g)].map((m) => m[1])
  const hasNofollow = (attrs: string) => /rel=\{?["'][^"']*\bnofollow\b/.test(attrs)
  const COMPONENTS = ['components/public/ComparisonTable.tsx', 'components/public/ComparisonPage.tsx']
  const followed: string[] = []
  for (const rel of COMPONENTS) {
    const src = readFileSync(join(ROOT, rel), 'utf8')
    for (const attrs of anchors(src)) if (!hasNofollow(attrs)) followed.push(`${rel}: <a${attrs.trim().slice(0, 60)}>`)
  }
  check('E1: every <a> a comparison component renders is rel="nofollow"', followed.length === 0, followed.join(' | '))
  const tableSrc = stripComments(readFileSync(join(ROOT, 'components/public/ComparisonTable.tsx'), 'utf8'))
  check('E2: the source links also carry noopener noreferrer and open in a new tab',
    /rel="nofollow noopener noreferrer"/.test(tableSrc) && /target="_blank"/.test(tableSrc))
  // A scheme, or a bare `www.` host. NOT a hostname in prose: saying that
  // surferseo.com redirects to surfer.ai is a dated fact about a competitor,
  // and it is not a link.
  const URLISH = /https?:\/\/|\bwww\.[a-z0-9-]+\.[a-z]{2,}/i
  const inlineUrls: string[] = []
  for (const { slug, copy } of COMPARISONS) {
    for (const locale of PUBLIC_LOCALES) {
      const c = copy[locale]
      const exceptSources = JSON.stringify({ ...c, table: { ...c.table, sources: [] } })
      if (URLISH.test(exceptSources)) inlineUrls.push(`${slug}/${locale}`)
    }
  }
  check('E3: a URL appears only in `table.sources`, never loose in the copy', inlineUrls.length === 0, inlineUrls.join(', '))
  check('MUTATION CONTROL: an anchor that lost nofollow is caught, and the real one is not',
    anchors('<a href={s.href} rel="noopener noreferrer" target="_blank">').every((a) => !hasNofollow(a))
    && anchors('<a href={s.href} rel="nofollow noopener noreferrer" target="_blank">').every(hasNofollow))
  check('MUTATION CONTROL: a nofollow named only in a comment does not count',
    anchors('/* rel="nofollow" is required */\n<a href="https://surfer.ai/" target="_blank">').every((a) => !hasNofollow(a)))
  check('MUTATION CONTROL: ComparisonTable with nofollow deleted fails E1',
    anchors(tableSrc.replace('rel="nofollow noopener noreferrer"', 'rel="noopener noreferrer"')).some((a) => !hasNofollow(a)))
  check('MUTATION CONTROL: a URL pasted into an FAQ answer is caught, and a bare hostname is not',
    URLISH.test(JSON.stringify({ faq: { items: [{ q: 'Where?', a: 'See https://surfer.ai/pricing/ for the list.' }] } }))
    && URLISH.test(JSON.stringify({ hero: { subtitle: 'Read more at www.brightlocal.com today.' } }))
    && !URLISH.test(JSON.stringify({ faq: { items: [{ q: 'Same product?', a: 'Yes — surferseo.com redirects to surfer.ai.' }] } })))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()

export {}
