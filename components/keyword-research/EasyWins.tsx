'use client'

/**
 * "Easy battles to win": the best keywords to start with, each with one sentence
 * on why (its searches, its competition, its click price) and its potential, and
 * one click to track it in the current project. Suggesting is all it does:
 * nothing is tracked until the merchant clicks.
 *
 * The ranking is lib/keyword-research/easy-wins.ts; this only draws it. With the
 * site's content known (lib/keyword-research/site-relevance.ts), the list is the
 * wins related to the site, most related first, and the unrelated ones wait in a
 * collapsed "פחות קשורים לאתר שלכם" group under it: listed, never deleted.
 */
import Link from 'next/link'
import { Check, ChevronDown, Coins, FileCheck2, Plus, Sprout } from 'lucide-react'
import type { OverlapPayload } from '@/lib/content/cannibalization/client'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import { formatMoney } from '@/lib/keyword-research/format'
import { keywordKey } from '@/lib/keyword-research/scan-research'
import type { EasyWin } from '@/lib/keyword-research/easy-wins'
import type { ResearchRow } from '@/lib/keyword-research/rows'

const GRID = '@3xl:grid-cols-[minmax(0,1fr)_7.5rem_6rem_8.5rem_6.5rem]'

type Win = { row: ResearchRow; win: EasyWin }

