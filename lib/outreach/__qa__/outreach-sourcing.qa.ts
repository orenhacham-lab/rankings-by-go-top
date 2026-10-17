/**
 * Finding and qualifying the businesses the US channel may write to.
 *
 * THE FAILURES THIS SUITE EXISTS FOR are all the same failure wearing different
 * clothes: a row enters the list that the privacy page, in four languages, says
 * cannot be there. Each of those sentences is a guard below.
 *
 *   Q7  the address comes from the business's own site, never from the
 *       directory that pointed us at it. This is the rule most likely to be
 *       eroded by somebody raising the yield later, which is why it is tested
 *       with a listing that is FULL of addresses and a business site that has
 *       none: the right answer is to refuse the business.
 *   Q4  no EEA or UK address anywhere on the site.
 *   Q5  a business that publishes no postal address never enters the list.
 *   Q6  a page whose own words forbid collecting addresses is left alone, which
 *       is the one rule that exists only because the list is machine-made
 *       (CAN-SPAM's address-harvesting aggravation).
 *   Q2  robots.txt is honoured BEFORE the site is read, not after.
 *   P5  and the narrow scope of that harvesting check, which is a judgement:
 *       matching the "we do not sell your personal information" that sits in
 *       every US privacy policy would refuse every business and make the rule
 *       decorative.
 *
 * Run: npx tsx lib/outreach/__qa__/outreach-sourcing.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { SUPPRESSION_TABLE, hashEmail } from '@/lib/email-suppression'
import type { FetchedPage } from '../finding'
import { PROSPECTS_TABLE } from '../prospects'
import {
  contactEmailIn,
  detailLinks,
  eeaUkSignalIn,
  findUsPostalAddress,
  forbidsHarvesting,
  isEeaUkDomain,
  isOpenPage,
  listingCandidates,
  pageTitle,
  robotsAllows,
} from '../sourcing'
import { CONTACT_PATHS, MAX_PAGES_PER_SITE, qualifyBusiness } from '../qualify'
import { addProspect, runProspectTopUp, type PublicSource } from '../topup'
import { SOURCING_FLAG, runIsolatedProspectTopUp } from '../topup-isolated'

let pass = 0
let fail = 0
function check(name: string, ok: boolean) {
  if (ok) { pass++; console.log(`  ok   ${name}`) } else { fail++; console.log(`  FAIL ${name}`) }
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const asAdmin = (f: FakeAdmin) => f as any
const NOW = new Date('2026-10-16T15:00:00Z')

const page = (body: string, status = 200, url = 'https://store.example/'): FetchedPage => ({ url, status, body })

const SHOPIFY = '<script>var Shopify = {shop:"store.example"};</script><link href="//cdn.shopify.com/s/x.css">'
const US_ADDRESS = '<footer>Store Example LLC, 1420 Industrial Blvd, Suite 3, Nashville, TN 37210</footer>'
const CONTACT = '<a href="mailto:info@store.example">Email us</a>'

/** A site built from parts, so each guard can remove exactly one of them. */
const site = (parts: { home?: string; contact?: string; robots?: string; about?: string }) =>
  async (url: string): Promise<FetchedPage> => {
    if (url.endsWith('/robots.txt')) {
      return parts.robots === undefined
        ? page('', 404, url)
        : page(parts.robots, 200, url)
    }
    if (url === 'https://store.example/') return page(parts.home ?? `<html>${SHOPIFY}</html>`, 200, url)
    if (url === 'https://store.example/contact') {
      return parts.contact === undefined ? page('', 404, url) : page(parts.contact, 200, url)
    }
    if (url === 'https://store.example/about' || url === 'https://store.example/about-us') {
      return parts.about === undefined ? page('', 404, url) : page(parts.about, 200, url)
    }
    return page('', 404, url)
  }

const CANDIDATE = { company: 'Store Example LLC', host: 'store.example', sourceSecond: 'https://grown.example/directory/' }

