/**
 * POSTAL-CODE RANK TRACKING MUST USE THE PROJECT'S OWN COUNTRY, NOT THE
 * UNITED STATES.
 *
 * The defect this suite exists to prevent, measured on main 2e90e3fe:
 *   1. `resolveUSZIP` constrained Nominatim to `countrycodes=us` and then fell
 *      back to a text query that appended the words "United States".
 *   2. The whole `locationMode === 'zip'` branch passed the literal `'us', 'en'`
 *      to `querySerperMaps` and to `buildAudit` — seven call sites — so even a
 *      successful geocode was followed by a request to the American Google in
 *      English.
 * Every other location mode in the same file already used the project's
 * country and language. Only this branch diverged.
 *
 * It matters commercially because Italy, Brazil and Spain are the only markets
 * where gotopseo.com is near page one, and the pages that rank there are the
 * rank-tracking feature pages.
 *
 * What is checked:
 *   A. Source: no `'us', 'en'` literal, no `countrycodes=us`, no "United
 *      States" string, and the ZIP branch resolves with the project country.
 *   B. Behaviour, Italy: gl=it and hl=it reach Serper, and the geocoder is
 *      asked with `countrycodes=it`.
 *   C. Behaviour, United States: unchanged — the bundled dataset answers with
 *      no network geocoding at all, and gl=us still reaches Serper.
 *   D. `countryToNominatimCode` passes any two-letter ISO code and drops
 *      anything else, via a real `geocodeAddress` call.
 *   E. MUTATION CONTROLS for every source guard.
 *
 * Run: npx tsx lib/scanner/__qa__/postal-code-locale.qa.ts
 */
import { readFileSync } from 'fs'
import { scanGoogleMaps } from '../google-maps'
import { geocodeAddress } from '../../geocoding'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Source guards match code, never comments. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
}

const MAPS_SRC = stripComments(readFileSync('lib/scanner/google-maps.ts', 'utf8'))
const GEO_SRC = stripComments(readFileSync('lib/geocoding.ts', 'utf8'))

// ---------------------------------------------------------------- A. source
console.log('\nA. The source carries no American default')
const guardNoUsEnLiteral = (src: string) => !/'us',\s*'en'/.test(src)
const guardNoUsCountryCode = (src: string) => !/countrycodes=us/.test(src)
const guardNoUnitedStatesText = (src: string) => !/United States/.test(src)
const guardZipUsesProjectCountry = (src: string) => /resolvePostalCode\(postalCode,\s*country\)/.test(src)

check('no `\'us\', \'en\'` literal left in the maps scanner', guardNoUsEnLiteral(MAPS_SRC))
check('no `countrycodes=us` left in the maps scanner', guardNoUsCountryCode(MAPS_SRC))
check('no hardcoded "United States" query text', guardNoUnitedStatesText(MAPS_SRC))
check('the ZIP branch resolves with the project country', guardZipUsesProjectCountry(MAPS_SRC))
check('the shared geocoder no longer whitelists three countries',
  !/c === 'us' \|\| c === 'il' \|\| c === 'gb'/.test(GEO_SRC))

