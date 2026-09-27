'use client'

/**
 * Widget 11, the account in brief: the plan, the days left of a trial, and this
 * period's articles and this project's keywords against their limits. DISPLAY
 * ONLY: it changes no plan, price, quota or billing setting, and its one action
 * is a link to the billing screen, which owns all of that.
 *
 * An allowance that could not be read is left out, never shown as zero; an
 * administrator is shown as unlimited.
 */
import Link from 'next/link'
import { CreditCard } from 'lucide-react'
import type { AccountData, Allowance, Section } from '@/lib/dashboard/overview'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { cn } from '@/lib/utils'
import { Widget, WidgetError, WidgetLoading } from './ui'

function Meter({ label, value, allowance }: { label: string; value: string; allowance: Allowance }) {
  const share = allowance.limit > 0 ? Math.min(100, Math.round((allowance.used / allowance.limit) * 100)) : 100
  const full = allowance.used >= allowance.limit
  return (
    <div>
      <div className="flex items-baseline justify-between gap-2">
        <span className="text-caption text-muted">{label}</span>
        <span className="text-copy font-medium tabular-nums text-ink">{value}</span>
      </div>
      <div role="meter" aria-label={`${label}: ${value}`} aria-valuemin={0} aria-valuemax={allowance.limit} aria-valuenow={allowance.used}
        className="mt-1.5 h-1.5 w-full overflow-hidden rounded-pill bg-sunk">
        <div className={cn('h-full rounded-pill', full ? 'bg-commit' : 'bg-action')} style={{ width: `${share}%` }} />
      </div>
    </div>
  )
}

export default function AccountStatus({ t, section, retry }: {
  t: DashboardDictionary['dashboardHome']
  section: Section<AccountData> | null
  retry: () => void
}) {
  const a = t.account
  const state = !section ? 'loading' : section.state
  return (
    <Widget id="account" state={state} title={a.title} icon={<CreditCard size={16} strokeWidth={2} />}
      action={<Link href="/billing" className="shrink-0 text-copy font-medium text-action hover:underline">{a.open}</Link>}>
      {!section && <WidgetLoading lines={2} label={a.title} />}
      {section?.state === 'error' && <WidgetError message={t.loadError} retryLabel={t.actions.retry} onRetry={retry} />}
      {section?.state === 'ready' && (
        <div className="space-y-3">
          <p className="flex flex-wrap items-baseline justify-between gap-2">
            <span className="text-caption text-muted">{a.plan}</span>
            <span data-plan={section.data.plan} className="text-copy font-semibold text-ink">{a.plans[section.data.plan]}</span>
          </p>
          {section.data.trialDaysLeft !== null && (
            <p className="rounded-control bg-commit-soft px-3 py-2 text-caption font-medium text-warn">{a.trialDays(section.data.trialDaysLeft)}</p>
          )}
          {section.data.articles && (
            <Meter label={a.articles} value={a.usage(section.data.articles.used, section.data.articles.limit)} allowance={section.data.articles} />
          )}
          {section.data.keywords && (
            <Meter label={a.keywords} value={a.usage(section.data.keywords.used, section.data.keywords.limit)} allowance={section.data.keywords} />
          )}
        </div>
      )}
    </Widget>
  )
}
