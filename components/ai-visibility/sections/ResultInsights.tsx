'use client'

import type { GeoInsights, QueryIntent, CitationType } from '@/lib/ai-visibility/geo-signals'
import { generateGeoExplanation } from '@/lib/ai-visibility/geo-explanations'
import { generateGeoRecommendations } from '@/lib/ai-visibility/geo-recommendations'
import { EMPTY_GEO_INSIGHTS, type T } from './types'

/**
 * GEO Explanation — Phase 1B human-readable explanation.
 *
 * Converts raw GEO Insights into 2–4 clear bullets explaining why
 * this result appeared (or didn't) in the AI engine response.
 */
export function GeoExplanationSection({
  geoInsights,
  displayMentioned,
  displayCited,
  displayBrandLabels,
  displayDomainLabel,
  isHebrew,
  t,
}: {
  geoInsights: GeoInsights | null
  displayMentioned: boolean
  displayCited: boolean
  displayBrandLabels: string[]
  displayDomainLabel: string | null
  isHebrew: boolean
  t: T
}) {
  const explanation = generateGeoExplanation({
    geoInsights,
    displayMentioned,
    displayCited,
    displayBrandLabels,
    displayDomainLabel,
    isHebrew,
  })

  if (!explanation.hasSignals || explanation.bullets.length === 0) {
    return null
  }

  return (
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-blue-50 dark:bg-blue-900/20 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {t('geo_explanation_title')}
      </h3>
      <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
        {explanation.bullets.map((bullet, i) => (
          <li key={i} className="flex gap-2">
            <span className="text-muted flex-shrink-0">•</span>
            <span>{bullet}</span>
          </li>
        ))}
      </ul>
    </div>
  )
}

/**
 * GEO Recommendations — Phase 1C "What can be improved?" section.
 *
 * Rule-based, actionable, business-facing suggestions grounded in gaps
 * detected in geoInsights. Shows fallback message when no gaps are
 * detected (positive reinforcement if the business appeared + cited, or
 * generic "no clear gaps" otherwise).
 */
export function GeoRecommendationsSection({
  geoInsights,
  displayMentioned,
  displayCited,
  isHebrew,
  t,
}: {
  geoInsights: GeoInsights | null
  displayMentioned: boolean
  displayCited: boolean
  isHebrew: boolean
  t: T
}) {
  const recs = generateGeoRecommendations({
    geoInsights,
    displayMentioned,
    displayCited,
    isHebrew,
  })

  // Fallback message when no recommendations are generated
  let fallbackText: string | null = null
  if (recs.length === 0) {
    if (displayMentioned && displayCited) {
      // Positive reinforcement: business is appearing well
      fallbackText = isHebrew
        ? 'שמרו על תוכן ברור עם מחירים, ביקורות והמלצות כדי לחזק את הופעתכם בתוצאות דומות.'
        : 'Keep your content clear with pricing, reviews, and recommendations to strengthen your visibility in similar queries.'
    } else {
      // Generic: no clear improvements detected
      fallbackText = isHebrew
        ? 'לא זוהו פעולות שיפור ברורות בתוצאה הזו.'
        : 'No clear improvements were detected in this result.'
    }
  }

  // If no recommendations and no fallback, don't render
  if (recs.length === 0 && !fallbackText) return null

  return (
    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 p-4 space-y-2">
      <h3 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
        {t('geo_recommendations_title')}
      </h3>
      {recs.length > 0 ? (
        <ul className="space-y-2 text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {recs.map((r) => (
            <li key={r.key} className="flex gap-2">
              <span className="text-amber-600 dark:text-amber-400 flex-shrink-0">→</span>
              <span>{r.text}</span>
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-sm text-slate-700 dark:text-slate-300 leading-relaxed">
          {fallbackText}
        </p>
      )}
    </div>
  )
}

/**
 * GEO Insights — Phase 1C collapsible technical details panel.
 *
 * Renders the raw signals as compact chips inside a collapsible <details>
 * element. The summary line shows the section name; users opt in to see
 * the technical breakdown rather than having it pushed to the foreground.
 *
 * Renders nothing when no signals are present.
 */
