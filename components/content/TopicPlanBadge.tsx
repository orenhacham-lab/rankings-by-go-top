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
  badgeTooltip: string
  badgeChecking: string
}

export default function TopicPlanBadge({ summary, checking = false, onClick, t, highlight = false }: { summary?: TopicPlanSummary; checking?: boolean; onClick: () => void; t: Strings; highlight?: boolean }) {
  let label = t.badgeAction
  // Actionable by default (indigo), so it reads as a button, not muted metadata.
  let tone = 'border-indigo-300 dark:border-indigo-500/40 text-indigo-700 dark:text-indigo-300 bg-white dark:bg-transparent'
  // NEUTRAL while the saved-plan status is still (re)hydrating — an unknown status must never
  // read as "add links / missing".
  if (!summary && checking) { label = t.badgeChecking; tone = 'border-slate-300 dark:border-slate-600 text-slate-500 dark:text-slate-400 bg-white dark:bg-transparent' }
  if (summary) {
    if (!summary.exists) { label = t.badgeNoPlan }
    else if (summary.linkCount === 0) { label = t.badgeZero }
    else if (summary.approvedCount > 0) { label = t.badgeApproved.replace('{n}', String(summary.approvedCount)); tone = 'border-emerald-300 dark:border-emerald-500/40 text-emerald-700 dark:text-emerald-300 bg-white dark:bg-transparent' }
    else { label = (summary.linkCount === 1 ? t.badgePlannedOne : t.badgePlanned).replace('{n}', String(summary.linkCount)) }
    if (summary.stale) { label = `${label} ${t.badgeStaleSuffix}`; tone = 'border-amber-300 dark:border-amber-500/40 text-amber-700 dark:text-amber-400 bg-white dark:bg-transparent' }
  }
  // After "review/edit links first", make the action pop for a few seconds.
  const emphasis = highlight ? 'ring-2 ring-indigo-400 dark:ring-indigo-500/60 bg-indigo-50 dark:bg-indigo-500/10 animate-pulse' : ''
  return (
    <button
      type="button"
      onClick={onClick}
      className={`inline-flex items-center justify-center gap-1 whitespace-nowrap rounded-lg border px-3 py-1.5 h-7 text-xs font-semibold shadow-sm hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors ${tone} ${emphasis}`}
      title={t.badgeTooltip}
    >
      🔗 {label}
    </button>
  )
}
