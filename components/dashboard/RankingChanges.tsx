'use client'

/**
 * Widget 6, what moved: the keywords that rose most and fell most between their
 * last two checks, each opening its history. An empty side says what will show
 * up there, instead of a bare "nothing".
 */
import Link from 'next/link'
import { TrendingDown, TrendingUp } from 'lucide-react'
import type { RankingMove } from '@/lib/dashboard/rankings'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'
import { EngineBadge, PositionChange } from '@/components/ui/StatusBadge'
import { LinkButton, Widget, WidgetEmpty } from './ui'

export default function RankingChanges({ t, direction, title, moves }: {
  t: DashboardDictionary['dashboardHome']
  direction: 'up' | 'down'
  title: string
  moves: RankingMove[]
}) {
  const up = direction === 'up'
  const icon = up ? <TrendingUp size={16} strokeWidth={2} className="text-ok" /> : <TrendingDown size={16} strokeWidth={2} className="text-bad" />
  return (
    <Widget id={up ? 'improvements' : 'drops'} state={moves.length ? 'ready' : 'empty'} title={title} icon={icon}>
      {moves.length === 0 ? (
        <WidgetEmpty
          icon={up ? <TrendingUp size={18} strokeWidth={2} /> : <TrendingDown size={18} strokeWidth={2} />}
          body={up ? t.changes.emptyUp : t.changes.emptyDown}
          action={<LinkButton href="/keywords" variant="secondary" size="sm">{t.changes.emptyCta}</LinkButton>}
        />
      ) : (
        <ul className="-mx-2 divide-y divide-line">
          {moves.map((m) => (
            <li key={m.targetId}>
              <Link href={`/keywords/${encodeURIComponent(m.targetId)}/history`}
                className="flex items-center justify-between gap-3 rounded-control px-2 py-2.5 hover:bg-sunk">
                <span className="min-w-0">
                  <span className="block truncate text-copy font-medium text-ink">{m.keyword}</span>
                  <span className="mt-0.5 flex items-center gap-2 text-caption text-muted">
                    <span className="tabular-nums">#{m.position}</span>
                    <EngineBadge engine={m.engine} />
                  </span>
                </span>
                <span className="shrink-0"><PositionChange change={m.change} /></span>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Widget>
  )
}