export function GeoInsightsCollapsible({
  insights,
  t,
}: {
  insights: GeoInsights | null
  t: T
}) {
  const data = insights ?? EMPTY_GEO_INSIGHTS

  const activeSignals: Array<{ key: string; label: string }> = []
  if (data.contentSignals.hasList) activeSignals.push({ key: 'list', label: t('geo_signal_list') })
  if (data.contentSignals.hasComparisonLanguage)
    activeSignals.push({ key: 'comparison', label: t('geo_signal_comparison') })
  if (data.contentSignals.hasPricingLanguage)
    activeSignals.push({ key: 'pricing', label: t('geo_signal_pricing') })
  if (data.contentSignals.hasReviewLanguage)
    activeSignals.push({ key: 'review', label: t('geo_signal_review') })
  if (data.contentSignals.hasLocalLanguage)
    activeSignals.push({ key: 'local', label: t('geo_signal_local') })
  if (data.contentSignals.hasRecommendationLanguage)
    activeSignals.push({ key: 'recommendation', label: t('geo_signal_recommendation') })

  const hasAny =
    data.queryIntents.length > 0 ||
    data.citationTypes.length > 0 ||
    activeSignals.length > 0
  if (!hasAny) return null

  const intentLabel = (i: QueryIntent): string => {
    switch (i) {
      case 'transactional': return t('geo_intent_transactional')
      case 'informational': return t('geo_intent_informational')
      case 'comparison': return t('geo_intent_comparison')
      case 'review': return t('geo_intent_review')
      case 'local': return t('geo_intent_local')
      case 'navigational': return t('geo_intent_navigational')
    }
  }

  const citationLabel = (c: CitationType): string => {
    switch (c) {
      case 'homepage': return t('geo_citation_homepage')
      case 'category': return t('geo_citation_category')
      case 'product': return t('geo_citation_product')
      case 'comparison': return t('geo_citation_comparison')
      case 'review': return t('geo_citation_review')
      case 'blog': return t('geo_citation_blog')
      case 'marketplace': return t('geo_citation_marketplace')
      case 'forum': return t('geo_citation_forum')
      case 'directory': return t('geo_citation_directory')
      case 'brand_site': return t('geo_citation_brand_site')
      case 'unknown': return t('geo_citation_unknown')
    }
  }

  return (
    <details className="rounded-lg border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 group">
      <summary className="cursor-pointer list-none p-3 flex items-center justify-between gap-2 select-none hover:bg-slate-100 dark:hover:bg-slate-700/50 rounded-lg">
        <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
          {t('geo_insights_title')} <span className="text-muted">· {t('geo_technical_details')}</span>
        </span>
        <span className="text-muted text-xs group-open:rotate-180 transition-transform">▾</span>
      </summary>
      <div className="p-4 pt-0 space-y-3 border-t border-slate-200 dark:border-slate-700 mt-0">
        {data.queryIntents.length > 0 && (
          <div className="pt-3">
            <GeoChipRow
              label={t('geo_query_intent')}
              chips={data.queryIntents.map((i) => intentLabel(i))}
              tone="indigo"
            />
          </div>
        )}

        {data.citationTypes.filter((c) => c !== 'unknown').length > 0 && (
          <GeoChipRow
            label={t('geo_citation_types')}
            chips={data.citationTypes.filter((c) => c !== 'unknown').map((c) => citationLabel(c))}
            tone="slate"
          />
        )}

        {activeSignals.length > 0 && (
          <GeoChipRow
            label={t('geo_content_signals')}
            chips={activeSignals.map((s) => s.label)}
            tone="emerald"
          />
        )}
      </div>
    </details>
  )
}

function GeoChipRow({
  label,
  chips,
  tone,
}: {
  label: string
  chips: string[]
  tone: 'indigo' | 'slate' | 'emerald'
}) {
  const toneClasses =
    tone === 'indigo'
      ? 'bg-indigo-50 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800'
      : tone === 'emerald'
      ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
      : 'bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 border-slate-200 dark:border-slate-600'

  return (
    <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <span className="text-[11px] text-muted font-medium">
        {label}:
      </span>
      {chips.map((c, i) => (
        <span
          key={`${c}-${i}`}
          className={`inline-flex items-center px-1.5 py-0.5 rounded text-[11px] font-medium border ${toneClasses}`}
        >
          {c}
        </span>
      ))}
    </div>
  )
}
