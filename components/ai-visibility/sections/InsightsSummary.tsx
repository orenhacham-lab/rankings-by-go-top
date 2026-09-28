'use client'

import { Sparkles } from 'lucide-react'
import { ENGINE_META } from '../EngineIcon'
import { InsightBullets } from './InsightCard'
import type { ContentSignalKey, GeoOpportunityMapping } from '@/lib/ai-visibility/geo-opportunity-mapping'
import type { EngineMetrics, GlobalMetrics, T } from './types'

/**
 * AI Visibility Summary — top of Insights tab.
 *
 * A compact 3-4 bullet snapshot:
 *   1. Overall visibility status (high / medium / low / insufficient)
 *   2. Strongest engines (success rate >= 60%)
 *   3. Weakest engines (success rate <= 25%) — only if clearly weak
 *   4. Single recommended action (deterministic, derived from
 *      GeoOpportunityMapping signals)
 *
 * Deterministic. No AI calls. No DB / API changes.
 */
export function AIVisibilitySummarySection({
  metrics,
  engineMetrics,
  mapping,
  isHebrew,
  t,
}: {
  metrics: GlobalMetrics
  engineMetrics: Map<string, EngineMetrics>
  mapping: GeoOpportunityMapping | null
  isHebrew: boolean
  t: T
}) {
  const engineDisplayName = (engine: string): string =>
    ENGINE_META[engine as keyof typeof ENGINE_META]?.name || engine

  // Hebrew & English list joiners — "X, Y ו־Z" / "X, Y and Z".
  const joinNames = (names: string[]): string => {
    if (names.length === 0) return ''
    if (names.length === 1) return names[0]
    const and = isHebrew ? 'ו־' : 'and '
    if (names.length === 2) {
      return isHebrew ? `${names[0]} ${and}${names[1]}` : `${names[0]} ${and}${names[1]}`
    }
    const head = names.slice(0, -1).join(', ')
    const last = names[names.length - 1]
    return isHebrew ? `${head} ${and}${last}` : `${head} ${and}${last}`
  }

  // Map a content signal to its short action sentence.
  const actionForSignal = (signal: ContentSignalKey): string => {
    switch (signal) {
      case 'reviews': return t('ai_summary_action_reviews')
      case 'comparison': return t('ai_summary_action_comparison')
      case 'pricing': return t('ai_summary_action_pricing')
      case 'list': return t('ai_summary_action_list')
      case 'local': return t('ai_summary_action_local')
      case 'recommendation': return t('ai_summary_action_recommendation')
    }
  }

  // Pick a single recommended action. Prioritize missing signals
  // (failureRate >= 50%) over merely weak signals. Falls back to a
  // generic suggestion when no clear opportunity is detectable.
  const pickAction = (): string => {
    if (mapping) {
      const missing = mapping.missingOpportunities
        .filter((m) => m.category === 'content' && m.failureRate >= 50)
        .sort((a, b) => b.failureRate - a.failureRate)
      if (missing.length > 0) {
        return actionForSignal(missing[0].signal as ContentSignalKey)
      }
      const weak = [...mapping.contentSignals]
        .filter((s) => s.visibilityRate < 60)
        .sort((a, b) => a.visibilityRate - b.visibilityRate)
      if (weak.length > 0) {
        return actionForSignal(weak[0].signal)
      }
    }
    return t('ai_summary_action_fallback')
  }

  type Bullet = { text: string; isFirst?: boolean; isAction?: boolean }
  const bullets: Bullet[] = []

  // Insufficient data short-circuit — show only status + fallback action.
  if (metrics.totalScans < 3) {
    bullets.push({ text: t('ai_summary_status_insufficient'), isFirst: true })
    bullets.push({
      text: t('ai_summary_action_label') + t('ai_summary_action_fallback'),
      isAction: true,
    })
  } else {
    // 1. Overall status bullet
    const score = metrics.mentionRate || 0
    let statusText: string
    if (score >= 70) statusText = t('ai_summary_status_high')
    else if (score >= 40) statusText = t('ai_summary_status_medium')
    else statusText = t('ai_summary_status_low')
    bullets.push({ text: statusText, isFirst: true })

    // 2. Strong engines (rate >= 60% AND at least 2 scans on that engine)
    // Phrasing depends on overall visibility to avoid contradiction:
    // If overall score < 40%, use moderate phrasing; otherwise, "strong visibility" is appropriate.
    const strong = Array.from(engineMetrics.values())
      .filter((em) => em.scans >= 2 && em.rate >= 60)
      .sort((a, b) => b.rate - a.rate)
      .slice(0, 3)
      .map((em) => engineDisplayName(em.engine))
    if (strong.length > 0) {
      const score = metrics.mentionRate || 0
      const text = (score < 40 ? t('ai_summary_strong_low') : t('ai_summary_strong_high'))
        .replace('{names}', joinNames(strong))
      bullets.push({ text })
    }

    // 3. Weak engines (rate <= 25% AND at least 2 scans on that engine)
    const weakEngines = Array.from(engineMetrics.values())
      .filter((em) => em.scans >= 2 && em.rate <= 25)
      .sort((a, b) => a.rate - b.rate)
      .slice(0, 2)
      .map((em) => engineDisplayName(em.engine))
    if (weakEngines.length > 0) {
      const text = t('ai_summary_weak').replace('{names}', joinNames(weakEngines))
      bullets.push({ text })
    }

    // 4. Recommended action — marked as action for visual emphasis
    bullets.push({ text: t('ai_summary_action_label') + pickAction(), isAction: true })
  }

  const lines = bullets.filter((b) => !b.isAction)
  const action = bullets.find((b) => b.isAction)

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden="true" className="flex size-10 shrink-0 items-center justify-center rounded-inset bg-action-soft text-action">
          <Sparkles className="size-5" />
        </span>
        <div className="min-w-0">
          <h3 className="text-section font-semibold text-ink">{t('ai_summary_title')}</h3>
          <p className="mt-0.5 text-caption text-muted">{t('ai_summary_subtitle')}</p>
        </div>
      </div>
      <InsightBullets lines={lines} t={t} />
      {action && (
        <p className="mt-4 border-t border-line pt-4 text-copy font-medium text-ink">{action.text}</p>
      )}
    </section>
  )
}
