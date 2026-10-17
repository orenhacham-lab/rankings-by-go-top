'use client'

/**
 * Row 0 of the content strategy tab: where the plan comes from. One line, only when it
 * says something the board cannot: the scan is still building the plan (its stage-A
 * topics are on the board meanwhile), or it ended without one. A project with no scan
 * gets nothing here, and a ready plan only a small note beside the board's heading.
 * No error code or provider text is ever shown; the states are ours.
 */

import { Sparkles } from 'lucide-react'
import Notice from '@/components/ui/Notice'
import type { SeedPlan } from '@/lib/content/strategy/board'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Dict = ReturnType<typeof getDashboardDictionary>

export default function SeedPlanNotice({ seed, dict }: { seed: SeedPlan; dict: Dict }) {
  const s = dict.contentStrategy.seed
  if (seed.state === 'building') {
    return (
      <Notice tone="wait">
        <p className="font-semibold text-ink">{s.buildingTitle}</p>
        <p className="max-w-prose text-caption text-body">{s.buildingBody}</p>
      </Notice>
    )
  }
  if (seed.state === 'failed') {
    return (
      <Notice tone="warn">
        <p className="font-semibold text-ink">{s.failedTitle}</p>
        <p className="max-w-prose text-caption text-body">{seed.topics.length > 0 ? s.failedBody : s.failedBodyNoTopics}</p>
      </Notice>
    )
  }
  return null
}

/**
 * What the plan is built on, under the board's heading: the scan's business profile,
 * seed keywords, audiences, validated competitors and the pages it read, as counts.
 * Shown whenever there is a scan, so the merchant sees that the topics come from their
 * own site and market, not from a template.
 */
export function PlanBasis({ seed, dict }: { seed: SeedPlan; dict: Dict }) {
  const b = seed.basis
  if (seed.state === 'none' || !b) return null
  const s = dict.contentStrategy.seed
  const items: { label: string; value: string }[] = [
    // The business reads as its name first, then its niche when the scan named one.
    ...(b.business ? [{ value: s.basisBusiness, label: b.niche ?? '' }] : []),
    ...(b.keywords > 0 ? [{ label: s.basisKeywords, value: String(b.keywords) }] : []),
    ...(b.audiences > 0 ? [{ label: s.basisAudiences, value: String(b.audiences) }] : []),
    ...(b.competitors > 0 ? [{ label: s.basisCompetitors, value: String(b.competitors) }] : []),
    ...(b.pages !== null && b.pages > 0 ? [{ label: s.basisPages, value: String(b.pages) }] : []),
  ]
  if (items.length === 0) return null
  return (
    <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-caption">
      <span className="inline-flex items-center gap-1 font-semibold text-muted"><Sparkles className="size-3.5 text-action" aria-hidden="true" /> {s.basisTitle}</span>
      <ul className="flex flex-wrap gap-1.5">
        {items.map((it) => (
          <li key={it.value + it.label} className="inline-flex items-center gap-1 rounded-pill border border-line bg-surface px-2 py-0.5 text-muted">
            <span className="max-w-48 truncate font-semibold text-ink tabular-nums">{it.value}</span> {it.label}
          </li>
        ))}
      </ul>
    </div>
  )
}
