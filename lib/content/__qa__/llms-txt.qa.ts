/**
 * /llms.txt — the file an AI assistant reads before it answers about us.
 *
 * BEFORE (until 23 Oct 2026): the route served a second robots.txt, with
 * `User-agent: *`, Allow and Disallow lines. Nothing parses llms.txt that way,
 * and /robots.txt already carried the same rules. The body also published the
 * agency's email and a personal mobile number, called the product a rank
 * tracker, carried the former name, and declared `Language: he` months after
 * the site went live in five languages. A second, equally stale copy sat in
 * `public/llms.txt`.
 *
 * AFTER: a Markdown file in the shape the convention describes — an H1, one
 * blockquote that says what the product is, then sections of links. One copy,
 * served by the route.
 *
 * MUTATION CONTROL: each guard names the edit that breaks it, and M1 re-runs
 * the contact-detail guard against the body that used to be published.
 *
 *   npx tsx lib/content/__qa__/llms-txt.qa.ts
 */
import { readFileSync, existsSync, readdirSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES } from '@/lib/i18n/locales'

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const stripComments = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  ✓ ${name}`) }
  else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROUTE = 'app/llms.txt/route.ts'
const source = stripComments(read(ROUTE))

console.log('\n/llms.txt\n')

// A) It is Markdown, not a second robots.txt.
check('A1: the body opens with the product as an H1', /'# Go Top SEO'/.test(source))
check('A2: there is a blockquote summary, which is what the convention reads first', /'>\s/.test(source))
check('A3: it is served as Markdown', /text\/markdown/.test(source))
// Breaks if anyone reintroduces crawl rules here: /robots.txt owns those.
check('A4: no crawl directives — those belong to robots.txt', !/User-agent:|Disallow:|Crawl-delay:/.test(source))

// B) Nothing published here may be a personal or agency contact detail.
/** An Israeli mobile, however it is punctuated. */
const PHONE = /0\s*5\d[\s-]?\d{3}[\s-]?\d{4}/
check('B1: no phone number is published', !PHONE.test(source))
check('B2: the agency\'s domain is not given as the product\'s contact', !/gotop\.co\.il/.test(source))
check('B3: the outreach mailbox is not published either', !/trygotopseo/.test(source))

// C) The truth limits the blog is held to apply here too.
check('C1: Perplexity is not named — it is not part of the automatic check', !/perplexity/i.test(source))
check('C2: the automatic scan is described as monthly', /once a month|monthly/i.test(source))
check('C3: the trial is described as taking no card', /no card/i.test(source))
check('C4: no percentage claim', !/\b\d{1,3}\s?%/.test(source))
// Breaks if someone writes "trusted by 400 businesses" into the summary.
check('C5: no customer count', !/\b\d{2,}\s+(customers|businesses|clients|users)\b/i.test(source))

// D) Five languages, derived from PUBLIC_LOCALES so a sixth cannot ship silently.
check(
  'D1: every public locale has a heading of its own',
  PUBLIC_LOCALES.every((l) => new RegExp(`'?${l}'?:\\s*'Articles in`).test(source)),
  PUBLIC_LOCALES.join(','),
)
check(
  'D2: every public locale is in the order the sections are written in',
  PUBLIC_LOCALES.every((l) => new RegExp(`LOCALE_ORDER[\\s\\S]*?'${l}'`).test(source)),
)
check('D3: the article prefix comes from the row\'s own locale', /LOCALE_PREFIX\[locale\]/.test(source))
// D4/D5. The blockquote says which languages the product runs in. Typed out by
// hand, that sentence lies in both directions: it names a language whose build
// flag is still off, and it omits one the day the flag is turned on — to every
// assistant that reads this file. So it is BUILT from enabledPublicLocales(),
// and every public locale must have an English name to be built from.
check(
  'D4: the languages sentence is derived from the live locales, not typed out',
  /It runs in \$\{languageSentence\(\)\}/.test(source) && /enabledPublicLocales\(\)/.test(source),
)
check(
  'D5: every public locale has an English name for that sentence',
  PUBLIC_LOCALES.every((l) => new RegExp(`'?${l}'?:\\s*'[A-Z]`).test(source.split('LOCALE_HEADING')[0])),
  PUBLIC_LOCALES.join(','),
)

