/**
 * One month of a project, summed up. PURE: the loader (store.ts) reads the rows,
 * every read filtered by the project and its owner, and hands them here; this
 * file only counts. It calls nothing, so the same rows always give the same report.
 *
 * The definitions follow the rest of the app:
 *   - a position is one the scanner stands behind: found, and 1-100
 *     (lib/dashboard/rankings.ts); anything else is "not in the top 100";
 *   - a keyword's month runs from its BASELINE (its last check before the month
 *     began, or, for a keyword first checked during the month, its first check in
 *     it) to its last check in the month. A keyword checked once has no move;
 *   - an article counts in the month its own channel published it
 *     (WordPress: status + published_at; Shopify: shopify_status +
 *     shopify_published_at, never a bare remote id; see
 *     lib/content/automation/load-active-alerts.ts);
 *   - AI answers are the successful checks that were not archived
 *     (excluded_from_score), as in the Reports screen's AI report;
 *   - Search Console figures are the stored 28-day sync whose window ends inside
 *     the month, labelled with its own dates. It is not re-cut to the calendar
 *     month, because that would need a new request to Google.
 */
import { monthRange, shiftMonth, type MonthKey } from './period'
import {
  MONTHLY_REPORT_VERSION,
  type AiSection, type ArticlesSection, type GscSection, type GscWindow, type KeywordMove,
  type MonthlyReportData, type PlanSection, type PlannedItem, type PublishedArticle, type RankingsSection,
} from './types'

export const MOVES_KEPT = 10
export const ARTICLES_KEPT = 30
export const PLAN_ITEMS_KEPT = 6
const OUTSIDE_TOP_100 = 101

export interface TargetRow { id: string; keyword: string; engine_type: string | null; is_active: boolean | null }
export interface CheckRow { tracking_target_id: string; position: number | null; found: boolean | null; checked_at: string }
export interface ArticleRow {
  id: string
  title: string | null
  status: string | null
  published_at: string | null
  shopify_status: string | null
  shopify_published_at: string | null
  wp_post_url: string | null
  shopify_article_url: string | null
}
export interface AiRow { mentioned: boolean | null; target_cited: boolean | null }
export interface GscRunRow {
  start_date: string | null
  end_date: string | null
  total_clicks: number | string | null
  total_impressions: number | string | null
  summary_total_clicks?: number | string | null
  summary_total_impressions?: number | string | null
}

export interface MonthInputs {
  month: MonthKey
  projectCreatedAt: string | null
  targets: TargetRow[]
  checks: CheckRow[]
  articles: ArticleRow[]
  ai: AiRow[]
  gsc: { connected: boolean; current: GscRunRow | null; previous: GscRunRow | null }
  plan: {
    scheduled: { title: string | null; scheduled_at: string | null }[]
    queuedCount: number
    readyCount: number
    approvedTopics: { topic: string | null; created_at: string | null }[]
    approvedCount: number
    ideas: { title: string | null; score: number | string | null }[]
    ideasCount: number
  }
}

const text = (v: unknown, max = 200): string | null => {
  if (typeof v !== 'string') return null
  const t = v.replace(/\s+/g, ' ').trim()
  return t ? t.slice(0, max) : null
}
const num = (v: unknown): number | null => {
  const n = typeof v === 'string' ? Number(v) : v
  return typeof n === 'number' && Number.isFinite(n) ? n : null
}
const time = (v: string | null | undefined): number | null => {
  if (!v) return null
  const t = Date.parse(v)
  return Number.isFinite(t) ? t : null
}
const round1 = (n: number) => Math.round(n * 10) / 10
const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null)
const httpUrl = (v: unknown): string | null => {
  const s = text(v, 2048)
  return s && /^https?:\/\//i.test(s) ? s : null
}

/** A position the scanner stands behind: found, and 1-100. */
export function rankedPosition(r: Pick<CheckRow, 'position' | 'found'>): number | null {
  if (r.found === false || r.position === null || !Number.isFinite(r.position)) return null
  return r.position >= 1 && r.position <= 100 ? r.position : null
}

