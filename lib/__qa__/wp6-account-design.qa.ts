/**
 * Account, reports, projects, onboarding, billing, clients, admin and setup screens
 * on the design contract (design audit package WP6).
 *
 *   A) Source contract over every file WP6 owns: no raw palette colours, no dark:
 *      twins, no native checkbox/select (a visually hidden radio inside a choice
 *      card is the one allowed native control), no legacy text sizes or arbitrary
 *      pixel sizes, only the radius and shadow tokens, no emoji or arrow glyphs in
 *      the markup, no monospace, no bouncy motion. Comments are stripped first.
 *      One pinned file is allowed and nothing else: the new-project page
 *      (hash-pinned by onboarding-surfaces). The Shopify billing panel and the
 *      link class the article editor writes into saved HTML used to be exempt;
 *      both are on the tokens now (R4, R12) and are scanned like the rest.
 *   B) /setup never prints a provider's reply: the status route puts Serper's
 *      response body (for example an egress proxy's "Host not in allowlist ...")
 *      or a thrown message into `detail`, and the page showed it as is. The page
 *      now shows status-copy.ts's own sentence for a failed check, keeps the
 *      route's own sentences (connected, not configured), and never crashes on an
 *      error reply that has no services in it.
 *   C) Screen specifics: the auto-scan control is a Switch, the reports show an
 *      EmptyState when there is nothing, the monthly report moves use
 *      PositionChange, billing has one primary plan action (the recommended plan)
 *      and the trial row no longer shares the popular plan's ring, client rows
 *      act through a RowMenu, settings/Notice is the ui Notice, and the dead
 *      RichTextEditor is gone.
 *   E) Admin articles and setup (final review R5, R6, R12, R31, G3): no browser
 *      alert/confirm/prompt (the delete asks through ConfirmDialog, danger; the
 *      editor asks for a link in a row under its toolbar and refuses a
 *      javascript: link in a Notice); a failed save/upload shows our words, not
 *      the route's `error`; the publish date reads the Hebrew way instead of the
 *      browser's mm/dd/yyyy field; the author defaults to the admin's own name,
 *      never an email; and the setup service cards carry their state on the icon
 *      and badge, with no start rail bending round the card's corner.
 * Every guard has a MUTATION CONTROL: the same check on a broken copy fails.
 *
 * Run: npx tsx lib/__qa__/wp6-account-design.qa.ts
 */
import { existsSync, readdirSync, readFileSync, statSync } from 'fs'
import { join, relative } from 'path'
import {
  isStatusShape, logsErrorCopy, serviceCopy, SERVICE_FAILED, TEST_SCAN_FAILED, testScanErrorCopy,
  type ServiceCopy, type ServiceStatusLike, type SetupService,
} from '../../app/(setup)/setup/status-copy'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

function walk(dir: string): string[] {
  const abs = join(ROOT, dir)
  if (!existsSync(abs)) return []
  if (statSync(abs).isFile()) return [dir]
  return readdirSync(abs).flatMap((n) => {
    const p = join(abs, n)
    if (n === '__qa__' || n === 'node_modules') return []
    return statSync(p).isDirectory() ? walk(relative(ROOT, p)) : [relative(ROOT, p)]
  })
}

const OWNED = [
  'app/(dashboard)/settings', 'components/settings',
  'app/(dashboard)/reports', 'components/reports',
  'app/(dashboard)/projects', 'app/projects', 'components/projects',
  'components/onboarding', 'app/(onboarding)',
  'app/(dashboard)/billing',
  'app/(dashboard)/clients', 'components/clients',
  'app/(dashboard)/admin', 'components/admin',
  'app/(setup)', 'app/(dashboard)/reco-qa', 'components/mapping',
].flatMap(walk).filter((f) => /\.tsx?$/.test(f))

/** Hash-pinned by lib/onboarding/__qa__/onboarding-surfaces.qa.ts: it may not change at all. */
const PINNED_FILES = new Set(['app/(dashboard)/projects/new/page.tsx'])

/** Strip block and line comments (not `//` inside a URL string such as https://). */
function stripComments(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
}

/** What each file is checked as: comments out. */
function scanned(file: string, src: string): string {
  const s = stripComments(src)
  // BillingView's Shopify panel and the editor's link class used to be cut out
  // here; both are on the tokens now (R4, R12), so every line is scanned.
  return s
}

