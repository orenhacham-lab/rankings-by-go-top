'use client'

import { Check, Plus } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
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
      // A tier with no words of its own (starter: its chip already says so;
      // insufficient_context) shows no badge, never the raw English identifier.
      default: return ''
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

  const reasonLine =
    ('valueReason' in question && question.valueReason) ||
    question.reason ||
    ('chips' in question && question.chips && question.chips.length > 0 ? question.chips.map(chipLabel).join(' · ') : '')

  return (
    <div className="flex items-start gap-3 rounded-inset border border-line bg-surface p-4">
      <div className="min-w-0 flex-1 space-y-1.5">
        <p className="line-clamp-2 text-copy font-medium text-ink">{question.prompt}</p>
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={intentTone[question.intent] || 'neutral'}>{label}</Badge>
          {'confidenceTier' in question && confidenceTierLabel(question.confidenceTier) && (
            <Badge variant={confidenceTierColor(question.confidenceTier)}>
              {confidenceTierLabel(question.confidenceTier)}
            </Badge>
          )}
        </div>
        {/* Why this question, said once: the scorer's own sentence when it wrote one, else the
            template's reason, else its chips. The three used to stack and repeat each other. */}
        {reasonLine && <p className="line-clamp-2 text-caption text-muted" data-question-reason="">{reasonLine}</p>}
      </div>
      {isAlreadyTracked ? (
        <Badge variant="success" className="shrink-0">
          <Check aria-hidden="true" className="size-3.5" />
          {t('already_tracked')}
        </Badge>
      ) : (
        <Button
          variant="secondary"
          size="sm"
          onClick={onAdd}
          className="size-8 shrink-0 px-0"
          aria-label={t('add_question_label')}
          title={t('add_question_label')}
        >
          <Plus aria-hidden="true" className="size-4" />
        </Button>
      )}
    </div>
  )
}
