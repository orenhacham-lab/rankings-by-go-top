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
 *   H) none of the new primitives uses a raw palette colour, a banned size,
 *      shadow, radius or transition-all, or a glyph icon.
 * Every check has a mutation control: the same predicate on a broken copy fails.
 *   npx tsx components/ui/__qa__/ui-primitives.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement as h } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import Checkbox from '../Checkbox'
import Switch from '../Switch'
import Segmented from '../Segmented'
import Notice, { NoticeBox, NOTICE_MAX_ITEMS } from '../Notice'
import BackLink from '../BackLink'
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

// ── H) the primitives themselves stay on the contract ─────────────────────────
{
  const FILES = ['Checkbox', 'Switch', 'Segmented', 'Notice', 'BackLink'].map((n) => `components/ui/${n}.tsx`)
  const RAW = /\b(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/
  const BANNED = /\btext-(?:xs|sm|base|lg|xl|2xl)\b|\btext-\[\d|\bshadow-(?:sm|md|lg|xl|2xl)\b|\brounded-(?:md|lg|xl|2xl|3xl)\b|\btransition-all\b|\bdark:/
  const GLYPH = /[✓✗✕↕▸◂▾→←•▦↶↷]|\p{Extended_Pictographic}/u
  const clean = (s: string) => !RAW.test(s) && !BANNED.test(s) && !GLYPH.test(s)
  for (const f of FILES) check(`H: ${f} has no raw colour, banned size/shadow/radius or glyph`, clean(strip(read(f))))
  check('MUT: a raw blue in a primitive fails H', !clean(strip(read(FILES[0])) + ' bg-blue-600'))
  check('MUT: a ✕ glyph in a primitive fails H', !clean(strip(read(FILES[3])) + ' ✕'))
}

console.log(`\n${pass} passed, ${fail} failed`)
process.exit(fail ? 1 : 0)
export {}
