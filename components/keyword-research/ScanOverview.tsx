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
import { Coins, KeyRound, Search } from 'lucide-react'
import { CompetitorIcon } from '@/components/competitors/CompetitorIcon'
import { Card } from '@/components/ui/Card'
import StatTile from '@/components/ui/StatTile'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatCount } from '@/components/gsc/format'
import { formatMoney, formatResearchDate } from '@/lib/keyword-research/format'
import type { ResearchTotals } from '@/lib/keyword-research/scan-research'

export default function ScanOverview({
  totals, easyWins, mode, domain, fetchedAt, running, truncated, onBackToScan, sourceOverride,
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
  /** Where the research came from, when it is not the scan alone (the project's own research, with its date). */
  sourceOverride?: string
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan
  const date = mode === 'scan' ? formatResearchDate(fetchedAt, language) : null
  const badge = mode === 'manual' ? t.overview.badgeManual : running ? t.overview.badgeRunning : t.overview.badgeDone
  const source = sourceOverride ?? (mode === 'manual'
    ? t.overview.fromManual
    : `${domain ? t.overview.fromScan(domain) : t.overview.fromScanSite}${date ? ` · ${t.overview.asOf(date)}` : ''}`)
  const meta = [
    totals.competitors > 0 ? t.overview.competitors(formatCount(totals.competitors, language)) : null,
    t.overview.easyWins(formatCount(easyWins, language)),
  ].filter(Boolean).join(' · ')
  const cpc = totals.averageCpc

  // The share of the research that is an easy win: the one picture the hero carries.
  const share = totals.keywords > 0 ? Math.min(1, easyWins / totals.keywords) : 0

  return (
    <section data-scan-overview={mode} className="mb-8">
      <Card tone="ink" padding={false} className="relative isolate overflow-hidden shadow-pop">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_18rem_at_85%_-10%,rgb(99_130_246/0.38),transparent_70%),radial-gradient(28rem_14rem_at_0%_110%,rgb(240_176_63/0.16),transparent_70%)]"
        />
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent)]"
        />
        <div className="flex flex-col gap-6 px-5 pb-16 pt-5 sm:px-8 sm:pb-20 sm:pt-7 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/10">
                <span className={cn('size-1.5 rounded-full', running ? 'animate-pulse bg-commit' : mode === 'manual' ? 'bg-action' : 'bg-ok')} aria-hidden="true" />
                {badge}
              </span>
              <span className="text-xs text-contrast-ink/70">{source}</span>
            </div>
            <h2 className="mt-5 max-w-3xl text-2xl font-bold leading-tight tabular-nums sm:text-[2.125rem] sm:leading-[2.625rem]">
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
          </div>
          <WinShare share={share} value={formatCount(easyWins, language)} label={t.tiles.easyWins} />
        </div>
      </Card>
      <div className="relative z-10 -mt-11 grid grid-cols-2 gap-3 px-2 sm:-mt-12 sm:px-4 lg:grid-cols-4">
        <StatTile
          label={t.tiles.keywords}
          value={formatCount(totals.keywords, language)}
          source={t.tiles.keywordsSource}
          icon={<KeyRound size={16} strokeWidth={2} />}
          className="shadow-pop"
        />
        <StatTile
          label={t.tiles.searches}
          value={formatCount(totals.monthlySearches, language)}
          source={t.tiles.searchesSource}
          icon={<Search size={16} strokeWidth={2} />}
          className="shadow-pop"
        />
        <StatTile
          label={t.tiles.cpc}
          value={cpc ? formatMoney(cpc.value, cpc.currency, language) : ''}
          empty={cpc ? undefined : t.tiles.cpcNone}
          source={cpc ? t.tiles.cpcSource(formatCount(cpc.count, language)) : undefined}
          icon={<Coins size={16} strokeWidth={2} />}
          className="shadow-pop"
        />
        <StatTile
          label={t.tiles.easyWins}
          value={formatCount(easyWins, language)}
          source={t.tiles.easyWinsSource}
          icon={<CompetitorIcon size={16} strokeWidth={2} />}
          className="shadow-pop"
        />
      </div>
    </section>
  )
}

/**
 * The hero's one picture: of everything the research found, how much is an easy win.
 * Decorative next to the sentence and the tiles that say the same in words, so it is
 * hidden from screen readers.
 */
function WinShare({ share, value, label }: { share: number; value: string; label: string }) {
  const r = 52
  const c = 2 * Math.PI * r
  return (
    <div aria-hidden="true" className="relative grid size-32 shrink-0 place-items-center self-start sm:size-36 md:self-auto">
      <svg viewBox="0 0 120 120" className="absolute inset-0 size-full -rotate-90 rtl:scale-y-[-1]">
        <circle cx="60" cy="60" r={r} fill="none" stroke="rgb(255 255 255 / 0.1)" strokeWidth="10" />
        <circle
          cx="60"
          cy="60"
          r={r}
          fill="none"
          stroke="url(#win-share)"
          strokeWidth="10"
          strokeLinecap="round"
          strokeDasharray={`${c * share} ${c}`}
          className="transition-[stroke-dasharray] duration-700 ease-out motion-reduce:transition-none"
        />
        <defs>
          <linearGradient id="win-share" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#9db4ff" />
            <stop offset="100%" stopColor="#f0b03f" />
          </linearGradient>
        </defs>
      </svg>
      <div className="text-center">
        <p className="text-3xl font-bold leading-none tabular-nums">{value}</p>
        <p className="mt-1.5 max-w-[6.5rem] text-[0.6875rem] font-medium leading-tight text-contrast-ink/70">{label}</p>
      </div>
    </div>
  )
}
