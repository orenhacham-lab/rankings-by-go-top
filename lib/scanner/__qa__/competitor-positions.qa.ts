/**
 * QA: competitor positions, read from the result page the rank scan ALREADY
 * fetches (W10, "you vs. your competitors").
 *
 * The scanner locates the project's competitors in the same organic list it
 * reads for the project's own position. This suite holds it to the rules the
 * brief set, against recorded Serper pages (./serper-fixtures.ts) served by a
 * fetch stand-in that counts every provider request (./serper-harness.ts):
 *
 *   A. extraction from a recorded organic list: positions 1-20, null when a
 *      competitor is absent, and the scanner's own domain normalization
 *      (www., case, scheme, subdomains, redirects, sitelinks, look-alikes);
 *   B. zero extra Serper calls: the same number of requests, byte-identical,
 *      with and without competitors, in organic and radius mode;
 *   C. the project's own result unchanged: every field identical to the
 *      output of the UNMODIFIED scanner, frozen in original-scanner-outputs.json
 *      (generated from the pre-change checkout), with and without competitors;
 *   D. radius / local mode uses the project's radius semantics (link only,
 *      numbered per point, best across the points that answered, top 20);
 *   E. a failure inside the competitor lookup never fails the scan and is
 *      logged as a stable code, never provider text.
 *
 * Mutation controls for these guards are run by breaking the code on purpose
 * (see the W10 report); each one turns a check below red.
 *
 * Run: npx tsx lib/scanner/__qa__/competitor-positions.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.SERPER_API_KEY = 'qa-serper'

const Module: any = require('module')
const origLoad = Module._load
/** Set by section E: the named competitor helper throws, as a bug in it would. */
let BREAK_HELPER: string | null = null
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  const real = origLoad.call(this, request, parent, isMain)
  if (resolved.endsWith('lib/scanner/competitor-positions.ts')) {
    return new Proxy(real, {
      get: (t: any, k: string) => (BREAK_HELPER && k === BREAK_HELPER
        ? () => { throw new Error('upstream exploded: secret-provider-detail') }
        : t[k]),
    })
  }
  return real
}

const { readFileSync } = require('fs')
const { join } = require('path')
const { scanGoogleSearch } = require('../google-search')
const { normalizeDomain } = require('../domain-match')
const { normalizeCompetitorDomains, locateCompetitorsInOrganic, locateCompetitorsAcrossPoints } = require('../competitor-positions')
const { installSerperFetch, quietly } = require('./serper-harness')
const { PAGE_1, PAGE_2, EMPTY_PAGE, PROJECT_DOMAIN, RADIUS_POINTS, RADIUS_ALL_FAIL } = require('./serper-fixtures')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const same = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b)
const withoutCompetitors = (o: Record<string, unknown>) => { const { competitorPositions: _omit, ...rest } = o; void _omit; return rest }

/** The competitors as a merchant types them: case, scheme, www., paths, a duplicate. */
const CONFIGURED = [
  ' https://WWW.Rival-Shoes.com/ ',  // m.rival-shoes.com at 3 (subdomain); rival-shoes.com again at 11
  'competitor-b.co.il',              // only behind a Google redirect at 4
  'ival-shoes.com',                  // a suffix of rival-shoes.com, but not its domain: never matches
  'competitor-c.com',                // shop.competitor-c.com at 12 (page 2)
  'http://competitor-d.net/deals',   // only in an aggregator's sitelinks at 13
  'www.competitor-f.com',            // page 1's eleventh result is cut; found at 17
  'absent-competitor.org',           // not on the page at all
  'rival-shoes.com/other-path',      // the same domain again: one entry
]
const NORMALIZED = ['rival-shoes.com', 'competitor-b.co.il', 'ival-shoes.com', 'competitor-c.com',
  'competitor-d.net', 'competitor-f.com', 'absent-competitor.org']

