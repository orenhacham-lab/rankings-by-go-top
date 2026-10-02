'use client'

/**
 * CompetitorAnalysisPanel — Phase 2 of AI Visibility.
 *
 * Analyzes existing AI scan results to show:
 * - How many times each competitor is mentioned
 * - Comparison with project/business mentions
 * - Breakdown by engine
 * - Mention percentages
 *
 * No new API calls to AI services — only analyzes saved scan results.
 */

import SiteAvatar from '@/components/ui/SiteAvatar'
import Badge from '@/components/ui/Badge'
import EmptyState from '@/components/ui/EmptyState'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrendingUp, ChevronDown, BarChart3 } from 'lucide-react'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { ENGINE_META } from './EngineIcon'

const SMALL_SAMPLE_THRESHOLD = 5

/**
 * Format an engine key (eg. 'google_ai_mode', 'chatgpt') into a friendly
 * display name (eg. 'Google AI', 'ChatGPT'). Falls back to a title-cased
 * version of the key when the engine isn't in ENGINE_META.
 */
function formatEngineLabel(engineKey: string): string {
  const normalized = engineKey.toLowerCase()
  // google_ai_overview is an alias for google_ai_mode
  const lookupKey = normalized === 'google_ai_overview' ? 'google_ai_mode' : normalized
  const meta = ENGINE_META[lookupKey]
  if (meta?.name) return meta.name
  return engineKey.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase())
}

type EngineStats = {
  mentions: number
  total: number
  rate: number
}

type CompetitorData = {
  id: string
  name: string
  domain: string | null
  aliases: string[]
  mentionsCount: number
  totalResults: number
  mentionRate: number
  matchedAliases?: string[]
  byEngine: Record<string, EngineStats>
}

type ProjectData = {
  name: string | null
  domain?: string | null
  mentionsCount: number
  totalResults: number
  mentionRate: number
  byEngine: Record<string, EngineStats>
}

type ShareOfVoiceEntity = {
  type: 'project' | 'competitor'
  competitorId?: string
  name: string
  mentionsCount: number
  sharePercent: number
}

type ShareOfVoice = {
  totalMentions: number
  entities: ShareOfVoiceEntity[]
}

type AnalysisResponse = {
  success: boolean
  project: ProjectData | null
  competitors: CompetitorData[]
  shareOfVoice?: ShareOfVoice
  meta: {
    emptyState?: string
    scanRunId?: string
    scanCompletedAt?: string
    enginesCount?: number
    resultsCount?: number
    engines?: string[]
  }
}

