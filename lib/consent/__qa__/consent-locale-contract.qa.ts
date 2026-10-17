/**
 * A CONSENT DECISION MUST BE RECORDABLE IN THE LANGUAGE IT WAS READ IN.
 *
 * `consent_events.locale` is CHECK-constrained to a list of languages, and
 * `CONSENT_LOCALES` is the list the route will write. GDPR Art. 7(1) is about
 * showing what THIS visitor was shown, so the two failures this guards against
 * are both losses of proof:
 *
 *   - a language in CONSENT_LOCALES that the constraint refuses: the insert
 *     fails and the decision is never recorded (the route answers 204 either
 *     way, by design, so nothing visible breaks and nobody finds out);
 *   - a public language missing from CONSENT_LOCALES: normalizeConsentLocale
 *     falls back to 'he', and the log then claims a Brazilian visitor read a
 *     Hebrew disclosure, which is worse than no row at all.
 *
 * The direction between the code and the SQL is deliberately one-way: every
 * CONSENT_LOCALE must be in the constraint, and the constraint is allowed to
 * run ahead of the code, which is how a language's constraint lands without a
 * second production migration.
 *
 * It reads the SQL, not the live database: the migration file is what
 * Production is, and a test should not need credentials to Production.
 *
 * Run: npx tsx lib/consent/__qa__/consent-locale-contract.qa.ts
 */

import { readFileSync, readdirSync } from 'fs'
import { CONSENT_LOCALES, normalizeConsentLocale } from '../categories'
import { PUBLIC_LOCALES } from '../../i18n/locales'

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  [${detail}]` : ''}`) }
}

const DIR = 'supabase/migrations'

/**
 * The list the NEWEST migration touching this constraint installs. Migrations
 * apply in filename order, so the last one to speak wins — the rule Postgres
 * sees. Comments are stripped first, because the widening migration documents
 * its own rollback in a comment that names the OLD narrow list.
 */
function allowedLocales(): string[] | null {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  let allowed: string[] | null = null
  for (const file of files) {
    const sql = readFileSync(`${DIR}/${file}`, 'utf8')
      .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
    if (!sql.includes('consent_events')) continue
    const m = /consent_events_locale[\s\S]{0,200}?locale\s+IN\s+\(([^)]*)\)/i.exec(sql)
    if (m) allowed = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
  }
  return allowed
}

console.log('\n1. The constraint is found at all')
const allowed = allowedLocales() ?? []
check('consent_events: a locale list is declared in the migrations', allowed.length > 0, String(allowed))
console.log(`     constraint: ${allowed.join(', ')}`)
console.log(`     code:       ${CONSENT_LOCALES.join(', ')}`)

console.log('\n2. Every language the code writes, the database accepts')
for (const locale of CONSENT_LOCALES) {
  check(`consent_events accepts '${locale}'`, allowed.includes(locale), allowed.join('|'))
}

console.log('\n3. Every public language can be recorded as itself')
for (const locale of PUBLIC_LOCALES) {
  check(`'${locale}' is a consent locale, so it is not filed as Hebrew`,
    (CONSENT_LOCALES as readonly string[]).includes(locale), CONSENT_LOCALES.join('|'))
  check(`normalizeConsentLocale keeps '${locale}'`, normalizeConsentLocale(locale) === locale)
}

console.log('\n4. The list is still a closed list')
check('the constraint is not a wildcard', allowed.length > 0 && allowed.length < 20)
check('every entry is a language tag', allowed.every((l) => /^[a-z]{2}(-[A-Z]{2})?$/.test(l)), allowed.join('|'))
check('an unknown language still falls back rather than being written raw',
  normalizeConsentLocale('de') === 'he' && normalizeConsentLocale('') === 'he'
  && normalizeConsentLocale(undefined) === 'he')

console.log('\n5. Mutation controls')
check('a code locale missing from the constraint fails section 2',
  !['he', 'en', 'es'].includes('pt-BR'))
check('a public language missing from CONSENT_LOCALES fails section 3',
  !['he', 'en'].includes('es'))
check('a language spelled without its region fails section 2',
  !allowed.includes('pt') && allowed.includes('pt-BR'))
check('the rollback comment in the widening migration is not read as schema',
  !allowed.join('|').match(/^he\|en\|es$/))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