// ------------------------------------------------------------- the stub net
interface Seen { url: string; body?: Record<string, unknown> }
function installNet(opts: { places?: unknown[]; geocodeHit?: boolean }) {
  const seen: Seen[] = []
  const real = globalThis.fetch
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (url.startsWith('https://google.serper.dev/')) {
      seen.push({ url, body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> })
      return new Response(JSON.stringify({ places: opts.places ?? [] }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.startsWith('https://nominatim.openstreetmap.org/')) {
      seen.push({ url })
      const body = opts.geocodeHit === false ? [] : [{ lat: '45.4642', lon: '9.1900', display_name: 'Milano' }]
      return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    if (url.startsWith('https://maps.googleapis.com/')) {
      seen.push({ url })
      return new Response(JSON.stringify({ status: 'ZERO_RESULTS' }), { status: 200, headers: { 'content-type': 'application/json' } })
    }
    throw new Error(`unexpected request in QA: ${url}`)
  }) as typeof globalThis.fetch
  return { seen, restore: () => { globalThis.fetch = real } }
}

const PLACES = [{ title: 'Pizzeria Da Mario', address: 'Via Roma 1, Milano', position: 1, website: 'https://damario.it', latitude: 45.4642, longitude: 9.19 }]

async function run() {
  const prevSerper = process.env.SERPER_API_KEY
  const prevGeoKey = process.env.GOOGLE_GEOCODING_API_KEY
  process.env.SERPER_API_KEY = 'test-key'
  delete process.env.GOOGLE_GEOCODING_API_KEY // force the Nominatim leg, which is the one that carried the bug

  // ------------------------------------------------------------ B. Italy
  console.log('\nB. An Italian project is tracked in Italy, in Italian')
  {
    const net = installNet({ places: PLACES })
    const out = await scanGoogleMaps({
      engine: 'google_maps', keyword: 'pizzeria milano', targetBusinessName: 'Pizzeria Da Mario',
      country: 'IT', language: 'it', locationMode: 'zip', postalCode: '20121',
    })
    net.restore()
    const serper = net.seen.find((s) => s.url.includes('serper.dev'))
    const geo = net.seen.find((s) => s.url.includes('nominatim'))
    check('Serper was called', Boolean(serper))
    check('gl=it, not us', serper?.body?.gl === 'it', `gl=${String(serper?.body?.gl)}`)
    check('hl=it, not en', serper?.body?.hl === 'it', `hl=${String(serper?.body?.hl)}`)
    check('the geocoder was constrained to Italy', Boolean(geo && geo.url.includes('countrycodes=it')), geo?.url)
    check('the geocoder was NOT constrained to the United States', !geo?.url.includes('countrycodes=us'))
    check('the business was found', out.found === true, out.error ?? '')
    check('the audit records the Italian country', out.audit?.request.gl === 'it', String(out.audit?.request.gl))
  }

  // ------------------------------------------- C. the United States is unchanged
  console.log('\nC. The United States behaves exactly as before')
  {
    const net = installNet({ places: [{ title: 'Joe Plumbing', address: '1 Main St', position: 1, latitude: 40.75, longitude: -73.99 }] })
    const out = await scanGoogleMaps({
      engine: 'google_maps', keyword: 'plumber', targetBusinessName: 'Joe Plumbing',
      country: 'US', language: 'en', locationMode: 'zip', postalCode: '10001',
    })
    net.restore()
    const serper = net.seen.find((s) => s.url.includes('serper.dev'))
    check('gl=us is still sent for a US project', serper?.body?.gl === 'us', String(serper?.body?.gl))
    check('hl=en is still sent for a US project', serper?.body?.hl === 'en', String(serper?.body?.hl))
    check('a known US ZIP needs NO network geocoding', !net.seen.some((s) => s.url.includes('nominatim') || s.url.includes('maps.googleapis')))
    check('the US scan still finds its business', out.found === true, out.error ?? '')
  }

  // ------------------------------------------------ D. the country code mapping
  console.log('\nD. Any two-letter ISO code reaches the geocoder')
  for (const [country, expected] of [['br', 'countrycodes=br'], ['ES', 'countrycodes=es'], ['pt-BR', null]] as Array<[string, string | null]>) {
    const net = installNet({})
    await geocodeAddress('20121', country)
    net.restore()
    const geo = net.seen.find((s) => s.url.includes('nominatim'))
    if (expected) {
      check(`${country} constrains to ${expected}`, Boolean(geo?.url.includes(expected)), geo?.url)
    } else {
      check(`${country} is not a two-letter code, so no constraint is sent`, !geo?.url.includes('countrycodes='), geo?.url)
    }
  }

  // -------------------------------------------------- E. mutation controls
  console.log('\nE. Mutation controls — each guard must fail on broken source')
  check('the `\'us\', \'en\'` guard fails on the old code', !guardNoUsEnLiteral("buildAudit(input, 'us', 'en', x)"))
  check('the countrycodes guard fails on the old code', !guardNoUsCountryCode('const url = `...?postalcode=${z}&countrycodes=us&format=json`'))
  check('the "United States" guard fails on the old code', !guardNoUnitedStatesText('`${zipCode}, United States`'))
  check('the project-country guard fails on the old call', !guardZipUsesProjectCountry('await resolveUSZIP(postalCode)'))

  if (prevSerper === undefined) delete process.env.SERPER_API_KEY; else process.env.SERPER_API_KEY = prevSerper
  if (prevGeoKey !== undefined) process.env.GOOGLE_GEOCODING_API_KEY = prevGeoKey

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void run()

export {}
