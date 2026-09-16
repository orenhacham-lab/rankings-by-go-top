/**
 * THE GOOGLE ADS API VERSION: one declaration, and an alarm before it expires.
 *
 * WHAT WENT WRONG. Google discontinued v22 on 7 October 2026 and mailed us
 * because our developer token was still calling it. The version lived in SIX
 * places: the export in lib/google-ads/client.ts, three routes that each
 * declared a private `const GOOGLE_ADS_API_VERSION` of their own instead of
 * importing it, and two URLs in the debug route with `v22` written into the
 * string. Bumping "the constant" would have moved one of six.
 *
 * Nothing would have failed at the moment of that mistake. The four stragglers
 * would have kept working until the sunset date and then stopped together,
 * taking keyword research, search volume and the keyword-seeded content
 * recommendations with them — with no error anywhere pointing at the cause.
 *
 * So this suite asserts two different things:
 *
 *   A. THE SHAPE — one declaration, no literal versions, every URL built by
 *      `googleAdsUrl`. A guard that fails the moment a second copy appears is
 *      worth more than a correct value today.
 *   B. THE CLOCK — the configured version is checked against Google's sunset
 *      schedule and this suite FAILS once it is within 30 days of expiry. The
 *      thing that was missing last time was not knowledge, it was a deadline
 *      that announced itself.
 *
 * A live probe (C) runs only with GOOGLE_ADS_LIVE_PROBE=1, so the suite stays
 * offline by default. It needs no credentials: Google routes before it
 * authenticates, so a version that exists and serves a method answers 401
 * while an unknown version answers 404 — enough to prove the version we ship
 * is one Google still serves.
 *
 * Run:      npx tsx lib/google-ads/__qa__/api-version.qa.ts
 * With net: GOOGLE_ADS_LIVE_PROBE=1 npx tsx lib/google-ads/__qa__/api-version.qa.ts
 */

/* eslint-disable @typescript-eslint/no-require-imports */
const { readFileSync, readdirSync, statSync } = require('fs')
const { join } = require('path')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Comments stripped: this file and client.ts both NAME the old version while
 *  explaining the incident, and a guard defeated by its own documentation
 *  teaches the next author to delete the explanation. */
const stripComments = (src: string) => src
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/**
 * Every .ts/.tsx of PRODUCT source — the code that ships and calls Google.
 *
 * `__qa__` and `__tests__` are excluded on purpose: the live probe below has to
 * name a bogus version URL as its control, and a guard that flags its own
 * control is a guard nobody keeps. Nothing under these directories is deployed,
 * so a version literal there cannot reach Google.
 */
function sourceFiles(): string[] {
  const out: string[] = []
  const skip = new Set(['node_modules', '.next', '.git', 'coverage', 'dist', '__qa__', '__tests__'])
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (skip.has(entry)) continue
      const full = join(dir, entry)
      if (statSync(full).isDirectory()) walk(full)
      else if (/\.tsx?$/.test(entry)) out.push(full.slice(ROOT.length + 1))
    }
  }
  for (const top of ['app', 'lib', 'components']) {
    try { walk(join(ROOT, top)) } catch { /* absent */ }
  }
  return out
}

/**
 * Google sunsets a major version twelve months after release. Dates Google has
 * announced; v23-v25 were published to the month, so the 1st is used, which
 * errs early — the right direction for an expiry alarm.
 */
const SUNSETS: Record<string, string> = {
  v22: '2026-10-07',  // the discontinuation notice that prompted this
  v23: '2027-02-01',
  v24: '2027-05-01',
  v25: '2027-08-01',
}
/** How much warning is useful: long enough to schedule, short enough to mean it. */
const WARN_DAYS = 30

