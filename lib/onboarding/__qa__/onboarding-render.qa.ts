/**
 * The onboarding screens on their first paint, in Hebrew and in English.
 *
 * renderToStaticMarkup runs the real provider, dictionaries and components and
 * no effects: what the merchant sees before hydration, and after a refresh.
 * Only Next's router hooks and, for the page, its server loader are
 * substituted.
 *
 *   - the progress: the step working now, large, with what it is doing; the
 *     four steps marked as the server reports them; the one promise of time
 *     and no countdown; a claimed run's own lines; a stalled run says so, with
 *     the dashboard as the way on; nothing on the screen runs on a clock;
 *   - the summary: the plan's ten blocks in its order; five keywords checked;
 *     "Edit" on blocks 3-5 only, into their settings sections; a password-
 *     locked store is "not checked", never failing and never 0/4; a pending
 *     check is pending; "Start" is behind us once stage B began; evidence only
 *     in its own language; the first-article button only with the content
 *     module, and never an article nobody asked for;
 *   - the research screen: no run, a stopped run with its one way on, a
 *     refusal handed over in the address, progress, summary and started, for
 *     runs begun by create, claim and a Shopify install; the page itself for
 *     an outage and for "not found";
 *   - the new-project screen: one left-to-right field, the four steps, the
 *     free check's site filled in.
 *
 * Run: npx tsx lib/onboarding/__qa__/onboarding-render.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */
import { readFileSync } from 'fs'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { DashboardLanguageProvider } from '@/lib/i18n/dashboard/useDashboardLanguage'
import type { Locale } from '@/lib/i18n/locales'
import { makeChecker, NOW } from '@/lib/seed-scan/__qa__/_fixtures'
import type { SeedRunView } from '@/lib/seed-scan/types'
import { SurfaceUnavailableError, type SummarySurface } from '../surfaces'
import { BUSINESS, fullSummary, lockedSummary, runView } from './_fixtures'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
const HEBREW = /[֐-׿]/
const PROJECT = '6f1c2d3e-4b5a-4c6d-8e7f-9a0b1c2d3e4f'
const DOMAIN = 'plumber-tlv.co.il'
const LOCALES = ['he', 'en'] as const
const dict = (locale: Locale) => getDashboardDictionary(locale).seedOnboarding

// ── The substitutions: Next's router hooks, and the summary page's server loader ──
let search = new URLSearchParams()
let loadSurface: (id: string) => Promise<SummarySurface | null> = async () => null
const NOT_FOUND = new Error('notFound() was called')
const Mod: any = require('module')
const origLoad = Mod._load
Mod._load = function (request: string, parent: any, isMain: boolean) {
  if (request === '@/lib/onboarding/server') {
    return { loadSummarySurface: (id: string) => loadSurface(id), loadNewProjectSurface: async () => ({ kind: 'legacy' }) }
  }
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => `/projects/${PROJECT}/summary`
      : k === 'useSearchParams' ? () => search
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : k === 'notFound' ? () => { throw NOT_FOUND }
      : (t as any)[k]),
  })
}
const load = (rel: string) => require(join(ROOT, rel)).default

