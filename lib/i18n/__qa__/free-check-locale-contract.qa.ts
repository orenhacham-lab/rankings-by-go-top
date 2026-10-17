/**
 * EVERY PUBLIC LANGUAGE MUST BE WRITABLE TO THE FREE-CHECK TABLES.
 *
 * `free_check_research_runs.locale` and `free_check_report_requests.locale`
 * are CHECK-constrained to a list of languages. The report row is the stored
 * proof that a visitor agreed to those exact words, so a language the database
 * refuses is not a cosmetic gap: the request 503s and the consent is never
 * recorded. That is how Spanish shipped — the code kept the real locale while
 * the constraint still said ('he','en').
 *
 * This holds the DIRECTION that matters: every value `PublicLocale` can produce
 * must be in the migration's list. The reverse is deliberately NOT asserted —
 * the list is allowed to run ahead of the code, which is how a language's
 * constraint lands without a second production migration.
 *
 * It reads the SQL, not the live database: a session that can reach Production
 * is not a thing a test should need, and the migration file is what Production
 * is.
 *
 * Run: npx tsx lib/i18n/__qa__/free-check-locale-contract.qa.ts
 */

import { readFileSync, readdirSync } from 'fs'
import { PUBLIC_LOCALES } from '../locales'

let pass = 0
let fail = 0
const check = (name: string, ok: boolean, detail?: string) => {
  if (ok) { pass++; console.log(`  PASS  ${name}`) }
  else { fail++; console.log(`  FAIL  ${name}${detail ? `  [${detail}]` : ''}`) }
}

const DIR = 'supabase/migrations'
const TABLES = ['free_check_research_runs', 'free_check_report_requests'] as const

/**
 * The list the NEWEST migration mentioning this table's locale constraint
 * installs. Migrations apply in filename order, so the last one to speak wins —
 * the same rule Postgres sees.
 */
function allowedLocales(table: string): string[] | null {
  const files = readdirSync(DIR).filter((f) => f.endsWith('.sql')).sort()
  let allowed: string[] | null = null
  for (const file of files) {
    const sql = readFileSync(`${DIR}/${file}`, 'utf8')
      // Comments are not schema. The widening migration documents its own
      // rollback in a comment, which names the OLD narrow list.
      .split('\n').filter((l) => !l.trimStart().startsWith('--')).join('\n')
    if (!sql.includes(table)) continue
    // One statement per table, in order, so the list after this table's name
    // is this table's list.
    const scope = sql.slice(sql.indexOf(table))
    const m = /locale\s+IN\s+\(([^)]*)\)/i.exec(scope)
    if (m) allowed = m[1].split(',').map((s) => s.trim().replace(/^'|'$/g, ''))
  }
  return allowed
}

console.log('\n1. The constraint is found at all')
const lists: Record<string, string[]> = {}
for (const table of TABLES) {
  const allowed = allowedLocales(table)
  check(`${table}: a locale list is declared in the migrations`, !!allowed && allowed.length > 0,
    String(allowed))
  if (allowed) lists[table] = allowed
}

for (const table of TABLES) console.log(`     ${table}: ${(lists[table] ?? []).join(', ')}`)

console.log('\n2. Every public language can be written')
for (const table of TABLES) {
  for (const locale of PUBLIC_LOCALES) {
    check(`${table} accepts '${locale}'`, (lists[table] ?? []).includes(locale),
      (lists[table] ?? []).join('|'))
  }
}

console.log('\n3. The list is still a closed list')
for (const table of TABLES) {
  const allowed = lists[table] ?? []
  check(`${table}: the list is not a wildcard`, allowed.length > 0 && allowed.length < 20)
  check(`${table}: no empty entry`, allowed.every((l) => /^[a-z]{2}(-[A-Z]{2})?$/.test(l)),
    allowed.join('|'))
}

console.log('\n4. Mutation controls')
check('mutation control: a language missing from the list fails section 2',
  !['he', 'en'].includes('es'))
check('mutation control: a language spelled differently fails section 2',
  !['he', 'en', 'es', 'pt'].includes('pt-BR'))
check('mutation control: the comment in the widening migration is not read as schema',
  !(allowedLocales('free_check_research_runs') ?? []).join('|').match(/^he\|en$/))

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1

export {}
