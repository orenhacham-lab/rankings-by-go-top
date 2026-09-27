/**
 * The visual system's promises, checked from the source:
 *   A) every text/background token pair the app uses passes WCAG AA (4.5:1), in
 *      light AND dark, computed from app/globals.css itself;
 *   B) cn() keeps a custom type size next to a text colour (tailwind-merge alone
 *      reads `text-caption` as a colour and drops one of them), and every name
 *      it is taught exists in @theme;
 *   C) the shell mirrors: sidebar, top bar, header and workspace switcher use
 *      logical sides only (start/end), never left/right;
 *   D) motion honours prefers-reduced-motion;
 *   E) fonts load through next/font (self-hosted, no layout shift), never a
 *      Google Fonts <link>.
 * Every check has a mutation control: the same predicate run on a broken copy
 * must fail. Run:
 *   npx tsx components/ui/__qa__/design-tokens.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { cn } from '../../../lib/utils'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

// ── colour maths (WCAG 2.x relative luminance) ────────────────────────────────
function lum(hex: string): number {
  const h = hex.replace('#', '')
  const full = h.length === 3 ? h.split('').map((c) => c + c).join('') : h
  const [r, g, b] = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16) / 255)
    .map((c) => (c <= 0.03928 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4))
  return 0.2126 * r + 0.7152 * g + 0.0722 * b
}
const ratio = (a: string, b: string) => {
  const [x, y] = [lum(a), lum(b)].sort((m, n) => n - m)
  return (x + 0.05) / (y + 0.05)
}

/** `--color-name: #hex` inside the block that opens with `opener`. */
function block(css: string, opener: RegExp): Record<string, string> {
  const start = css.search(opener)
  if (start < 0) return {}
  const end = css.indexOf('\n}', start)
  const body = css.slice(start, end)
  return Object.fromEntries([...body.matchAll(/--color-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\b/g)].map((m) => [m[1], m[2]]))
}
function palettes(css: string) {
  const light = block(css, /^@theme\s*\{/m)
  const dark = { ...light, ...block(css, /^\.dark\s*\{/m) }
  return { light, dark }
}

/** [text, background] pairs the components actually use for readable text. */
const PAIRS: [string, string][] = [
  ['ink', 'canvas'], ['body', 'canvas'], ['muted', 'canvas'],
  ['ink', 'surface'], ['body', 'surface'], ['muted', 'surface'], ['muted', 'sunk'],
  ['action-ink', 'action'], ['commit-ink', 'commit'], ['action', 'surface'],
  ['ok', 'surface'], ['warn', 'surface'], ['bad', 'surface'], ['info', 'surface'],
  ['ok', 'ok-soft'], ['warn', 'warn-soft'], ['bad', 'bad-soft'], ['info', 'info-soft'],
  ['contrast-ink', 'contrast'], ['rail-ink', 'rail'], ['rail-muted', 'rail'],
]
function failingPairs(css: string): string[] {
  const out: string[] = []
  for (const [mode, pal] of Object.entries(palettes(css))) {
    for (const [fg, bg] of PAIRS) {
      if (!pal[fg] || !pal[bg]) { out.push(`${mode}: ${fg}/${bg} missing`); continue }
      const r = ratio(pal[fg], pal[bg])
      if (r < 4.5) out.push(`${mode}: ${fg} on ${bg} ${r.toFixed(2)}`)
    }
  }
  return out
}

async function main() {
  console.log('Design tokens QA\n')
  const css = read('app/globals.css')

  console.log('A) contrast, light and dark')
  {
    const bad = failingPairs(css)
    check(`A1: all ${PAIRS.length} text/background pairs pass AA (4.5:1) in both themes`, bad.length === 0, bad.join(', '))
    const mutated = css.replace(/--color-muted:\s*#[0-9a-fA-F]{3,6}/, '--color-muted: #a9a9a9')
    check('MUT: a muted grey too light for AA fails it', failingPairs(mutated).length > 0)
    const darkBroken = css.replace(/(\.dark\s*\{[\s\S]*?--color-action-ink:\s*)#[0-9a-fA-F]{3,6}/, '$1#ffffff')
    check('MUT: white on the dark theme\'s light accent fails it', failingPairs(darkBroken).length > 0)
  }

  console.log('\nB) cn() and the custom scale')
  {
    const both = cn('text-caption', 'text-muted').split(' ')
    check('B1: a type size and a text colour survive together', both.includes('text-caption') && both.includes('text-muted'), both.join(' '))
    const sizes = cn('text-copy', 'text-caption').split(' ')
    check('B2: two sizes still collapse to the last one', sizes.length === 1 && sizes[0] === 'text-caption', sizes.join(' '))
    const radii = cn('rounded-control', 'rounded-card').split(' ')
    const shadows = cn('shadow-card', 'shadow-pop').split(' ')
    check('B3: radius and shadow tokens collapse like built-ins', radii.join() === 'rounded-card' && shadows.join() === 'shadow-pop', `${radii} | ${shadows}`)

    const utils = strip(read('lib/utils.ts'))
    const taught = (src: string, key: string) => (new RegExp(`${key}:\\s*\\[([^\\]]*)\\]`).exec(src)?.[1] ?? '').match(/'([\w-]+)'/g)?.map((x) => x.slice(1, -1)) ?? []
    const missing = (src: string, theme: string) => [
      ...taught(src, 'text').filter((n) => !new RegExp(`--text-${n}:`).test(theme)).map((n) => `text-${n}`),
      ...taught(src, 'radius').filter((n) => !new RegExp(`--radius-${n}:`).test(theme)).map((n) => `radius-${n}`),
      ...taught(src, 'shadow').filter((n) => !new RegExp(`--shadow-${n}:`).test(theme)).map((n) => `shadow-${n}`),
    ]
    check('B4: every name cn() is taught is a real @theme token', taught(utils, 'text').length >= 5 && missing(utils, css).length === 0, missing(utils, css).join(', '))
    check('MUT: teaching cn() a name @theme does not define fails it', missing(utils.replace("'display'", "'hero'"), css).length > 0)
  }

  console.log('\nC) the shell mirrors (logical sides only)')
  {
    const SHELL = ['components/layout/Sidebar.tsx', 'app/(dashboard)/layout.tsx', 'components/layout/Header.tsx', 'components/layout/WorkspaceSwitcher.tsx', 'components/DashboardLanguageSwitcher.tsx', 'components/ThemeToggle.tsx']
    const PHYSICAL = /(?<![\w-])(?:-?m[lr]|p[lr]|-?left|-?right|border-[lr]|rounded-[lr]|rounded-t[lr]|rounded-b[lr])-[\w[]|(?<![\w-])text-(?:left|right)\b|(?<![\w-])float-(?:left|right)\b/
    const offenders = (files: Record<string, string>) => Object.entries(files).filter(([, src]) => PHYSICAL.test(src)).map(([f, src]) => `${f}: ${PHYSICAL.exec(src)?.[0]}`)
    const files = Object.fromEntries(SHELL.map((f) => [f, strip(read(f))]))
    check(`C1: ${SHELL.length} shell files use start/end, never left/right`, offenders(files).length === 0, offenders(files).join(', '))
    const mutated = { ...files, [SHELL[0]]: files[SHELL[0]].replace('-start-3', 'left-3') }
    check('MUT: an active-bar pinned to the left fails it', offenders(mutated).length > 0)
  }

  console.log('\nD) motion')
  {
    const honours = (src: string) => /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?animation-duration:\s*1ms\s*!important[\s\S]*?transition-duration:\s*1ms\s*!important/.test(src)
    check('D1: prefers-reduced-motion cuts animations and transitions', honours(css))
    check('MUT: without the media rule it fails', !honours(css.replace('prefers-reduced-motion: reduce', 'min-width: 1px')))
  }

  console.log('\nE) fonts')
  {
    const layout = strip(read('app/layout.tsx'))
    const selfHosted = (src: string) =>
      /import \{ Heebo, Inter \} from 'next\/font\/google'/.test(src)
      && /Heebo\(\{[^}]*subsets:\s*\[[^\]]*'hebrew'/.test(src)
      && /className=\{`[^`]*\$\{inter\.variable\}[^`]*\$\{heebo\.variable\}/.test(src)
      && !/fonts\.googleapis\.com/.test(src)
    check('E1: Inter + Heebo (with Hebrew) through next/font, no Google Fonts link', selfHosted(layout))
    check('MUT: a Google Fonts <link> fails it', !selfHosted(`${layout}\n<link href="https://fonts.googleapis.com/css2?family=Rubik" rel="stylesheet" />`))
    check('MUT: a Heebo without the Hebrew subset fails it', !selfHosted(layout.replace(/subsets:\s*\['hebrew',\s*'latin'\]/, "subsets: ['latin']")))
    const body = /--font-sans:\s*([^;]+);/.exec(css)?.[1] ?? ''
    check('E2: --font-sans starts from the next/font variables', /^var\(--font-inter\),\s*var\(--font-heebo\)/.test(body.trim()), body)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
