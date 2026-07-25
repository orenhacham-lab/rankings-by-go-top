/**
 * Area H — AI Questions tab crash regression.
 *
 * A brand-new/generic project produces the 'starter_questions' chip
 * (prompt-templates.ts, starter tier). It was missing from the i18n STRINGS, so
 * t('starter_questions') threw `Cannot read properties of undefined (reading 'he')`
 * inside PromptSuggestions' chips.map — crashing the whole tab. This proves:
 *   (1) the starter_questions label now resolves in he + en;
 *   (2) the SCOPED chip-label fallback returns the raw key for an unknown chip (no throw);
 *   (3) the GLOBAL t() is UNCHANGED — a truly-unknown key still throws, so required
 *       missing translations elsewhere keep surfacing loudly (the fix is not global).
 * No network, no DB. Run: npx tsx lib/ai-visibility/__qa__/i18n-chip-label.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createI18n } from '../i18n'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

// Mirror the component's scoped chip-label fallback over the REAL t().
type T = ReturnType<typeof createI18n>
const chipLabel = (t: T, chip: string): string => {
  try { return t(chip as never) || chip } catch { return chip }
}

function main() {
  console.log('Area H — AI Questions i18n chip-label crash')
  const he = createI18n('he')
  const en = createI18n('en')

  // (1) the previously-missing starter chip now resolves in both languages
  check('(1) he starter_questions → "שאלות התחלה"', he('starter_questions') === 'שאלות התחלה')
  check('(1b) en starter_questions → "Starter questions"', en('starter_questions') === 'Starter questions')

  // a known signal chip still resolves (no regression)
  check('(1c) known chip (chip_purchase_intent) still resolves he', he('chip_purchase_intent') === 'כוונת רכישה')
  check('(1d) known chip resolves en', en('chip_purchase_intent') === 'Purchase Intent')

  // (2) SCOPED fallback: an unknown chip renders the raw key, never throws
  check('(2) scoped chip fallback returns raw key for an unknown chip (no throw)', chipLabel(he, '__unknown_chip__') === '__unknown_chip__')
  check('(2b) scoped chip fallback returns the label for a known chip', chipLabel(he, 'starter_questions') === 'שאלות התחלה')

  // (3) GLOBAL t() is unchanged — a truly-unknown key STILL throws (required missing
  // translations must keep surfacing; the fix must not silence them globally).
  let threw = false
  try { (he as (k: string) => string)('__does_not_exist__') } catch { threw = true }
  check('(3) global t() still throws on an unknown key (guard is scoped, not global)', threw)

  // ── Source contracts ──
  const i18nSrc = read('lib/ai-visibility/i18n.ts')
  check('SRC: starter_questions present in STRINGS with he + en', /starter_questions:\s*\{\s*he:\s*'.+',\s*en:\s*'.+'\s*\}/.test(i18nSrc))
  const i18nCode = i18nSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('SRC: global t() left UNGUARDED (still entry.he/.en, no missing-key swallow)', /const entry = STRINGS\[key\]\s*\n?\s*return heb \? entry\.he : entry\.en/.test(i18nCode) && !/entry\?\.|STRINGS\[key\] \?\?|if \(!entry\)/.test(i18nCode))

  const compSrc = read('components/ai-visibility/PromptSuggestions.tsx')
  const compCode = compSrc.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '')
  check('SRC: chipLabel wraps t() in try/catch and falls back to the raw chip', /const chipLabel[\s\S]{0,120}try \{[\s\S]{0,80}return t\([\s\S]{0,40}catch \{[\s\S]{0,200}return chip/.test(compCode))
  check('SRC: chip fallback logs a DEV-only diagnostic (not in production)', /process\.env\.NODE_ENV !== 'production'[\s\S]{0,80}console\.warn/.test(compSrc))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
