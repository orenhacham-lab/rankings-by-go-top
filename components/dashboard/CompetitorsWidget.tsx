'use client'

/**
 * Widget 14, your competitors: each one, how many of your keywords it ranks
 * above you on, and how many it has on page one, from the positions the rank
 * scan already records (W10) — no extra search is made to show this.
 *
 * Before a rank check has compared them, the competitors are listed with when
 * they will be compared; when the project tracks none yet but the first scan
 * found some, those are shown as found by the scan. With none at all, one
 * sentence and one link to where competitors are added.
 */
import { Swords, Users } from 'lucide-react'
import type { CompetitorRow } from '@/lib/dashboard/competitors'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { HeaderLink, LinkButton, Widget, WidgetEmpty, WidgetError, WidgetLoading } from './ui'

export type CompetitorsModel =
  | { state: 'loading' }
  | { state: 'error'; retry: () => void }
  | { state: 'ready'; rows: CompetitorRow[] }
  /** None tracked; the first scan's validated competitors, if it found any. */
  | { state: 'scan_only'; domains: string[] }
  | { state: 'empty' }

export const COMPETITORS_SHOWN = 3

export default function CompetitorsWidget({ t, model, manageHref }: {
  t: DashboardDictionary['dashboardHome']
  model: CompetitorsModel
  manageHref: string
}) {
  const c = t.competitors
  return (
    <Widget id="competitors" state={model.state} title={c.title} subtitle={c.subtitle} icon={<Swords size={16} strokeWidth={2} />}
      action={model.state === 'ready' || model.state === 'scan_only' ? <HeaderLink href={manageHref}>{c.manage}</HeaderLink> : undefined}>
      {model.state === 'loading' && <WidgetLoading lines={3} label={c.title} />}
      {model.state === 'error' && <WidgetError message={t.loadError} retryLabel={t.actions.retry} onRetry={model.retry} />}
      {model.state === 'empty' && (
        <WidgetEmpty
          icon={<Users size={18} strokeWidth={2} />}
          title={c.emptyTitle}
          body={c.empty}
          action={<LinkButton href={manageHref} variant="secondary" size="sm">{c.emptyCta}</LinkButton>}
        />
      )}
      {model.state === 'scan_only' && (
        <div>
          <p className="text-caption text-muted">{c.fromScan}</p>
          <ul className="mt-2 flex flex-wrap gap-2">
            {model.domains.map((d) => (
              <li key={d} dir="ltr" className="rounded-pill border border-line bg-sunk px-3 py-1 text-caption font-medium text-body">{d}</li>
            ))}
          </ul>
        </div>
      )}
      {model.state === 'ready' && (
        <ul className="divide-y divide-line">
          {model.rows.slice(0, COMPETITORS_SHOWN).map((r) => {
            const compared = r.compared > 0
            const share = compared ? Math.round((r.ahead / r.compared) * 100) : 0
            return (
              <li key={r.domain} data-competitor={r.domain} className="py-3 first:pt-0 last:pb-0">
                {/* Name, then the domain on a line of its own (P1-6): side by side in an RTL
                    row the two ran together ("Rival Plumberrival-plumber.co.il"). */}
                <div className="flex items-start justify-between gap-3">
                  <p className="flex min-w-0 flex-col">
                    <span className="truncate text-copy font-medium text-ink">{r.name}</span>
                    {r.name !== r.domain && <span dir="ltr" data-competitor-domain className="max-w-full self-start truncate text-caption text-muted">{r.domain}</span>}
                  </p>
                  {compared && r.best != null && <span className="shrink-0 text-caption tabular-nums text-muted">#{r.best}</span>}
                </div>
                {compared ? (
                  <>
                    <div role="meter" aria-label={c.aheadSentence(r.name, r.ahead, r.compared)} aria-valuemin={0}
                      aria-valuemax={r.compared} aria-valuenow={r.ahead}
                      className="mt-2 h-1.5 w-full overflow-hidden rounded-pill bg-action-soft">
                      <div className="h-full rounded-pill bg-action transition-[width] duration-500" style={{ width: `${share}%` }} />
                    </div>
                    <p className="mt-1.5 flex flex-wrap gap-x-3 text-caption text-muted tabular-nums">
                      <span className="font-medium text-body">{c.ahead(r.ahead, r.compared)}</span>
                      <span>{c.top10(r.top10, r.compared)}</span>
                    </p>
                  </>
                ) : (
                  <p className="mt-1 text-caption text-muted">{c.waiting}</p>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Widget>
  )
}
