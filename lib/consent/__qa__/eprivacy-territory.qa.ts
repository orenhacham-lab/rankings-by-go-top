/**
 * WHERE A NON-ESSENTIAL TAG NEEDS CONSENT, AND THAT THE SALES PAGE OBEYS IT.
 *
 * The thing worth guarding is not the country list, it is the direction the
 * unknowns fall in. A gate that fails open here does not lose a statistic, it
 * writes a third-party session cookie — carrying the visitor's IP and
 * user-agent — on the device of somebody who was never asked, which is
 * precisely what ePrivacy Art. 5(3) exists to prevent and cannot be undone
 * afterwards. So every check below that matters is a check that something
 * ambiguous still requires consent.
 *
 * MUTATION CONTROLS throughout: each guard also runs against a broken version
 * of what it protects and must fail there.
 *
 * Run: npx tsx lib/consent/__qa__/eprivacy-territory.qa.ts
 */
import { readFileSync } from 'node:fs'
import {
  CONSENT_COUNTRY_HEADER,
  CONSENT_REQUIRED_COUNTRIES,
  consentRequiredForCountry,
  consentRequiredForRequest,
} from '../eprivacy-territory'
import { COUNTRY_HEADER } from '../../billing/server-market'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(p, 'utf8')
/** Comments stripped: a rule must hold in the CODE, not in a sentence. */
const code = (p: string) => read(p).replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '')

const headersWith = (value: string | null) => ({ get: (name: string) => (name === CONSENT_COUNTRY_HEADER ? value : null) })

console.log('\nA. the territory')
check('A1: a German visitor needs consent', consentRequiredForCountry('DE') === true)
check('A2: so does a British one, after Brexit and under the UK PECR',
  consentRequiredForCountry('GB') === true)
check('A3: and a Swiss one, who is in neither the EU nor the EEA',
  consentRequiredForCountry('CH') === true)
check('A4: Iceland, Liechtenstein and Norway are in the EEA and are listed',
  ['IS', 'LI', 'NO'].every((c) => consentRequiredForCountry(c) === true))
check('A5: all 27 member states are listed, none quietly missing',
  ['AT', 'BE', 'BG', 'CY', 'CZ', 'DE', 'DK', 'EE', 'ES', 'FI', 'FR', 'GR', 'HR', 'HU',
    'IE', 'IT', 'LT', 'LU', 'LV', 'MT', 'NL', 'PL', 'PT', 'RO', 'SE', 'SI', 'SK']
    .every((c) => consentRequiredForCountry(c) === true))
check('A6: Canada in full, because Law 25 says the same and the header carries no province',
  consentRequiredForCountry('CA') === true)
check('A7: a United States visitor does not, which is the only reason this module exists',
  consentRequiredForCountry('US') === false)
check('A8: nor does a visitor outside any of it',
  consentRequiredForCountry('IL') === false && consentRequiredForCountry('AU') === false)
check('A9: the list is frozen, so nothing can quietly drop a country at runtime',
  Object.isFrozen(CONSENT_REQUIRED_COUNTRIES))

console.log('\nB. everything ambiguous still requires consent')
check('B1: no country at all — a local request, a preview, a CDN that did not place the visitor',
  consentRequiredForCountry(null) === true && consentRequiredForCountry(undefined) === true)
check('B2: an empty string', consentRequiredForCountry('') === true)
check('B3: whitespace', consentRequiredForCountry('   ') === true)
check('B4: something that is not a country code at all',
  consentRequiredForCountry('XX-not-a-code') === true && consentRequiredForCountry('DEU') === true)
check('B5: a single letter, which no alpha-2 code is',
  consentRequiredForCountry('D') === true)
check('B6: the CDN\'s own unknown markers, which are well-formed codes and would otherwise read as "not Europe"',
  consentRequiredForCountry('XX') === true && consentRequiredForCountry('T1') === true)
