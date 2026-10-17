/**
 * The shared controls of design contract §5/§8/§9, checked by rendering them
 * (react-dom/server, the real components and dictionaries) and from source:
 *   A) ui/Checkbox — a real checkbox, native look off, drawn on tokens, lucide
 *      Check when checked, Minus + aria-checked="mixed" when indeterminate;
 *   B) ui/Switch — role=switch with aria-checked, h-5 w-9 pill, size-4 thumb,
 *      mirrored in RTL, toggles to !checked;
 *   C) ui/Segmented — a radiogroup on a sunk pill, exactly one tab stop, the
 *      chosen item lifted (bg-surface text-ink shadow-control), arrow keys
 *      follow the reading direction;
 *   D) ui/Notice — the five tones, rounded-inset, ≤3 bullets then "N more" in
 *      the screen's language, lucide close (no ✕), same API as settings/Notice;
 *   E) ui/BackLink — ghost sm link, lucide arrow mirrored in RTL, no glyph,
 *      internal paths only;
 *   F) content/Toast is ui/Toast (one look, one timing);
 *   G) the root <body> sits on the canvas tokens;
 *   H) no file in components/ui or components/layout uses a raw palette colour,
 *      a raw rgb()/white/black colour, a banned or bracketed size, an arbitrary
 *      or banned shadow, a banned radius, transition-all, animate-pulse, or a
 *      glyph icon (review G1/G2/R10/R11);
 *   I) ui/Modal closes with a lucide X (size-4), no ✕ glyph; its backdrop is
 *      the `backdrop` token;
 *   J) a change reads as a lucide ArrowUp/ArrowDown/Minus in the ok/bad/muted
 *      tone (StatTile delta, PositionChange), never ▲ ▼ •, with a spoken sign;
 *   K) ui/Table's phone API (R15): `hideBelow` drops a column, `stackBelowSm`
 *      stacks rows (title line, end cell, "label value" caption line), and a
 *      table without it is the ordinary table;
 *   L) ui/Skeleton covers the raw animate-pulse shapes (R34): a dark-surface
 *      tone, inline blocks, a labelled stand-alone block, a StatTile and a
 *      context-card skeleton, the contrast shimmer only without reduced motion.
 * Every check has a mutation control: the same predicate on a broken copy fails.
 *   npx tsx components/ui/__qa__/ui-primitives.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Checkbox from '../Checkbox'
import Switch from '../Switch'
import Segmented from '../Segmented'
import Notice, { NoticeBox, NOTICE_MAX_ITEMS } from '../Notice'
import BackLink from '../BackLink'
import Modal from '../Modal'
import StatTile from '../StatTile'
import { PositionChange } from '../StatusBadge'
import { Table, TableHead, TableBody, TableRow, Th, Td, TableMeta } from '../Table'
import { Skeleton, StatTileSkeleton, ContextCardSkeleton, SkeletonRegion } from '../Skeleton'
import { DashboardLanguageProvider } from '../../../lib/i18n/dashboard/useDashboardLanguage'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const render = (node: unknown) => renderToStaticMarkup(node as never)
const count = (s: string, re: RegExp) => (s.match(new RegExp(re.source, re.flags.includes('g') ? re.flags : re.flags + 'g')) ?? []).length

// ── A) Checkbox ───────────────────────────────────────────────────────────────
{
  const on = render(h(Checkbox, { checked: true, onChange: () => {}, 'aria-label': 'x' }))
  const off = render(h(Checkbox, { checked: false, onChange: () => {}, 'aria-label': 'x' }))
  const mixed = render(h(Checkbox, { checked: false, indeterminate: true, onChange: () => {}, 'aria-label': 'x' }))
  const labelled = render(h(Checkbox, { checked: false, onChange: () => {}, label: 'Label', description: 'Help' }))
  const box = (html: string) =>
    /type="checkbox"/.test(html)
    && ['appearance-none', 'size-4', 'rounded-[5px]', 'border-line-strong', 'bg-surface', 'shadow-control', 'checked:bg-action', 'indeterminate:bg-action']
      .every((c) => html.includes(c))
  check('A1: a real checkbox, native look off, drawn on tokens', box(on))
  check('MUT: the native look back fails A1', !box(on.replace('appearance-none', '')))
  const checkedMark = (html: string) => /lucide-check/.test(html) && /text-action-ink/.test(html) && /size-3/.test(html)
  check('A2: checked shows a lucide Check in action-ink', checkedMark(on) && !/<svg/.test(off))
  check('MUT: a checkbox with no mark fails A2', !checkedMark(on.replace(/<svg[\s\S]*?<\/svg>/, '')))
  const mixedOk = (html: string) => /aria-checked="mixed"/.test(html) && /lucide-minus/.test(html) && !/lucide-check"/.test(html)
  check('A3: indeterminate shows Minus and aria-checked="mixed"', mixedOk(mixed))
  check('MUT: indeterminate announced as unchecked fails A3', !mixedOk(mixed.replace('aria-checked="mixed"', 'aria-checked="false"')))
  const labelFor = (html: string) => {
    const id = html.match(/<input[^>]*\bid="([^"]+)"/)?.[1]
    return !!id && html.includes(`<label for="${id}"`) && html.includes(`aria-describedby="${id}-desc"`) && html.includes('text-caption text-muted')
  }
  check('A4: label is tied to the box, description is its aria-describedby', labelFor(labelled))
  check('MUT: an untied label fails A4', !labelFor(labelled.replace(/<label for="[^"]+"/, '<label')))
  const src = strip(read('components/ui/Checkbox.tsx'))
  const setsProp = (s: string) => /\.indeterminate\s*=\s*indeterminate/.test(s)
  check('A5: indeterminate is set on the DOM node (it is not an attribute)', setsProp(src))
  check('MUT: dropping the DOM property fails A5', !setsProp(src.replace(/\.indeterminate\s*=\s*indeterminate/, '.dataset.x = ""')))
  const passesBool = (s: string) => /onChange\?\.\(e\.target\.checked, e\)/.test(s)
  check('A6: onChange receives the new boolean', passesBool(src))
  check('MUT: passing the raw event fails A6', !passesBool(src.replace('onChange?.(e.target.checked, e)', 'onChange?.(e as never, e)')))
}

// ── B) Switch ─────────────────────────────────────────────────────────────────
{
  const on = render(h(Switch, { checked: true, onChange: () => {}, 'aria-label': 'x' }))
  const off = render(h(Switch, { checked: false, onChange: () => {}, 'aria-label': 'x' }))
  const labelled = render(h(Switch, { checked: true, onChange: () => {}, label: 'Auto scan', description: 'Every week' }))
  const track = (html: string) => /role="switch"/.test(html) && /type="button"/.test(html)
    && ['h-5', 'w-9', 'rounded-pill', 'bg-line-strong', 'aria-checked:bg-action'].every((c) => html.includes(c))
  check('B1: a role=switch button, h-5 w-9 pill, line-strong → action', track(on))
  check('MUT: a checkbox-looking switch fails B1', !track(on.replace('role="switch"', 'role="checkbox"')))
  const state = (a: string, b: string) => /aria-checked="true"/.test(a) && /aria-checked="false"/.test(b)
  check('B2: aria-checked reflects the state', state(on, off))
  check('MUT: a switch stuck on "true" fails B2', !state(on, off.replace('aria-checked="false"', 'aria-checked="true"')))
  const thumb = (html: string) => /size-4 rounded-pill bg-surface shadow-control/.test(html)
    && /rtl:-translate-x-\[1\.125rem\]/.test(html)
  check('B3: size-4 surface thumb, slides to the logical end (mirrored in RTL)', thumb(on) && /rtl:-translate-x-0\.5/.test(off))
  check('MUT: an unmirrored thumb fails B3', !thumb(on.replace('rtl:-translate-x-[1.125rem]', '')))
  const named = (html: string) => {
    const id = html.match(/<button[^>]*\bid="([^"]+)"/)?.[1]
    return !!id && html.includes(`aria-labelledby="${id}-label"`) && html.includes(`id="${id}-label"`)
  }
  check('B4: the label names the switch', named(labelled))
  check('MUT: an unnamed switch fails B4', !named(labelled.replace(/aria-labelledby="[^"]+"/, '')))
  const src = strip(read('components/ui/Switch.tsx'))
  const toggles = (s: string) => /onChange\?\.\(!checked\)/.test(s)
  check('B5: a press asks for the opposite state', toggles(src))
  check('MUT: a press that repeats the state fails B5', !toggles(src.replace('onChange?.(!checked)', 'onChange?.(checked)')))
}

// ── C) Segmented ──────────────────────────────────────────────────────────────
{
  const opts = [{ value: 'all', label: 'All' }, { value: 'up', label: 'Up', count: 4 }, { value: 'down', label: 'Down' }] as const
  const html = render(h(Segmented, { options: opts, value: 'up', onChange: () => {}, ariaLabel: 'Filter' }))
  const none = render(h(Segmented, { options: opts, value: 'zzz' as never, onChange: () => {}, ariaLabel: 'Filter' }))
  const group = (s: string) => /role="radiogroup"/.test(s) && /aria-label="Filter"/.test(s)
    && ['inline-flex', 'rounded-pill', 'bg-sunk', 'p-1'].every((c) => s.includes(c)) && count(s, /role="radio"/) === 3
  check('C1: a labelled radiogroup on a sunk pill, one radio per option', group(html))
  check('MUT: a bare div of buttons fails C1', !group(html.replace('role="radiogroup"', '')))
  const item = (s: string) => ['h-8', 'px-3', 'rounded-pill', 'text-caption', 'font-semibold', 'text-muted',
    'aria-checked:bg-surface', 'aria-checked:text-ink', 'aria-checked:shadow-control'].every((c) => s.includes(c))
  check('C2: items h-8 px-3 caption; the chosen one lifted onto the surface', item(html))
  check('MUT: a black active chip fails C2', !item(html.replaceAll('aria-checked:bg-surface', 'aria-checked:bg-ink')))
  const chosen = (s: string) => /aria-checked="true"[^>]*data-value="up"/.test(s) && count(s, /aria-checked="true"/) === 1
  check('C3: exactly the chosen value is checked', chosen(html))
  check('MUT: two checked items fail C3', !chosen(html.replace('aria-checked="false"', 'aria-checked="true"')))
  const oneStop = (s: string) => count(s, /tabindex="0"/) === 1
  check('C4: one tab stop (also when nothing matches)', oneStop(html) && oneStop(none))
  check('MUT: every item tabbable fails C4', !oneStop(html.replaceAll('tabindex="-1"', 'tabindex="0"')))
  check('C5: counts are tabular', /tabular-nums[^>]*>4</.test(html))
  const src = strip(read('components/ui/Segmented.tsx'))
  const rtlKeys = (s: string) => /ArrowRight:\s*rtl\s*\?\s*-1\s*:\s*1/.test(s) && /ArrowLeft:\s*rtl\s*\?\s*1\s*:\s*-1/.test(s)
  check('C6: arrow keys follow the reading direction', rtlKeys(src))
  check('MUT: fixed LTR arrows fail C6', !rtlKeys(src.replace('ArrowLeft: rtl ? 1 : -1', 'ArrowLeft: -1')))
}

// ── D) Notice ─────────────────────────────────────────────────────────────────
{
  const items = ['a', 'b', 'c', 'd', 'e']
  const he = render(h(NoticeBox, { tone: 'warn', language: 'he', items, children: 'שימו לב' }))
  const en = render(h(NoticeBox, { tone: 'warn', language: 'en', items, children: 'Heads up' }))
  const shape = (s: string) => /role="status"/.test(s) && ['rounded-inset', 'border', 'px-4', 'py-3', 'text-copy'].every((c) => s.includes(c))
    && /data-notice="warn"/.test(s) && /border-warn\/20 bg-warn-soft text-warn/.test(s)
  check('D1: rounded-inset, soft pair per tone, role=status', shape(he))
  check('MUT: the old control radius fails D1', !shape(he.replace('rounded-inset', 'rounded-control')))
  const bullets = (s: string, more: string) => count(s, /<li>/) === NOTICE_MAX_ITEMS && s.includes(more)
  check(`D2: ${NOTICE_MAX_ITEMS} bullets, then "N more" in the screen's language`, bullets(he, 'עוד 2') && bullets(en, '2 more') && !/[֐-׿]/.test(en.replace('Heads up', '')))
  check('MUT: all five bullets shown fails D2', !bullets(he.replace('</ul>', '<li>d</li><li>e</li></ul>'), 'עוד 2'))
  const tones = (['info', 'ok', 'warn', 'bad', 'wait'] as const).map((tone) =>
    render(h(NoticeBox, { tone, language: 'he', children: 'x' })))
  const toned = (list: string[]) => list.every((s, i) => s.includes(`bg-${['info', 'ok', 'warn', 'bad', 'warn'][i]}-soft`) && /<svg/.test(s))
  check('D3: every tone (info|ok|warn|bad|wait) has its soft pair and a lucide icon', toned(tones))
  check('MUT: an untinted tone fails D3', !toned([tones[0].replace('bg-info-soft', ''), ...tones.slice(1)]))
  const dismiss = render(h(NoticeBox, { tone: 'info', language: 'en', onDismiss: () => {}, children: 'x' }))
  const lucideClose = (s: string) => /lucide-x/.test(s) && /sr-only">Close</.test(s) && !s.includes('✕')
  check('D4: dismiss is a lucide X with a spoken name, no ✕ glyph', lucideClose(dismiss))
  check('MUT: the ✕ glyph back fails D4', !lucideClose(dismiss.replace(/<svg[\s\S]*?<\/svg>/, '✕')))
  const withAction = render(h(NoticeBox, { tone: 'bad', language: 'he', action: { label: 'נסו שוב', onClick: () => {} }, onDismiss: () => {}, children: 'x' }))
  const oneAction = (s: string) => count(s, /<button/) === 1 && s.includes('נסו שוב')
  check('D5a: a bad notice is an alert, the others a polite status', /role="alert"/.test(withAction) && /role="status"/.test(he))
  check('D5: at most one action (an action hides the dismiss)', oneAction(withAction))
  check('MUT: action + dismiss fails D5', !oneAction(withAction + '<button>'))
  const inDash = render(h(DashboardLanguageProvider as never, { initialLocale: 'en', children: h(Notice, { tone: 'ok', onDismiss: () => {}, children: 'Saved' }) } as never))
  check('D6: the default export reads the dashboard language (same API as settings/Notice)', /sr-only">Close</.test(inDash) && /data-notice="ok"/.test(inDash))
  const settings = read('components/settings/Notice.tsx')
  check('D7: settings/Notice.tsx is left in place for WP6 to re-export', /export default function Notice/.test(settings))
}

// ── E) BackLink ───────────────────────────────────────────────────────────────
{
  const html = render(h(BackLink, { href: '/keywords', children: 'Keywords' }))
  const ghost = (s: string) => /<a[^>]*href="\/keywords"/.test(s)
    && ['h-8', 'px-3', 'rounded-control', 'text-caption', 'hover:bg-sunk'].every((c) => s.includes(c))
    && /lucide-arrow-left[^"]*"[^>]*|class="[^"]*rtl:-scale-x-100/.test(s) && s.includes('rtl:-scale-x-100')
  check('E1: ghost sm link with a lucide arrow mirrored in RTL', ghost(html))
  check('MUT: an unmirrored arrow fails E1', !ghost(html.replace('rtl:-scale-x-100', '')))
  const noGlyph = (s: string) => !/[←→]/.test(s.replace(/<[^>]+>/g, ''))
  check('E2: no arrow glyph in the label', noGlyph(html))
  check('MUT: "← back" fails E2', !noGlyph(html.replace('Keywords', '← Keywords')))
  const hrefOf = (href: string) => render(h(BackLink, { href, children: 'x' })).match(/href="([^"]*)"/)?.[1]
  const internal = (f: (s: string) => string | undefined) =>
    f('https://evil.example') === '/' && f('//evil.example') === '/' && f('/\\evil.example') === '/' && f('/projects/1') === '/projects/1'
  check('E3: only internal paths (no external or protocol-relative href)', internal(hrefOf))
  check('MUT: passing any href through fails E3', !internal((s) => s))
}

// ── F) content/Toast is ui/Toast ──────────────────────────────────────────────
{
  const code = (s: string) => strip(s).replace(/['"]use client['"];?/, '').trim()
  const isReExport = (s: string) => code(s) === "export * from '@/components/ui/Toast'"
  const toast = read('components/content/Toast.tsx')
  check('F1: components/content/Toast.tsx only re-exports ui/Toast', isReExport(toast))
  check('MUT: a local 3-second toast back fails F1', !isReExport(toast + '\nsetTimeout(() => {}, 3000)'))
}

// ── G) the root body ──────────────────────────────────────────────────────────
{
  const layout = strip(read('app/layout.tsx'))
  const body = (s: string) => /<body className="[^"]*\bbg-canvas\b[^"]*\btext-body\b[^"]*"/.test(s) && !/<body[^>]*slate-/.test(s)
  check('G1: <body> is bg-canvas text-body, no slate', body(layout))
  check('MUT: the old slate body fails G1', !body(layout.replace('bg-canvas text-body', 'bg-slate-50 text-slate-900')))
}

// ── H) every primitive and the shell stay on the contract ─────────────────────
{
  const walk = (dir: string, out: string[] = []): string[] => {
    for (const name of readdirSync(join(ROOT, dir))) {
      const rel = `${dir}/${name}`
      if (name === '__qa__') continue
      if (statSync(join(ROOT, rel)).isDirectory()) walk(rel, out)
      else if (/\.tsx?$/.test(name)) out.push(rel)
    }
    return out
  }
  const FILES = [...walk('components/ui'), ...walk('components/layout')]
  const RAW = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
  // Banned: Tailwind's own type scale or a bracketed size (the tokens are the
  // scale), an arbitrary or stock shadow (only card/control/pop), a radius off
  // the four tokens, a raw white/black or rgb() colour, a dark: twin, and the
  // motions the contract rules out. (Checkbox's rounded-[5px] is the contract's.)
  const BANNED = /\btext-(?:xs|sm|base|lg|xl|[2-9]xl)\b|\btext-\[\d|\bshadow-(?:sm|md|lg|xl|2xl)\b|\bshadow-\[|\brounded-(?:sm|md|lg|xl|2xl|3xl)\b|\brounded(?=[\s'"`])|(?:^|[\s'"`:])(?:bg|text|border|ring|from|to|via|fill|stroke|divide|outline)-(?:white|black)\b|\brgba?\(|\btransition-all\b|\banimate-pulse\b|\bhover:scale|\bdark:/
  const GLYPH = /[✓✗✕↕▸◂▾→←•▦↶↷▲▼]|\p{Extended_Pictographic}/u
  const why = (s: string) => [RAW.exec(s)?.[0], BANNED.exec(s)?.[0], GLYPH.exec(s)?.[0]].filter(Boolean).join(' ')
  const clean = (s: string) => !RAW.test(s) && !BANNED.test(s) && !GLYPH.test(s)
  const dirty = FILES.filter((f) => !clean(strip(read(f))))
  check(`H: none of the ${FILES.length} ui/layout files has a raw colour, banned size/shadow/radius or glyph`, dirty.length === 0,
    dirty.map((f) => `${f}: ${why(strip(read(f)))}`).join('; '))
  const modal = strip(read('components/ui/Modal.tsx'))
  check('MUT: a raw blue in a primitive fails H', !clean(strip(read(FILES[0])) + ' bg-blue-600'))
  check('MUT: a ✕ glyph in a primitive fails H', !clean(modal + ' ✕'))
  check('MUT: the ▲ glyph in a primitive fails H', !clean(strip(read('components/ui/StatTile.tsx')) + " '▲'"))
  check('MUT: a bracketed type size fails H', !clean(strip(read('components/layout/Header.tsx')) + ' text-[0.9375rem]'))
  check('MUT: rounded-lg fails H', !clean(strip(read('components/ui/SiteAvatar.tsx')) + " 'size-9 rounded-lg'"))
  check('MUT: an arbitrary rgb shadow fails H', !clean(strip(read('components/ui/Button.tsx')) + " 'shadow-[inset_0_1px_0_rgb(255_255_255/0.14)]'"))
  check('MUT: bg-white fails H', !clean(strip(read('components/ui/SiteAvatar.tsx')) + " 'bg-white ring-1'"))
  check('MUT: animate-pulse fails H', !clean(strip(read('components/ui/Skeleton.tsx')) + " 'animate-pulse'"))
}

// ── I) Modal ──────────────────────────────────────────────────────────────────
{
  const html = render(h(DashboardLanguageProvider as never, { initialLocale: 'en', children: h(Modal, { open: false, onClose: () => {}, title: 'Brief', children: 'x' }) } as never))
  const closeOk = (s: string) => /<button[^>]*aria-label="Close"[^>]*>\s*<svg[^>]*class="[^"]*lucide-x[^"]*size-4/.test(s) && !s.includes('✕')
  check('I1: the close control is a lucide X (size-4) in the icon button, with its spoken name', closeOk(html))
  check('MUT: the ✕ glyph back fails I1', !closeOk(html.replace(/<svg[\s\S]*?<\/svg>/, '<span aria-hidden="true">✕</span>')))
  const backdrop = (s: string) => /backdrop:bg-backdrop\b/.test(s) && !/backdrop:bg-\[/.test(s)
  check('I2: the backdrop is the backdrop token', backdrop(html))
  check('MUT: the raw rgb backdrop back fails I2', !backdrop(html.replace('backdrop:bg-backdrop', 'backdrop:bg-[rgb(21_23_28/0.42)]')))
  const css = read('app/globals.css')
  const token = (c: string) => /--color-backdrop: rgba\(21, 23, 28, 0\.42\);/.test(c) && /\.dark \{[\s\S]*?--color-backdrop: rgba\(0, 0, 0, 0\.6\);/.test(c) && /dialog::backdrop \{\s*background: var\(--color-backdrop\);/.test(c)
  check('I3: globals.css defines the backdrop token (dimmer in dark) and dialog::backdrop uses it', token(css))
  check('MUT: a raw dialog::backdrop colour fails I3', !token(css.replace('background: var(--color-backdrop);', 'background: rgba(21, 23, 28, 0.42);')))
}

// ── J) change arrows ──────────────────────────────────────────────────────────
{
  const tile = (direction: 'up' | 'down' | 'flat') => render(h(StatTile, { label: 'Avg', value: '7', delta: { value: '3', direction } }))
  const text = (s: string) => s.replace(/<[^>]+>/g, '')
  const arrow = (s: string, icon: string, tone: string) =>
    new RegExp(`class="[^"]*${tone}[^"]*"><svg[^>]*class="[^"]*lucide-${icon}[^"]*size-3`).test(s) && !/[▲▼•]/.test(text(s))
  check('J1: a StatTile delta is a lucide arrow in the ok/bad/muted tone, no glyph',
    arrow(tile('up'), 'arrow-up', 'text-ok') && arrow(tile('down'), 'arrow-down', 'text-bad') && arrow(tile('flat'), 'minus', 'text-muted'))
  check('MUT: the ▲ glyph instead of the arrow fails J1', !arrow(tile('up').replace(/<svg[\s\S]*?<\/svg>/, '▲ '), 'arrow-up', 'text-ok'))
  const pc = (change: number | null) => render(h(PositionChange, { change }))
  check('J2: PositionChange is a lucide arrow and the places, in ok/bad; a hold is a muted Minus',
    arrow(pc(4), 'arrow-up', 'text-ok') && text(pc(4)).endsWith('4') && arrow(pc(-2), 'arrow-down', 'text-bad') && text(pc(-2)).endsWith('2')
      && arrow(pc(0), 'minus', 'text-muted') && text(pc(null)) === '—')
  check('MUT: the ▼ glyph back fails J2', !arrow(pc(-2).replace(/<svg[\s\S]*?<\/svg>/, '▼ '), 'arrow-down', 'text-bad'))
  const spoken = (s: string, sign: string) => s.includes(`<span class="sr-only">${sign}</span>`)
  check('J3: a screen reader hears the sign (+ / −) the arrow draws', spoken(pc(4), '+') && spoken(pc(-2), '−') && spoken(tile('up'), '+') && spoken(tile('down'), '−'))
  check('MUT: an unspoken direction fails J3', !spoken(pc(4).replace('<span class="sr-only">+</span>', ''), '+'))
  const utils = strip(read('lib/utils.ts'))
  check('J4: lib/utils has no ▲▼ change label left', !/[▲▼]/.test(utils))
  check('MUT: getChangeLabel\'s ▲ back fails J4', /[▲▼]/.test(utils + "\nreturn `▲ ${change}`"))
}

// ── K) Table on a phone ───────────────────────────────────────────────────────
{
  const row = (cells: unknown[]) => h(TableRow, { children: cells as never })
  const table = (stackBelowSm: boolean) => render(h(Table, { stackBelowSm, children: [
    h(TableHead, { key: 'h', children: row([h(Th, { key: 1, children: 'Page' }), h(Th, { key: 2, children: 'Clicks' }), h(Th, { key: 3, hideBelow: 'sm', children: 'CTR' }), h(Th, { key: 4 })]) }),
    h(TableBody, { key: 'b', children: row([
      h(Td, { key: 1, children: ['Home', h(TableMeta, { key: 'm', children: 'CTR 3%' })] }),
      h(Td, { key: 2, label: 'Clicks', children: '12' }),
      h(Td, { key: 3, hideBelow: 'sm', children: '3%' }),
      h(Td, { key: 4, stack: 'end', children: 'menu' }),
    ]) }),
  ] }))
  const stacked = table(true), plain = table(false)
  const cell = (s: string, text: string) => s.match(new RegExp(`<td[^>]*>${text}`))?.[0] ?? ''
  const head = (s: string) => /<thead class="[^"]*max-sm:hidden/.test(s)
  const rowFlex = (s: string) => /<tbody[^>]*max-sm:block[\s\S]*?<tr class="[^"]*max-sm:flex max-sm:flex-wrap[^"]*max-sm:after:basis-full/.test(s)
  const title = (s: string) => /data-stack="auto"[^>]*max-sm:first:flex-1[^>]*max-sm:first:text-ink/.test(cell(s, 'Home'))
  const meta = (s: string) => { const c = cell(s, '12'); return /data-label="Clicks"/.test(c) && /max-sm:order-2/.test(c) && /max-sm:before:content-\[attr\(data-label\)\]/.test(c) }
  const end = (s: string) => /data-stack="end"[^>]*max-sm:ms-auto/.test(cell(s, 'menu'))
  const hidden = (s: string) => { const c = cell(s, '3%'); return /max-sm:hidden/.test(c) && !/max-sm:block/.test(c) }
  check('K1: stackBelowSm hides the head and makes each row a wrapping line with a break', head(stacked) && rowFlex(stacked))
  check('MUT: a visible head fails K1', !head(stacked.replace(/(<thead class="[^"]*)max-sm:hidden/, '$1')))
  check('K2: the first cell is the title line, a labelled cell a "label value" meta, an end cell ends the title line', title(stacked) && meta(stacked) && end(stacked))
  check('MUT: a cell without its label fails K2', !meta(stacked.replace('data-label="Clicks"', '')))
  check('K3: hideBelow="sm" hides the column (it wins over the stacked display)', hidden(stacked) && hidden(plain) && /<th class="[^"]*max-sm:hidden[^"]*">CTR/.test(plain))
  check('MUT: a hidden cell the stacked block overrides fails K3', !hidden(stacked.replace(/(<td[^>]*class="[^"]*)max-sm:hidden/, '$1max-sm:block')))
  check('K4: TableMeta is a caption line shown only below sm', /<span class="mt-0\.5 block text-caption text-muted sm:hidden">CTR 3%<\/span>/.test(plain))
  const ordinary = (s: string) => !/max-sm:(?:block|flex|order|before)|data-stack|data-label/.test(s)
  check('K5: without stackBelowSm the table is the ordinary one (no stacked classes or data)', ordinary(plain))
  check('MUT: stacked markup in a plain table fails K5', !ordinary(stacked))
}

// ── L) Skeleton family ────────────────────────────────────────────────────────
{
  const dark = render(h(Skeleton, { tone: 'contrast', className: 'h-4' }))
  const inline = render(h(Skeleton, { inline: true, className: 'h-7 w-12' }))
  const labelled = render(h(Skeleton, { inline: true, label: 'Volume on its way', className: 'h-3.5 w-14' }))
  const tone = (s: string) => /class="skeleton-contrast /.test(s) && /aria-hidden="true"/.test(s)
  check('L1: tone="contrast" shimmers in the contrast ink (for the dark hero)', tone(dark))
  check('MUT: a light skeleton on the dark card fails L1', !tone(dark.replace('skeleton-contrast', 'skeleton')))
  const inl = (s: string) => /inline-block align-middle/.test(s) && !/\bblock rounded/.test(s.replace('inline-block', ''))
  check('L2: inline sits in a line or a StatTile value', inl(inline))
  check('MUT: a block skeleton in a line fails L2', !inl(inline.replace('inline-block align-middle', 'block')))
  const spoken = (s: string) => /<span role="status"[^>]*><span class="sr-only">Volume on its way<\/span><span aria-hidden="true"/.test(s)
  check('L3: a stand-alone skeleton says what is loading to a screen reader', spoken(labelled))
  check('MUT: an unlabelled stand-alone skeleton fails L3', !spoken(labelled.replace('Volume on its way', '')))
  const tileSk = render(h(StatTileSkeleton, {}))
  const hero = render(h(ContextCardSkeleton, { ring: true }))
  const shapes = (t: string, c: string) => /rounded-card border border-line bg-surface p-4 shadow-card sm:p-5/.test(t) && (t.match(/class="skeleton /g) ?? []).length === 3
    && /rounded-card[^"]*bg-contrast/.test(c) && (c.match(/skeleton-contrast/g) ?? []).length === 3 && /size-32/.test(c)
  check('L4: a StatTile skeleton in the tile frame; a context-card skeleton on the navy surface', shapes(tileSk, hero))
  check('MUT: a tile skeleton with no placeholders fails L4', !shapes(tileSk.replaceAll('class="skeleton ', 'class="'), hero))
  const region = render(h(SkeletonRegion, { label: 'Loading', children: 'x' }))
  check('L5: SkeletonRegion is a busy live region with one spoken sentence', /role="status" aria-busy="true"/.test(region) && /sr-only">Loading</.test(region))
  const noPulse = (s: string) => !/animate-pulse/.test(s)
  check('L6: no skeleton pulses (the shimmer is the one loop)', [dark, inline, labelled, tileSk, hero].every(noPulse))
  check('MUT: a pulsing skeleton fails L6', ![dark + 'animate-pulse'].every(noPulse))
  const css = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '')
  const gated = (c: string) => /@media \(prefers-reduced-motion: no-preference\) \{\n  \.skeleton \{[^}]*\}\n  \.skeleton-contrast \{ animation: shimmer 1\.2s linear infinite; \}\n\}/.test(c)
    && !/\n\.skeleton-contrast \{[^}]*animation/.test(c)
  check('L7: the contrast shimmer runs only without reduced motion', gated(css))
  check('MUT: an ungated contrast shimmer fails L7', !gated(css + '\n.skeleton-contrast { animation: shimmer 1.2s linear infinite; }'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
