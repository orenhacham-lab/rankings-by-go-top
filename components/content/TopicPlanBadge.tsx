'use client'

/**
 * TopicPlanBadge — compact per-topic internal-link planning chip (Phase 2E.2).
 *
 * Entry point to the planning drawer. Does NOT fetch on its own (the saved-plan
 * status is loaded lazily when the drawer opens, then passed back here as
 * `summary`) — so rendering a long topics list triggers zero network/DB work.
 */

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
}

export default function TopicPlanBadge({ summary, onClick, t }: { summary?: TopicPlanSummary; onClick: () => void; t: Strings }) {
  let label = t.badgeAction
  let tone = 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
  if (summary) {
    if (!summary.exists) { label = t.badgeNoPlan }
    else if (summary.linkCount === 0) { label = t.badgeZero; tone = 'border-slate-200 dark:border-slate-700 text-slate-500 dark:text-slate-400' }
    else if (summary.approvedCount > 0) { label = t.badgeApproved.replace('{n}', String(summary.approvedCount)); tone = 'border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300' }
    else { label = (summary.linkCount === 1 ? t.badgePlannedOne : t.badgePlanned).replace('{n}', String(summary.linkCount)); tone = 'border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300' }
    if (summary.stale) { label = `${label} ${t.badgeStaleSuffix}`; tone = 'border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400' }
  }
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-medium hover:bg-slate-50 dark:hover:bg-slate-800 transition-colors ${tone}`}
      title={t.badgeAction}
    >
      🔗 {label}
    </button>
  )
}
