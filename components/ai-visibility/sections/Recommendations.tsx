'use client'

import Badge from '@/components/ui/Badge'
import type { CompetitorAnalysisData, I18nKey, T } from './types'

interface Recommendation {
  id: string
  type: 'competitor_leading'
  severity: 'high' | 'medium' | 'low'
  titleKey: I18nKey
  bodyKey: I18nKey
  body?: string
  priority: number
}

export function RecommendationsCard({
  competitorAnalysis,
  t,
}: {
  competitorAnalysis: CompetitorAnalysisData | null
  t: T
  isRTL: boolean
}) {
  const recommendations: Recommendation[] = []

  // Competitor leading — a competitor has more mentions than the project.
  // This is the ONLY recommendation type retained here. weak_engines and
  // weak_questions are already covered by GEO Opportunity Mapping with
  // richer context, so they were removed to eliminate duplication.
  if (competitorAnalysis && competitorAnalysis.project && competitorAnalysis.competitors.length > 0) {
    const projectMentions = competitorAnalysis.project.mentionsCount
    let leadingCompetitor: { name: string; gap: number } | null = null
    for (const comp of competitorAnalysis.competitors) {
      const gap = comp.mentionsCount - projectMentions
      if (gap > 0 && comp.name && (!leadingCompetitor || gap > leadingCompetitor.gap)) {
        leadingCompetitor = { name: comp.name, gap }
      }
    }
    if (leadingCompetitor) {
      const bodyText = t('rec_competitor_leading_body')
        .replace('{competitorName}', leadingCompetitor.name)
        .replace('{gap}', String(leadingCompetitor.gap))
      recommendations.push({
        id: 'competitor_leading',
        type: 'competitor_leading',
        severity: 'high',
        titleKey: 'rec_competitor_leading_title',
        body: bodyText,
        bodyKey: 'rec_competitor_leading_body',
        priority: 1,
      })
    }
  }

  // Hide section entirely when there is no competitor_leading alert.
  // No fallback, no "all good" message — the section simply disappears.
  if (recommendations.length === 0) {
    return null
  }

  return (
    <section className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
      <h3 className="text-section font-semibold text-ink">{t('recommendations_title')}</h3>
      <p className="mt-0.5 text-caption text-muted">{t('recommendations_desc')}</p>
      <ul className="mt-4 space-y-3">
        {recommendations.map((rec) => (
          <RecommendationItem key={rec.id} rec={rec} t={t} />
        ))}
      </ul>
    </section>
  )
}

function RecommendationItem({ rec, t }: { rec: Recommendation; t: T }) {
  const variant = rec.severity === 'high' ? 'danger' : rec.severity === 'medium' ? 'warning' : 'neutral'
  const severityLabel =
    rec.severity === 'high'
      ? t('rec_severity_high')
      : rec.severity === 'medium'
      ? t('rec_severity_medium')
      : t('rec_severity_low')

  const bodyText = rec.body || t(rec.bodyKey)

  return (
    <li className="rounded-inset border border-line p-4">
      <div className="flex flex-wrap items-center gap-2">
        <h4 className="text-copy font-semibold text-ink">{t(rec.titleKey)}</h4>
        <Badge variant={variant}>{severityLabel}</Badge>
      </div>
      <p className="mt-2 whitespace-pre-line text-copy text-body">{bodyText}</p>
    </li>
  )
}
