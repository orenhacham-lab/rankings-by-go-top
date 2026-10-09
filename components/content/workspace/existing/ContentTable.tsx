'use client'

/**
 * The list of one tab: per row the page (its name and short address), when it
 * was last updated, Search Console's clicks, impressions and position, the
 * keyword it ranks for, and — only when the figures give a reason — the one
 * thing worth doing about it, with the reason under the button.
 *
 * Rows without a reason carry no button. A product or category keeps "write a
 * supporting article" in its row menu, so the action is always reachable
 * without every row shouting it.
 */
import Link from 'next/link'
import { ExternalLink } from 'lucide-react'
import Badge from '@/components/ui/Badge'
import Button from '@/components/ui/Button'
import RowMenu from '@/components/ui/RowMenu'
import { Table, TableBody, TableHead, TableRow, Td, Th, EmptyRow } from '@/components/ui/Table'
import { cn } from '@/lib/utils'
import { EMPTY_DATE } from '@/lib/format/date'
import { strategyHref, STRATEGY_ANCHORS } from '@/lib/content/strategy/view'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { ExistingContentItem, ExistingContentTab } from '@/lib/content/existing-content/model'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { displayPath, fill, KIND_TONE, rowTitle } from './format'

/** How many competing pages a row names before it counts the rest. */
const CANNIBAL_SHOWN = 3

type Copy = ReturnType<typeof getDashboardDictionary>['existingContent']

