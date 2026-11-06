/**
 * THE AFFILIATE RECRUITMENT PAGE — /go/<platform>/jv.
 *
 * What this suite is for. The page is read by strangers who then write to
 * their own lists in our name, so two classes of mistake on it are expensive
 * in a way an ordinary marketing page's are not:
 *
 *   1. A NUMBER WE DO NOT OWN. The commission rate lives in the platform's
 *      seller account. A rate written into this repository would keep saying
 *      35% while the account paid 25%, which is a misstatement about
 *      somebody's income published on our domain. So the page may read it
 *      from configuration only, and configuration must refuse anything that
 *      is not a whole 1-100.
 *   2. A CLAIM AN AFFILIATE WILL REPEAT. The swipe copy is sent as it
 *      stands. A promise of a ranking, an earnings figure, an invented
 *      customer count or the free trial this channel deliberately does not
 *      sell would all become claims attached to the product, and the
 *      platform's compliance reads them as ours.
 *
 * It also holds the two structural properties the page shares with the sales
 * page beside it: noindex, and English by route rather than by a mechanism
 * of its own.
 *
 * MUTATION CONTROLS throughout: every guard is re-run against a broken
 * version of the thing it protects and must fail there.
 *
 * Run: npx tsx lib/marketplace/__qa__/jv-page.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  marketplaceAffiliateUrl,
  marketplaceCommission,
} from '../config'
import { routePublicLocale } from '../../i18n/request-locale'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const PAGE = 'app/go/[platform]/jv/page.tsx'
const raw = readFileSync(join(ROOT, PAGE), 'utf8')

/** Comments are stripped before any match: this file's prose names the bugs. */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

const src = strip(raw)

const FIRST = 'MARKETPLACE_JVZOO_COMMISSION_FIRST'
const REBILL = 'MARKETPLACE_JVZOO_COMMISSION_REBILL'
const AFFILIATE = 'MARKETPLACE_JVZOO_AFFILIATE_URL_REGULAR'

function clearEnv() {
  delete process.env[FIRST]
  delete process.env[REBILL]
  delete process.env[AFFILIATE]
}

console.log('A) the commission rate comes from the account, never from this repository')
{
  clearEnv()
  check('A1: an unconfigured provider has no commission at all',
    marketplaceCommission('jvzoo') === null)

  process.env[FIRST] = '35'
  check('A2: a configured first-payment rate is read, with no renewal rate invented',
    marketplaceCommission('jvzoo')?.first === 35
    && marketplaceCommission('jvzoo')?.rebill === null)

  process.env[REBILL] = '30'
  check('A3: and the renewal rate is read when it is set',
    marketplaceCommission('jvzoo')?.rebill === 30)

  // Everything a misconfiguration looks like is silence, not a printed lie.
  for (const bad of ['0', '101', '140', '35.5', 'thirty-five', '', ' ', '-35', '03five']) {
    process.env[FIRST] = bad
    check(`A4: ${JSON.stringify(bad)} is not a rate and prints nothing`,
      marketplaceCommission('jvzoo') === null)
  }

  process.env[FIRST] = '35'
  process.env[REBILL] = '0'
  check('A5: a bad renewal rate drops that rate and keeps the valid one',
    marketplaceCommission('jvzoo')?.first === 35
    && marketplaceCommission('jvzoo')?.rebill === null)

  check('A6: an unregistered platform has no commission', marketplaceCommission('nope') === null)

  // The page must not carry a rate of its own beside the configured one.
  check('A7: the page writes no percentage literal into its own markup',
    !/\d{1,3}\s*%/.test(src), (src.match(/.{0,40}\d{1,3}\s*%.{0,40}/) || [])[0])
  check('A8: and it reads the rate through marketplaceCommission',
    /marketplaceCommission\(provider\.slug\)/.test(src))

  clearEnv()
}

