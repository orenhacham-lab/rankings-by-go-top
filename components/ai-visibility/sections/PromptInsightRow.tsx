'use client'

import type { PromptInsight, T } from './types'

export function PromptInsightRow({
  insight,
  t,
  isRTL,
}: {
  insight: PromptInsight | null
  t: T
  isRTL: boolean
}) {
  if (!insight) {
    return (
      <div className={`text-xs text-muted mb-2 ${isRTL ? 'text-right' : 'text-left'}`}>
        {t('prompt_not_scanned_yet')}
      </div>
    )
  }

  const statusKey = (`prompt_status_${insight.status}`) as
    | 'prompt_status_missing'
    | 'prompt_status_weak'
    | 'prompt_status_medium'
    | 'prompt_status_good'

  const mentionsText = t('prompt_engines_of')
    .replace('{mentioned}', String(insight.businessMentionEngines))
    .replace('{total}', String(insight.totalEngines))

  const citedText = insight.targetCitedCount > 0 ? t('prompt_yes') : t('prompt_no')
  const statusText = t(statusKey)

  return (
    <div
      className={`mb-2 text-[11px] sm:text-xs text-body ${
        isRTL ? 'text-right' : 'text-left'
      }`}
    >
      <span className="font-semibold text-slate-700 dark:text-slate-200">{t('prompt_mentions')}:</span>
      <span> {mentionsText} </span>
      <span className="text-muted">|</span>
      <span> {t('prompt_site_cited')}:</span>
      <span className="font-semibold text-slate-700 dark:text-slate-200"> {citedText} </span>
      <span className="text-muted">|</span>
      <span> {t('prompt_status')}:</span>
      <span className="font-semibold text-slate-700 dark:text-slate-200"> {statusText}</span>
    </div>
  )
}
