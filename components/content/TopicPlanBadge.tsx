'use client'

/**
 * TopicPlanBadge — compact per-topic internal-link planning chip (Phase 2E.2).
 *
 * Entry point to the planning drawer. Does NOT fetch on its own (the saved-plan
 * status is loaded lazily when the drawer opens, then passed back here as
 * `summary`) — so rendering a long topics list triggers zero network/DB work.
 */
import { Link2 } from 'lucide-react'

export interface TopicPlanSummary {
  exists: boolean
  linkCount: number
  approvedCount: number
  stale: boolean
}

interface Strings {
  badgeAction: string
  badgeNoPlan: string
  badgeZero: string
  badgePlanned: string
  badgePlannedOne: string
  badgeApproved: string
  badgeStaleSuffix: string
  badgeTooltip: string
  badgeChecking: string
}

export default function TopicPlanBadge({ summary, checking = false, onClick, t, highlight = false }: { summary?: TopicPlanSummary; checking?: boolean; onClick: () => void; t: Strings; highlight?: boolean }) {
  let label = t.badgeAction
  // Actionable by default (indigo), so it reads as a button, not muted metadata.
  let tone = 'border-action/30 text-action bg-surface'
  // NEUTRAL while the saved-plan status is still (re)hydrating — an unknown status must never
  // read as "add links / missing".
  if (!summary && checking) { label = t.badgeChecking; tone = 'border-line-strong text-muted bg-surface' }
  if (summary) {
    if (!summary.exists) { label = t.badgeNoPlan }
    else if (summary.linkCount === 0) { label = t.badgeZero }
    else if (summary.approvedCount > 0) { label = t.badgeApproved.replace('{n}', String(summary.approvedCount)); tone = 'border-ok/30 text-ok bg-surface' }
    else { label = (summary.linkCount === 1 ? t.badgePlannedOne : t.badgePlanned).replace('{n}', String(summary.linkCount)) }
    if (summary.stale) { label = `${label} ${t.badgeStaleSuffix}`; tone = 'border-warn/30 text-warn bg-surface' }
  }
  // After "review/edit links first", make the action pop for a few seconds.
  const emphasis = highlight ? 'ring-2 ring-action bg-action-soft motion-safe:animate-pop-in' : ''
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-control border px-3 text-caption font-semibold shadow-control transition-colors duration-150 ease-snappy hover:bg-action-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 ${tone} ${emphasis}`}
      title={t.badgeTooltip}
    >
      <Link2 aria-hidden="true" className="size-4 shrink-0" /> {label}
    </button>
  )
}