export function aggregateRankings(month: MonthKey, targets: TargetRow[], checks: CheckRow[]): RankingsSection {
  const { start, end } = monthRange(month)
  const s = start.getTime(), e = end.getTime()
  const active = targets.filter((t) => t.is_active !== false)
  const byTarget = new Map<string, { t: number; r: CheckRow }[]>()
  for (const t of active) byTarget.set(t.id, [])
  for (const r of checks) {
    const list = byTarget.get(r.tracking_target_id)
    const t = time(r.checked_at)
    if (list && t !== null && t < e) list.push({ t, r })
  }

  let checkedInMonth = 0
  const endPositions: (number | null)[] = []
  const basePositions: (number | null)[] = []
  const moves: KeywordMove[] = []
  let steady = 0

  for (const target of active) {
    const list = (byTarget.get(target.id) ?? []).sort((a, b) => a.t - b.t)
    const before = list.filter((c) => c.t < s)
    const inMonth = list.filter((c) => c.t >= s)
    if (inMonth.length === 0) continue
    checkedInMonth++
    const last = inMonth[inMonth.length - 1]
    const to = rankedPosition(last.r)
    endPositions.push(to)
    const baseline = before.length ? before[before.length - 1] : inMonth.length > 1 ? inMonth[0] : null
    if (!baseline) continue
    const from = rankedPosition(baseline.r)
    basePositions.push(from)
    const change = (from ?? OUTSIDE_TOP_100) - (to ?? OUTSIDE_TOP_100)
    if (change === 0) { steady++; continue }
    moves.push({ keyword: text(target.keyword) ?? '', engine: target.engine_type ?? 'google_search', from, to, change })
  }

  const byKeyword = (a: KeywordMove, b: KeywordMove) => (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0)
  const improved = moves.filter((m) => m.change > 0).sort((a, b) => b.change - a.change || byKeyword(a, b))
  const dropped = moves.filter((m) => m.change < 0).sort((a, b) => a.change - b.change || byKeyword(a, b))
  const rankedEnd = endPositions.filter((p): p is number => p !== null)
  const rankedBase = basePositions.filter((p): p is number => p !== null)
  const avgEnd = mean(rankedEnd), avgBase = mean(rankedBase)

  return {
    state: active.length === 0 ? 'no_keywords' : checkedInMonth === 0 ? 'no_checks' : 'ready',
    tracked: active.length,
    checkedInMonth,
    firstPageEnd: rankedEnd.filter((p) => p <= 10).length,
    firstPageStart: basePositions.length ? rankedBase.filter((p) => p <= 10).length : null,
    avgPositionEnd: avgEnd === null ? null : round1(avgEnd),
    avgPositionStart: avgBase === null ? null : round1(avgBase),
    improvedCount: improved.length,
    droppedCount: dropped.length,
    steadyCount: steady,
    improved: improved.slice(0, MOVES_KEPT),
    dropped: dropped.slice(0, MOVES_KEPT),
  }
}

export function aggregateArticles(month: MonthKey, rows: ArticleRow[]): ArticlesSection {
  const { start, end } = monthRange(month)
  const inMonth = (v: string | null) => {
    const t = time(v)
    return t !== null && t >= start.getTime() && t < end.getTime() ? t : null
  }
  const seen = new Set<string>()
  const items: (PublishedArticle & { t: number })[] = []
  for (const r of rows) {
    if (seen.has(r.id)) continue
    const wp = r.status === 'published' ? inMonth(r.published_at) : null
    const shop = r.shopify_status === 'published' ? inMonth(r.shopify_published_at) : null
    if (wp === null && shop === null) continue
    seen.add(r.id)
    const t = Math.min(...[wp, shop].filter((x): x is number => x !== null))
    const wpUrl = httpUrl(r.wp_post_url), shopUrl = httpUrl(r.shopify_article_url)
    items.push({
      t,
      title: text(r.title) ?? '',
      url: shop !== null && wp === null ? shopUrl ?? wpUrl : wpUrl ?? shopUrl,
      publishedAt: new Date(t).toISOString(),
      channel: wp !== null && wpUrl ? 'wordpress' : shop !== null ? 'shopify' : 'other',
    })
  }
  items.sort((a, b) => a.t - b.t || (a.title < b.title ? -1 : 1))
  return {
    state: items.length ? 'ready' : 'none',
    published: items.length,
    items: items.slice(0, ARTICLES_KEPT).map((a) => ({ title: a.title, url: a.url, publishedAt: a.publishedAt, channel: a.channel })),
  }
}

