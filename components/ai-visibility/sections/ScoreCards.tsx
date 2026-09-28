'use client'

import { ENGINE_META } from '../EngineIcon'
import { SCORED_ENGINES as SUPPORTED_ENGINES } from '@/lib/ai-visibility/score'
import type { EngineMetrics, GlobalMetrics, T } from './types'

export function AIVisibilityScoreCard({
  score,
  t,
  isRTL,
}: {
  score: number
  t: T
  isRTL: boolean
}) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score || 0)))
  const level = safeScore <= 30 ? 'low' : safeScore <= 70 ? 'medium' : 'high'
  const badgeText = level === 'low' ? t('score_low') : level === 'medium' ? t('score_medium') : t('score_high')
  const badgeClass =
    level === 'low'
      ? 'bg-orange-50 text-orange-700 border-orange-200 dark:bg-orange-900/20 dark:text-orange-300 dark:border-orange-800'
      : level === 'medium'
      ? 'bg-yellow-50 text-yellow-700 border-yellow-200 dark:bg-yellow-900/20 dark:text-yellow-300 dark:border-yellow-800'
      : 'bg-emerald-50 text-emerald-700 border-emerald-200 dark:bg-emerald-900/20 dark:text-emerald-300 dark:border-emerald-800'
  const scoreColor =
    level === 'low'
      ? 'text-orange-600 dark:text-orange-400'
      : level === 'medium'
      ? 'text-yellow-600 dark:text-yellow-400'
      : 'text-emerald-600 dark:text-emerald-400'
  const barColor =
    level === 'low'
      ? 'bg-orange-400 dark:bg-orange-500'
      : level === 'medium'
      ? 'bg-yellow-400 dark:bg-yellow-500'
      : 'bg-emerald-400 dark:bg-emerald-500'

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-white to-indigo-50/40 dark:from-slate-900 dark:to-slate-800 p-4 sm:p-5">
      <div className={`flex items-center justify-between gap-4 ${isRTL ? 'flex-row-reverse' : ''}`}>
        <div className={`flex-1 min-w-0 ${isRTL ? 'text-right' : 'text-left'}`}>
          <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse' : ''}`}>
            <h3 className="text-sm font-bold uppercase tracking-wider text-slate-700 dark:text-slate-300">
              {t('ai_visibility_score')}
            </h3>
            <span
              className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold border ${badgeClass}`}
              title={t('score_help')}
            >
              {badgeText}
            </span>
          </div>
          <p className="text-xs text-muted mt-1 leading-snug" title={t('score_help')}>
            {t('score_subtext')}
          </p>
        </div>
        <div className="shrink-0" dir="ltr">
          <span className={`text-3xl sm:text-4xl font-bold tabular-nums ${scoreColor}`}>{safeScore}</span>
          <span className="text-sm sm:text-base font-semibold text-muted ml-0.5">/100</span>
        </div>
      </div>
      {/* Progress bar */}
      <div className="mt-3 w-full h-1.5 rounded-full bg-slate-100 dark:bg-slate-800 overflow-hidden" dir="ltr">
        <div
          className={`h-full ${barColor} transition-all`}
          style={{ width: `${safeScore}%` }}
        />
      </div>
    </div>
  )
}

export function OverviewSummaryStrip({
  metrics,
  totalResults,
  t,
}: {
  metrics: GlobalMetrics
  totalResults: number
  t: T
}) {
  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-gradient-to-r from-indigo-50 to-white dark:from-slate-900 dark:to-slate-800 p-4 sm:p-6">
      <div className="grid grid-cols-3 gap-3 sm:gap-6">
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted mb-1 sm:mb-2 truncate">
            {t('total_mentions')}
          </div>
          <div className="text-2xl sm:text-4xl font-bold text-emerald-700 dark:text-emerald-400">{metrics.totalMentions}</div>
          <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 mt-2">
            {t('out_of_results').replace('{count}', String(totalResults))}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted mb-1 sm:mb-2 truncate" title={t('engines_coverage_help')}>
            {t('engine_coverage')}
          </div>
          <div className="text-2xl sm:text-4xl font-bold text-indigo-700 dark:text-indigo-300">
            {metrics.enginesWithMentions}/{metrics.enginesCovered}
          </div>
          <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 mt-2">
            {t('ai_engines')}
          </div>
        </div>
        <div className="min-w-0">
          <div className="text-[10px] sm:text-xs font-semibold uppercase tracking-wider text-muted mb-1 sm:mb-2 truncate">
            {t('target_cited')}
          </div>
          <div className="text-2xl sm:text-4xl font-bold text-emerald-700 dark:text-emerald-400">{metrics.totalCitations}</div>
          <div className="hidden sm:block text-sm text-slate-600 dark:text-slate-300 mt-2">{t('citations')}</div>
        </div>
      </div>
    </div>
  )
}

export function EngineMentionCards({ metrics, t }: { metrics: Map<string, EngineMetrics>; t: T }) {
  const engineList = SUPPORTED_ENGINES.map(
    (engine) => metrics.get(engine) || { engine, scans: 0, mentions: 0, citations: 0, rate: 0 }
  ).sort((a, b) => b.mentions - a.mentions || b.scans - a.scans)

  return (
    <div>
      <h3 className="text-sm font-bold text-ink mb-4">
        {t('mentions_by_engine')}
      </h3>
      <div className="grid grid-cols-3 md:grid-cols-3 lg:grid-cols-6 gap-2 sm:gap-4">
        {engineList.map((em) => {
          const meta = ENGINE_META[em.engine as keyof typeof ENGINE_META]
          // An engine nobody checked has no number: "not checked yet", never a green 0.
          const checked = em.scans > 0
          return (
            <div
              key={em.engine}
              data-engine-card={checked ? 'checked' : 'not_checked'}
              className="rounded-lg border border-line bg-surface p-2.5 sm:p-4 flex flex-col items-center text-center"
            >
              {meta && <meta.Icon size={32} className={`${meta.accent} mb-2 sm:mb-1 ${checked ? '' : 'opacity-50'}`} />}
              <div className="font-semibold text-ink mt-1 sm:mt-2 text-xs sm:text-sm truncate max-w-full">{meta?.name || em.engine}</div>
              {checked ? (
                <>
                  <div className={`text-xl sm:text-3xl font-bold mt-1 sm:mt-2 ${em.mentions > 0 ? 'text-ok' : 'text-ink'}`}>{em.mentions}</div>
                  <div className="hidden sm:block text-xs text-body mt-2">
                    {t('out_of_results').replace('{count}', String(em.scans))}
                  </div>
                  <div className="text-[10px] sm:text-xs text-muted mt-0.5 sm:mt-1">({em.rate}%)</div>
                </>
              ) : (
                <div className="text-xs text-muted mt-2 sm:mt-3">{t('chip_not_checked')}</div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
