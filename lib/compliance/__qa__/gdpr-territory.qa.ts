/**
 * THE MACHINERY THAT KEEPS THE ART. 27(2)(a) POSITION TRUE.
 *
 * The position itself is in lib/compliance/gdpr-territory.ts: we rely on the
 * exemption from designating a representative in the Union, and the reliance
 * rests on a FACT — that the processing of data about people in the EEA and
 * the United Kingdom is occasional. Two pieces of code are what make the fact
 * hold and what will tell us when it stops:
 *
 *   1. The measurement and advertising loaders are not rendered inside the
 *      territory, so visits from there do not become regular, deliberate
 *      processing of behaviour (which is also the Art. 3(2)(b) hook).
 *   2. An account created from the territory raises an alert the same day,
 *      because from that moment a representative IS owed.
 *
 * Each of those is one edit away from being silently undone — a prop dropped
 * at a call site renders the loader again, a country added to one list and not
 * the other widens or narrows the wrong job — and neither failure shows up in
 * any other suite. That is what this one is for.
 *
 * Six classes of check, each with a MUTATION CONTROL at the end:
 *
 *   A) the territory list is exactly the consent list minus Switzerland,
 *      Canada and Korea, because the GDPR and the UK GDPR reach none of them;
 *   B) the header this module reads is the header the CDN actually sets;
 *   C) membership, including the REVERSED failure direction — an unknown
 *      country is outside here and inside in eprivacy-territory.ts;
 *   D) the alert fires for the territory and for a new account only;
 *   E) the alert never puts an unescaped address in the operator's inbox;
 *   F) the call sites: the layout passes the flag to both loaders, each loader
 *      returns null when it is set, and the sign-in funnel sends the alert.
 *
 * Run: npx tsx lib/compliance/__qa__/gdpr-territory.qa.ts
 */
import { readFileSync } from 'fs'
import {
  GDPR_COUNTRY_HEADER,
  GDPR_TERRITORY_COUNTRIES,
  inGdprTerritory,
  gdprTerritoryForRequest,
} from '../gdpr-territory'
import {
  buildGdprTerritorySignupHtml,
  notifyGdprTerritorySignup,
  FRESH_ACCOUNT_MS,
} from '../gdpr-territory-alert'
import { CONSENT_REQUIRED_COUNTRIES, consentRequiredForCountry } from '../../consent/eprivacy-territory'
import { COUNTRY_HEADER } from '../../billing/server-market'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const read = (path: string) => readFileSync(path, 'utf8')
/** Source guards match code, not prose: these files explain themselves at length. */
const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

console.log('A) the list is the consent list minus the three countries the GDPR does not reach')
{
  const sorted = (xs: readonly string[]) => [...xs].sort().join(',')
  const expected = CONSENT_REQUIRED_COUNTRIES.filter((c) => c !== 'CH' && c !== 'CA' && c !== 'KR')
  check('A1: GDPR territory === consent territory minus CH, CA and KR',
    sorted(GDPR_TERRITORY_COUNTRIES) === sorted(expected), sorted(GDPR_TERRITORY_COUNTRIES))
  check('A2: Switzerland is NOT in it (FADP is not the GDPR)', !GDPR_TERRITORY_COUNTRIES.includes('CH'))
  check('A3: Canada is NOT in it (Law 25 is not the GDPR)', !GDPR_TERRITORY_COUNTRIES.includes('CA'))
  check('A3b: Korea is NOT in it (개인정보 보호법 is not the GDPR)', !GDPR_TERRITORY_COUNTRIES.includes('KR'))
  check('A4: all 27 member states are in it',
    ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU', 'IE',
      'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']
      .every((c) => GDPR_TERRITORY_COUNTRIES.includes(c)))
  check('A5: the three non-EU EEA states are in it (JCD 154/2018)',
    ['IS', 'LI', 'NO'].every((c) => GDPR_TERRITORY_COUNTRIES.includes(c)))
  check('A6: the United Kingdom is in it, on the UK GDPR', GDPR_TERRITORY_COUNTRIES.includes('GB'))
  check('A7: the list is frozen', Object.isFrozen(GDPR_TERRITORY_COUNTRIES))
}

console.log('\nB) the header is the one the CDN sets')
{
  check('B1: GDPR_COUNTRY_HEADER is byte-identical to the billing COUNTRY_HEADER',
    GDPR_COUNTRY_HEADER === COUNTRY_HEADER, `${GDPR_COUNTRY_HEADER} / ${COUNTRY_HEADER}`)
  check('B2: and it is read from a request', gdprTerritoryForRequest({ get: () => 'DE' }) === true)
}

