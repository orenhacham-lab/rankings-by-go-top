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
 * `onlyWithData`: render only the figure itself (or a failed read's retry), never a
 * setup prompt or a loading tile: the dashboard's row of figures, where connecting
 * Search Console is the setup checklist's job, not one more button among the numbers.
 */
export default function GscClicksTile({ projectId, className, onlyWithData = false }: { projectId: string | null | undefined; className?: string; onlyWithData?: boolean }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const { view, reload } = useGscStatus(projectId)
  if (view.state === 'disabled') return null
  if (onlyWithData && !(view.state === 'ready' && view.summary) && view.state !== 'error') return null
  // A sync that predates the property totals has rows but no total yet: one more sync.
  const state = view.state === 'ready' && !view.summary ? 'never_synced' : view.state
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
        <span className="text-caption font-medium text-muted">{t.clicks.title}</span>
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
