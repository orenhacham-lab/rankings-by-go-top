/**
 * The dashboard's widgets (plan §2), from the data they are handed to the
 * markup they render, in Hebrew and in English.
 *
 *   R) the ranking figures: one pass, active keywords only, newest check only
 *   S) the seeding scan: none / stage A / stage B running / done / failed /
 *      locked store, and "what's holding you back" in the merchant's language
 *   F) the activity feed and relative times
 *   T) the setup checklist, and Search Console's part of it
 *   C) the competitors' rows (W10)
 *   W) the rendered widgets: every empty state is an icon, one sentence and one
 *      action; a locked store says "not checked", never "failed"; stage B's
 *      steps are in the feed while it runs; the first-article button appears
 *      once; the account card is display only; English has no Hebrew
 *   D) the copy: dashboardHome sits right after home, with the same keys in both
 *   P) the page: composes every widget, hides the scan widget when there is no
 *      scan, and imports no provider, model or quota-writing module
 *
 * Render: react-dom/server with no effects, the state a merchant sees first.
 * Run: npx tsx lib/dashboard/__qa__/dashboard-widgets.qa.ts
 */
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { createElement, type ReactElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { buildRankings, type DashboardResult, type DashboardTarget } from '../rankings'
import { holdingBack, seedFeed, seedPhase, seedStateFrom, seedStillRunning, GEO_CHECK_IDS } from '../seed'
import { mergeFeed, relativeTime, setupTasks } from '../activity'
import { competitorRows } from '../competitors'
import type { ActivityEvent } from '../overview'
import type { SeedRunView, SeedStepView, SeedSummary } from '@/lib/seed-scan/types'
import type { CompetitorComparison } from '@/lib/competitors/comparison'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { DashboardLanguageProvider } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { freeCheckCopy } from '@/lib/free-check/copy'
import HeroCard from '@/components/dashboard/HeroCard'
import HoldingBack from '@/components/dashboard/HoldingBack'
import RecentActivity from '@/components/dashboard/RecentActivity'
import RankDistribution from '@/components/dashboard/RankDistribution'
import RankingChanges from '@/components/dashboard/RankingChanges'
import CompetitorsWidget from '@/components/dashboard/CompetitorsWidget'
import ContentOpportunities from '@/components/dashboard/ContentOpportunities'
import { PublishingBoard, RecentArticles } from '@/components/dashboard/ContentWidgets'
import AiVisibilityBrief from '@/components/dashboard/AiVisibilityBrief'
import AccountStatus from '@/components/dashboard/AccountStatus'
import SetupCompletion from '@/components/dashboard/SetupCompletion'
import Shortcuts from '@/components/dashboard/Shortcuts'
import { gscSetupDone, setupHrefs } from '@/components/dashboard/DashboardSetup'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')
const HEBREW = /[֐-׿]/
/** Through the real language provider, as the dashboard renders them. */
const render = (el: ReactElement, lang: 'he' | 'en' = 'en') =>
  renderToStaticMarkup(createElement(DashboardLanguageProvider as never, { initialLocale: lang, children: el } as never) as never)
const text = (html: string) => html.replace(/<[^>]+>/g, ' ')

const NOW = new Date('2026-09-15T12:00:00.000Z')
const ago = (min: number) => new Date(NOW.getTime() - min * 60_000).toISOString().replace('Z', '+00:00')
const he = getDashboardDictionary('he').dashboardHome
const en = getDashboardDictionary('en').dashboardHome

// ── Fixtures ────────────────────────────────────────────────────────────────

const target = (id: string, extra: Partial<DashboardTarget> = {}): DashboardTarget =>
  ({ id, keyword: `kw ${id}`, is_active: true, engine_type: 'google_search', avg_monthly_searches: null, ...extra })
const result = (id: string, position: number | null, change: number | null, minutesAgo: number, found = position !== null): DashboardResult =>
  ({ tracking_target_id: id, keyword: `kw ${id}`, engine_type: 'google_search', position, found, change_value: change, checked_at: ago(minutesAgo) })

function summary(extra: Partial<SeedSummary> = {}): SeedSummary {
  return {
    version: 1, source: 'scan', domain: 'bloom.example', url: 'https://bloom.example/', scannedAt: ago(90), locale: 'he',
    storefrontLocked: false, business: null, audiences: [], seedKeywords: [], topics: [],
    findings: [
      { id: 'title_missing', severity: 'blocker', title: 'לעמוד אין כותרת', detail: 'עברית' },
      { id: 'images_alt', severity: 'warning', title: 'חסר ALT', detail: 'עברית' },
      { id: 'made_up_future_finding', severity: 'info', title: 'ממצא בעברית בלבד', detail: 'עברית' },
    ],
    findingsOmitted: 0,
    geo: {
      state: 'measured', unavailableReason: null, passed: 2, total: 4,
      signals: [
        { id: 'schema', ok: true, title: '', detail: '' }, { id: 'faq', ok: false, title: '', detail: '' },
        { id: 'robots', ok: true, title: '', detail: '' }, { id: 'llms', ok: false, title: '', detail: '' },
      ],
    },
    competitors: [
      { domain: 'rival.example', validated: true, seenIn: 3, source: 'search' },
      { domain: 'guess.example', validated: false, seenIn: 0, source: 'model' },
    ],
    counters: { keywords: 0, fixes: 2, geoPassed: 2, geoTotal: 4, articles: 0, competitors: 1 },
    sitemapUrlCount: 40, sitemapTruncated: false,
    ...extra,
  } as SeedSummary
}

const step = (s: SeedStepView['step'], status: SeedStepView['status'], extra: Partial<SeedStepView> = {}): SeedStepView =>
  ({ step: s, status, itemCount: null, errorCode: null, startedAt: null, finishedAt: null, ...extra })

function run(kind: 'seeded' | 'stage_b_running' | 'stage_a_running' | 'failed' | 'locked'): SeedRunView {
  const aDone = [
    step('a1', 'done', { itemCount: 40, startedAt: ago(95), finishedAt: ago(94) }),
    step('a2', 'done', { startedAt: ago(94), finishedAt: ago(93) }),
    step('a3', 'done', { itemCount: 2, startedAt: ago(93), finishedAt: ago(92) }),
    step('a4', 'done', { itemCount: 1, startedAt: ago(92), finishedAt: ago(91) }),
  ]
  const base = { id: 'run1', trigger: 'create', errorCode: null, startedAt: ago(95), finishedAt: null, stalled: false } as const
  switch (kind) {
    case 'seeded':
      return { ...base, stage: 'b', status: 'done', finishedAt: ago(10), summary: summary(), steps: [...aDone,
        step('b1', 'done', { itemCount: 12, finishedAt: ago(60) }), step('b2', 'done', { itemCount: 140, finishedAt: ago(50) }),
        step('b3', 'done', { itemCount: 188, finishedAt: ago(40) }), step('b4', 'done', { itemCount: 20, finishedAt: ago(30) }),
        step('b5', 'done', { itemCount: 8, finishedAt: ago(20) }), step('b6', 'done', { itemCount: 5, finishedAt: ago(10) })] }
    case 'stage_b_running':
      return { ...base, stage: 'b', status: 'running', summary: summary(), steps: [...aDone,
        step('b1', 'done', { itemCount: 12, finishedAt: ago(5) }), step('b2', 'done', { itemCount: 140, finishedAt: ago(3) }),
        step('b3', 'running', { startedAt: ago(2) }), step('b4', 'pending'), step('b5', 'pending'), step('b6', 'pending')] }
    case 'stage_a_running':
      return { ...base, stage: 'a', status: 'running', summary: null, steps: [
        step('a1', 'done', { itemCount: 40, finishedAt: ago(1) }), step('a2', 'running', { startedAt: ago(0.5) }), step('a3', 'pending'), step('a4', 'pending')] }
    case 'failed':
      return { ...base, stage: 'a', status: 'failed', errorCode: 'site_unreachable', summary: null, steps: [
        step('a1', 'failed', { errorCode: 'site_unreachable', finishedAt: ago(1) }), step('a2', 'pending'), step('a3', 'pending'), step('a4', 'pending')] }
    case 'locked':
      return { ...base, stage: 'a', status: 'done', finishedAt: ago(1), summary: summary({ storefrontLocked: true, findings: [], geo: { state: 'unavailable', unavailableReason: 'storefront_locked', passed: 0, total: 0, signals: [] } }),
        steps: [aDone[0], aDone[1], step('a3', 'skipped', { errorCode: 'storefront_locked' }), aDone[3]] }
  }
}

/** The data-empty block of a rendered widget, and the actions in it. */
function emptyBlock(html: string): { present: boolean; actions: number; icon: boolean; body: string } {
  const at = html.indexOf('data-empty=""')
  if (at < 0) return { present: false, actions: 0, icon: false, body: '' }
  const start = html.lastIndexOf('<div', at)
  // The block ends where its widget's body ends.
  const block = html.slice(start, html.indexOf('</section>', at))
  return {
    present: true,
    actions: (block.match(/<a\b|<button\b/g) ?? []).length,
    icon: /<svg\b/.test(block),
    body: text(block),
  }
}

async function main() {
  // ── R) rankings ─────────────────────────────────────────────────────────
  console.log('\nR) the ranking figures')
  {
    const targets = [
      target('t1', { avg_monthly_searches: 900 }), target('t2'), target('t3', { avg_monthly_searches: 5000 }), target('t4'),
      target('t5'), target('t6', { is_active: false }), target('t7', { avg_monthly_searches: 200 }),
    ]
    const results = [
      result('t1', 2, 3, 10), result('t1', 5, 0, 60 * 24 * 30),  // newest check: #2, up 3
      result('t2', 8, -4, 10),                                     // #8, down 4
      result('t3', 14, 6, 10),                                     // page two, up 6
      result('t4', 7, null, 10, false),                            // a position recorded, but not found
      result('t5', 140, null, 10, true),                           // below 100: not found
      result('t6', 1, 50, 10),                                     // inactive: ignored
      result('t7', 25, -1, 10),                                    // page three
      result('ghost', 1, 1, 10),                                   // no such keyword
    ]
    const r = buildRankings(targets, results)
    const b = Object.fromEntries(r.buckets.map((x) => [x.key, x.count]))
    check('R1: only active keywords count', r.tracked === 6 && r.checked === 6, [r.tracked, r.checked])
    check('R2: each keyword counts once, in the bucket of its NEWEST check', b.top3 === 1 && b.top10 === 1 && b.top20 === 1 && b.top50 === 1 && b.notFound === 2, b)
    check('R3: first page is positions 1-10', r.firstPage === 2)
    check('R4: a position past 100, or not found, is "not found", never a rank', r.avgPosition === 12.3, r.avgPosition)
    check('R5: the average moved by the mean of the recorded changes (positive is better)', r.avgChange === 1, r.avgChange)
    check('R6: improvements biggest first, drops biggest first', r.improvements.map((m) => m.targetId).join() === 't3,t1' && r.drops.map((m) => m.targetId).join() === 't2,t7')
    check('R7: the biggest move is the news line\'s', r.biggestMove?.targetId === 't3')
    check('R8: page-two opportunities are 11-30, most searched first', r.pageTwo.map((p) => p.targetId).join() === 't3,t7', r.pageTwo)
    const empty = buildRankings([], [])
    check('R9: no keywords: nothing checked, no average, no news', empty.tracked === 0 && empty.checked === 0 && empty.avgPosition === null && empty.biggestMove === null)
  }

  // ── S) the seeding scan ─────────────────────────────────────────────────
  console.log('\nS) the seeding scan')
  {
    const safe = (f: () => boolean) => { try { return f() } catch { return false } }
    check('S1: switched off (404) is "none", not an error, whatever the body says',
      seedStateFrom(404, { ok: false, code: 'not_found' }).kind === 'none' && seedStateFrom(404, { ok: true, run: run('seeded') }).kind === 'none')
    check('S2: an older project (run: null) is "none"', safe(() => seedStateFrom(200, { ok: true, run: null }).kind === 'none'))
    check('S3: an unreadable answer is "none"', seedStateFrom(0, null).kind === 'none' && seedStateFrom(500, { ok: false }).kind === 'none' && seedStateFrom(200, { ok: true, run: { id: 'x' } }).kind === 'none')
    const phases = (['stage_a_running', 'stage_b_running', 'seeded', 'failed', 'locked'] as const).map((k) => seedPhase(run(k)))
    check('S4: the phases', JSON.stringify(phases) === JSON.stringify(['stage_a', 'stage_b', 'done', 'failed', 'ready']), phases)
    const running = seedStateFrom(200, { ok: true, run: run('stage_b_running') })
    check('S5: stage B running is asked again; a finished scan is not',
      seedStillRunning(running) && !seedStillRunning(seedStateFrom(200, { ok: true, run: run('seeded') })) && !seedStillRunning({ kind: 'none' }))

    const seededEn = holdingBack(run('seeded'), 'en')
    check('S6: seeded: the findings are re-read by id in the merchant\'s language',
      seededEn.state === 'ready' && seededEn.findings[0].title === freeCheckCopy('en').findings.title_missing.title && !HEBREW.test(JSON.stringify(seededEn.findings)), seededEn)
    check('S7: a finding with no copy in that language is counted, never shown in another language', seededEn.state === 'ready' && seededEn.hidden === 1 && seededEn.findings.length === 2)
    const seededHe = holdingBack(run('seeded'), 'he')
    check('S8: ...and shown as written when the language matches', seededHe.state === 'ready' && seededHe.findings.length === 3 && seededHe.hidden === 0)
    check('S9: the four AI-readiness checks, in order, with the measured answers', seededEn.state === 'ready'
      && JSON.stringify(seededEn.checks) === JSON.stringify([{ id: 'schema', ok: true }, { id: 'faq', ok: false }, { id: 'robots', ok: true }, { id: 'llms', ok: false }])
      && seededEn.passed === 2 && seededEn.total === 4)
    check('S10: stage B running still shows stage A\'s findings', holdingBack(run('stage_b_running'), 'en').state === 'ready')
    check('S11: stage A running is pending', holdingBack(run('stage_a_running'), 'en').state === 'pending')
    check('S12: a scan that could not read the site is "failed"', holdingBack(run('failed'), 'en').state === 'failed')
    const locked = holdingBack(run('locked'), 'en')
    check('S13: a locked store: all four checks "not checked", none failing', locked.state === 'locked'
      && locked.checks.length === 4 && locked.checks.every((c) => c.ok === null) && JSON.stringify(locked.checks.map((c) => c.id)) === JSON.stringify(GEO_CHECK_IDS))
    const lockedByStep = { ...run('locked'), summary: summary({ geo: { state: 'unavailable', unavailableReason: null, passed: 0, total: 0, signals: [] } }) }
    check('S14: ...also when only the step says the store was locked', holdingBack(lockedByStep, 'en').state === 'locked')
  }

  // ── F) feed ─────────────────────────────────────────────────────────────
  console.log('\nF) the activity feed')
  {
    const feed = seedFeed(run('stage_b_running'))
    check('F1: stage B running: every finished step and the running one, and the steps to come counted',
      feed.lines.length === 7 && feed.lines.some((l) => l.step === 'b3' && l.status === 'running') && feed.pending === 3, feed)
    check('F2: a skipped step says nothing', !seedFeed(run('locked')).lines.some((l) => l.step === 'a3'))
    check('F3: a scan that stopped has nothing pending, even with steps it never reached', seedFeed(run('seeded')).pending === 0 && seedFeed(run('failed')).pending === 0)
    const events: ActivityEvent[] = [
      { kind: 'article_published', at: ago(1), title: 'Newest', count: null },
      { kind: 'rank_check', at: ago(300), title: null, count: 12 },
    ]
    const merged = mergeFeed(events, feed.lines)
    check('F4: the running step leads, then newest first', merged[0].source === 'seed' && merged[0].line.status === 'running'
      && merged[1].source === 'event' && merged.slice(1).every((m, i, a) => i === 0 || Date.parse(a[i - 1].at ?? '') >= Date.parse(m.at ?? '')))
    check('F5: the feed is capped at ten', mergeFeed(Array.from({ length: 20 }, (_, i) => ({ kind: 'topic_created' as const, at: ago(i), title: 'x', count: null })), []).length === 10)
    check('F6: relative time in English and Hebrew', relativeTime(ago(3), NOW, 'en') === '3 minutes ago' && HEBREW.test(relativeTime(ago(3), NOW, 'he')), [relativeTime(ago(3), NOW, 'en'), relativeTime(ago(3), NOW, 'he')])
    check('F7: a time a little in the future reads as now', relativeTime(ago(-2), NOW, 'en') === 'now', relativeTime(ago(-2), NOW, 'en'))
  }

  // ── T) setup ────────────────────────────────────────────────────────────
  console.log('\nT) the setup checklist')
  {
    check('T1: every task done: no checklist at all', setupTasks({ business: true, platform: true, gsc: true, keywords: true }) === null)
    const open = setupTasks({ business: true, platform: false, gsc: false, keywords: true })
    check('T2: two of four: 50%', open?.percent === 50 && open.done === 2 && open.tasks.length === 4)
    const noGsc = setupTasks({ business: true, platform: false, gsc: null, keywords: true })
    check('T3: an unknown Search Console state is left out, never "connect"', !!noGsc && !noGsc.tasks.some((t) => t.key === 'gsc') && noGsc.tasks.length === 3)
    check('T4: nothing known: no checklist', setupTasks({ business: null, platform: null, gsc: null, keywords: null }) === null)
    const states = ['ready', 'never_synced', 'not_connected', 'reauth_required', 'no_property', 'loading', 'error', 'disabled'] as const
    const mapped = states.map((state) => gscSetupDone({ state } as never))
    check('T5: Search Console: connected is done, set-up states are open, unknown is left out',
      JSON.stringify(mapped) === JSON.stringify([true, true, false, false, false, null, null, null]), mapped)
    const hrefs = setupHrefs('p 1')
    check('T6: each task links into this project\'s settings, never outside the app',
      hrefs.business === '/settings?projectId=p%201#business' && hrefs.platform.endsWith('#platform') && hrefs.gsc.endsWith('#search-console')
      && Object.values(hrefs).every((h) => h.startsWith('/') && !h.startsWith('//')), hrefs)
  }

  // ── C) competitors ──────────────────────────────────────────────────────
  console.log('\nC) the competitors\' rows')
  {
    const comps = [{ domain: 'a.example', name: 'A' }, { domain: 'b.example', name: 'B' }] as never
    const comparison = {
      standings: [{ domain: 'a.example', ahead: 1, compared: 3 }, { domain: 'b.example', ahead: 2, compared: 3 }],
      cells: {
        k1: { kind: 'best', entries: [{ domain: 'a.example', position: 4 }, { domain: 'b.example', position: 12 }] },
        k2: { kind: 'best', entries: [{ domain: 'b.example', position: 2 }] },
        k3: { kind: 'none_in_top20', entries: [] },
        k4: { kind: 'loading', entries: [{ domain: 'a.example', position: 1 }] },
      },
      comparedKeywords: 3,
    } as unknown as CompetitorComparison
    const rows = competitorRows(comps, comparison)
    check('C1: most keywords ahead of you first', rows.map((r) => r.domain).join() === 'b.example,a.example')
    check('C2: page-one counts and best positions come from recorded positions only', rows[0].top10 === 1 && rows[0].best === 2 && rows[1].top10 === 1 && rows[1].best === 4, rows)
    check('C3: before a comparison, every competitor is listed with nothing counted', competitorRows(comps, null).every((r) => r.compared === 0 && r.best === null))
  }

  // ── W) rendered widgets ─────────────────────────────────────────────────
  console.log('\nW) the rendered widgets')
  {
    const noKeywords = buildRankings([], [])
    const oneUnchecked = buildRankings([target('t1')], [])
    const ranked = buildRankings([target('t1'), target('t2')], [result('t1', 3, 2, 5), result('t2', 15, -1, 5)])

    // Every empty state: an icon, one sentence, exactly one action.
    const empties: [string, (t: typeof en) => ReactElement][] = [
      ['distribution', (t) => createElement(RankDistribution, { t, rankings: noKeywords, language: 'en' })],
      ['improvements', (t) => createElement(RankingChanges, { t, direction: 'up', title: 'x', moves: [] })],
      ['drops', (t) => createElement(RankingChanges, { t, direction: 'down', title: 'x', moves: [] })],
      ['competitors', (t) => createElement(CompetitorsWidget, { t, model: { state: 'empty' }, manageHref: '/settings#competitors' })],
      ['opportunities', (t) => createElement(ContentOpportunities, { t, language: 'en', projectId: 'p', items: [], canCreateTopics: true })],
      ['board', (t) => createElement(PublishingBoard, { t, language: 'en', section: { state: 'ready', data: { upcoming: [], published: [] } }, retry: () => {} })],
      ['articles', (t) => createElement(RecentArticles, { t, language: 'en', section: { state: 'ready', data: { recent: [] } }, retry: () => {}, firstArticleHref: '/content/topics' })],
      ['ai', (t) => createElement(AiVisibilityBrief, { t, language: 'en', section: { state: 'ready', data: { score: null, mentions: 0, citations: 0, answers: 0, change: null, lastCheckAt: null } }, retry: () => {}, now: NOW })],
      ['activity', (t) => createElement(RecentActivity, { t, model: { state: 'ready', items: [], pending: 0 }, now: NOW, language: 'en', emptyHref: '/keyword-research' })],
      ['holding-back', (t) => createElement(HoldingBack, { t, model: { state: 'failed' }, scannedLabel: null, settingsHref: '/settings?projectId=p' })],
    ]
    const bad: string[] = []
    for (const [id, make] of empties) {
      for (const [lang, t] of [['en', en], ['he', he]] as const) {
        const html = render(make(t), lang)
        const e = emptyBlock(html)
        if (!e.present || !e.icon || e.actions !== 1 || !e.body.trim()) bad.push(`${id}/${lang}: ${JSON.stringify({ ...e, body: undefined })}`)
      }
    }
    check(`W1: every empty state (${empties.length} widgets × 2 languages) is an icon, a sentence and exactly one action`, bad.length === 0, bad)
    check('W2: an empty widget never shows a bare zero', !/>0</.test(render(createElement(RankDistribution, { t: en, rankings: oneUnchecked, language: 'en' }))))

    // Hero.
    const heroHe = render(createElement(HeroCard, { t: he, language: 'he', domain: 'bloom.example', rankings: ranked, news: null, seedPhase: 'stage_b', next: { href: '/content/topics', label: he.actions.writeFirstArticle, commit: true, note: he.actions.articleQuota } }), 'he')
    check('W3: the opening card: one big number and its sentence', heroHe.includes('data-dashboard-widget="hero"') && heroHe.includes(he.hero.firstPage(1, 2)))
    check('W4: an action that costs quota is amber, and says so', /class="[^"]*bg-commit[^"]*" href="\/content\/topics">כתוב את המאמר הראשון</.test(heroHe) && heroHe.includes(he.actions.articleQuota))
    check('W5: while stage B runs, the card says the research is running', heroHe.includes('data-scan-line="stage_b"') && heroHe.includes(he.hero.scanRunning))
    const heroNone = render(createElement(HeroCard, { t: en, language: 'en', domain: 'bloom.example', rankings: noKeywords, news: null, seedPhase: null, next: { href: '/keyword-research', label: en.actions.addKeywords, commit: false, note: null } }))
    check('W6: no keywords: an honest sentence and an indigo "add keywords", no scan line', heroNone.includes(en.hero.noKeywords) && /bg-action/.test(heroNone) && !heroNone.includes('data-scan-line'))

    // Holding back.
    const lockedHtml = render(createElement(HoldingBack, { t: en, model: holdingBack(run('locked'), 'en'), scannedLabel: null, settingsHref: '/settings' }))
    const states = [...lockedHtml.matchAll(/data-geo-state="([a-zA-Z]+)"/g)].map((m) => m[1])
    check('W7: a locked store renders four "not checked", no failure', states.length === 4 && states.every((s) => s === 'notChecked') && !lockedHtml.includes(en.holdingBack.checkState.fail), states)
    const readyHtml = render(createElement(HoldingBack, { t: en, model: holdingBack(run('seeded'), 'en'), scannedLabel: 'Scanned 1 hour ago', settingsHref: '/settings' }))
    check('W8: seeded: findings with a severity and "why it matters", and the four checks with theirs',
      (readyHtml.match(/data-finding=/g) ?? []).length === 2 && (readyHtml.match(/data-geo-check=/g) ?? []).length === 4
      && GEO_CHECK_IDS.every((id) => readyHtml.includes(en.holdingBack.geo[id].why.replace(/'/g, '&#x27;'))) && readyHtml.includes(en.holdingBack.severity.blocker))
    const failedHtml = render(createElement(HoldingBack, { t: en, model: { state: 'failed' }, scannedLabel: null, settingsHref: '/settings' }))
    check('W9: a failed scan shows no code and no provider text', !/site_unreachable|error|Error/.test(text(failedHtml)))

    // Activity during stage B.
    const s = seedFeed(run('stage_b_running'))
    const actHtml = render(createElement(RecentActivity, { t: en, model: { state: 'ready', items: mergeFeed([], s.lines), pending: s.pending }, now: NOW, language: 'en', emptyHref: '/k' }))
    const order = [...actHtml.matchAll(/data-activity="([^"]+)"/g)].map((m) => m[1])
    check('W10: while stage B runs, its running step leads the feed, every finished step follows, and the rest are counted',
      order[0] === 'seed:b3:running' && order.includes('seed:b2:done') && order.includes('seed:a1:done') && order[order.length - 1] === 'seed:pending', order)
    check('W11: every line carries its relative time', (actHtml.match(/<time /g) ?? []).length === 7 && actHtml.includes('2 minutes ago') && actHtml.includes(en.activity.seedDone.b2(140)))

    // One first-article button.
    const articlesWith = render(createElement(RecentArticles, { t: en, language: 'en', section: { state: 'ready', data: { recent: [] } }, retry: () => {}, firstArticleHref: '/content/topics' }))
    const articlesWithout = render(createElement(RecentArticles, { t: en, language: 'en', section: { state: 'ready', data: { recent: [] } }, retry: () => {}, firstArticleHref: null }))
    check('W12: the articles card carries "Write the first article" (amber) only when the opening card does not',
      articlesWith.includes(en.actions.writeFirstArticle) && /bg-commit/.test(articlesWith) && !articlesWithout.includes(en.actions.writeFirstArticle))

    // Account: display only.
    const acc = render(createElement(AccountStatus, { t: en, section: { state: 'ready', data: { plan: 'trial', trialDaysLeft: 4, articles: { used: 3, limit: 10 }, keywords: { used: 2, limit: 50 } } }, retry: () => {} }))
    check('W13: the account card is display only: one link to billing, no button, no form',
      (acc.match(/<a\b/g) ?? []).length === 1 && acc.includes('href="/billing"') && !/<button\b|<form\b/.test(acc) && acc.includes(en.account.trialDays(4)))

    // Competitors from W10.
    const compHtml = render(createElement(CompetitorsWidget, { t: en, model: { state: 'ready', rows: competitorRows([{ domain: 'a.example', name: 'A' }] as never, { standings: [{ domain: 'a.example', ahead: 2, compared: 3 }], cells: {}, comparedKeywords: 3 } as never) }, manageHref: '/ai-visibility?tab=competitors' }))
    check('W14: each competitor with where it ranks against you', compHtml.includes('data-competitor="a.example"') && compHtml.includes(en.competitors.ahead(2, 3)))
    const scanOnly = render(createElement(CompetitorsWidget, { t: en, model: { state: 'scan_only', domains: ['rival.example'] }, manageHref: '/x' }))
    check('W15: with none tracked, the scan\'s validated competitors are shown as found by the scan', scanOnly.includes('rival.example') && scanOnly.includes(en.competitors.fromScan))

    // Setup.
    const setupHtml = render(createElement(SetupCompletion, { t: en, setup: setupTasks({ business: true, platform: false, gsc: false, keywords: true })!, hrefs: setupHrefs('p') }))
    check('W16: the checklist shows its progress and a button on every open task only',
      setupHtml.includes('role="progressbar"') && (setupHtml.match(/data-done="false"/g) ?? []).length === 2 && (setupHtml.match(/<a\b/g) ?? []).length === 2)

    // English has no Hebrew; Hebrew has Hebrew.
    process.env.NEXT_PUBLIC_ENABLE_CONTENT = 'true'
    const all = (t: typeof en, lang: 'he' | 'en') => [
      render(createElement(Shortcuts, { t }), lang),
      render(createElement(HeroCard, { t, language: lang, domain: 'bloom.example', rankings: ranked, news: { kind: 'move', keyword: 'roses', change: 3, position: 4 }, seedPhase: 'stage_a', next: { href: '/k', label: t.actions.connectSite, commit: false, note: null } }), lang),
      render(createElement(RankDistribution, { t, rankings: ranked, language: lang }), lang),
      render(createElement(RankingChanges, { t, direction: 'up', title: t.distribution.title, moves: ranked.improvements }), lang),
      render(createElement(RecentActivity, { t, model: { state: 'ready', items: mergeFeed([{ kind: 'rank_check', at: ago(60), title: null, count: 4 }], s.lines), pending: 3 }, now: NOW, language: lang, emptyHref: '/k' }), lang),
      render(createElement(HoldingBack, { t, model: holdingBack(run('seeded'), lang), scannedLabel: null, settingsHref: '/s' }), lang),
      render(createElement(ContentOpportunities, { t, language: lang, projectId: 'p', items: ranked.pageTwo, canCreateTopics: true }), lang),
      render(createElement(AiVisibilityBrief, { t, language: lang, section: { state: 'ready', data: { score: 60, mentions: 3, citations: 1, answers: 5, change: 10, lastCheckAt: ago(30) } }, retry: () => {}, now: NOW }), lang),
      render(createElement(AccountStatus, { t, section: { state: 'ready', data: { plan: 'regular', trialDaysLeft: null, articles: null, keywords: { used: 2, limit: 50 } } }, retry: () => {} }), lang),
    ].join('\n')
    const enAll = all(en, 'en')
    const heAll = all(he, 'he')
    const leak = enAll.match(/[^<>]*[֐-׿][^<>]*/g)
    check('W17: nine widgets in English carry no Hebrew', !leak, leak?.slice(0, 3))
    check('W18: ...and in Hebrew they are in Hebrew', HEBREW.test(text(heAll)) && !text(heAll).includes('Recent activity'))
    check('W19: the widgets set no direction of their own: the dashboard wrapper sets it for both languages', !/\bdir="rtl"/.test(heAll + enAll))
  }

  // ── D) the copy ─────────────────────────────────────────────────────────
  console.log('\nD) the copy')
  {
    const shape = (v: unknown): unknown => typeof v === 'function' ? `fn/${(v as (...a: unknown[]) => unknown).length}`
      : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, shape((v as Record<string, unknown>)[k])])) : typeof v
    check('D1: dashboardHome has the same keys, and the same function arities, in both languages', JSON.stringify(shape(he)) === JSON.stringify(shape(en)))
    const order = (lang: 'he' | 'en') => Object.keys(getDashboardDictionary(lang))
    const after = (lang: 'he' | 'en') => order(lang)[order(lang).indexOf('home') + 1]
    check('D2: dashboardHome sits directly after home in both files, not at the end', after('he') === 'dashboardHome' && after('en') === 'dashboardHome'
      && order('he').indexOf('dashboardHome') < order('he').length - 1, [after('he'), after('en')])
    const srcOrder = (rel: string) => { const s = code(rel); return s.indexOf('\n  dashboardHome: {') > s.indexOf('\n  home: {') && s.indexOf('\n  dashboardHome: {') < s.indexOf('\n  common: {') }
    check('D3: ...in the source too', srcOrder('lib/i18n/dashboard/he.ts') && srcOrder('lib/i18n/dashboard/en.ts'))
    const values = (v: unknown): string[] => typeof v === 'string' ? [v] : typeof v === 'function' ? [String((v as (...a: unknown[]) => unknown)(1, 2, 3))] : v && typeof v === 'object' ? Object.values(v).flatMap(values) : []
    check('D4: the English copy has no Hebrew', values(en).every((s) => !HEBREW.test(s)), values(en).filter((s) => HEBREW.test(s)).slice(0, 3))
    check('D5: no em dash in the new copy', [...values(en), ...values(he)].every((s) => !s.includes('—')))
  }

  // ── P) the page ─────────────────────────────────────────────────────────
  console.log('\nP) the page')
  {
    const page = strip(code('app/(dashboard)/dashboard/page.tsx'))
    const composed = (src: string) => ['<HeroCard', '<DashboardSetup', '<HoldingBack', '<RecentActivity', '<RankDistribution', '<RankingChanges', '<CompetitorsWidget',
      '<ContentOpportunities', '<PublishingBoard', '<RecentArticles', '<AiVisibilityBrief', '<AccountStatus', '<Shortcuts', '<GscClicksTile', '<GscTopPages'].every((w) => src.includes(w))
    check('P1: the page composes all the widgets', composed(page))
    // A widget appears once it has something to show (lib/dashboard/start.ts); the scan
    // widget also needs a scan run at all.
    const scanGated = (src: string) => /const hold = seed\.kind === 'run' \? holdingBack\(/.test(src)
      && /\bhold: !!hold\b/.test(src)
      && /\{show\.hold && hold && \(\s*<Reveal[^>]*>\s*<HoldingBack/.test(src)
    check('P2: with no scan (switched off, or an older project) the scan widget is not rendered', scanGated(page))
    check('P-MUT: rendering it unconditionally fails P2', !scanGated(page.replace('{show.hold && hold && (', '{(')))
    check('P-MUT: a scan widget shown without a run fails P2', !scanGated(page.replace('hold: !!hold', 'hold: true')))
    // One "Write the first article" button: a new project's is the start card's article
    // step and the hero is not there; later it is the hero's next step. The articles list
    // is shown only once there are articles, and never carries its own.
    const oneButton = (src: string) => /<RecentArticles\b[^>]*\bfirstArticleHref=\{null\}/.test(src)
      && /\{startMode \? \(\s*<StartHere\b[\s\S]*?\) : \(\s*<>\s*<HeroCard\b/.test(src)
    check('P3: one "Write the first article" button on the screen', oneButton(page))
    check('P-MUT: a second one, on the articles list, fails P3', !oneButton(page.replace('firstArticleHref={null}', "firstArticleHref={strategyHref('board')}")))
    check('P-MUT: the hero rendered beside the start card fails P3', !oneButton(page.replace(/\) : \(\s*<>\s*<HeroCard/, ')}\n<><HeroCard')))
    const FORBIDDEN = /google-ads|googleads|serper|openai|anthropic|@ai-sdk|lib\/ai\/|lib\/llm|scrapellm|dataforseo|lib\/seed-scan\/(?!types)|lib\/free-check\/(?!copy)|usage-reservations|reserveUsage/i
    const dir = join(ROOT, 'components/dashboard')
    const files = ['app/(dashboard)/dashboard/page.tsx', 'lib/dashboard/seed.ts', 'lib/dashboard/rankings.ts', 'lib/dashboard/activity.ts', 'lib/dashboard/competitors.ts',
      ...readdirSync(dir).filter((f) => /\.tsx?$/.test(f)).map((f) => `components/dashboard/${f}`)]
    const importsOf = (src: string) => [...strip(src).matchAll(/from\s+'([^']+)'/g)].map((m) => m[1])
    const offending = files.filter((f) => importsOf(code(f)).some((m) => FORBIDDEN.test(m)))
    check(`P4: none of the ${files.length} dashboard files imports a search, keyword-volume, model or quota-writing module`, offending.length === 0, offending)
    check('P-MUT: a Serper import fails P4', importsOf(`import { search } from '@/lib/seed-scan/serper'\n`).some((m) => FORBIDDEN.test(m)))
    /** Each fetch( call: its first argument, and the method its options name (GET when none). */
    const fetches = (f: string) => {
      const src = strip(code(f))
      return [...src.matchAll(/\bfetch\(([^,)]*)/g)].map((m) => {
        const call = src.slice(m.index!, src.indexOf('})', m.index!) + 2)
        return { f, url: m[1].trim(), method: /method:\s*'(\w+)'/.exec(call)?.[1] ?? 'GET' }
      })
    }
    const writes = files.flatMap(fetches).filter((x) => x.method !== 'GET').map((x) => `${x.f}: ${x.url} ${x.method}`)
    check('P5: the one write the dashboard makes is "Create topic" (a free suggestion, through the content route)',
      writes.length === 1 && writes[0].startsWith('components/dashboard/ContentOpportunities.tsx') && writes[0].includes("'/api/content/topics'") && writes[0].endsWith('POST'), writes)
    const external = files.filter((f) => /fetch\(\s*[`'"]https?:/.test(strip(code(f))))
    check('P6: nothing on the dashboard fetches an outside address', external.length === 0, external)
    const hrefs = files.flatMap((f) => [...strip(code(f)).matchAll(/href=\{?[`'"](https?:|\/\/)/g)].map(() => f))
    check('P7: no link on the dashboard leaves the app', hrefs.length === 0, hrefs)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((err) => { console.error(err); process.exit(1) })

export {}
