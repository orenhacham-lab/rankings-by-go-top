'use client'

/**
 * The existing-content screen: every page already on the merchant's site.
 *
 * What the merchant learns here, top to bottom:
 *   1. how big the site is and what it is made of: the TRUE total per kind
 *      (products, articles, pages, categories), and what Google says about it
 *      (existing/SiteSummary.tsx);
 *   2. one tab per kind with that same total on the tab ("מוצרים 912"), even
 *      when the list shows only its first rows: the list is paged, searched
 *      and sorted on the server (GET /api/content/existing), 50 rows at a time;
 *   3. per page: its address, when it was updated, Search Console's clicks,
 *      impressions and position, the keyword it ranks for, and the one action
 *      worth taking — only when the figures give a reason, with the reason.
 *
 * THE FULL-SITE MAPPING runs in the background (POST /api/content/existing/map):
 * the sitemaps, then the platform's own lists. The screen starts it on the first
 * visit and when it is a week old, polls its progress while it runs, and reloads
 * the list when it ends. Nothing waits for it: the list shows what the app
 * already holds meanwhile. While the table does not exist yet (its migration not
 * applied) the mapping is simply not offered.
 *
 * Actions, all through routes that already exist:
 *   - "write a supporting article" creates a topic through /api/content/topics,
 *     with the page as a required internal link. No model call.
 *   - "improve the article" opens our own article (/content/articles/<id>).
 *   - "update the list" starts the mapping, plus the existing Shopify sync or
 *     WordPress index refresh where one applies.
 *
 * There is no "no supporting article" flag. The only record of what links to a
 * page is the internal-link plans, and those cover the articles WE write, not
 * the merchant's own posts.
 *
 * Presentation lives in ./existing/*, apart from this file's data flow, so the
 * screen can take the new shared visual pieces without touching the logic.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Library, Search } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Notice from '@/components/ui/Notice'
import Button from '@/components/ui/Button'
import EmptyState from '@/components/ui/EmptyState'
import Select from '@/components/ui/Select'
import { FIELD_CLASSES } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { formatDate } from '@/lib/format/date'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { platformSetupHref } from '@/lib/content/content-hub-setup'
import {
  supportTopicBody, topicLanguage, PAGE_LIMIT_DEFAULT,
  type ExistingContentItem, type ExistingContentPayload, type ExistingContentSort, type ExistingContentTab, type SiteMapStatus,
} from '@/lib/content/existing-content/model'
import { useContentWorkspace } from './ContentWorkspaceProvider'
import SiteSummary, { MappingProgress } from './existing/SiteSummary'
import KindTabs from './existing/KindTabs'
import ContentTable from './existing/ContentTable'
import ExistingSkeleton from './existing/ExistingSkeleton'
import { fill } from './existing/format'

const PAGE_SIZE = PAGE_LIMIT_DEFAULT
const POLL_MS = 2500
const SEARCH_DEBOUNCE_MS = 300
/** A finished mapping older than this is refreshed on the next visit. */
const MAP_STALE_MS = 7 * 24 * 3600_000
const PANEL_ID = 'existing-content-panel'

interface View { tab: ExistingContentTab; q: string; sort: ExistingContentSort | null; risk: boolean }
const FIRST_VIEW: View = { tab: 'all', q: '', sort: null, risk: false }

/** The mapping should (re)start by itself: never mapped, or mapped long ago. */
function mapDue(m: SiteMapStatus, now: number): boolean {
  if (m.state === 'never') return true
  if ((m.state === 'completed' || m.state === 'partial' || m.state === 'failed') && m.finishedAt) return now - Date.parse(m.finishedAt) > MAP_STALE_MS
  return false
}

