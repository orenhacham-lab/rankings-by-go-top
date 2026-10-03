'use client'

/**
 * "Searches Google already shows you for": the queries of the latest 28-day Search
 * Console sync that no tracked keyword matches, most impressions first, each with
 * Google's own average (impressions, clicks, average position) and one "track it".
 *
 * Tracking goes through the panel (onTrack), which calls the EXISTING
 * /api/keyword-research/add-to-project route: the same ownership check, the same plan
 * keyword limit and the same duplicate check as every other add. Nothing here decides
 * a limit. A query that was added says so on its row until the list is read again
 * (the panel re-reads the keywords, and the insights follow the new keyword list).
 *
 * Loading, empty and "all tracked" each have their own words; a failed read is the
 * notice's (GscLoadError with its retry), never an empty list.
 */
import { useRef, useState } from 'react'
import { Check, Plus } from 'lucide-react'
import { cn } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Segmented from '@/components/ui/Segmented'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { UntrackedQuery } from '@/lib/gsc/tab-metrics'
import { formatCompact, formatCount, formatWholePosition } from './format'

/** How the add ended: added, already tracked, the plan's limit, or a failure. */
export type TrackOutcome = 'added' | 'exists' | 'quota' | 'failed'
export type TrackQuery = (query: string) => Promise<TrackOutcome>

/** How the list is ordered: Google's own figures, most impressions first unless chosen. */
export type UntrackedSort = 'impressions' | 'clicks' | 'position'

/**
 * Orders the rows for the chosen sort. Impressions and clicks: most first. Position:
 * best (smallest) first, a search without a position last. Every sort breaks a tie by
 * impressions then clicks then the query, so the order is stable and never jumps.
 */
export function sortUntrackedRows<T extends UntrackedQuery>(rows: readonly T[], sort: UntrackedSort): T[] {
  const tie = (a: T, b: T) => b.impressions - a.impressions || b.clicks - a.clicks || (a.query < b.query ? -1 : a.query > b.query ? 1 : 0)
  return [...rows].sort((a, b) => {
    if (sort === 'clicks') return b.clicks - a.clicks || tie(a, b)
    if (sort === 'position') {
      const pa = a.position == null ? Infinity : a.position
      const pb = b.position == null ? Infinity : b.position
      if (pa !== pb) return pa < pb ? -1 : 1
    }
    return tie(a, b)
  })
}

/** Rows shown before "show more". */
export const UNTRACKED_VISIBLE = 8

/** Google's figures, marked as Google's: a small "G" monogram, never Google's logo. */
export function GoogleMark({ size = 'sm' }: { size?: 'sm' | 'md' | 'lg' }) {
  return (
    <span
      aria-hidden="true"
      className={cn(
        'grid shrink-0 place-items-center rounded-full bg-action-soft font-bold leading-none text-action',
        size === 'sm' && 'size-4 text-overline',
        size === 'md' && 'size-6 text-caption',
        size === 'lg' && 'size-10 text-copy',
      )}
    >
      G
    </span>
  )
}

interface Insights {
  untracked: UntrackedQuery[]
  untrackedTotal: number
  queriesTotal: number
}

/** A row of the list: a search Google reports, and whether it is one of the tracked keywords. */
type Row = UntrackedQuery & { tracked: boolean }

/**
 * Wave 9: the Keywords tab lists here, at its top, EVERY search Google reports for the
 * site: the tracked keywords Google shows it for too (`tracked`, marked "tracked", with
 * no add), merged with the untracked ones, most seen first. A tracked keyword's Google
 * figure lives only here now; its live-tracking row shows our live check alone.
 */