export default function ContentTable({
  x, items, tab, gscOk, showUpdated, num, pos, day, creating, plannedNow, onSupport, emptyMessage, busy, panelId,
}: {
  x: Copy
  items: readonly ExistingContentItem[]
  tab: ExistingContentTab
  gscOk: boolean
  showUpdated: boolean
  num: Intl.NumberFormat
  pos: Intl.NumberFormat
  day: (iso: string | null) => string | null
  creating: string | null
  plannedNow: ReadonlySet<string>
  onSupport: (it: ExistingContentItem) => void
  emptyMessage: string
  /** A new tab, search or sort is on its way: the rows stay, dimmed. */
  busy: boolean
  panelId: string
}) {
  const { language } = useDashboardLanguage()
  const showType = tab === 'all'
  const colCount = 3 + (showType ? 1 : 0) + (showUpdated ? 1 : 0) + (gscOk ? 4 : 0)
  return (
    <div id={panelId} role="tabpanel" aria-labelledby={`existing-tab-${tab}`} aria-busy={busy} className={cn('transition-opacity duration-150 ease-snappy', busy && 'opacity-60')}>
      <Table stackBelowSm>
        <caption className="sr-only">{x.tableLabel}</caption>
        <TableHead>
          <tr>
            <Th>{x.columns.title}</Th>
            {showType && <Th className="max-md:hidden">{x.columns.type}</Th>}
            {showUpdated && <Th className="max-lg:hidden">{x.columns.updated}</Th>}
            {gscOk && <Th className="text-end">{x.columns.clicks}</Th>}
            {gscOk && <Th hideBelow="md" className="text-end">{x.columns.impressions}</Th>}
            {gscOk && <Th hideBelow="md" className="text-end"><span title={x.positionHint}>{x.columns.position}</span></Th>}
            {gscOk && <Th className="max-lg:hidden">{x.columns.topQuery}</Th>}
            <Th>{x.columns.action}</Th>
            <Th><span className="sr-only">{x.moreActions.replace('{title}', '')}</span></Th>
          </tr>
        </TableHead>
        <TableBody>
          {items.length === 0 ? (
            <EmptyRow colSpan={colCount} message={emptyMessage} />
          ) : items.map((it) => {
            const named = rowTitle(it, x.homePage, language === 'he')
            const title = named.text
            const planned = it.supportTopicPlanned || plannedNow.has(it.key)
            const commerce = it.group === 'commerce'
            const m = it.metrics
            return (
              <TableRow key={it.key}>
                <Td stack="title" className="max-w-56 sm:max-w-72">
                  {named.isPath
                    ? <p dir="ltr" className="truncate text-start font-medium text-ink" title={title}>{title}</p>
                    : <p className="truncate font-medium text-ink" title={title}>{title}</p>}
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={fill(x.openPage, { title })}
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 text-caption text-muted hover:text-action hover:underline"
                  >
                    <span dir="ltr" className="truncate">{displayPath(it.url)}</span>
                    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                  </a>
                </Td>
                {showType && (
                  <Td label={x.columns.type} className="whitespace-nowrap max-md:hidden">
                    <span className="inline-flex items-center gap-1.5">
                      <span aria-hidden="true" className={cn('size-2 rounded-pill', KIND_TONE[it.kind])} />
                      {x.kind[it.kind]}
                    </span>
                  </Td>
                )}
                {showUpdated && <Td label={x.columns.updated} className="whitespace-nowrap text-muted max-lg:hidden">{day(it.updatedAt) ?? EMPTY_DATE}</Td>}
                {gscOk && <Td label={x.columns.clicks} className="text-end tabular-nums">{m ? num.format(m.clicks) : EMPTY_DATE}</Td>}
                {gscOk && <Td hideBelow="md" className="text-end tabular-nums">{m ? num.format(m.impressions) : EMPTY_DATE}</Td>}
                {gscOk && <Td hideBelow="md" className="text-end tabular-nums">{m?.position != null ? pos.format(m.position) : EMPTY_DATE}</Td>}
                {gscOk && (
                  <Td label={x.columns.topQuery} className="max-w-44 max-lg:hidden">
                    {m?.topQuery ? <span className="block truncate" title={m.topQuery}>{m.topQuery}</span> : <span className="text-muted">{EMPTY_DATE}</span>}
                  </Td>
                )}
                <Td className="min-w-40 max-w-64 max-sm:basis-full">
                  <RowAction x={x} it={it} planned={planned} creating={creating} onSupport={onSupport} pos={pos} num={num} />
                </Td>
                <Td stack="end" className="w-10 px-2">
                  {commerce && !it.action && !planned && (
                    <RowMenu
                      label={fill(x.moreActions, { title })}
                      items={[{ key: 'support', label: x.writeSupport, onSelect: () => onSupport(it), disabled: !!creating }]}
                    />
                  )}
                </Td>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>
    </div>
  )
}

function RowAction({ x, it, planned, creating, onSupport, pos, num }: {
  x: Copy
  it: ExistingContentItem
  planned: boolean
  creating: string | null
  onSupport: (it: ExistingContentItem) => void
  pos: Intl.NumberFormat
  num: Intl.NumberFormat
}) {
  const a = it.action
  const why = (s: string, p: number, q: string) => <p className="mt-1.5 text-caption text-muted">{fill(s, { pos: pos.format(p), query: q })}</p>
  if (a?.kind === 'improve') {
    return (
      <div data-row-action="improve">
        <Link href={`/content/articles/${encodeURIComponent(a.articleId)}`} className="inline-flex h-8 items-center rounded-control border border-line bg-surface px-3 text-caption font-semibold text-ink shadow-control transition-colors duration-150 ease-snappy hover:border-line-strong hover:bg-sunk/60 focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
          {x.actions.improve}
        </Link>
        {why(x.actions.improveWhy, a.position, a.query)}
      </div>
    )
  }
  if (a?.kind === 'support' && !planned) {
    return (
      <div data-row-action="support">
        <Button size="sm" variant="secondary" loading={creating === it.key} disabled={!!creating && creating !== it.key} onClick={() => onSupport(it)}>
          {x.actions.support}
        </Button>
        {why(x.actions.supportWhy, a.position, a.query)}
      </div>
    )
  }
  // No reason to act: only the facts that matter, if any.
  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {planned && (
        <Link href={strategyHref('list', STRATEGY_ANCHORS.topics)} className="rounded-control text-caption font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
          {x.supportPlanned}
        </Link>
      )}
      {it.origin === 'ours' && <Badge variant="info">{x.origin.ours}</Badge>}
      {it.cannibalization && (
        <>
          <Badge variant="warning" dot>{x.cannibal}</Badge>
          <div className="basis-full text-caption text-muted">
            <p>{fill(x.cannibalDetail, { n: num.format(it.cannibalization.pages), query: it.cannibalization.query })}</p>
            {/* The pages themselves: a row that names no page leaves nothing to act on. */}
            <p className="mt-0.5">
              {fill(it.cannibalization.leading ? x.cannibalMineLeads : x.cannibalMine, { imp: num.format(it.cannibalization.mine) })}
            </p>
            <ul className="mt-0.5 space-y-0.5">
              {it.cannibalization.others.slice(0, CANNIBAL_SHOWN).map((o) => (
                <li key={o.path}>
                  <Link
                    href={o.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="rounded-control font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
                  >
                    {o.title || displayPath(o.path)}
                  </Link>
                  <span>{' '}{fill(x.cannibalOther, { imp: num.format(o.impressions) })}</span>
                </li>
              ))}
            </ul>
            {it.cannibalization.others.length > CANNIBAL_SHOWN && (
              <p className="mt-0.5">{fill(x.cannibalMore, { n: num.format(it.cannibalization.others.length - CANNIBAL_SHOWN) })}</p>
            )}
          </div>
        </>
      )}
    </div>
  )
}
