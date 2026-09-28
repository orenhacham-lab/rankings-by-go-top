'use client'

/**
 * Widget 2, the opening card: the screen's one dark surface. One big number
 * (keywords on Google's first page), one human sentence about it, one line of
 * news (the latest article, or the biggest ranking move) and the next step.
 *
 * ONE NUMBER (UX review P1-16): there used to be a ring beside it, "57%", which
 * said "4 of 7" a second time; the number and its sentence say it once.
 *
 * While the seeding scan works, the card says so in a line of its own, so a
 * merchant who just started a project sees that the waiting is work.
 */
import { Newspaper, TrendingDown, TrendingUp } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { RankingsView } from '@/lib/dashboard/rankings'
import type { SeedPhase } from '@/lib/dashboard/seed'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { formatCount } from '@/components/gsc/format'
import SiteIcon from '@/components/ui/SiteIcon'
import CountUp from '@/components/ui/CountUp'
import { LinkButton } from './ui'

export interface NextStep {
  href: string
  label: string
  /** Costs something (an article counts toward the allowance): the amber colour. */
  commit: boolean
  note: string | null
}

export type HeroNews =
  | { kind: 'article'; title: string }
  | { kind: 'move'; keyword: string; change: number; position: number }
  | null

export default function HeroCard({ t, language, domain, siteIcon, rankings, news, seedPhase, next }: {
  t: DashboardDictionary['dashboardHome']
  language: 'he' | 'en'
  domain: string
  /** The icon the site declares, from its scan (the switcher's list carries it); /favicon.ico otherwise. */
  siteIcon?: string | null
  rankings: RankingsView
  news: HeroNews
  seedPhase: SeedPhase | null
  next: NextStep | null
}) {
  const h = t.hero
  const checked = rankings.checked > 0
  const big = checked ? rankings.firstPage : rankings.tracked
  const unit = checked ? h.firstPageUnit : h.keywordsUnit
  const sentence = rankings.tracked === 0
    ? h.noKeywords
    : checked ? h.firstPage(rankings.firstPage, rankings.checked) : h.noChecksYet(rankings.tracked)
  const scanLine = seedPhase === 'stage_b' ? h.scanRunning : seedPhase === 'stage_a' ? h.scanReading : null

  const initial = domain.replace(/^www\./, '').slice(0, 1).toUpperCase()

  return (
    <section
      data-dashboard-widget="hero"
      data-state={checked ? 'ranked' : rankings.tracked === 0 ? 'no_keywords' : 'not_checked'}
      aria-label={h.label}
      className="relative isolate overflow-hidden rounded-card bg-contrast p-5 text-contrast-ink shadow-pop sm:p-8"
    >
      {/* Depth, never an animation of its own: two soft glows and a faint grid that fades out. */}
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_18rem_at_85%_-15%,rgb(0_134_245/0.34),transparent_70%),radial-gradient(28rem_14rem_at_0%_115%,rgb(240_176_63/0.16),transparent_70%)]" />
      <div aria-hidden="true" className="pointer-events-none absolute inset-0 -z-10 opacity-[0.07] [background-image:linear-gradient(to_right,white_1px,transparent_1px),linear-gradient(to_bottom,white_1px,transparent_1px)] [background-size:32px_32px] [mask-image:linear-gradient(to_bottom,black,transparent)]" />
      <div className="grid gap-6 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-3">
            <SiteIcon
              domain={domain}
              icon={siteIcon}
              fallback={initial}
              className="grid size-10 shrink-0 place-items-center rounded-xl bg-white/10 text-lg font-bold ring-1 ring-white/15"
              iconClassName="grid size-10 shrink-0 place-items-center rounded-xl bg-white p-2 ring-1 ring-white/15"
            />
            <p className="min-w-0 text-caption font-medium uppercase tracking-wide text-contrast-ink/70">
              {h.label} <span dir="ltr" className="block truncate text-copy font-semibold normal-case tracking-normal text-contrast-ink">{domain}</span>
            </p>
          </div>
          <p className="mt-5 flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span className="text-[3.5rem] font-bold leading-none tabular-nums sm:text-[4.25rem]"><CountUp value={big}>{formatCount(big, language)}</CountUp></span>
            <span className="text-section font-medium text-contrast-ink/75">{unit}</span>
          </p>
          <p className="mt-3 max-w-xl text-[0.9375rem] leading-6 text-contrast-ink/85">{sentence}</p>
          {news && (
            <p className="mt-4 flex min-w-0 max-w-xl items-center gap-2.5 rounded-xl bg-white/[0.06] px-3 py-2 text-copy text-contrast-ink/90 ring-1 ring-white/10">
              {news.kind === 'article'
                ? <Newspaper size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-contrast-ink/70" />
                : news.change > 0
                  ? <TrendingUp size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[#6ee7a0]" />
                  : <TrendingDown size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-[#fca5a5]" />}
              <span className="truncate">
                {news.kind === 'article'
                  ? h.newsArticle(news.title)
                  : news.change > 0
                    ? h.newsUp(news.keyword, news.change, news.position)
                    : h.newsDown(news.keyword, Math.abs(news.change), news.position)}
              </span>
            </p>
          )}
          {scanLine && (
            <p data-scan-line={seedPhase ?? ''} className="mt-3 flex items-start gap-2 text-caption text-contrast-ink/80">
              <span aria-hidden="true" className="relative mt-1 flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-pill bg-action opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-pill bg-action" />
              </span>
              <span>{scanLine}</span>
            </p>
          )}
        </div>
        <div className="flex flex-col items-start gap-5 md:items-end">
          {next && (
            <div className="flex flex-col items-start gap-1.5 md:items-end">
              <LinkButton href={next.href} variant={next.commit ? 'commit' : 'primary'} className={cn('h-11 px-5 shadow-pop')}>
                {next.label}
              </LinkButton>
              {next.note && <span className="text-caption text-contrast-ink/70">{next.note}</span>}
            </div>
          )}
        </div>
      </div>
    </section>
  )
}
