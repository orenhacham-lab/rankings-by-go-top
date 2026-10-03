'use client'

/**
 * "Monthly reports" on the Reports screen, above the reports the owner builds by
 * hand (which keep working exactly as before, below it).
 *
 * The reports are made on the 1st by the monthly cron; this section only reads
 * them. No button makes a report for a month that has one, and no date is
 * picked: the months are the list. The one action is "create last month's
 * report now", offered only when the last finished month has none.
 *
 * Renders nothing while the report tables are not installed.
 */
import { CalendarRange, Plus } from 'lucide-react'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { MonthlyGetResponse } from '@/lib/reports/monthly/http'
import Button from '@/components/ui/Button'
import { Skeleton } from '@/components/ui/Skeleton'
import { PositionChange } from '@/components/ui/StatusBadge'
import { WidgetError } from '@/components/dashboard/ui'
import { cn } from '@/lib/utils'
import { count, dayMonth, monthName, monthlyCopy } from './copy'
import MonthlyReportView from './MonthlyReportView'
import { useMonthlyReports } from './useMonthlyReports'
import type { useToasts } from '@/components/ui/Toast'

export const MONTHLY_REPORTS_ANCHOR = 'monthly-reports'

export function MonthlyReportsBody({ body, language: l, projectLabel, selected, onSelect, onGenerate, generating, switching }: {
  body: MonthlyGetResponse
  language: PublicLocale
  projectLabel: string
  selected: string | null
  onSelect: (month: string) => void
  onGenerate: () => void
  generating: 'idle' | 'busy' | 'failed'
  switching?: boolean
}) {
  const t = monthlyCopy(l)
  const current = body.report?.month ?? selected
  const nextDate = dayMonth(body.nextReportAt, l)

  const missing = body.missingMonth && (
    <div data-monthly-missing={body.missingMonth} className="flex flex-wrap items-center justify-between gap-3 rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:px-6">
      <div className="min-w-0 max-w-2xl">
        <p className="text-copy font-semibold text-ink">{t.missingTitle(monthName(body.missingMonth, l))}</p>
        <p className="mt-0.5 max-w-prose text-copy text-muted">{t.missingBody}</p>
        {generating === 'failed' && <p role="alert" className="mt-1 text-caption font-medium text-bad">{t.missingFailed}</p>}
      </div>
      <Button size="sm" onClick={onGenerate} loading={generating === 'busy'}>
        <Plus aria-hidden="true" className="size-4" /> {t.missingAction(monthName(body.missingMonth, l))}
      </Button>
    </div>
  )

  if (body.months.length === 0) {
    return (
      <div className="space-y-4">
        {missing}
        <div data-monthly-first="" className="grid gap-4 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6 md:grid-cols-[auto_minmax(0,1fr)]">
          <span aria-hidden="true" className="grid size-10 place-items-center rounded-inset bg-action-soft text-action">
            <CalendarRange className="size-5" />
          </span>
          <div className="min-w-0">
            {/* With last month missing, the banner above is the action; this card only
                says what a report holds and that the next one needs no click. */}
            <h3 className="text-section font-semibold text-ink">{body.missingMonth ? t.insideTitle : t.firstTitle(nextDate)}</h3>
            <p className="mt-1 max-w-prose text-copy text-muted">
              {body.missingMonth ? t.insideBody(nextDate) : t.firstBody(monthName(prevMonthKey(body.nextReportAt), l))}
            </p>
            <ul className="mt-3 grid gap-x-6 gap-y-1.5 sm:grid-cols-2">
              {t.firstList.map((item) => (
                <li key={item} className="flex items-center gap-2 text-copy text-body">
                  <span aria-hidden="true" className="size-1.5 shrink-0 rounded-pill bg-action" />
                  {item}
                </li>
              ))}
            </ul>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {missing}
      <div className="grid gap-5 lg:grid-cols-[13rem_minmax(0,1fr)] lg:items-start">
        <nav aria-label={t.monthsLabel} className="lg:sticky lg:top-20">
          <p className="mb-2 text-overline font-semibold uppercase tracking-wide text-muted">{t.monthsLabel}</p>
          <ul className="flex gap-2 overflow-x-auto pb-1 lg:flex-col lg:overflow-visible lg:pb-0">
            {body.months.map((m) => {
              const active = m.month === current
              return (
                <li key={m.month} className="shrink-0">
                  <button type="button" onClick={() => onSelect(m.month)} aria-current={active ? 'true' : undefined}
                    data-month={m.month}
                    className={cn(
                      'flex w-full min-w-[10rem] flex-col items-start rounded-inset border px-3.5 py-2.5 text-start transition-[background-color,border-color,box-shadow] duration-150 ease-snappy',
                      'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
                      active ? 'border-action bg-surface shadow-control' : 'border-line bg-surface hover:border-line-strong',
                    )}>
                    <span className={cn('text-copy font-semibold', active ? 'text-action' : 'text-ink')}>{monthName(m.month, l)}</span>
                    <span className="mt-0.5 flex flex-wrap items-center gap-x-2 text-caption tabular-nums text-muted [&>span]:text-caption">
                      <span>{t.tiles.firstPage}: {count(m.firstPageEnd, l)}</span>
                      {m.improvedCount > 0 && <PositionChange change={m.improvedCount} />}
                      {m.droppedCount > 0 && <PositionChange change={-m.droppedCount} />}
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
          <p className="mt-3 hidden text-caption text-muted lg:block">{t.nextReport(nextDate)}</p>
        </nav>
        <div className={cn('min-w-0 transition-opacity duration-150', switching && 'opacity-60')} aria-busy={switching || undefined}>
          {body.report ? (
            <MonthlyReportView key={body.report.month} data={body.report.data} generatedAt={body.report.generatedAt}
              generatedBy={body.report.generatedBy} language={l} projectLabel={projectLabel} />
          ) : null}
        </div>
      </div>
    </div>
  )
}

/** The month a report due at `iso` will cover: the one before it. */
function prevMonthKey(iso: string): string {
  const d = new Date(iso)
  const prev = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - 1, 1))
  return `${prev.getUTCFullYear()}-${String(prev.getUTCMonth() + 1).padStart(2, '0')}`
}

export default function MonthlyReports({ projectId, projectLabel, language, toasts }: {
  projectId: string | null
  projectLabel: string
  language: PublicLocale
  /** The screen's toasts: making a report shows its progress and outcome there. */
  toasts?: ReturnType<typeof useToasts>
}) {
  const t = monthlyCopy(language)
  const { load, switching, month, setMonth, reload, generate, generating } = useMonthlyReports(projectId)
  const onGenerate = () => {
    if (!toasts) { void generate(); return }
    toasts.track(t.generateToast, async () => { if (!(await generate())) throw new Error('not generated') }).catch(() => {})
  }
  if (!projectId || load.status === 'unavailable') return null

  return (
    <section id={MONTHLY_REPORTS_ANCHOR} aria-labelledby="monthly-reports-title" data-monthly-reports={load.status} className="mb-8 scroll-mt-20">
      <div className="mb-4 flex items-start gap-3">
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action">
          <CalendarRange strokeWidth={2} className="size-5" />
        </span>
        <div className="min-w-0">
          <h2 id="monthly-reports-title" className="text-section font-semibold text-ink">{t.title}</h2>
          <p className="mt-0.5 max-w-prose text-copy text-muted">{t.subtitle}</p>
        </div>
      </div>
      {load.status === 'loading' && (
        <div className="space-y-3 rounded-card border border-line bg-surface p-5 shadow-card sm:p-6" role="status" aria-busy="true">
          <span className="sr-only">{t.loading}</span>
          <Skeleton className="h-5 w-48" />
          <Skeleton className="h-4 w-full max-w-prose" />
          <Skeleton className="h-4 w-2/3 max-w-prose" />
        </div>
      )}
      {load.status === 'error' && (
        <div className="rounded-card border border-line bg-surface p-5 shadow-card sm:p-6">
          <WidgetError message={t.loadError} retryLabel={t.retry} onRetry={reload} />
        </div>
      )}
      {load.status === 'ready' && (
        <MonthlyReportsBody body={load.body} language={language} projectLabel={projectLabel} selected={month}
          onSelect={setMonth} onGenerate={onGenerate} generating={generating} switching={switching} />
      )}
    </section>
  )
}
