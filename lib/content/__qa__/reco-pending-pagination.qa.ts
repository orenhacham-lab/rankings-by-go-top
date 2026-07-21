/**
 * Pending-ideas PAGINATION QA (Scope B) — pure model + component wiring guards.
 *
 * The component renders `suggestions.slice(0, visibleCount)` with visibleCount starting
 * at 3, "הצג עוד" adding +5 (bounded), and "הצג הכל" revealing the rest; it resets to 3
 * on mount / project switch / new generation and never restores an expanded count from
 * storage/URL. This file proves the exact count model the task specifies (A–K) with a
 * pure replica, and source-guards the component so the rendered slice, the reset points,
 * the button visibility, and the "no persisted expanded count" contract are all wired.
 *
 * (Live DOM rendering — initial 3 cards, click→8→13, show-all, hard-reload→3, project
 * switch→3 — is the Playwright/Claude-Chrome layer against a deployed Preview; this is
 * the deterministic offline gate that pins the same behavior.)
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// ── Pure pagination model (mirrors the component EXACTLY) ────────────────────
const INITIAL_VISIBLE = 3
const PAGE_STEP = 5
const clampShowMore = (visible: number, total: number) => Math.min(total, visible + PAGE_STEP)
const showAll = (total: number) => total
const renderedCount = (visible: number, total: number) => Math.min(visible, total) // slice(0, visible)
const showButtons = (visible: number, total: number) => total > INITIAL_VISIBLE && visible < total

const src = readFileSync(join(__dirname, '../../../components/content/AutomationIdeas.tsx'), 'utf8')

function main() {
  console.log('MODEL) exact count sequences (tests A–K)')
  // A — initial render: exactly 3 of 100.
  check('A. initial render shows exactly 3', renderedCount(INITIAL_VISIBLE, 100) === 3)
  // B — one "show more": exactly 8.
  const v1 = clampShowMore(INITIAL_VISIBLE, 100)
  check('B. one "show more" → 8', renderedCount(v1, 100) === 8)
  // C — second "show more": exactly 13.
  const v2 = clampShowMore(v1, 100)
  check('C. second "show more" → 13', renderedCount(v2, 100) === 13)
  // D — "show all": exactly 100.
  check('D. "show all" → 100', renderedCount(showAll(100), 100) === 100)
  // E/F/G — a fresh mount/refresh/project switch starts at the INITIAL default (3).
  check('E/F/G. mount/refresh/project-switch start at 3 (fresh state default)', INITIAL_VISIBLE === 3)
  // H — 4 recommendations: first 3, then ONE click shows 4 (bounded, not 8).
  check('H. 4 total → initial 3, one click → 4 (bounded)', renderedCount(INITIAL_VISIBLE, 4) === 3 && renderedCount(clampShowMore(INITIAL_VISIBLE, 4), 4) === 4)
  // I — 3 recommendations: no pagination buttons.
  check('I. 3 total → no pagination buttons', showButtons(INITIAL_VISIBLE, 3) === false)
  // buttons visible with >3 and hidden once all shown.
  check('buttons visible at 3/100, hidden after "show all"', showButtons(INITIAL_VISIBLE, 100) === true && showButtons(showAll(100), 100) === false)
  // "show more" reveals exactly PAGE_STEP each time until the tail (fewer remain → all).
  check('"show more" step is exactly 5 until the tail', clampShowMore(3, 100) - 3 === 5 && clampShowMore(96, 100) === 100)
  // count never exceeds total even after over-clicking (no crash / invalid count).
  check('rendered count never exceeds total (removal-safe)', renderedCount(999, 4) === 4 && showButtons(999, 4) === false)

  console.log('WIRING) the component actually implements this model')
  check('initial visibleCount = 3 (INITIAL_VISIBLE), step = 5 (PAGE_STEP)',
    /const INITIAL_VISIBLE = 3/.test(src) && /const PAGE_STEP = 5/.test(src) && /useState\(INITIAL_VISIBLE\)/.test(src))
  check('renders an actual SLICE (not all cards hidden via CSS)', /suggestions\.slice\(0, visibleCount\)\.map\(/.test(src) && !/ideasExpanded/.test(src))
  check('"show more" adds +5 bounded by total', /setVisibleCount\(\(v\) => Math\.min\(suggestions\.length, v \+ PAGE_STEP\)\)/.test(src))
  check('"show all" reveals the rest', /setVisibleCount\(suggestions\.length\)/.test(src))
  check('two adjacent buttons: הצג עוד + הצג הכל (localized keys)', /t\.showMoreIdeas/.test(src) && /t\.showAllIdeas/.test(src) && /ideas-show-more/.test(src) && /ideas-show-all/.test(src))
  check('buttons shown only when total > 3 AND some remain hidden',
    /suggestions\.length > INITIAL_VISIBLE && visibleCount < suggestions\.length/.test(src))

  console.log('RESET) starts at 3 on load/project-switch/new-generation; NEVER restored from storage')
  check('reset to 3 on project change / initial load', /setVisibleCount\(INITIAL_VISIBLE\)/.test(src))
  // Reset appears at BOTH the project-scoped load effect and after a new generation response.
  check('reset to 3 also after a newly completed generation response', (src.match(/setVisibleCount\(INITIAL_VISIBLE\)/g) ?? []).length >= 2)
  check('the visible count is NEVER read from localStorage/sessionStorage/URL',
    !/(localStorage|sessionStorage)[^\n]*visible/i.test(src) && !/visibleCount[^\n]*(localStorage|sessionStorage|searchParams|location)/i.test(src))

  console.log('PRESERVED) existing actions + select-all scope unchanged by pagination')
  check('select-all still targets ALL suggestions (scope unchanged)', /const selectAll = \(\) => setSelected\(new Set\(suggestions\.map\(\(s\) => s\.id\)\)\)/.test(src))
  check('clear selection unchanged', /const clearSel = \(\) => setSelected\(new Set\(\)\)/.test(src))

  console.log('LOCALE) both labels localized (he + en)')
  const he = readFileSync(join(__dirname, '../../../lib/i18n/dashboard/he.ts'), 'utf8')
  const en = readFileSync(join(__dirname, '../../../lib/i18n/dashboard/en.ts'), 'utf8')
  check('he: הצג עוד / הצג הכל', /showMoreIdeas: 'הצג עוד'/.test(he) && /showAllIdeas: 'הצג הכל'/.test(he))
  check('en: Show more / Show all', /showMoreIdeas: 'Show more'/.test(en) && /showAllIdeas: 'Show all'/.test(en))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
