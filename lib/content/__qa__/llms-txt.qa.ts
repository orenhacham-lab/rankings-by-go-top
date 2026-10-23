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
import { readFileSync, existsSync } from 'fs'
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

// E) One copy only.
check('E1: the stale static copy is gone', !existsSync(join(ROOT, 'public/llms.txt')))

// M) Mutation controls.
const OLD_BODY = `
# Contact Information
Contact: oren@gotop.co.il
Phone: 054-9489377
`
check('M1 (control): the phone guard catches the body that used to be served', PHONE.test(OLD_BODY))
check('M1a (control): so does the agency-domain guard', /gotop\.co\.il/.test(OLD_BODY))
check('M2 (control): the crawl-directive guard catches a robots.txt body', /User-agent:|Disallow:/.test('User-agent: *\nDisallow: /admin'))

console.log(`\n${pass} passed, ${fail} failed\n`)
if (fail) process.exit(1)

export {}
