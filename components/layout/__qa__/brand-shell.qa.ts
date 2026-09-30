/**
 * The shell after the UX review (part A, decisions 1–5, and P1-7/11/13/15/20, P2-7):
 *   A) the Go Top mark is inline SVG in the brand blue, and the favicon/app icons
 *      are that same drawing on the navy (rendered from one geometry);
 *   B) the Scans tab is gone: /scans and /scans/<id> redirect on the server to the
 *      check history in Keywords (?history=1), which Keywords and Reports mount;
 *   C) the scan details page: one notice, "checked on", an engine chip, and no
 *      provider error text;
 *   D) the phone menu is a modal drawer from the logical start: scrim, focus trap,
 *      Escape, group titles, and WhatsApp support inside it as on the rail;
 *   E) the theme is a two-option segmented control; a skip link leads the page;
 *   F) loading is a skeleton, not a sentence; KPIs count up (CSS only); old
 *      titles use the shared page header.
 * Source guards strip comments first. Every check has a mutation control.
 *
 * Run: npx tsx components/layout/__qa__/brand-shell.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { execFileSync } from 'child_process'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import sharp from 'sharp'
import { scanHistoryHref } from '../../../lib/scans/history-href'
import { getDashboardDictionary } from '../../../lib/i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const code = (rel: string) => strip(read(rel))

async function main() {
  console.log('Brand and shell QA\n')
  const sidebar = code('components/layout/Sidebar.tsx')

  // ── A) the mark ─────────────────────────────────────────────────────────────
  console.log('A) the Go Top mark and the app icon')
  {
    const inlineMark = (src: string) =>
      /import GoTopMark from '@\/components\/brand\/GoTopMark'/.test(src)
      && /<GoTopMark size=\{28\}/.test(src)
      && !/next\/image|\.png['"]/.test(src)
    check('A1: the rail shows the inline SVG mark at 28px, no raster logo', inlineMark(sidebar))
    check('MUT: the old 500px PNG back in the rail fails A1',
      !inlineMark(sidebar.replace('<GoTopMark size={28}', '<Image src="/gotop-dark-transparent.png" width={500} />')))

    const GoTopMark = require(join(ROOT, 'components/brand/GoTopMark.tsx')).default
    const svg = renderToStaticMarkup(createElement(GoTopMark, { size: 28, label: 'Go Top' }))
    const isMark = (html: string) => /^<svg[^>]*viewBox="0 0 100 100"[^>]*width="28"[^>]*height="28"/.test(html)
      && /role="img"/.test(html) && /aria-label="Go Top"/.test(html) && /class="fill-brand"/.test(html)
      && (html.match(/<rect /g) ?? []).length >= 10 && /<path d="M0 0H36V24H24V36H0Z"/.test(html)
    check('A2: the mark renders as a 28px SVG in the brand fill, with its name', isMark(svg), svg.slice(0, 160))
    check('MUT: a mark without its accessible name fails A2', !isMark(svg.replace(' aria-label="Go Top"', '')))

    // 15px is the `lead` step of the type scale (globals.css), not a bracketed size.
    const wordmark = (src: string) => /"text-lead font-semibold[^"]*">Go Top</.test(src) && /text-overline font-medium text-rail-tagline">SEO</.test(src)
      && /--text-lead: 0\.9375rem;/.test(read('app/globals.css'))
    check('A3: the wordmark (w9, "Go Top SEO"): "Go Top" 15px/600 (text-lead), "SEO" 11px in the tagline blue', wordmark(sidebar))
    check('MUT: a wordmark in the muted grey fails A3', !wordmark(sidebar.replace('text-rail-tagline">SEO', 'text-rail-muted">SEO')))
    check('MUT: the bracketed 15px back fails A3', !wordmark(sidebar.replace('"text-lead font-semibold', '"text-[0.9375rem] font-semibold')))

    // The icon files are the same drawing: blue mark, navy ground, rounded corners.
    const probe = async (png: Buffer) => {
      const { data, info } = await sharp(png).ensureAlpha().raw().toBuffer({ resolveWithObject: true })
      const px = (x: number, y: number) => { const i = (y * info.width + x) * 4; return [data[i], data[i + 1], data[i + 2], data[i + 3]] }
      const near = (p: number[], hex: string, tol = 24) => [1, 3, 5].every((o, k) => Math.abs(p[k] - parseInt(hex.slice(o, o + 2), 16)) <= tol) && p[3] > 200
      return info.width === 192 && near(px(96, 75), '#0086F5') && near(px(96, 180), '#0A1B3D') && px(1, 1)[3] < 40
    }
    const icon = readFileSync(join(ROOT, 'public/favicon-192.png'))
    check('A4: the app icon is the blue mark on the navy, with rounded corners', await probe(icon))
    const oldStyle = await sharp({ create: { width: 192, height: 192, channels: 4, background: { r: 0, g: 134, b: 245, alpha: 0 } } })
      .composite([{ input: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192"><rect x="60" y="40" width="72" height="72" fill="#0086F5"/></svg>') }])
      .png().toBuffer()
    check('MUT: the old blue-on-transparent favicon fails A4', !(await probe(oldStyle)))
    let fresh = true
    try { execFileSync('npx', ['tsx', 'scripts/brand/icons.ts', '--check'], { cwd: ROOT, stdio: 'pipe' }) } catch { fresh = false }
    check('A5: every icon file is a fresh render of the mark geometry (scripts/brand/icons.ts --check)', fresh)
  }

  // ── B) no Scans tab; the history lives in Keywords and Reports ─────────────
  console.log('\nB) the Scans tab folded into Keywords and Reports')
  {
    const UUID = '0b8c2a7e-1f11-4c2d-9a3b-5d6e7f809a1b'
    const cases: [unknown, string][] = [
      [undefined, '/keywords?history=1'],
      [UUID, `/keywords?history=1&projectId=${UUID}`],
      [[UUID, 'x'], `/keywords?history=1&projectId=${UUID}`],
      ['https://evil.example/x', '/keywords?history=1'],
      ['//evil.example', '/keywords?history=1'],
      ['abc&next=https://evil.example', '/keywords?history=1'],
    ]
    const bad = cases.filter(([input, want]) => scanHistoryHref(input as never) !== want)
    check('B1: /scans leads to Keywords with the history open, keeping only a plain project id',
      bad.length === 0, bad.map(([i]) => `${String(i)} → ${scanHistoryHref(i as never)}`).join(', '))
    const loose = (id?: string) => `/keywords?history=1${id ? `&projectId=${id}` : ''}`
    check('MUT: a helper that passes the id through unchecked fails B1',
      cases.some(([input, want]) => loose(input as string | undefined) !== want))

    const serverRedirect = (src: string) => !/^'use client'/.test(src.trim()) && /redirect\(scanHistoryHref\(projectId\)\)/.test(src)
    const list = code('app/(dashboard)/scans/page.tsx')
    const one = code('app/(dashboard)/scans/[id]/page.tsx')
    check('B2: /scans and /scans/<id> redirect on the server', serverRedirect(list) && serverRedirect(one))
    check('MUT: a client page that still renders the list fails B2', !serverRedirect(`'use client'\n${list}`))
    check('B3: a run\'s details page stays reachable', existsSync(join(ROOT, 'app/(dashboard)/scans/[id]/details/page.tsx')))

    const keywords = code('app/(dashboard)/keywords/page.tsx')
    const mounted = (src: string) => /useSearchParams\(\)\.get\('history'\) === '1'/.test(src)
      && /<ScanHistory[\s\S]*?defaultOpen=\{historyOpen\}/.test(src)
      && /historyOpen \? \(\s*<>\s*\{history\}\s*<ProjectKeywordsPanel/.test(src)
    check('B4: Keywords mounts the check history, open and first on ?history=1', mounted(keywords))
    check('MUT: a Keywords page that ignores ?history=1 fails B4', !mounted(keywords.replace('defaultOpen={historyOpen}', 'defaultOpen={false}')))
    const reports = code('app/(dashboard)/reports/page.tsx')
    check('B5: Reports mounts the check history too (closed until asked for)',
      /<ScanHistory key=\{activeProjectId \?\? 'none'\} projectId=\{activeProjectId\}/.test(reports) && !/<ScanHistory[^>]*defaultOpen/.test(reports))

    // Nothing links to the old list any more (the details page is fine).
    const linkers = ['components/keywords/TrackingTargetsTable.tsx', 'components/scans/ScanHistory.tsx', 'app/(dashboard)/scans/[id]/details/page.tsx', 'components/layout/Sidebar.tsx']
    const listLinks = (srcs: string[]) => srcs.filter((s) => /['"`]\/scans(?:\?|['"`])/.test(s)).length
    check('B6: no link points at the old /scans list', listLinks(linkers.map(code)) === 0)
    check('MUT: a link to /scans fails B6', listLinks([...linkers.map(code), "<Link href='/scans'>"]) > 0)

    const history = code('components/scans/ScanHistory.tsx')
    const perKeyword = (src: string) => /\/keywords\/\$\{encodeURIComponent\(row\.tracking_target_id\)\}\/history/.test(src) && /<EngineChip engine=\{row\.engine_type\}/.test(src)
    check('B7: a run lists its keywords, each with its engine and a link to its own history', perKeyword(history))
    check('MUT: a run without the per-keyword history link fails B7', !perKeyword(history.replace('/history`}', '`}')))
  }

  // ── C) the scan details page (P1-7) ─────────────────────────────────────────
  console.log('\nC) scan details')
  {
    const details = code('app/(dashboard)/scans/[id]/details/page.tsx')
    const notice = (src: string) => (src.match(/\{t\.noAuditData\}/g) ?? []).length === 1
      && src.indexOf('data-audit-notice') > 0 && src.indexOf('data-audit-notice') < src.indexOf('results.map(')
    check('C1: the "no breakdown" notice is shown once, above the results', notice(details))
    check('MUT: a notice repeated in every result fails C1', !notice(details.replace('{hasAudit && (', '{!hasAudit && <p>{t.noAuditData}</p>}\n{hasAudit && (')))
    const readable = (src: string) => /t\.checkedAt\(formatDateTime\(result\.checked_at\)\)/.test(src) && !/t\.timestamp/.test(src)
      && /<EngineChip engine=\{result\.engine_type\}/.test(src)
    check('C2: each result says "checked on" and which engine, in words', readable(details))
    check('MUT: the old "Timestamp:" fails C2', !readable(details.replace('t.checkedAt(formatDateTime(result.checked_at))', 't.timestamp')))
    const noProviderText = (src: string) => !/\{result\.error_message\}/.test(src) && /\{t\.checkFailed\}/.test(src)
    check('C3: a failed check is explained in our words, never the provider\'s', noProviderText(details))
    check('MUT: printing error_message fails C3', !noProviderText(details.replace('{t.checkFailed}', '{result.error_message}')))
    const tokens = (src: string) => !/\b(?:text|bg|border)-(?:slate|blue|red|amber|green)-\d/.test(src)
    check('C4: the page uses the design tokens, no raw slate/blue/red/amber/green', tokens(details))
    check('MUT: a raw slate colour fails C4', !tokens(`${details} className="text-slate-500"`))
    for (const loc of ['he', 'en'] as const) {
      const d = getDashboardDictionary(loc).scans.details as Record<string, unknown>
      check(`(${loc}) the details dictionary has no "Timestamp"`, !('timestamp' in d) && typeof d.checkedAt === 'function')
    }
  }

  // ── D) the phone drawer (P1-13) ─────────────────────────────────────────────
  console.log('\nD) the phone menu')
  {
    const drawer = (src: string): string[] => {
      const out: string[] = []
      if (!/role="dialog"\s+aria-modal="true"/.test(src)) out.push('modal dialog')
      if (!/data-drawer-scrim=""[^>]*onClick=\{\(\) => setMenuOpenAt\(null\)\}[^>]*className="scrim-in absolute inset-0 bg-scrim"/.test(src)) out.push('scrim')
      if (!/if \(e\.key === 'Escape'\)[\s\S]{0,80}setMenuOpenAt\(null\)/.test(src)) out.push('escape')
      if (!/e\.key !== 'Tab'[\s\S]{0,400}last\.focus\(\)[\s\S]{0,120}first\.focus\(\)/.test(src)) out.push('focus trap')
      if (!/menuButtonRef\.current\?\.focus\(\)/.test(src)) out.push('focus return')
      if (!/className="drawer-start absolute inset-y-0 start-0 flex w-\[85vw\]/.test(src)) out.push('85vw from the start')
      if ((src.match(/<RailFoot\b/g) ?? []).length < 2) out.push('support+prefs in both')
      if (!/function RailFoot[\s\S]*?href=\{WHATSAPP_SUPPORT\}[\s\S]*?<WhatsAppGlyph/.test(src)) out.push('whatsapp')
      if (!/function NavGroups[\s\S]*?text-rail-section[\s\S]*?\{dict\.sidebar\[group\.key\]\}/.test(src)) out.push('group titles')
      return out
    }
    check('D1: a modal drawer from the start, 85vw, scrim, Escape, focus trap and return, titles, WhatsApp', drawer(sidebar).length === 0, drawer(sidebar).join(', '))
    check('MUT: a drawer that ignores Escape fails D1', drawer(sidebar.replace("if (e.key === 'Escape')", "if (e.key === 'Esc')")).length > 0)
    check('MUT: a drawer without WhatsApp support fails D1', drawer(sidebar.replace(/<WhatsAppGlyph[^/]*\/>/, '')).length > 0)
    const css = read('app/globals.css')
    check('D2: the scrim is the navy at 50%', /--color-scrim: rgba\(10, 27, 61, 0\.5\);/.test(css))
  }

  // ── E) theme control and skip link ──────────────────────────────────────────
  console.log('\nE) theme control and skip link')
  {
    const theme = code('components/ThemeToggle.tsx')
    const segmented = (src: string) => /role="group" aria-label=\{dict\.sidebar\.themeLabel\}/.test(src)
      && (src.match(/aria-pressed=\{current === '(light|dark)'\}/g) ?? []).length === 2
      && /<Sun\b/.test(src) && /<Moon\b/.test(src) && !/isLight \? dict\.common\.lightMode : dict\.common\.darkMode/.test(src)
    check('E1: the theme is two pressed/unpressed options (sun, moon), not a switch named for its state', segmented(theme))
    check('MUT: the old single switch fails E1', !segmented(theme.replace(/aria-pressed=\{current === 'dark'\}/, '')))

    const layout = code('app/(dashboard)/layout.tsx')
    const skip = (src: string) => src.indexOf('<SkipLink />') > 0 && src.indexOf('<SkipLink />') < src.indexOf('<Sidebar')
      && /id=\{MAIN_CONTENT_ID\} tabIndex=\{-1\}/.test(src)
    check('E2: the skip link comes before the sidebar and lands on the content', skip(layout))
    check('MUT: a skip link after the sidebar fails E2', !skip(layout.replace('<SkipLink />', '').replace('</main>', '<SkipLink /></main>')))
    const skipSrc = code('components/layout/SkipLink.tsx')
    check('E3: it is hidden until focused, and says "דלגו לתוכן"',
      /className="sr-only focus:not-sr-only/.test(skipSrc) && getDashboardDictionary('he').sidebar.skipToContent === 'דלגו לתוכן')
  }

  // ── F) loading, count-up, page headers ──────────────────────────────────────
  console.log('\nF) loading skeletons, count-up and page headers')
  {
    const gate = code('components/layout/WorkspaceGate.tsx')
    const skeletonGate = (src: string) => /return <ScreenSkeleton label=\{t\.loadingProject\} \/>/.test(src) && !/>\{t\.loadingProject\}<\/p>/.test(src)
    check('F1: a per-project tab loads as a skeleton, not "loading the project…"', skeletonGate(gate))
    check('MUT: the old sentence card fails F1', !skeletonGate(gate.replace('return <ScreenSkeleton label={t.loadingProject} />', 'return <Card><p>{t.loadingProject}</p></Card>')))
    const projects = code('app/(dashboard)/projects/page.tsx')
    check('F2: the project list loads as a table skeleton', /<TableSkeleton label=\{dict\.common\.loading\}/.test(projects) && !/animate-spin/.test(projects))

    const CountUp = require(join(ROOT, 'components/ui/CountUp.tsx')).default
    const counted = renderToStaticMarkup(createElement(CountUp, { value: 57 }, '57'))
    const plain = renderToStaticMarkup(createElement(CountUp, { value: 1240 }, '1,240'))
    const counts = (html: string) => /class="count-up"/.test(html) && /--count-to:57/.test(html) && /<span class="count-up-value">57<\/span>/.test(html)
    check('F3: a KPI counts up, with its real value in the DOM the whole time', counts(counted), counted)
    check('F4: a figure the counter cannot draw (1,240) renders as it is', plain === '1,240', plain)
    check('MUT: a count-up that drops the real value fails F3', !counts(counted.replace('<span class="count-up-value">57</span>', '')))
    const users = ['components/dashboard/HeroCard.tsx', 'components/dashboard/AiVisibilityBrief.tsx']
    const countsUp = (src: string) => /<CountUp value=/.test(src)
    check('F5: the dashboard hero and the AI brief count up', users.every((f) => countsUp(code(f))))
    check('MUT: a hero without CountUp fails F5', !countsUp(code(users[0]).replace(/<CountUp value=/g, '<span data-v=')))

    const titled = (src: string) => /<Header title=\{t\.title\}/.test(src) && !/text-3xl/.test(src)
    const billing = code('app/(dashboard)/billing/BillingView.tsx')
    check('F6: the billing screens use the shared page header (P2-7)', titled(billing) && titled(code('app/(dashboard)/billing/AdminBillingView.tsx')))
    check('MUT: the old text-3xl title fails F6', !titled(billing.replace('<Header title={t.title}', '<h1 className="text-3xl font-bold">{t.title}</h1><X title={t.title}')))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
