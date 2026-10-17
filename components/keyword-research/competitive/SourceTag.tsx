'use client'

/**
 * The one label every ranking figure of the competitive view carries: where it came
 * from. Two sources only, drawn differently so they are never read as one number:
 *
 *   scan  "Our check · date"  an exact position on that day (filled accent chip, crosshair)
 *   gsc   "Search Console"    Google's 28-day average (outlined neutral chip, chart line)
 */
import { ChartSpline, ScanSearch } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

export type RankingSource = 'scan' | 'gsc'

export default function SourceTag({ source, date, short = false, className }: {
  source: RankingSource
  /** Our check's date, already formatted; omitted in a column header. */
  date?: string | null
  short?: boolean
  className?: string
}) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).researchCompetitive.source
  const text = source === 'scan'
    ? (date && !short ? t.scan(date) : t.scanShort)
    : (short ? t.gscShort : t.gsc)
  const Icon = source === 'scan' ? ScanSearch : ChartSpline
  return (
    <span
      data-source={source}
      className={cn(
        'inline-flex max-w-full items-center gap-1 rounded-pill px-2 py-0.5 text-overline font-semibold',
        source === 'scan' ? 'bg-action-soft text-action' : 'border border-line bg-surface text-body',
        className,
      )}
    >
      <Icon size={12} strokeWidth={2.25} aria-hidden="true" className="shrink-0" />
      <span className="truncate">{text}</span>
    </span>
  )
}
