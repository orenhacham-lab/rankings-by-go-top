'use client'

/**
 * L2 — shared, READ-ONLY Search Console metrics view (extracted from GscPanel).
 *
 * Given only a projectId, it renders the underlying SC data with every state:
 * not-connected / no-property / reauth-required / never-synced / loading / error /
 * empty / data-available. It performs NO connection management (connect / property /
 * sync / disconnect stay in GscPanel) — messages point the user to that setup.
 * Shown inside GscPanel, in the project's settings (the Search Console screen that also
 * showed it is gone), so there is exactly one SC data model and no duplicated sync logic.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
import Notice from '@/components/ui/Notice'
import Segmented from '@/components/ui/Segmented'
import Select from '@/components/ui/Select'
import StatTile from '@/components/ui/StatTile'
import { Skeleton } from '@/components/ui/Skeleton'
import { Table, TableHead, TableBody, TableRow, Th, Td } from '@/components/ui/Table'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type WindowDays = 28 | 90
const WINDOWS: WindowDays[] = [28, 90]
// L1 — default 10 rows; the metrics endpoint clamps pageSize ≤ 100 (client-only).
const PAGE_SIZE_OPTIONS = [10, 25, 50, 100] as const

type ConnStatus = 'connected' | 'reauth_required' | 'revoked' | 'error'
interface SummaryCard { runId: string; windowDays: number; startDate: string | null; endDate: string | null; latestAvailableDate: string | null; rowsFetched: number; truncated: boolean; finishedAt: string | null; summaryResyncRequired?: boolean; clicks: number | null; impressions: number | null; ctr: number | null; avgPosition: number | null }
interface StatusResponse { ok: boolean; oauthConfigured: boolean; connection: { status: ConnStatus } | null; property: { siteUrl: string } | null; windows: Record<string, SummaryCard | null> }
interface MetricRow { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }
interface MultiPageRow { query: string; distinctPageCount: number; totalClicks: number; totalImpressions: number; pages: string[] }

const fmtInt = (n: number) => Math.round(n).toLocaleString()
const fmtCtr = (n: number) => `${(n * 100).toFixed(2)}%`
const fmtPos = (n: number) => n.toFixed(1)
const safeDecodeUrl = (u: string) => { try { return decodeURI(u) } catch { return u } }

type Dict = ReturnType<typeof getDashboardDictionary>['projectDetail']['contentSection']['gsc']

function Note({ children }: { children: React.ReactNode }) {
  return <div className="rounded-inset border border-line bg-sunk/60 px-4 py-3 text-copy text-muted">{children}</div>
}

export default function GscMetricsTable({ projectId, refreshKey = 0 }: { projectId: string; refreshKey?: number }) {
  const { language } = useDashboardLanguage()
  const t: Dict = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.gsc, [language])

  const [statusLoading, setStatusLoading] = useState(true)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [notFound, setNotFound] = useState(false)

  const [activeWindow, setActiveWindow] = useState<WindowDays>(28)
  const [activeTab, setActiveTab] = useState<'queries' | 'opportunities' | 'multipage'>('queries')
  const [rows, setRows] = useState<(MetricRow | MultiPageRow)[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [pageSize, setPageSize] = useState<number>(10)
  const [loadingRows, setLoadingRows] = useState(false)
  const [rowsError, setRowsError] = useState(false)

  useEffect(() => {
    let cancelled = false
    setStatusLoading(true); setNotFound(false)
    void (async () => {
      try {
        const res = await fetch(`/api/gsc/status?projectId=${encodeURIComponent(projectId)}`)
        if (cancelled) return
        if (res.status === 404) { setNotFound(true); setStatus(null); return }
        setStatus(await res.json() as StatusResponse)
      } catch { if (!cancelled) setStatus(null) } finally { if (!cancelled) setStatusLoading(false) }
    })()
    return () => { cancelled = true }
    // refreshKey lets a parent (GscPanel) force a re-fetch after a sync / property change.
  }, [projectId, refreshKey])

  const connection = status?.connection ?? null
  const property = status?.property ?? null

  const loadRows = useCallback(async () => {
    if (!property) return
    setLoadingRows(true); setRowsError(false)
    try {
      const res = await fetch(`/api/gsc/metrics?projectId=${projectId}&window=${activeWindow}&view=${activeTab}&page=${page}&pageSize=${pageSize}`)
      const data = await res.json()
      if (data.ok) { setRows(data.rows ?? []); setTotal(data.total ?? 0) }
      else { setRows([]); setTotal(0); setRowsError(true) }
    } catch { setRows([]); setTotal(0); setRowsError(true) } finally { setLoadingRows(false) }
  }, [projectId, property, activeWindow, activeTab, page, pageSize])

  useEffect(() => { setPage(0) }, [activeWindow, activeTab])
  useEffect(() => { if (property) loadRows() }, [loadRows, property])

  // ── Connection/property states (read-only messages — setup lives in the GSC panel). ──
  if (statusLoading) return <Skeleton className="h-24 w-full rounded-inset" />
  if (notFound || !status?.connection) return <Note>{t.errors.not_connected}</Note>
  if (connection?.status === 'reauth_required') return <Notice tone="warn">{t.statusReauthRequired} — {t.reauthHint}</Notice>
  if (connection?.status === 'revoked' || connection?.status === 'error') return <Note>{t.errors.not_connected}</Note>
  if (!property) return <Note>{t.noPropertyAssigned}</Note>

  const summary = status?.windows?.[String(activeWindow)] ?? null

  return (
    <div className="space-y-4">
      {/* Window toggle */}
      <Segmented<`${WindowDays}`>
        ariaLabel={t.windowLabel}
        value={`${activeWindow}`}
        onChange={(v) => setActiveWindow(Number(v) as WindowDays)}
        options={WINDOWS.map((w) => ({ value: `${w}` as `${WindowDays}`, label: w === 28 ? t.window28 : t.window90 }))}
      />

      {!summary ? (
        <Note>{t.neverSynced}</Note>
      ) : summary.summaryResyncRequired ? (
        <Notice tone="warn">{t.summaryResyncRequired}</Notice>
      ) : (
        <div className="space-y-3">
          <h4 className="text-overline font-semibold uppercase tracking-wide text-muted">{t.propertySummaryLabel}</h4>
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            {[
              { label: t.cardClicks, value: fmtInt(summary.clicks ?? 0) },
              { label: t.cardImpressions, value: fmtInt(summary.impressions ?? 0) },
              { label: t.cardCtr, value: fmtCtr(summary.ctr ?? 0) },
              { label: t.cardAvgPosition, value: summary.avgPosition != null ? fmtPos(summary.avgPosition) : '—' },
            ].map((c) => (
              <StatTile key={c.label} label={c.label} value={c.value} className="rounded-inset bg-sunk/60 p-3 shadow-none sm:p-4" />
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
            {summary.startDate && summary.endDate && <span>{t.dateRange}: <span dir="ltr">{summary.startDate} – {summary.endDate}</span></span>}
            {summary.latestAvailableDate && <span>{t.latestAvailableDate}: <span dir="ltr">{summary.latestAvailableDate}</span></span>}
            <span>{t.rowsFetched}: {fmtInt(summary.rowsFetched)}</span>
          </div>
          {summary.truncated && <Notice tone="warn">{t.truncatedNote}</Notice>}
          <p className="max-w-prose text-caption text-muted">{t.detailVsSummaryNote}</p>
        </div>
      )}

      {/* View tabs */}
      <Segmented<'queries' | 'opportunities' | 'multipage'>
        ariaLabel={t.viewsLabel}
        value={activeTab}
        onChange={setActiveTab}
        options={[{ value: 'queries', label: t.tabQueries }, { value: 'opportunities', label: t.tabOpportunities }, { value: 'multipage', label: t.tabMultipage }]}
        className="max-w-full overflow-x-auto"
      />
      {activeTab === 'opportunities' && <p className="max-w-prose text-caption text-muted">{t.opportunitiesHint}</p>}
      {activeTab === 'multipage' && <p className="max-w-prose text-caption text-muted">{t.multipageHint}</p>}

      {/* Table */}
      {loadingRows ? (
        <div role="status" aria-busy="true" className="space-y-2">{[0, 1, 2].map((i) => <Skeleton key={i} className="h-10 w-full rounded-control" />)}</div>
      ) : rowsError ? (
        <Notice tone="bad">{t.genericError}</Notice>
      ) : rows.length === 0 ? (
        <Note>{t.emptyRows}</Note>
      ) : activeTab === 'multipage' ? (
        <Table>
          <TableHead>
            <tr>
              <Th>{t.colQuery}</Th>
              <Th className="text-end">{t.colDistinctPages}</Th>
              <Th className="text-end">{t.colClicks}</Th>
              <Th className="text-end">{t.colImpressions}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {(rows as MultiPageRow[]).map((r, i) => (
              <TableRow key={`${r.query}-${i}`}>
                <Td className="font-medium text-ink">{r.query}</Td>
                <Td className="text-end">{r.distinctPageCount}</Td>
                <Td className="text-end">{fmtInt(r.totalClicks)}</Td>
                <Td className="text-end">{fmtInt(r.totalImpressions)}</Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      ) : (
        <Table>
          <TableHead>
            <tr>
              <Th>{t.colQuery}</Th>
              <Th>{t.colPage}</Th>
              <Th className="text-end">{t.colClicks}</Th>
              <Th className="text-end">{t.colImpressions}</Th>
              <Th className="text-end">{t.colCtr}</Th>
              <Th className="text-end">{t.colPosition}</Th>
            </tr>
          </TableHead>
          <TableBody>
            {(rows as MetricRow[]).map((r, i) => (
              <TableRow key={`${r.query}-${r.page}-${i}`}>
                <Td className="font-medium text-ink">{r.query}</Td>
                <Td>
                  <a href={r.page} target="_blank" rel="noopener noreferrer" title={safeDecodeUrl(r.page)} dir="ltr"
                    className="inline-flex max-w-64 items-center gap-1 text-caption text-muted hover:text-action hover:underline">
                    <ExternalLink aria-hidden="true" className="size-3.5 shrink-0" /><span className="truncate">{safeDecodeUrl(r.page)}</span>
                  </a>
                </Td>
                <Td className="text-end">{fmtInt(r.clicks)}</Td>
                <Td className="text-end">{fmtInt(r.impressions)}</Td>
                <Td className="text-end">{fmtCtr(r.ctr)}</Td>
                <Td className="text-end">{fmtPos(r.position)}</Td>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}

      {/* Pagination + page-size selector (L1) */}
      {total > 0 && !rowsError && (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <label htmlFor={`gsc-page-size-${projectId}`} className="text-caption text-muted">{t.pageSizeLabel}</label>
            <Select id={`gsc-page-size-${projectId}`} value={String(pageSize)} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
              options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))} className="h-8 w-20" />
          </div>
          <div className="flex items-center gap-2">
            <span className="text-caption text-muted tabular-nums">{t.pageOf(page * pageSize + 1, Math.min((page + 1) * pageSize, total), total)}</span>
            <Button size="sm" variant="secondary" disabled={page === 0 || loadingRows} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prevPage}</Button>
            <Button size="sm" variant="secondary" disabled={(page + 1) * pageSize >= total || loadingRows} onClick={() => setPage((p) => p + 1)}>{t.nextPage}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
