'use client'

/**
 * What the research tab opens with when there is no research to show yet.
 *
 *  - ScanPendingCard: the scan's research is on its way (a placeholder the size of
 *    the context card, so nothing jumps when it arrives).
 *  - ScanRunningCard: the full research is still being found. The site's seed
 *    keywords are already known, so they show at once, with the three steps that
 *    find the rest; the screen fills in by itself when they finish.
 *  - ScanEmptyCard: the scan ended without research. One sentence says why, in our
 *    own words (never a provider's text); the research form is open below it, and
 *    the site's seed keywords can be put into it with one click.
 */
import { Check, Loader2, SearchX, Sprout } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { Skeleton } from '@/components/ui/Skeleton'
import HeroPanel, { HeroBadge } from '@/components/ui/HeroPanel'
import type { EmptyReason, ProgressStep } from '@/lib/keyword-research/scan-state'

/**
 * The tab before its first answer: the project list or the scan's two reads are
 * still on their way, so nobody knows yet which screen this is. It used to render
 * the no-scan screen meanwhile (the open research form and its empty state, in the
 * older look), which a merchant WITH research saw for as long as the reads took,
 * before the research replaced it. Now it is the research screen's own shape: the
 * context card, the four tiles and the folded form, as placeholders, so the
 * research lands where they were. Without research, the form takes their place.
 */
export function ScanLoadingSkeleton() {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).keywordResearchScan
  // The shared Skeleton (final review R34): one shimmer and one radius family, never a
  // raw animate-pulse. On the ink card it is the same shimmer, faded to read as ink.
  const onInk = 'opacity-15'
  return (
    <section data-scan-state="loading" role="status" aria-busy="true" className="mb-8">
      <span className="sr-only">{t.pending}</span>
      <HeroPanel>
        <div aria-hidden="true" className="flex items-center justify-between gap-6 px-5 pb-16 pt-5 sm:px-8 sm:pb-20 sm:pt-7">
          <div className="min-w-0 flex-1">
            <Skeleton className={cn('h-6 w-28 rounded-pill', onInk)} />
            <Skeleton className={cn('mt-5 h-9 w-3/4 max-w-xl', onInk)} />
            <Skeleton className={cn('mt-3 h-4 w-1/3', onInk)} />
          </div>
          <span className="hidden size-32 shrink-0 rounded-pill border-[10px] border-contrast-ink/10 md:block" />
        </div>
      </HeroPanel>
      <div aria-hidden="true" className="relative z-10 -mt-11 grid grid-cols-2 gap-3 px-2 sm:-mt-12 sm:px-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-4 shadow-pop">
            <Skeleton className="h-3.5 w-20 rounded-pill" />
            <Skeleton className="mt-4 h-7 w-16" />
            <Skeleton className="mt-3 h-3 w-28 max-w-full rounded-pill" />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-8 flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-9 shrink-0 rounded-inset bg-action-soft" />
          <Skeleton className="h-3.5 w-44 rounded-pill" />
        </div>
        <Skeleton className="h-9 w-24 shrink-0" />
      </div>
    </section>
  )
}

export function ScanPendingCard() {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).keywordResearchScan
  return (
    <section data-scan-state="pending" className="mb-6" aria-busy="true">
      <HeroPanel className="p-5 sm:p-8">
        <span className="block h-5 w-28 rounded-pill bg-contrast-ink/10" aria-hidden="true" />
        <span className="mt-5 block h-8 w-3/4 max-w-xl rounded-control bg-contrast-ink/10" aria-hidden="true" />
        <span className="mt-3 block h-4 w-1/3 rounded-control bg-contrast-ink/10" aria-hidden="true" />
        <span className="sr-only">{t.pending}</span>
      </HeroPanel>
    </section>
  )
}

export function ScanRunningCard({ seedKeywords, steps }: { seedKeywords: string[]; steps: ProgressStep[] }) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).keywordResearchScan.running
  return (
    <section data-scan-state="running" className="mb-6">
      <HeroPanel className="p-5 sm:p-8">
        <HeroBadge tone="commit" live>{t.badge}</HeroBadge>
        <h2 className="mt-5 text-title font-bold tracking-tight">{t.title}</h2>
        <ol className="stagger-in mt-5 grid gap-2 sm:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.step}
              data-step={s.step}
              data-step-state={s.state}
              className={cn(
                'flex items-center gap-2.5 rounded-inset px-3 py-2.5 text-copy ring-1 transition-colors',
                s.state === 'running' ? 'bg-contrast-ink/15 text-contrast-ink ring-contrast-ink/25' : s.state === 'done' ? 'bg-contrast-ink/10 text-contrast-ink ring-contrast-ink/10' : 'bg-contrast-ink/5 text-contrast-ink/70 ring-contrast-ink/5',
              )}
            >
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-pill', s.state === 'done' ? 'bg-ok-soft text-ok' : 'bg-contrast-ink/10')} aria-hidden="true">
                {s.state === 'done' ? <Check size={12} strokeWidth={3} /> : s.state === 'running' ? <Loader2 size={12} className="animate-spin" /> : <span className="size-1 rounded-pill bg-current" />}
              </span>
              <span className="min-w-0 flex-1">{t.steps[s.step]}</span>
              <span className="sr-only">{t.stepState[s.state]}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 border-t border-contrast-ink/10 pt-4">
          <p className="flex items-center gap-2 text-caption font-medium text-contrast-ink/70">
            <Sprout size={14} strokeWidth={2} aria-hidden="true" />
            {t.seedsLabel}
          </p>
          {seedKeywords.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" data-seed-keywords="">
              {seedKeywords.map((k) => (
                <li key={k} className="rounded-pill border border-contrast-ink/15 bg-contrast-ink/5 px-3 py-1 text-copy font-medium">{k}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-copy text-contrast-ink/80">{t.noSeeds}</p>
          )}
        </div>
      </HeroPanel>
    </section>
  )
}

export function ScanEmptyCard({
  reason, seedKeywords, onRetry, onUseSeeds,
}: {
  reason: EmptyReason
  seedKeywords: string[]
  onRetry: () => void
  onUseSeeds: () => void
}) {
  const { uiLocale } = useDashboardLanguage()
  const t = getDashboardDictionary(uiLocale).keywordResearchScan.empty
  return (
    <section data-scan-state="empty" data-scan-reason={reason} className="mb-6">
      <Card>
        <div className="flex items-start gap-4">
          <span className="grid size-11 shrink-0 place-items-center rounded-inset bg-warn-soft text-warn ring-1 ring-warn/15" aria-hidden="true">
            <SearchX size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-section font-semibold text-ink">{t.title}</h2>
            <p className="mt-1 text-copy text-muted">{t.reasons[reason]}</p>
            {reason === 'unreadable' && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>{t.retry}</Button>
            )}
            {seedKeywords.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-caption font-medium text-muted">{t.seedsLabel}</span>
                <ul className="contents">
                  {seedKeywords.map((k) => (
                    <li key={k} className="rounded-pill border border-line bg-sunk px-2.5 py-0.5 text-caption text-body">{k}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onUseSeeds}
                  className="text-caption font-semibold text-action underline decoration-dotted underline-offset-4 hover:text-action-hover"
                >
                  {t.useSeeds}
                </button>
              </div>
            )}
          </div>
        </div>
      </Card>
    </section>
  )
}
