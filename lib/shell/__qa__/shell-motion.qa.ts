/**
 * THE SHELL, THE EMPTY DASHBOARD AND MOTION (novice UX walk, items 9, 10, 13, 15):
 *
 *  A) a new project opens on ONE "Start here" card: its steps come from the real
 *     state (scan, connection, first article), one main button, and the empty
 *     widgets are left out instead of a dozen dashed cards;
 *  B) every dashboard screen names its browser tab ("מחקר ביטויים | Go Top"),
 *     by the sidebar's own labels and longest-match rule, in both languages;
 *  C) the head links each icon ONCE (the app/ file conventions), no hand-written
 *     <link rel="icon"> and no metadata `icons` on top of them;
 *  D) Search Console off on the server: the layout says so and no widget asks
 *     /api/gsc/status (it used to learn it from a 404 on every screen);
 *  E) motion: one helper (components/ui/motion.tsx); a KPI counts only once on
 *     screen; cards enter once, when first seen; long actions show progress and
 *     settle in our own words; all of it off with prefers-reduced-motion;
 *  F) the phone: one 56px bar (the menu button joins the top bar), a one-line
 *     trial strip, and a tour that opens the menu to point at sidebar entries
 *     instead of pointing at nothing.
 *
 * Source guards strip comments first. Every guard has a mutation control that
 * breaks the rule on purpose and shows the guard fails; the pure rules are also
 * run against a mutated copy of their module.
 *
 * Run: npx tsx lib/shell/__qa__/shell-motion.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { existsSync, readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { isStartMode, nextStartStep, sectionData, showWidget, startSteps, type StartInput } from '../../dashboard/start'
import { pageTitle, longestMatch, TITLE_BRAND } from '../page-title'
import { FULL_TOUR, SCREEN_TOURS } from '../../guide/tours'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'
import { revealDelay } from '../../../components/ui/motion'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const code = (rel: string) => strip(read(rel))

/** Loads a copy of a module with one edit, next to the original so its imports resolve. */
let mutants = 0
function mutant<T>(rel: string, from: string | RegExp, to: string): T {
  const src = read(rel)
  const edited = src.replace(from, to)
  if (edited === src) throw new Error(`mutation did not apply to ${rel}: ${String(from)}`)
  const file = join(ROOT, rel.replace(/\.ts$/, `.mut-${process.pid}-${++mutants}.ts`))
  writeFileSync(file, edited)
  try { return require(file) as T } finally { unlinkSync(file) }
}

type StartModule = typeof import('../../dashboard/start')