console.log('\nC) membership, and the failure direction that is REVERSED on purpose')
{
  check('C1: a German visitor is inside', inGdprTerritory('DE') === true)
  check('C2: a British visitor is inside', inGdprTerritory('GB') === true)
  check('C3: an Icelandic visitor is inside', inGdprTerritory('IS') === true)
  check('C4: an Israeli visitor is outside', inGdprTerritory('IL') === false)
  check('C5: an American visitor is outside', inGdprTerritory('US') === false)
  check('C6: a Swiss visitor is outside HERE but needs consent THERE',
    inGdprTerritory('CH') === false && consentRequiredForCountry('CH') === true)
  check('C7: a Canadian visitor is outside HERE but needs consent THERE',
    inGdprTerritory('CA') === false && consentRequiredForCountry('CA') === true)
  check('C7b: a Korean visitor is outside HERE but needs consent THERE',
    inGdprTerritory('KR') === false && consentRequiredForCountry('KR') === true)
  check('C8: an absent country is OUTSIDE here and INSIDE there',
    inGdprTerritory(null) === false && consentRequiredForCountry(null) === true)
  check('C9: an unplaceable country is OUTSIDE here and INSIDE there',
    inGdprTerritory('XX') === false && consentRequiredForCountry('XX') === true)
  check('C10: case and padding do not matter', inGdprTerritory(' de ') === true)
  check('C11: anything that is not two letters is outside',
    inGdprTerritory('') === false && inGdprTerritory('DEU') === false && inGdprTerritory('D') === false)
}

async function sectionD() {
  console.log('\nD) the alert fires exactly when a representative becomes owed')

  const ENV = { RESEND_API_KEY: 'k', RESEND_FROM_EMAIL: 'a@b.c' }
  const spy = () => {
    const sent: { subject: string; html: string }[] = []
    return { sent, send: async (m: { subject: string; html: string }) => { sent.push(m); return { ok: true } } }
  }
  const now = new Date('2026-11-07T04:00:00Z')
  const fresh = new Date(now.getTime() - 60_000).toISOString()
  const old = new Date(now.getTime() - FRESH_ACCOUNT_MS - 60_000).toISOString()

  const de = spy()
  const r1 = await notifyGdprTerritorySignup(
    { country: 'DE', email: 'kunde@example.de', accountCreatedAt: fresh, now }, { env: ENV, send: de.send })
  check('D1: a new German account sends one alert', r1.sent === true && de.sent.length === 1)
  check('D2: the subject names the country and the decision',
    de.sent[0]!.subject.includes('DE') && de.sent[0]!.subject.includes('נציג'))
  check('D3: the body says what to do, not only what happened',
    de.sent[0]!.html.includes('למנות נציג באיחוד') && de.sent[0]!.html.includes('27(2)'))

  const il = spy()
  const r2 = await notifyGdprTerritorySignup(
    { country: 'IL', email: 'a@b.c', accountCreatedAt: fresh, now }, { env: ENV, send: il.send })
  check('D4: an Israeli account sends nothing',
    r2.sent === false && r2.reason === 'outside_territory' && il.sent.length === 0)

  const returning = spy()
  const r3 = await notifyGdprTerritorySignup(
    { country: 'FR', email: 'a@b.c', accountCreatedAt: old, now }, { env: ENV, send: returning.send })
  check('D5: a RETURNING French customer signing in sends nothing',
    r3.sent === false && r3.reason === 'not_new' && returning.sent.length === 0)

  const unknownAge = spy()
  const r4 = await notifyGdprTerritorySignup(
    { country: 'FR', accountCreatedAt: 'not a date', now }, { env: ENV, send: unknownAge.send })
  check('D6: an unreadable creation time sends nothing rather than a false alarm',
    r4.sent === false && r4.reason === 'unknown_age' && unknownAge.sent.length === 0)

  const off = spy()
  const r5 = await notifyGdprTerritorySignup(
    { country: 'DE', accountCreatedAt: fresh, now },
    { env: { ...ENV, OPERATOR_ALERTS_DISABLED: 'true' }, send: off.send })
  check('D7: the operator-alerts kill switch is honoured',
    r5.sent === false && r5.reason === 'disabled' && off.sent.length === 0)

  const thrower = async () => { throw new Error('provider down') }
  const r6 = await notifyGdprTerritorySignup(
    { country: 'DE', accountCreatedAt: fresh, now }, { env: ENV, send: thrower })
  check('D8: a provider failure is swallowed and never reaches the caller as a throw',
    r6.sent === false && typeof r6.reason === 'string')
}

