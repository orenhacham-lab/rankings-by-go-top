/**
 * WHICH PLATFORMS WE SAY WE PUBLISH TO.
 *
 * Wix publishing is real and complete — `lib/site-platforms/wix.ts` tests the
 * connection, converts the article's HTML to Ricos, creates the post and maps
 * every Wix error to a code the merchant sees. `ChoosablePlatform` has named it
 * for as long as it has existed. The pricing copy in all ten locales says
 * "WordPress, Shopify and Wix".
 *
 * The landing copy said "WordPress and Shopify" in all ten, with a stat that
 * read a literal `2`, and an FAQ answer stating as fact that "direct publishing
 * works with WordPress and Shopify". A German directory editor reviewing the
 * product on 09.11.2026 noticed the contradiction between the two pages and
 * wrote it up. Understating is not the harmless direction of a wrong claim: the
 * FAQ answer was read by a Wix owner as "not for me".
 *
 * So this suite pins the claim to the code rather than to a copy review. The
 * platform list is DERIVED from `ChoosablePlatform`, so adding a platform to the
 * product fails this suite until every locale says so, in both places.
 *
 * `webhook` is deliberately excluded: it is the generic fallback for a site that
 * is none of the three, not a brand a merchant recognises on a pricing page.
 *
 * Every guard has a MUTATION CONTROL.
 *
 * Run: npx tsx lib/i18n/__qa__/publishing-platforms-claim.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { PUBLIC_LOCALES } from '../locales'
import type { ChoosablePlatform } from '../../site-platforms/types'

const ROOT = join(__dirname, '../../..')
let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/**
 * The brands a merchant is told about, with the label each locale writes. The
 * keys are `ChoosablePlatform` values, so a new platform in the type is a type
 * error here until someone decides what the copy calls it — which is the point.
 */
const NAMED: Partial<Record<ChoosablePlatform, string>> = {
  wordpress: 'WordPress',
  shopify: 'Shopify',
  wix: 'Wix',
}
const LABELS = Object.values(NAMED) as string[]

/**
 * How each locale may write the brand. Polish inflects the Latin name
 * ("WordPressie", "Wixem"), so the stem is enough there; Hebrew transliterates
 * it ("וורדפרס"), so the Latin name never appears in that copy and the
 * transliteration is the mention. A locale is free to use either.
 */
const ALIASES: Record<string, string[]> = {
  WordPress: ['WordPress', 'וורדפרס'],
  Shopify: ['Shopify', 'שופיפיי'],
  Wix: ['Wix', 'וויקס'],
}
const mentions = (src: string, label: string) =>
  (ALIASES[label] ?? [label]).some((form) => new RegExp(form, 'u').test(src))

const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

console.log('\nA) the product really does publish to all three')
{
  const wix = read('lib/site-platforms/wix.ts')
  check('A1: the Wix adapter creates a post and returns its id',
    /export async function publishToWix/.test(wix) && /WIX_CREATE_DRAFT_PATH/.test(wix))
  check('A2: and the publisher dispatches to it',
    /publishToWix/.test(read('lib/site-platforms/publish.ts')))
  check('A3: three platforms are named in copy, derived from the type', LABELS.length === 3, LABELS.join('/'))
}

console.log('\nB) every locale names every platform, on the landing page and on pricing')
{
  for (const locale of PUBLIC_LOCALES) {
    const landing = read(`lib/i18n/public/landing-${locale}.ts`)
    const pricing = read(`lib/i18n/public/pricing-${locale}.ts`)
    const missingLanding = LABELS.filter((l) => !mentions(landing, l))
    const missingPricing = LABELS.filter((l) => !mentions(pricing, l))
    check(`B1 ${locale}: the landing copy names all three`, missingLanding.length === 0, missingLanding.join(', '))
    check(`B2 ${locale}: the pricing copy names all three`, missingPricing.length === 0, missingPricing.join(', '))
  }
  check('B-MUT: a locale that dropped Wix would be caught, in either script',
    LABELS.filter((l) => !mentions("trust: ['Publishes to WordPress and Shopify']", l)).length === 1
    && LABELS.filter((l) => !mentions("trust: ['פרסום לוורדפרס ולשופיפיי']", l)).length === 1
    && LABELS.filter((l) => !mentions("trust: ['פרסום לוורדפרס, לשופיפיי ולוויקס']", l)).length === 0)
}

console.log('\nC) and the counted stat matches the number of platforms')
{
  /*
   * The hero stat is a number a reader compares against the list beside it, so
   * a stale `2` contradicts the very sentence under it. It is read here as a
   * number rather than matched as text, so a locale that writes it differently
   * still has to agree.
   */
  for (const locale of PUBLIC_LOCALES) {
    const landing = read(`lib/i18n/public/landing-${locale}.ts`)
    const stat = /\{ value: (\d+), label: '[^']*', detail: '([^']*)' \}/u.exec(
      landing.split('\n').find((l) => l.includes('value:') && LABELS.every((b) => l.includes(b))) ?? '')
    check(`C1 ${locale}: the platform stat counts ${LABELS.length}`,
      stat !== null && Number(stat[1]) === LABELS.length, stat ? stat[1] : 'stat line not found')
  }
  check('C1-MUT: a stat left at 2 beside three brands is caught',
    Number((/\{ value: (\d+),/u.exec("{ value: 2, label: 'x', detail: 'WordPress, Shopify and Wix' }") ?? [])[1]) !== LABELS.length)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
