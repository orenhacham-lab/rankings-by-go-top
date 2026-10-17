'use client'

/**
 * "Waiting for you": under the dashboard's hero, up to three things that only the owner
 * can move (the site connection, a missing site or Search Console connection, articles to approve, topics to approve, safe fixes),
 * each with one sentence and one button to the exact screen. Hidden when nothing waits;
 * no modal, no toast; a failed read is the same as nothing waiting.
 *
 * The rows come from lib/nudges/rows.ts (the same rule the sidebar's count pills use).
 */
import { AlertTriangle, FileCheck2, Lightbulb, LineChart, Plug, Wrench, type LucideIcon } from 'lucide-react'
import { cn } from '@/lib/utils'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import type { Locale } from '@/lib/i18n/locales'
import { formatDate } from '@/lib/i18n/format-date'
import type { WaitingRow, WaitingRowKind } from '@/lib/nudges/rows'
import { LinkButton } from './ui'

type Copy = DashboardDictionary['waitingCard']

const ICONS: Record<WaitingRowKind, LucideIcon> = {
  connection: AlertTriangle,
  site: Plug,
  gsc: LineChart,
  articles: FileCheck2,
  topics: Lightbulb,
  fixes: Wrench,
}

export function waitingSentence(t: Copy, row: WaitingRow): string {
  switch (row.kind) {
    case 'connection': return t.connection
    case 'site': return t.site
    case 'gsc': return t.gsc
    case 'articles': return t.articles(row.n)
    case 'topics': return t.topics(row.n)
    case 'fixes': return t.fixes(row.n)
  }
}

export function waitingAction(t: Copy, kind: WaitingRowKind): string {
  return { connection: t.connectionAction, site: t.siteAction, gsc: t.gscAction, articles: t.articlesAction, topics: t.topicsAction, fixes: t.fixesAction }[kind]
}

export default function WaitingCard({ t, rows, language }: { t: Copy; rows: readonly WaitingRow[]; language: Locale }) {
  if (rows.length === 0) return null
  return (
    <section
      aria-labelledby="dashboard-waiting-title"
      data-dashboard-widget="waiting"
      data-state="ready"
      className="min-w-0 overflow-hidden rounded-card border border-line bg-surface shadow-card"
    >
      <h2 id="dashboard-waiting-title" className="px-5 pt-4 text-section font-bold text-ink">{t.title}</h2>
      <ul className="divide-y divide-line px-5 pb-1 pt-2">
        {rows.map((row, i) => {
          const Icon = ICONS[row.kind]
          const down = row.kind === 'connection' || row.kind === 'site'
          return (
            <li key={row.kind} data-waiting-row={row.kind} className="flex flex-wrap items-center gap-x-4 gap-y-3 py-3">
              <span
                aria-hidden="true"
                className={cn(
                  'grid size-9 shrink-0 place-items-center rounded-inset ring-1',
                  down ? 'bg-warn-soft text-warn ring-warn/15' : 'bg-action-soft text-action ring-action/10',
                )}
              >
                <Icon size={16} strokeWidth={2} />
              </span>
              <div className="min-w-0 flex-1 basis-56">
                <p className="text-copy font-medium text-ink">{waitingSentence(t, row)}</p>
                {row.dryOn && <p className="mt-0.5 text-caption text-muted">{t.queueDry(formatDate(language).date(row.dryOn))}</p>}
              </div>
              <LinkButton href={row.href} size="sm" variant={i === 0 ? 'primary' : 'secondary'}>{waitingAction(t, row.kind)}</LinkButton>
            </li>
          )
        })}
      </ul>
    </section>
  )
}
