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
import { readFileSync, readdirSync, statSync } from 'fs'
import { join, relative } from 'path'
import { cn } from '../../../lib/utils'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
function walkTsx(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(join(ROOT, dir))) {
    const rel = join(dir, name)
    if (name === '__qa__' || name === 'node_modules') continue
    if (statSync(join(ROOT, rel)).isDirectory()) walkTsx(rel, out)
    else if (name.endsWith('.tsx')) out.push(relative(ROOT, join(ROOT, rel)))
  }
  return out
}

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
  // The navy rail (UX review, decision 2): group titles, the tagline under the
  // wordmark, white on the filled active tab, and the action as text on the
  // canvas and on its own soft tint.
  ['rail-section', 'rail'], ['rail-tagline', 'rail'], ['rail-active-ink', 'rail-active'], ['rail-focus', 'rail'],
  ['action', 'canvas'], ['action', 'action-soft'],
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
    const SHELL = ['components/layout/Sidebar.tsx', 'app/(dashboard)/layout.tsx', 'components/layout/Header.tsx', 'components/layout/WorkspaceSwitcher.tsx', 'components/DashboardLanguageSwitcher.tsx', 'components/ThemeToggle.tsx', 'components/layout/SkipLink.tsx', 'components/scans/ScanHistory.tsx']
    const PHYSICAL = /(?<![\w-])(?:-?m[lr]|p[lr]|-?left|-?right|border-[lr]|rounded-[lr]|rounded-t[lr]|rounded-b[lr])-[\w[]|(?<![\w-])text-(?:left|right)\b|(?<![\w-])float-(?:left|right)\b/
    const offenders = (files: Record<string, string>) => Object.entries(files).filter(([, src]) => PHYSICAL.test(src)).map(([f, src]) => `${f}: ${PHYSICAL.exec(src)?.[0]}`)
    const files = Object.fromEntries(SHELL.map((f) => [f, strip(read(f))]))
    check(`C1: ${SHELL.length} shell files use start/end, never left/right`, offenders(files).length === 0, offenders(files).join(', '))
    // The phone drawer opens from the logical START (the right in Hebrew).
    check('C2: the phone drawer is pinned to the logical start', /drawer-start absolute inset-y-0 start-0/.test(files[SHELL[0]]))
    const mutated = { ...files, [SHELL[0]]: files[SHELL[0]].replace('inset-y-0 start-0', 'inset-y-0 left-0') }
    check('MUT: a drawer pinned to the left fails it', offenders(mutated).length > 0)
  }

  console.log('\nD) motion')
  {
    const honours = (src: string) => /@media\s*\(prefers-reduced-motion:\s*reduce\)\s*\{[\s\S]*?animation-duration:\s*1ms\s*!important[\s\S]*?transition-duration:\s*1ms\s*!important/.test(src)
    check('D1: prefers-reduced-motion cuts animations and transitions', honours(css))
    check('MUT: without the media rule it fails', !honours(css.replace('prefers-reduced-motion: reduce', 'min-width: 1px')))

    // D2: the motion budget (UX review, decision 4), each figure where it is set.
    const budget = (src: string): string[] => {
      const out: string[] = []
      const want: [string, RegExp][] = [
        ['tab content 180ms', /\.tab-enter > \* > \* \{\s*animation: tab-in 180ms var\(--ease-snappy\) backwards;/],
        ['stagger 30ms', /:nth-child\(2\) \{ animation-delay: 30ms; \}/],
        ['count-up 600ms', /animation: count-up 600ms ease-out forwards;/],
        ['ring 700ms', /\.ring-draw \{ animation: ring-draw 700ms var\(--ease-snappy\) backwards; \}/],
        ['drawer 240ms', /\.drawer-start \{ animation: drawer-in-ltr 240ms var\(--ease-snappy\); \}/],
        ['scrim 200ms', /\.scrim-in \{ animation: scrim-in 200ms ease-out; \}/],
        ['pop-in 160ms', /--animate-pop-in: pop-in 160ms/],
        ['shimmer 1.2s', /\.skeleton \{ animation: shimmer 1\.2s linear infinite; \}/],
      ]
      for (const [name, re] of want) if (!re.test(src)) out.push(name)
      // Nothing between tabs takes longer than 300ms.
      const tab = /animation: tab-in (\d+)ms/.exec(src)
      if (!tab || Number(tab[1]) > 300) out.push('tab over 300ms')
      return out
    }
    check('D2: every animation has the budgeted duration', budget(css).length === 0, budget(css).join(', '))
    check('MUT: a 400ms tab transition fails D2', budget(css.replace('tab-in 180ms', 'tab-in 400ms')).length > 0)

    // D3: every animation utility exists ONLY with no-preference, so reduced motion
    // gets none of them (not even their 1ms version).
    const gated = (src: string): string[] => {
      const flat = src.replace(/\/\*[\s\S]*?\*\//g, '')
      const blocks = [...flat.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n')
      const outside = flat.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, '')
      const names = ['tab-in', 'count-up 600ms', 'count-up-hold', 'ring-draw 700ms', 'drawer-in-ltr 240ms', 'scrim-in 200ms', 'shimmer 1.2s']
      return names.filter((n) => !blocks.includes(`animation: ${n}`) || new RegExp(`animation:\\s*${n.replace('.', '\\.')}`).test(outside))
    }
    check('D3: the tab, count-up, ring, drawer, scrim and shimmer animations are no-preference only', gated(css).length === 0, gated(css).join(', '))
    check('MUT: a shimmer outside the media query fails D3',
      gated(`${css}\n.skeleton-loud { animation: shimmer 1.2s linear infinite; }`).length > 0)

    // D4: never on table rows: no animation utility in the table primitive, and the
    // tab stagger stops at the screen's blocks (it never reaches a row).
    const table = strip(read('components/ui/Table.tsx'))
    const noRows = (tableSrc: string, cssSrc: string) => !/animate-|tab-enter|count-up/.test(tableSrc) && !/tab-enter[^{]*\b(tr|tbody|li)\b/.test(cssSrc)
    check('D4: no animation on table rows', noRows(table, css))
    check('MUT: a row that animates in fails D4', !noRows(table.replace("'bg-surface hover:bg-sunk/50", "'animate-pop-in bg-surface hover:bg-sunk/50"), css))
  }

  console.log('\nF) the Go Top palette')
  {
    const { light, dark } = palettes(css)
    const brand = (l: Record<string, string>, d: Record<string, string>): string[] => {
      const out: string[] = []
      if (l.brand?.toLowerCase() !== '#0086f5') out.push(`brand ${l.brand}`)
      if (l.rail?.toLowerCase() !== '#0a1b3d') out.push(`rail ${l.rail}`)
      if (l['rail-active']?.toLowerCase() !== '#0070d6') out.push(`active ${l['rail-active']}`)
      if (l.action?.toLowerCase() !== '#0070d6') out.push(`action ${l.action}`)
      if (d.action?.toLowerCase() !== '#4da8ff') out.push(`dark action ${d.action}`)
      return out
    }
    check('F1: brand #0086F5, rail #0A1B3D, active tab and action #0070D6, dark action #4DA8FF', brand(light, dark).length === 0, brand(light, dark).join(', '))
    check('MUT: the old cobalt action fails F1', brand({ ...light, action: '#3553d7' }, dark).length > 0)

    // P2-5: in the dark, the rail must not melt into the canvas. It stays navy
    // (blue well above red) while the canvas is a neutral grey-black.
    const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16))
    const separated = (d: Record<string, string>) => {
      const [rr, , rb] = rgb(d.rail); const [cr, , cb] = rgb(d.canvas)
      return d.rail !== d.canvas && rb - rr >= 24 && cb - cr < 16
    }
    check('F2: the dark rail is navy against a neutral dark canvas', separated(dark), `${dark.rail} / ${dark.canvas}`)
    check('MUT: the old near-black rail fails F2', !separated({ ...dark, rail: '#0a0c11', canvas: '#0d0f14' }))

    // White on #0086F5 is 3.7:1: the brand blue is for the mark, indicators and
    // charts, never a text background. `bg-brand` must not appear on any screen.
    const screens = [...walkTsx('app'), ...walkTsx('components')]
    const onBrand = (files: [string, string][]) => files.filter(([, src]) => /(?<![\w-])bg-brand\b/.test(src)).map(([f]) => f)
    const sources: [string, string][] = screens.map((f) => [f, strip(read(f))])
    check('F3: the brand blue is never a background (it fails AA under text)', onBrand(sources).length === 0, onBrand(sources).join(', '))
    check('MUT: a button filled with bg-brand fails F3', onBrand([...sources, ['x.tsx', '<button className="bg-brand text-white">']]).length > 0)
    check('F4: white on the brand blue really is under AA (why F3 exists)', ratio('#ffffff', light.brand) < 4.5)
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
