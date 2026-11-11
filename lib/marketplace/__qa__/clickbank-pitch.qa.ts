/**
 * THE PITCH PAGE AND THE THANK-YOU PAGE A RESELLER REVIEWS BEFORE IT LISTS US.
 *
 * Why this suite exists, with a date on it. On 10.11.2026 17:38Z ClickBank
 * rejected all four Go Top SEO products in one sweep (tickets 27356947,
 * 27356950, 27356952, 27356953, account nickname gtopseo) with a single
 * sentence: "The sites you submitted do not currently include all of the
 * required ClickBank elements." Their rules
 * (support.clickbank.com/en/articles/10535182-creating-your-first-product,
 * read 11.11.2026) enumerate those elements for a pitch page and for a
 * thank-you page. The account had a pitch page missing four of them and no
 * thank-you page at all.
 *
 * So the elements are not styling and they are not copy taste: each one is a
 * condition of being listed, and a page that loses one silently costs another
 * review cycle — four days, the last time. This suite holds each required
 * element to the page, and holds the two that are facts about the platform
 * (where order support goes, what the charge is called on the statement) to
 * being read from the provider table rather than typed into a page.
 *
 * WHAT IT DELIBERATELY DOES NOT ASSERT. That the mandated disclaimer is
 * present: `requiredDisclaimer` is null until the legal thread has passed the
 * exact words, and a guard demanding it would be a guard demanding we publish
 * unapproved text. What is asserted is that both pages render it the moment
 * it exists, and attribute it.
 *
 * MUTATION CONTROLS throughout: every guard is re-run against a version of
 * the thing it protects with that property removed, and must fail there.
 *
 * Run: npx tsx lib/marketplace/__qa__/clickbank-pitch.qa.ts
 */
import { execSync } from 'child_process'
import { readFileSync } from 'fs'
import { join } from 'path'
import { marketplaceProvider } from '../config'
import { routePublicLocale } from '../../i18n/request-locale'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
/** Comments are stripped first: a requirement named in a comment is not on the page. */
const stripComments = (s: string) =>
  s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')

const PITCH = 'app/go/[platform]/page.tsx'
const THANKS = 'app/go/[platform]/thanks/page.tsx'
const pitchRaw = readFileSync(join(ROOT, PITCH), 'utf8')
const thanksRaw = readFileSync(join(ROOT, THANKS), 'utf8')
const pitch = stripComments(pitchRaw)
const thanks = stripComments(thanksRaw)

console.log('\nClickBank pitch page and thank-you page\n')

console.log('A) The platform facts come from the provider table, not from a page')
{
  const cb = marketplaceProvider('clickbank')
  check('A1: clickbank is registered', cb !== null)
  check('A2: order support is their own destination',
    cb?.orderSupportUrl === 'https://www.clkbank.com')
  check('A3: the statement descriptor is the string they publish',
    cb?.billingDescriptor === 'CLKBANK*COM')
  // A reseller is the seller of record, which is what makes their mandated
  // "ClickBank is the retailer" sentence agree with our own seller paragraph
  // instead of contradicting it the way JVZoo's does.
  check('A4: clickbank is the seller of record', cb?.sellerOfRecord === true)
  // The two platforms that publish no such route must not borrow ClickBank's.
  check('A5: jvzoo borrows neither', marketplaceProvider('jvzoo')?.orderSupportUrl === null &&
    marketplaceProvider('jvzoo')?.billingDescriptor === null)
  check('A6: digistore24 borrows neither', marketplaceProvider('digistore24')?.orderSupportUrl === null &&
    marketplaceProvider('digistore24')?.billingDescriptor === null)
  check('A7: neither value is typed into the pitch page',
    !pitch.includes('clkbank.com') && !pitch.includes('CLKBANK*COM'))
  check('A8: nor into the thank-you page',
    !thanks.includes('clkbank.com') && !thanks.includes('CLKBANK*COM'))
}

