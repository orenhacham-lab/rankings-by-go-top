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
import { SEGMENTED_ITEM_CLASSES, SEGMENTED_THUMB_CLASSES, SEGMENTED_TRACK_CLASSES } from '@/components/ui/Segmented'
import { useSlidingThumb } from '@/components/ui/motion'
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
  const { containerRef, thumbRef } = useSlidingThumb('[aria-checked="true"]', [active, chips.length])
  // The one segmented control's look (design contract §5: a sunk pill, the chosen
  // item lifted onto the surface, never the black "all" chip), drawn here so each
  // item keeps its data-chip and its count; a radiogroup, one tab stop, arrow keys.
  const move = (e: React.KeyboardEvent<HTMLButtonElement>, from: number) => {
    const rtl = getComputedStyle(e.currentTarget).direction === 'rtl'
    const step = ({ ArrowRight: rtl ? -1 : 1, ArrowLeft: rtl ? 1 : -1, ArrowDown: 1, ArrowUp: -1 } as Record<string, number>)[e.key]
    if (step === undefined) return
    e.preventDefault()
    const next = (from + step + chips.length) % chips.length
    const buttons = e.currentTarget.parentElement?.querySelectorAll<HTMLButtonElement>('[data-chip]')
    buttons?.[next]?.focus()
    onChange(chips[next])
  }
  return (
    <div className="-mx-1 max-w-full overflow-x-auto px-1 pb-1">
      <div ref={containerRef} role="radiogroup" aria-label={t.label} data-research-chips="" className={cn(SEGMENTED_TRACK_CLASSES, 'flex-nowrap md:flex-wrap md:rounded-card')}>
        <span ref={thumbRef} aria-hidden="true" className={SEGMENTED_THUMB_CLASSES} />
        {chips.map((chip, i) => {
          const on = chip === active
          const loading = chip === 'google' && google === 'loading'
          return (
            <button
              key={chip}
              type="button"
              role="radio"
              data-chip={chip}
              aria-checked={on}
              tabIndex={on ? 0 : -1}
              onClick={() => onChange(chip)}
              onKeyDown={(e) => move(e, i)}
              className={cn(SEGMENTED_ITEM_CLASSES, 'shrink-0')}
            >
              {t[chip]}
              <span className={cn('tabular-nums', on ? 'text-muted' : 'text-muted/80')} aria-busy={loading || undefined}>
                {loading ? '…' : formatCount(counts[chip], language)}
              </span>
            </button>
          )
        })}
      </div>
    </div>
  )
}