export default function CompetitorAnalysisPanel({ projectId, refreshKey = 0 }: { projectId: string; refreshKey?: number }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => createI18n(language), [language])

  const [data, setData] = useState<AnalysisResponse | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [expandedEngines, setExpandedEngines] = useState<Record<string, boolean>>({})

  const load = useCallback(async () => {
    setLoading(true)
    setError(null)
    try {
      const res = await fetch(`/api/projects/${projectId}/ai-visibility/competitor-analysis`)
      if (!res.ok) {
        // The route's own text is not the merchant's to read; ours is.
        setError(t('competitor_analysis_failed'))
        setData(null)
        return
      }
      const body = (await res.json()) as AnalysisResponse
      setData(body)
    } catch {
      setError(t('competitor_analysis_failed'))
      setData(null)
    } finally {
      setLoading(false)
    }
  }, [projectId, t])

  useEffect(() => {
    load()
  }, [load, refreshKey])

  // Loading, failure and the empty cases each say one thing, in our words.
  if (loading) {
    return (
      <div role="status" aria-busy="true" className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6" data-skeleton="">
        <span className="sr-only">{t('competitor_analysis_loading')}</span>
        <Skeleton className="h-5 w-1/2" />
        {[0, 1, 2].map((i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-4 w-1/3" />
            <Skeleton className="h-1.5 w-full rounded-pill" />
          </div>
        ))}
      </div>
    )
  }

  if (error) {
    return <Notice tone="bad" action={{ label: t('retry_check'), onClick: () => void load() }}>{error}</Notice>
  }

  const emptyText =
    !data?.success || data.meta?.emptyState === 'no_competitors' ? t('competitor_analysis_no_competitors')
      : data.meta?.emptyState === 'no_completed_scan' ? t('competitor_analysis_no_scan')
      : !data.project || data.competitors.length === 0 ? t('competitor_analysis_no_mentions')
      : null
  if (emptyText || !data?.project) {
    return (
      <div className="rounded-card border border-line bg-surface shadow-card">
        <EmptyState icon={<BarChart3 />} title={t('competitor_analysis_title')} body={emptyText ?? undefined} />
      </div>
    )
  }

  const toggleEngine = (key: string) => {
    setExpandedEngines((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  // "X of Y answers": each number is AI answers, the same unit on every line.
  const formatResultsText = (mentions: number, total: number): string =>
    t('competitor_results_of').replace('{mentions}', String(mentions)).replace('{total}', String(total))

  const businessDisplayName = data.project.name || t('competitor_your_business')
  const totalResults = data.project.totalResults
  const showSmallSampleWarning = totalResults > 0 && totalResults < SMALL_SAMPLE_THRESHOLD

  const updatedAt = data.meta?.scanCompletedAt
    ? new Date(data.meta.scanCompletedAt).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US')
    : null

  // One row of the comparison: the business first (with the one accent), then each competitor.
  const comparisonRow = (row: {
    key: string
    isProject: boolean
    name: string
    domain: string | null | undefined
    mentions: number
    total: number
    rate: number
    byEngine: Record<string, EngineStats>
  }) => {
    const open = !!expandedEngines[row.key]
    const engines = Object.entries(row.byEngine)
    return (
      <li
        key={row.key}
        className="rounded-inset border border-line p-4"
        data-competitor-row={row.isProject ? 'project' : 'competitor'}
      >
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-center gap-3">
            <SiteAvatar domain={row.domain ?? null} name={row.name} size="md" />
            <div className="min-w-0">
              <div className="flex flex-wrap items-center gap-2">
                <p className="truncate text-copy font-semibold text-ink">{row.name}</p>
                {row.isProject && <Badge variant="info">{t('competitor_your_business')}</Badge>}
              </div>
              <p className="mt-0.5 text-caption text-muted tabular-nums">{formatResultsText(row.mentions, row.total)}</p>
            </div>
          </div>
          <p className="shrink-0 text-end">
            <span className="block text-section font-bold tabular-nums text-ink">{row.rate}%</span>
            <span className="block text-caption text-muted">{t('competitor_visibility')}</span>
          </p>
        </div>
        <div className="mt-3 h-1.5 overflow-hidden rounded-pill bg-sunk">
          <div
            className={`h-full rounded-pill ${row.isProject ? 'bg-action' : 'bg-line-strong'}`}
            style={{ width: `${Math.max(row.rate, row.mentions > 0 ? 2 : 0)}%` }}
          />
        </div>

        {engines.length > 0 && (
          <>
            <button
              type="button"
              onClick={() => toggleEngine(row.key)}
              aria-expanded={open}
              className="mt-3 inline-flex items-center gap-1 rounded-control text-caption font-semibold text-body transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
            >
              {t('competitor_by_engine')}
              <ChevronDown aria-hidden="true" className={`size-4 transition-transform duration-150 ease-snappy ${open ? 'rotate-180' : ''}`} />
            </button>
            {open && (
              <dl className="mt-2 divide-y divide-line border-t border-line">
                {engines.map(([engine, stats]) => (
                  <div key={engine} className="flex items-center justify-between gap-2 py-1.5 text-caption">
                    <dt className="font-medium text-body">{formatEngineLabel(engine)}</dt>
                    <dd className="tabular-nums text-muted">
                      {formatResultsText(stats.mentions, stats.total)} · {stats.rate}%
                    </dd>
                  </div>
                ))}
              </dl>
            )}
          </>
        )}
      </li>
    )
  }

  return (
    <div className="space-y-6">
      {/* One measure, said once: in how many of the checked answers each business was named
          (the same unit as the visibility score above). The old "share of all mentions" card
          re-divided these same counts into slices, so 43% sat beside 100% for one competitor. */}
      {/* Per-business rate: each one against ALL answers, so several can reach 100%. */}
      <section aria-labelledby="ai-comparison-title" className="space-y-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
        <div className="flex items-start gap-3">
          <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
            <TrendingUp className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 id="ai-comparison-title" className="text-section font-semibold text-ink">{t('competitor_analysis_title')}</h3>
            <p className="mt-0.5 text-caption text-muted">{t('competitor_analysis_help')}</p>
          </div>
        </div>

        {showSmallSampleWarning && <Notice tone="warn">{t('competitor_small_sample')}</Notice>}

        <ul className="space-y-3">
          {comparisonRow({
            key: '__project__',
            isProject: true,
            name: businessDisplayName,
            domain: data.project.domain,
            mentions: data.project.mentionsCount,
            total: data.project.totalResults,
            rate: data.project.mentionRate,
            byEngine: data.project.byEngine ?? {},
          })}
          {data.competitors.map((competitor) =>
            comparisonRow({
              key: competitor.id,
              isProject: false,
              name: competitor.name,
              domain: competitor.domain,
              mentions: competitor.mentionsCount,
              total: competitor.totalResults,
              rate: competitor.mentionRate,
              byEngine: competitor.byEngine,
            })
          )}
        </ul>

        {updatedAt && (
          <p className="text-caption text-muted">{t('competitor_updated').replace('{date}', updatedAt)}</p>
        )}
      </section>
    </div>
  )
}
