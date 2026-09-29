'use client'

/**
 * The top of the existing-content screen: how big the site is, what it is made
 * of, and what Google says about it, in one card.
 *
 *   start   the total, a composition bar of the four kinds, and one legend cell
 *           per kind with its TRUE count (a cell is a button: it opens that tab);
 *           under them, where the list comes from and when it was updated.
 *   end     what Search Console says about the whole list (pages with clicks,
 *           seen without clicks, with a clear opportunity, competing), or one
 *           sentence on what connecting it would show.
 *   bottom  the full-site mapping while it runs: its progress, in words and as
 *           a bar, and that the list goes on working meanwhile.
 *
 * Presentation only: every number comes from the payload (lib/content/existing-content).
 */
import type { ReactNode } from 'react'
import { AlertTriangle, Eye, MousePointerClick, RefreshCw, Target } from 'lucide-react'
import Button from '@/components/ui/Button'
import { Card } from '@/components/ui/Card'
import { cn } from '@/lib/utils'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { SITE_KINDS, type SiteKind } from '@/lib/content/existing-content/classify'
import type { ExistingContentPayload, ExistingContentTab } from '@/lib/content/existing-content/model'
import { fill, joinList, KIND_TONE } from './format'

type Copy = ReturnType<typeof getDashboardDictionary>['existingContent']

