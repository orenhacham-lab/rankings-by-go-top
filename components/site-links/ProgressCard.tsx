'use client'

/**
 * The top of the tab: how far the owner has come with the list. Three figures
 * (sites on the list, contacted, link received) and one bar that fills as the
 * outreach moves: received in the "done" colour, contacted in the action
 * colour, the rest as the track. The figures are the owner's own marks
 * (useOpportunityStatus), counted over the sites the list shows.
 */
import { Waypoints } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Copy = ReturnType<typeof getDashboardDictionary>['siteLinks']['progress']

export default function ProgressCard({ copy, total, contacted, received }: {
  copy: Copy
  total: number
  contacted: number
  received: number
}) {
  const pct = (n: number) => (total > 0 ? Math.round((n / total) * 1000) / 10 : 0)
  const figures = [
    { key: 'found', label: copy.found, value: total, tone: 'text-ink' },
    { key: 'contacted', label: copy.contacted, value: contacted, tone: 'text-action' },
    { key: 'received', label: copy.received, value: received, tone: 'text-ok' },
  ] as const
  return (
    <section
      aria-labelledby="site-links-progress-title"
      data-site-links="progress"
      className="relative overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <div aria-hidden="true" className="pointer-events-none absolute -top-28 end-[-5rem] size-72 rounded-full bg-action-soft blur-3xl" />
      <div className="relative grid gap-8 p-6 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)] lg:items-center lg:gap-12 lg:p-8">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action ring-1 ring-action/10">
              <Waypoints size={20} strokeWidth={1.75} />
            </span>
            <h2 id="site-links-progress-title" className="text-section font-semibold text-ink">{copy.title}</h2>
          </div>
          <p className="mt-3 max-w-[56ch] text-copy text-muted text-pretty">{copy.body}</p>
          <div className="mt-6">
            <div
              role="meter"
              aria-label={copy.meter(contacted + received, total)}
              aria-valuemin={0}
              aria-valuemax={Math.max(total, 1)}
              aria-valuenow={contacted + received}
              className="flex h-2.5 w-full overflow-hidden rounded-pill bg-sunk ring-1 ring-inset ring-line"
            >
              <span className="h-full bg-ok motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-snappy" style={{ width: `${pct(received)}%` }} />
              <span className="h-full bg-action motion-safe:transition-[width] motion-safe:duration-500 motion-safe:ease-snappy" style={{ width: `${pct(contacted)}%` }} />
            </div>
            <p className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-1 text-caption text-muted">
              <span className="font-medium text-body tabular-nums">{copy.meter(contacted + received, total)}</span>
              <span>{copy.savedHere}</span>
            </p>
          </div>
        </div>
        <dl className="grid grid-cols-3 rounded-inset border border-line bg-canvas/60 [&>*+*]:border-s [&>*+*]:border-line">
          {figures.map((f) => (
            <div key={f.key} className="min-w-0 px-3 py-4 text-center sm:px-5 sm:py-5">
              <dt className="text-caption font-medium text-muted">{f.label}</dt>
              <dd className={cn('mt-1.5 text-metric font-semibold tracking-tight tabular-nums', f.tone)}>{f.value}</dd>
            </div>
          ))}
        </dl>
      </div>
    </section>
  )
}