const RULES: { id: string; what: string; re: RegExp }[] = [
  { id: 'raw', what: 'raw palette colour', re: /(?<![\w-])(?:[a-z0-9-]+:)*(?:bg|text|border|ring|from|to|via|fill|stroke|divide|placeholder|outline|decoration)-(?:slate|gray|zinc|neutral|stone|red|orange|amber|yellow|lime|green|emerald|teal|cyan|sky|blue|indigo|violet|purple|fuchsia|pink|rose)-\d{2,3}\b/ },
  { id: 'dark', what: 'dark: twin', re: /(?<![\w-])dark:/ },
  { id: 'select', what: 'native <select>', re: /<select\b/ },
  { id: 'checkbox', what: 'native checkbox', re: /type="checkbox"/ },
  { id: 'textsz', what: 'legacy or arbitrary text size', re: /(?<![\w-])(?:[a-z0-9-]+:)*text-(?:xs|sm|base|lg|xl|[2-9]xl|\[\d[\d.]*(?:px|rem)\])(?![\w-])/ },
  { id: 'radius', what: 'radius outside the tokens', re: /(?<![\w-])(?:[a-z0-9-]+:)*rounded(?:-(?:sm|md|lg|xl|2xl|3xl|\[[^\]]+\]))?(?![\w-])/ },
  { id: 'shadow', what: 'shadow outside the tokens', re: /(?<![\w-])(?:[a-z0-9-]+:)*shadow(?:-(?:sm|md|lg|xl|2xl|\[[^\]]+\]))?(?![\w-])/ },
  { id: 'mono', what: 'monospace', re: /(?<![\w-])font-mono(?![\w-])/ },
  { id: 'motion', what: 'bouncy motion', re: /transition-all|hover:scale|animate-bounce|(?<![\w-])animate-pulse/ },
  { id: 'glyph', what: 'emoji or arrow glyph', re: /[✓✗✕✔↕▸◂▾→←•⚠∅]|\p{Extended_Pictographic}/u },
]

/** A visually hidden radio inside a choice card (ProfileCard's commerce type) is fine. */
function nativeRadios(src: string): string[] {
  // Up to the tag's own "/>": an arrow function inside the tag has a ">" of its own.
  return [...src.matchAll(/<input\b[\s\S]*?\/>/g)].map((m) => m[0])
    .filter((tag) => /type="radio"/.test(tag) && !/className="sr-only"/.test(tag))
}

function violations(file: string, src: string): string[] {
  if (PINNED_FILES.has(file)) return []
  const s = scanned(file, src)
  const out: string[] = []
  const lines = s.split('\n')
  for (const rule of RULES) {
    lines.forEach((line, i) => {
      // `.ts` helpers (copy, summaries) may print plain text arrows; only markup is checked for glyphs.
      if (rule.id === 'glyph' && !file.endsWith('.tsx')) return
      if (rule.re.test(line)) out.push(`${file}:${i + 1} ${rule.what}: ${line.trim().slice(0, 90)}`)
    })
  }
  for (const tag of nativeRadios(s)) out.push(`${file}: visible native radio ${tag.slice(0, 60)}`)
  return out
}

