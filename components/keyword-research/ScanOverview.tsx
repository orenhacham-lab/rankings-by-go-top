'use client'

/**
 * The research tab's opening: what the research found, said in one sentence, and
 * the four figures behind it.
 *
 * The dark card is the screen's context card (one per screen): the research's
 * state, where it comes from and as of when, and the headline "we found N keywords,
 * X searches a month". The tiles under it repeat nothing: each is one number with
 * its source line, computed from the deduplicated research on screen.
 */
import { Coins, KeyRound, Search, Swords } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import StatTile from '@/components/ui/StatTile'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import { formatMoney, formatResearchDate } from '@/lib/keyword-research/format'
import type { ResearchTotals } from '@/lib/keyword-research/scan-research'

export default function ScanOverview({
  totals, easyWins, mode, domain, fetchedAt, running, truncated, onBackToScan,
}: {
  totals: ResearchTotals
  easyWins: number
  /** The scan's research, or one the merchant just ran by hand. */
  mode: 'scan' | 'manual'
  domain: string | null
  fetchedAt: string | null
  /** b2 or b3 still running: the figures will grow. */
  running: boolean
  truncated: boolean
  onBackToScan?: () => void
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan
  const date = mode === 'scan' ? formatResearchDate(fetchedAt, language) : null
  const badge = mode === 'manual' ? t.overview.badgeManual : running ? t.overview.badgeRunning : t.overview.badgeDone
  const source = mode === 'manual'
    ? t.overview.fromManual
    : `${domain ? t.overview.fromScan(domain) : t.overview.fromScanSite}${date ? ` · ${t.overview.asOf(date)}` : ''}`
  const meta = [
    totals.competitors > 0 ? t.overview.competitors(formatCount(totals.competitors, language)) : null,
    t.overview.easyWins(formatCount(easyWins, language)),
  ].filter(Boolean).join(' · ')
  const cpc = totals.averageCpc

  return (
    <section data-scan-overview={mode} className="mb-6 space-y-3">
      <Card tone="ink" className="p-5 sm:p-7">
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
          <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-2.5 py-1 text-xs font-semibold">
            <span className={cn('size-1.5 rounded-full', running ? 'animate-pulse bg-commit' : mode === 'manual' ? 'bg-action' : 'bg-ok')} aria-hidden="true" />
            {badge}
          </span>
          <span className="text-xs text-contrast-ink/70">{source}</span>
        </div>
        <h2 className="mt-5 max-w-3xl text-2xl font-bold leading-tight tracking-tight tabular-nums sm:text-[2rem] sm:leading-[2.5rem]">
          {t.overview.headline(formatCount(totals.keywords, language), formatCount(totals.monthlySearches, language))}
        </h2>
        <p className="mt-2 text-sm text-contrast-ink/75 tabular-nums">{meta}</p>
        {(running || truncated || (mode === 'manual' && onBackToScan)) && (
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-white/10 pt-4 text-sm text-contrast-ink/80">
            {running && <p data-scan-still-running="">{t.overview.stillRunning}</p>}
            {truncated && <p>{t.overview.truncated(formatCount(totals.keywords, language))}</p>}
            {mode === 'manual' && onBackToScan && (
              <button
                type="button"
                onClick={onBackToScan}
                className="font-semibold text-contrast-ink underline decoration-white/40 underline-offset-4 transition-colors hover:decoration-white"
              >
                {t.overview.backToScan}
              </button>
            )}
          </div>
        )}
      </Card>
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatTile
          label={t.tiles.keywords}
          value={formatCount(totals.keywords, language)}
          source={t.tiles.keywordsSource}
          icon={<KeyRound size={16} strokeWidth={2} />}
        />
        <StatTile
          label={t.tiles.searches}
          value={formatCount(totals.monthlySearches, language)}
          source={t.tiles.searchesSource}
          icon={<Search size={16} strokeWidth={2} />}
        />
        <StatTile
          label={t.tiles.cpc}
          value={cpc ? formatMoney(cpc.value, cpc.currency, language) : ''}
          empty={cpc ? undefined : t.tiles.cpcNone}
          source={cpc ? t.tiles.cpcSource(formatCount(cpc.count, language)) : undefined}
          icon={<Coins size={16} strokeWidth={2} />}
        />
        <StatTile
          label={t.tiles.easyWins}
          value={formatCount(easyWins, language)}
          source={t.tiles.easyWinsSource}
          icon={<Swords size={16} strokeWidth={2} />}
        />
      </div>
    </section>
  )
}
