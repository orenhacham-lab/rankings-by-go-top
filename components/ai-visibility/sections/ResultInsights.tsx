'use client'

import { ChevronDown } from 'lucide-react'
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
    <section className="space-y-2">
      <h3 className="text-copy font-semibold text-ink">{t('geo_explanation_title')}</h3>
      <ul className="list-disc space-y-1.5 ps-5 text-copy text-body marker:text-line-strong">
        {explanation.bullets.map((bullet, i) => (
          <li key={i}>{bullet}</li>
        ))}
      </ul>
    </section>
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
      fallbackText = t('drawer_keep_going')
    } else {
      // Generic: no clear improvements detected
      fallbackText = t('drawer_no_improvements')
    }
  }

  // If no recommendations and no fallback, don't render
  if (recs.length === 0 && !fallbackText) return null

  return (
    <section className="space-y-2">
      <h3 className="text-copy font-semibold text-ink">{t('geo_recommendations_title')}</h3>
      {recs.length > 0 ? (
        <ul className="list-disc space-y-1.5 ps-5 text-copy text-body marker:text-line-strong">
          {recs.map((r) => (
            <li key={r.key}>{r.text}</li>
          ))}
        </ul>
      ) : (
        <p className="text-copy text-muted">{fallbackText}</p>
      )}
    </section>
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
    <details className="group rounded-inset border border-line">
      <summary className="flex cursor-pointer list-none items-center justify-between gap-2 rounded-inset px-4 py-3 select-none transition-colors duration-150 ease-snappy hover:bg-sunk focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 [&::-webkit-details-marker]:hidden">
        <span className="text-caption font-semibold text-body">
          {t('geo_insights_title')} <span className="font-normal text-muted">· {t('geo_technical_details')}</span>
        </span>
        <ChevronDown aria-hidden="true" className="size-4 text-muted transition-transform duration-150 ease-snappy group-open:rotate-180" />
      </summary>
      <dl className="space-y-2 border-t border-line px-4 py-3">
        {data.queryIntents.length > 0 && (
          <GeoChipRow label={t('geo_query_intent')} chips={data.queryIntents.map((i) => intentLabel(i))} />
        )}

        {data.citationTypes.filter((c) => c !== 'unknown').length > 0 && (
          <GeoChipRow
            label={t('geo_citation_types')}
            chips={data.citationTypes.filter((c) => c !== 'unknown').map((c) => citationLabel(c))}
          />
        )}

        {activeSignals.length > 0 && (
          <GeoChipRow label={t('geo_content_signals')} chips={activeSignals.map((s) => s.label)} />
        )}
      </dl>
    </details>
  )
}

/** One line of the technical details: a caption label and its values, as plain text. */
function GeoChipRow({ label, chips }: { label: string; chips: string[] }) {
  return (
    <div className="flex flex-wrap gap-x-2 gap-y-0.5 text-caption">
      <dt className="font-medium text-muted">{label}:</dt>
      <dd className="text-body">{chips.join(' · ')}</dd>
    </div>
  )
}
