'use client'

/**
 * Clicks from Google over the last 28 days: one tile, beside the dashboard's other
 * figures and said the same way (label, number, where it comes from).
 *
 * The number is the authoritative property total of the latest 28-day sync, never
 * a sum of query rows. Until Search Console can give it, the tile keeps its title
 * and says what it will show and why that matters, with the one step that is
 * missing; it never shows a 0 that only means "not connected".
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

export default function GscClicksTile({ projectId, className }: { projectId: string | null | undefined; className?: string }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).gscWidgets
  const { view, reload } = useGscStatus(projectId)
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
