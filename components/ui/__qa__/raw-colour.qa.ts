/**
 * Raw palette colours may only go away (design contract §1).
 *
 * The app is on design tokens (bg-canvas, text-ink, border-line, bg-action…);
 * a raw Tailwind palette class (`bg-slate-50`, `hover:text-blue-600`,
 * `dark:border-gray-700`, …) is a colour the tokens, the dark theme and the
 * contrast checks do not know about. Many older files still have them, so
 * they are listed with their count in raw-colour-baseline.json, and:
 *   A) a file NOT in the baseline must have none (every new file, and every
 *      file already cleaned, stays clean);
 *   B) a listed file may not GAIN any (a count may only go down);
 *   C) the foundations (components/ui, the shell, the guide, the auth pages,
 *      the root layout and the error pages) are not in the baseline at all;
 *   D) the matcher sees variants (hover:, dark:, sm:), ignores comments, and
 *      does not mistake tokens or words for palette classes.
 * A lower count than the baseline passes and is printed, so the list can be
 * shrunk (`--shrink` rewrites the counts downward; it never raises one).
 * Every check has a mutation control.
 *   npx tsx components/ui/__qa__/raw-colour.qa.ts [--shrink]
 */
import { readFileSync, readdirSync, statSync, writeFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const BASELINE_PATH = join(__dirname, 'raw-colour-baseline.json')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const PALETTE = 'slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose'
const UTILITY = 'bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder'
export const RAW_COLOUR = new RegExp(`(?<![\\w-])(?:[\\w-]+:)*(?:${UTILITY})-(?:${PALETTE})-\\d{2,3}\\b`, 'g')
export const countRaw = (src: string) => (strip(src).match(RAW_COLOUR) ?? []).length

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = `${dir}/${name}`
    if (name === 'node_modules' || name === '__qa__' || name.startsWith('.')) continue
    if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
    else if (/\.(tsx?|jsx?)$/.test(name)) out.push(rel)
  }
  return out
}

type Audit = { added: string[]; grown: string[]; shrinkable: [string, number, number][] }
/** The rule itself, on any file map, so the mutation controls run the same code. */
export function audit(counts: Record<string, number>, baseline: Record<string, number>): Audit {
  const added: string[] = [], grown: string[] = [], shrinkable: [string, number, number][] = []
  for (const [file, n] of Object.entries(counts)) {
    if (!n) continue
    const allowed = baseline[file]
    if (allowed === undefined) added.push(`${file} (${n})`)
    else if (n > allowed) grown.push(`${file} (${allowed} → ${n})`)
  }
  for (const [file, allowed] of Object.entries(baseline)) {
    const n = counts[file] ?? 0
    if (n < allowed) shrinkable.push([file, allowed, n])
  }
  return { added, grown, shrinkable }
}

const baselineDoc = JSON.parse(readFileSync(BASELINE_PATH, 'utf8')) as { _note: string; files: Record<string, number> }
const baseline = baselineDoc.files
const files = ['app', 'components', 'lib'].flatMap((d) => walk(d))
const counts: Record<string, number> = Object.fromEntries(files.map((f) => [f, countRaw(readFileSync(join(ROOT, f), 'utf8'))]))
const result = audit(counts, baseline)

// ── A/B) the codebase against the baseline ────────────────────────────────────
console.log('A/B) raw palette colours only go away')
check(`A: no file outside the baseline has a raw palette colour (${files.length} files scanned)`, result.added.length === 0, result.added.slice(0, 8).join(' | '))
check('B: no baseline file gained one', result.grown.length === 0, result.grown.slice(0, 8).join(' | '))
if (result.shrinkable.length) {
  console.log(`  · ${result.shrinkable.length} baseline entr${result.shrinkable.length === 1 ? 'y' : 'ies'} can shrink: ${result.shrinkable.slice(0, 6).map(([f, a, n]) => `${f} ${a}→${n}`).join(', ')}${result.shrinkable.length > 6 ? ', …' : ''}`)
}
const total = Object.values(counts).reduce((a, b) => a + b, 0)
console.log(`  · ${Object.values(counts).filter(Boolean).length} files, ${total} raw colours left (baseline ${Object.keys(baseline).length} files)`)

