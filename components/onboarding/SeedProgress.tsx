'use client'

/**
 * Stage A at work: a dark card in two columns. One column is the step working
 * now, large, with its pulsing icon and what it is doing in the merchant's
 * words; the other is the four steps, each marked as the server reports it.
 *
 * Nothing here advances on a clock. The run is read from the server
 * (useSeedRun), so a step turns done only when it is done, and the one
 * promise made is "it takes up to a minute". A run whose worker stopped
 * (stalled) says so plainly, and that it carries on in the background.
 */
import { Check, Clock, Globe, Info, LoaderCircle, Minus, ScanSearch, Sparkles, Store, Users, X, type LucideIcon } from 'lucide-react'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { dashboardHref } from '@/lib/onboarding/links'
import { activeStep, finishedSteps, STAGE_A_STEPS, stepStatusOf, type StageAStep } from '@/lib/onboarding/summary-view'
import type { SeedRunView, SeedStepStatus } from '@/lib/seed-scan/types'
import { cn } from '@/lib/utils'
import { ActionLink, capsLabel, Eyebrow, isolate } from './parts'

const STEP_ICONS: Record<StageAStep, LucideIcon> = { a1: Globe, a2: Store, a3: ScanSearch, a4: Users }

type Shown = SeedStepStatus | 'now'