// ── Reading the markup ──
function paint(locale: Locale, node: unknown): string {
  return renderToStaticMarkup(createElement(DashboardLanguageProvider as never, { initialLocale: locale, children: node } as never) as never)
}
const render = (locale: Locale, type: unknown, props: Record<string, unknown>) => paint(locale, createElement(type as never, props as never))
/** Without the direction isolates, which the markup keeps around a site or a name. */
const plain = (s: string) => s.replace(/[⁨⁩]/g, '')
function textOf(html: string): string {
  return plain(
    html
      .replace(/<[^>]+>/g, ' ')
      .replace(/&#x27;/g, "'")
      .replace(/&quot;/g, '"')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>')
      .replace(/&amp;/g, '&')
      .replace(/\s+/g, ' '),
  )
}
const has = (html: string, text: string) => textOf(html).includes(plain(text).replace(/\s+/g, ' '))
const count = (html: string, re: RegExp) => (html.match(re) ?? []).length
const screenOf = (html: string) => /data-seed-screen="([a-z]+)"/.exec(html)?.[1] ?? null
const blocks = (html: string) => [...html.matchAll(/data-summary-block="([a-z]+)"/g)].map((m) => m[1])
/** One summary block's markup: from its marker to the next block's. */
function block(html: string, id: string): string {
  const start = html.indexOf(`data-summary-block="${id}"`)
  if (start < 0) return ''
  const next = html.indexOf('data-summary-block="', start + 1)
  return html.slice(start, next < 0 ? html.length : next)
}
function tile(html: string, id: string): { state: string; markup: string } {
  const m = new RegExp(`data-tile="${id}" data-tile-state="([a-zA-Z]+)"[^>]*>([\\s\\S]*?)</div>`).exec(html)
  return { state: m?.[1] ?? '', markup: m?.[2] ?? '' }
}
function stepRows(html: string): { current: boolean; text: string }[] {
  const ol = /<ol[^>]*>([\s\S]*?)<\/ol>/.exec(html)?.[1] ?? ''
  return [...ol.matchAll(/<li([^>]*)>([\s\S]*?)<\/li>/g)].map((m) => ({ current: /aria-current="step"/.test(m[1]), text: textOf(m[2]) }))
}
const checkboxes = (html: string) => [...html.matchAll(/<input[^>]*type="checkbox"[^>]*>/g)].map((m) => m[0])
/** The markup without the elements that carry the snapshot's own language (text-only leaves). */
const withoutLang = (html: string, lang: string) => html.replace(new RegExp(`<(span|p|li)\\b[^>]*\\blang="${lang}"[^>]*>[^<]*</\\1>`, 'g'), '')

function progressRun(steps: Record<'a1' | 'a2' | 'a3' | 'a4', 'pending' | 'running' | 'done' | 'skipped' | 'failed'>, over: Partial<SeedRunView> = {}): SeedRunView {
  return runView({ status: 'running', finishedAt: null, summary: null, ...over }, steps)
}

async function main() {
  const SeedProgress = load('components/onboarding/SeedProgress.tsx')
  const ResearchSummary = load('components/onboarding/ResearchSummary.tsx')
  const SeedRunScreen = load('components/onboarding/SeedRunScreen.tsx')
  const NewProjectFlow = load('components/onboarding/NewProjectFlow.tsx')

  console.log('\n1) The progress')
  const working = progressRun({ a1: 'done', a2: 'running', a3: 'pending', a4: 'pending' })
  for (const locale of LOCALES) {
    const t = dict(locale).progress
    const html = render(locale, SeedProgress, { run: working, domain: DOMAIN, projectId: PROJECT, reconnecting: false })
    check(`${locale}: the step working now is the large one: its place, its title`,
      has(html, t.stepOf(2, 4)) && /<h2[^>]*>([^<]*)<\/h2>/.exec(html)?.[1] === t.steps.a2.title)
    check(`${locale}: …and what it is doing now, in the merchant's words`, has(html, t.nowLabel) && t.steps.a2.lines.every((line) => has(html, line)))
    const rows = stepRows(html)
    check(`${locale}: the four steps, each as the server reports it: done, now, next, next`,
      rows.length === 4
      && rows.every((r, i) => r.text.includes(t.steps[(['a1', 'a2', 'a3', 'a4'] as const)[i]].title))
      && rows[0].text.includes(t.state.done) && rows[1].text.includes(t.state.running)
      && rows[2].text.includes(t.state.pending) && rows[3].text.includes(t.state.pending)
      && rows.map((r) => r.current).join() === 'false,true,false,false', JSON.stringify(rows))
    check(`${locale}: the one promise of time, "${t.promise}", and no countdown`,
      has(html, t.promise) && !/שניות|שנייה|seconds?\b|\d+\s*s\b/i.test(textOf(html)))
    check(`${locale}: the site's address sits isolated inside the title`, html.includes(`⁨${DOMAIN}⁩`) && has(html, t.title(DOMAIN)))
    check(`${locale}: the bar says one of four steps finished, and a screen reader hears where it is`,
      /aria-valuenow="1"/.test(html) && /aria-valuemax="4"/.test(html) && html.includes(`aria-valuetext="${t.stepOf(2, 4)}"`) && /width:25%/.test(html))
    check(`${locale}: the bar's colour runs from where reading starts`,
      html.includes(locale === 'he' ? 'bg-gradient-to-l' : 'bg-gradient-to-r') && !html.includes(locale === 'he' ? 'bg-gradient-to-r' : 'bg-gradient-to-l'))
    check(`${locale}: the pulsing stops for a merchant who asked for less motion`,
      count(html, /animate-ping/g) === 2 && count(html, /animate-ping[^"]*motion-reduce:animate-none/g) === 2)
    check(`${locale}: small letter-spaced capitals in English only (Hebrew letters are never spaced apart)`,
      locale === 'he' ? !html.includes('tracking-[0.14em]') : count(html, /uppercase tracking-\[0\.14em\]/g) >= 3)
    if (locale === 'en') check('en: no Hebrew anywhere on the English progress', !HEBREW.test(html))
  }
  {
    const t = dict('he').progress
    const failedStep = render('he', SeedProgress, { run: progressRun({ a1: 'done', a2: 'done', a3: 'failed', a4: 'running' }), domain: DOMAIN, projectId: PROJECT, reconnecting: false })
    const rows = stepRows(failedStep)
    check('a step that failed says "not completed" and the next one works on', rows[2]?.text.includes(t.state.failed) && rows[3]?.current === true && has(failedStep, t.steps.a4.title))
    const optimistic = render('he', SeedProgress, { run: null, domain: DOMAIN, projectId: PROJECT, reconnecting: false })
    check('between an accepted start and its first read: step 1 of 4 works, nothing is claimed done',
      has(optimistic, t.stepOf(1, 4)) && stepRows(optimistic)[0]?.current === true && /aria-valuenow="0"/.test(optimistic) && /width:6%/.test(optimistic)
      && !stepRows(optimistic).some((r) => r.text.includes(t.state.done)))
    const finishing = render('he', SeedProgress, { run: progressRun({ a1: 'done', a2: 'done', a3: 'done', a4: 'done' }), domain: DOMAIN, projectId: PROJECT, reconnecting: false })
    check('all four done while the run closes: "putting the findings together", 4 of 4, no step current',
      has(finishing, t.finishingTitle) && has(finishing, t.finishingLine) && has(finishing, t.stepOf(4, 4)) && !finishing.includes('aria-current'))
    const claimed = render('he', SeedProgress, { run: progressRun({ a1: 'running', a2: 'pending', a3: 'pending', a4: 'pending' }, { trigger: 'claim' }), domain: DOMAIN, projectId: PROJECT, reconnecting: false })
    check('a claimed free check says so, with its own lines (it opens results instead of reading the site)',
      has(claimed, t.fromFreeCheck) && t.claimLines.a1.every((l) => has(claimed, l)) && !has(claimed, t.steps.a1.lines[0]) && !has(claimed, t.eyebrow))
    const claimedA4 = render('he', SeedProgress, { run: progressRun({ a1: 'done', a2: 'done', a3: 'done', a4: 'running' }, { trigger: 'claim' }), domain: DOMAIN, projectId: PROJECT, reconnecting: false })
    check('…and at competitors, which the free check never looked for, the scan\'s own lines', t.steps.a4.lines.every((l) => has(claimedA4, l)))
    const stalled = render('he', SeedProgress, { run: progressRun({ a1: 'done', a2: 'done', a3: 'running', a4: 'pending' }, { stalled: true }), domain: DOMAIN, projectId: PROJECT, reconnecting: false })
    check('a stalled run says it carries on in the background, with the dashboard as the one way on',
      has(stalled, t.stalledTitle) && has(stalled, t.stalledBody) && stalled.includes(`href="/dashboard?projectId=${PROJECT}"`)
      && has(stalled, dict('he').actions.dashboard) && count(stalled, /<a /g) === 1)
    check('…a run that is not stalled has no such line', !has(render('he', SeedProgress, { run: working, domain: DOMAIN, projectId: PROJECT, reconnecting: false }), t.stalledTitle))
    const reconnecting = render('he', SeedProgress, { run: working, domain: DOMAIN, projectId: PROJECT, reconnecting: true })
    check('a read that failed says "reconnecting" and keeps the last known steps', has(reconnecting, t.reconnecting) && stepRows(reconnecting)[1]?.current === true)
  }
  {
    const src = strip(read('components/onboarding/SeedProgress.tsx'))
    check('nothing on the progress runs on a clock of its own: no timer, no effect, no reading of the time',
      !/setTimeout|setInterval|requestAnimationFrame|useEffect|Date\.now|new Date/.test(src))
    const OURS = ['FirstArticleButton.tsx', 'NewProjectFlow.tsx', 'ResearchSummary.tsx', 'SeedNotice.tsx', 'SeedProgress.tsx', 'SeedRunScreen.tsx', 'parts.tsx', 'useSeedRun.ts']
    const directional = OURS.filter((f) => /(^|[\s"'`])(rtl|ltr):/.test(strip(read(`components/onboarding/${f}`))))
    check('no rtl:/ltr: variants (the document is always dir=rtl, so they would style English content as Hebrew)', directional.length === 0, directional.join(', '))
  }

  console.log('\n2) The research summary')
  const done = runView()
  const props = (over: Record<string, unknown> = {}) => ({
    projectId: PROJECT,
    domain: DOMAIN,
    projectName: DOMAIN,
    run: done,
    summary: done.summary,
    started: false,
    contentEnabled: false,
    serverNow: NOW.toISOString(),
    onContinued: () => {},
    ...over,
  })
  const ORDER = ['intro', 'tiles', 'business', 'audiences', 'competitors', 'findings', 'keywords', 'geo', 'articles', 'start']
  for (const locale of LOCALES) {
    const t = dict(locale).summary
    const html = render(locale, ResearchSummary, props())
    check(`${locale}: the plan's ten blocks, in its order`, JSON.stringify(blocks(html)) === JSON.stringify(ORDER), blocks(html).join(', '))
    check(`${locale}: 1 the badge, the business by name, "we just scanned" the site`,
      has(block(html, 'intro'), t.badge) && has(block(html, 'intro'), t.title(BUSINESS.companyName!)) && has(block(html, 'intro'), t.scannedJustNow(DOMAIN)))
    const tiles = ['keywords', 'fixes', 'geo', 'articles'].map((id) => tile(html, id))
    check(`${locale}: 2 four tiles with their values: 5 keywords, 3 fixes, 3/4 signs, 5 articles`,
      tiles.every((x) => x.state === 'value')
      && ['5', '3', '3/4', '5'].every((v, i) => textOf(tiles[i].markup).trim().endsWith(v))
      && has(tiles[0].markup, t.tiles.keywords) && has(tiles[1].markup, t.tiles.fixes) && has(tiles[2].markup, t.tiles.geo) && has(tiles[3].markup, t.tiles.articles))
    check(`${locale}: …each with its coloured dot (a blocker makes fixes red, 3 of 4 is amber)`,
      tiles[0].markup.includes('bg-ok') && tiles[1].markup.includes('bg-bad') && tiles[2].markup.includes('bg-warn') && tiles[3].markup.includes('bg-ok'))
    const edits = [...html.matchAll(/href="(\/settings\?[^"]*)"/g)].map((m) => m[1].replace(/&amp;/g, '&'))
    check(`${locale}: 3-5 "${t.edit}" on the business, audiences and competitors only, each into its settings section`,
      JSON.stringify(edits) === JSON.stringify(['business', 'audiences', 'competitors'].map((s) => `/settings?projectId=${PROJECT}#${s}`))
      && block(html, 'business').includes('#business"') && block(html, 'audiences').includes('#audiences"') && block(html, 'competitors').includes('#competitors"')
      && count(html, new RegExp(`<span aria-hidden="true">${t.edit}</span>`, 'g')) === 3 && has(html, t.editLabel(t.business.title)), edits.join(' '))
    check(`${locale}: 5 the competitors seen in real searches first, the most-seen first`,
      (() => {
        const b = block(html, 'competitors')
        const order = ['rival-plumber.co.il', 'pipes-pro.co.il', 'never-seen.co.il'].map((d) => b.indexOf(`>${d}<`))
        return order.every((i) => i > 0) && order[0] < order[1] && order[1] < order[2] && has(b, t.competitors.seenIn(2)) && has(b, t.competitors.suggested)
      })())
    check(`${locale}: 6 the findings, blockers first, in the interface's words`,
      (() => {
        const b = block(html, 'findings')
        const copy = require(join(ROOT, 'lib/free-check/copy.ts')).freeCheckCopy(locale).findings
        const at = ['robots_blocks_ai', 'images_alt', 'no_canonical'].map((id) => textOf(b).indexOf(copy[id].title))
        return at.every((i) => i > 0) && at[0] < at[1] && at[1] < at[2] && has(b, t.findings.severity.blocker)
      })())
    const boxes = checkboxes(html)
    check(`${locale}: 7 the five keywords, each with a checkbox, all five checked`,
      boxes.length === 5 && boxes.every((b) => /\schecked=""/.test(b) && !/\sdisabled=""/.test(b)) && has(block(html, 'keywords'), t.keywords.selected(5, 5)))
    check(`${locale}: …each with why we would promote it`,
      (() => {
        const b = textOf(block(html, 'keywords'))
        return Object.values(t.keywords.reasons).filter((r) => b.includes(r)).length >= 2
      })())
    check(`${locale}: 8 AI readiness: the four signs, "3 of 4", each marked in words for a screen reader`,
      has(block(html, 'geo'), t.geo.score(3, 4)) && count(block(html, 'geo'), new RegExp(`<span class="sr-only">(${t.geo.pass}|${t.geo.fail}): </span>`, 'g')) === 4
      && has(block(html, 'geo'), t.geo.intro))
    check(`${locale}: 9 the articles we would write, numbered`, count(block(html, 'articles'), /<li /g) === 5)
    check(`${locale}: 10 "${t.start.button}": one button, saying what it will track`,
      count(html, /<button[^>]*data-seed-start="true"/g) === 1 && has(block(html, 'start'), t.start.button) && has(block(html, 'start'), t.start.body(5)))
  }
  {
    const t = dict('he').summary
    const seven = fullSummary({ seedKeywords: [...fullSummary().seedKeywords, 'שיפוץ חדרי אמבטיה', 'החלפת צנרת בבית'] })
    const html = render('he', ResearchSummary, props({ summary: seven, run: runView({ summary: seven }) }))
    const boxes = checkboxes(html)
    check('more keywords than "Start" accepts: the first five checked, the rest held back until one is unchecked',
      boxes.length === 7 && boxes.slice(0, 5).every((b) => /\schecked=""/.test(b)) && boxes.slice(5).every((b) => !/\schecked=""/.test(b) && /\sdisabled=""/.test(b))
      && has(html, t.keywords.limit(5)) && has(html, t.keywords.selected(5, 7)))
  }
  for (const locale of LOCALES) {
    const t = dict(locale).summary
    const locked = lockedSummary()
    const lockedRun = runView({ trigger: 'shopify_install', summary: locked })
    const html = render(locale, ResearchSummary, props({ run: lockedRun, summary: locked, domain: 'northwind-candles.myshopify.com', projectName: 'Northwind Candles' }))
    const geo = block(html, 'geo')
    check(`${locale}: a password-locked store: AI readiness reads "${t.geo.locked}"`,
      has(geo, t.geo.locked) && has(geo, t.geo.lockedBody) && geo.includes('data-geo-state="locked"'))
    check(`${locale}: …never as failures: no sign rows, nothing marked missing, no red`,
      count(geo, /<li /g) === 0 && !geo.includes('bg-bad') && !has(geo, `${t.geo.fail}:`) && !has(geo, t.geo.intro))
    check(`${locale}: …and no 0/4 anywhere on the page`,
      !/\b0\s*\/\s*\d/.test(textOf(html)) && !has(html, t.geo.score(0, 4)) && !has(html, t.geo.score(0, 0)) && !/0 of 4|0 מתוך 4/.test(textOf(html)))
    const geoTile = tile(html, 'geo')
    check(`${locale}: …its tile says "${t.tiles.notChecked}", with a grey dot`,
      geoTile.state === 'notChecked' && has(geoTile.markup, t.tiles.notChecked) && geoTile.markup.includes('bg-line-strong') && !/bg-(bad|warn|ok)\b/.test(geoTile.markup))
    check(`${locale}: …the site's findings are not checked either: never "clean", never failing`,
      has(block(html, 'findings'), t.findings.locked) && !has(html, t.findings.clean) && !has(html, t.findings.failed) && tile(html, 'fixes').state === 'notChecked')
    check(`${locale}: …and the business block says why it is empty`, has(block(html, 'business'), t.business.locked))
    check(`${locale}: …its keywords (written in English) keep their own language and direction`,
      html.includes('lang="en" dir="auto">scented candles<') && html.includes('lang="en" dir="auto">How to choose a scented candle<'))
  }
  for (const locale of LOCALES) {
    const t = dict(locale).summary
    const pending = fullSummary({ geo: { state: 'pending', unavailableReason: null, passed: 0, total: 0, signals: [] } })
    const html = render(locale, ResearchSummary, props({ run: runView({ summary: pending }, { a3: 'skipped' }), summary: pending }))
    check(`${locale}: AI readiness still pending shows as pending, block and tile`,
      block(html, 'geo').includes('data-geo-state="pending"') && has(block(html, 'geo'), t.geo.pending) && tile(html, 'geo').state === 'pending'
      && has(tile(html, 'geo').markup, t.tiles.pending) && !has(html, t.geo.score(0, 4)))
    const failed = render(locale, ResearchSummary, props({ run: runView({ status: 'partial', summary: pending }, { a3: 'failed' }), summary: pending }))
    check(`${locale}: a check that did not finish says so, and says nothing else about the site`,
      block(failed, 'geo').includes('data-geo-state="failed"') && has(block(failed, 'geo'), t.geo.failed) && has(block(failed, 'findings'), t.findings.failed)
      && !has(failed, t.findings.clean))
    const clean = fullSummary({ findings: [], findingsOmitted: 0 })
    const cleanHtml = render(locale, ResearchSummary, props({ run: runView({ summary: clean }), summary: clean }))
    check(`${locale}: a site with none of the issues we check: "${t.findings.clean}", and 0 fixes in green`,
      has(block(cleanHtml, 'findings'), t.findings.clean) && tile(cleanHtml, 'fixes').state === 'value' && textOf(tile(cleanHtml, 'fixes').markup).trim().endsWith('0')
      && tile(cleanHtml, 'fixes').markup.includes('bg-ok'))
  }
  {
    const he = render('he', ResearchSummary, props())
    const en = render('en', ResearchSummary, props())
    check('evidence written in the snapshot\'s language shows in that language only', has(he, '1 מתוך 2 תמונות') && !has(en, '1 מתוך 2 תמונות'))
    // The business's own name is a proper noun: it stays as the site writes it, isolated in the title.
    const outside = withoutLang(en, 'he').split(`⁨${BUSINESS.companyName}⁩`).join('')
    check('English interface, Hebrew site: no Hebrew outside the snapshot\'s own text and the business\'s name',
      !HEBREW.test(outside), (outside.match(/[֐-׿][^<]*/g) ?? []).slice(0, 4).join(' | '))
    check('…and that text carries lang="he" and its own direction (description, niche, 4 audiences, 5 keywords, 5 topics)',
      count(en, /lang="he" dir="auto"/g) === 1 + 1 + 4 + 5 + 5)
    const t = dict('en').summary
    const later = render('en', ResearchSummary, props({ serverNow: new Date(NOW.getTime() + 3 * 3600_000).toISOString() }))
    const days = render('en', ResearchSummary, props({ serverNow: new Date(NOW.getTime() + 50 * 3600_000).toISOString() }))
    check('coming back later, the summary says when the site was scanned, by the server\'s clock',
      has(later, t.scannedHoursAgo(DOMAIN, 3)) && has(days, t.scannedDaysAgo(DOMAIN, 2)))
    const claim = fullSummary({ source: 'claim' })
    check('a summary seeded from the free check says so', has(render('en', ResearchSummary, props({ summary: claim, run: runView({ trigger: 'claim', summary: claim }) })), t.fromFreeCheck)
      && !has(en, t.fromFreeCheck))
  }
  for (const locale of LOCALES) {
    const t = dict(locale).summary
    const startedRun = runView({ stage: 'b', status: 'running', finishedAt: null })
    const html = render(locale, ResearchSummary, props({ run: startedRun, summary: startedRun.summary, started: true }))
    check(`${locale}: once stage B began: no checkboxes and no "${t.start.button}", the keywords read-only`,
      screenOf(html) === 'started' && checkboxes(html).length === 0 && !html.includes('data-seed-start') && has(block(html, 'keywords'), t.keywords.tracked))
    check(`${locale}: …"running in the background", with the dashboard as the way on`,
      has(block(html, 'start'), t.start.runningTitle) && block(html, 'start').includes(`href="/dashboard?projectId=${PROJECT}"`) && has(block(html, 'start'), t.start.openDashboard))
    check(`${locale}: …and the ten blocks are all still there, in order`, JSON.stringify(blocks(html)) === JSON.stringify(ORDER))
  }
  for (const locale of LOCALES) {
    const t = dict(locale).firstArticle
    const off = render(locale, ResearchSummary, props({ contentEnabled: false }))
    const on = render(locale, ResearchSummary, props({ contentEnabled: true }))
    check(`${locale}: "${t.button}" only with the content module on, in the articles block`,
      !off.includes('data-first-article') && !has(off, t.button) && block(on, 'articles').includes('data-first-article="idle"') && has(block(on, 'articles'), t.button))
    check(`${locale}: …one button, idle until pressed: no article is written by opening the summary`,
      count(on, /data-first-article=/g) === 1 && !has(on, t.writing) && count(on, /<dialog[^>]*\sopen=""/g) === 0)
  }
  {
    const button = strip(read('components/onboarding/FirstArticleButton.tsx'))
    check('the first article goes through the brief modal and the one generate endpoint, as the Content tab does',
      /<ArticleBriefModal\b/.test(button) && /mode="gsc_reviewed_topic"/.test(button) && /fetch\('\/api\/content\/articles\/generate'/.test(button))
    check('…it is written only after the merchant saves the brief (or retries): no effect starts it',
      !/useEffect/.test(button) && count(button, /\bgenerate\(/g) === 3 && /onTopicsCreated=\{\(topics\) => \{[\s\S]*void generate\(id\)/.test(button)
      && /onClick=\{\(\) => void generate\(topicId\)\}/.test(button))
    const others = ['NewProjectFlow.tsx', 'ResearchSummary.tsx', 'SeedNotice.tsx', 'SeedProgress.tsx', 'SeedRunScreen.tsx', 'parts.tsx', 'useSeedRun.ts']
      .filter((f) => /articles\/generate|content\/topics/.test(strip(read(`components/onboarding/${f}`))))
    check('…and nothing else on these screens writes an article or a topic', others.length === 0, others.join(', '))
    // The screens that call a route. The only .error/.detail they may read are their own:
    // the first-article state's error key, and the snapshot's finding and sign details.
    const OWN = /\bstate\.error\b|\b(copy\?|f|s)\.detail\b/g
    const leaks = ['FirstArticleButton.tsx', 'NewProjectFlow.tsx', 'ResearchSummary.tsx', 'SeedRunScreen.tsx', 'useSeedRun.ts']
      .filter((f) => /\.(error|message|detail|statusText)\b/.test(strip(read(`components/onboarding/${f}`)).replace(OWN, '')))
    check('no screen reads a route\'s own text (error, message, detail, status text): only stable codes', leaks.length === 0, leaks.join(', '))
  }

  console.log('\n3) The research screen')
  const surface = (over: Record<string, unknown> = {}) => ({
    projectId: PROJECT,
    domain: DOMAIN,
    projectName: DOMAIN,
    contentEnabled: false,
    initialRun: null,
    serverNow: NOW.toISOString(),
    initialNotice: null,
    ...over,
  })
  search = new URLSearchParams({ projectId: PROJECT })
  for (const locale of LOCALES) {
    const d = dict(locale)
    const none = render(locale, SeedRunScreen, surface())
    check(`${locale}: no run yet: "${d.noRun.title}", with one button to scan`,
      screenOf(none) === 'none' && has(none, d.noRun.title) && count(none, /data-seed-scan="true"/g) === 1 && has(none, d.noRun.action) && count(none, /<a /g) === 0)
    const unreachable = render(locale, SeedRunScreen, surface({ initialRun: runView({ status: 'failed', errorCode: 'site_unreachable', summary: null }, { a1: 'failed', a2: 'skipped', a3: 'skipped', a4: 'skipped' }) }))
    check(`${locale}: the site could not be reached: said plainly, with "${d.actions.retry}"`,
      screenOf(unreachable) === 'failed' && has(unreachable, d.notices.siteUnreachable.title) && has(unreachable, d.notices.siteUnreachable.body)
      && count(unreachable, /data-seed-scan="true"/g) === 1 && has(unreachable, d.actions.retry))
    const badAddress = render(locale, SeedRunScreen, surface({ initialRun: runView({ status: 'failed', errorCode: null, summary: null }, { a1: 'failed', a2: 'skipped', a3: 'skipped', a4: 'skipped' }) }))
    check(`${locale}: a stop with no code of its own: "${d.notices.scanStopped.title}", try again`,
      screenOf(badAddress) === 'failed' && has(badAddress, d.notices.scanStopped.title) && count(badAddress, /data-seed-scan="true"/g) === 1)
    const run = runView({ status: 'failed', errorCode: 'invalid_site_url', summary: null }, { a1: 'failed', a2: 'skipped', a3: 'skipped', a4: 'skipped' })
    const settings = render(locale, SeedRunScreen, surface({ initialRun: run }))
    check(`${locale}: the project's address leads nowhere readable: the settings are the one way on, not a retry`,
      has(settings, d.notices.siteAddress.title) && settings.includes(`href="/settings?projectId=${PROJECT}"`) && !settings.includes('data-seed-scan') && count(settings, /<a /g) === 1)
    const handed = render(locale, SeedRunScreen, surface({ initialNotice: { key: 'userDailyCap', action: 'dashboard', retryAfterSeconds: 7200 } }))
    check(`${locale}: a refusal handed over from the new-project screen shows here, its wait spelled out, with its one action`,
      has(handed, d.notices.userDailyCap.title) && has(handed, d.notices.userDailyCap.body(d.wait.hours(2))) && handed.includes('data-notice="userDailyCap"')
      && handed.includes(`href="/dashboard?projectId=${PROJECT}"`) && !handed.includes('data-seed-scan'))
    const noWait = render(locale, SeedRunScreen, surface({ initialNotice: { key: 'globalDailyCap', action: 'dashboard' } }))
    check(`${locale}: …without the server's wait it says "${d.wait.later}", never a time we would be guessing`,
      has(noWait, d.notices.globalDailyCap.body(d.wait.later)))
  }
  {
    const cases: [string, SeedRunView, string][] = [
      ['running', progressRun({ a1: 'done', a2: 'running', a3: 'pending', a4: 'pending' }), 'progress'],
      ['stalled', progressRun({ a1: 'done', a2: 'done', a3: 'running', a4: 'pending' }, { stalled: true }), 'progress'],
      ['done, created from the address', runView({ trigger: 'create' }), 'summary'],
      ['done, claimed from the free check', runView({ trigger: 'claim', summary: fullSummary({ source: 'claim' }) }), 'summary'],
      ['done, started at a Shopify install', runView({ trigger: 'shopify_install', summary: lockedSummary() }), 'summary'],
      ['done, a rescan', runView({ trigger: 'rescan' }), 'summary'],
      ['partial (a step failed, the rest finished)', runView({ status: 'partial' }, { a4: 'failed' }), 'summary'],
      ['stage B under way', runView({ stage: 'b', status: 'running', finishedAt: null }), 'started'],
      ['stage B finished', runView({ stage: 'b', status: 'done' }), 'started'],
    ]
    for (const [label, run, want] of cases) {
      const html = render('he', SeedRunScreen, surface({ initialRun: run }))
      check(`the same address shows the run's state: ${label} → ${want}`, screenOf(html) === want, String(screenOf(html)))
    }
    const noSummary = render('he', SeedRunScreen, surface({ initialRun: runView({ summary: null }) }))
    check('a finished run with no summary to show is a stop, with a retry, never an empty summary',
      screenOf(noSummary) === 'failed' && has(noSummary, dict('he').notices.scanStopped.title) && count(noSummary, /data-seed-scan="true"/g) === 1)
    const shopify = render('en', SeedRunScreen, surface({ initialRun: runView({ trigger: 'shopify_install', summary: lockedSummary() }), domain: 'northwind-candles.myshopify.com' }))
    check('a Shopify install\'s run reads, on the same screen, as a locked store (not checked, never 0/4)',
      block(shopify, 'geo').includes('data-geo-state="locked"') && !/\b0\s*\/\s*\d/.test(textOf(shopify)))
  }

  console.log('\n4) The page at /projects/[id]/summary')
  {
    const Page = load('app/(dashboard)/projects/[id]/summary/page.tsx')
    const d = dict('he')
    const base: SummarySurface = { projectId: PROJECT, domain: DOMAIN, projectName: DOMAIN, contentEnabled: false, initialRun: null, serverNow: NOW.toISOString() }
    const seen: string[] = []
    loadSurface = async (id) => {
      seen.push(id)
      return base
    }
    const open = (params: Record<string, string>) => Page({ params: Promise.resolve({ id: PROJECT }), searchParams: Promise.resolve(params) })
    const handed = paint('he', await open({ projectId: PROJECT, notice: 'userDailyCap', wait: '7200' }))
    check('the page reads the project it names, and a refusal handed over in its address', seen[0] === PROJECT && has(handed, d.notices.userDailyCap.title) && has(handed, d.wait.hours(2)))
    for (const forged of [{ notice: 'siteUnreachable' }, { notice: 'constructor' }, { notice: '__proto__' }, { notice: '<script>x</script>' }, { notice: 'userDailyCap', wait: '-1' }] as Record<string, string>[]) {
      const html = paint('he', await open({ projectId: PROJECT, ...forged }))
      const ok = forged.wait ? !has(html, d.wait.hours(0)) && has(html, d.wait.later) : !html.includes('data-notice') && count(html, /data-seed-scan="true"/g) === 1
      check(`…a notice the start could not have sent is ignored: ${JSON.stringify(forged)}`, ok && !html.includes('<script>x'))
    }
    loadSurface = async () => ({ ...base, initialRun: runView() })
    check('…with a finished run, the summary itself', screenOf(paint('he', await open({ projectId: PROJECT }))) === 'summary')
    loadSurface = async () => null
    let thrown: unknown = null
    try {
      await open({})
    } catch (err) {
      thrown = err
    }
    check('someone else\'s project, or the scan off: "not found"', thrown === NOT_FOUND)
    loadSurface = async () => {
      throw new SurfaceUnavailableError()
    }
    const outage = paint('he', await open({}))
    check('an outage reading the project is said as one, with a refresh, and names no internal text',
      screenOf(outage) === 'error' && has(outage, d.notices.failed.title) && has(outage, d.actions.refresh) && !outage.includes('onboarding_surface_unavailable'))
    loadSurface = async () => {
      throw new Error('boom')
    }
    let other: unknown = null
    try {
      await open({})
    } catch (err) {
      other = err
    }
    check('…any other error is not swallowed into a notice', other instanceof Error && (other as Error).message === 'boom')
  }

  console.log('\n5) The new-project screen')
  for (const locale of LOCALES) {
    const t = dict(locale).newProject
    const steps = dict(locale).progress.steps
    const html = render(locale, NewProjectFlow, { clients: [{ id: 'c1', isDefault: true }], claimedDomain: null })
    const input = /<input[^>]*id="seed-site-address"[^>]*>/.exec(html)?.[0] ?? ''
    check(`${locale}: one field, the site's address, written left to right in either language`,
      count(html, /<input/g) === 1 && /\sdir="ltr"/.test(input) && /inputmode="url"/i.test(input) && /\stype="text"/.test(input) && /\svalue=""/.test(input)
      && /<div class="[^"]*" dir="ltr"><span aria-hidden="true"[^>]*>https:\/\/<\/span>/.test(html))
    check(`${locale}: …labelled, with the promise "${t.promise}" and no connection needed`,
      new RegExp(`<label for="seed-site-address"[^>]*>${t.urlLabel}</label>`).test(html) && has(html, t.promise) && has(html, t.noConnection))
    const aside = /<aside[\s\S]*?<\/aside>/.exec(html)?.[0] ?? ''
    const at = (['a1', 'a2', 'a3', 'a4'] as const).map((s) => textOf(aside).indexOf(steps[s].title))
    check(`${locale}: the four steps, in order, beside the field`, at.every((i) => i >= 0) && at[0] < at[1] && at[1] < at[2] && at[2] < at[3] && count(aside, /<li /g) === 4)
    check(`${locale}: one submit button: "${t.submit}"`, count(html, /<button/g) === 1 && /<button[^>]*type="submit"/.test(html) && has(html, t.submit))
    const claimed = render(locale, NewProjectFlow, { clients: [{ id: 'c1', isDefault: true }], claimedDomain: 'shop.example.com' })
    const claimedInput = /<input[^>]*id="seed-site-address"[^>]*>/.exec(claimed)?.[0] ?? ''
    check(`${locale}: the site the free check scanned is filled in, and said so`,
      /\svalue="shop\.example\.com"/.test(claimedInput) && has(claimed, t.fromFreeCheck('shop.example.com')))
    check(`${locale}: …without one, nothing is claimed`, !has(html, t.fromFreeCheck('shop.example.com').replace('shop.example.com', '').trim()))
    check(`${locale}: …its labels letter-spaced in English only`, locale === 'he' ? !html.includes('tracking-[0.14em]') : html.includes('uppercase tracking-[0.14em]'))
    if (locale === 'en') check('en: no Hebrew anywhere on the English new-project screen', !HEBREW.test(html) && !HEBREW.test(claimed))
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
