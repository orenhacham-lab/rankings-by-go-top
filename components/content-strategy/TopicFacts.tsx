'use client'

/**
 * "Why this topic", in facts: how many people search for its keyword each month, what
 * they are looking for, which audience it speaks to, how hard the keyword is, and which
 * competitors already chase it (with their own site icons). Only facts the research
 * holds are shown (lib/content/strategy/insights.ts topicInsight); nothing is guessed.
 */
import type { ReactNode } from 'react'
import { Search, UserRound } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatCount } from '@/components/gsc/format'
import SiteAvatar from '@/components/ui/SiteAvatar'
import type { TopicInsight } from '@/lib/content/strategy/insights'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Dict = ReturnType<typeof getDashboardDictionary>

/** Chips shown before the rest fold into "+N" (design contract §6). */
export const TOPIC_FACTS_MAX = 3

export default function TopicFacts({ insight, lang, dict, tone = 'light', className, max = TOPIC_FACTS_MAX }: {
  insight: TopicInsight
  lang: PublicLocale
  dict: Dict
  /** `ink`: on the dark next-article card. */
  tone?: 'light' | 'ink'
  className?: string
  /** At most this many chips; the rest fold into one "+N" chip that names them. */
  max?: number
}) {
  const f = dict.strategyInsights.facts
  const ink = tone === 'ink'
  const chip = ink ? 'bg-white/10 text-contrast-ink/90' : 'bg-sunk text-body'
  // Every fact the research holds, most telling first; `text` names it for "+N".
  const facts: { key: string; text: string; node: ReactNode }[] = []
  if (insight.volume !== null) {
    const text = f.searches(formatCount(insight.volume, lang))
    facts.push({ key: 'volume', text, node: (
      <li key="volume" className={cn('inline-flex items-center gap-1 rounded-pill px-2 py-0.5 font-semibold tabular-nums', ink ? 'bg-white/15 text-contrast-ink' : 'bg-action-soft text-action')}>
        <Search className="size-3" aria-hidden="true" />{text}
      </li>
    ) })
  }
  facts.push({ key: 'intent', text: f.intents[insight.intent], node: <li key="intent" className={cn('rounded-pill px-2 py-0.5', chip)}>{f.intents[insight.intent]}</li> })
  if (insight.competition) {
    const text = f.competition[insight.competition]
    facts.push({ key: 'competition', text, node: <li key="competition" className={cn('rounded-pill px-2 py-0.5 font-medium', chip)}>{text}</li> })
  }
  if (insight.audience) {
    facts.push({ key: 'audience', text: `${f.audience}: ${insight.audience}`, node: (
      <li key="audience" className={cn('inline-flex min-w-0 max-w-full items-center gap-1 rounded-pill px-2 py-0.5', chip)} title={insight.audience}>
        <UserRound aria-hidden="true" className="size-3 shrink-0" />
        <span className="shrink-0">{f.audience}:</span>
        <span className="truncate">{insight.audience}</span>
      </li>
    ) })
  }
  if (insight.rivals.length > 0) {
    facts.push({ key: 'rivals', text: f.rivalsAria(insight.rivals.join(', ')), node: (
      <li key="rivals" className={cn('inline-flex items-center gap-1.5 rounded-pill py-0.5 pe-2 ps-1', chip)} aria-label={f.rivalsAria(insight.rivals.join(', '))}>
        <span className="flex -space-x-1 rtl:space-x-reverse" aria-hidden="true">
          {insight.rivals.map((d) => <SiteAvatar key={d} domain={d} size="xs" tone={ink ? 'dark' : 'light'} className="size-4" />)}
        </span>
        <span aria-hidden="true">{f.rivals} <span dir="ltr">{insight.rivals[0]}</span>{insight.rivals.length > 1 ? ` +${insight.rivals.length - 1}` : ''}</span>
      </li>
    ) })
  }
  const shown = facts.slice(0, max)
  const rest = facts.slice(max)
  return (
    <ul data-topic-facts="" aria-label={f.whyList} className={cn('flex flex-wrap items-center gap-1.5 text-caption', className)}>
      {shown.map((x) => x.node)}
      {rest.length > 0 && (
        <li data-topic-facts-more="" className={cn('rounded-pill px-2 py-0.5 font-semibold tabular-nums', chip)} title={rest.map((x) => x.text).join(' · ')}>
          <span aria-hidden="true">+{rest.length}</span>
          <span className="sr-only">{rest.map((x) => x.text).join(' · ')}</span>
        </li>
      )}
    </ul>
  )
}