const BASE = { engine: 'google_search', keyword: 'נעלי ריצה תל אביב', country: 'IL', language: 'he', city: 'Tel Aviv', deviceType: 'desktop' }
const RADIUS = { lat: 35.32, lng: -119.08, centerZip: '93313', radiusMiles: 5 }
const SCENARIOS: Record<string, { input: any; pages?: any; sequence?: any }> = {
  N1: { input: { ...BASE, targetDomain: PROJECT_DOMAIN, locationMode: 'project' }, pages: { 1: PAGE_1, 2: PAGE_2 } },
  N2: { input: { ...BASE, targetDomain: 'absent-site.com', locationMode: 'project' }, pages: { 1: PAGE_1, 2: PAGE_2 } },
  N3: { input: { ...BASE, targetDomain: PROJECT_DOMAIN, locationMode: 'project' }, pages: { 1: PAGE_1, 2: 'http_500' } },
  N4: { input: { ...BASE, targetDomain: PROJECT_DOMAIN, locationMode: 'project' }, pages: { 1: 'http_500', 2: PAGE_2 } },
  N5: { input: { ...BASE, targetDomain: PROJECT_DOMAIN, locationMode: 'project' }, pages: { 1: EMPTY_PAGE(1), 2: EMPTY_PAGE(2) } },
  N6: { input: { ...BASE, targetDomain: 'competitor-c.com', locationMode: 'exact_point', exactPoint: { lat: 32.08, lng: 34.78 } }, pages: { 1: PAGE_1, 2: PAGE_2 } },
  N7: { input: { ...BASE, targetDomain: 'competitor-d.net', locationMode: 'project' }, pages: { 1: PAGE_1, 2: PAGE_2 } },
  N8: { input: { ...BASE, targetDomain: 'competitor-b.co.il', locationMode: 'custom', city: 'Haifa' }, pages: { 1: PAGE_1, 2: PAGE_2 } },
  R1: { input: { ...BASE, country: 'US', language: 'en', city: null, targetDomain: PROJECT_DOMAIN, locationMode: 'radius', radiusCenter: RADIUS }, sequence: RADIUS_POINTS },
  R2: { input: { ...BASE, country: 'US', language: 'en', city: null, targetDomain: PROJECT_DOMAIN, locationMode: 'radius', radiusCenter: RADIUS }, sequence: RADIUS_ALL_FAIL },
  R3: { input: { ...BASE, country: 'US', language: 'en', city: null, targetDomain: 'rival-shoes.com', locationMode: 'radius', radiusCenter: RADIUS }, sequence: RADIUS_POINTS },
}
/** What the UNMODIFIED scanner returned for each scenario, and the requests it made. */
const ORIGINAL: Record<string, { result: any; calls: number; bodies: any[] }> =
  JSON.parse(readFileSync(join(__dirname, 'original-scanner-outputs.json'), 'utf8'))

async function run(name: string, competitorDomains?: unknown) {
  const s = SCENARIOS[name]
  const net = installSerperFetch({ pages: s.pages, sequence: s.sequence })
  const errors: string[] = []
  const realError = console.error
  try {
    const result = await quietly(async () => {
      console.error = (...a: unknown[]) => { errors.push(a.map(String).join(' ')) }
      return scanGoogleSearch(competitorDomains === undefined ? s.input : { ...s.input, competitorDomains })
    })
    return { result, calls: net.log.length, bodies: net.log.map((l: any) => l.body), errors }
  } finally { net.restore(); console.error = realError }
}

/** The organic list exactly as the scanner builds it: page 1 capped at ten, page 2 numbered 11-20. */
function combinedList() {
  return [
    ...PAGE_1.organic.slice(0, 10).map((r: any, i: number) => ({ ...r, position: i + 1 })),
    ...PAGE_2.organic.slice(0, 10).map((r: any, i: number) => ({ ...r, position: i + 11 })),
  ]
}

