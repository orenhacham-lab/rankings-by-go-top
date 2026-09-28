'use client'

import Badge from '@/components/ui/Badge'
import type { PromptSuggestion } from '@/lib/ai-visibility/prompt-templates'
import type { I18nKey, PromptRow, T } from './types'

export function SmartQuestionCard({
  question,
  onAdd,
  t,
  isAlreadyTracked,
}: {
  question: PromptSuggestion
  onAdd: () => void
  t: T
  /** Unused by the card; kept so the caller's props stay as they were. */
  allPrompts?: PromptRow[]
  isAlreadyTracked?: boolean
}) {
  const intentTone: Record<string, 'info' | 'success' | 'warning' | 'neutral' | 'danger'> = {
    brand: 'info',
    comparison: 'warning',
    local: 'success',
    transactional: 'warning',
    recommendation: 'info',
    informational: 'neutral',
    commercial: 'warning',
    alternatives: 'neutral',
    pre_purchase: 'info',
    gift: 'success',
  }

  // Intent label follows dashboard UI language, not the project's scan language.
  const label =
    (
      {
        brand: t('intent_brand'),
        comparison: t('intent_comparison'),
        commercial: t('intent_commercial'),
        local: t('intent_local'),
        transactional: t('intent_transactional'),
        recommendation: t('intent_recommendation'),
        informational: t('intent_informational'),
        alternatives: t('intent_alternatives'),
        pre_purchase: t('intent_pre_purchase'),
        gift: t('intent_gift'),
      } as Record<string, string>
    )[question.intent] ||
    question.intent

  // Confidence tier display (replaces numeric score)
  const confidenceTierLabel = (tier: string): string => {
    switch (tier) {
      case 'high': return t('confidence_high')
      case 'good': return t('confidence_good')
      case 'medium': return t('confidence_medium')
      case 'opportunity': return t('confidence_opportunity')
      case 'experimental': return t('confidence_experimental')
      default: return tier
    }
  }

  const confidenceTierColor = (tier: string): 'success' | 'info' | 'warning' | 'neutral' | 'danger' => {
    switch (tier) {
      case 'high': return 'success'
      case 'good': return 'info'
      case 'medium': return 'warning'
      case 'opportunity': return 'warning'
      case 'experimental': return 'neutral'
      default: return 'neutral'
    }
  }

  const chipLabel = (chip: string): string => {
    return t(chip as I18nKey) || chip
  }

  return (
    <div className="flex items-start gap-3 p-3 rounded-lg bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 hover:shadow-sm transition">
      <div className="flex-1 min-w-0">
        <p className="text-sm text-slate-900 dark:text-slate-100 font-medium line-clamp-2 mb-1.5">{question.prompt}</p>
        <div className="flex items-center gap-1.5 mb-1">
          <Badge variant={intentTone[question.intent] || 'neutral'} className="!text-[9px]">
            {label}
          </Badge>
          {'confidenceTier' in question && (
            <Badge variant={confidenceTierColor(question.confidenceTier)} className="!text-[9px]">
              {confidenceTierLabel(question.confidenceTier)}
            </Badge>
          )}
        </div>
        {'valueReason' in question && question.valueReason && (
          <p className="text-[12px] font-medium text-indigo-700 dark:text-indigo-300 mb-1.5">
            {question.valueReason}
          </p>
        )}
        {'chips' in question && question.chips && question.chips.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1.5">
            {question.chips.map((chip) => (
              <span
                key={chip}
                className="inline-flex items-center px-1.5 py-0.5 text-[9px] font-medium rounded-full bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300"
              >
                {chipLabel(chip)}
              </span>
            ))}
          </div>
        )}
        {question.reason && (
          <p className="text-[10px] text-muted line-clamp-1">
            {question.reason}
          </p>
        )}
      </div>
      {isAlreadyTracked ? (
        <div className="shrink-0 px-2 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 text-[9px] font-medium text-emerald-700 dark:text-emerald-300 whitespace-nowrap flex items-center">
          {t('already_tracked')}
        </div>
      ) : (
        <button
          onClick={onAdd}
          className="shrink-0 w-8 h-8 rounded-lg bg-indigo-100 text-indigo-700 hover:bg-indigo-200 transition flex items-center justify-center"
          aria-label={t('add_question_label')}
          title={t('add_question_label')}
        >
          +
        </button>
      )}
    </div>
  )
}