console.log('\nE) nothing a person chose reaches the inbox as markup')
{
  const html = buildGdprTerritorySignupHtml({
    country: 'DE',
    email: '"><script>alert(1)</script>@example.de',
    when: new Date('2026-11-07T04:00:00Z'),
  })
  check('E1: an address carrying a tag is escaped', !html.includes('<script>'))
  check('E2: and it is still readable', html.includes('&lt;script&gt;'))
}

console.log('\nF) the call sites, so none of this can be dropped by accident')
{
  const layout = stripComments(read('app/layout.tsx'))
  check('F1: the layout resolves the territory once from the country it already reads',
    /const gdprTerritory = inGdprTerritory\(country\)/.test(layout))
  check('F2: and passes it to the Google loader',
    /<GoogleTags gdprTerritory=\{gdprTerritory\} \/>/.test(layout))
  check('F3: and to the Meta loader',
    /<MetaPixel gdprTerritory=\{gdprTerritory\} \/>/.test(layout))
  check('F4: the country is read once, not twice',
    (layout.match(/await requestCountry\(\)/g) || []).length === 1)

  for (const [file, name] of [['components/consent/GoogleTags.tsx', 'GoogleTags'],
    ['components/consent/MetaPixel.tsx', 'MetaPixel']] as const) {
    const src = stripComments(read(file))
    check(`F5 (${name}): takes the flag and renders nothing in the territory`,
      new RegExp(`export function ${name}\\(\\{ gdprTerritory = false \\}`).test(src)
      && /if \(gdprTerritory\) return null/.test(src))
    check(`F6 (${name}): the loader itself is a separate component, so its hooks stay unconditional`,
      new RegExp(`function ${name}Loader\\(\\) \\{`).test(src))
  }

  const callback = stripComments(read('app/api/auth/callback/route.ts'))
  check('F7: the sign-in funnel sends the alert',
    /notifyGdprTerritorySignup\(\{/.test(callback))
  check('F8: with the request country, not a project country',
    /country: \(await headers\(\)\)\.get\(GDPR_COUNTRY_HEADER\)/.test(callback))
  check('F9: only for a fresh sign-up',
    callback.indexOf('notifyGdprTerritorySignup(') > callback.indexOf('isFreshSignup(user)'))
  check('F10: and it cannot fail the sign-in',
    /\[gdpr-territory\] alert threw/.test(callback))
}

console.log('\nMUTATION CONTROLS, against the real files')
{
  // A) a country added to one list and not the other.
  const widened = [...GDPR_TERRITORY_COUNTRIES, 'CH']
  const expected = CONSENT_REQUIRED_COUNTRIES.filter((c) => c !== 'CH' && c !== 'CA' && c !== 'KR')
  check('M1: Switzerland added to the GDPR list is caught',
    [...widened].sort().join(',') !== [...expected].sort().join(','))

  // C) the failure direction flipped to match the consent module.
  const failClosed = (country: string | null) => (typeof country !== 'string' ? true : inGdprTerritory(country))
  check('M2: treating an absent country as INSIDE is caught by C8',
    failClosed(null) === true && inGdprTerritory(null) === false)

  // F) the prop dropped at the call site.
  const layout = stripComments(read('app/layout.tsx')).replace('<GoogleTags gdprTerritory={gdprTerritory} />', '<GoogleTags />')
  check('M3: the Google loader rendered without the flag is caught',
    !/<GoogleTags gdprTerritory=\{gdprTerritory\} \/>/.test(layout))

  // F) the guard inside the component removed.
  const tags = stripComments(read('components/consent/GoogleTags.tsx')).replace('if (gdprTerritory) return null', '')
  check('M4: a component that takes the flag and ignores it is caught',
    !/if \(gdprTerritory\) return null/.test(tags))

  // F) the alert removed from the funnel.
  const callback = stripComments(read('app/api/auth/callback/route.ts')).replace(/notifyGdprTerritorySignup\(\{/g, 'noop({')
  check('M5: the funnel without the alert is caught', !/notifyGdprTerritorySignup\(\{/.test(callback))

  // E) the escape removed from the body.
  const alertSrc = read('lib/compliance/gdpr-territory-alert.ts')
  check('M6: the body interpolates the address only through the escape helper',
    !/\$\{i\.email\}/.test(alertSrc) && /escapeEmailHtml\(i\.email\)/.test(alertSrc))
}

void sectionD().then(() => {
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
})

export {}