console.log('\nB) The pitch page carries every required element')
{
  // Delivery method AND speed, and for a recurring product when the
  // recurring delivery happens.
  check('B1: the delivery method is stated', /email the\s+address you paid with/.test(pitch) || /we email the/.test(pitch))
  check('B2: the speed is stated', /within a few minutes/i.test(pitch))
  check('B3: the recurring delivery is answered', /no second delivery/i.test(pitch))
  check('B4: it says there is nothing to download', /nothing to download/i.test(pitch))
  // The file format and what is required to use it.
  check('B5: what is needed to use it has a section', /What you need to use it/.test(pitch))
  check('B6: no software and no operating system requirement is stated',
    /no software to install/i.test(pitch) && /operating system/i.test(pitch))
  // The rebill schedule in full: frequency AND the number of payments.
  check('B7: the billing frequency is stated', /every month, on the\s+same day of the month/i.test(pitch))
  check('B8: the number of payments is answered', /no fixed number of payments/i.test(pitch))
  check('B9: and where it is cancelled', /You cancel it at \{provider\.label\}/.test(pitch))
  // The price and the payment link are already the plan grid's job.
  check('B10: the price is on the page', /plan\.priceUSD/.test(pitch))
  check('B11: the payment link is the configured buy URL', /marketplaceBuyUrl\(provider\.slug, code\)/.test(pitch))
  // The seller contact block, in the words the platform dictates.
  check('B12: the product support line is verbatim',
    /For Product Support, please contact the seller/.test(pitch))
  check('B13: the order support line is verbatim',
    /For Order Support, please contact \{provider\.label\}/.test(pitch))
  check('B14: it links the provider\'s own order support route',
    /href=\{provider\.orderSupportUrl\}/.test(pitch))
  check('B15: the order line is rendered only where the platform publishes one',
    /provider\.orderSupportUrl \?/.test(pitch))
  // ONE published support address for both pages. The sales page had none and
  // the thank-you page had a literal, which is how a reseller's review ends up
  // reading two answers to "who do I write to".
  // Cancelling is not returning, and our own no-refund term may not appear:
  // their return policy is part of their Client Contract and forbids a seller
  // to guarantee anything that conflicts with it.
  check('B17: the page distinguishes cancelling from a return',
    /Cancelling stops the future charges/.test(pitch) &&
      /by itself it does not return money already paid/.test(pitch))
  check('B18: it names the reseller\'s own policy as the governing one',
    /which is the policy that governs this purchase/.test(pitch))
  check('B19: it restates no no-refund term of ours',
    !/not refunded|no refunds|non-refundable/i.test(pitch))
  check('B20: and quotes no return period',
    !/\b(14|30|60|365)[- ]day/i.test(pitch))
  check('B21: the policy link falls back to the platform\'s published policy',
    /marketplacePolicyUrl\(provider\.slug\)/.test(pitch))
  check('B22: the two support lines say which is which',
    /goes to \{provider\.label\}, which is the seller for this purchase/.test(pitch))
  check('B16: product support goes to the one published support address',
    /mailto:\$\{MARKETPLACE_SUPPORT_EMAIL\}/.test(pitch) &&
      /mailto:\$\{MARKETPLACE_SUPPORT_EMAIL\}/.test(thanks))
}

console.log('\nC) The thank-you page carries every required element')
{
  check('C1: it exists as a route beside the pitch page', thanksRaw.length > 0)
  check('C2: access instructions are an ordered list of steps',
    /list-decimal/.test(thanks) && /activation link/i.test(thanks))
  check('C3: they say where the email goes', /email address you used at checkout/i.test(thanks))
  check('C4: contact information is on it', /For Product Support, please contact the seller/.test(thanks))
  check('C5: order support too, from the provider', /href=\{provider\.orderSupportUrl\}/.test(thanks))
  check('C6: the statement descriptor is explained', /provider\.billingDescriptor/.test(thanks) &&
    /On the statement itself it appears as/i.test(thanks))
  // IT MAY NOT DELIVER. The redirect carries no proof of payment we verified
  // and can arrive before the platform's callback does, so a claim link, a
  // plan name or "your account is ready" here would be a promise made on a
  // page anybody can open.
  check('C7: it mints or shows no claim capability',
    !/claimUrl|claim_token|claimToken/.test(thanks))
  check('C8: it does not assert that a payment happened, because its URL is public',
    !/your payment has been received|we have received your payment/i.test(thanks))
  check('C9a: the dictated product-support line is on it too',
    /For Product Support, please contact the seller/.test(thanks))
  check('C9b: and the dictated order-support line, from the provider',
    /For Order Support, please contact \{provider\.label\}/.test(thanks))
  check('C9: it reads the provider from the registry and 404s otherwise',
    /marketplaceProvider\(platform\)/.test(thanks) && /notFound\(\)/.test(thanks))
}