// E) One copy only.
check('E1: the stale static copy is gone', !existsSync(join(ROOT, 'public/llms.txt')))

// F) The comparison list cannot drift from the pages that exist.
//
// This file is read by assistants answering "how does it compare to X". A
// comparison page that exists and is not listed is a page no assistant knows
// about; a listed path with no page is a 404 we handed them. Both are caught
// against the directory on disk rather than against a second list here.
{
  const listed = [...source.matchAll(/'(\/compare\/[a-z0-9-]+)'/g)].map((m) => m[1]).sort()
  const onDisk = readdirSync(join(ROOT, 'app/(public)/compare'), { withFileTypes: true })
    .filter((e) => e.isDirectory())
    .map((e) => `/compare/${e.name}`)
    .sort()
  check(`F1: every comparison page on disk is listed (${onDisk.length} pages)`,
    JSON.stringify(listed) === JSON.stringify(onDisk), `listed ${listed.join(', ')}`)
  for (const path of listed) {
    check(`F2: ${path} really has a page`, existsSync(join(ROOT, 'app/(public)', path, 'page.tsx')))
  }
  // MUTATION CONTROL: the three pages that were missing until 09.11.2026 are
  // exactly what a count-blind check would have let through.
  check('F1-MUT: a list missing a page on disk is caught',
    JSON.stringify(['/compare/semrush']) !== JSON.stringify(onDisk))
}

// G) The open data is in the file, and the caveat travels with the figure.
//
// The two public datasets are the likeliest thing here to be quoted back by an
// assistant, and the measurement is the one that can mislead: it is large,
// high-ranked sites. So the file must carry the measurement's own limitation
// sentence, read from the constant rather than retyped where it can be
// softened or go stale.
{
  check('G1: the crawler dataset endpoint is named', source.includes('/api/public/ai-crawlers'))
  check('G2: the measurement endpoint is named', source.includes('/api/public/ai-crawler-blocking'))
  check('G3: the OpenAPI description is named', source.includes('/api/public/ai-crawlers/openapi'))
  check('G4: the caveat is read from the measurement, not retyped',
    source.includes('BLOCKING_MEASUREMENT.limitations[0]') && !/small business/i.test(source))
  check('G5: the n and the markets come from the measurement too',
    source.includes('BLOCKING_MEASUREMENT.method.robotsFilesRead') &&
      source.includes('BLOCKING_MEASUREMENT.method.markets.length') &&
      source.includes('BLOCKING_MEASUREMENT.method.domainsRequested'))
  check('G6: the licence is read from the dataset module, not retyped',
    source.includes('AI_CRAWLER_DATASET_LICENSE.id') && !source.includes('CC-BY-4.0'))
  check('G7: no figure is typed into the section', !/\b\d{2,3}(\.\d)?\s?%/.test(source))
  // MUTATION CONTROL for G4: a line that quotes the figure and drops the
  // sentence bounding it is what this guard exists to stop.
  const softened = 'Two thirds of sites block an AI crawler that brings visitors.'
  check('G4-MUT: a line with the figure and no caveat would fail G4',
    !softened.includes('BLOCKING_MEASUREMENT.limitations[0]'))
}

// M) Mutation controls.
const OLD_BODY = `
# Contact Information
Contact: oren@gotop.co.il
Phone: 054-9489377
`
check('M1 (control): the phone guard catches the body that used to be served', PHONE.test(OLD_BODY))
check('M1a (control): so does the agency-domain guard', /gotop\.co\.il/.test(OLD_BODY))
check('M2 (control): the crawl-directive guard catches a robots.txt body', /User-agent:|Disallow:/.test('User-agent: *\nDisallow: /admin'))
// The sentence D4 asks for is derived; this is the hand-typed sentence it
// replaced, and the guard has to reject it or D4 is measuring nothing.
check(
  'M3 (control): D4 rejects a hand-typed list of languages',
  !/It runs in \$\{languageSentence\(\)\}/.test("'It runs in Hebrew, English, Spanish, Brazilian Portuguese, French and Italian, and there is'"),
)

console.log(`\n${pass} passed, ${fail} failed\n`)
if (fail) process.exit(1)

export {}
