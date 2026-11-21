/**
 * LOCATION-BASED RANK TRACKING MUST EXIST OUTSIDE THE UNITED STATES.
 *
 * The defect this suite exists to prevent, measured on main 213c91dc. Postal
 * code, radius and exact point were refused for every project whose country is
 * not US, in THREE independent layers:
 *   1. components/keywords/TrackingTargetForm.tsx — the three options were not
 *      rendered at all, the Select's onChange refused 'zip', and a blue note
 *      said they were American.
 *   2. app/actions/tracking-targets.ts — five throws (`exactPointUsOnly`,
 *      `radiusUsOnly`) across create, bulk-create and update.
 *   3. app/api/scan/route.ts — two throws at scan time.
 * So even after the geocoding fix (postal-code-locale.qa.ts) an Italian,
 * Brazilian or Spanish customer could not reach the mode. Those three are the
 * only markets where gotopseo.com is near page one, and what ranks there is
 * the rank-tracking feature pages.
 *
 * WHAT IS REMOVED AND WHAT IS KEPT, on purpose:
 *   - postal code: the geocoder is now asked in the project's own country, so
 *     the gate is removed and the typed format becomes country-aware.
 *   - exact point: resolveExactPointFromFormData always took coordinates as
 *     they are, or geocoded the address in the project's country. The gate was
 *     vestigial, so it is removed.
 *   - RADIUS KEEPS ITS GATE. Its grid is eight compass points in MILES around
 *     a five-digit US ZIP (lib/scanner/radius-scan.ts), so opening it would
 *     sell a measurement that is wrong rather than one that is missing.
 *
 * What is checked:
 *   A. Source: the removed gates are gone, the radius gate is still there,
 *      and every write path validates the postal code instead.
 *   B. The form offers postal code and exact point to every country, radius to
 *      the United States only, and no longer forces a five-digit field.
 *   C. postalRules / sanitizePostalInput / isValidPostalCode per country, with
 *      the UNITED STATES ROW UNCHANGED from the old hard-coded behaviour.
 *   D. The copy in all eleven languages no longer calls the mode American, and
 *      the note that replaced it names the radius.
 *   E. MUTATION CONTROLS for every source guard.
 *
 * Run: npx tsx lib/scanner/__qa__/location-modes-by-country.qa.ts
 */
import { readFileSync } from 'fs'
import { postalRules, sanitizePostalInput, isValidPostalCode } from '../postal-input'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

/** Source guards match code, never comments. */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').filter((l) => !l.trim().startsWith('//')).join('\n')
}

const SCAN_SRC = stripComments(readFileSync('app/api/scan/route.ts', 'utf8'))
const ACTIONS_SRC = stripComments(readFileSync('app/actions/tracking-targets.ts', 'utf8'))
const FORM_SRC = stripComments(readFileSync('components/keywords/TrackingTargetForm.tsx', 'utf8'))
const MESSAGES_SRC = stripComments(readFileSync('lib/i18n/action-messages.ts', 'utf8'))

// --------------------------------------------------------------- A. source
console.log('\nA) the gates: two removed, one kept, and validation in their place')

