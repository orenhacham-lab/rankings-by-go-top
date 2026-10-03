'use client'

/**
 * The line under a keyword's position in the keywords table: the best-placed
 * competitor in the SAME check as that position, or a dash that says why there
 * is none (not in the top 20, not recorded yet, not checked, Maps, no
 * competitors).
 *
 * A line inside the position cell, not a column of its own: the table already
 * fills a 1440px screen in English, and one more column pushes the status and
 * the actions out of view. The box has one size in every state (loading, dash,
 * data), so a row never changes height and the table never changes width while
 * the data arrives.
 */
import { ArrowUp } from 'lucide-react'
import { CompetitorIcon } from './CompetitorIcon'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { CompetitorEntry } from '@/lib/competitors/comparison'
import type { CompetitorView } from './useCompetitorComparison'

type Copy = ReturnType<typeof getDashboardDictionary>['competitors']

const BOX = 'inline-flex h-5 w-32 items-center gap-1 whitespace-nowrap text-caption'

export default function TopCompetitorLine({ view, targetId }: { view: CompetitorView; targetId: string }) {
  const { language } = useDashboardLanguage()
  const c = getDashboardDictionary(language).competitors

  if (view.status === 'no_competitors') return <Dash state="no_competitors" why={c.cellNoCompetitors} c={c} />
  if (view.status === 'error') return <Dash state="error" why={c.cellLoadFailed} c={c} />
  const cell = view.comparison?.cells[targetId]
  if (!cell) {
    return (
      <span className={BOX} data-top-competitor="loading" aria-busy="true">
        <Mark />
        <span className="h-2.5 w-20 rounded-control bg-sunk" aria-hidden="true" />
        <span className="sr-only">{c.loading}</span>
      </span>
    )
  }

  if (cell.kind === 'not_organic') return <Dash state={cell.kind} why={c.cellNotOrganic} c={c} />
  if (cell.kind === 'not_checked') return <Dash state={cell.kind} why={c.cellNotChecked} c={c} />
  if (cell.kind === 'not_recorded') return <Dash state={cell.kind} why={c.cellNotRecorded} c={c} />
  if (cell.kind === 'none_in_top20') {
    return <Dash state={cell.kind} why={`${c.cellNoneInTop20}\n${entryLines(cell.entries, c)}`} c={c} />
  }

  const { best } = cell
  const detail = entryLines(cell.entries, c)
  return (
    <span className={BOX} data-top-competitor="best" title={`${c.topCompetitorHint}\n${detail}`}>
      <Mark />
      <span className="sr-only">{c.topCompetitor}: </span>
      {best.url ? (
        <a
          href={best.url}
          target="_blank"
          rel="noopener noreferrer nofollow"
          dir="ltr"
          className="min-w-0 truncate text-muted hover:text-action hover:underline"
        >
          {best.domain}
        </a>
      ) : (
        <span dir="ltr" className="min-w-0 truncate text-muted">{best.domain}</span>
      )}
      <span className="shrink-0 font-semibold text-ink tabular-nums">#{best.position}</span>
      {best.aheadOfYou && <ArrowUp size={12} strokeWidth={2.5} className="shrink-0 text-bad" aria-hidden="true" />}
      <span className="sr-only">. {relationLabel(best, c)}. {detail}</span>
    </span>
  )
}

/** The competitors mark, the same one the "you vs. competitors" summary carries. */
function Mark() {
  return <CompetitorIcon size={12} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
}

function Dash({ state, why, c }: { state: string; why: string; c: Copy }) {
  return (
    <span className={`${BOX} text-muted`} data-top-competitor={state} title={`${c.topCompetitorHint}\n${why}`}>
      <Mark />
      <span aria-hidden="true">—</span>
      <span className="sr-only">{c.topCompetitor}: {why}</span>
    </span>
  )
}

function relationLabel(e: CompetitorEntry, c: Copy): string {
  return e.relation === 'above' ? c.aboveYou : e.relation === 'same' ? c.sameAsYou : c.belowYou
}

/** Every competitor recorded in the check, one per line, for the tooltip. */
function entryLines(entries: readonly CompetitorEntry[], c: Copy): string {
  return entries
    .map((e) => {
      const where = e.position != null ? `#${e.position} (${relationLabel(e, c)})` : c.notInTop20
      return `${e.name === e.domain ? e.domain : `${e.name} (${e.domain})`}: ${where}`
    })
    .join('\n')
}
