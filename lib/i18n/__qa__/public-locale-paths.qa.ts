/**
 * A PUBLIC LINK GOES TO THE READER'S OWN LANGUAGE, OR TO NOWHERE AT ALL.
 *
 * What was wrong, found live on 2026-10-16 while Spanish ads were running:
 * `components/free-check/FreeCheckHeroForm.tsx` computed its destination as
 * `locale === 'en' ? '/en/free-check' : '/free-check'`. That ternary is correct
 * for exactly the two languages that existed when it was written; `es` and
 * `pt-BR` fall to its else branch, which is the HEBREW root. So a Spanish
 * visitor who typed their address into the hero field — the landing page's main
 * action — was navigated to the Hebrew check, while the nav link and the
 * section's own button (both built from LOCALE_PREFIX) behaved correctly.
 *
 * Nothing failed, because no test asked where a non-English locale lands. Both
 * guards below are about that class, not about the one line:
 *
 *   1) the hero form's destination, computed for every PublicLocale, is that
 *      locale's own page. Driven off PUBLIC_LOCALES, so a fifth language is
 *      covered the day it is added.
 *   2) a SOURCE guard: no component may build a public path from a two-way
 *      `locale === 'en'` ternary. Keying on 'he' is allowed — the Hebrew root
 *      is the one prefix that is empty, so `he ? '/x' : '/${locale}/x'` is
 *      complete for every language; keying on 'en' silently is not.
 *
 * Mutation control: both guards were re-run with the original line restored and
 * both fail (guard 1 on es and pt-BR, guard 2 naming the file).
 *
 * Run: npx tsx lib/i18n/__qa__/public-locale-paths.qa.ts
 */
import { readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import { LOCALE_PREFIX, PUBLIC_LOCALES } from '../locales'
import { freeCheckPath } from '../../free-check/paths'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Comments are stripped before any match: this file's own prose names the bug. */
const strip = (s: string) => s
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .replace(/\{\/\*[\s\S]*?\*\/\}/g, '')
  .replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    if (name === '__qa__' || name === 'node_modules') continue
    const rel = join(dir, name)
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.tsx?$/.test(name)) out.push(relative(ROOT, join(ROOT, rel)))
  }
  return out
}

// ── 1) The hero form lands every language on its own check ──────────
{
  const src = strip(read('components/free-check/FreeCheckHeroForm.tsx'))
  const expr = /const target\s*=\s*([^\n]+)/.exec(src)?.[1] ?? ''
  check('1a: the form calls freeCheckPath and tests no language itself',
    /freeCheckPath\(locale\)/.test(expr) && !/locale ===/.test(expr), expr.trim())

  // The real function the component ships, once per locale.
  const expected: Record<string, string> = { he: '/free-check', en: '/en/free-check', es: '/es/free-check', 'pt-BR': '/pt-BR/free-check' }
  const wrong = PUBLIC_LOCALES.filter((l) => freeCheckPath(l) !== expected[l])
  check(`1b: all ${PUBLIC_LOCALES.length} public locales land on their own /free-check`,
    wrong.length === 0, wrong.map((l) => `${l}:${freeCheckPath(l)}`).join(' '))
  check('1c: Hebrew is the bare root and no other locale shares it',
    freeCheckPath('he') === '/free-check'
    && PUBLIC_LOCALES.filter((l) => l !== 'he').every((l) => freeCheckPath(l) !== '/free-check'),
    PUBLIC_LOCALES.map((l) => `${l}:${freeCheckPath(l)}`).join(' '))
  check('1d: every locale this guard asserts is one the site actually has',
    Object.keys(expected).length === PUBLIC_LOCALES.length
    && Object.keys(expected).every((l) => (PUBLIC_LOCALES as string[]).includes(l))
    && PUBLIC_LOCALES.every((l) => expected[l] === `${LOCALE_PREFIX[l]}/free-check`))
}

// ── 2) No component builds a public path from a two-way `locale === 'en'` ───
{
  const files = [...walk('components'), ...walk(join('app', '(public)'))]
  // A path literal in either branch of a ternary whose test is `locale === 'en'`.
  const offender = /locale\s*===\s*['"]en['"]\s*\?[^\n;]{0,120}['"]\/[a-z-]/
  const bad = files.filter((rel) => offender.test(strip(read(rel))))
  check(`2a: none of ${files.length} public components routes by \`locale === 'en'\``,
    bad.length === 0, bad.join(', '))
  // Positive control: the broken line must be caught by that very regex.
  check('2b: the regex catches the line this guard exists for',
    offender.test("  const target = locale === 'en' ? '/en/free-check' : '/free-check'"))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
