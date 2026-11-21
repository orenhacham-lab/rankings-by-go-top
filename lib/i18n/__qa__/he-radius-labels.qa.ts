/**
 * The Hebrew radius labels must be Hebrew. They were a copy of the English
 * ones (found by the audit thread on the location form, 2026-11-21).
 *
 * Run: npx tsx lib/i18n/__qa__/he-radius-labels.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let passed = 0
let failed = 0
function check(name: string, ok: boolean) {
  if (ok) passed++
  else {
    failed++
    console.log('FAIL', name)
  }
}

const KEYS = ['locationModeRadius', 'radiusCenterZipLabel', 'radiusCenterZipHint', 'radiusDistanceLabel']
const hasHebrew = (s: string) => /[֐-׿]/.test(s)
const hasLatinWord = (s: string) => /[A-Za-z]{2,}/.test(s)

function stringOf(src: string, key: string): string | null {
  const m = src.match(new RegExp(`\\b${key}:\\s*'((?:[^'\\\\]|\\\\.)*)'`))
  return m ? m[1] : null
}

function verdict(src: string): boolean {
  return KEYS.every((k) => {
    const v = stringOf(src, k)
    return v !== null && hasHebrew(v) && !hasLatinWord(v)
  })
}

const src = readFileSync(join(process.cwd(), 'lib/i18n/dashboard/he.ts'), 'utf8')
for (const k of KEYS) {
  const v = stringOf(src, k)
  check(`${k} exists`, v !== null)
  check(`${k} is Hebrew with no Latin word`, v !== null && hasHebrew(v) && !hasLatinWord(v))
}
check('all four pass together', verdict(src))

// Mutation control: put the old English back and the guard must fail.
check(
  'mutation: English "Radius Distance *" is caught',
  !verdict(src.replace(/radiusDistanceLabel:\s*'[^']*'/, "radiusDistanceLabel: 'Radius Distance *'")),
)
check(
  'mutation: English "Radius Scan (US Only)" is caught',
  !verdict(src.replace(/locationModeRadius:\s*'[^']*'/, "locationModeRadius: 'Radius Scan (US Only)'")),
)

console.log(`${passed} passed, ${failed} failed`)
if (failed) process.exit(1)
export {}