// ── A) the source contract ───────────────────────────────────────────────────
console.log('A) WP6 files are on the design tokens and primitives')
{
  check(`A0: the owned set is non-trivial (${OWNED.length} files)`, OWNED.length > 60)
  const found = OWNED.flatMap((f) => violations(f, read(f)))
  for (const rule of RULES) {
    const hits = found.filter((v) => v.includes(` ${rule.what}:`))
    check(`A-${rule.id}: no ${rule.what} in WP6 files`, hits.length === 0, hits.slice(0, 4).join(' | '))
  }
  const radios = found.filter((v) => v.includes('visible native radio'))
  check('A-radio: no visible native radio (a hidden one inside a choice card is allowed)', radios.length === 0, radios.join(' | '))

  // Mutation controls: the same scanner on broken copies.
  const card = 'components/settings/SettingsCard.tsx'
  const src = read(card)
  check('MUTATION CONTROL: a bg-slate-100 class is caught', violations(card, `${src}\nconst x = <b className="bg-slate-100" />`).some((v) => v.includes('raw palette')))
  check('MUTATION CONTROL: a dark:bg-surface twin is caught', violations(card, `${src}\nconst x = <b className="dark:bg-surface" />`).some((v) => v.includes('dark:')))
  check('MUTATION CONTROL: a native <select> is caught', violations(card, `${src}\nconst x = <select />`).some((v) => v.includes('<select>')))
  check('MUTATION CONTROL: a native checkbox is caught', violations(card, `${src}\nconst x = <input type="checkbox" />`).some((v) => v.includes('checkbox')))
  check('MUTATION CONTROL: text-sm and text-[11px] are caught', violations(card, `${src}\nconst x = <b className="text-sm" />`).some((v) => v.includes('text size'))
    && violations(card, `${src}\nconst x = <b className="md:text-[11px]" />`).some((v) => v.includes('text size')))
  check('MUTATION CONTROL: rounded-xl and a bare rounded are caught', violations(card, `${src}\nconst x = <b className="rounded-xl" />`).some((v) => v.includes('radius'))
    && violations(card, `${src}\nconst x = <b className="rounded p-2" />`).some((v) => v.includes('radius')))
  check('MUTATION CONTROL: shadow-sm and an arbitrary shadow are caught', violations(card, `${src}\nconst x = <b className="shadow-sm" />`).some((v) => v.includes('shadow'))
    && violations(card, `${src}\nconst x = <b className="shadow-[0_1px_2px_red]" />`).some((v) => v.includes('shadow')))
  check('MUTATION CONTROL: font-mono is caught', violations(card, `${src}\nconst x = <b className="font-mono" />`).some((v) => v.includes('monospace')))
  check('MUTATION CONTROL: transition-all and animate-pulse are caught', violations(card, `${src}\nconst x = <b className="transition-all animate-pulse" />`).some((v) => v.includes('motion')))
  check('MUTATION CONTROL: an emoji and a ✓ glyph are caught', violations(card, `${src}\nconst x = <b>🚀 go</b>`).some((v) => v.includes('glyph'))
    && violations(card, `${src}\nconst x = <b>✓ done</b>`).some((v) => v.includes('glyph')))
  check('MUTATION CONTROL: a visible native radio is caught, a hidden one in a card is not',
    violations(card, `${src}\nconst x = <input type="radio" name="a" />`).some((v) => v.includes('native radio'))
    && !violations(card, `${src}\nconst x = <input type="radio" name="a" className="sr-only" />`).some((v) => v.includes('native radio')))
  check('MUTATION CONTROL: a commented-out raw class is ignored', !violations(card, `${src}\n// old: bg-slate-100\n/* text-sm */`).some((v) => /raw palette|text size/.test(v)))
  const billing = 'app/(dashboard)/billing/BillingView.tsx'
  const bsrc = read(billing)
  check('MUTATION CONTROL: a raw colour OUTSIDE the Shopify panel of BillingView is caught', violations(billing, bsrc.replace('data-plan-card', 'data-x="1" className="bg-blue-50" data-plan-card')).some((v) => v.includes('raw palette')))
  check('MUTATION CONTROL: the old Shopify panel classes are caught too (no longer exempt)', violations(billing, bsrc.replace('<Card className="mb-8 p-5 sm:p-6">\n          <div className="flex items-start gap-3" data-billing-shopify>', '<div className="mb-8 p-6 bg-white dark:bg-slate-900 border border-slate-200 rounded-lg">\n          <div data-billing-shopify>')).some((v) => v.includes('raw palette')))
  const editor = 'components/admin/ArticleEditor.tsx'
  check('MUTATION CONTROL: the old raw link class written by the editor is caught', violations(editor, read(editor).replace('text-action underline underline-offset-2 hover:text-action-hover', 'text-blue-600 underline hover:text-blue-700')).some((v) => v.includes('raw palette')))
}