async function main() {
  console.log('QA: competitor positions from the page the scan already reads\n')

  console.log('A) extraction from a recorded organic list')
  {
    const domains = normalizeCompetitorDomains(CONFIGURED)
    check('A1: configured domains are normalized like the target, duplicates collapse, order kept',
      same(domains, NORMALIZED), JSON.stringify(domains))
    check('A2: the SAME function as the target: normalizeDomain(raw.trim()) for every entry',
      CONFIGURED.every((raw) => NORMALIZED.includes(normalizeDomain(raw.trim()))))
    check('A3: the project domain normalizes identically either way',
      normalizeCompetitorDomains([PROJECT_DOMAIN])[0] === normalizeDomain(PROJECT_DOMAIN.trim()), normalizeDomain(PROJECT_DOMAIN.trim()))
    const found = locateCompetitorsInOrganic(combinedList(), domains)
    const at = (d: string) => found.find((x: any) => x.domain === d)
    check('A4: a subdomain counts for its domain, first hit wins (m.rival-shoes.com at 3, not 11)',
      at('rival-shoes.com')?.position === 3 && at('rival-shoes.com')?.url === 'https://m.rival-shoes.com/tlv/running',
      JSON.stringify(at('rival-shoes.com')))
    check('A5: a Google redirect is unwrapped (competitor-b.co.il at 4)', at('competitor-b.co.il')?.position === 4)
    check('A6: a suffix that is not a domain boundary never matches (ival-shoes.com absent)',
      at('ival-shoes.com')?.position === null && at('ival-shoes.com')?.url === null)
    check('A7: page 2 is positions 11-20 (shop.competitor-c.com at 12)', at('competitor-c.com')?.position === 12)
    check('A8: a sitelink counts, the URL is the result that carried it (competitor-d.net at 13)',
      at('competitor-d.net')?.position === 13 && at('competitor-d.net')?.url === 'https://www.aggregator.co.il/best-running-shoes')
    check('A9: page 1 keeps ten results: its eleventh is not a position (competitor-f.com at 17, not 11)',
      at('competitor-f.com')?.position === 17)
    check('A10: absent means null position and null URL', same(at('absent-competitor.org'), { domain: 'absent-competitor.org', position: null, url: null }))
    check('A11: one entry per competitor, in configured order', same(found.map((x: any) => x.domain), NORMALIZED))
    check('A12: nothing outside 1-20 is ever reported',
      found.every((x: any) => x.position === null || (x.position >= 1 && x.position <= 20)))
    const beyond = locateCompetitorsInOrganic([{ link: 'https://x.com/', position: 21 }], ['x.com'])
    check('A13: a position past 20 is recorded as absent', beyond[0].position === null && beyond[0].url === null)
    check('A14: an empty or missing list of competitors is no work at all',
      same(normalizeCompetitorDomains([]), []) && same(normalizeCompetitorDomains(null), []) && same(normalizeCompetitorDomains(['  ', '']), []))
    const ten = normalizeCompetitorDomains(Array.from({ length: 14 }, (_, i) => `c${i}.com`))
    check('A15: at most ten competitors are looked up', ten.length === 10, String(ten.length))
  }

  console.log('\nB) zero additional Serper calls')
  for (const name of Object.keys(SCENARIOS)) {
    const plain = await run(name)
    const withC = await run(name, CONFIGURED)
    check(`B-${name}: ${withC.calls} request(s) with competitors, ${plain.calls} without, ${ORIGINAL[name].calls} before the change`,
      withC.calls === plain.calls && plain.calls === ORIGINAL[name].calls)
    check(`B-${name}: and the request bodies are byte-identical (no competitor ever reaches the provider)`,
      same(withC.bodies, ORIGINAL[name].bodies) && same(plain.bodies, ORIGINAL[name].bodies)
      && !JSON.stringify(withC.bodies).includes('rival-shoes'))
  }

  console.log('\nC) the project\'s own result is unchanged, field by field')
  for (const name of Object.keys(SCENARIOS)) {
    const plain = await run(name)
    const withC = await run(name, CONFIGURED)
    check(`C-${name}: without competitors the output is exactly the unmodified scanner's`,
      same(plain.result, ORIGINAL[name].result), JSON.stringify(plain.result).slice(0, 160))
    check(`C-${name}: with competitors every existing field is identical too (found=${ORIGINAL[name].result.found}, position=${ORIGINAL[name].result.position})`,
      same(withoutCompetitors(withC.result), ORIGINAL[name].result), JSON.stringify(withoutCompetitors(withC.result)).slice(0, 160))
  }
  {
    const n1 = (await run('N1', CONFIGURED)).result
    check('C-N1: with competitors the scan also reports them, one per normalized domain',
      Array.isArray(n1.competitorPositions) && same(n1.competitorPositions.map((x: any) => x.domain), NORMALIZED))
    check('C-N1: …with the positions of section A (scanner and helper agree)',
      same(n1.competitorPositions, locateCompetitorsInOrganic(combinedList(), NORMALIZED)))
    const n3 = (await run('N3', CONFIGURED)).result
    const at3 = (d: string) => n3.competitorPositions?.find((x: any) => x.domain === d)?.position
    check('C-N3: page 2 failed: page-1 competitors kept, page-2 ones absent, exactly like the project',
      at3('rival-shoes.com') === 3 && at3('competitor-b.co.il') === 4 && at3('competitor-c.com') === null && at3('competitor-f.com') === null)
    const n4 = (await run('N4', CONFIGURED)).result
    check('C-N4: page 1 failed: no page was read, so no competitor positions are reported',
      !('competitorPositions' in n4) && n4.error === ORIGINAL.N4.result.error)
    const n5 = (await run('N5', CONFIGURED)).result
    check('C-N5: an empty page was read: every competitor is not in the top 20',
      n5.competitorPositions?.length === NORMALIZED.length && n5.competitorPositions.every((x: any) => x.position === null))
    const none = (await run('N1', [])).result
    check('C-N1: an empty competitor list adds nothing to the output', !('competitorPositions' in none) && same(none, ORIGINAL.N1.result))
  }

  console.log('\nD) radius / local mode: the project\'s own semantics')
  {
    const r1 = (await run('R1', CONFIGURED)).result
    const at = (d: string) => r1.competitorPositions?.find((x: any) => x.domain === d)
    check('D1: the best position across the points that answered (rival: 4, 2, 7 → 2)',
      at('rival-shoes.com')?.position === 2 && at('rival-shoes.com')?.url === 'https://rival-shoes.com/north', JSON.stringify(at('rival-shoes.com')))
    check('D2: the link alone, as for the project: a displayedLink at 2 does not count, the real link at 18 does',
      at('competitor-b.co.il')?.position === 18, JSON.stringify(at('competitor-b.co.il')))
    check('D3: the top-20 window: best of 25 and 22 is still absent',
      at('competitor-c.com')?.position === null && at('competitor-c.com')?.url === null)
    check('D4: the project itself is still 6 and its metadata unchanged',
      r1.position === 6 && same(r1.radiusScanMetadata, ORIGINAL.R1.result.radiusScanMetadata))
    const r3 = (await run('R3', CONFIGURED)).result
    const rivalAsCompetitor = r3.competitorPositions?.find((x: any) => x.domain === 'rival-shoes.com')?.position
    check('D5: a competitor is located exactly where the scanner locates the same domain as a target (both 2)',
      r3.position === 2 && rivalAsCompetitor === 2, `${r3.position} vs ${rivalAsCompetitor}`)
    const r2 = (await run('R2', CONFIGURED)).result
    check('D6: every point failed: nothing was read, so nothing is reported', !('competitorPositions' in r2))
    const direct = locateCompetitorsAcrossPoints([], ['x.com'])
    check('D7: no answered point means no positions at all (null), never "absent"', direct === null)
  }

  console.log('\nE) a failing competitor lookup never fails the scan')
  for (const helper of ['normalizeCompetitorDomains', 'locateCompetitorsInOrganic', 'locateCompetitorsAcrossPoints']) {
    BREAK_HELPER = helper
    try {
      for (const name of helper === 'locateCompetitorsAcrossPoints' ? ['R1'] : ['N1', 'N3']) {
        const broken = await run(name, CONFIGURED)
        check(`E-${helper}-${name}: the scan returns its normal result, without competitor positions`,
          same(broken.result, ORIGINAL[name].result) && broken.calls === ORIGINAL[name].calls,
          JSON.stringify(broken.result).slice(0, 160))
        const logged = broken.errors.join('\n')
        check(`E-${helper}-${name}: logged as a stable code, never the error text`,
          /competitor_positions_failed/.test(logged) && !/secret-provider-detail|upstream exploded/.test(logged), logged.slice(0, 200))
      }
    } finally { BREAK_HELPER = null }
  }
  {
    // A list that cannot even be iterated: normalization throws inside the scanner.
    const hostile: any = ['rival-shoes.com']
    hostile[Symbol.iterator] = () => { throw new Error('upstream exploded: secret-provider-detail') }
    const res = await run('N1', hostile)
    check('E-hostile-input: an unreadable competitor list is ignored and the scan is unchanged',
      same(res.result, ORIGINAL.N1.result) && /competitor_positions_failed/.test(res.errors.join('\n')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })

/* A module, not a global script (see lib/ops/__qa__/keyword-scan-and-volume.qa.ts). */
export {}
