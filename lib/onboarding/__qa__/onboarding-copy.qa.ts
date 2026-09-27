/**
 * The onboarding copy (lib/i18n/dashboard/{he,en}.ts, section seedOnboarding)
 * and the one field's syntax.
 *
 * The English dictionary is cast to the Hebrew one's type, so the compiler does
 * not hold the two to the same shape; this suite does: the same keys, the same
 * functions taking the same arguments, lists of the same length. The Hebrew
 * carries the plan's exact words where the plan gives them; the English has no
 * Hebrew in it; neither uses an em dash. The section sits directly after
 * `onboarding` in both files, where parallel branches expect it.
 *
 * The address field's syntax (lib/onboarding/site-input.ts) runs in the
 * browser, so it cannot use the scan's URL guard, which resolves DNS; here the
 * two give the same verdict and the same host on every input.
 *
 * Run: npx tsx lib/onboarding/__qa__/onboarding-copy.qa.ts
 */
import { dashboardEn } from '@/lib/i18n/dashboard/en'
import { dashboardHe } from '@/lib/i18n/dashboard/he'
import { normalizeCheckUrl } from '@/lib/free-check/url-guard'
import { makeChecker } from '@/lib/seed-scan/__qa__/_fixtures'
import { readSiteInput } from '../site-input'

const { check, finish } = makeChecker()
const HEBREW = /[֐-׿]/
const EM_DASH = /—/

type Leaf = { path: string; value: unknown }

function leaves(node: unknown, path = ''): Leaf[] {
  if (node && typeof node === 'object' && !Array.isArray(node)) {
    return Object.entries(node as Record<string, unknown>).flatMap(([k, v]) => leaves(v, path ? `${path}.${k}` : k))
  }
  return [{ path, value: node }]
}

/** Sample arguments for a copy function: a domain-like string or a small number, by parameter name. */
function sample(fn: (...args: unknown[]) => unknown): unknown[] {
  const params = /^[^(]*\(([^)]*)\)/.exec(fn.toString())?.[1] ?? ''
  return params
    .split(',')
    .map((p) => p.trim().split(':')[0].trim())
    .filter(Boolean)
    .map((name) => (/^(n|total|max|hours|days|passed)$/.test(name) ? 3 : 'shop.example.com'))
}

function render(value: unknown): string[] {
  if (typeof value === 'string') return [value]
  if (Array.isArray(value)) return value.flatMap(render)
  if (typeof value === 'function') {
    const fn = value as (...args: unknown[]) => unknown
    // Exercise the branches a count-taking function has (0, 1, 2, many).
    const args = sample(fn)
    const outs = [fn(...args)]
    if (args.some((a) => typeof a === 'number')) for (const n of [0, 1, 2]) outs.push(fn(...args.map((a) => (typeof a === 'number' ? n : a))))
    return outs.map(String)
  }
  return []
}