// ── B) /setup says what failed in our words ──────────────────────────────────
console.log('\nB) /setup never prints a provider reply')
{
  const proxy403: ServiceStatusLike = { ok: false, label: 'שגיאה 403', detail: 'Host not in allowlist: google.serper.dev. Add this host to your network egress settings to allow access.' }
  const thrown: ServiceStatusLike = { ok: false, label: 'שגיאה', detail: 'fetch failed' }
  const timeout: ServiceStatusLike = { ok: false, label: 'תם הזמן', detail: 'This operation was aborted' }
  const notConfigured: ServiceStatusLike = { ok: false, label: 'לא מוגדר', detail: 'משתנה הסביבה SERPER_API_KEY חסר.' }
  const connected: ServiceStatusLike = { ok: true, label: 'מחובר', detail: 'ה-API של Serper פועל ומחזיר תוצאות.' }
  const dbError: ServiceStatusLike = { ok: false, label: 'שגיאת חיבור', detail: 'relation "public.clients" does not exist' }

  /** The property B guards: a failed check's detail is ours, never the provider's text. */
  const hidesRaw = (fn: (s: SetupService, st: ServiceStatusLike | null | undefined) => ServiceCopy) =>
    fn('serper', proxy403).detail === SERVICE_FAILED.serper && !/allowlist|egress/i.test(fn('serper', proxy403).detail)
    && fn('serper', thrown).detail === SERVICE_FAILED.serper
    && fn('supabase', dbError).detail === SERVICE_FAILED.supabase && !/relation/.test(fn('supabase', dbError).detail)
    && !/\d{3}/.test(fn('serper', proxy403).label)

  check('B1: a failed Serper/Supabase check shows our sentence, not the reply body or message', hidesRaw(serviceCopy))
  check('MUTATION CONTROL: a copy that passes the reply through fails B1',
    !hidesRaw((s, st) => ({ tone: 'bad', label: st?.label ?? '', detail: st?.detail ?? SERVICE_FAILED[s] })))
  check('B2: a timeout keeps the route\'s "timed out" label, with our sentence', serviceCopy('serper', timeout).label === 'תם הזמן' && serviceCopy('serper', timeout).detail === SERVICE_FAILED.serper)
  check('B3: "not configured" and "connected" keep the route\'s own sentences',
    serviceCopy('serper', notConfigured).detail === notConfigured.detail && serviceCopy('serper', notConfigured).tone === 'warn'
    && serviceCopy('serper', connected).detail === connected.detail && serviceCopy('serper', connected).tone === 'ok')
  check('B4: a missing service is a failed check, not a crash', serviceCopy('supabase', undefined).tone === 'bad')
  const shapeOk = (fn: (d: unknown) => boolean) =>
    !fn({ error: 'Unauthorized' }) && !fn(null) && !fn({ supabase: {}, serper: {}, envVars: {} })
    && fn({ supabase: connected, serper: proxy403, envVars: { supabaseUrl: true, supabaseAnonKey: true, supabaseServiceKey: true, serperKey: true } })
  check('B5: an error reply without services is not drawn as a status (the old "reading \'ok\'" crash)', shapeOk(isStatusShape))
  check('MUTATION CONTROL: a shape check that accepts any object fails B5', !shapeOk((d) => !!d && typeof d === 'object'))
  check('B6: the test scan shows the route\'s own validation sentence, and one fixed sentence for anything else',
    testScanErrorCopy('יש להזין מילת מפתח') === 'יש להזין מילת מפתח' && testScanErrorCopy('fetch failed') === TEST_SCAN_FAILED
    && testScanErrorCopy('Unexpected token < in JSON at position 0') === TEST_SCAN_FAILED && testScanErrorCopy(undefined) === null)
  check('B7: the logs tab keeps "Supabase is not configured" and hides any other message',
    /Supabase/.test(logsErrorCopy('Supabase לא מוגדר') ?? '') && !/ECONNREFUSED/.test(logsErrorCopy('connect ECONNREFUSED 127.0.0.1:5432') ?? '') && logsErrorCopy(null) === null)

  const page = stripComments(read('app/(setup)/setup/page.tsx'))
  const rendersRaw = (s: string) => /\{data\.detail\}|\{result\.error\}|\{parsed\.error\}|\{parsed\?\.error\}|\{error\}|\{err\}/.test(s)
  check('B8: the setup page renders no reply text (data.detail, result.error, parsed.error, error)', !rendersRaw(page))
  check('B9: the page draws through serviceCopy, testScanErrorCopy, logsErrorCopy and isStatusShape',
    /serviceCopy\(key, data\)/.test(page) && /\{copy\.detail\}/.test(page) && /testScanErrorCopy\(result\?\.error\)/.test(page) && /logsErrorCopy\(error\)/.test(page) && /isStatusShape\(data\)/.test(page))
  check('MUTATION CONTROL: the page printing data.detail again fails B8', rendersRaw(page.replace('{copy.detail}', '{data.detail}')))
  check('B10: the admin "show raw response" panel is still there', /JSON\.stringify\(result\.raw, null, 2\)/.test(page))
}

