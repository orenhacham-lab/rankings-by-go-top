/**
 * A MARKETPLACE CHANNEL NEVER ADVERTISES THE FREE TRIAL.
 *
 * Why this suite exists, with a date on it. Digistore24's compliance reviewer
 * wrote on 14.11.2026, after testing the funnel: "even after purchasing the
 * $649 / month plan, the access is still on a 7-day free trial. Please fix
 * this, and remove the free trial, as it's also not allowed." What she had
 * actually done was buy a second time and then sign up on our own site
 * without opening the activation link, so she was looking at a visitor's
 * trial and not at what the purchase grants — her first order was claimed at
 * 11:53 UTC and that account is active on the Agency plan. But the
 * undertaking given to her in reply stands and is narrow: NOTHING in the
 * Digistore24 funnel offers a trial, and a buyer who comes through it lands
 * on the plan they paid for.
 *
 * The pages satisfy that today, which is exactly why a guard is worth having:
 * the trial is this product's main call to action on every other surface, in
 * ten languages, so a shared component or a copy edit is one careless step
 * from putting "7 days free" back on a reseller's pitch page — and that is a
 * page a reviewer reads before listing us.
 *
 * WHAT IT DOES NOT TOUCH. The trial itself, anywhere on our own site: it is
 * the conversion mechanism of the direct funnel and no reseller's rule
 * reaches it. And it says nothing about HOW a purchase attaches to an
 * account; that mechanism is a separate decision, still open.
 *
 * MUTATION CONTROLS at the end: each guard is re-run against a version of the
 * page with the offending text put back, and must fail there.
 *
 * Run: npx tsx lib/marketplace/__qa__/no-trial-in-funnel.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
/** Comments go first: a trial named in a comment is not an offer on the page. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

/**
 * The wordings that would read as an offer. `trial` alone is not enough — a
 * sentence may yet appear that denies one ("no trial is included"), and a
 * guard that banned the word would push an author into a worse paraphrase.
 */
const OFFERS = [
  /\b\d+[-\s]day free trial\b/i,
  /\bfree trial\b/i,
  /\bstart (?:your|a) trial\b/i,
  /\btry it free\b/i,
  /\bno credit card (?:required|needed)\b/i,
]

const FUNNEL = [
  'app/go/[platform]/page.tsx',
  'app/go/[platform]/jv/page.tsx',
  'app/go/[platform]/thanks/page.tsx',
]

console.log('\nNo trial in a marketplace funnel\n')

console.log('A) The three channel pages')
for (const file of FUNNEL) {
  const src = stripComments(readFileSync(join(ROOT, file), 'utf8'))
  for (const offer of OFFERS) {
    check(`A ${file}: no ${offer.source}`, !offer.test(src),
      offer.exec(src)?.[0])
  }
}

console.log('B) The claim email a buyer gets from this funnel')
{
  const src = stripComments(readFileSync(join(ROOT, 'lib/marketplace/claim-email.ts'), 'utf8'))
  for (const offer of OFFERS) {
    check(`B claim-email: no ${offer.source}`, !offer.test(src), offer.exec(src)?.[0])
  }
}

console.log('C) Mutation controls')
{
  const withOffer = '<p>Includes a 7-day free trial, no credit card required.</p>'
  check('C1: the guard fires on a plan card that offers a trial',
    OFFERS.some((o) => o.test(withOffer)))
  check('C2: and on the card-free wording alone',
    OFFERS.some((o) => o.test('<p>No credit card needed.</p>')))
  check('C3 (control): a sentence that DENIES a trial is not flagged',
    !OFFERS.some((o) => o.test('<p>This plan does not include a trial period.</p>')))
  check('C4 (control): a trial named only in a comment does not count',
    !OFFERS.some((o) => o.test(stripComments('{/* a 7-day free trial */}\n<p>x</p>'))))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