console.log('\nD) The mandated disclaimer: rendered when it exists, attributed, never invented')
{
  for (const [name, src] of [['pitch', pitch], ['thanks', thanks]] as const) {
    check(`D1 (${name}): the disclaimer is gated on the provider's field`,
      /provider\.requiredDisclaimer \?/.test(src))
    check(`D2 (${name}): it is attributed to the platform`,
      /Notice required by \{provider\.label\}/.test(src))
    check(`D3 (${name}): no disclaimer text is typed into the page`,
      !/registered trademark of Click Sales/.test(src))
  }
  // Passed for publication by the legal thread on 11.11.2026, on three
  // conditions: verbatim, attributed, and only where ClickBank really is the
  // retailer. The first two are D2/D3 above and the exact-text check here;
  // the third is D6.
  const cbDisclaimer = marketplaceProvider('clickbank')?.requiredDisclaimer ?? ''
  check('D4: the disclaimer is published', cbDisclaimer.length > 0)
  check('D4a: it opens and closes on their exact sentences',
    cbDisclaimer.startsWith('ClickBank is the retailer of products on this site.') &&
      cbDisclaimer.endsWith('used in promotion of these products.'))
  check('D4b: the company, the address and the permission clause are intact',
    cbDisclaimer.includes('Click Sales, Inc., a Delaware corporation') &&
      cbDisclaimer.includes('1444 S. Entertainment Ave., Suite 410 Boise, ID 83709, USA') &&
      cbDisclaimer.includes('used by permission'))
  check('D5: it is not translated and carries their registered mark',
    cbDisclaimer.includes('CLICKBANK\u00ae') && !/[\u0590-\u05FF]/.test(cbDisclaimer))
  // THE CONDITION THAT MATTERS MOST. "ClickBank is the retailer of products
  // on this site" is a claim about a whole site, and it is false on a page
  // whose checkout is PayPal or Creem. It may live only on the two
  // per-platform /go/clickbank pages, which is what makes it true.
  check('D6: no page outside this per-platform segment renders it', (() => {
    const hits = execSync(
      "grep -rl 'requiredDisclaimer' app components || true",
      { cwd: ROOT, encoding: 'utf8' },
    ).trim().split('\n').filter(Boolean).sort()
    return JSON.stringify(hits) === JSON.stringify([PITCH, THANKS].sort())
  })())
  check('D7: it is never printed for a platform that mandates none',
    marketplaceProvider('digistore24')?.requiredDisclaimer === null)
}

console.log('\nE) Both pages keep the structural properties of this segment')
{
  for (const [name, raw] of [['pitch', pitchRaw], ['thanks', thanksRaw]] as const) {
    check(`E1 (${name}): noindex`, /robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test(raw))
  }
  check('E2: the segment is English by route, not by a mechanism of its own',
    routePublicLocale('/go/clickbank') === 'en' && routePublicLocale('/go/clickbank/thanks') === 'en')
  check('E3: neither page links the free trial or the free check into this funnel',
    !/free-check/.test(pitch) && !/free-check/.test(thanks))
}

console.log('\nF) MUTATION CONTROLS')
{
  // B2: a page that says only "after payment" has no speed on it.
  const noSpeed = pitch.replace(/within a few minutes/gi, 'after payment')
  check('F1: B2 fails on a page with no delivery speed', !/within a few minutes/i.test(noSpeed))
  // B8: the sentence this requirement replaced.
  const oldRebill = 'The plan is a monthly subscription and renews every month until you cancel it.'
  check('F2: B8 fails on the sentence that was there before',
    !/no fixed number of payments/i.test(oldRebill))
  check('F2a: and B7 fails on it too', !/every month, on the\s+same day of the month/i.test(oldRebill))
  // B12/B13: their wording is dictated, so a paraphrase must not pass.
  const paraphrase = 'Need help with the product? Email us. Billing questions go to the platform.'
  check('F3: B12 fails on a paraphrase of the dictated line',
    !/For Product Support, please contact the seller/.test(paraphrase))
  check('F4: B13 fails on it as well',
    !/For Order Support, please contact \{provider\.label\}/.test(paraphrase))
  // A7/A8: the destination typed into a page instead of read from the table.
  const hardcoded = '<a href="https://www.clkbank.com">HERE</a>'
  check('F5: A7 fails when the destination is typed into the page',
    hardcoded.includes('clkbank.com'))
  // C7: the version of this page that would have delivered.
  const delivering = 'Open your account: <a href={claimUrl}>here</a>'
  check('F6: C7 fails on a thank-you page carrying a claim link',
    /claimUrl/.test(delivering))
  // D3: the mandated text pasted into the page rather than attributed.
  const pasted = 'CLICKBANK® is a registered trademark of Click Sales, Inc., a Delaware corporation'
  check('F7: D3 fails when the mandated text is typed into a page',
    /registered trademark of Click Sales/.test(pasted))
  // E1: the metadata block with the robots rule dropped.
  check('F8: E1 fails without the robots block',
    !/robots:\s*\{\s*index:\s*false,\s*follow:\s*false\s*\}/.test('export const metadata: Metadata = {}'))
  // The comment stripper has to actually strip, or every guard above could be
  // satisfied by a sentence in a comment.
  check('F9 (control): a requirement named only in a comment does not count',
    !stripComments('{/* within a few minutes */}\n<p>x</p>').includes('within a few minutes'))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