export function aggregateAi(rows: AiRow[]): AiSection {
  const answers = rows.length
  const mentions = rows.filter((r) => r.mentioned === true).length
  const citations = rows.filter((r) => r.target_cited === true).length
  return {
    state: answers ? 'ready' : 'no_checks',
    answers,
    mentions,
    citations,
    mentionRate: answers ? round1((mentions / answers) * 100) : null,
  }
}

function gscWindow(run: GscRunRow | null): GscWindow | null {
  if (!run || !run.start_date || !run.end_date) return null
  const clicks = num(run.summary_total_clicks) ?? num(run.total_clicks)
  const impressions = num(run.summary_total_impressions) ?? num(run.total_impressions)
  if (clicks === null || impressions === null) return null
  return { clicks: Math.round(clicks), impressions: Math.round(impressions), startDate: run.start_date.slice(0, 10), endDate: run.end_date.slice(0, 10) }
}

export function aggregateGsc(input: MonthInputs['gsc']): GscSection {
  if (!input.connected) return { state: 'not_connected', current: null, previous: null }
  const current = gscWindow(input.current)
  if (!current) return { state: 'no_data', current: null, previous: null }
  return { state: 'ready', current, previous: gscWindow(input.previous) }
}

export function aggregatePlan(month: MonthKey, input: MonthInputs['plan']): PlanSection {
  const items = <T,>(rows: T[], title: (r: T) => unknown, at: (r: T) => string | null): PlannedItem[] =>
    rows.flatMap((r) => {
      const t = text(title(r))
      return t ? [{ title: t, at: at(r) }] : []
    })
  const scheduled = items(input.scheduled, (r) => r.title, (r) => (time(r.scheduled_at) !== null ? r.scheduled_at : null))
    .sort((a, b) => (time(a.at) ?? 0) - (time(b.at) ?? 0))
  const approved = items(input.approvedTopics, (r) => r.topic, () => null)
  const ideas = [...input.ideas]
    .sort((a, b) => (num(b.score) ?? -1) - (num(a.score) ?? -1))
  const ideaItems = items(ideas, (r) => r.title, () => null)
  const scheduledCount = scheduled.length
  const empty = scheduledCount + input.queuedCount + input.readyCount + input.approvedCount + input.ideasCount === 0
  return {
    state: empty ? 'empty' : 'ready',
    month: shiftMonth(month, 1),
    scheduled: scheduled.slice(0, PLAN_ITEMS_KEPT),
    scheduledCount,
    queuedCount: input.queuedCount,
    readyCount: input.readyCount,
    approvedTopics: approved.slice(0, PLAN_ITEMS_KEPT),
    approvedCount: input.approvedCount,
    ideas: ideaItems.slice(0, PLAN_ITEMS_KEPT),
    ideasCount: input.ideasCount,
  }
}

export function aggregateMonth(input: MonthInputs): MonthlyReportData {
  const { start, end } = monthRange(input.month)
  const created = time(input.projectCreatedAt)
  return {
    v: MONTHLY_REPORT_VERSION,
    month: input.month,
    coversFrom: created !== null && created > start.getTime() && created < end.getTime() ? new Date(created).toISOString() : null,
    rankings: aggregateRankings(input.month, input.targets, input.checks),
    articles: aggregateArticles(input.month, input.articles),
    ai: aggregateAi(input.ai),
    gsc: aggregateGsc(input.gsc),
    plan: aggregatePlan(input.month, input.plan),
  }
}