function main() {
  const he = dashboardHe.seedOnboarding
  const en = dashboardEn.seedOnboarding as unknown as typeof he

  console.log('\n1) The same shape in both languages')
  const heLeaves = leaves(he)
  const enLeaves = leaves(en)
  const hePaths = heLeaves.map((l) => l.path).sort()
  const enPaths = enLeaves.map((l) => l.path).sort()
  check('the same keys, all the way down', JSON.stringify(hePaths) === JSON.stringify(enPaths),
    `only he: ${hePaths.filter((p) => !enPaths.includes(p)).join(', ')}; only en: ${enPaths.filter((p) => !hePaths.includes(p)).join(', ')}`)
  const mismatched = heLeaves.filter((l) => {
    const other = enLeaves.find((e) => e.path === l.path)?.value
    if (typeof l.value !== typeof other) return true
    if (typeof l.value === 'function') return (l.value as () => unknown).length !== (other as () => unknown).length
    if (Array.isArray(l.value)) return !Array.isArray(other) || (l.value as unknown[]).length !== (other as unknown[]).length
    return false
  })
  check('the same kind of value at every key: text, a function of the same arguments, a list of the same length', mismatched.length === 0, mismatched.map((m) => m.path).join(', '))
  check('nothing empty', heLeaves.concat(enLeaves).every((l) => render(l.value).every((s) => s.trim().length > 0)))

  console.log('\n2) The words')
  const heText = heLeaves.flatMap((l) => render(l.value))
  const enText = enLeaves.flatMap((l) => render(l.value))
  check('no Hebrew in the English copy', enText.every((s) => !HEBREW.test(s)), enText.find((s) => HEBREW.test(s)))
  check('no em dash in either language', heText.concat(enText).every((s) => !EM_DASH.test(s)), heText.concat(enText).find((s) => EM_DASH.test(s)))
  // The one line that is not prose: the example address inside the field.
  const prose = heLeaves.filter((l) => l.path !== 'newProject.urlPlaceholder')
  check('every Hebrew line is Hebrew (brand words like AI and Search Console inside it aside)', prose.every((l) => render(l.value).every((s) => HEBREW.test(s))),
    prose.find((l) => render(l.value).some((s) => !HEBREW.test(s)))?.path)
  const exact: [string, string, string][] = [
    ['the badge', he.summary.badge, 'תמצית מחקר ראשונה'],
    ['the title', he.summary.title('אינסטלציה מהירה'), 'הנה מה שמצאנו על אינסטלציה מהירה'],
    ['when', he.summary.scannedJustNow('plumber-tlv.co.il'), 'סרקנו את plumber-tlv.co.il הרגע'],
    ['the only promise of time', he.progress.promise, 'זה לוקח עד דקה'],
    ['…the same on the address screen', he.newProject.promise, 'זה לוקח עד דקה'],
    ['a clean site', he.summary.findings.clean, 'האתר נקי מהבעיות שאנחנו בודקים'],
    ['Start', he.summary.start.button, 'התחל'],
    ['Edit', he.summary.edit, 'ערוך'],
    ['the first article', he.firstArticle.button, 'כתוב את המאמר הראשון'],
    ['tile 1', he.summary.tiles.keywords, 'מילות מפתח שנקדם'],
    ['tile 2', he.summary.tiles.fixes, 'דברים לתקן באתר'],
    ['tile 3', he.summary.tiles.geo, 'מוכנות לתשובות AI'],
    ['tile 4', he.summary.tiles.articles, 'מאמרים מוכנים לכתיבה'],
    ['step 1', he.progress.steps.a1.title, 'קוראים את האתר'],
    ['step 2', he.progress.steps.a2.title, 'מבינים את העסק'],
    ['step 3', he.progress.steps.a3.title, 'בודקים מה מעכב'],
    ['step 4', he.progress.steps.a4.title, 'מוצאים מתחרים'],
    ['a line of step 1', he.progress.steps.a1.lines[0], 'קוראים את עמוד הבית'],
    ['another', he.progress.steps.a1.lines[1], 'בודקים אם בוטים של AI יכולים להיכנס'],
    ['a line of step 2', he.progress.steps.a2.lines[1], 'מזהים את קהלי היעד'],
    ['a locked store, AI readiness', he.summary.geo.locked, 'לא נבדק: החנות נעולה בסיסמה'],
    ['a locked store, in English', en.summary.geo.locked, 'Not checked: the store is password protected'],
  ]
  for (const [label, got, want] of exact) check(`the plan's words: ${label}`, got === want, got)

  console.log('\n3) Where the section sits')
  for (const [name, dict] of [['he', dashboardHe], ['en', dashboardEn]] as const) {
    const keys = Object.keys(dict)
    check(`${name}: seedOnboarding directly follows onboarding`, keys.indexOf('seedOnboarding') === keys.indexOf('onboarding') + 1 && keys.indexOf('onboarding') >= 0)
    check(`${name}: …and is not the last section`, keys.indexOf('seedOnboarding') < keys.length - 1)
  }

  console.log('\n4) The address field agrees with the scan\'s URL guard')
  const inputs = [
    'plumber-tlv.co.il', 'www.plumber-tlv.co.il', 'https://www.plumber-tlv.co.il/services?x=1#top', 'HTTP://Shop.Example.COM', 'shop.co.il.',
    'https://northwind-candles.myshopify.com', 'דוגמה.co.il', 'sub.domain.example.org/path',
    '', '   ', 'not a url', 'localhost', 'http://localhost:3000', 'shop.local', 'router.home.arpa', 'site.internal', 'x.test', 'a.example',
    '127.0.0.1', 'http://10.0.0.5/', '[::1]', 'http://2130706433/', '0x7f000001', 'ftp://example.com', 'javascript:alert(1)',
    'https://user:pass@example.com', 'https://example.com:8443', 'example', 'example.c', 'example.123', 'metadata.google.internal',
    `${'a'.repeat(300)}.com`,
  ]
  const disagreements: string[] = []
  for (const input of inputs) {
    const ours = readSiteInput(input)
    const guard = normalizeCheckUrl(input)
    const same = ours.ok === guard.ok && (!ours.ok || (guard.ok && ours.domain === guard.url.hostname))
    const sameEmpty = ours.ok || guard.ok || (ours.reason === 'empty') === (guard.reason === 'empty')
    if (!same || !sameEmpty) disagreements.push(`${JSON.stringify(input)}: ${JSON.stringify(ours)} vs ${guard.ok ? guard.url.hostname : guard.reason}`)
  }
  check(`the same verdict and host on ${inputs.length} inputs, the tricky ones included`, disagreements.length === 0, disagreements.join('; '))
  check('the project is named after the site without www', (() => {
    const r = readSiteInput('https://www.Plumber-TLV.co.il/')
    return r.ok && r.domain === 'www.plumber-tlv.co.il' && r.name === 'plumber-tlv.co.il'
  })())
  check('empty and invalid are told apart (two different messages)', (() => {
    const e = readSiteInput('  ')
    const i = readSiteInput('not a url')
    return !e.ok && e.reason === 'empty' && !i.ok && i.reason === 'invalid'
  })())

  finish()
}

main()

export {}