const guardNoZipScanGate = (src: string) => !/zip'\s*&&[^\n]*!==\s*'US'/.test(src) && !/ZIP code mode is only supported/.test(src)
const guardRadiusScanGateKept = (src: string) => /locationMode === 'radius' && project\.country\.toUpperCase\(\) !== 'US'/.test(src)
const guardNoExactPointGate = (src: string) => !/exactPointUsOnly/.test(src)
const guardRadiusActionGateKept = (src: string) => (src.match(/m\.radiusUsOnly/g) || []).length === 2
const guardPostalValidatedEverywhere = (src: string) => (src.match(/m\.postalCodeInvalid/g) || []).length === 3
const guardPostalValidatorUsed = (src: string) => /isValidPostalCode\(safeStringFromFormData\(formData, 'postal_code'\)/.test(src)

check('the scan route no longer refuses postal-code mode outside the US', guardNoZipScanGate(SCAN_SRC))
check('…and still refuses radius outside the US', guardRadiusScanGateKept(SCAN_SRC))
check('no exact-point country gate left in the server actions', guardNoExactPointGate(ACTIONS_SRC))
check('the two radius country gates are still in the server actions', guardRadiusActionGateKept(ACTIONS_SRC))
check('all three write paths (create, bulk, update) validate the postal code', guardPostalValidatedEverywhere(ACTIONS_SRC))
check('…through isValidPostalCode on the form value, not on the form\'s own word', guardPostalValidatorUsed(ACTIONS_SRC))
check('the unused "exact point is US only" sentence is gone from both locales', !/exactPointUsOnly/.test(MESSAGES_SRC))
check('the postal-code refusal exists in Hebrew and in English',
  (MESSAGES_SRC.match(/postalCodeInvalid:/g) || []).length === 2)

// ----------------------------------------------------------------- B. form
console.log('\nB) the form')

const guardZipOfferedToAll = (src: string) => /\{ value: 'zip', label: t\.locationModeZip \},/.test(src)
const guardExactPointOfferedToAll = (src: string) => /\{ value: 'exact_point', label: t\.locationModeExactPoint \},/.test(src)
const guardRadiusOfferedToUsOnly = (src: string) =>
  /projectCountry\?\.toUpperCase\(\) === 'US' \? \[\{ value: 'radius'/.test(src)
const guardNoZipOnChangeRefusal = (src: string) => !/mode === 'zip' &&[^\n]*!== 'US'/.test(src)
const guardNoFiveDigitPostalField = (src: string) => {
  const field = src.slice(src.indexOf("name=\"postal_code\""), src.indexOf("name=\"postal_code\"") + 400)
  return !/pattern="\\d\{5\}"/.test(field) && !/maxLength=\{5\}/.test(field)
}
const guardPostalFieldUsesRules = (src: string) =>
  /placeholder=\{postalRules\(projectCountry\)\.placeholder\}/.test(src) &&
  /maxLength=\{postalRules\(projectCountry\)\.maxLength\}/.test(src) &&
  /sanitizePostalInput\(e\.target\.value, projectCountry\)/.test(src)

check('postal code is offered to every country', guardZipOfferedToAll(FORM_SRC))
check('exact point is offered to every country', guardExactPointOfferedToAll(FORM_SRC))
check('radius is offered to the United States only', guardRadiusOfferedToUsOnly(FORM_SRC))
check('selecting postal code is no longer refused outside the US', guardNoZipOnChangeRefusal(FORM_SRC))
check('the postal field is no longer five digits by construction', guardNoFiveDigitPostalField(FORM_SRC))
check('…it takes its length, placeholder and filter from the country', guardPostalFieldUsesRules(FORM_SRC))
check('the radius field still demands five digits (it is a US ZIP)', /zipClean\.length !== 5/.test(FORM_SRC))

// ------------------------------------------------------------ C. the rules
console.log('\nC) a postal code per country — and the US row untouched')

const us = postalRules('US')
check('US: five digits, digits only — the old behaviour exactly',
  us.maxLength === 5 && us.digitsOnly && String(us.pattern) === String(/^\d{5}$/))
check('US: a five-digit ZIP is valid, four digits and six are not',
  isValidPostalCode('12345', 'US') && !isValidPostalCode('1234', 'US') && !isValidPostalCode('123456', 'US'))
check('US: the field still strips everything but digits',
  sanitizePostalInput('12345-6789', 'US') === '12345' && sanitizePostalInput('SW1A 1AA', 'us') === '11')

check('Italy: 00184 is a CAP, 0018 is not', isValidPostalCode('00184', 'IT') && !isValidPostalCode('0018', 'IT'))
check('Spain: 28013 is valid', isValidPostalCode('28013', 'ES'))
check('Brazil: a CEP survives its dash, with or without it',
  isValidPostalCode('01310-100', 'BR') && isValidPostalCode('01310100', 'BR') &&
  sanitizePostalInput('01310-100', 'BR') === '01310-100')
check('Brazil: the old US rule would have rejected it', !isValidPostalCode('01310-100', 'US'))
check('Netherlands: letters are kept, and the order matters',
  isValidPostalCode('1012 AB', 'NL') && isValidPostalCode('1012AB', 'NL') && !isValidPostalCode('AB 1012', 'NL') &&
  sanitizePostalInput('1012 AB', 'NL') === '1012 AB')
check('United Kingdom and Canada: their own shapes',
  isValidPostalCode('SW1A 1AA', 'GB') && isValidPostalCode('K1A 0B1', 'CA') && !isValidPostalCode('K1A 0B1', 'GB'))
check('Japan and Poland: the dash is optional',
  isValidPostalCode('100-0001', 'JP') && isValidPostalCode('1000001', 'JP') && isValidPostalCode('00-001', 'PL'))
check('Israel: five digits and seven both pass',
  isValidPostalCode('75463', 'IL') && isValidPostalCode('7546302', 'IL') && !isValidPostalCode('754630', 'IL'))
check('a country with no row is accepted, not refused (Portugal)',
  isValidPostalCode('1000-001', 'PT') && isValidPostalCode('1000 001', 'PT'))
check('…but nothing that cannot be a postal code anywhere',
  !isValidPostalCode('', 'PT') && !isValidPostalCode('x', 'PT') && !isValidPostalCode('Lisbon, Portugal', 'PT') &&
  !isValidPostalCode('   ', 'PT'))
check('an unknown country still has no placeholder to promise', postalRules('PT').placeholder === '')
check('a missing country behaves like an unknown one',
  postalRules(undefined).maxLength === 12 && postalRules('').digitsOnly === false)
check('the country code is read case-insensitively',
  isValidPostalCode('00184', 'it') && isValidPostalCode('00184', 'It'))

// ------------------------------------------------------------- D. the copy
console.log('\nD) the copy in all eleven languages')

const LOCALE_FILES: Array<[string, string, string]> = [
  // locale, file, the word for "radius" in that language
  ['he', 'lib/i18n/dashboard/he.ts', 'רדיוס'],
  ['en', 'lib/i18n/dashboard/en.ts', 'Radius'],
  ['es', 'lib/i18n/dashboard/es.ts', 'radio'],
  ['pt-BR', 'lib/i18n/dashboard/pt-BR/tracking.ts', 'raio'],
  ['fr', 'lib/i18n/dashboard/fr/tracking.ts', 'rayon'],
  ['it', 'lib/i18n/dashboard/it/tracking.ts', 'raggio'],
  ['ja', 'lib/i18n/dashboard/ja/tracking.ts', '半径'],
  ['de', 'lib/i18n/dashboard/de/tracking.ts', 'Radius'],
  ['nl', 'lib/i18n/dashboard/nl/tracking.ts', 'radius'],
  ['pl', 'lib/i18n/dashboard/pl/tracking.ts', 'promieniowe'],
  ['ko', 'lib/i18n/dashboard/ko/tracking.ts', '반경'],
]
/** Every way these files said "the United States". */
const US_WORDS = ['US Only', 'US)', 'USA', 'EUA', 'EE. UU.', 'Stati Uniti', 'États-Unis', 'アメリカ', '미국', 'VS)', 'statunitense', 'amerykański', 'Amerikaanse', 'US-']

const lineOf = (src: string, key: string): string => {
  const m = src.split('\n').find((l) => l.trim().startsWith(`${key}:`))
  return m || ''
}
for (const [locale, file, radiusWord] of LOCALE_FILES) {
  const src = readFileSync(file, 'utf8')
  const modeLine = lineOf(src, 'locationModeZip')
  const hintLine = lineOf(src, 'zipHint')
  const noteLine = lineOf(src, 'locationUsOnlyNote')
  check(`${locale}: the mode is no longer named after the United States`,
    modeLine !== '' && !US_WORDS.some((w) => modeLine.includes(w)), modeLine)
  check(`${locale}: the hint no longer asks for a US ZIP`,
    hintLine !== '' && !US_WORDS.some((w) => hintLine.includes(w)), hintLine)
  check(`${locale}: the remaining note is about the radius`,
    noteLine.includes(radiusWord), noteLine)
}

// ----------------------------------------------- E. mutation controls
console.log('\nE) mutation controls — each guard must fail on the old source')
check('the scan-route guard fails on the old throw',
  !guardNoZipScanGate("if (locationMode === 'zip' && project.country.toUpperCase() !== 'US') { throw new Error('x') }"))
check('the kept-radius guard fails if that throw is deleted', !guardRadiusScanGateKept('const x = 1'))
check('the exact-point guard fails on the old throw', !guardNoExactPointGate('throw new UserFacingError(m.exactPointUsOnly)'))
check('the kept-radius guard fails if one of the two action throws is deleted',
  !guardRadiusActionGateKept('throw new UserFacingError(m.radiusUsOnly)'))
check('the validation guard fails when one write path skips it',
  !guardPostalValidatedEverywhere('m.postalCodeInvalid; m.postalCodeInvalid'))
check('the validation guard fails when the form value is trusted instead',
  !guardPostalValidatorUsed("isValidPostalCode(data.postal_code, projectCountry)"))
check('the form guards fail on the old option list',
  !guardZipOfferedToAll("...(projectCountry?.toUpperCase() === 'US' ? [{ value: 'zip', label: t.locationModeZip }] : [])") &&
  !guardRadiusOfferedToUsOnly("{ value: 'radius', label: t.locationModeRadius },"))
check('the five-digit guard fails on the old field',
  !guardNoFiveDigitPostalField('<Input name="postal_code" maxLength={5} pattern="\\d{5}" />'))
check('the rules guard fails on the old hardcoded field',
  !guardPostalFieldUsesRules('placeholder="12345" maxLength={5}'))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
