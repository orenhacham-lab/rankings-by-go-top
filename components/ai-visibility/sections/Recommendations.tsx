'use client'

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
  isRTL,
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
    <div className="rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-4 mt-6">
      <h3 className="text-sm font-bold uppercase tracking-wider text-slate-600 dark:text-slate-300 mb-1">
        {t('recommendations_title')}
      </h3>
      <p className="text-xs text-muted mb-3">{t('recommendations_desc')}</p>
      <div className="space-y-2">
        {recommendations.map((rec) => (
          <RecommendationItem key={rec.id} rec={rec} t={t} isRTL={isRTL} />
        ))}
      </div>
    </div>
  )
}

function RecommendationItem({
  rec,
  t,
  isRTL,
}: {
  rec: Recommendation
  t: T
  isRTL: boolean
}) {
  const borderClass = {
    high: 'border-rose-200 dark:border-rose-800',
    medium: 'border-amber-200 dark:border-amber-800',
    low: 'border-slate-200 dark:border-slate-700',
  }[rec.severity]

  const badgeClass = {
    high: 'bg-rose-50 text-rose-700 dark:bg-rose-900/30 dark:text-rose-300',
    medium: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-300',
    low: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
  }[rec.severity]

  const severityLabel =
    rec.severity === 'high'
      ? t('rec_severity_high')
      : rec.severity === 'medium'
      ? t('rec_severity_medium')
      : t('rec_severity_low')

  const bodyText = rec.body || t(rec.bodyKey)

  return (
    <div className={`rounded-md border bg-white dark:bg-slate-900 px-3 py-2.5 sm:px-4 sm:py-3 ${borderClass}`}>
      <div className={`flex items-center gap-2 flex-wrap ${isRTL ? 'flex-row-reverse justify-end' : ''}`}>
        <h4 className="text-xs sm:text-sm font-semibold text-slate-900 dark:text-slate-100 leading-snug">
          {t(rec.titleKey)}
        </h4>
        <span className={`inline-flex items-center px-1.5 py-0.5 rounded text-[10px] font-semibold shrink-0 ${badgeClass}`}>
          {severityLabel}
        </span>
      </div>
      <p className={`text-xs text-body mt-2 sm:mt-2.5 leading-relaxed whitespace-pre-line ${isRTL ? 'text-right' : 'text-left'}`}>
        {bodyText}
      </p>
    </div>
  )
}
