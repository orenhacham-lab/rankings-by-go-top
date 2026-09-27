'use client'

/**
 * Row 5 of the AI-visibility tab: the four AI-readiness checks the seeding scan
 * ran on the site (schema, questions and answers, AI crawlers in robots.txt,
 * llms.txt), each with why it matters and how to fix it.
 *
 * NOT CHECKED IS NOT FAILED. A Shopify store in development answers every
 * visitor with its password page, so the scan could not see the store: every
 * check says "not checked, the store is password protected", never a failure
 * the merchant would try to fix. The same holds for a run that ended before
 * measuring them.
 *
 * The checks change only when the site is scanned again, which settings does;
 * this card links there and starts nothing itself. There is no llms.txt
 * generator here (plan section 5, "not built now"): only the check.
 */
import Link from 'next/link'
import { AlertTriangle, CheckCircle2, Clock, Lock, MinusCircle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatWhen } from './OverviewRows'
import type { ReadinessRowStatus, ReadinessView } from './overview-model'

const STATUS: Record<ReadinessRowStatus, { Icon: typeof CheckCircle2; tone: string; chip: string }> = {
  pass: { Icon: CheckCircle2, tone: 'text-ok', chip: 'bg-ok-soft text-ok' },
  fail: { Icon: AlertTriangle, tone: 'text-warn', chip: 'bg-warn-soft text-warn' },
  not_checked: { Icon: MinusCircle, tone: 'text-muted', chip: 'bg-sunk text-muted' },
  pending: { Icon: Clock, tone: 'text-info', chip: 'bg-info-soft text-info' },
}

export default function ReadinessCard({
  view,
  scannedAt,
  settingsHref,
}: {
  view: ReadinessView
  scannedAt: string | null
  settingsHref: string
}) {
  const { language } = useDashboardLanguage()
  const c = getDashboardDictionary(language).aiVisibilityOverview
  const label: Record<ReadinessRowStatus, string> = {
    pass: c.statusPass,
    fail: c.statusFail,
    not_checked: c.statusNotChecked,
    pending: c.statusPending,
  }
  const banner =
    view.state === 'locked' ? { Icon: Lock, title: c.readinessLockedTitle, body: c.readinessLockedBody }
    : view.state === 'pending' ? { Icon: Clock, title: c.readinessPendingTitle, body: c.readinessPendingBody }
    : view.state === 'missing' ? { Icon: MinusCircle, title: c.readinessMissingTitle, body: c.readinessMissingBody }
    : null

  return (
    <section
      id="ai-readiness"
      aria-labelledby="ai-readiness-title"
      data-ai-readiness={view.state}
      className="min-w-0 rounded-card border border-line bg-surface p-5 shadow-card"
    >
      <header className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="ai-readiness-title" className="text-section font-semibold text-ink">{c.readinessTitle}</h2>
          <p className="mt-0.5 text-caption text-muted">{c.readinessSubtitle}</p>
        </div>
        {view.state === 'measured' && (
          <span
            // Joined by hand: tailwind-merge reads text-caption and text-ok as one group and would drop the size.
            className={`shrink-0 rounded-pill px-2.5 py-1 text-caption font-semibold tabular-nums ${
              view.passed === view.total ? 'bg-ok-soft text-ok' : 'bg-warn-soft text-warn'
            }`}
            dir="ltr"
          >
            {c.readinessPassed(view.passed, view.total)}
          </span>
        )}
      </header>

      {banner && (
        <div className="mt-4 flex items-start gap-3 rounded-control bg-sunk p-3" data-ai-readiness-banner="">
          <banner.Icon size={18} className="mt-0.5 shrink-0 text-muted" aria-hidden="true" />
          <div className="min-w-0">
            <p className="text-copy font-semibold text-ink">{banner.title}</p>
            <p className="text-caption text-body">{banner.body}</p>
          </div>
        </div>
      )}

      <ul className="mt-4 grid gap-3 md:grid-cols-2">
        {view.rows.map((row) => {
          const s = STATUS[row.status]
          const copy = c.checks[row.id]
          return (
            <li
              key={row.id}
              data-ai-readiness-check={row.id}
              data-status={row.status}
              className={cn('min-w-0 rounded-control border p-3.5', row.status === 'fail' ? 'border-warn/30' : 'border-line')}
            >
              <div className="flex items-start justify-between gap-2">
                <p className="flex min-w-0 items-start gap-2 text-copy font-semibold text-ink">
                  <s.Icon size={16} className={cn('mt-1 shrink-0', s.tone)} aria-hidden="true" />
                  <span className="min-w-0">{copy.title}</span>
                </p>
                <span className={`shrink-0 rounded-pill px-2 py-0.5 text-caption font-medium ${s.chip}`}>{label[row.status]}</span>
              </div>
              <dl className="mt-2 space-y-1.5 ps-6 text-caption">
                <div>
                  <dt className="font-medium text-ink">{c.whyLabel}</dt>
                  <dd className="text-body">{copy.why}</dd>
                </div>
                <div className={cn(row.status === 'pass' && 'opacity-70')}>
                  <dt className="font-medium text-ink">{c.fixLabel}</dt>
                  <dd className="text-body">{copy.fix}</dd>
                </div>
              </dl>
            </li>
          )
        })}
      </ul>

      <p className="mt-4 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted">
        {scannedAt && view.state === 'measured' && <span>{c.checkedOn(formatWhen(scannedAt, language))}</span>}
        {scannedAt && view.state === 'measured' && <span aria-hidden="true">·</span>}
        <span>{c.rescanHint}</span>
        <Link href={settingsHref} className="font-medium text-action hover:underline">{c.rescanLink}</Link>
      </p>
    </section>
  )
}
