'use client'

/**
 * "Why this topic", in facts: how many people search for its keyword each month, what
 * they are looking for, which audience it speaks to, how hard the keyword is, and which
 * competitors already chase it (with their own site icons). Only facts the research
 * holds are shown (lib/content/strategy/insights.ts topicInsight); nothing is guessed.
 */
import { Search, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCount } from '@/components/gsc/format'
import SiteMark from '@/components/keyword-research/SiteMark'
import type { TopicInsight } from '@/lib/content/strategy/insights'
import type { Locale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Dict = ReturnType<typeof getDashboardDictionary>

const COMPETITION_TONE = { LOW: 'text-ok', MEDIUM: 'text-warn', HIGH: 'text-bad' } as const

export default function TopicFacts({ insight, lang, dict, tone = 'light', className }: {
  insight: TopicInsight
  lang: Locale
  dict: Dict
  /** `ink`: on the dark next-article card. */
  tone?: 'light' | 'ink'
  className?: string
}) {
  const f = dict.strategyInsights.facts
  const ink = tone === 'ink'
  const chip = ink ? 'bg-white/10 text-contrast-ink/90' : 'bg-sunk text-body'
  return (
    <ul data-topic-facts="" aria-label={f.whyList} className={cn('flex flex-wrap items-center gap-1.5 text-caption', className)}>
      {insight.volume !== null && (
        <li className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-semibold tabular-nums', ink ? 'bg-white/15 text-contrast-ink' : 'bg-action-soft text-action')}>
          <Search size={11} aria-hidden="true" />{f.searches(formatCount(insight.volume, lang))}
        </li>
      )}
      <li className={cn('rounded-pill px-2 py-0.5', chip)}>{f.intents[insight.intent]}</li>
      {insight.competition && (
        <li className={cn('rounded-pill px-2 py-0.5 font-medium', ink ? 'bg-white/10 text-contrast-ink/90' : cn('bg-sunk', COMPETITION_TONE[insight.competition]))}>{f.competition[insight.competition]}</li>
      )}
      {insight.audience && (
        <li className={cn('inline-flex min-w-0 max-w-full items-center gap-1 rounded-pill px-2 py-0.5', chip)} title={insight.audience}>
          <UserRound size={11} aria-hidden="true" className="shrink-0" />
          <span className="shrink-0">{f.audience}:</span>
          <span className="truncate">{insight.audience}</span>
        </li>
      )}
      {insight.rivals.length > 0 && (
        <li className={cn('inline-flex items-center gap-1.5 rounded-pill py-0.5 pe-2 ps-1', chip)} aria-label={f.rivalsAria(insight.rivals.join(', '))}>
          <span className="flex -space-x-1 rtl:space-x-reverse" aria-hidden="true">
            {insight.rivals.map((d) => <SiteMark key={d} domain={d} size="sm" className="size-4 ring-2 ring-surface" />)}
          </span>
          <span aria-hidden="true">{f.rivals} <span dir="ltr">{insight.rivals[0]}</span>{insight.rivals.length > 1 ? ` +${insight.rivals.length - 1}` : ''}</span>
        </li>
      )}
    </ul>
  )
}
