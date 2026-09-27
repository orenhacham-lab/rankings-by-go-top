'use client'

/**
 * The filter chips above the research table, each with how many keywords it holds.
 * Their rules live in lib/keyword-research/chips.ts; this only draws them.
 *
 * "From Google" is there whenever Search Console can be: before it is set up it
 * reads (0) and the notice under the chips says what will appear and how; while
 * Search Console is loading it shows no number rather than a zero that means
 * nothing; with Search Console switched off on the server it is not there at all.
 */
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import { RESEARCH_CHIPS, type ResearchChip } from '@/lib/keyword-research/chips'

export type GoogleChip = 'hidden' | 'loading' | 'counted'

export default function ResearchChips({
  counts, active, onChange, google,
}: {
  counts: Record<ResearchChip, number>
  active: ResearchChip
  onChange: (chip: ResearchChip) => void
  google: GoogleChip
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.chips
  const chips = RESEARCH_CHIPS.filter((c) => c !== 'google' || google !== 'hidden')
  return (
    <div role="group" aria-label={t.label} data-research-chips="" className="-mx-1 flex gap-2 overflow-x-auto px-1 pb-1 md:flex-wrap md:overflow-visible">
      {chips.map((chip) => {
        const on = chip === active
        const loading = chip === 'google' && google === 'loading'
        return (
          <button
            key={chip}
            type="button"
            data-chip={chip}
            aria-pressed={on}
            onClick={() => onChange(chip)}
            className={cn(
              'inline-flex h-9 shrink-0 items-center gap-2 rounded-pill border ps-3.5 pe-1.5 text-sm transition-[background-color,border-color,color] duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action focus-visible:ring-offset-2',
              on ? 'border-ink bg-ink font-semibold text-canvas shadow-sm' : 'border-line bg-surface font-medium text-body hover:border-line-strong hover:bg-sunk',
            )}
          >
            {t[chip]}
            <span className={cn('min-w-6 rounded-pill px-1.5 py-0.5 text-center text-xs font-semibold tabular-nums', on ? 'bg-canvas/20 text-canvas' : 'bg-sunk text-muted')} aria-busy={loading || undefined}>
              {loading ? '…' : formatCount(counts[chip], language)}
            </span>
          </button>
        )
      })}
    </div>
  )
}