check('B7: a lower-case code is still read, because a case change is not a licence to write',
  consentRequiredForCountry('de') === true && consentRequiredForCountry('us') === false)
check('B8: and a padded one', consentRequiredForCountry(' DE ') === true)

console.log('\nC. from a request, and the header it reads')
check('C1: a US header means no consent is required',
  consentRequiredForRequest(headersWith('US')) === false)
check('C2: a French one means it is',
  consentRequiredForRequest(headersWith('FR')) === true)
check('C3: an absent header means it is',
  consentRequiredForRequest(headersWith(null)) === true)
check('C4: the header name is byte-identical to the one billing reads, so a rename cannot split them',
  CONSENT_COUNTRY_HEADER === COUNTRY_HEADER)
check('C-MUT1: the fail-closed guards would catch a resolver that defaulted to "no consent needed"',
  // The mutation: an unknown country treated as outside the territory. B1..B6
  // are exactly the cases it would break, so proving it differs from the real
  // answer proves those checks are load-bearing rather than tautological.
  ((unknown: string | null) => {
    const broken = (c: string | null) => (c && CONSENT_REQUIRED_COUNTRIES.includes(c.toUpperCase()) ? true : false)
    return broken(unknown) === false && consentRequiredForCountry(unknown) === true
  })(null))
check('C-MUT2: …and one that ignored a malformed value the same way',
  ((bad: string) => {
    const broken = (c: string) => CONSENT_REQUIRED_COUNTRIES.includes(c.toUpperCase())
    return broken(bad) === false && consentRequiredForCountry(bad) === true
  })('XX'))

console.log('\nD. the sales page takes the decision on the server, once')
{
  const salesSrc = code('app/go/[platform]/page.tsx')
  check('D1: the page asks the territory, and from the request headers',
    /consentRequiredForRequest\(await headers\(\)\)/.test(salesSrc))
  check('D2: the gated component is still what a consent-required visitor gets',
    /consentRequired \? \(/.test(salesSrc) && /<MarketplacePixel /.test(salesSrc))
  check('D3: and the unconditional one only the other branch',
    /<MarketplacePixelUnconditional /.test(salesSrc))
  check('D4: the page itself renders no bare beacon, so both branches stay in components/consent',
    !/<img/.test(salesSrc))
  check('D-MUT3: the server-decision guard catches a page that guessed in the browser',
    !/consentRequiredForRequest\(await headers\(\)\)/.test(
      salesSrc.replace(/consentRequiredForRequest\(await headers\(\)\)/g, 'consentRequiredInBrowser()')))
  check('D-MUT4: the branch guard catches a page that dropped the gate and always rendered the open tag',
    !/consentRequired \? \(/.test(salesSrc.replace(/consentRequired \? \(/g, 'true ? (')))
}

console.log('\nE. the unconditional component, and why it is server-rendered')
{
  const src = read('components/consent/MarketplacePixelUnconditional.tsx')
  check('E1: it is NOT a client component, so the beacon is in the response the reviewer reads',
    !/'use client'/.test(src) && !/"use client"/.test(src))
  check('E2: it renders the beacon', /<img/.test(src) && /src=\{src\}/.test(src))
  check('E3: it takes no decision of its own, so there is only ever one gate to keep in step',
    !/marketing/.test(code('components/consent/MarketplacePixelUnconditional.tsx'))
    && !/currentChoices/.test(src))
  check('E4: and it is not next/image, which would fetch the beacon from our server',
    !/from 'next\/image'/.test(src))
  const gated = read('components/consent/MarketplacePixel.tsx')
  check('E5: the gated component is untouched by all of this and still refuses until marketing is granted',
    /'use client'/.test(gated)
    && /choices\.marketing === true/.test(gated)
    && /if \(!allowed\) return null/.test(gated))
  check('E-MUT5: the client-component guard catches the directive being added here',
    /'use client'/.test(`'use client'\n${src}`))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
