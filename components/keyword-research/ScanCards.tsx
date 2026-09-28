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
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan
  const pulse = 'animate-pulse motion-reduce:animate-none'
  return (
    <section data-scan-state="loading" role="status" aria-busy="true" className="mb-8">
      <span className="sr-only">{t.pending}</span>
      <Card tone="ink" padding={false} className="relative isolate overflow-hidden shadow-pop">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_18rem_at_85%_-10%,color-mix(in_srgb,var(--color-action)_38%,transparent),transparent_70%),radial-gradient(28rem_14rem_at_0%_110%,color-mix(in_srgb,var(--color-commit)_16%,transparent),transparent_70%)]"
        />
        <div aria-hidden="true" className="flex items-center justify-between gap-6 px-5 pb-16 pt-5 sm:px-8 sm:pb-20 sm:pt-7">
          <div className="min-w-0 flex-1">
            <span className={cn('block h-6 w-28 rounded-pill bg-contrast-ink/10', pulse)} />
            <span className={cn('mt-5 block h-9 w-3/4 max-w-xl rounded-control bg-contrast-ink/10', pulse)} />
            <span className={cn('mt-3 block h-4 w-1/3 rounded-control bg-contrast-ink/10', pulse)} />
          </div>
          <span className={cn('hidden size-32 shrink-0 rounded-pill border-[10px] border-contrast-ink/10 md:block', pulse)} />
        </div>
      </Card>
      <div aria-hidden="true" className="relative z-10 -mt-11 grid grid-cols-2 gap-3 px-2 sm:-mt-12 sm:px-4 lg:grid-cols-4">
        {[0, 1, 2, 3].map((i) => (
          <div key={i} className="rounded-card border border-line bg-surface p-4 shadow-pop">
            <span className={cn('block h-3.5 w-20 rounded-pill bg-sunk', pulse)} />
            <span className={cn('mt-4 block h-7 w-16 rounded-control bg-sunk', pulse)} />
            <span className={cn('mt-3 block h-3 w-28 max-w-full rounded-pill bg-sunk', pulse)} />
          </div>
        ))}
      </div>
      <div aria-hidden="true" className="mt-8 flex items-center justify-between gap-3 rounded-card border border-line bg-surface px-3 py-2.5 shadow-card sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <span className="size-9 shrink-0 rounded-inset bg-action-soft" />
          <span className={cn('block h-3.5 w-44 rounded-pill bg-sunk', pulse)} />
        </div>
        <span className={cn('h-9 w-24 shrink-0 rounded-control bg-sunk', pulse)} />
      </div>
    </section>
  )
}

export function ScanPendingCard() {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan
  return (
    <section data-scan-state="pending" className="mb-6" aria-busy="true">
      <Card tone="ink" className="relative isolate overflow-hidden p-5 shadow-pop sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_18rem_at_85%_-10%,color-mix(in_srgb,var(--color-action)_38%,transparent),transparent_70%),radial-gradient(28rem_14rem_at_0%_110%,color-mix(in_srgb,var(--color-commit)_16%,transparent),transparent_70%)]"
        />
        <span className="block h-5 w-28 rounded-pill bg-contrast-ink/10" aria-hidden="true" />
        <span className="mt-5 block h-8 w-3/4 max-w-xl rounded-control bg-contrast-ink/10" aria-hidden="true" />
        <span className="mt-3 block h-4 w-1/3 rounded-control bg-contrast-ink/10" aria-hidden="true" />
        <span className="sr-only">{t.pending}</span>
      </Card>
    </section>
  )
}

export function ScanRunningCard({ seedKeywords, steps }: { seedKeywords: string[]; steps: ProgressStep[] }) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.running
  return (
    <section data-scan-state="running" className="mb-6">
      <Card tone="ink" className="relative isolate overflow-hidden p-5 shadow-pop sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_18rem_at_85%_-10%,color-mix(in_srgb,var(--color-action)_38%,transparent),transparent_70%),radial-gradient(28rem_14rem_at_0%_110%,color-mix(in_srgb,var(--color-commit)_16%,transparent),transparent_70%)]"
        />
        <span className="inline-flex items-center gap-2 rounded-pill bg-contrast-ink/10 px-2.5 py-1 text-caption font-semibold ring-1 ring-contrast-ink/10">
          <span className="size-1.5 rounded-pill bg-commit" aria-hidden="true" />
          {t.badge}
        </span>
        <h2 className="mt-5 text-title font-bold tracking-tight">{t.title}</h2>
        <ol className="mt-5 grid gap-2 sm:grid-cols-3">
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
      </Card>
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
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan.empty
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