export default function EasyWins({
  wins, total, adding, onTrack, onShowAll, lessRelated, covered,
}: {
  /** The best ones, best first (at most EASY_WINS_SHOWN). */
  wins: Win[]
  /** How many easy wins there are in all. */
  total: number
  /** Keywords (by key) being added right now. */
  adding: ReadonlySet<string>
  onTrack: (row: ResearchRow) => void
  onShowAll?: () => void
  /** The wins unrelated to the site's content; undefined when the site's content is not known (no group, no line). */
  lessRelated?: Win[]
  /**
   * Wave 9: keywords the site already covers with a page, an article or a query it
   * ranks for (never in `wins`): a collapsed group with "improve the page", not deleted.
   */
  covered?: { row: ResearchRow; covered: OverlapPayload }[]
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.easyWins
  const row = (w: Win, i: number) => <WinRow key={keywordKey(w.row.keyword)} w={w} i={i} adding={adding} onTrack={onTrack} />
  const apart = (w: Win, i: number) => <WinRow key={keywordKey(w.row.keyword)} w={w} i={i} adding={adding} onTrack={onTrack} apart />
  const header = (
    <div className={cn('hidden gap-x-4 border-b border-line bg-sunk/60 px-6 py-2 text-caption font-semibold text-muted @3xl:grid', GRID)} aria-hidden="true">
      <span>{t.keyword}</span>
      <span>{t.searches}</span>
      <span>{t.competition}</span>
      <span>{t.potential}</span>
      <span />
    </div>
  )
  const group = lessRelated && lessRelated.length > 0 ? (
    <details data-less-related="" className="group/less border-t border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-copy font-semibold text-body transition-colors duration-150 ease-snappy hover:bg-sunk/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 sm:px-6 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none group-open/less:rotate-180" />
        {t.lessRelated(formatCount(lessRelated.length, language))}
      </summary>
      <p className="px-4 pb-3 text-caption text-muted text-pretty sm:px-6">{t.lessRelatedHint}</p>
      {header}
      <ol className="divide-y divide-line">{lessRelated.map(apart)}</ol>
    </details>
  ) : null
  const coveredGroup = covered && covered.length > 0 ? (
    <details data-covered-group="" className="group/covered border-t border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-4 py-3 text-copy font-semibold text-body transition-colors duration-150 ease-snappy hover:bg-sunk/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 sm:px-6 [&::-webkit-details-marker]:hidden">
        <ChevronDown size={16} strokeWidth={2.5} aria-hidden="true" className="shrink-0 text-muted transition-transform duration-150 motion-reduce:transition-none group-open/covered:rotate-180" />
        <FileCheck2 size={16} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ok" />
        {t.covered(formatCount(covered.length, language))}
      </summary>
      <p className="px-4 pb-3 text-caption text-muted text-pretty sm:px-6">{t.coveredHint}</p>
      <ul className="divide-y divide-line border-t border-line">
        {covered.map(({ row: r, covered: c }) => (
          <li key={keywordKey(r.keyword)} data-covered={r.keyword} className="flex flex-wrap items-center gap-x-4 gap-y-1.5 px-4 py-3 sm:px-6">
            <div className="min-w-0 flex-1 basis-60">
              <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-copy font-semibold text-ink">
                <span className="min-w-0 break-words">{r.keyword}</span>
                <span className="inline-flex items-center rounded-pill bg-ok-soft px-2 py-0.5 text-caption font-semibold text-ok">{t.coveredMark}</span>
              </p>
              <p className="mt-0.5 truncate text-caption text-muted" dir="auto" title={c.label}>{t.coveredPage(c.label)}</p>
            </div>
            {r.avgMonthlySearches !== null && r.avgMonthlySearches !== undefined && (
              <span className="text-caption tabular-nums text-muted">{formatCount(r.avgMonthlySearches, language)} {t.searches}</span>
            )}
            <Link href={c.improveHref} aria-label={t.improveAria(r.keyword)} className="inline-flex h-8 items-center gap-1.5 rounded-control border border-line bg-surface px-3 text-caption font-semibold text-action shadow-control transition-colors duration-150 ease-snappy hover:bg-action-soft focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
              {t.improve}
            </Link>
          </li>
        ))}
      </ul>
    </details>
  ) : null
  return (
    <section data-easy-wins="" className="@container mb-6">
      <Card padding={false}>
        <header className="flex items-start gap-3.5 border-b border-line px-4 py-5 sm:px-6">
          <span className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action" aria-hidden="true">
            <Sprout size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0">
            <h2 className="text-section font-semibold text-ink">{t.title}</h2>
            <p className="mt-1 max-w-3xl text-copy text-muted text-pretty">{t.subtitle}</p>
            {lessRelated && <p className="mt-1 max-w-3xl text-caption text-muted" data-ranked-by-site="">{t.rankedBySite}</p>}
          </div>
        </header>
        {wins.length === 0 ? (
          <>
            <p className="px-4 py-6 text-copy text-muted sm:px-6">{t.none}</p>
            {group}
            {coveredGroup}
          </>
        ) : (
          <>
            {header}
            <ol className="stagger-in divide-y divide-line">{wins.map(row)}</ol>
            {group}
            {coveredGroup}
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line bg-sunk/40 px-4 py-3 text-copy sm:px-6">
              <span className="text-muted tabular-nums">{t.showing(formatCount(wins.length, language), formatCount(total, language))}</span>
              {onShowAll && (
                <button type="button" onClick={onShowAll} className="font-semibold text-action transition-colors hover:text-action-hover">
                  {t.showAll}
                </button>
              )}
            </footer>
          </>
        )}
      </Card>
    </section>
  )
}

/** One easy win: the keyword and why, its searches, competition and potential, and the track button. */
function WinRow({ w: { row, win }, i, adding, onTrack, apart = false }: {
  w: Win
  i: number
  adding: ReadonlySet<string>
  onTrack: (row: ResearchRow) => void
  /** In the "less related" group: plain numbering, its own marker. */
  apart?: boolean
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.easyWins
  const key = keywordKey(row.keyword)
  const why = t.why({
    volume: formatCount(win.volume, language),
    competition: win.competition,
    cpc: win.cpc !== null && win.currency ? formatMoney(win.cpc, win.currency, language) : null,
    cpcHigh: win.cpcAboveAverage,
  })
  return (
    <li data-easy-win={apart ? undefined : row.keyword} data-less-related-win={apart ? row.keyword : undefined} className={cn('group relative grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3.5 transition-colors duration-150 ease-snappy hover:bg-action-soft/40 sm:px-6', GRID)}>
      <div className="flex min-w-0 items-start gap-3 @3xl:items-center">
        <span
          className={cn(
            'grid size-6 shrink-0 place-items-center rounded-pill text-caption font-bold tabular-nums',
            apart ? 'bg-sunk text-muted' : i === 0 ? 'bg-action text-action-ink shadow-control' : i < 3 ? 'bg-action-soft text-action ring-1 ring-inset ring-action/20' : 'bg-sunk text-muted',
          )}
          aria-hidden="true"
        >
          {i + 1}
        </span>
        <div className="min-w-0">
          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-copy font-semibold leading-6 text-ink">
            <span className="min-w-0 break-words">{row.keyword}</span>
          </p>
          {/* Once the card is wide the columns beside it say the same, so the sentence stays
              for screen readers only; its words are the competition badge's tooltip (final
              review R18: no orange sentence inside the row). */}
          <p className="mt-0.5 text-copy text-muted @3xl:sr-only">{why}</p>
        </div>
      </div>
      <span className="hidden font-semibold text-copy text-body tabular-nums @3xl:block">{formatCount(win.volume, language)}</span>
      <span className="hidden @3xl:block" title={why} data-easy-win-badge="">
        <Badge variant={win.competition === 'low' ? 'success' : win.competition === 'medium' ? 'warning' : 'danger'}>
          {t.levels[win.competition]}
          {/* A click price above the average (buying intent): a small mark, its sentence in the tooltip. */}
          {win.cpcAboveAverage && <Coins size={12} strokeWidth={2.5} aria-hidden="true" className="shrink-0" />}
        </Badge>
      </span>
      <span className="col-span-2 flex items-center gap-2 ps-9 @3xl:col-span-1 @3xl:ps-0" role="img" aria-label={t.potentialOf(String(win.score))}>
        <span className="h-2 w-24 overflow-hidden rounded-pill bg-sunk @3xl:w-full">
          <span className="grow-x block h-full rounded-pill bg-[linear-gradient(90deg,color-mix(in_srgb,var(--color-action)_55%,transparent),var(--color-action))] rtl:bg-[linear-gradient(270deg,color-mix(in_srgb,var(--color-action)_55%,transparent),var(--color-action))]" style={{ width: `${win.score}%`, '--grow-delay': `${200 + i * 60}ms` } as React.CSSProperties} />
        </span>
        <span className="w-7 shrink-0 text-copy font-bold text-ink tabular-nums">{win.score}</span>
      </span>
      <span className="col-start-2 row-start-1 justify-self-end @3xl:col-start-auto @3xl:row-start-auto">
        {row.tracked ? (
          <span className="inline-flex h-7 items-center gap-1 rounded-pill border border-ok/20 bg-ok-soft px-2.5 text-caption font-semibold text-ok">
            <Check size={12} strokeWidth={3} aria-hidden="true" />
            {t.tracked}
          </span>
        ) : (
          <Button variant="secondary" size="sm" loading={adding.has(key)} onClick={() => onTrack(row)} aria-label={`${t.track}: ${row.keyword}`}>
            {!adding.has(key) && <Plus size={14} strokeWidth={2.5} aria-hidden="true" />}
            {adding.has(key) ? t.tracking : t.track}
          </Button>
        )}
      </span>
    </li>
  )
}