console.log('\nB) MUTATION CONTROLS for A')
{
  check('B1: a rate hard-coded in the page would fail A7',
    /\d{1,3}\s*%/.test('Commission: 35% on the first payment'))
  check('B2: a validator that accepted any string would fail A4',
    ((raw2: string) => raw2.length > 0)('thirty-five'))
  check('B3: A1 would fail if an unset variable fell back to a default',
    (() => {
      const fallback = (v: string | undefined) => (v ?? '35')
      return fallback(process.env[FIRST]) === '35'
    })())
  check('B4: A7 is not vacuous — it matches a percentage wherever one appears',
    /\d{1,3}\s*%/.test('pays 30 % on renewals'))
}

console.log('\nC) the approval link is configured, https, and absent rather than guessed')
{
  clearEnv()
  check('C1: no configured link renders nothing for that plan',
    marketplaceAffiliateUrl('jvzoo', 'regular') === null)

  process.env[AFFILIATE] = 'https://www.jvzoo.com/affiliate/affiliateinfonew/index/457483'
  check('C2: a configured https link is returned as given',
    marketplaceAffiliateUrl('jvzoo', 'regular')
      === 'https://www.jvzoo.com/affiliate/affiliateinfonew/index/457483')

  for (const bad of [
    'http://www.jvzoo.com/affiliate/457483',
    'javascript:alert(1)',
    '//www.jvzoo.com/affiliate/457483',
    'https://www.jvzoo.com/a"onmouseover="x',
    'https://www.jvzoo.com/a<script>',
    'www.jvzoo.com/affiliate/457483',
  ]) {
    process.env[AFFILIATE] = bad
    check(`C3: ${JSON.stringify(bad)} is refused`, marketplaceAffiliateUrl('jvzoo', 'regular') === null)
  }

  check('C4: an unregistered platform has no affiliate link',
    marketplaceAffiliateUrl('nope', 'regular') === null)

  // The page must not build the platform's URL from a product id itself.
  check('C5: the page constructs no platform URL of its own',
    !/jvzoo\.com|digistore24\.com|clickbank\.com/.test(src),
    (src.match(/.{0,40}(jvzoo|digistore24|clickbank)\.com.{0,40}/) || [])[0])

  clearEnv()
}