async function main() {
  console.log('Google Ads API version: one declaration, and a deadline that announces itself\n')

  const { GOOGLE_ADS_API_VERSION, googleAdsUrl } = require('../client')
  const clientSrc = stripComments(read('lib/google-ads/client.ts'))

  // ── A) the shape ─────────────────────────────────────────────────────────
  console.log('A) one declaration, no literals')
  {
    const files = sourceFiles()
    check('A1: the suite is actually scanning the source tree', files.length > 100, `${files.length} files`)

    const declarers = files.filter((f) => /GOOGLE_ADS_API_VERSION\s*=/.test(stripComments(read(f))))
    check('A2: exactly ONE file declares the version', declarers.length === 1, JSON.stringify(declarers))
    check('A3: and it is lib/google-ads/client.ts', declarers[0] === 'lib/google-ads/client.ts', String(declarers[0]))

    // The failure that actually happened: a route with a private copy.
    const localCopies = files.filter((f) => f !== 'lib/google-ads/client.ts'
      && /^\s*const\s+GOOGLE_ADS_API_VERSION/m.test(stripComments(read(f))))
    check('A4: no route keeps a private copy of it', localCopies.length === 0, JSON.stringify(localCopies))

    // The other half: a version written straight into a URL.
    const hardcoded = files.filter((f) => /googleads\.googleapis\.com\/v\d+/.test(stripComments(read(f))))
    check('A5: no source file hardcodes a version into a Google Ads URL', hardcoded.length === 0, JSON.stringify(hardcoded))

    // …and the host itself may only be written in client.ts, so there is no
    // way to build one of these URLs without going through the builder.
    const hosts = files.filter((f) => f !== 'lib/google-ads/client.ts'
      && /googleads\.googleapis\.com/.test(stripComments(read(f))))
    check('A6: only client.ts names the Google Ads host at all', hosts.length === 0, JSON.stringify(hosts))

    check('A7: the builder is exported for everyone else to use',
      /export function googleAdsUrl/.test(clientSrc))
  }

  // ── B) the builder ───────────────────────────────────────────────────────
  console.log('\nB) the builder produces the URLs the routes need')
  {
    const u = googleAdsUrl('customers/123:generateKeywordIdeas')
    check('B1: it builds a full, versioned URL',
      u === `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers/123:generateKeywordIdeas`, u)
    check('B2: a leading slash does not produce a double slash',
      googleAdsUrl('/customers:listAccessibleCustomers')
        === `https://googleads.googleapis.com/${GOOGLE_ADS_API_VERSION}/customers:listAccessibleCustomers`,
      googleAdsUrl('/customers:listAccessibleCustomers'))
    check('B3: it carries a query string through untouched',
      googleAdsUrl('customers/1?fields=customer.id').endsWith('/customers/1?fields=customer.id'))
    check('B4: it tracks the constant rather than repeating it',
      u.includes(`/${GOOGLE_ADS_API_VERSION}/`) && !/\/v22\//.test(u))
  }

  // ── C) the clock ─────────────────────────────────────────────────────────
  console.log('\nC) the configured version is one Google still answers')
  {
    check('C1: the version is well-formed', /^v\d+$/.test(GOOGLE_ADS_API_VERSION), GOOGLE_ADS_API_VERSION)

    const sunset = SUNSETS[GOOGLE_ADS_API_VERSION]
    check('C2: its sunset date is known to this suite', Boolean(sunset),
      `${GOOGLE_ADS_API_VERSION} is not in the table — add it with Google's announced sunset date`)

    if (sunset) {
      const daysLeft = Math.floor((Date.parse(sunset) - Date.now()) / 86_400_000)
      check(`C3: ${GOOGLE_ADS_API_VERSION} has not been discontinued (sunset ${sunset})`,
        daysLeft > 0, `it expired ${-daysLeft} days ago — migrate now, the API is refusing calls`)
      check(`C4: and is not about to be (>${WARN_DAYS} days of runway)`,
        daysLeft > WARN_DAYS,
        `only ${daysLeft} days left — bump GOOGLE_ADS_API_VERSION in lib/google-ads/client.ts`)
      console.log(`    → ${daysLeft} days of runway on ${GOOGLE_ADS_API_VERSION}`)
    }

    // The version we just left must not be the one we ship.
    check('C5: we are not shipping the version Google discontinued',
      GOOGLE_ADS_API_VERSION !== 'v22', 'v22 stopped accepting requests on 2026-10-07')
  }

  // ── D) live probe, opt-in ────────────────────────────────────────────────
  if (process.env.GOOGLE_ADS_LIVE_PROBE === '1') {
    console.log('\nD) live probe against googleads.googleapis.com (no credentials, no quota)')
    const probe = async (method: string, path: string): Promise<number> => {
      try {
        const res = await fetch(googleAdsUrl(path), method === 'POST'
          ? { method, headers: { 'Content-Type': 'application/json' }, body: '{}' }
          : { method })
        return res.status
      } catch { return 0 }
    }
    // A bogus version is the control: without it, 401 everywhere proves nothing.
    const bogus = await (async () => {
      try {
        const res = await fetch('https://googleads.googleapis.com/v0/customers:listAccessibleCustomers')
        return res.status
      } catch { return 0 }
    })()
    check('D1: an unknown version answers 404, so 401 is meaningful', bogus === 404, String(bogus))

    for (const [label, method, path] of [
      ['generateKeywordIdeas', 'POST', 'customers/5539505456:generateKeywordIdeas'],
      ['generateKeywordHistoricalMetrics', 'POST', 'customers/5539505456:generateKeywordHistoricalMetrics'],
      ['listAccessibleCustomers', 'GET', 'customers:listAccessibleCustomers'],
    ] as const) {
      const status = await probe(method, path)
      check(`D2-${label}: served on ${GOOGLE_ADS_API_VERSION}`, status === 401,
        `HTTP ${status} (404 would mean this version no longer offers it)`)
    }
  } else {
    console.log('\nD) live probe skipped (set GOOGLE_ADS_LIVE_PROBE=1 to run it)')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { console.error(e); process.exitCode = 1 })
export {}
