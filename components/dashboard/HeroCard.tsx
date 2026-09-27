'use client'

/**
 * Widget 2, the opening card: the screen's one dark surface. One big number
 * (keywords on Google's first page), one human sentence about it, one line of
 * news (the latest article, or the biggest ranking move) and the next step.
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

export default function HeroCard({ t, language, domain, rankings, news, seedPhase, next }: {
  t: DashboardDictionary['dashboardHome']
  language: 'he' | 'en'
  domain: string
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

  return (
    <section
      data-dashboard-widget="hero"
      data-state={checked ? 'ranked' : rankings.tracked === 0 ? 'no_keywords' : 'not_checked'}
      aria-label={h.label}
      className="relative overflow-hidden rounded-card bg-contrast p-5 text-contrast-ink shadow-card sm:p-6"
    >
      {/* One quiet shape for depth; never an animation of its own. */}
      <div aria-hidden="true" className="pointer-events-none absolute -end-16 -top-24 h-64 w-64 rounded-pill bg-action/25 blur-3xl" />
      <div className="relative grid gap-5 md:grid-cols-[minmax(0,1fr)_auto] md:items-end">
        <div className="min-w-0">
          <p className="text-caption font-medium uppercase tracking-wide text-contrast-ink/60">
            {h.label} <span dir="ltr" className="normal-case tracking-normal">· {domain}</span>
          </p>
          <p className="mt-3 flex items-baseline gap-3">
            <span className="text-[3.25rem] font-semibold leading-none tabular-nums tracking-tight">{formatCount(big, language)}</span>
            <span className="text-section font-medium text-contrast-ink/70">{unit}</span>
          </p>
          <p className="mt-3 max-w-xl text-copy text-contrast-ink/85">{sentence}</p>
          {news && (
            <p className="mt-3 flex min-w-0 items-center gap-2 text-copy text-contrast-ink/85">
              {news.kind === 'article'
                ? <Newspaper size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-contrast-ink/60" />
                : news.change > 0
                  ? <TrendingUp size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-ok" />
                  : <TrendingDown size={15} strokeWidth={2} aria-hidden="true" className="shrink-0 text-bad" />}
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
            <p data-scan-line={seedPhase ?? ''} className="mt-3 flex items-start gap-2 text-caption text-contrast-ink/75">
              <span aria-hidden="true" className="relative mt-1 flex h-2 w-2 shrink-0">
                <span className="absolute inline-flex h-full w-full animate-ping rounded-pill bg-action opacity-60 motion-reduce:hidden" />
                <span className="relative inline-flex h-2 w-2 rounded-pill bg-action" />
              </span>
              <span>{scanLine}</span>
            </p>
          )}
        </div>
        {next && (
          <div className="flex flex-col items-start gap-1.5 md:items-end">
            <LinkButton href={next.href} variant={next.commit ? 'commit' : 'primary'} className={cn('shadow-card')}>
              {next.label}
            </LinkButton>
            {next.note && <span className="text-caption text-contrast-ink/60">{next.note}</span>}
          </div>
        )}
      </div>
    </section>
  )
}