function StepMark({ status, index }: { status: Shown; index: number }) {
  const base = 'flex h-6 w-6 shrink-0 items-center justify-center rounded-full'
  if (status === 'done') {
    return (
      <span className={cn(base, 'bg-emerald-400/15 text-emerald-300 ring-1 ring-emerald-400/40')}>
        <Check className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (status === 'failed') {
    return (
      <span className={cn(base, 'bg-rose-400/15 text-rose-300 ring-1 ring-rose-400/40')}>
        <X className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (status === 'skipped') {
    return (
      <span className={cn(base, 'bg-white/5 text-contrast-ink/50 ring-1 ring-white/15')}>
        <Minus className="h-3.5 w-3.5" strokeWidth={3} aria-hidden />
      </span>
    )
  }
  if (status === 'now' || status === 'running') {
    return (
      <span className={cn(base, 'relative bg-action text-action-ink')}>
        <span aria-hidden className="absolute inset-0 animate-ping rounded-full bg-action/60 [animation-duration:1.6s] motion-reduce:animate-none" />
        <span className="relative font-mono text-[11px] font-semibold tabular-nums">{index + 1}</span>
      </span>
    )
  }
  return (
    <span className={cn(base, 'font-mono text-[11px] tabular-nums text-contrast-ink/45 ring-1 ring-white/15')}>{index + 1}</span>
  )
}

export default function SeedProgress({
  run,
  domain,
  projectId,
  reconnecting,
}: {
  /** The run as last read; null for the moment between an accepted start and its first read. */
  run: SeedRunView | null
  domain: string
  /** Null before sign-up (the free check's research): there is no dashboard to send a stalled run to. */
  projectId: string | null
  reconnecting: boolean
}) {
  const { language } = useDashboardLanguage()
  const t = getDashboardDictionary(language).seedOnboarding.progress
  const actions = getDashboardDictionary(language).seedOnboarding.actions

  const claim = run?.trigger === 'claim'
  const active = activeStep(run)
  const finished = finishedSteps(run)
  const total = STAGE_A_STEPS.length
  const position = active ? STAGE_A_STEPS.indexOf(active) + 1 : total
  const stalled = !!run?.stalled

  const Icon = active ? STEP_ICONS[active] : Sparkles
  const title = active ? t.steps[active].title : t.finishingTitle
  const claimLines: Partial<Record<StageAStep, readonly string[]>> = t.claimLines
  const lines: readonly string[] = active ? (claim ? claimLines[active] : undefined) ?? t.steps[active].lines : [t.finishingLine]
  // The bar never sits at zero: this screen shows only while a step is under way.
  const percent = Math.max((finished / total) * 100, 6)

  function shown(step: StageAStep): Shown {
    const status = stepStatusOf(run, step) ?? 'pending'
    if (step === active && (status === 'pending' || status === 'running')) return 'now'
    return status
  }
  const stateLabel = (s: Shown) => (s === 'now' ? t.state.running : t.state[s])

  return (
    <section aria-labelledby="seed-progress-title" className="mx-auto w-full max-w-5xl" data-seed-screen="progress">
      <div className="overflow-hidden rounded-card bg-contrast text-contrast-ink shadow-pop">
        <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 px-5 pt-6 sm:px-8 md:px-10 md:pt-9">
          <div className="min-w-0">
            <Eyebrow className="text-contrast-ink/55">{claim ? t.fromFreeCheck : t.eyebrow}</Eyebrow>
            <h1 id="seed-progress-title" className="mt-2 break-words text-2xl font-bold tracking-tight md:text-[2rem] md:leading-tight">
              {t.title(isolate(domain))}
            </h1>
          </div>
          <p className="inline-flex shrink-0 items-center gap-2 rounded-pill bg-white/[0.07] px-3 py-1.5 text-sm text-contrast-ink/80 ring-1 ring-white/10">
            <Clock className="h-4 w-4" aria-hidden />
            {t.promise}
          </p>
        </header>

        <div className="px-5 pt-6 sm:px-8 md:px-10">
          <div
            role="progressbar"
            aria-label={t.stepsLabel}
            aria-valuemin={0}
            aria-valuemax={total}
            aria-valuenow={finished}
            aria-valuetext={t.stepOf(position, total)}
            className="h-1.5 overflow-hidden rounded-full bg-white/10"
          >
            <div
              className={cn(
                'h-full rounded-full from-action to-indigo-300 transition-[width] duration-700 ease-out',
                // The bar grows from the reading start, so its gradient runs the same way.
                language === 'he' ? 'bg-gradient-to-l' : 'bg-gradient-to-r',
              )}
              style={{ width: `${percent}%` }}
            />
          </div>
        </div>

        <div className="grid md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <div className="px-5 py-7 sm:px-8 md:px-10 md:py-10">
            {/* A screen reader hears each new step once; the pulsing is for the eye only. */}
            <p className="sr-only" aria-live="polite">
              {t.stepOf(position, total)}: {title}
            </p>
            <div key={active ?? 'finishing'} className="animate-pop-in">
              <div className="flex items-center gap-4">
                <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-action/20 text-indigo-200 ring-1 ring-action/40">
                  <span aria-hidden className="absolute inset-1 animate-ping rounded-2xl bg-action/25 [animation-duration:2s] motion-reduce:animate-none" />
                  <Icon className="relative h-6 w-6" aria-hidden />
                </span>
                <div className="min-w-0">
                  <p className={cn('text-xs text-contrast-ink/55', language === 'en' ? 'font-mono' : 'font-medium', capsLabel(language))}>{t.stepOf(position, total)}</p>
                  <h2 className="mt-1 text-xl font-semibold tracking-tight sm:text-2xl md:text-[1.75rem] md:leading-tight">{title}</h2>
                </div>
              </div>
              <p className={cn('mt-8 text-caption font-semibold text-contrast-ink/45', capsLabel(language))}>{t.nowLabel}</p>
              <ul className="mt-3 space-y-3">
                {lines.map((line, i) => (
                  <li
                    key={line}
                    className="animate-pop-in flex items-start gap-3 text-base leading-7 text-contrast-ink/85 [animation-fill-mode:both]"
                    style={{ animationDelay: `${120 + i * 110}ms` }}
                  >
                    <span aria-hidden className="mt-3 h-1.5 w-1.5 shrink-0 rounded-full bg-indigo-300" />
                    {line}
                  </li>
                ))}
              </ul>
            </div>
          </div>

          <div className="border-t border-white/10 px-5 py-7 sm:px-8 md:border-s md:border-t-0 md:px-8 md:py-10">
            <p className={cn('text-caption font-semibold text-contrast-ink/45', capsLabel(language))}>{t.stepsLabel}</p>
            <ol className="mt-4 space-y-1">
              {STAGE_A_STEPS.map((step, i) => {
                const s = shown(step)
                const current = s === 'now'
                return (
                  <li
                    key={step}
                    aria-current={current ? 'step' : undefined}
                    className={cn(
                      'flex items-center gap-3 rounded-control px-3 py-2.5 transition-colors duration-300',
                      current && 'bg-white/[0.07]',
                    )}
                  >
                    <StepMark status={s} index={i} />
                    <span
                      className={cn(
                        'min-w-0 flex-1 text-sm',
                        current ? 'font-semibold text-contrast-ink' : s === 'done' ? 'text-contrast-ink/90' : 'text-contrast-ink/55',
                      )}
                    >
                      {t.steps[step].title}
                    </span>
                    <span className={cn('shrink-0 text-xs', s === 'failed' ? 'text-rose-300' : 'text-contrast-ink/45')}>{stateLabel(s)}</span>
                  </li>
                )
              })}
            </ol>
            {reconnecting && (
              <p className="mt-5 inline-flex items-center gap-2 text-xs text-contrast-ink/60" role="status">
                <LoaderCircle className="h-3.5 w-3.5 animate-spin motion-reduce:animate-none" aria-hidden />
                {t.reconnecting}
              </p>
            )}
          </div>
        </div>

        {stalled && projectId && (
          <div className="flex flex-col gap-4 border-t border-white/10 bg-white/[0.04] px-5 py-5 sm:flex-row sm:items-center sm:justify-between sm:px-8 md:px-10" role="status">
            <div className="flex min-w-0 items-start gap-3">
              <Info className="mt-0.5 h-5 w-5 shrink-0 text-indigo-200" aria-hidden />
              <div className="min-w-0">
                <p className="text-sm font-semibold">{t.stalledTitle}</p>
                <p className="mt-0.5 text-sm leading-6 text-contrast-ink/70">{t.stalledBody}</p>
              </div>
            </div>
            <ActionLink href={dashboardHref(projectId)} variant="onInk" className="shrink-0">
              {actions.dashboard}
            </ActionLink>
          </div>
        )}
      </div>
    </section>
  )
}
