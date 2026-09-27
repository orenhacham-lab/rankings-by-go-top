/**
 * The stored shape of one monthly report (project_monthly_reports.data).
 *
 * Every figure is an aggregate of data the app already stores; nothing here was
 * fetched from a provider or produced by a model. A section that had nothing to
 * aggregate says WHY (its `state`), so the screen can explain an empty month
 * instead of showing a bare zero.
 */
import type { MonthKey } from './period'

export const MONTHLY_REPORT_VERSION = 1

/** A keyword's move over the month. Positions are 1-100; null = not in the top 100. */
export interface KeywordMove {
  keyword: string
  engine: string
  from: number | null
  to: number | null
  /** Places gained (positive) or lost (negative). Entering/leaving the top 100 counts from 101. */
  change: number
}

export interface RankingsSection {
  /** no_keywords: nothing tracked. no_checks: tracked, but not checked this month. */
  state: 'ready' | 'no_keywords' | 'no_checks'
  tracked: number
  checkedInMonth: number
  /** Keywords in positions 1-10 at the month's last check. */
  firstPageEnd: number
  /** The same, at the check before the month began; null when no keyword had one. */
  firstPageStart: number | null
  avgPositionEnd: number | null
  avgPositionStart: number | null
  improvedCount: number
  droppedCount: number
  /** Keywords with a baseline and an end check whose position did not change. */
  steadyCount: number
  improved: KeywordMove[]
  dropped: KeywordMove[]
}

export interface PublishedArticle {
  title: string
  url: string | null
  publishedAt: string
  channel: 'wordpress' | 'shopify' | 'other'
}

export interface ArticlesSection {
  state: 'ready' | 'none'
  published: number
  items: PublishedArticle[]
}

export interface AiSection {
  /** no_checks: no AI visibility check ran this month. */
  state: 'ready' | 'no_checks'
  answers: number
  mentions: number
  /** Answers that cited the site as a source. */
  citations: number
  /** mentions / answers, 0-100, one decimal. */
  mentionRate: number | null
}

export interface GscWindow {
  clicks: number
  impressions: number
  startDate: string
  endDate: string
}

export interface GscSection {
  /** not_connected: no Search Console property for the project. no_data: connected, no sync covering the month. */
  state: 'ready' | 'not_connected' | 'no_data'
  current: GscWindow | null
  previous: GscWindow | null
}

export interface PlannedItem {
  title: string
  at: string | null
}

export interface PlanSection {
  /** empty: no scheduled article, approved topic, queued item or pending idea. */
  state: 'ready' | 'empty'
  /** The month the plan looks at (the one after the report's month). */
  month: MonthKey
  scheduled: PlannedItem[]
  scheduledCount: number
  queuedCount: number
  readyCount: number
  approvedTopics: PlannedItem[]
  approvedCount: number
  ideas: PlannedItem[]
  ideasCount: number
}

export interface MonthlyReportData {
  v: typeof MONTHLY_REPORT_VERSION
  month: MonthKey
  /** Set when the project was created during the month: the report covers from then. */
  coversFrom: string | null
  rankings: RankingsSection
  articles: ArticlesSection
  ai: AiSection
  gsc: GscSection
  plan: PlanSection
}

/** What the list of months shows without opening a report. */
export interface MonthlyReportSummary {
  month: MonthKey
  generatedAt: string
  generatedBy: 'cron' | 'owner'
  firstPageEnd: number
  improvedCount: number
  droppedCount: number
  published: number
  clicks: number | null
}

export function summarize(month: MonthKey, generatedAt: string, generatedBy: 'cron' | 'owner', data: MonthlyReportData): MonthlyReportSummary {
  return {
    month,
    generatedAt,
    generatedBy,
    firstPageEnd: data.rankings.firstPageEnd,
    improvedCount: data.rankings.improvedCount,
    droppedCount: data.rankings.droppedCount,
    published: data.articles.published,
    clicks: data.gsc.state === 'ready' && data.gsc.current ? data.gsc.current.clicks : null,
  }
}
