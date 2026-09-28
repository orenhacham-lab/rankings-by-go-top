'use client'

/**
 * The existing-content screen: what is already on the merchant's site.
 *
 * Read-only. It lists the pages the app already holds for the active project (the
 * store's synced entities, the WordPress index, or the seeding crawl), with Search
 * Console's 28-day figures, and flags two things: a cannibalization RISK (two or
 * more of the site's pages get impressions for one query) and whether an article
 * is ours or was on the site before. The data and every rule behind it are
 * server-side (GET /api/content/existing, lib/content/existing-content).
 *
 * Two actions, both through routes that already exist:
 *   - "write a supporting article" creates a topic through /api/content/topics,
 *     with the product or collection as a required internal link. No model call.
 *   - "resync" calls the existing Shopify sync, or the WordPress index refresh.
 *
 * There is no "no supporting article" flag. The only record of what links to a
 * product is the internal-link plans, and those cover the articles WE write, not
 * the merchant's own posts: a product their blog already links to would be
 * flagged as unsupported. The action is offered on every product and collection
 * instead, and a product that already has a planned topic says so.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import Link from 'next/link'
import { AlertTriangle, ExternalLink, FileText, Layers, Library, RefreshCw, ShoppingBag } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import StatTile from '@/components/ui/StatTile'
import EmptyState from '@/components/ui/EmptyState'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TableBody, TableHead, TableRow, Td, Th, EmptyRow } from '@/components/ui/Table'
import { cn } from '@/lib/utils'
import { formatDate, EMPTY_DATE } from '@/lib/format/date'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import { strategyHref, STRATEGY_ANCHORS } from '@/lib/content/strategy/view'
import {
  filterItems, supportTopicBody, topicLanguage,
  type ExistingContentFilter, type ExistingContentItem, type ExistingContentPayload,
} from '@/lib/content/existing-content/model'
import { useContentWorkspace } from './ContentWorkspaceProvider'

const PAGE_SIZE = 50
const FILTERS: readonly ExistingContentFilter[] = ['all', 'content', 'commerce']
const FILTER_ICONS: Record<ExistingContentFilter, React.ReactNode> = {
  all: <Layers />, content: <FileText />, commerce: <ShoppingBag />,
}

/** Eight columns fit a 1440 screen beside the sidebar with a tighter gutter. */
const CELL = 'px-4'
/**
 * On a phone the table reads as stacked rows (final review R15): the title with a
 * meta line under it (type, clicks, the one flag that matters) and the row's action.
 * The secondary columns return as the screen widens, instead of the last ones being
 * cut off inside the card.
 */
const FROM_SM = 'hidden sm:table-cell'
const FROM_MD = 'hidden md:table-cell'
const FROM_LG = 'hidden lg:table-cell'

/** Every page is on the same site, so the path is what tells two rows apart. */
function displayPath(url: string): string {
  try {
    const u = new URL(url)
    const path = decodeURIComponent(u.pathname)
    return path === '/' ? u.host : path
  } catch {
    return url
  }
}

const fill = (s: string, vars: Record<string, string | number>) =>
  Object.entries(vars).reduce((acc, [k, v]) => acc.split(`{${k}}`).join(String(v)), s)