export default function ExistingContentScreen() {
  const { projectId, selectedProject, language, isHebrew, toast, loadTopics, data: overview } = useContentWorkspace()
  const x = useMemo(() => getDashboardDictionary(language).existingContent, [language])
  const locale = isHebrew ? 'he-IL' : 'en-US'
  const num = useMemo(() => new Intl.NumberFormat(locale), [locale])
  const pos = useMemo(() => new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }), [locale])
  const day = useCallback((iso: string | null) => (iso ? formatDate(iso, language) : null), [language])

  const [payload, setPayload] = useState<ExistingContentPayload | null>(null)
  const [rows, setRows] = useState<ExistingContentItem[]>([])
  const [loadFailed, setLoadFailed] = useState(false)
  const [view, setView] = useState<View>(FIRST_VIEW)
  const [queryText, setQueryText] = useState('')
  const [loading, setLoading] = useState<'none' | 'view' | 'more'>('none')
  const [refreshing, setRefreshing] = useState(false)
  const [creating, setCreating] = useState<string | null>(null)
  const [plannedNow, setPlannedNow] = useState<Set<string>>(() => new Set())
  const reqId = useRef(0)
  const hasPayload = useRef(false)
  const autoStarted = useRef<string | null>(null)
  // The first mapping starts by itself; until it could not, "never mapped" reads as "mapping".
  const [autoFailed, setAutoFailed] = useState(false)
  const viewRef = useRef(view)
  useEffect(() => { viewRef.current = view }, [view])

  const fetchList = useCallback(async (v: View, offset: number): Promise<void> => {
    if (!projectId) return
    const id = ++reqId.current
    const params = new URLSearchParams({ projectId, tab: v.tab, offset: String(offset), limit: String(PAGE_SIZE) })
    if (v.q.trim()) params.set('q', v.q.trim())
    if (v.sort) params.set('sort', v.sort)
    if (v.risk) params.set('risk', '1')
    try {
      const res = await fetch(`/api/content/existing?${params.toString()}`)
      const body = await res.json().catch(() => null)
      if (id !== reqId.current) return
      if (!res.ok || !body?.ok) throw new Error('load')
      const next = body as ExistingContentPayload
      hasPayload.current = true
      setPayload(next)
      setRows((prev) => (offset > 0 ? [...prev, ...next.items] : next.items))
      setLoadFailed(false)
    } catch {
      if (id !== reqId.current) return
      // A first load that fails is a retry card; a later one keeps the list and says so.
      if (hasPayload.current) toast.error(x.loadError)
      else setLoadFailed(true)
    } finally {
      if (id === reqId.current) setLoading('none')
    }
  }, [projectId, toast, x.loadError])

  // A new project: start over, skeleton first.
  useEffect(() => {
    hasPayload.current = false
    autoStarted.current = null
    viewRef.current = FIRST_VIEW
    setPayload(null); setRows([]); setLoadFailed(false); setView(FIRST_VIEW); setQueryText(''); setPlannedNow(new Set()); setAutoFailed(false)
    void fetchList(FIRST_VIEW, 0)
  }, [fetchList])

  const changeView = useCallback((patch: Partial<View>) => {
    const next = { ...viewRef.current, ...patch }
    viewRef.current = next
    setView(next)
    setLoading('view')
    void fetchList(next, 0)
  }, [fetchList])

  // The search runs as the merchant types, a moment after the last key.
  useEffect(() => {
    if (queryText === viewRef.current.q) return
    const t = setTimeout(() => changeView({ q: queryText }), SEARCH_DEBOUNCE_MS)
    return () => clearTimeout(t)
  }, [queryText, changeView])

  const showMore = useCallback(() => {
    setLoading('more')
    void fetchList(viewRef.current, rows.length)
  }, [fetchList, rows.length])

  // ── The full-site mapping ────────────────────────────────────────────────
  const setMap = useCallback((map: SiteMapStatus) => setPayload((p) => (p ? { ...p, map } : p)), [])

  const startMap = useCallback(async (quiet: boolean): Promise<'running' | 'recent' | 'failed'> => {
    if (!projectId) return 'failed'
    try {
      const res = await fetch('/api/content/existing/map', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const body = await res.json().catch(() => null)
      if (res.status === 202) {
        setPayload((p) => (p ? { ...p, map: { ...p.map, state: 'running', phase: p.map.state === 'running' ? p.map.phase : 'robots' } } : p))
        return 'running'
      }
      if (res.ok && body?.state === 'recent') return 'recent'
      if (!quiet) toast.error(x.map.startFailed)
      return 'failed'
    } catch {
      if (!quiet) toast.error(x.map.startFailed)
      return 'failed'
    }
  }, [projectId, toast, x.map.startFailed])

  // First visit, or a week-old mapping: start it once per project, quietly.
  useEffect(() => {
    if (!payload || !projectId || autoStarted.current === projectId) return
    autoStarted.current = projectId
    if (mapDue(payload.map, Date.now())) void startMap(true).then((r) => { if (r !== 'running') setAutoFailed(true) })
  }, [payload, projectId, startMap])

  // While it runs: its progress, and the list again when it ends.
  const mapRunning = payload?.map.state === 'running'
  useEffect(() => {
    if (!mapRunning || !projectId) return
    let stop = false
    const tick = async () => {
      try {
        const res = await fetch(`/api/content/existing/map?projectId=${encodeURIComponent(projectId)}`)
        const body = await res.json().catch(() => null)
        if (stop || !res.ok || !body?.ok) return
        const map = body.map as SiteMapStatus
        if (map.state === 'running') { setMap(map); return }
        stop = true
        setMap(map)
        void fetchList(viewRef.current, 0)
      } catch { /* the next tick tries again */ }
    }
    const timer = setInterval(() => { void tick() }, POLL_MS)
    return () => { stop = true; clearInterval(timer) }
  }, [mapRunning, projectId, setMap, fetchList])

  const refresh = useCallback(async () => {
    if (!payload || refreshing) return
    setRefreshing(true)
    try {
      const mapAvailable = payload.map.state !== 'unavailable' && payload.map.state !== 'no_site'
      const post = (url: string, body: Record<string, unknown>) =>
        fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
          .then((r) => r.ok || r.status === 202).catch(() => false)
      const [mapped, synced] = await Promise.all([
        mapAvailable ? startMap(true) : Promise.resolve(null),
        payload.resync === 'shopify' ? post('/api/shopify/sync', { projectId })
          : payload.resync === 'wordpress' ? post('/api/content/automation/internal-links/index/refresh', { projectId, force: true })
            : Promise.resolve(null),
      ])
      if (mapped === 'running') toast.success(x.map.started)
      else if (mapped === 'recent') toast.success(x.map.recent)
      else if (synced === true) { toast.success(x.map.started); void fetchList(viewRef.current, 0) }
      else toast.error(x.map.startFailed)
    } finally {
      setRefreshing(false)
    }
  }, [payload, refreshing, startMap, projectId, toast, x.map, fetchList])

  // ── "Write a supporting article" ─────────────────────────────────────────
  const writeSupport = useCallback(async (item: ExistingContentItem) => {
    if (creating) return
    setCreating(item.key)
    try {
      const lang = topicLanguage(selectedProject?.language)
      const copy = getDashboardDictionary(lang).existingContent.supportTopic
      const res = await fetch('/api/content/topics', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(supportTopicBody({ ...item, title: item.isHome ? x.homePage : item.title }, projectId, lang, copy)),
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
        <Button variant="secondary" onClick={() => { setLoadFailed(false); void fetchList(viewRef.current, 0) }}>{x.retry}</Button>
      </Card>
    )
  }

  if (!payload) return <ExistingSkeleton label={x.loading} />

  // A site is "connected" when any publishing platform is (the overview resolves it),
  // or when the store / WordPress connection this screen reads is.
  const platform = overview?.platform?.platform ?? 'none'
  const siteConnected = platform !== 'none' || payload.connections.shopify || payload.connections.wordpress
  const mapAvailable = payload.map.state !== 'unavailable' && payload.map.state !== 'no_site'
  const canRefresh = mapAvailable || !!payload.resync

  // Never mapped: the start is already on its way (above), so this is "mapping", not "nothing".
  const mapStarting = payload.map.state === 'never' && !autoFailed
  const mapIdle = payload.map.state !== 'running' && !mapStarting

  if (payload.counts.all === 0) {
    return (
      <Card padding={false}>
        {!mapIdle ? (
          <div data-existing-empty="mapping">
            <EmptyState icon={<Library />} title={x.empty.noDataTitle} body={x.empty.noDataBody} />
            <MappingProgress x={x} data={payload} num={num} />
          </div>
        ) : siteConnected || mapAvailable ? (
          <EmptyState
            icon={<Library />}
            title={x.empty.noConnectionTitle}
            body={x.empty.noDataIdleBody}
            action={canRefresh ? <Button onClick={() => void refresh()} loading={refreshing}>{x.map.refresh}</Button> : null}
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
  const gscNote = payload.gsc.state === 'not_connected' || payload.gsc.state === 'not_synced' || payload.gsc.state === 'unavailable'
    ? x.gscNote[payload.gsc.state] : null
  const showUpdated = rows.some((it) => !!it.updatedAt)
  const sortOptions = (gscOk ? (['impressions', 'clicks', 'position', 'updated', 'title'] as const) : (['updated', 'title'] as const))
    .map((s) => ({ value: s, label: x.sorts[s] }))
  const mapNote = !mapIdle ? null
    : payload.map.state === 'failed' ? x.map.failed
    : payload.map.stopReason === 'robots_unreadable' ? x.map.blocked
    : payload.map.stopReason === 'no_sitemap' ? x.map.noSitemap
    : null
  const partialBody = payload.partialReason === 'crawl' ? x.partialCrawlBody
    : payload.partialReason === 'map_capped' ? fill(x.map.capped, { n: num.format(payload.map.found) })
    : payload.partialReason === 'gsc_only' ? x.partialGscBody
    : x.partialIndexBody

  return (
    <div className="space-y-6">
      <SiteSummary
        x={x}
        data={payload}
        tab={view.tab}
        onTab={(tab) => changeView({ tab })}
        risk={view.risk}
        onRisk={() => changeView({ risk: !view.risk })}
        num={num}
        day={day}
        refresh={{ show: canRefresh, busy: refreshing, onClick: () => void refresh() }}
      />

      {payload.partial && mapIdle && (
        <Notice tone="warn">
          <div className="flex flex-wrap items-start gap-3">
            <div role="note" className="min-w-0 flex-1 basis-56 space-y-1">
              <p className="font-semibold text-ink">{x.partialTitle}</p>
              <p className="max-w-prose text-body">{partialBody}</p>
            </div>
            {payload.partialReason === 'crawl' && !siteConnected && !mapAvailable && (
              <Link href={platformSetupHref(projectId)} className="shrink-0"><Button size="sm" variant="secondary">{x.connectSite}</Button></Link>
            )}
          </div>
        </Notice>
      )}
      {mapNote && <p className="text-caption text-muted">{mapNote}</p>}

      <section aria-label={x.tableLabel} className="space-y-4">
        <KindTabs x={x} counts={payload.counts} capped={payload.map.capped} value={view.tab} onChange={(tab) => changeView({ tab })} num={num} panelId={PANEL_ID} />

        <div className="flex flex-wrap items-center gap-3">
          <label className="relative min-w-0 flex-1 basis-64 sm:max-w-md">
            <span className="sr-only">{x.searchLabel}</span>
            <Search aria-hidden="true" className="pointer-events-none absolute start-3 top-1/2 size-4 -translate-y-1/2 text-muted" />
            <input
              type="search"
              value={queryText}
              onChange={(e) => setQueryText(e.target.value)}
              placeholder={x.searchPlaceholder}
              className={cn(FIELD_CLASSES, 'h-10 ps-9')}
            />
          </label>
          <div className="w-full sm:w-56">
            <Select aria-label={x.sortLabel} value={payload.view.sort} options={sortOptions} onChange={(e) => changeView({ sort: e.target.value as ExistingContentSort })} />
          </div>
          <p className="text-caption text-muted tabular-nums sm:ms-auto" aria-live="polite">
            {loading === 'view' ? x.updatingList : fill(x.shownOf, { shown: num.format(rows.length), total: num.format(payload.matching) })}
          </p>
        </div>

        {payload.truncated && <p className="text-caption text-muted">{fill(x.truncatedNote, { n: num.format(payload.sources.shopify) })}</p>}
        {/* Only why the figures are missing: the setup row above this screen already
            links to the Search Console settings, so a second link here would repeat it. */}
        {gscNote && <p className="text-caption text-muted">{gscNote}</p>}
        {gscOk && payload.gsc.startDate && payload.gsc.endDate && (
          <p className="text-overline text-muted" title={x.gscRowsNote}>
            <bdi>{x.gscBrand}</bdi> · {fill(x.gscWindow, { start: day(payload.gsc.startDate) ?? '', end: day(payload.gsc.endDate) ?? '' })}
          </p>
        )}

        <ContentTable
          x={x}
          items={rows}
          tab={view.tab}
          gscOk={gscOk}
          showUpdated={showUpdated}
          num={num}
          pos={pos}
          day={day}
          creating={creating}
          plannedNow={plannedNow}
          onSupport={(it) => void writeSupport(it)}
          emptyMessage={view.q.trim() ? x.empty.searchEmpty : x.empty.filterEmpty}
          busy={loading === 'view'}
          panelId={PANEL_ID}
        />

        {payload.matching > rows.length && (
          <div className="flex flex-col items-center gap-2">
            <Button variant="secondary" size="sm" onClick={showMore} loading={loading === 'more'} disabled={loading !== 'none'}>
              {loading === 'more' ? x.loadingMore : fill(x.showMore, { n: num.format(Math.min(PAGE_SIZE, payload.matching - rows.length)) })}
            </Button>
            <p className="text-caption text-muted tabular-nums">{fill(x.shownOf, { shown: num.format(rows.length), total: num.format(payload.matching) })}</p>
          </div>
        )}
      </section>
    </div>
  )
}
