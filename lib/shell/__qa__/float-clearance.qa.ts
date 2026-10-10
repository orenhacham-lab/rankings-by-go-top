/**
 * The in-app "free demo" pill never sits on a bottom bar (owner's report of
 * 10 October 2026: it covered the research summary's "Start" button).
 *
 *   A) floatLift: the pill rises exactly above a bar in its column, and only then;
 *   B) the app pill applies it, to itself only, by its own `bottom`;
 *   C) every bottom bar of the app carries the marker; the public pill is untouched.
 *
 *   npx tsx lib/shell/__qa__/float-clearance.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FLOAT_CLEAR_SELECTOR, FLOAT_GAP, floatLift, type FloatBox } from '../float-clearance'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const code = (rel: string) => strip(readFileSync(join(ROOT, rel), 'utf8'))

console.log('A) the lift')
{
  // 1440x800, Hebrew: the pill rests at the bottom-left corner (end-6, bottom-6).
  const pill: FloatBox = { left: 24, top: 800 - 24 - 48, width: 127, height: 48 }
  // The summary's sticky "Ready to start?" bar, measured on main (bottom-5, full width).
  const startBar: FloatBox = { left: 40, top: 800 - 20 - 150, width: 1100, height: 150 }
  const lift = floatLift(pill, [startBar])
  check('A1: a bar under the pill lifts it to the bar\'s top edge plus the gap', lift === (pill.top + pill.height) - startBar.top + FLOAT_GAP, String(lift))
  const lifted = { ...pill, top: pill.top - lift }
  check('A2: …after which the two no longer overlap', lifted.top + lifted.height <= startBar.top - FLOAT_GAP + 0.5)
  check('A3: nothing under the pill: no lift', floatLift(pill, []) === 0)
  check('A4: a bar in the other half of the screen does not move it', floatLift(pill, [{ ...startBar, left: 400, width: 700 }]) === 0)
  check('A5: a bar that ended above the pill does not move it', floatLift(pill, [{ ...startBar, top: 200 }]) === 0)
  check('A6: a hidden bar (no size) does not move it', floatLift(pill, [{ ...startBar, width: 0, height: 0 }]) === 0)
  check('A7: the highest of two bars wins', floatLift(pill, [startBar, { ...startBar, top: 500, height: 280 }]) === (pill.top + pill.height) - 500 + FLOAT_GAP)
  check('A1-MUT: a lift without the gap fails A1', floatLift(pill, [startBar], 0) !== lift)
}

console.log('\nB) the app pill applies it')
{
  const app = code('components/guide/DemoFloatApp.tsx')
  const applies = (src: string) => /const next = floatLift\(rest, bars\)/.test(src)
    && /pill\.style\.bottom = next > 0 \? `calc\(\$\{REST_BOTTOM\} \+ \$\{next\}px\)` : ''/.test(src)
    && /querySelectorAll<HTMLElement>\(FLOAT_CLEAR_SELECTOR\)/.test(src)
  check('B1: the pill measures the marked bars and rises by its own bottom', applies(app))
  check('B1-MUT: a pill that never moves fails B1', !applies(app.replace("pill.style.bottom = next > 0 ? `calc(${REST_BOTTOM} + ${next}px)` : ''", '')))
  check('B2: it follows scrolling (inner scrollers too) and resizing, and lets go on unmount',
    /addEventListener\('scroll', place, true\)/.test(app) && /addEventListener\('resize', place\)/.test(app) && /pill\.style\.bottom = ''/.test(app))
  check('B3: its link and its words are the same as before', /href=\{whatsappHelpUrl\(t\.demoMessage\(domain\)\)\}/.test(app) && /label=\{t\.demo\}/.test(app) && /ariaLabel=\{t\.demoAria\}/.test(app) && /tone="app"/.test(app))
  const layout = code('app/(dashboard)/layout.tsx')
  check('B4: a screen\'s end scrolls clear of the pill (bottom padding on the app\'s main)', /<main className=\"[^\"]*\bpb-16\b/.test(layout))
}

console.log('\nC) the bars, and the public pill')
{
  const marked: [string, RegExp][] = [
    ['components/onboarding/ResearchSummary.tsx', /data-summary-block="start"\s*data-float-clear=""/],
    ['components/settings/SettingsCard.tsx', /<footer\s*data-float-clear=""\s*className=\{cn\(\s*'sticky bottom-0/],
    ['app/(dashboard)/content/articles/[id]/page.tsx', /data-article-save-bar="" data-float-clear="" className="sticky/],
  ]
  for (const [file, re] of marked) check(`C1: ${file} marks its bottom bar`, re.test(code(file)))
  check('C1b: keyword research\'s bulk bar is found by its own name (its screen is golden-locked)',
    /data-bulk-bar="" className="sticky/.test(code('app/(dashboard)/keyword-research/page.tsx')) && FLOAT_CLEAR_SELECTOR.includes('[data-bulk-bar]'))
  check('C1-MUT: an unmarked summary bar fails C1', !marked[0][1].test(code(marked[0][0]).replace('data-float-clear=""', '')))
  const shared = code('components/public/DemoFloat.tsx')
  check('C2: the shared pill (and so the public site) is unchanged: no clearance logic in it', !/floatLift|float-clear|style\.bottom/.test(shared)
    && /tone === 'public' \? 'end-6 bottom-24 hidden md:flex' : 'end-6 bottom-6 flex'/.test(shared))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
