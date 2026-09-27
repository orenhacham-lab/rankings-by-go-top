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

export function ScanPendingCard() {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).keywordResearchScan
  return (
    <section data-scan-state="pending" className="mb-6" aria-busy="true">
      <Card tone="ink" className="relative isolate overflow-hidden p-5 shadow-pop sm:p-8">
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_18rem_at_85%_-10%,rgb(99_130_246/0.38),transparent_70%),radial-gradient(28rem_14rem_at_0%_110%,rgb(240_176_63/0.16),transparent_70%)]"
        />
        <span className="block h-5 w-28 rounded-pill bg-white/10" aria-hidden="true" />
        <span className="mt-5 block h-8 w-3/4 max-w-xl rounded-control bg-white/10" aria-hidden="true" />
        <span className="mt-3 block h-4 w-1/3 rounded-control bg-white/10" aria-hidden="true" />
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
          className="pointer-events-none absolute inset-0 -z-10 bg-[radial-gradient(40rem_18rem_at_85%_-10%,rgb(99_130_246/0.38),transparent_70%),radial-gradient(28rem_14rem_at_0%_110%,rgb(240_176_63/0.16),transparent_70%)]"
        />
        <span className="inline-flex items-center gap-2 rounded-pill bg-white/10 px-2.5 py-1 text-xs font-semibold ring-1 ring-white/10">
          <span className="size-1.5 animate-pulse rounded-full bg-commit" aria-hidden="true" />
          {t.badge}
        </span>
        <h2 className="mt-5 text-xl font-bold leading-tight sm:text-[1.75rem] sm:leading-9">{t.title}</h2>
        <ol className="mt-5 grid gap-2 sm:grid-cols-3">
          {steps.map((s) => (
            <li
              key={s.step}
              data-step={s.step}
              data-step-state={s.state}
              className={cn(
                'flex items-center gap-2.5 rounded-xl px-3 py-2.5 text-sm ring-1 transition-colors',
                s.state === 'running' ? 'bg-white/15 text-contrast-ink ring-white/25' : s.state === 'done' ? 'bg-white/10 text-contrast-ink ring-white/10' : 'bg-white/5 text-contrast-ink/70 ring-white/5',
              )}
            >
              <span className={cn('grid size-6 shrink-0 place-items-center rounded-full', s.state === 'done' ? 'bg-ok-soft text-ok' : 'bg-white/10')} aria-hidden="true">
                {s.state === 'done' ? <Check size={12} strokeWidth={3} /> : s.state === 'running' ? <Loader2 size={12} className="animate-spin" /> : <span className="size-1 rounded-full bg-current" />}
              </span>
              <span className="min-w-0 flex-1">{t.steps[s.step]}</span>
              <span className="sr-only">{t.stepState[s.state]}</span>
            </li>
          ))}
        </ol>
        <div className="mt-5 border-t border-white/10 pt-4">
          <p className="flex items-center gap-2 text-xs font-medium text-contrast-ink/70">
            <Sprout size={14} strokeWidth={2} aria-hidden="true" />
            {t.seedsLabel}
          </p>
          {seedKeywords.length > 0 ? (
            <ul className="mt-3 flex flex-wrap gap-2" data-seed-keywords="">
              {seedKeywords.map((k) => (
                <li key={k} className="rounded-pill border border-white/15 bg-white/5 px-3 py-1 text-sm font-medium">{k}</li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-contrast-ink/80">{t.noSeeds}</p>
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
          <span className="grid size-11 shrink-0 place-items-center rounded-xl bg-warn-soft text-warn ring-1 ring-warn/15" aria-hidden="true">
            <SearchX size={20} strokeWidth={2} />
          </span>
          <div className="min-w-0 flex-1">
            <h2 className="text-lg font-bold leading-6 text-ink">{t.title}</h2>
            <p className="mt-1 text-sm text-muted">{t.reasons[reason]}</p>
            {reason === 'unreadable' && (
              <Button variant="secondary" size="sm" className="mt-3" onClick={onRetry}>{t.retry}</Button>
            )}
            {seedKeywords.length > 0 && (
              <div className="mt-4 flex flex-wrap items-center gap-2">
                <span className="text-xs font-medium text-muted">{t.seedsLabel}</span>
                <ul className="contents">
                  {seedKeywords.map((k) => (
                    <li key={k} className="rounded-pill border border-line bg-sunk px-2.5 py-0.5 text-xs text-body">{k}</li>
                  ))}
                </ul>
                <button
                  type="button"
                  onClick={onUseSeeds}
                  className="text-xs font-semibold text-action underline decoration-dotted underline-offset-4 hover:text-action-hover"
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
