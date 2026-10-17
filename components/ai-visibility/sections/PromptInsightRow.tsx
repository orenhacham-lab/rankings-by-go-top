'use client'

import Badge from '@/components/ui/Badge'
import type { PromptInsight, T } from './types'

const STATUS_BADGE = { missing: 'danger', weak: 'warning', medium: 'info', good: 'success' } as const

/** One line under a question: engines that mention the business, whether the site was cited, and a status badge. */
export function PromptInsightRow({
  insight,
  t,
}: {
  insight: PromptInsight | null
  t: T
  isRTL: boolean
}) {
  if (!insight) {
    return <p className="text-caption text-muted">{t('prompt_not_scanned_yet')}</p>
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

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-caption text-muted">
      <Badge variant={STATUS_BADGE[insight.status]}>{t(statusKey)}</Badge>
      <span>
        {t('prompt_mentions')}: <span className="font-medium text-body">{mentionsText}</span>
      </span>
      <span>
        {t('prompt_site_cited')}: <span className="font-medium text-body">{citedText}</span>
      </span>
    </div>
  )
}