// ── C) screen specifics ──────────────────────────────────────────────────────
console.log('\nC) screen specifics')
{
  const form = stripComments(read('components/projects/ProjectForm.tsx'))
  const autoSwitch = (s: string) => /<Switch\s[^>]*checked=\{autoScan\}/.test(s) && !/type="checkbox"/.test(s)
  check('C1: the auto-scan control is the ui Switch', autoSwitch(form))
  check('MUTATION CONTROL: a native checkbox for auto-scan fails C1', !autoSwitch(form.replace(/<Switch\s[^>]*checked=\{autoScan\}[^>]*\/>/, '<input type="checkbox" checked={autoScan} />')))

  const reports = stripComments(read('app/(dashboard)/reports/page.tsx'))
  const empties = (s: string) => /<EmptyState[\s\S]*?title=\{t\.google\.emptyTitle\}/.test(s) && /<EmptyState[\s\S]*?title=\{t\.ai\.emptyTitle\}/.test(s)
  check('C2: both reports show an EmptyState when there is nothing to report', empties(reports))
  check('MUTATION CONTROL: dropping the Google empty state fails C2', !empties(reports.replace('title={t.google.emptyTitle}', 'title="x"')))

  const monthly = ['components/reports/monthly/MonthlyReportView.tsx', 'components/reports/monthly/MonthlyReports.tsx'].map((f) => stripComments(read(f)))
  const usesChange = (srcs: string[]) => srcs.every((s) => /<PositionChange\b/.test(s) && !/[▲▼]/.test(s))
  check('C3: monthly report moves use PositionChange, never a hand-drawn ▲/▼', usesChange(monthly))
  check('MUTATION CONTROL: a hand-drawn ▲ in the monthly view fails C3', !usesChange([monthly[0] + '<span>▲ 3</span>', monthly[1]]))

  const billing = stripComments(read('app/(dashboard)/billing/BillingView.tsx'))
  const onePrimary = (s: string) => /variant=\{recommended \? 'primary' : 'secondary'\}/.test(s)
    && (s.match(/planAction\('[a-z_]+', true\)/g) ?? []).length === 1 && /planAction\('advanced', true\)/.test(s)
  check('C4: billing has one primary plan action, on the recommended plan', onePrimary(billing))
  check('MUTATION CONTROL: a second primary plan fails C4', !onePrimary(billing.replace("planAction('premium')", "planAction('premium', true)")))
  const ringOnlyPopular = (s: string) => (s.match(/ring-1 ring-action/g) ?? []).length === 1 && /isPopular \? 'border-action ring-1 ring-action'/.test(s)
  check('C5: only the popular plan carries the accent ring (the trial row and current plan do not)', ringOnlyPopular(billing))
  check('MUTATION CONTROL: the ring back on the current plan fails C5', !ringOnlyPopular(billing.replace("isCurrent ? 'border-line-strong' : 'border-line',", "isCurrent ? 'border-action ring-1 ring-action' : 'border-line',")))

  const clients = stripComments(read('components/clients/ClientsTable.tsx'))
  const rowMenu = (s: string) => /<RowMenu\b/.test(s) && !/<Button\b/.test(s)
  check('C6: client rows act through a RowMenu, not a row of buttons', rowMenu(clients))
  check('MUTATION CONTROL: a row button fails C6', !rowMenu(clients + '<Button size="sm">x</Button>'))

  const notice = read('components/settings/Notice.tsx')
  check('C7: settings/Notice is the ui Notice', /from '@\/components\/ui\/Notice'/.test(notice) && /export default function Notice/.test(notice) && !/className=/.test(notice))
  check('C8: the dead RichTextEditor is gone and nothing imports it',
    !existsSync(join(ROOT, 'components/RichTextEditor.tsx'))
    && !walk('components').concat(walk('app')).filter((f) => /\.tsx?$/.test(f)).some((f) => /from ['"]@\/components\/RichTextEditor['"]/.test(read(f))))
}

// ── E) admin articles and setup ─────────────────────────────────────────────
console.log('\nE) admin articles and setup: in-page questions, our words, Hebrew dates, no rail')
{
  const formRaw = read('components/admin/ArticleForm.tsx'), editorRaw = read('components/admin/ArticleEditor.tsx')
  const newPageRaw = read('app/(dashboard)/admin/articles/new/page.tsx'), setupRaw = read('app/(setup)/setup/page.tsx')
  const native = (s: string) => /(?<![\w.])(?:window\.)?(?:alert|confirm|prompt)\(/.test(stripComments(s).replace(/await confirm\(\{/g, ''))
  const deleteAsks = (s: string) => {
    const c = stripComments(s)
    return !native(c) && /const \{ confirm, dialog: confirmDialog \} = useConfirm\(\)/.test(c) && /\{confirmDialog\}/.test(c)
      && /const ok = await confirm\(\{[\s\S]*?tone: 'danger',[\s\S]*?\}\)\s*\n\s*if \(!ok\) return[\s\S]*?method: 'DELETE'/.test(c)
  }
  check('E1: deleting an article asks through ConfirmDialog (danger) before the DELETE; no window.confirm', deleteAsks(formRaw))
  check('MUTATION CONTROL: window.confirm back in the form fails E1', !deleteAsks(formRaw.replace('const ok = await confirm({', "const ok = window.confirm('x') && await confirm({")))
  const editorOk = (s: string) => {
    const c = stripComments(s)
    return !native(c) && /data-link-editor/.test(c) && /<NoticeBox tone="bad"[^>]*>קישור מסוג javascript:/.test(c)
      && /setLink\(\{ href: trimmed \}\)/.test(c) && /\/\^\\s\*javascript:\/i\.test\(trimmed\)/.test(c)
  }
  check('E2: the editor asks for a link in the page and refuses javascript: in a Notice (no prompt/alert)', editorOk(editorRaw))
  check('MUTATION CONTROL: window.prompt back in the editor fails E2', !editorOk(editorRaw.replace('setLinkDraft(prev || \'https://\')', "setLinkDraft(window.prompt('url', prev) ?? '')")))
  check('MUTATION CONTROL: the alert for a javascript: link fails E2', !editorOk(editorRaw.replace('setLinkRefused(true)', "window.alert('no')")))
  const ourWords = (s: string) => {
    const c = stripComments(s)
    return !/\.error\s*\?\?|\{json\.error\}|\{data\.error\}|setError\(data\.error|setUploadError\(json\.error/.test(c)
      && /setError\(saveErrorCopy\(res\.status\)\)/.test(c) && /setUploadError\(uploadErrorCopy\(res\.status\)\)/.test(c)
  }
  check('E3: a failed save or upload shows our sentence for its status, never the route\'s error text', ourWords(formRaw))
  check('MUTATION CONTROL: showing data.error again fails E3', !ourWords(formRaw.replace('setError(saveErrorCopy(res.status))', "setError(data.error ?? 'x')")))
  const dateOk = (s: string) => {
    const c = stripComments(s)
    return /new Intl\.DateTimeFormat\('he-IL', \{ dateStyle: 'long', timeStyle: 'short' \}\)/.test(c) && /<DateTimeField\b/.test(c)
      && /data-datetime-display/.test(c) && /showPicker\(\)/.test(c)
      && !/<Input\b[^>]*type="datetime-local"/.test(c)
  }
  check('E4: the publish date is shown the Hebrew way (Intl he-IL), not as the browser\'s mm/dd/yyyy field', dateOk(formRaw))
  check('MUTATION CONTROL: the old native datetime-local Input fails E4', !dateOk(formRaw.replace(/<DateTimeField\b[^\n]*\/>/, '<Input id="d" type="datetime-local" value="" dir="ltr" />')))
  const authorOk = (form: string, page: string) => {
    const f = stripComments(form), pg = stripComments(page)
    return !/@[\w-]+\.[a-z]{2,}/i.test(f + pg) && /author: initial\?\.author \?\? defaultAuthor,/.test(f)
      && /\.from\('profiles'\)\.select\('full_name'\)\.eq\('id', user\.id\)/.test(pg) && /<ArticleForm defaultAuthor=\{defaultAuthor\} \/>/.test(pg)
      && !/createAdminClient/.test(pg)
  }
  check('E5: a new article\'s author is the admin\'s own profile name (own session), never a hard-coded email', authorOk(formRaw, newPageRaw))
  check('MUTATION CONTROL: the hard-coded email default fails E5', !authorOk(formRaw.replace('author: initial?.author ?? defaultAuthor,', "author: initial?.author ?? 'someone@example.com',"), newPageRaw))
  const noRail = (s: string) => {
    const c = stripComments(s)
    return !/border-s-\[?\d/.test(c) && /ICON_TONE\[copy\.tone\]/.test(c) && /bad: 'bg-bad-soft text-bad'/.test(c)
  }
  check('E6: the setup service cards carry their state on the icon and badge, with no start rail', noRail(setupRaw))
  check('MUTATION CONTROL: the curved rail back on the Serper card fails E6', !noRail(setupRaw.replace('<Card key={key} className="p-5 sm:p-6">', "<Card key={key} className={cn('p-5 sm:p-6', copy.tone !== 'ok' && 'border-s-[3px] border-s-bad')}>")))
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exitCode = 1
export {}
