'use client'

/**
 * L2 — shared, READ-ONLY Search Console metrics view (extracted from GscPanel).
 *
 * Given only a projectId, it renders the underlying SC data with every state:
 * not-connected / no-property / reauth-required / never-synced / loading / error /
 * empty / data-available. It performs NO connection management (connect / property /
 * sync / disconnect stay in GscPanel) — messages point the user to that setup.
 * Reused on the project page (inside GscPanel) and in the Content Hub data sub-tab,
 * so there is exactly one SC data model and no duplicated sync logic.
 */
import { useCallback, useEffect, useMemo, useState } from 'react'
import { AlertTriangle, ExternalLink } from 'lucide-react'
import Button from '@/components/ui/Button'
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
  return <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-4 text-sm text-slate-500 dark:text-slate-400">{children}</div>
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
  if (statusLoading) return <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4"><span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
  if (notFound || !status?.connection) return <Note>{t.errors.not_connected}</Note>
  if (connection?.status === 'reauth_required') return <Note><span className="inline-flex items-center gap-1"><AlertTriangle size={14} className="text-amber-600 dark:text-amber-400" />{t.statusReauthRequired} — {t.reauthHint}</span></Note>
  if (connection?.status === 'revoked' || connection?.status === 'error') return <Note>{t.errors.not_connected}</Note>
  if (!property) return <Note>{t.noPropertyAssigned}</Note>

  const summary = status?.windows?.[String(activeWindow)] ?? null

  return (
    <div className="space-y-3">
      {/* Window toggle */}
      <div className="flex gap-2">
        {WINDOWS.map((w) => (
          <button key={w} type="button" onClick={() => setActiveWindow(w)}
            className={`text-xs px-3 py-1.5 rounded-lg border ${activeWindow === w ? 'bg-indigo-600 text-white border-indigo-600' : 'bg-white dark:bg-slate-800 text-slate-600 dark:text-slate-300 border-slate-200 dark:border-slate-700'}`}>
            {w === 28 ? t.window28 : t.window90}
          </button>
        ))}
      </div>

      {!summary ? (
        <div className="text-sm text-slate-500 dark:text-slate-400 py-2">{t.neverSynced}</div>
      ) : summary.summaryResyncRequired ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-3 text-sm text-amber-800 dark:text-amber-300 flex items-center gap-2">
          <AlertTriangle size={14} /><span>{t.summaryResyncRequired}</span>
        </div>
      ) : (
        <>
          <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.propertySummaryLabel}</div>
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
            {[
              { label: t.cardClicks, value: fmtInt(summary.clicks ?? 0) },
              { label: t.cardImpressions, value: fmtInt(summary.impressions ?? 0) },
              { label: t.cardCtr, value: fmtCtr(summary.ctr ?? 0) },
              { label: t.cardAvgPosition, value: summary.avgPosition != null ? fmtPos(summary.avgPosition) : '—' },
            ].map((c) => (
              <div key={c.label} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{c.label}</div>
                <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{c.value}</div>
              </div>
            ))}
          </div>
          <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
            {summary.startDate && summary.endDate && <span>{t.dateRange}: <span dir="ltr">{summary.startDate} → {summary.endDate}</span></span>}
            {summary.latestAvailableDate && <span>{t.latestAvailableDate}: <span dir="ltr">{summary.latestAvailableDate}</span></span>}
            <span>{t.rowsFetched}: {fmtInt(summary.rowsFetched)}</span>
            {summary.truncated && <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><AlertTriangle size={12} />{t.truncatedNote}</span>}
          </div>
          <p className="text-[11px] text-slate-400 dark:text-slate-500">{t.detailVsSummaryNote}</p>
        </>
      )}

      {/* View tabs */}
      <div className="flex flex-wrap gap-2 border-b border-slate-200 dark:border-slate-700">
        {([['queries', t.tabQueries], ['opportunities', t.tabOpportunities], ['multipage', t.tabMultipage]] as const).map(([key, label]) => (
          <button key={key} type="button" onClick={() => setActiveTab(key)}
            className={`text-xs px-3 py-2 -mb-px border-b-2 ${activeTab === key ? 'border-indigo-600 text-indigo-600 dark:text-indigo-400' : 'border-transparent text-slate-500 dark:text-slate-400'}`}>
            {label}
          </button>
        ))}
      </div>
      {activeTab === 'opportunities' && <p className="text-xs text-slate-500 dark:text-slate-400">{t.opportunitiesHint}</p>}
      {activeTab === 'multipage' && <p className="text-xs text-slate-500 dark:text-slate-400">{t.multipageHint}</p>}

      {/* Table */}
      <div className="overflow-x-auto">
        {loadingRows ? (
          <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4"><span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : rowsError ? (
          <div className="text-sm text-red-600 dark:text-red-400 py-4">{t.genericError}</div>
        ) : rows.length === 0 ? (
          <div className="text-sm text-slate-500 dark:text-slate-400 py-4">{t.emptyRows}</div>
        ) : activeTab === 'multipage' ? (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="text-start font-medium py-2 pe-3">{t.colQuery}</th>
                <th className="text-end font-medium py-2 px-3">{t.colDistinctPages}</th>
                <th className="text-end font-medium py-2 px-3">{t.colClicks}</th>
                <th className="text-end font-medium py-2 ps-3">{t.colImpressions}</th>
              </tr>
            </thead>
            <tbody>
              {(rows as MultiPageRow[]).map((r, i) => (
                <tr key={`${r.query}-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pe-3 text-slate-800 dark:text-slate-100">{r.query}</td>
                  <td className="py-2 px-3 text-end tabular-nums">{r.distinctPageCount}</td>
                  <td className="py-2 px-3 text-end tabular-nums">{fmtInt(r.totalClicks)}</td>
                  <td className="py-2 ps-3 text-end tabular-nums">{fmtInt(r.totalImpressions)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-700">
                <th className="text-start font-medium py-2 pe-3">{t.colQuery}</th>
                <th className="text-start font-medium py-2 px-3">{t.colPage}</th>
                <th className="text-end font-medium py-2 px-3">{t.colClicks}</th>
                <th className="text-end font-medium py-2 px-3">{t.colImpressions}</th>
                <th className="text-end font-medium py-2 px-3">{t.colCtr}</th>
                <th className="text-end font-medium py-2 ps-3">{t.colPosition}</th>
              </tr>
            </thead>
            <tbody>
              {(rows as MetricRow[]).map((r, i) => (
                <tr key={`${r.query}-${r.page}-${i}`} className="border-b border-slate-100 dark:border-slate-800">
                  <td className="py-2 pe-3 text-slate-800 dark:text-slate-100">{r.query}</td>
                  <td className="py-2 px-3 max-w-[20rem]">
                    <a href={r.page} target="_blank" rel="noopener noreferrer" title={safeDecodeUrl(r.page)} dir="ltr"
                      className="inline-flex items-start gap-1 font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:underline [overflow-wrap:anywhere] break-all line-clamp-2">
                      <ExternalLink size={11} className="mt-0.5 shrink-0" /><span>{safeDecodeUrl(r.page)}</span>
                    </a>
                  </td>
                  <td className="py-2 px-3 text-end tabular-nums">{fmtInt(r.clicks)}</td>
                  <td className="py-2 px-3 text-end tabular-nums">{fmtInt(r.impressions)}</td>
                  <td className="py-2 px-3 text-end tabular-nums">{fmtCtr(r.ctr)}</td>
                  <td className="py-2 ps-3 text-end tabular-nums">{fmtPos(r.position)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {/* Pagination + page-size selector (L1) */}
      {total > 0 && !rowsError && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">{t.pageSizeLabel}</label>
            <select value={pageSize} onChange={(e) => { setPageSize(Number(e.target.value)); setPage(0) }}
              className="text-xs px-2 py-1 rounded-lg border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 focus:outline-none focus:ring-2 focus:ring-blue-500">
              {PAGE_SIZE_OPTIONS.map((n) => (<option key={n} value={n}>{n}</option>))}
            </select>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">{t.pageOf(page * pageSize + 1, Math.min((page + 1) * pageSize, total), total)}</span>
            <Button size="sm" variant="outline" disabled={page === 0 || loadingRows} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prevPage}</Button>
            <Button size="sm" variant="outline" disabled={(page + 1) * pageSize >= total || loadingRows} onClick={() => setPage((p) => p + 1)}>{t.nextPage}</Button>
          </div>
        </div>
      )}
    </div>
  )
}