// Mutation controls on the same rule.
const cleanFile = 'components/ui/Button.tsx'
const listed = Object.keys(baseline)[0]
check('MUT: a raw colour in a clean file fails A', audit({ ...counts, [cleanFile]: countRaw('<div className="bg-slate-50" />') }, baseline).added.length === result.added.length + 1)
check('MUT: a brand-new file with a raw colour fails A', audit({ ...counts, 'components/new/Thing.tsx': 1 }, baseline).added.length === result.added.length + 1)
check('MUT: one more raw colour in a listed file fails B', audit({ ...counts, [listed]: baseline[listed] + 1 }, baseline).grown.length >= 1)
check('MUT: a cleaned file is reported as shrinkable, not as a failure', (() => {
  const r = audit({ ...counts, [listed]: 0 }, baseline)
  return r.added.length === result.added.length && r.grown.length === result.grown.length && r.shrinkable.some(([f]) => f === listed)
})())

// ── C) the foundations are clean, not merely allowed ──────────────────────────
console.log('\nC) the foundations are not in the baseline')
const FOUNDATIONS = /^(components\/ui\/|components\/layout\/|components\/guide\/|components\/auth\/|app\/\(auth\)\/|app\/layout\.tsx$|app\/not-found\.tsx$|app\/global-error\.tsx$|app\/\(dashboard\)\/error\.tsx$|components\/content\/Toast\.tsx$)/
const inBaseline = (b: Record<string, number>) => Object.keys(b).filter((f) => FOUNDATIONS.test(f))
check('C1: no foundation file is allowlisted', inBaseline(baseline).length === 0, inBaseline(baseline).join(', '))
check('MUT: allowlisting the sign-in page fails C1', inBaseline({ ...baseline, 'app/(auth)/login/page.tsx': 3 }).length === 1)
const foundationFiles = files.filter((f) => FOUNDATIONS.test(f))
const dirty = foundationFiles.filter((f) => counts[f] > 0)
check(`C2: all ${foundationFiles.length} foundation files have 0 raw colours`, foundationFiles.length >= 20 && dirty.length === 0, dirty.join(', '))
for (const f of ['app/not-found.tsx', 'app/global-error.tsx', 'app/(dashboard)/error.tsx', 'components/auth/AuthShell.tsx']) {
  check(`C3: ${f} exists and is scanned`, files.includes(f))
}

// ── D) the matcher ────────────────────────────────────────────────────────────
console.log('\nD) the matcher')
check('D1: base, variant and dark twins are counted', countRaw('bg-slate-50 hover:text-blue-600 dark:border-gray-700 sm:focus:ring-indigo-500/40') === 4)
check('D2: tokens and words are not palette classes', countRaw('bg-canvas text-ink border-line ring-action/20 text-muted "a green-600 idea" bg-action-soft') === 0)
check('D3: comments are ignored', countRaw('/* bg-slate-50 */\n// text-blue-600\nconst a = 1') === 0)
check('MUT: a matcher without variants would miss hover:', (' hover:text-blue-600'.match(/(?<![\w:-])(?:text)-(?:blue)-\d{2,3}\b/g) ?? []).length === 0 && countRaw(' hover:text-blue-600') === 1)

// ── --shrink: lower the counts to what is left, never raise one ───────────────
if (process.argv.includes('--shrink')) {
  const next: Record<string, number> = {}
  for (const [f, allowed] of Object.entries(baseline)) {
    const n = counts[f] ?? 0
    if (n > 0) next[f] = Math.min(n, allowed)
  }
  writeFileSync(BASELINE_PATH, JSON.stringify({ _note: baselineDoc._note, files: next }, null, 1) + '\n')
  console.log(`\n  · baseline rewritten: ${Object.keys(baseline).length} → ${Object.keys(next).length} files`)
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
