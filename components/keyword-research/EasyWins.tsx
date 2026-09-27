'use client'

/**
 * "Easy battles to win": the best keywords to start with, each with one sentence
 * on why (its searches, its competition, its click price) and its potential, and
 * one click to track it in the current project. Suggesting is all it does:
 * nothing is tracked until the merchant clicks.
 *
 * The ranking is lib/keyword-research/easy-wins.ts; this only draws it.
 */
import { Check, Plus } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import { formatMoney } from '@/lib/keyword-research/format'
import { keywordKey } from '@/lib/keyword-research/scan-research'
import type { EasyWin } from '@/lib/keyword-research/easy-wins'
import type { ResearchRow } from '@/lib/keyword-research/rows'

const GRID = '@3xl:grid-cols-[minmax(0,1fr)_7.5rem_6rem_8.5rem_6.5rem]'

export default function EasyWins({
  wins, total, adding, onTrack, onShowAll,
}: {
  /** The best ones, best first (at most EASY_WINS_SHOWN). */
  wins: { row: ResearchRow; win: EasyWin }[]
  /** How many easy wins there are in all. */
  total: number
  /** Keywords (by key) being added right now. */
  adding: ReadonlySet<string>
  onTrack: (row: ResearchRow) => void
  onShowAll?: () => void
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.easyWins
  return (
    <section data-easy-wins="" className="@container mb-6">
      <Card padding={false}>
        <header className="border-b border-line px-4 py-4 sm:px-5">
          <h2 className="text-base font-semibold text-ink">{t.title}</h2>
          <p className="mt-1 max-w-3xl text-sm text-muted">{t.subtitle}</p>
        </header>
        {wins.length === 0 ? (
          <p className="px-4 py-6 text-sm text-muted sm:px-5">{t.none}</p>
        ) : (
          <>
            <div className={cn('hidden gap-x-4 border-b border-line bg-sunk/60 px-5 py-2 text-xs font-medium text-muted @3xl:grid', GRID)} aria-hidden="true">
              <span>{t.keyword}</span>
              <span>{t.searches}</span>
              <span>{t.competition}</span>
              <span>{t.potential}</span>
              <span />
            </div>
            <ol className="divide-y divide-line">
              {wins.map(({ row, win }, i) => {
                const key = keywordKey(row.keyword)
                const why = t.why({
                  volume: formatCount(win.volume, language),
                  competition: win.competition,
                  cpc: win.cpc !== null && win.currency ? formatMoney(win.cpc, win.currency, language) : null,
                  cpcHigh: win.cpcAboveAverage,
                })
                return (
                  <li key={key} data-easy-win={row.keyword} className={cn('grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-4 gap-y-2 px-4 py-3 sm:px-5', GRID)}>
                    <div className="min-w-0">
                      <p className="flex items-baseline gap-2 text-sm font-semibold text-ink">
                        <span className="w-4 shrink-0 text-xs font-medium text-muted tabular-nums">{i + 1}</span>
                        <span className="min-w-0 break-words">{row.keyword}</span>
                      </p>
                      <p className="mt-0.5 ps-6 text-sm text-muted">{why}</p>
                    </div>
                    <span className="hidden text-sm text-body tabular-nums @3xl:block">{formatCount(win.volume, language)}</span>
                    <span className="hidden @3xl:block">
                      <span
                        className={cn(
                          'inline-flex items-center rounded-pill border px-2 py-0.5 text-xs font-semibold',
                          win.competition === 'low' ? 'border-ok/20 bg-ok-soft text-ok' : win.competition === 'medium' ? 'border-warn/20 bg-warn-soft text-warn' : 'border-line bg-sunk text-muted',
                        )}
                      >
                        {t.levels[win.competition]}
                      </span>
                    </span>
                    <span className="col-span-2 flex items-center gap-2 ps-6 @3xl:col-span-1 @3xl:ps-0" role="img" aria-label={t.potentialOf(String(win.score))}>
                      <span className="h-1 w-24 overflow-hidden rounded-pill bg-sunk @3xl:w-full">
                        <span className="block h-full rounded-pill bg-action" style={{ width: `${win.score}%` }} />
                      </span>
                      <span className="w-7 shrink-0 text-xs font-semibold text-body tabular-nums">{win.score}</span>
                    </span>
                    <span className="col-start-2 row-start-1 justify-self-end @3xl:col-start-auto @3xl:row-start-auto">
                      {row.tracked ? (
                        <span className="inline-flex h-7 items-center gap-1 rounded-pill border border-ok/20 bg-ok-soft px-2.5 text-xs font-semibold text-ok">
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
              })}
            </ol>
            <footer className="flex flex-wrap items-center justify-between gap-2 border-t border-line px-4 py-3 text-sm sm:px-5">
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
