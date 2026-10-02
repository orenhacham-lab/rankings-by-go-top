'use client'

/**
 * "You vs. competitors": for each competitor, on how many keywords it ranks
 * above the project, from each keyword's latest check. One component, two
 * sizes: `full` above the keywords table, `compact` as a dashboard card.
 *
 * It never moves what is below it: every state (loading, no competitors, an
 * error, the numbers) renders inside the same reserved height, so the table
 * or the cards underneath stay where they are when the data arrives.
 */
import SiteAvatar from '@/components/ui/SiteAvatar'
import Link from 'next/link'
import { CompetitorIcon } from './CompetitorIcon'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { CompetitorStanding } from '@/lib/competitors/comparison'
import type { CompetitorView } from './useCompetitorComparison'

/** The product allows three active competitors; a longer legacy list shows its top three. */
const SHOWN = 3

export default function CompetitorSummary({ view, variant, className }: {
  view: CompetitorView
  variant: 'full' | 'compact'
  className?: string
}) {
  const { language } = useDashboardLanguage()
  const c = getDashboardDictionary(language).competitors
  const compact = variant === 'compact'
  const titleId = compact ? 'competitor-summary-compact-title' : 'competitor-summary-title'

  return (
    <section
      aria-labelledby={titleId}
      data-competitor-summary={view.status}
      className={cn('rounded-card border border-line bg-surface', compact && 'shadow-card', className)}
    >
      <div
        className={cn(
          'grid gap-x-8 gap-y-3 p-4',
          compact ? 'sm:p-5' : 'lg:grid-cols-[minmax(0,1fr)_minmax(0,2.4fr)] lg:items-center',
        )}
      >
        <header className={cn('min-w-0', compact && 'flex items-start justify-between gap-3')}>
          <div className="min-w-0">
            <h2 id={titleId} className="flex items-center gap-2 text-section font-semibold text-ink">
              <CompetitorIcon size={16} strokeWidth={2} className="shrink-0 text-muted" aria-hidden="true" />
              {c.title}
            </h2>
            {view.status !== 'no_competitors' && (
              <p className="mt-1 text-caption text-muted">{compact ? c.compactSubtitle : c.subtitle}</p>
            )}
          </div>
          {compact && (
            <Link href="/keywords" className="shrink-0 text-copy font-medium text-action hover:underline">
              {c.openKeywords}
            </Link>
          )}
        </header>

        {/* The reserved height: every state below fits in it. */}
        <div className="flex min-h-[6rem] items-center lg:min-h-[4.5rem]" aria-busy={view.status === 'loading'}>
          <SummaryBody view={view} c={c} />
        </div>
      </div>
    </section>
  )
}

type Copy = ReturnType<typeof getDashboardDictionary>['competitors']

function SummaryBody({ view, c }: { view: CompetitorView; c: Copy }) {
  if (view.status === 'loading') {
    return (
      <div className="grid w-full grid-cols-3 gap-4 sm:gap-6">
        <span className="sr-only">{c.loading}</span>
        {Array.from({ length: SHOWN }, (_, i) => (
          <div key={i} aria-hidden="true" className="min-w-0">
            <div className="h-4 w-3/4 rounded-control bg-sunk" />
            <div className="mt-2 h-6 w-1/3 rounded-control bg-sunk" />
            <div className="mt-2 h-1.5 w-full rounded-pill bg-sunk" />
          </div>
        ))}
      </div>
    )
  }

  if (view.status === 'error') {
    return (
      <p className="text-copy text-muted">
        {c.loadFailed}{' '}
        <button type="button" onClick={view.retry} className="font-medium text-action hover:underline">
          {c.retry}
        </button>
      </p>
    )
  }

  if (view.status === 'no_competitors') {
    return (
      <p className="text-copy text-body">
        {view.manageHref ? c.noCompetitors : c.noCompetitorsUnavailable}{' '}
        {view.manageHref && (
          <Link href={view.manageHref} className="whitespace-nowrap font-medium text-action hover:underline">
            {c.manageCompetitors}
          </Link>
        )}
      </p>
    )
  }

  const comparison = view.comparison
  if (!comparison || comparison.comparedKeywords === 0) {
    return (
      <div className="min-w-0">
        <p className="text-copy text-body">{c.waitingForScan}</p>
        <p className="mt-1 truncate text-caption text-muted" dir="ltr">
          {view.competitors.map((x) => x.domain).join(' · ')}
        </p>
      </div>
    )
  }

  const shown = comparison.standings.slice(0, SHOWN)
  const hidden = comparison.standings.length - shown.length
  return (
    <div className="w-full">
      <ul className="grid w-full grid-cols-3 gap-4 sm:gap-6">
        {shown.map((s) => <StandingBlock key={s.domain} standing={s} c={c} />)}
      </ul>
      {hidden > 0 && (
        <p className="mt-1 text-caption text-muted">
          <Link href="/keywords" className="hover:underline">{c.moreCompetitors(hidden)}</Link>
        </p>
      )}
    </div>
  )
}

function StandingBlock({ standing: s, c }: { standing: CompetitorStanding; c: Copy }) {
  const sentence = s.compared > 0 ? c.aboveYouSentence(s.name, s.ahead, s.compared) : c.notComparedSentence(s.name)
  const share = s.compared > 0 ? Math.round((s.ahead / s.compared) * 100) : 0
  return (
    <li className="min-w-0" title={sentence}>
      <p className="flex min-w-0 items-center gap-1.5 text-copy font-medium text-ink">
        <SiteAvatar domain={s.domain} name={s.name} size="xs" />
        <span className="truncate">{s.name}</span>
        {s.name !== s.domain && (
          <span dir="ltr" className="hidden truncate text-caption font-normal text-muted sm:inline">{s.domain}</span>
        )}
      </p>
      {s.compared > 0 ? (
        <p className="mt-1 flex items-baseline gap-1.5" aria-hidden="true">
          <span className="text-title font-semibold leading-none text-ink">{s.ahead}</span>
          <span className="truncate text-caption text-muted">{c.ofKeywords(s.compared)}</span>
        </p>
      ) : (
        <p className="mt-1 text-copy text-muted" aria-hidden="true">{c.notComparedYet}</p>
      )}
      <div
        role="meter"
        aria-label={sentence}
        aria-valuemin={0}
        aria-valuemax={Math.max(s.compared, 1)}
        aria-valuenow={s.ahead}
        className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-action-soft"
      >
        <div className="h-full rounded-pill bg-action transition-[width] duration-300" style={{ width: `${share}%` }} />
      </div>
    </li>
  )
}