export default function GscUntrackedQueries({ loading, insights, onTrack, tracked = [] }: {
  loading: boolean
  insights: Insights | null
  onTrack?: TrackQuery
  /** Tracked keywords with Google's own figures for them (impressions above 0). */
  tracked?: UntrackedQuery[]
}) {
  const { language, uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).gscWidgets.untracked
  const [expanded, setExpanded] = useState(false)
  const [sort, setSort] = useState<UntrackedSort>('impressions')
  const [adding, setAdding] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  // One add at a time, decided synchronously: two clicks in one tick are one request.
  const inFlight = useRef(false)

  if (loading || !insights) {
    return (
      <div className="px-4 py-3 sm:px-6" aria-busy="true" data-gsc-untracked="loading">
        <span className="sr-only">{t.loading}</span>
        {Array.from({ length: 4 }, (_, i) => (
          <div key={i} aria-hidden="true" className="flex items-center gap-4 border-b border-line py-3.5 last:border-b-0">
            <span className="h-3.5 w-2/5 rounded-control bg-sunk" />
            <span className="ms-auto hidden h-3 w-16 rounded-control bg-sunk sm:block" />
            <span className="hidden h-3 w-12 rounded-control bg-sunk sm:block" />
            <span className="h-8 w-24 rounded-control bg-sunk" />
          </div>
        ))}
      </div>
    )
  }

  const rows: Row[] = sortUntrackedRows([
    ...tracked.filter((q) => q.impressions > 0).map((q) => ({ ...q, tracked: true })),
    ...insights.untracked.map((q) => ({ ...q, tracked: false })),
  ], sort)
  const trackedCount = rows.length - insights.untracked.length
  if (rows.length === 0) {
    return (
      <p className="px-4 py-6 text-copy text-muted sm:px-6" data-gsc-untracked={insights.queriesTotal > 0 ? 'all-tracked' : 'none'}>
        {insights.queriesTotal > 0 ? t.emptyAllTracked : t.emptyNone}
      </p>
    )
  }

  const shown = expanded ? rows : rows.slice(0, UNTRACKED_VISIBLE)
  const top = Math.max(1, ...rows.map((r) => r.impressions))

  async function track(query: string) {
    if (!onTrack || inFlight.current || added.has(query)) return
    inFlight.current = true
    setAdding(query)
    try {
      const outcome = await onTrack(query)
      if (outcome === 'added' || outcome === 'exists') setAdded((s) => new Set(s).add(query))
    } finally {
      inFlight.current = false
      setAdding(null)
    }
  }

  return (
    <div data-gsc-untracked="list">
      {/* Sort: a radiogroup (one tab stop, arrows choose); the result is announced politely. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2 border-b border-line px-4 py-3 sm:px-6" data-gsc-untracked-sort={sort}>
        <span className="text-caption font-semibold text-muted">{t.sortLabel}</span>
        <Segmented
          ariaLabel={t.sortLabel}
          value={sort}
          onChange={(v) => { setSort(v); setExpanded(false) }}
          className="max-w-full overflow-x-auto"
          options={[
            { value: 'impressions', label: t.sortImpressions },
            { value: 'clicks', label: t.sortClicks },
            { value: 'position', label: t.sortPosition },
          ]}
        />
        <span className="sr-only" role="status" aria-live="polite">{t.sortedBy(sort === 'clicks' ? t.sortClicks : sort === 'position' ? t.sortPosition : t.sortImpressions)}</span>
      </div>
      {/* Column names for the figures, from a tablet up; on a phone each figure names itself. */}
      <div aria-hidden="true" className="hidden grid-cols-[minmax(0,1fr)_7rem_5rem_6rem_8.5rem] items-center gap-4 border-b border-line bg-sunk/40 px-6 py-2 text-caption font-semibold text-muted md:grid">
        <span />
        <span>{t.impressions}</span>
        <span>{t.clicks}</span>
        <span>{t.position}</span>
        <span />
      </div>
      <ul>
        {shown.map((q) => {
          const isAdded = q.tracked || added.has(q.query)
          const isAdding = adding === q.query
          const share = Math.max(4, Math.round((q.impressions / top) * 100))
          return (
            <li
              key={q.query}
              className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-1.5 border-b border-line px-4 py-3 last:border-b-0 sm:px-6 md:grid-cols-[minmax(0,1fr)_7rem_5rem_6rem_8.5rem]"
            >
              <span dir="auto" className="min-w-0 truncate text-start text-copy font-semibold text-ink" title={q.query}>{q.query}</span>
              {/* On a phone the figures sit on one line under the query, each with its name. */}
              <span className="col-start-1 row-start-2 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-caption text-muted md:hidden">
                <span className="tabular-nums">{t.impressions} {formatCompact(q.impressions, language)}</span>
                <span className="tabular-nums">{t.clicks} {formatCompact(q.clicks, language)}</span>
                {q.position != null && <span className="tabular-nums">{t.position} {formatWholePosition(q.position, language)}</span>}
              </span>
              <span className="hidden flex-col gap-1 md:flex">
                <span className="text-copy tabular-nums text-body">{formatCount(q.impressions, language)}</span>
                <span aria-hidden="true" className="h-1 w-full overflow-hidden rounded-pill bg-sunk">
                  <span className="block h-full rounded-pill bg-action/60" style={{ width: `${share}%` }} />
                </span>
              </span>
              <span className="hidden text-copy tabular-nums text-body md:block">{formatCount(q.clicks, language)}</span>
              <span className="hidden text-copy tabular-nums text-body md:block">{q.position == null ? '—' : formatWholePosition(q.position, language)}</span>
              <span className="col-start-2 row-span-2 row-start-1 justify-self-end md:col-start-auto md:row-span-1 md:row-start-auto">
                {isAdded ? (
                  <span className="inline-flex h-8 items-center gap-1.5 px-2 text-caption font-semibold text-ok" data-gsc-tracked={q.tracked ? 'tracked' : ''}>
                    <Check size={15} strokeWidth={2.25} aria-hidden="true" />
                    {t.added}
                  </span>
                ) : (
                  <Button
                    size="sm"
                    variant="secondary"
                    loading={isAdding}
                    disabled={!onTrack || (adding !== null && !isAdding)}
                    onClick={() => { void track(q.query) }}
                    aria-label={t.addAria(q.query)}
                    className="whitespace-nowrap"
                  >
                    {!isAdding && <Plus size={15} aria-hidden="true" />}
                    {isAdding ? t.adding : t.add}
                  </Button>
                )}
              </span>
            </li>
          )
        })}
      </ul>
      {(rows.length > UNTRACKED_VISIBLE || insights.untrackedTotal + trackedCount > rows.length) && (
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 border-t border-line px-4 py-3 sm:px-6">
          <p className="text-caption text-muted">
            {trackedCount > 0
              ? t.shownOfAll(formatCount(shown.length, language), formatCount(insights.untrackedTotal + trackedCount, language))
              : t.shownOf(formatCount(shown.length, language), formatCount(insights.untrackedTotal, language))}
          </p>
          {rows.length > UNTRACKED_VISIBLE && (
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              aria-expanded={expanded}
              className="text-copy font-medium text-action transition-colors hover:text-action-hover focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 rounded-control"
            >
              {expanded ? t.less : t.more(formatCount(rows.length - UNTRACKED_VISIBLE, language))}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
