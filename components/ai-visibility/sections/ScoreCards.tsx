'use client'

import { ENGINE_META } from '../EngineIcon'
import { SCORED_ENGINES as SUPPORTED_ENGINES } from '@/lib/ai-visibility/score'
import Badge from '@/components/ui/Badge'
import StatTile from '@/components/ui/StatTile'
import type { EngineMetrics, GlobalMetrics, T } from './types'

/** "out of N answers"; one answer reads "out of 1 answer", never "1 out of 1 answers". */
export const outOf = (t: T, n: number): string => (n === 1 ? t('out_of_one_result') : t('out_of_results').replace('{count}', String(n)))

/** The bare tool's own score card (a caller without the page's overview). */
export function AIVisibilityScoreCard({
  score,
  t,
}: {
  score: number
  t: T
  isRTL: boolean
}) {
  const safeScore = Math.max(0, Math.min(100, Math.round(score || 0)))
  const level = safeScore <= 30 ? 'low' : safeScore <= 70 ? 'medium' : 'high'
  const badgeText = level === 'low' ? t('score_low') : level === 'medium' ? t('score_medium') : t('score_high')

  return (
    <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="flex items-center justify-between gap-4">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-section font-semibold text-ink">{t('ai_visibility_score')}</h3>
            <Badge variant={level === 'high' ? 'success' : 'warning'}>{badgeText}</Badge>
          </div>
          <p className="mt-1 text-caption text-muted" title={t('score_help')}>{t('score_subtext')}</p>
        </div>
        <p className="shrink-0" dir="ltr">
          <span className="text-metric font-bold tabular-nums text-ink">{safeScore}</span>
          <span className="ms-0.5 text-copy font-semibold text-muted">/100</span>
        </p>
      </div>
      <div className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-sunk" dir="ltr">
        <div className="h-full rounded-pill bg-action" style={{ width: `${safeScore}%` }} />
      </div>
    </div>
  )
}

/** The bare tool's totals (a caller without the page's overview). */
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
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3 sm:gap-5">
      <StatTile label={t('total_mentions')} value={metrics.totalMentions} source={outOf(t, totalResults)} />
      <StatTile label={t('engine_coverage')} value={`${metrics.enginesWithMentions}/${metrics.enginesCovered}`} source={t('ai_engines')} />
      <StatTile label={t('target_cited')} value={metrics.totalCitations} source={t('citations')} />
    </div>
  )
}

export function EngineMentionCards({ metrics, t }: { metrics: Map<string, EngineMetrics>; t: T }) {
  const engineList = SUPPORTED_ENGINES.map(
    (engine) => metrics.get(engine) || { engine, scans: 0, mentions: 0, citations: 0, rate: 0 }
  ).sort((a, b) => b.mentions - a.mentions || b.scans - a.scans)

  return (
    <section aria-labelledby="ai-engine-cards-title">
      <h3 id="ai-engine-cards-title" className="mb-4 text-section font-semibold text-ink">
        {t('mentions_by_engine')}
      </h3>
      <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 sm:gap-4 lg:grid-cols-6">
        {engineList.map((em) => {
          const meta = ENGINE_META[em.engine as keyof typeof ENGINE_META]
          // An engine nobody checked has no number: "not checked yet", never a green 0.
          const checked = em.scans > 0
          return (
            <li
              key={em.engine}
              data-engine-card={checked ? 'checked' : 'not_checked'}
              className="flex min-w-0 flex-col rounded-card border border-line bg-surface p-4 shadow-card"
            >
              <div className="flex min-w-0 items-center gap-2">
                {meta && <meta.Icon size={20} className={checked ? '' : 'opacity-50 grayscale'} />}
                <span className="truncate text-copy font-semibold text-ink">{meta?.name || em.engine}</span>
              </div>
              {checked ? (
                <>
                  <p className="mt-3 text-metric font-bold tabular-nums text-ink">{em.mentions}</p>
                  <p className="mt-0.5 text-caption text-muted">
                    {outOf(t, em.scans)} · <span className="tabular-nums">{em.rate}%</span>
                  </p>
                </>
              ) : (
                <p className="mt-3 text-caption text-muted">{t('chip_not_checked')}</p>
              )}
            </li>
          )
        })}
      </ul>
    </section>
  )
}