export default function SiteSummary({
  x, data, tab, onTab, onRisk, risk, num, day, refresh,
}: {
  x: Copy
  data: ExistingContentPayload
  tab: ExistingContentTab
  onTab: (t: ExistingContentTab) => void
  risk: boolean
  onRisk: () => void
  num: Intl.NumberFormat
  day: (iso: string | null) => string | null
  refresh: { show: boolean; busy: boolean; onClick: () => void }
}) {
  const total = data.counts.all
  const capped = data.map.capped
  const mapRunning = data.map.state === 'running'
  const sourceParts = (['map', 'shopify', 'wordpress', 'crawl', 'gsc'] as const)
    .filter((s) => data.sources[s] > 0)
    .map((s) => x.sourceNames[s])
  const updated = day(data.indexedAt)
  const gscOk = data.gsc.state === 'ok'

  return (
    <Card className="overflow-hidden" padding={false}>
      <div className="grid gap-8 p-5 sm:p-6 lg:grid-cols-[minmax(0,1.35fr)_minmax(0,1fr)]">
        {/* ── The site, by kind ─────────────────────────────────────────── */}
        <section aria-label={x.breakdownLabel} className="min-w-0 space-y-5">
          <div className="flex items-start justify-between gap-3">
            <p className="text-overline font-semibold uppercase tracking-wide text-muted">{x.summaryOverline}</p>
            {refresh.show && (
              <Button variant="secondary" size="sm" onClick={refresh.onClick} loading={refresh.busy} disabled={mapRunning}>
                {!refresh.busy && <RefreshCw aria-hidden="true" className="size-4" />}
                {refresh.busy || mapRunning ? x.map.refreshing : x.map.refresh}
              </Button>
            )}
          </div>

          <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
            <span data-existing-total="" className="text-display font-bold tracking-tight text-ink tabular-nums">
              {capped ? fill(x.totalAtLeast, { n: num.format(total) }) : num.format(total)}
            </span>
            <span className="text-lead text-body">{x.totalLabel}</span>
          </p>

          {total > 0 && (
            <div aria-hidden="true" className="flex h-2 w-full gap-0.5 overflow-hidden rounded-pill bg-sunk">
              {SITE_KINDS.map((k) => data.counts[k] > 0 && (
                <span key={k} className={cn('h-full first:rounded-s-pill last:rounded-e-pill', KIND_TONE[k])} style={{ width: `${(data.counts[k] / total) * 100}%` }} />
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
            {SITE_KINDS.map((k: SiteKind) => {
              const on = tab === k
              return (
                <button
                  key={k}
                  type="button"
                  aria-pressed={on}
                  data-kind-count={k}
                  onClick={() => onTab(on ? 'all' : k)}
                  className={cn(
                    'rounded-inset border px-3 py-2.5 text-start transition-colors duration-150 ease-snappy',
                    'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
                    on ? 'border-action bg-action-soft' : 'border-line bg-surface hover:border-line-strong',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-caption text-muted">
                    <span aria-hidden="true" className={cn('size-2 shrink-0 rounded-pill', KIND_TONE[k])} />
                    {x.kinds[k]}
                  </span>
                  <span className="mt-0.5 block text-metric font-bold tabular-nums text-ink">{num.format(data.counts[k])}</span>
                </button>
              )
            })}
          </div>

          {(sourceParts.length > 0 || updated) && (
            <p className="text-caption text-muted">
              {sourceParts.length > 0 && <>{x.sourcesLead}{joinList(sourceParts, x.listJoin, x.listLastJoin)}</>}
              {sourceParts.length > 0 && updated && ' · '}
              {updated && fill(x.updatedOn, { date: updated })}
            </p>
          )}
        </section>

        {/* ── What Google says ──────────────────────────────────────────── */}
        <section aria-label={x.insightsLabel} className="min-w-0 rounded-inset bg-sunk/60 p-4 sm:p-5">
          <p className="text-overline font-semibold uppercase tracking-wide text-muted">{x.insightsLabel}</p>
          {gscOk ? (
            <ul className="mt-3 divide-y divide-line">
              <Insight icon={<MousePointerClick />} value={num.format(data.insights.withClicks)} label={x.insights.withClicks} />
              <Insight icon={<Eye />} value={num.format(data.insights.seenNoClicks)} label={x.insights.seenNoClicks} />
              <Insight icon={<Target />} value={num.format(data.insights.actionable)} label={x.insights.actionable} />
              {data.riskCount > 0 && (
                <li>
                  <button
                    type="button"
                    aria-pressed={risk}
                    onClick={onRisk}
                    className="flex w-full items-center gap-3 rounded-control py-2.5 text-start transition-colors duration-150 ease-snappy hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-inset bg-warn-soft text-warn [&>svg]:size-4"><AlertTriangle /></span>
                    <span className="text-metric font-bold tabular-nums text-ink">{num.format(data.riskCount)}</span>
                    <span className={cn('min-w-0 text-copy', risk ? 'font-semibold text-ink' : 'text-body')}>{x.insights.risk}</span>
                  </button>
                </li>
              )}
            </ul>
          ) : (
            <p className="mt-3 max-w-prose text-copy text-body">{x.insightsNoGsc}</p>
          )}
        </section>
      </div>

      {mapRunning && <MappingProgress x={x} data={data} num={num} />}
    </Card>
  )
}

function Insight({ icon, value, label }: { icon: ReactNode; value: string; label: string }) {
  return (
    <li className="flex items-center gap-3 py-2.5">
      <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-inset bg-surface text-muted [&>svg]:size-4">{icon}</span>
      <span className="text-metric font-bold tabular-nums text-ink">{value}</span>
      <span className="min-w-0 text-copy text-body">{label}</span>
    </li>
  )
}

/** The mapping at work: what it found so far, and that nothing waits for it. */
export function MappingProgress({ x, data, num }: { x: Copy; data: ExistingContentPayload; num: Intl.NumberFormat }) {
  const m = data.map
  const pct = m.phase === 'platform' ? 92 : m.docsSeen > 0 ? Math.max(6, Math.min(88, (m.docsRead / m.docsSeen) * 88)) : 6
  const detail = m.phase === 'platform'
    ? fill(x.map.runningPlatform, { n: num.format(m.found) })
    : fill(x.map.runningSitemaps, { n: num.format(m.found), read: num.format(m.docsRead), seen: num.format(Math.max(m.docsSeen, m.docsRead)) })
  return (
    <div role="status" data-existing-mapping="" className="border-t border-line bg-action-soft/40 px-5 py-4 sm:px-6">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
        <p className="text-copy font-semibold text-ink">{x.map.running}</p>
        <p className="text-caption text-body tabular-nums">{detail}</p>
      </div>
      <div
        role="progressbar"
        aria-label={x.map.progressLabel}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pct)}
        className="mt-3 h-1.5 w-full overflow-hidden rounded-pill bg-sunk"
      >
        <span className="block h-full rounded-pill bg-action transition-[width] duration-150 ease-snappy" style={{ width: `${pct}%` }} />
      </div>
      <p className="mt-2 text-caption text-muted">{x.map.runningNote}</p>
    </div>
  )
}
