'use client'

/**
 * Clicks from Google over the last 28 days: one tile, beside the dashboard's other
 * figures and said the same way (label, number, where it comes from).
 *
 * The number is the authoritative property total of the latest 28-day sync, never
 * a sum of query rows. Until Search Console can give it, the tile keeps its title
 * and says what it will show and why that matters, with the one step that is
 * missing; it never shows a 0 that only means "not connected". With Search Console
 * switched off on the server there is no step to offer, and no tile.
 */
import { MousePointerClick } from 'lucide-react'
import { cn } from '@/lib/utils'
import StatTile from '@/components/ui/StatTile'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { isGscSetupState } from '@/lib/gsc/widget-state'
import { useGscStatus } from './gsc-data'
import GscSetupPrompt, { GscLoadError, GscLoading } from './GscSetupPrompt'
import { formatCount } from './format'

/**
 * The Search Console steps the dashboard's setup checklist asks for itself
 * (components/dashboard/DashboardSetup.tsx gscSetupDone). A widget given
 * `hideSetup` says nothing in these states rather than asking a second time;
 * "sync" is not a checklist step, so a connected but never-synced account still
 * sees it here.
 */
export const CHECKLIST_STEPS: ReadonlySet<string> = new Set(['not_connected', 'reauth_required', 'no_property'])

/**
 * `hideSetup`: where another card already asks for the one missing Search Console
 * step (the dashboard's setup checklist), the tile says nothing instead of asking
 * a second time (UX review P1-16: "connect Search Console" appeared three times).
 */
export default function GscClicksTile({ projectId, className, hideSetup = false }: { projectId: string | null | undefined; className?: string; hideSetup?: boolean }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const { view, reload } = useGscStatus(projectId)
  if (view.state === 'disabled') return null
  // A sync that predates the property totals has rows but no total yet: one more sync.
  const state = view.state === 'ready' && !view.summary ? 'never_synced' : view.state
  if (hideSetup && CHECKLIST_STEPS.has(state)) return null
  const icon = <MousePointerClick size={16} strokeWidth={2} aria-hidden="true" />

  if (view.state === 'ready' && view.summary) {
    return (
      <div data-gsc-widget="clicks" data-gsc-state="ready" className={cn('h-full', className)}>
        <StatTile
          className="h-full"
          label={t.clicks.title}
          value={formatCount(view.summary.clicks, language)}
          source={t.source28}
          icon={icon}
        />
      </div>
    )
  }

  return (
    <div
      data-gsc-widget="clicks"
      data-gsc-state={state}
      className={cn('flex h-full flex-col gap-2 rounded-card border border-line bg-surface p-4', className)}
    >
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-medium text-muted">{t.clicks.title}</span>
        <span className="shrink-0 text-muted">{icon}</span>
      </div>
      {isGscSetupState(state) ? (
        <GscSetupPrompt state={state} about={t.clicks.about} projectId={projectId} />
      ) : state === 'error' ? (
        <GscLoadError onRetry={reload} />
      ) : (
        <GscLoading />
      )}
    </div>
  )
}