console.log('\nD) MUTATION CONTROLS for C')
{
  check('D1: a plain-http link would fail C3',
    !/^https:\/\/[^\s"'<>]+$/.test('http://www.jvzoo.com/affiliate/457483'))
  check('D2: a URL built in the page would fail C5',
    /jvzoo\.com/.test('`https://www.jvzoo.com/affiliate/affiliateinfonew/index/${id}`'))
  // The configured value, returned truncated: C2 must not accept it.
  process.env[AFFILIATE] = 'https://www.jvzoo.com/affiliate/affiliateinfonew/index/457483'
  const truncated: string = (marketplaceAffiliateUrl('jvzoo', 'regular') ?? '').slice(0, 38)
  check('D3: C2 is not vacuous — it would fail on a mangled return',
    truncated !== 'https://www.jvzoo.com/affiliate/affiliateinfonew/index/457483'
      && truncated.length > 0)
  delete process.env[AFFILIATE]
}

console.log('\nE) the swipe copy promises nothing we cannot stand behind')
{
  /*
   * Matched against the whole page source, swipe copy included, because the
   * copy is the part a stranger sends. Each pattern is a claim this project
   * does not make: a position, a timeframe to one, an earnings figure, an
   * invented count, or the trial that was deliberately removed from this
   * channel's offer (see the JVZoo disclaimer ruling).
   */
  const FORBIDDEN: readonly { name: string; re: RegExp }[] = [
    { name: 'a guarantee', re: /\bguarantee[sd]?\b/i },
    { name: 'a promised position', re: /\b(#\s?1|number one|top (?:3|5|10|ten)|first page|page one)\b/i },
    { name: 'a promised ranking', re: /\b(we|it|you)('ll| will)? (?:rank|get you ranked)\b/i },
    { name: 'an earnings figure', re: /\$\s?\d[\d,.]*\s*(?:\/|per |a )?(?:click|lead|day|week|month|sale)\b/i },
    { name: 'an earnings-per-click claim', re: /\b(epc|earnings per click)\b/i },
    { name: 'a conversion-rate claim', re: /\bconver(?:ts|sion) (?:at|rate of)\b/i },
    { name: 'an invented customer count', re: /\b\d[\d,]*\+? (?:customers|businesses|users|clients)\b/i },
    { name: 'the free trial this channel does not sell', re: /\b(free trial|7[- ]day trial|no credit card)\b/i },
    { name: 'a review score we have not got', re: /\b\d(?:\.\d)?\s*\/\s*5\b|\b\d(?:\.\d)?\s*stars?\b/i },
  ]
  for (const { name, re } of FORBIDDEN) {
    const hit = re.exec(src)
    check(`E1 ${name} appears nowhere on the page`, hit === null, hit?.[0])
  }

  // The limits the product really has are STATED, not merely not contradicted.
  check('E2: rank tracking is described as monthly wherever it is described',
    /every month/.test(src) && !/\b(daily|real[- ]time|hourly) (?:rank|tracking)\b/i.test(src))
  check('E3: the AI check names exactly the three assistants it covers',
    /ChatGPT, Gemini and Google AI/.test(src))
  check('E4: fixes are described as applied after approval',
    /approve/.test(src))
  check('E5: the swipe copy leaves the affiliate\'s own link as a placeholder',
    /\[YOUR LINK\]/.test(src))
  check('E6: and the page tells them to replace it',
    /Replace \[YOUR LINK\]/.test(src))
  check('E7: the page publishes the rules an affiliate is held to',
    /may not say in our name/i.test(src))
}

console.log('\nF) MUTATION CONTROLS for E')
{
  check('F1: a guarantee in the copy would fail E1',
    /\bguarantee[sd]?\b/i.test('We guarantee page one in 90 days.'))
  check('F2: an earnings figure would fail E1',
    /\$\s?\d[\d,.]*\s*(?:\/|per |a )?(?:click|lead|day|week|month|sale)\b/i.test('Affiliates earn $47 per sale.'))
  check('F3: an invented customer count would fail E1',
    /\b\d[\d,]*\+? (?:customers|businesses|users|clients)\b/i.test('Trusted by 1,200 businesses.'))
  check('F4: mentioning the trial would fail E1',
    /\b(free trial|7[- ]day trial|no credit card)\b/i.test('Start a free trial, no credit card.'))
  check('F5: "top 10" would fail E1',
    /\b(#\s?1|number one|top (?:3|5|10|ten)|first page|page one)\b/i.test('Get into the top 10 on Google.'))
  check('F6: daily rank tracking would fail E2',
    /\b(daily|real[- ]time|hourly) (?:rank|tracking)\b/i.test('Daily rank tracking included.'))
  check('F7: E3 would fail if an assistant were added to the claim',
    !/ChatGPT, Gemini and Google AI/.test('ChatGPT, Gemini, Claude and Google AI'))
}

console.log('\nG) the page is structurally the sales page\'s neighbour')
{
  check('G1: it is noindex', /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(src))
  check('G2: an unregistered platform is a 404',
    /if \(!provider\) notFound\(\)/.test(src))
  check('G3: the route is English by the route contract, not by a flag of its own',
    routePublicLocale('/go/jvzoo/jv') === 'en'
    && routePublicLocale('/go/digistore24/jv') === 'en')
  check('G4: and the page declares no locale of its own',
    !/lang=|DocumentLocaleEffect|PublicLocale/.test(src))
  check('G5: it links the sales page it recruits for, and our own terms',
    /\/go\/\$\{provider\.slug\}/.test(src) && /\/en\/terms/.test(src) && /\/en\/privacy/.test(src))
  check('G6: it carries no buy button — an affiliate is recruited here, not charged',
    !/marketplaceBuyUrl/.test(src))
}

console.log('\nH) MUTATION CONTROLS for G')
{
  check('H1: a page without the robots block would fail G1',
    !/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test('export const metadata: Metadata = {}'))
  check('H2: G3 would fail for a path outside the English-only segment',
    routePublicLocale('/jv') !== 'en')
  check('H3: a buy button on the page would fail G6',
    /marketplaceBuyUrl/.test('const buyUrl = marketplaceBuyUrl(provider.slug, code)'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
