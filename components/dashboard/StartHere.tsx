'use client'

/**
 * "Start here": the whole dashboard of a project with nothing to show yet
 * (lib/dashboard/start.ts decides when). One card, a few steps, each with its
 * real state, and ONE main button, on the first step still open. The other open
 * steps link to their screen quietly; a finished step says so and links to what
 * it produced.
 *
 * The scan step runs the site's scan in place (the same start as the mapping
 * banner and the settings screen: POST /api/projects/[id]/seed, with every check
 * that route makes) and shows its four steps moving while it runs. Nothing here
 * writes anything else: the other steps open the screens that do them.
 */
import Link from 'next/link'
import { Check, FileText, KeyRound, Loader2, Plug, Telescope } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Reveal } from '@/components/ui/motion'
import { MappingNotice, MappingSteps } from '@/components/mapping/MappingBanner'
import type { MappingControl } from '@/components/mapping/useMapping'
import { nextStartStep, startProgress, type StartStep, type StartStepKey } from '@/lib/dashboard/start'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import { cn } from '@/lib/utils'
import { linkButtonClass } from './ui'

const ICONS: Record<StartStepKey, LucideIcon> = { scan: Telescope, keywords: KeyRound, connect: Plug, article: FileText }

export interface StartHrefs {
  /** Where each step is done. */
  todo: Record<StartStepKey, string>
  /** What a finished step produced. */
  done: Record<StartStepKey, string>
}

export default function StartHere({ t, steps, domain, hrefs, mapping, locale }: {
  t: DashboardDictionary['dashboardStart']
  steps: readonly StartStep[]
  domain: string
  hrefs: StartHrefs
  /** The site's scan, when this account can run it. */
  mapping: MappingControl | null
  locale: Locale
}) {
  const next = nextStartStep(steps)
  const { done, total } = startProgress(steps)
  return (
    <section
      aria-labelledby="dashboard-start-title"
      data-dashboard-widget="start"
      data-tour-variant="start"
      data-state={next?.key ?? 'done'}
      className="overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div className="border-b border-line bg-action-soft/50 px-5 py-5 sm:px-6">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
          <div className="min-w-0">
            <h2 id="dashboard-start-title" className="text-title font-bold text-ink text-balance">{t.title}</h2>
            <p className="mt-1 max-w-2xl text-copy text-body text-pretty">
              {t.subtitle(domain)}
            </p>
          </div>
          <p className="shrink-0 text-caption font-semibold text-action tabular-nums">{t.progress(done, total)}</p>
        </div>
        <div
          role="progressbar"
          aria-label={t.progress(done, total)}
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={done}
          className="mt-4 h-1.5 overflow-hidden rounded-pill bg-surface"
        >
          <div className="h-full rounded-pill bg-action transition-[width] duration-500" style={{ width: `${Math.max(4, (done / Math.max(1, total)) * 100)}%` }} />
        </div>
      </div>

      <ol className={cn('grid gap-px bg-line', steps.length === 3 ? 'lg:grid-cols-3' : steps.length === 2 ? 'md:grid-cols-2' : '')}>
        {steps.map((step, i) => (
          <li key={step.key} className="bg-surface">
            <Reveal index={i} data-start-step={step.key} data-state={step.state} className="flex h-full flex-col gap-3 p-5 sm:p-6">
              <StepBody t={t} step={step} n={i + 1} primary={next?.key === step.key} hrefs={hrefs} mapping={mapping} locale={locale} />
            </Reveal>
          </li>
        ))}
      </ol>
    </section>
  )
}

function StepBody({ t, step, n, primary, hrefs, mapping, locale }: {
  t: DashboardDictionary['dashboardStart']
  step: StartStep
  n: number
  primary: boolean
  hrefs: StartHrefs
  mapping: MappingControl | null
  locale: Locale
}) {
  const copy = t.steps[step.key]
  const Icon = ICONS[step.key]
  const isScan = step.key === 'scan' && mapping !== null
  const running = step.state === 'running'
  const retry = isScan && mapping.mapping.available === true && mapping.mapping.state === 'failed'
  return (
    <>
      <div className="flex items-center gap-3">
        <span
          aria-hidden="true"
          className={cn(
            'grid size-9 shrink-0 place-items-center rounded-pill',
            step.state === 'done' ? 'bg-ok text-surface' : primary || running ? 'bg-action text-action-ink' : 'bg-sunk text-muted ring-1 ring-line',
          )}
        >
          {step.state === 'done' ? <Check size={17} strokeWidth={3} /> : running ? <Loader2 size={17} className="motion-safe:animate-spin" /> : <Icon size={17} strokeWidth={2} />}
        </span>
        <div className="min-w-0">
          <p className="text-overline font-semibold text-muted">{t.stepLabel(n)}</p>
          <h3 className="text-section font-semibold text-ink">{copy.title}</h3>
        </div>
        {step.state === 'done' && <span className="ms-auto shrink-0 rounded-pill bg-ok-soft px-2.5 py-0.5 text-caption font-semibold text-ok">{t.done}</span>}
        {running && <span className="ms-auto shrink-0 rounded-pill bg-action-soft px-2.5 py-0.5 text-caption font-semibold text-action">{t.running}</span>}
      </div>

      <p className="text-copy text-body text-pretty" aria-live={isScan ? 'polite' : undefined}>
        {running && 'runningBody' in copy ? copy.runningBody : copy.body}
      </p>

      {isScan && running && mapping.mapping.available === true && <MappingSteps mapping={mapping.mapping} locale={locale} stacked />}
      {isScan && <MappingNotice control={mapping} locale={locale} />}

      <div className="mt-auto pt-1">
        {step.state === 'done' ? (
          <Link href={hrefs.done[step.key]} className={linkButtonClass('quiet', 'sm')}>{copy.doneLink}</Link>
        ) : running ? null : isScan ? (
          <Button size="md" variant={primary ? 'primary' : 'secondary'} onClick={() => void mapping.start()} loading={mapping.starting} data-start-run-scan="">
            {!mapping.starting && <Telescope size={15} aria-hidden="true" />}
            {retry && 'retry' in copy ? copy.retry : copy.cta}
          </Button>
        ) : (
          <Link href={hrefs.todo[step.key]} className={linkButtonClass(primary ? 'primary' : 'secondary')} data-start-cta={step.key}>
            {copy.cta}
          </Link>
        )}
      </div>
    </>
  )
}
