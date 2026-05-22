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

import { useCallback, useEffect, useMemo, useState } from 'react'
import { TrendingUp, ChevronDown, ChevronUp } from 'lucide-react'
import { createI18n } from '@/lib/ai-visibility/i18n'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'

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
  byEngine: Record<string, EngineStats>
}

type ProjectData = {
  name: string
  mentionsCount: number
  totalResults: number
  mentionRate: number
  byEngine: Record<string, EngineStats>
}

type AnalysisResponse = {
  success: boolean
  project: ProjectData | null
  competitors: CompetitorData[]
  meta: {
    emptyState?: string
    scanRunId?: string
    scanCompletedAt?: string
    enginesCount?: number
    resultsCount?: number
  }
}

export default function CompetitorAnalysisPanel({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t = useMemo(() => createI18n(language), [language])
  const isRTL = language === 'he'

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
        const body = await res.json().catch(() => ({}))
        setError(body.error || t('competitor_analysis_failed'))
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
  }, [load])

  // Empty states
  if (loading) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4">
        <p className="text-sm text-slate-500 dark:text-slate-400">{t('competitor_analysis_loading')}</p>
      </div>
    )
  }

  if (error) {
    return (
      <div className="rounded-lg border border-red-200 dark:border-red-800 bg-red-50 dark:bg-red-900/20 p-4 text-sm text-red-700 dark:text-red-400">
        {error}
      </div>
    )
  }

  if (!data?.success || data.meta?.emptyState === 'no_competitors') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('competitor_analysis_no_competitors')}</p>
      </div>
    )
  }

  if (data.meta?.emptyState === 'no_completed_scan') {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('competitor_analysis_no_scan')}</p>
      </div>
    )
  }

  if (!data.project || data.competitors.length === 0) {
    return (
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/30 p-4">
        <p className="text-sm text-slate-600 dark:text-slate-300">{t('competitor_analysis_no_mentions')}</p>
      </div>
    )
  }

  const toggleEngine = (key: string) => {
    setExpandedEngines((prev) => ({
      ...prev,
      [key]: !prev[key],
    }))
  }

  return (
    <div className="rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 sm:p-5 space-y-4">
      {/* Header */}
      <div className={isRTL ? 'text-right' : 'text-left'}>
        <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
          <TrendingUp size={18} className="text-indigo-600 dark:text-indigo-400" />
          {t('competitor_analysis_title')}
        </h3>
        <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">{t('competitor_analysis_help')}</p>
      </div>

      {/* Project mention card */}
      <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-br from-indigo-50 to-indigo-100/50 dark:from-indigo-900/20 dark:to-indigo-800/10 p-3">
        <div className={`flex items-center justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
          <div className={isRTL ? 'text-right' : 'text-left'}>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{t('competitor_your_business')}</p>
            <p className="text-xs text-slate-600 dark:text-slate-400 mt-0.5">
              {data.project.mentionsCount} {t('competitor_mentions')} / {data.project.totalResults}
            </p>
          </div>
          <div className="text-right">
            <p className="text-2xl font-bold text-indigo-600 dark:text-indigo-400">{data.project.mentionRate}%</p>
            <p className="text-xs text-slate-500 dark:text-slate-400">{t('competitor_visibility')}</p>
          </div>
        </div>
      </div>

      {/* Competitors */}
      <div className="space-y-2">
        {data.competitors.map((competitor) => (
          <div
            key={competitor.id}
            className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900/50 p-3"
          >
            {/* Row */}
            <div className={`flex items-center justify-between gap-3 ${isRTL ? 'flex-row-reverse' : ''}`}>
              <div className={`flex-1 ${isRTL ? 'text-right' : 'text-left'}`}>
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{competitor.name}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
                  {competitor.mentionsCount} {t('competitor_mentions')} / {competitor.totalResults}
                </p>
              </div>
              <div className="text-right">
                <p className="text-lg font-bold text-slate-900 dark:text-slate-100">{competitor.mentionRate}%</p>
              </div>
            </div>

            {/* Breakdown by engine */}
            {Object.keys(competitor.byEngine).length > 0 && (
              <button
                onClick={() => toggleEngine(competitor.id)}
                className={`mt-2 w-full flex items-center justify-between gap-2 px-2 py-1.5 rounded-md text-xs font-medium text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800/50 transition ${
                  isRTL ? 'flex-row-reverse' : ''
                }`}
              >
                <span>{t('competitor_by_engine')}</span>
                {expandedEngines[competitor.id] ? (
                  <ChevronUp size={14} />
                ) : (
                  <ChevronDown size={14} />
                )}
              </button>
            )}

            {/* Engine details (collapsed by default) */}
            {expandedEngines[competitor.id] && (
              <div className="mt-2 space-y-1 pt-2 border-t border-slate-200 dark:border-slate-700">
                {Object.entries(competitor.byEngine).map(([engine, stats]) => (
                  <div key={engine} className={`flex items-center justify-between gap-2 px-2 py-1 text-xs ${isRTL ? 'flex-row-reverse' : ''}`}>
                    <span className="text-slate-600 dark:text-slate-400 capitalize">{engine}</span>
                    <span className="text-slate-700 dark:text-slate-300 font-medium">
                      {stats.mentions}/{stats.total} ({stats.rate}%)
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Meta info */}
      {data.meta?.scanCompletedAt && (
        <p className={`text-xs text-slate-400 dark:text-slate-500 ${isRTL ? 'text-right' : 'text-left'}`}>
          {new Date(data.meta.scanCompletedAt).toLocaleDateString(language === 'he' ? 'he-IL' : 'en-US')}
        </p>
      )}
    </div>
  )
}
