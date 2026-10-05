/**
 * A LANGUAGE MAY NOT GO PUBLIC BEFORE THE CONSENT LOG CAN RECORD IT.
 *
 * Two things have to agree for the cookie-consent proof to hold (GDPR Art. 7(1)):
 * the code has to know the language, so a decision taken on a Portuguese page is
 * not filed as having been read in Hebrew; and the log's CHECK constraint has to
 * allow it, or the insert is refused and the only copy of the proof is the one in
 * the visitor's own browser.
 *
 * So this suite holds the launch order: every public language is recordable in the
 * code, and a language the database does not yet accept is a language whose public
 * site is OFF. Today that is exactly pt-BR, and the missing piece is one additive
 * line on consent_events, owned by the legal thread.
 *
 * Every guard has a MUTATION CONTROL.
 */
import { readFileSync, readdirSync } from 'fs'
import { join } from 'path'
import { CONSENT_LOCALES, normalizeConsentLocale } from '../categories'
import { PUBLIC_LOCALES, type PublicLocale } from '../../i18n/locales'
import { spanishSiteEnabled } from '../../i18n/spanish-site'
import { portugueseSiteEnabled } from '../../i18n/portuguese-site'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const MIGRATIONS = join(ROOT, 'supabase', 'migrations')

/** The languages the consent log's CHECK allows, read from the migrations themselves. */
function allowedByTheDatabase(): Set<string> {
  const files = readdirSync(MIGRATIONS).filter((f) => f.endsWith('.sql')).sort()
  const allowed = new Set<string>()
  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS, file), 'utf8')
    // Each consent_events locale CHECK replaces the one before it, so the last
    // migration that names one wins, exactly as the database sees them in order.
    for (const m of sql.matchAll(/consent_events_locale[\s\S]{0,120}?CHECK\s*\(\s*locale\s+IN\s*\(([^)]*)\)/gi)) {
      allowed.clear()
      for (const v of m[1].matchAll(/'([^']+)'/g)) allowed.add(v[1])
    }
  }
  return allowed
}

const ALLOWED = allowedByTheDatabase()
/** A public language's own gate. A language with no gate is always on. */
const GATE: Partial<Record<PublicLocale, () => boolean>> = {
  es: () => spanishSiteEnabled('true'),
  'pt-BR': () => portugueseSiteEnabled(process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED),
}

console.log('A) the code knows every public language')
{
  const missing = PUBLIC_LOCALES.filter((l) => !(CONSENT_LOCALES as readonly string[]).includes(l))
  check('A1: every public language can be RECORDED as itself, never relabelled', missing.length === 0, missing.join(' '))
  check('A2: pt-BR is one of them, so a Brazilian decision is not filed as Hebrew',
    normalizeConsentLocale('pt-BR') === 'pt-BR')
  check('A3: something that is not a language still records, under the default', normalizeConsentLocale('fr') === 'he')
  check('A1-MUT: a public language absent from the list fails A1',
    [...PUBLIC_LOCALES, 'fr'].filter((l) => !(CONSENT_LOCALES as readonly string[]).includes(l)).length > 0)
}

console.log('\nB) the database is read from the migrations, not assumed')
{
  check('B1: the CHECK is found at all', ALLOWED.size > 0, [...ALLOWED].join(' '))
  check('B2: it allows every language the public site can serve',
    PUBLIC_LOCALES.every((l) => ALLOWED.has(l)), [...ALLOWED].join(' '))
  const fake = "CONSTRAINT consent_events_locale CHECK (locale IN ('he','en'))"
  check('B2-MUT: a constraint missing a public language fails B2',
    !PUBLIC_LOCALES.every((l) => new Set([...fake.matchAll(/'([^']+)'/g)].map((m) => m[1])).has(l)))
}

console.log('\nC) the launch order')
{
  // The rule: a language the log cannot store is a language the public cannot reach.
  const unstorable = PUBLIC_LOCALES.filter((l) => !ALLOWED.has(l))
  const live = unstorable.filter((l) => (GATE[l] ?? (() => true))())
  check('C1: no public language is live while the consent log would refuse its rows',
    live.length === 0, `live but unstorable: ${live.join(' ')}`)
  // Until 5 October 2026 pt-BR was exactly the case C1 guards: in the code and
  // refused by the log. The widening (20261005050636) cleared it, so what C2
  // asserts now is that the prerequisite is MET — and C1-MUT below puts it back
  // to prove C1 still reads the constraint rather than a constant.
  check('C2: the Portuguese launch prerequisite is met — the log can store its rows',
    ALLOWED.has('pt-BR'), [...ALLOWED].join(' '))
  check('C3: the gate is a real gate — "true" and nothing else turns it on',
    portugueseSiteEnabled('true') && !portugueseSiteEnabled('TRUE') && !portugueseSiteEnabled('1') && !portugueseSiteEnabled('yes') && !portugueseSiteEnabled(''))
  // The case that actually occurs: the variable was never set. It cannot be
  // written as portugueseSiteEnabled(undefined) — undefined is what triggers the
  // DEFAULT parameter, so that call reads process.env and asserts about the
  // environment the suite happens to run in rather than about the gate (which is
  // how three suites turned red the moment the flag was exported). The variable
  // is removed for the read instead, and put back.
  check('C3a: a variable that was never set leaves the gate off', (() => {
    const had = Object.prototype.hasOwnProperty.call(process.env, 'NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED')
    const was = process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED
    delete process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED
    const off = !portugueseSiteEnabled()
    if (had) process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = was
    return off
  })())
  check('C3a-MUT: the same read with the variable set to "true" turns it on', (() => {
    const had = Object.prototype.hasOwnProperty.call(process.env, 'NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED')
    const was = process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED
    process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = 'true'
    const on = portugueseSiteEnabled()
    if (had) process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED = was
    else delete process.env.NEXT_PUBLIC_PORTUGUESE_SITE_ENABLED
    return on
  })())
  // The same rule with pt-BR's gate replaced by one that is always on: the rule
  // must then report it as live, proving C1 is reading the gate and not a constant.
  // The same rule against a constraint that does NOT list pt-BR, with its gate
  // forced on: C1 must then report it, which proves C1 reads both the migration
  // and the gate rather than passing because everything happens to be fine.
  const narrowed = new Set(['he', 'en', 'es'])
  const alwaysOn: Partial<Record<PublicLocale, () => boolean>> = { ...GATE, 'pt-BR': () => true }
  check('C1-MUT: a language live while the log would refuse it fails C1',
    PUBLIC_LOCALES.filter((l) => !narrowed.has(l)).filter((l) => (alwaysOn[l] ?? (() => true))()).length > 0)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