function main() {
  console.log('Shell, empty dashboard and motion QA\n')

  // ── A) Start here ──────────────────────────────────────────────────────────
  console.log('A) a new project opens on "Start here"')
  {
    const fresh: StartInput = { scan: 'open', tracked: 0, platform: false, articles: 0 }
    const keys = (i: StartInput, f = startSteps) => f(i).map((s) => `${s.key}:${s.state}`).join(' ')
    check('A1: a new project: scan, connect, first article, all open', keys(fresh) === 'scan:open connect:open article:open', keys(fresh))
    check('A2: each step follows what is stored', keys({ scan: 'done', tracked: 6, platform: true, articles: 0 }) === 'scan:done connect:done article:open'
      && keys({ ...fresh, scan: 'running' }) === 'scan:running connect:open article:open')
    check('A3: without the scan, the first step is choosing keywords', keys({ ...fresh, scan: 'off' }) === 'keywords:open connect:open article:open'
      && keys({ ...fresh, scan: 'off', tracked: 3 }) === 'keywords:done connect:open article:open')
    check('A4: without the content module there is nothing to connect or write: scan, then keywords', keys({ ...fresh, articles: null }) === 'scan:open keywords:open')
    check('A5: the one main button is the first open step (a running scan is not it)',
      nextStartStep(startSteps({ ...fresh, scan: 'running' }))?.key === 'connect' && nextStartStep(startSteps(fresh))?.key === 'scan')
    const mutA = mutant<StartModule>('lib/dashboard/start.ts', "input.articles > 0 ? 'done' : 'open'", "'open'")
    check('MUT: an article step that ignores the articles fails A2', keys({ scan: 'done', tracked: 6, platform: true, articles: 2 }, mutA.startSteps).endsWith('article:open'))

    const steps = startSteps(fresh)
    check('A6: start mode only while there is nothing to show', isStartMode({ checked: 0, articles: 0, steps })
      && !isStartMode({ checked: 4, articles: 0, steps }) && !isStartMode({ checked: 0, articles: 1, steps })
      && !isStartMode({ checked: 0, articles: 0, steps: steps.map((s) => ({ ...s, state: 'done' as const })) }))
    const mutB = mutant<StartModule>('lib/dashboard/start.ts', 'if (input.checked > 0 || (input.articles ?? 0) > 0) return false', 'if (false) return false')
    check('MUT: a start mode that ignores ranked keywords fails A6', mutB.isStartMode({ checked: 4, articles: 0, steps }))

    check('A7: a widget shows with data or a failed read, never empty and never as a skeleton that may vanish',
      showWidget('data') && showWidget('error') && !showWidget('empty') && !showWidget('loading'))
    check('A8: a section decides its widget', sectionData(null, () => true) === 'loading' && sectionData({ state: 'error' }, () => true) === 'error'
      && sectionData({ state: 'disabled' }, () => true) === 'empty' && sectionData({ state: 'ready', data: [] as number[] }, (d) => d.length > 0) === 'empty'
      && sectionData({ state: 'ready', data: [1] }, (d) => d.length > 0) === 'data')
    const mutC = mutant<StartModule>('lib/dashboard/start.ts', "return data === 'data' || data === 'error'", "return data !== 'loading'")
    check('MUT: showing empty widgets again fails A7', mutC.showWidget('empty'))

    const page = code('app/(dashboard)/dashboard/page.tsx')
    const wired = (src: string) => /startMode \? \(\s*<StartHere/.test(src)
      && /\{!startMode && <MappingBanner/.test(src)
      && /actions=\{startMode \? undefined : <Shortcuts/.test(src)
      && /\{show\.distribution && \(/.test(src) && /\{show\.ai && \(/.test(src) && /\{show\.competitors && \(/.test(src)
      && /<GscTopPages projectId=\{project\.id\} onlyWithData \/>/.test(src) && /<MonthlyReportTeaser [^>]*onlyWithData \/>/.test(src)
      && !/MappingPlaceholder/.test(src)
    check('A9: the dashboard renders "Start here" alone on a new project, and each widget only with data', wired(page))
    check('MUT: the dashed placeholders back fails A9', !wired(page.replace('{show.distribution && (', '{true && (')))
    check('MUT: the mapping banner beside "Start here" fails A9', !wired(page.replace('{!startMode && <MappingBanner', '{<MappingBanner')))

    const start = code('components/dashboard/StartHere.tsx')
    const oneMain = (src: string) => /primary=\{next\?\.key === step\.key\}/.test(src) && /linkButtonClass\(primary \? 'primary' : 'secondary'\)/.test(src)
      && /data-dashboard-widget="start"/.test(src) && /data-tour-variant="start"/.test(src)
    check('A10: "Start here" has one main button, on the next open step, and the tour can find it', oneMain(start))
    check('MUT: every step a primary button fails A10', !oneMain(start.replace("linkButtonClass(primary ? 'primary' : 'secondary')", "linkButtonClass('primary')")))
    for (const [lang, d] of [['he', dashboardHe], ['en', dashboardEn]] as const) {
      const s = d.dashboardStart
      const complete = !!s.title && (['scan', 'keywords', 'connect', 'article'] as const).every((k) => s.steps[k].title && s.steps[k].body && s.steps[k].cta && s.steps[k].doneLink)
      check(`A11 (${lang}): every step has a title, one line, an action and a done link; no em dash`, complete && !JSON.stringify(s).includes('—'))
    }
  }

  // ── B) tab titles ─────────────────────────────────────────────────────────
  console.log('\nB) every screen names its tab')
  {
    const routes = [
      { href: '/dashboard', label: 'לוח בקרה' }, { href: '/content', label: 'מאמרים' }, { href: '/content/strategy', label: 'אסטרטגיית תוכן' },
      { href: '/keywords', label: 'מילות מפתח' }, { href: '/keyword-research', label: 'מחקר ביטויים' },
    ]
    check('B1: the screen, then the brand', pageTitle('/dashboard', routes) === `לוח בקרה | ${TITLE_BRAND}`)
    check('B2: the longest match wins (/content/strategy is not "articles"; the editor is "articles")',
      pageTitle('/content/strategy', routes).startsWith('אסטרטגיית תוכן') && pageTitle('/content/articles/a1', routes).startsWith('מאמרים')
      && pageTitle('/keywords/x/history', routes).startsWith('מילות מפתח') && pageTitle('/keyword-research', routes).startsWith('מחקר ביטויים'))
    check('B3: an unknown path gets the brand alone, never another screen', pageTitle('/admin/unknown', routes) === TITLE_BRAND && longestMatch('/keywordsx', routes) === null)
    type TitleModule = typeof import('../page-title')
    const mut = mutant<TitleModule>('lib/shell/page-title.ts', 'r.href.length > best.href.length', 'r.href.length < best.href.length')
    check('MUT: a shortest-match rule fails B2', !mut.pageTitle('/content/strategy', routes).startsWith('אסטרטגיית תוכן'))

    const layout = code('app/(dashboard)/layout.tsx')
    const titled = (src: string) => /<DocumentTitle \/>/.test(src)
    const dt = code('components/layout/DocumentTitle.tsx')
    const keeps = (src: string) => /document\.title = title/.test(src) && /new MutationObserver\(apply\)/.test(src) && /observe\(document\.head/.test(src)
      && /navItemKeys, \.\.\.adminNavItems/.test(src) && /dict\.contentHub\.screens\[item\.screenKey\]/.test(src)
    check('B4: the dashboard layout names the tab from the sidebar labels, and keeps it while metadata streams in', titled(layout) && keeps(dt))
    check('MUT: a layout without it fails B4', !titled(layout.replace('<DocumentTitle />', '')))
    check('MUT: no observer (the site title comes back on a full load) fails B4', !keeps(dt.replace('new MutationObserver(apply)', 'null')))
  }

  // ── C) icons ──────────────────────────────────────────────────────────────
  console.log('\nC) each icon linked once')
  {
    const root = code('app/layout.tsx')
    const once = (src: string) => !/rel="(icon|apple-touch-icon|shortcut icon)"/.test(src) && !/\bicons:\s*\{/.test(src)
      && ['app/favicon.ico', 'app/icon.png', 'app/apple-icon.png'].every((f) => existsSync(join(ROOT, f)))
    check('C1: the icons come only from the app/ file conventions', once(root))
    check('MUT: a hand-written <link rel="icon"> fails C1', !once(root.replace('<meta name="theme-color"', '<link rel="icon" href="/favicon.ico?v=8" /><meta name="theme-color"')))
    check('MUT: metadata icons back fails C1', !once(root.replace('openGraph: {', "icons: { icon: '/favicon.ico' },\n    openGraph: {")))
  }

  // ── D) Search Console off: no request ─────────────────────────────────────
  console.log('\nD) Search Console switched off asks nothing')
  {
    const layout = code('app/(dashboard)/layout.tsx')
    const provided = (src: string) => /<GscFeatureProvider enabled=\{isGscReadOnlyEnabled\(\)\}>/.test(src)
    check('D1: the layout hands the SERVER flag to the client', provided(layout))
    check('MUT: the build-time public mirror instead fails D1', !provided(layout.replace('enabled={isGscReadOnlyEnabled()}', "enabled={process.env.NEXT_PUBLIC_GSC_READ_ONLY_ENABLED === 'true'}")))
    const data = code('components/gsc/gsc-data.ts')
    const skips = (src: string) => /const off = useGscEnabled\(\) === false/.test(src)
      && /useGscResponse\(projectId && !off \? gscStatusUrl\(projectId\) : null\)/.test(src) && /if \(off\) return \{ state: 'disabled' \}/.test(src)
    check('D2: with it off, the status hook sends no request and shows nothing', skips(data))
    check('MUT: a hook that still asks fails D2', !skips(data.replace('projectId && !off ? gscStatusUrl(projectId) : null', 'projectId ? gscStatusUrl(projectId) : null')))
    // Outside a provider nothing changes: the route's own 404 still hides the widgets.
    const { useGscEnabled, GscFeatureProvider } = require(join(ROOT, 'components/gsc/GscFeature.tsx'))
    const Probe = () => createElement('i', null, String(useGscEnabled()))
    const outside = renderToStaticMarkup(createElement(Probe))
    const off = renderToStaticMarkup(createElement(GscFeatureProvider, { enabled: false }, createElement(Probe)))
    check('D3: unknown outside the dashboard, false inside it when the server says off', outside === '<i>null</i>' && off === '<i>false</i>', `${outside} ${off}`)
  }

  // ── E) motion ─────────────────────────────────────────────────────────────
  console.log('\nE) motion: one helper, on screen only, reduced motion respected')
  {
    const CountUp = require(join(ROOT, 'components/ui/CountUp.tsx')).default
    const html = renderToStaticMarkup(createElement(CountUp, { value: 57 }, '57'))
    const waits = (h: string) => /data-count="wait"/.test(h) && /<span class="count-up-value">57<\/span>/.test(h)
    check('E1: a KPI waits (paused at 0) until it is seen, with the real value in the DOM', waits(html), html)
    const countSrc = code('components/ui/CountUp.tsx')
    const observed = (src: string) => /useInView<HTMLSpanElement>/.test(src) && /data-count=\{seen \? 'run' : 'wait'\}/.test(src)
    check('E2: it starts when the shared useInView says it is on screen', observed(countSrc))
    check('MUT: a count-up that starts on render fails E2', !observed(countSrc.replace("data-count={seen ? 'run' : 'wait'}", "data-count=\"run\"")))

    const css = read('app/globals.css').replace(/\/\*[\s\S]*?\*\//g, '')
    const blocks = [...css.matchAll(/@media \(prefers-reduced-motion: no-preference\) \{([\s\S]*?)\n\}/g)].map((m) => m[1]).join('\n')
    const outside = css.replace(/@media \(prefers-reduced-motion: no-preference\) \{[\s\S]*?\n\}/g, '')
    const gated = (inside: string, out: string) =>
      /\.count-up\[data-count='wait'\] > \.count-up-value,\s*\.count-up\[data-count='wait'\]::after \{ animation-play-state: paused; \}/.test(inside)
      && /\.reveal\[data-reveal='wait'\] \{ opacity: 0; \}/.test(inside)
      && /\.reveal\[data-reveal='in'\] \{ animation: reveal-in 280ms var\(--ease-snappy\) var\(--reveal-delay, 0ms\) backwards; \}/.test(inside)
      && /\.progress-sweep \{ animation: progress-sweep 1\.4s/.test(inside)
      && !/data-reveal='wait'\][^{]*\{[^}]*opacity: 0/.test(out) && !/animation:\s*(reveal-in|progress-sweep)/.test(out)
    check('E3: the wait, the entrance (280ms, once) and the progress bar exist only with no-preference', gated(blocks, outside))
    check('MUT: hiding waiting cards for everyone (reduced motion too) fails E3', !gated(blocks, `${outside}\n.reveal[data-reveal='wait'] { opacity: 0; }`))
    check('E4: the stagger is 40ms and stops growing after five', revealDelay(0) === 0 && revealDelay(2) === 80 && revealDelay(40) === 200)

    const motion = code('components/ui/motion.tsx')
    const safe = (src: string) => /typeof IntersectionObserver === 'undefined'\) \{[^}]*setTimeout\(\(\) => setSeen\(true\)/.test(src) && /io\.disconnect\(\)/.test(src)
    check('E5: without IntersectionObserver everything counts as seen (nothing can stay hidden); it observes once', safe(motion))
    check('MUT: no fallback fails E5', !safe(motion.replace('setTimeout(() => setSeen(true), 0)', 'setTimeout(() => undefined, 0)')))

    const page = code('app/(dashboard)/dashboard/page.tsx')
    const reveals = (page.match(/<Reveal index=\{\d\}/g) ?? []).length
    check('E6: the dashboard cards enter through the shared <Reveal>', reveals >= 10 && /from '@\/components\/ui\/motion'/.test(page), String(reveals))

    const toast = code('components/ui/Toast.tsx')
    const tracks = (src: string) => /const id = show\('progress', copy\.pending\)/.test(src) && /settle\(id, 'success', copy\.done\)/.test(src)
      && /settle\(id, 'error', copy\.failed\)/.test(src) && /aria-live="polite"/.test(src) && !/(green|red|slate|blue)-\d/.test(src)
    check('E7: a long action shows progress at once, then settles in our words, on design tokens', tracks(toast))
    check('MUT: a failure that shows the error text fails E7', !tracks(toast.replace("settle(id, 'error', copy.failed)", "settle(id, 'error', String(e))")))
    const reports = code('app/(dashboard)/reports/page.tsx')
    const pdf = (src: string) => /toasts\.track\(dict\.longActions\.reportPdf,/.test(src) && !/alert\(t\.downloadError\)/.test(src)
    check('E8: the PDF report shows progress and its outcome (no alert box)', pdf(reports))
    check('MUT: the old alert back fails E8', !pdf(reports.replace('toasts.track(dict.longActions.reportPdf,', 'alert(t.downloadError); (')))
    const monthly = code('components/reports/monthly/MonthlyReports.tsx')
    check('E9: making a monthly report shows progress and its outcome', /toasts\.track\(t\.generateToast,/.test(monthly))
  }

  // ── F) the phone ──────────────────────────────────────────────────────────
  console.log('\nF) the phone: one bar, and a tour that never points at nothing')
  {
    const sidebar = code('components/layout/Sidebar.tsx')
    const oneBar = (src: string) => /<aside className="sticky top-0 z-40 h-0 w-full [^"]*md:relative md:h-auto/.test(src)
      && /<span className="hidden md:contents"><Brand/.test(src) && /className="absolute start-0 top-0 flex h-14/.test(src)
    const layout = code('app/(dashboard)/layout.tsx')
    const room = (src: string) => /sticky top-0 z-30 flex h-14 [^"]*pe-4 ps-16 [^"]*md:px-8/.test(src)
    check('F1: on a phone the menu button sits in the 56px top bar; no navy brand bar above it', oneBar(sidebar) && room(layout))
    check('MUT: the 64px brand row back on phones fails F1', !oneBar(sidebar.replace('<span className="hidden md:contents"><Brand', '<span><Brand')))
    check('MUT: a top bar without room for the button fails F1', !room(layout.replace('pe-4 ps-16', 'px-4')))
    const trial = code('components/layout/TrialBar.tsx')
    const oneLine = (src: string) => /min-h-10 w-full max-w-\[1280px\] items-center justify-between/.test(src) && !/flex-wrap/.test(src)
    check('F2: the trial strip stays one line on a phone', oneLine(trial))
    check('MUT: a wrapping strip fails F2', !oneLine(trial.replace('min-h-10 w-full', 'min-h-10 flex-wrap w-full')))

    const navSteps = FULL_TOUR.filter((s) => s.target.startsWith('aside a['))
    check('F3: every sidebar step of the tour is marked as a sidebar entry', navSteps.length === 5 && navSteps.every((s) => s.navEntry === true))
    const runner = code('components/onboarding/DashboardOnboardingTour.tsx')
    const opens = (src: string) => /if \(!found\.el && found\.exists && current\.navEntry && navIsDrawer\(\)\)/.test(src)
      && /requestNavDrawer\(true, \{ restoreFocus: false \}\)/.test(src) && /if \(!current\.navEntry\) closeDrawer\(\)/.test(src)
      && /useEffect\(\(\) => closeDrawer, \[closeDrawer\]\)/.test(src)
    check('F4: on a phone the tour opens the menu for a sidebar step and closes it after', opens(runner))
    check('MUT: a tour that never opens the menu fails F4', !opens(runner.replace('requestNavDrawer(true, { restoreFocus: false })', 'void 0')))
    const never = (src: string) => !/'none'/.test(src) && /if \(found\.el\) \{/.test(src)
    check('F5: a step is shown only on an element that can be seen, else skipped', never(runner))
    check('MUT: the old bubble-without-target fallback fails F5', !never(runner.replace('if (found.el) {', "if (found.el || found.exists) { const t = found.el ?? 'none';")))
    const listens = (src: string) => /window\.addEventListener\(NAV_DRAWER_EVENT, onRequest\)/.test(src) && /if \(!tourDrivenRef\.current\) menuButtonRef\.current\?\.focus\(\)/.test(src)
    check('F6: the drawer answers the tour, and keeps focus in the tour when the tour drives it', listens(sidebar))
    check('MUT: a drawer deaf to the tour fails F6', !listens(sidebar.replace('window.addEventListener(NAV_DRAWER_EVENT, onRequest)', '')))
    const first = SCREEN_TOURS.dashboard.steps[0]
    check('F7: the dashboard tour finds "Start here" where the opening card would be, with its own text',
      /data-dashboard-widget="start"/.test(first.target) && first.variants?.start === 'start' && !!dashboardHe.guide.steps.start.title && !!dashboardEn.guide.steps.start.title)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
