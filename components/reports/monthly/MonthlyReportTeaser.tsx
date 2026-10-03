'use client'

/**
 * The dashboard's pointer to the latest monthly report: the month, three
 * figures, and a link to the full report on the Reports screen. Before the first
 * report it says when that report is made. Renders nothing while the report
 * tables are not installed, or when the read failed (the dashboard has enough
 * to say without it).
 */
import { CalendarRange } from 'lucide-react'
import type { PublicLocale } from '@/lib/i18n/locales'
import type { MonthlyGetResponse } from '@/lib/reports/monthly/http'
import { HeaderLink, LinkButton, Widget, WidgetEmpty, WidgetLoading } from '@/components/dashboard/ui'
import { count, dayMonth, monthName, monthlyCopy } from './copy'
import { MONTHLY_REPORTS_ANCHOR } from './MonthlyReports'
import { useMonthlyReports } from './useMonthlyReports'

const REPORTS_HREF = `/reports#${MONTHLY_REPORTS_ANCHOR}`

export function MonthlyTeaserBody({ body, language: l }: { body: MonthlyGetResponse; language: PublicLocale }) {
  const t = monthlyCopy(l)
  const latest = body.months[0]
  if (!latest) {
    return (
      <WidgetEmpty icon={<CalendarRange size={16} />}
        body={body.missingMonth ? t.teaser.missingBody(monthName(body.missingMonth, l)) : t.teaser.firstBody(dayMonth(body.nextReportAt, l))}
        action={body.missingMonth ? <LinkButton href={REPORTS_HREF} size="sm" variant="secondary">{t.teaser.goToReports}</LinkButton> : undefined} />
    )
  }
  const figures: [string, string, string?][] = [
    [t.teaser.firstPage, count(latest.firstPageEnd, l)],
    [t.teaser.improved, count(latest.improvedCount, l), latest.improvedCount > 0 ? 'text-ok' : undefined],
    [t.teaser.published, count(latest.published, l)],
  ]
  return (
    <div data-teaser-month={latest.month} className="space-y-3">
      <p className="text-copy font-semibold text-ink">{monthName(latest.month, l)}</p>
      <dl className="grid grid-cols-3 gap-2">
        {figures.map(([label, value, tone]) => (
          <div key={label} className="min-w-0 rounded-inset bg-sunk px-2.5 py-2">
            <dt className="truncate text-caption text-muted">{label}</dt>
            <dd className={`mt-0.5 text-section font-semibold tabular-nums ${tone ?? 'text-ink'}`}>{value}</dd>
          </div>
        ))}
      </dl>
      <p className="text-caption text-muted">{t.nextReport(dayMonth(body.nextReportAt, l))}</p>
    </div>
  )
}

/** `onlyWithData`: nothing until a report exists (the dashboard shows widgets that have something to show). */
export default function MonthlyReportTeaser({ projectId, language, onlyWithData = false }: { projectId: string; language: PublicLocale; onlyWithData?: boolean }) {
  const t = monthlyCopy(language)
  const { load } = useMonthlyReports(projectId)
  if (load.status === 'unavailable' || load.status === 'error') return null
  if (onlyWithData && !(load.status === 'ready' && load.body.months.length > 0)) return null
  return (
    <Widget id="monthly-report" state={load.status} title={t.teaser.title} icon={<CalendarRange size={16} strokeWidth={2} />}
      action={load.status === 'ready' && load.body.months.length > 0 ? <HeaderLink href={REPORTS_HREF}>{t.teaser.open}</HeaderLink> : undefined}>
      {load.status === 'loading' ? <WidgetLoading lines={2} label={t.teaser.title} /> : <MonthlyTeaserBody body={load.body} language={language} />}
    </Widget>
  )
}