export default function ExistingContentScreen() {
  const { projectId, selectedProject, language, isHebrew, toast, loadTopics, data: overview } = useContentWorkspace()
  const x = useMemo(() => getDashboardDictionary(language).existingContent, [language])
  const num = useMemo(() => new Intl.NumberFormat(isHebrew ? 'he-IL' : 'en-US'), [isHebrew])
  const day = useCallback((iso: string | null) => (iso ? formatDate(iso, language) : null), [language])

  const [payload, setPayload] = useState<ExistingContentPayload | null>(null)
  const [loadFailed, setLoadFailed] = useState(false)
  const [filter, setFilter] = useState<ExistingContentFilter>('all')
  const [onlyRisk, setOnlyRisk] = useState(false)
  const [shown, setShown] = useState(PAGE_SIZE)
  const [syncing, setSyncing] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [plannedNow, setPlannedNow] = useState<Set<string>>(() => new Set())

  const load = useCallback(async () => {
    if (!projectId) return
    setLoadFailed(false)
    try {
      const res = await fetch(`/api/content/existing?projectId=${encodeURIComponent(projectId)}`)
      const body = await res.json().catch(() => null)
      if (!res.ok || !body?.ok) { setLoadFailed(true); return }
      setPayload(body as ExistingContentPayload)
    } catch {
      setLoadFailed(true)
    }
  }, [projectId])

  useEffect(() => {
    setPayload(null); setFilter('all'); setOnlyRisk(false); setShown(PAGE_SIZE); setPlannedNow(new Set())
    void load()
  }, [load])

  const resync = useCallback(async () => {
    if (!payload?.resync || syncing) return
    setSyncing(true)
    try {
      const res = payload.resync === 'shopify'
        ? await fetch('/api/shopify/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
        : await fetch('/api/content/automation/internal-links/index/refresh', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, force: true }) })
      if (res.status === 202) toast.success(x.resyncRunning)
      else if (res.ok) { toast.success(x.resyncDone); await load() }
      else toast.error(x.resyncFailed)
    } catch {
      toast.error(x.resyncFailed)
    } finally {
      setSyncing(false)
    }
  }, [payload?.resync, syncing, projectId, toast, x, load])

  const writeSupport = useCallback(async (item: ExistingContentItem) => {
    if (creating) return
    setCreating(item.key)
    try {
      const lang = topicLanguage(selectedProject?.language)
      const copy = getDashboardDictionary(lang).existingContent.supportTopic
      const res = await fetch('/api/content/topics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supportTopicBody(item, projectId, lang, copy)),
      })
      if (!res.ok) { toast.error(x.supportFailed); return }
      setPlannedNow((s) => new Set(s).add(item.key))
      toast.success(x.supportCreated)
      void loadTopics()
    } catch {
      toast.error(x.supportFailed)
    } finally {
      setCreating(null)
    }
  }, [creating, selectedProject?.language, projectId, toast, x, loadTopics])

  if (loadFailed) {
    return (
      <Card className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-copy text-body">{x.loadError}</p>
        <Button variant="secondary" onClick={() => void load()}>{x.retry}</Button>
      </Card>
    )
  }

  if (!payload) {
    return (
      <div role="status" aria-label={x.loading} className="space-y-4">
        <div className="grid grid-cols-3 gap-4 sm:gap-5" aria-hidden>
          {[0, 1, 2].map((i) => <Skeleton key={i} className="h-28 rounded-card" />)}
        </div>
        <Skeleton className="h-64 rounded-card" />
      </div>
    )
  }

  // A site is "connected" when any publishing platform is (the overview resolves it),
  // or when the store / WordPress connection this screen reads is.
  const platform = overview?.platform?.platform ?? 'none'
  const siteConnected = platform !== 'none' || payload.connections.shopify || payload.connections.wordpress

  const resyncButton = payload.resync ? (
    <Button variant="secondary" size="sm" onClick={() => void resync()} loading={syncing}>
      {!syncing && <RefreshCw aria-hidden="true" className="size-4" />}
      {syncing ? x.resyncing : x.resync}
    </Button>
  ) : null

  if (payload.source === 'none') {
    return (
      <Card padding={false}>
        {siteConnected ? (
          <EmptyState
            icon={<Library />}
            title={x.empty.noDataTitle}
            body={payload.resync ? x.empty.noDataBody : x.empty.noDataBodyNoResync}
            action={resyncButton}
          />
        ) : (
          <EmptyState
            icon={<Library />}
            title={x.empty.noConnectionTitle}
            body={x.empty.noConnectionBody}
            action={<Link href={platformSetupHref(projectId)}><Button>{x.connectSite}</Button></Link>}
          />
        )}
      </Card>
    )
  }

  const gscOk = payload.gsc.state === 'ok'
  const showUpdated = payload.items.some((it) => !!it.updatedAt)
  const riskCount = payload.items.filter((it) => !!it.cannibalization).length
  const visible = filterItems(payload.items, filter, onlyRisk)
  const page = visible.slice(0, shown)
  const colCount = 4 + (showUpdated ? 1 : 0) + (gscOk ? 3 : 0)
  const indexedAt = day(payload.indexedAt)
  const gscNote = payload.gsc.state === 'not_connected' || payload.gsc.state === 'not_synced' || payload.gsc.state === 'unavailable'
    ? x.gscNote[payload.gsc.state] : null

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-caption text-muted">
          {x.sourceLine[payload.source]}
          {indexedAt && <> · {fill(x.indexedAt, { date: indexedAt })}</>}
        </p>
        {resyncButton}
      </div>

      {payload.partial && (
        <Notice tone="warn">
          <div className="flex flex-wrap items-start gap-3">
            <div role="note" className="min-w-0 flex-1 basis-56 space-y-1">
              <p className="font-semibold text-ink">{x.partialTitle}</p>
              <p className="max-w-prose text-body">{payload.partialReason === 'crawl' ? x.partialCrawlBody : x.partialIndexBody}</p>
            </div>
            {payload.partialReason === 'crawl' && !siteConnected && (
              <Link href={platformSetupHref(projectId)} className="shrink-0"><Button size="sm" variant="secondary">{x.connectSite}</Button></Link>
            )}
          </div>
        </Notice>
      )}

      <div role="group" aria-label={x.tilesLabel} className="list-enter grid grid-cols-3 gap-4 sm:gap-5">
        {FILTERS.map((f) => {
          const active = filter === f
          return (
            <button
              key={f}
              type="button"
              aria-pressed={active}
              onClick={() => { setFilter(f); setShown(PAGE_SIZE) }}
              className="rounded-card text-start focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
            >
              <StatTile
                label={x.tiles[f]}
                value={num.format(payload.counts[f])}
                source={x.tileSource[payload.source]}
                icon={FILTER_ICONS[f]}
                className={cn('transition-colors duration-150 ease-snappy', active ? 'border-action ring-1 ring-action' : 'hover:border-line-strong')}
              />
            </button>
          )
        })}
      </div>

      {payload.truncated && <p className="text-caption text-muted">{fill(x.truncatedNote, { n: num.format(payload.items.length) })}</p>}

      <div className="flex flex-wrap items-center justify-between gap-3">
        {riskCount > 0 ? (
          <button
            type="button"
            aria-pressed={onlyRisk}
            onClick={() => { setOnlyRisk((v) => !v); setShown(PAGE_SIZE) }}
            className={cn(
              'inline-flex h-8 items-center gap-1.5 rounded-pill border px-3 text-caption font-semibold transition-colors duration-150 ease-snappy',
              'focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20',
              onlyRisk ? 'border-action bg-action-soft text-action' : 'border-line bg-surface text-body hover:border-line-strong',
            )}
          >
            <AlertTriangle aria-hidden="true" className="size-4" />
            {fill(x.onlyRisk, { n: num.format(riskCount) })}
          </button>
        ) : <span />}
        {gscOk && payload.gsc.startDate && payload.gsc.endDate && (
          <p className="text-overline text-muted" title={x.gscRowsNote}>
            <bdi>{x.gscBrand}</bdi> · {fill(x.gscWindow, { start: day(payload.gsc.startDate) ?? '', end: day(payload.gsc.endDate) ?? '' })}
          </p>
        )}
      </div>

      {/* Only why the figures are missing: the setup row above this screen already
          links to the Search Console settings, so a second link here would repeat it. */}
      {gscNote && <p className="text-caption text-muted">{gscNote}</p>}

      <Table>
        <caption className="sr-only">{x.tableLabel}</caption>
        <TableHead>
          <tr>
            <Th className={CELL}>{x.columns.title}</Th>
            <Th className={cn(CELL, FROM_MD)}>{x.columns.type}</Th>
            {showUpdated && <Th className={cn(CELL, FROM_LG)}>{x.columns.updated}</Th>}
            {gscOk && <Th className={cn(CELL, FROM_SM, 'text-end')}>{x.columns.clicks}</Th>}
            {gscOk && <Th className={cn(CELL, FROM_MD, 'text-end')}>{x.columns.impressions}</Th>}
            {gscOk && <Th className={cn(CELL, FROM_LG)}>{x.columns.topQuery}</Th>}
            <Th className={cn(CELL, FROM_SM)}>{x.columns.flags}</Th>
            <Th className={CELL}><span className="sr-only">{x.columns.action}</span></Th>
          </tr>
        </TableHead>
        <TableBody>
          {page.length === 0 ? (
            <EmptyRow colSpan={colCount} message={x.empty.filterEmpty} />
          ) : page.map((it) => {
            const planned = it.supportTopicPlanned || plannedNow.has(it.key)
            // Only the exceptions carry a badge (final review R24): an article WE wrote,
            // and a cannibalization risk. "Was on the site" is every other page's normal
            // state, so it is not stamped on each row.
            const flags = (it.group === 'content' && it.origin === 'ours') || it.cannibalization ? (
              <div className="flex flex-wrap items-center gap-1.5">
                {it.group === 'content' && it.origin === 'ours' && <Badge variant="info">{x.origin.ours}</Badge>}
                {it.cannibalization && <Badge variant="warning" dot>{x.cannibal}</Badge>}
              </div>
            ) : null
            return (
              <TableRow key={it.key}>
                <Td className={cn(CELL, 'max-w-40 sm:max-w-64')}>
                  <p className="truncate font-medium text-ink" title={it.title}>{it.title}</p>
                  <a
                    href={it.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={fill(x.openPage, { title: it.title })}
                    className="mt-0.5 inline-flex max-w-full items-center gap-1 text-caption text-muted hover:text-action hover:underline"
                  >
                    <span dir="ltr" className="truncate">{displayPath(it.url)}</span>
                    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" />
                  </a>
                  {/* The phone's meta line: what the hidden columns would have said. */}
                  <p data-existing-meta="" className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-caption text-muted md:hidden">
                    <span>{x.types[it.type]}</span>
                    {gscOk && it.metrics && <span className="tabular-nums sm:hidden">· {num.format(it.metrics.clicks)} {x.columns.clicks}</span>}
                  </p>
                  {flags && <div className="mt-1.5 sm:hidden">{flags}</div>}
                </Td>
                <Td className={cn(CELL, FROM_MD, 'whitespace-nowrap')}>{x.types[it.type]}</Td>
                {showUpdated && <Td className={cn(CELL, FROM_LG, 'whitespace-nowrap text-muted')}>{day(it.updatedAt) ?? EMPTY_DATE}</Td>}
                {gscOk && <Td className={cn(CELL, FROM_SM, 'text-end tabular-nums')}>{it.metrics ? num.format(it.metrics.clicks) : EMPTY_DATE}</Td>}
                {gscOk && <Td className={cn(CELL, FROM_MD, 'text-end tabular-nums')}>{it.metrics ? num.format(it.metrics.impressions) : EMPTY_DATE}</Td>}
                {gscOk && (
                  <Td className={cn(CELL, FROM_LG, 'max-w-36')}>
                    {it.metrics?.topQuery ? <span className="block truncate" title={it.metrics.topQuery}>{it.metrics.topQuery}</span> : <span className="text-muted">{EMPTY_DATE}</span>}
                  </Td>
                )}
                <Td className={cn(CELL, FROM_SM, 'min-w-36')}>
                  {flags}
                  {it.cannibalization && (
                    <p className="mt-1 max-w-48 text-caption text-muted">
                      {fill(x.cannibalDetail, { n: num.format(it.cannibalization.pages), query: it.cannibalization.query })}
                    </p>
                  )}
                </Td>
                <Td className={cn(CELL, 'whitespace-nowrap text-end')}>
                  {it.group === 'commerce' && (planned ? (
                    <Link href={strategyHref('list', STRATEGY_ANCHORS.topics)} className="rounded-control text-caption font-semibold text-action hover:underline focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20">
                      {x.supportPlanned}
                    </Link>
                  ) : (
                    <Button size="sm" variant="secondary" loading={creating === it.key} disabled={!!creating && creating !== it.key} onClick={() => void writeSupport(it)}>
                      {x.writeSupport}
                    </Button>
                  ))}
                </Td>
              </TableRow>
            )
          })}
        </TableBody>
      </Table>

      {visible.length > shown && (
        <div className="flex justify-center">
          <Button variant="secondary" size="sm" onClick={() => setShown((n) => n + PAGE_SIZE)}>
            {fill(x.showMore, { n: num.format(Math.min(PAGE_SIZE, visible.length - shown)) })}
          </Button>
        </div>
      )}
    </div>
  )
}
