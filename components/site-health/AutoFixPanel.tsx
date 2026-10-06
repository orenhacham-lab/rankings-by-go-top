'use client'

/**
 * "Automatic fixes" on the site-health screen, above the fix queue: whether the project's switch is
 * on, its last run, and how many fixes it made in the last 14 days, counted from the queue itself.
 * The summary lives here only (no email). Links go to the queue and to the switch in settings.
 * Shown only where the switch exists (its table is installed) and the site is not a Shopify store.
 */
import { useMemo, useState } from 'react'
import Link from 'next/link'
import { Sparkles } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import { SECTION } from '@/components/settings/anchors'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { AUTO_SUMMARY_DAYS, type AutoFixView, type FixJobView } from '@/lib/site-fix/types'

type Copy = DashboardDictionary['siteHealth']['autofix']

/** Automatic fixes applied (and not undone since) in the last AUTO_SUMMARY_DAYS. */
export function autoFixedCount(jobs: readonly FixJobView[], now: number): number {
  const since = now - AUTO_SUMMARY_DAYS * 86_400_000
  return jobs.filter((j) => j.auto && j.status === 'applied' && Date.parse(j.appliedAt ?? j.approvedAt) >= since).length
}

const linkClass = 'rounded-control text-caption font-semibold text-action hover:text-action-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action'

export default function AutoFixPanel({ projectId, auto, jobs, copy, when }: {
  projectId: string
  auto: AutoFixView
  jobs: readonly FixJobView[]
  copy: Copy
  when: (iso: string) => string
}) {
  const t = copy.auto
  const [now] = useState(() => Date.now())
  const fixed = useMemo(() => autoFixedCount(jobs, now), [jobs, now])
  const on = auto.state === 'on'
  return (
    <section className="rounded-card border border-line bg-surface px-5 py-4 shadow-card sm:px-6" aria-labelledby="auto-fix-panel-title" data-auto-fix-panel={auto.state}>
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <span aria-hidden className="grid size-9 shrink-0 place-items-center rounded-control bg-action-soft text-action">
            <Sparkles size={18} />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 id="auto-fix-panel-title" className="text-copy font-semibold text-ink">{t.panel.title}</h2>
              <Badge variant={on ? 'success' : 'neutral'} dot={on}>{on ? t.panel.on : t.panel.off}</Badge>
            </div>
            <p className="mt-1 text-caption text-muted">
              {on ? (
                <>
                  {t.panel.fixed(fixed)}
                  <span aria-hidden="true"> · </span>
                  {auto.lastRunAt ? t.lastRun(when(auto.lastRunAt)) : t.noRunYet}
                </>
              ) : (
                <>
                  {auto.lastRunAt ? <>{t.lastRun(when(auto.lastRunAt))}<span aria-hidden="true"> · </span></> : null}
                  {t.panel.offBody}
                </>
              )}
            </p>
          </div>
        </div>
        <div className="flex shrink-0 flex-wrap items-center gap-4">
          {jobs.length > 0 && <a href="#fixes" className={linkClass}>{t.panel.toQueue}</a>}
          <Link href={`/settings?projectId=${encodeURIComponent(projectId)}#${SECTION.siteAutoFix}`} className={linkClass}>{t.panel.toSettings}</Link>
        </div>
      </div>
    </section>
  )
}