async function main() {
  console.log('\n— P: reading a stranger\'s page —')

  const addr = findUsPostalAddress(US_ADDRESS)
  check('P1: a US address with a street, a state and a ZIP is read',
    addr?.state === 'TN' && addr.line.includes('1420 Industrial Blvd') && addr.line.endsWith('TN 37210'))
  check('P1b: a state and a ZIP with no street in front of them is not an address',
    findUsPostalAddress('<p>Proudly serving TN 37210 and beyond</p>') === null)
  check('P1c: a number that is only a number is not an address',
    findUsPostalAddress('<p>Orders over $12,345 ship free. Est. 1998</p>') === null)
  check('P1d: a PO box counts, because plenty of businesses publish only one',
    findUsPostalAddress('<p>P.O. Box 118, Ely, MN 55731</p>')?.state === 'MN')

  check('P2: a European domain is one by its TLD alone',
    isEeaUkDomain('shop.co.uk') && isEeaUkDomain('laden.de') && isEeaUkDomain('x.eu')
    && !isEeaUkDomain('store.example') && !isEeaUkDomain('store.com') && !isEeaUkDomain('shop.us'))

  // A shipping note is not an establishment, and refusing on one would throw
  // away American businesses for nothing.
  check('P3: "we ship to Germany" is not a European address',
    eeaUkSignalIn('<p>We ship to Germany, France and Japan.</p>') === null)
  check('P3b: a German address with its postal code is',
    eeaUkSignalIn('<p>Musterstrasse 4, 10115 Berlin, Germany</p>') !== null)
  check('P3c: a UK postcode is, on its own',
    eeaUkSignalIn('<p>Unit 4, Leeds LS1 4AP</p>') !== null)
  check('P3d: and an EU VAT number is',
    eeaUkSignalIn('<p>VAT DE123456789</p>') !== null)

  check('P4: a role address on the business\'s own domain is preferred',
    contactEmailIn(`${CONTACT}<p>owner.jane@gmail.com info@store.example</p>`, 'store.example') === 'info@store.example')
  check('P4b: addresses that are nobody\'s inbox are never taken',
    contactEmailIn('<p>no-reply@store.example privacy@store.example</p>', 'store.example') === null)
  check('P4c: a file name that looks like an address is not one',
    contactEmailIn('<img src="logo@2x.png">', 'store.example') === null)
  check('P4d: with nothing on its own domain, a published address is still a contact',
    contactEmailIn('<p>thestore@gmail.com</p>', 'store.example') === 'thestore@gmail.com')

  // THE JUDGEMENT CALL, and the reason it is narrow.
  check('P5: "we do not sell your personal information" is not a notice about our crawler',
    forbidsHarvesting('<p>We do not sell your personal information to third parties.</p>') === false)
  check('P5b: a notice about collecting addresses from the site is',
    forbidsHarvesting('<p>Email addresses on this site may not be collected for commercial purposes.</p>') === true)
  check('P5c: and so is an explicit no to automated collection',
    forbidsHarvesting('<p>No automated collection or scraping of this site is permitted.</p>') === true)

  check('P6: a challenge page is not open, whatever its status code',
    isOpenPage(page('<html><body><p id="cmsg">Please enable JS</p>captcha-delivery</body></html>')) === false)
  check('P6b: and neither is a 403',
    isOpenPage(page('<html>fine</html>', 403)) === false)
  check('P6c: an ordinary page is', isOpenPage(page('<html>fine</html>')) === true)

  check('P7: Disallow: / means no',
    robotsAllows('User-agent: *\nDisallow: /', '/contact', 'GoTopSEO-Prospecting') === false)
  check('P7b: a disallowed admin path does not disallow the contact page',
    robotsAllows('User-agent: *\nDisallow: /wp-admin/\nDisallow: /wp-includes/', '/contact', 'GoTopSEO-Prospecting') === true)
  check('P7c: our own agent\'s group wins over the wildcard',
    robotsAllows('User-agent: *\nDisallow: /\n\nUser-agent: GoTopSEO-Prospecting\nAllow: /', '/contact', 'GoTopSEO-Prospecting') === true)
  check('P7d: an empty Disallow allows everything, as the specification says',
    robotsAllows('User-agent: *\nDisallow:', '/contact', 'GoTopSEO-Prospecting') === true)
  check('P7e: and the longest matching rule decides',
    robotsAllows('User-agent: *\nDisallow: /p\nAllow: /pages/contact', '/pages/contact', 'GoTopSEO-Prospecting') === true)

  const listing = `<a href="https://store.example">Store Example LLC</a>
    <a href="https://facebook.com/storeexample">Facebook</a>
    <a href="https://grown.example/about">About us</a>
    <a href="https://laden.de">Laden</a>
    <a href="https://other.example">https://other.example</a>`
  const found = listingCandidates(listing, 'https://grown.example/directory/')
  check('P8: a listing yields the businesses and nothing else',
    found.length === 1 && found[0].host === 'store.example' && found[0].company === 'Store Example LLC')

  const members = `<a href="/directory/store-example/">Store Example</a><a href="/directory/">All</a><a href="/about">About</a>`
  check('P9: a directory that names its members on its own pages is followed one hop',
    JSON.stringify(detailLinks(members, 'https://grown.example/directory/', '/directory/'))
      === JSON.stringify(['https://grown.example/directory/store-example/']))
  check('P9b: and the member page\'s own heading names the business',
    pageTitle('<title>Store Example LLC - Minnesota Grown</title>') === 'Store Example LLC')

  console.log('\n— Q: qualifying one business from its own site —')

  let fetched: string[] = []
  const counting = (fetcher: (url: string) => Promise<FetchedPage>) => async (url: string) => {
    fetched.push(url)
    return fetcher(url)
  }

  fetched = []
  let verdict = await qualifyBusiness(CANDIDATE, counting(site({
    home: `<html>${SHOPIFY}${US_ADDRESS}</html>`,
    contact: `<html>${SHOPIFY}${CONTACT}</html>`,
  })))
  check('Q1: a US Shopify store that publishes an address and a contact is qualified',
    verdict.ok === true && verdict.draft.email === 'info@store.example'
    && verdict.draft.platform === 'shopify' && verdict.draft.postalAddress.endsWith('TN 37210'))
  check('Q1b: the row names the business\'s own page and the listing, two sources',
    verdict.ok === true && verdict.draft.sourceSite.startsWith('https://store.example/')
    && verdict.draft.sourceSecond === CANDIDATE.sourceSecond)

  // The two source columns answer different questions, so they are allowed to
  // differ and the row has to say which page each one came from. Here the
  // address is in the home page's footer and the email is on /contact.
  check('Q1c: the address\'s page and the email\'s page are recorded separately',
    verdict.ok === true
    && verdict.draft.postalPage === 'https://store.example/'
    && verdict.draft.sourceSite === 'https://store.example/contact')

  fetched = []
  const verdictContact = await qualifyBusiness(CANDIDATE, counting(site({
    home: `<html>${SHOPIFY}</html>`,
    contact: `<html>${SHOPIFY}${US_ADDRESS}${CONTACT}</html>`,
  })))
  check('Q1d: an address found deeper in the site names that page, not the home page',
    verdictContact.ok === true && verdictContact.draft.postalPage === 'https://store.example/contact')

  fetched = []
  verdict = await qualifyBusiness(CANDIDATE, counting(site({
    robots: 'User-agent: *\nDisallow: /',
    home: `<html>${SHOPIFY}${US_ADDRESS}${CONTACT}</html>`,
  })))
  check('Q2: a site whose robots.txt says no is refused',
    verdict.ok === false && verdict.reason === 'robots_disallowed')
  check('Q2b: and nothing but robots.txt was ever requested from it',
    fetched.length === 1 && fetched[0].endsWith('/robots.txt'))

  verdict = await qualifyBusiness(CANDIDATE, site({
    home: `<html><meta name="generator" content="Wix.com Website Builder">${US_ADDRESS}${CONTACT}</html>`,
  }))
  check('Q3: a platform the message\'s promise would be untrue for is refused',
    verdict.ok === false && (verdict.reason === 'other_platform' || verdict.reason === 'unrecognized_platform'))

  // Everything fits except one line on a page nobody would think to check.
  verdict = await qualifyBusiness(CANDIDATE, site({
    home: `<html>${SHOPIFY}${US_ADDRESS}${CONTACT}</html>`,
    about: '<html><p>Our European office: Musterstrasse 4, 10115 Berlin, Germany</p></html>',
  }))
  check('Q4: a European address anywhere on the site refuses the business',
    verdict.ok === false && verdict.reason === 'eea_uk_address')

  verdict = await qualifyBusiness(CANDIDATE, site({ home: `<html>${SHOPIFY}${CONTACT}</html>` }))
  check('Q5: a business that publishes no postal address never enters the list',
    verdict.ok === false && verdict.reason === 'no_postal_address')

  verdict = await qualifyBusiness(CANDIDATE, site({
    home: `<html>${SHOPIFY}${US_ADDRESS}</html>`,
    contact: `<html>${CONTACT}<p>Email addresses on this site may not be collected for commercial purposes.</p></html>`,
  }))
  check('Q6: a page that forbids collecting its addresses is left alone',
    verdict.ok === false && verdict.reason === 'harvesting_notice')

  // THE ONE THAT MATTERS MOST. The listing is full of addresses; the business's
  // own site publishes none. The published text allows only the latter.
  verdict = await qualifyBusiness(
    { ...CANDIDATE, sourceSecond: 'https://grown.example/directory/store-example/' },
    site({ home: `<html>${SHOPIFY}${US_ADDRESS}</html>` }),
  )
  check('Q7: with no address on its own site, a business is refused however many the directory shows',
    verdict.ok === false && verdict.reason === 'no_contact_email')
  const qualifySource = readFileSync(join(__dirname, '..', 'qualify.ts'), 'utf8')
  check('Q7b: and the qualifier never even reads the listing it came from',
    !/contactEmailIn\([^)]*sourceSecond/.test(qualifySource)
    && !/fetchPage\(\s*input\.sourceSecond/.test(qualifySource))

  fetched = []
  await qualifyBusiness(CANDIDATE, counting(site({ home: `<html>${SHOPIFY}</html>` })))
  check('Q8: one stranger\'s server is never asked for more than the budget',
    fetched.length <= MAX_PAGES_PER_SITE + 1 && CONTACT_PATHS.length > MAX_PAGES_PER_SITE)

  console.log('\n— T: writing it down —')

  const draft = {
    company: 'Store Example LLC',
    siteHost: 'store.example',
    email: 'info@store.example',
    platform: 'shopify' as const,
    postalAddress: '1420 Industrial Blvd, Suite 3, Nashville, TN 37210',
    postalPage: 'https://store.example/contact',
    sourceSite: 'https://store.example/contact',
    sourceSecond: 'https://grown.example/directory/',
  }
  const empty = (hooks: Record<string, any> = {}) =>
    new FakeAdmin({ [PROSPECTS_TABLE]: [], [SUPPRESSION_TABLE]: [] }, hooks)

  let f = empty()
  check('T1: a qualified business is written as a new prospect',
    await addProspect(asAdmin(f), draft) === 'added')
  const row = f.tables[PROSPECTS_TABLE][0]
  check('T1b: with its address hashed, its country fixed, and both sources',
    row.email_hash === hashEmail(draft.email) && row.country === 'US'
    && row.source_site === draft.sourceSite && row.source_second === draft.sourceSecond
    && row.status === 'new')
  check('T1c: and the page the US address itself was read from',
    row.postal_address_page === draft.postalPage)

  f = new FakeAdmin({
    [PROSPECTS_TABLE]: [],
    [SUPPRESSION_TABLE]: [{ email_hash: hashEmail(draft.email) }],
  })
  check('T2: an address that asked us to stop is never added back',
    await addProspect(asAdmin(f), draft) === 'suppressed' && f.tables[PROSPECTS_TABLE].length === 0)

  f = empty({ [SUPPRESSION_TABLE]: { select: () => ({ code: 'PGRST500' }) } })
  check('T2b: and a suppression list we cannot read is not permission either',
    await addProspect(asAdmin(f), draft) === 'suppression unreadable' && f.tables[PROSPECTS_TABLE].length === 0)

  f = empty()
  check('T3: an address that is not in a US state is refused at the writer too',
    await addProspect(asAdmin(f), { ...draft, postalAddress: '4 Rue de Rivoli, 75001 Paris, FR 75001' }) === 'rejected: not a US state')
  check('T3b: and so is a row that cannot name two sources',
    await addProspect(asAdmin(f), { ...draft, sourceSecond: '  ' }) === 'rejected: missing a source')

  /* ---------------------------------------------------- the pass, end to end */

  const SOURCES: PublicSource[] = [{ name: 'test-directory', url: 'https://grown.example/directory/' }]
  const world = (prospects: Record<string, unknown>[] = []) =>
    new FakeAdmin({ [PROSPECTS_TABLE]: prospects, [SUPPRESSION_TABLE]: [] })

  const net = async (url: string): Promise<FetchedPage> => {
    if (url === 'https://grown.example/directory/') return page(listing, 200, url)
    if (url === 'https://grown.example/robots.txt') return page('User-agent: *\nDisallow: /wp-admin/', 200, url)
    return site({
      home: `<html>${SHOPIFY}${US_ADDRESS}</html>`,
      contact: `<html>${SHOPIFY}${CONTACT}</html>`,
    })(url)
  }

  f = world()
  let summary = await runProspectTopUp(asAdmin(f), { fetchPage: net, now: NOW, startAt: 0, sources: SOURCES })
  check('T4: a pass finds a business, reads its own site, and adds exactly one row',
    summary.added === 'store.example' && f.tables[PROSPECTS_TABLE].length === 1
    && f.tables[PROSPECTS_TABLE][0].platform === 'shopify')
  check('T4b: and it reports what it cost, which is how politeness gets checked',
    summary.fetched >= 3 && summary.examined === 1 && summary.source === 'test-directory')

  f = world([{ id: 'p1', site_host: 'store.example', status: 'sent_first' }])
  const seen: string[] = []
  summary = await runProspectTopUp(asAdmin(f), {
    fetchPage: async (url) => { seen.push(url); return net(url) },
    now: NOW, startAt: 0, sources: SOURCES,
  })
  check('T5: a business already on the list is refused before its server is touched',
    summary.added === null && summary.examined === 0
    && seen.every((url) => url.startsWith('https://grown.example/')))

  // A read we could not do is not a licence to write to a business twice.
  f = new FakeAdmin({ [PROSPECTS_TABLE]: [], [SUPPRESSION_TABLE]: [] },
    { [PROSPECTS_TABLE]: { select: () => ({ code: 'PGRST500' }) } })
  summary = await runProspectTopUp(asAdmin(f), { fetchPage: net, now: NOW, startAt: 0, sources: SOURCES })
  check('T6: a list we could not read means nothing is added',
    summary.added === null && f.tables[PROSPECTS_TABLE].length === 0)

  console.log('\n— G: the switches and the cron —')

  check('G1: the crawler is off unless its own switch is exactly "true"',
    (await runIsolatedProspectTopUp(async () => { throw new Error('must not run') }, { env: {} })).status === 'off'
    && (await runIsolatedProspectTopUp(async () => { throw new Error('must not run') },
      { env: { [SOURCING_FLAG]: 'TRUE', VERCEL_ENV: 'production' } })).status === 'off')
  check('G2: and off outside Production, which shares the Production database',
    (await runIsolatedProspectTopUp(async () => { throw new Error('must not run') },
      { env: { [SOURCING_FLAG]: 'true', VERCEL_ENV: 'preview' } })).status === 'not_production')
  check('G3: a pass that throws is swallowed, never failing the cron it rides',
    (await runIsolatedProspectTopUp(async () => { throw new Error('directory redesigned') },
      { env: { [SOURCING_FLAG]: 'true', VERCEL_ENV: 'production' } })).status === 'error')

  const cronSource = readFileSync(
    join(__dirname, '..', '..', '..', 'app', 'api', 'content', 'automation', 'cron', 'route.ts'), 'utf8')
  check('G4: and the 15-minute cron is what calls it',
    /runIsolatedProspectTopUp\(\)/.test(cronSource))

  console.log('\n— mutation controls —')

  const mutRobots = await withMutant<{ qualifyBusiness: typeof qualifyBusiness }, boolean>(
    'lib/outreach/qualify.ts',
    [[/    if \(!allowed\) return \{ ok: false, reason: 'robots_disallowed', pagesRead \}/, '    void allowed']],
    async (m) => {
      const v = await m.qualifyBusiness(CANDIDATE, site({
        robots: 'User-agent: *\nDisallow: /',
        home: `<html>${SHOPIFY}${US_ADDRESS}${CONTACT}</html>`,
      }))
      return v.ok === true
    },
  )
  check('Q2-MUT: a crawler that ignored robots.txt would qualify a site that said no',
    mutRobots === true)

  const mutEurope = await withMutant<{ qualifyBusiness: typeof qualifyBusiness }, boolean>(
    'lib/outreach/qualify.ts',
    [[/  if \(europeanSignal !== null\) \{/, '  if (false) {']],
    async (m) => {
      const v = await m.qualifyBusiness(CANDIDATE, site({
        home: `<html>${SHOPIFY}${US_ADDRESS}${CONTACT}</html>`,
        about: '<html><p>Musterstrasse 4, 10115 Berlin, Germany</p></html>',
      }))
      return v.ok === true
    },
  )
  check('Q4-MUT: without that check a Berlin address would enter a US-only list',
    mutEurope === true)

  const mutHarvest = await withMutant<{ qualifyBusiness: typeof qualifyBusiness }, boolean>(
    'lib/outreach/qualify.ts',
    [[/  if \(forbidden\) return \{ ok: false, reason: 'harvesting_notice', pagesRead \}/, '  void forbidden']],
    async (m) => {
      const v = await m.qualifyBusiness(CANDIDATE, site({
        home: `<html>${SHOPIFY}${US_ADDRESS}</html>`,
        contact: `<html>${CONTACT}<p>No automated collection or scraping of this site is permitted.</p></html>`,
      }))
      return v.ok === true
    },
  )
  check('Q6-MUT: without it we would take an address off a page that forbade exactly that',
    mutHarvest === true)

  const mutPostal = await withMutant<{ addProspect: typeof addProspect }, boolean>(
    'lib/outreach/topup.ts',
    [[/  if \(state === null \|\| !US_STATES\.includes\(state\[1\]\)\) return 'rejected: not a US state'/, '  void state']],
    async (m) => {
      const broken = empty()
      const outcome = await m.addProspect(asAdmin(broken), { ...draft, postalAddress: '4 Rue de Rivoli, 75001 Paris' })
      return outcome === 'added'
    },
  )
  check('T3-MUT: without the writer\'s own US check a Paris address would be written',
    mutPostal === true)

  const mutSuppression = await withMutant<{ addProspect: typeof addProspect }, boolean>(
    'lib/outreach/topup.ts',
    [[/  if \(suppression\.suppressed\) \{/, '  if (false) {']],
    async (m) => {
      const broken = new FakeAdmin({
        [PROSPECTS_TABLE]: [],
        [SUPPRESSION_TABLE]: [{ email_hash: hashEmail(draft.email) }],
      })
      return await m.addProspect(asAdmin(broken), draft) === 'added'
    },
  )
  const mutPostalPage = await withMutant<{ qualifyBusiness: typeof qualifyBusiness }, boolean>(
    'lib/outreach/qualify.ts',
    [[/      if \(postal !== null\) postalPage = page\.url \|\| `https:\/\/\$\{host\}\$\{path\}`/, '']],
    async (m) => {
      const v = await m.qualifyBusiness(CANDIDATE, site({
        home: `<html>${SHOPIFY}</html>`,
        contact: `<html>${SHOPIFY}${US_ADDRESS}${CONTACT}</html>`,
      }))
      // It would fall back to the home page, which does not carry the address:
      // a URL that reads as evidence and is not.
      return v.ok === true && v.draft.postalPage === 'https://store.example/'
    },
  )
  check('Q1d-MUT: a page recorded after the fact would name a page without the address',
    mutPostalPage)

  check('T2-MUT: and without the suppression check somebody who opted out would come back',
    mutSuppression === true)

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
