'use client'

/**
 * Stage E1 — Google Search Console diagnostics panel (read-only).
 *
 * Observability ONLY: connect a Google account, assign one Search Console property,
 * run a MANUAL sync, and view 28-day / 90-day snapshots + simple diagnostics. This
 * panel never produces a recommendation, score, brief, or opportunity — it is fully
 * disconnected from the recommendation engine.
 *
 * Secrets never reach this component: the server returns only sanitized connection
 * metadata (status/scope) and precomputed metrics — never a token.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search as SearchIcon, AlertTriangle, ExternalLink } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type WindowDays = 28 | 90
const WINDOWS: WindowDays[] = [28, 90]

type ConnStatus = 'connected' | 'reauth_required' | 'revoked' | 'error'
interface SanitizedConnection { id: string; status: ConnStatus; grantedScope: string | null; lastErrorCode: string | null; updatedAt: string }
interface AssignedProperty { siteUrl: string; permissionLevel: string | null; selectedAt: string }
interface SummaryCard { runId: string; windowDays: number; startDate: string | null; endDate: string | null; latestAvailableDate: string | null; rowsFetched: number; truncated: boolean; finishedAt: string | null; summaryResyncRequired?: boolean; clicks: number | null; impressions: number | null; ctr: number | null; avgPosition: number | null }
interface StatusResponse { ok: boolean; oauthConfigured: boolean; connection: SanitizedConnection | null; property: AssignedProperty | null; windows: Record<string, SummaryCard | null> }

interface PropertyView { siteUrl: string; permissionLevel: string; kind: 'domain' | 'url_prefix'; covers: boolean; assignable: boolean }
interface MetricRow { query: string; page: string; clicks: number; impressions: number; ctr: number; position: number }
interface MultiPageRow { query: string; distinctPageCount: number; totalClicks: number; totalImpressions: number; pages: string[] }

type Dict = ReturnType<typeof getDashboardDictionary>['projectDetail']['contentSection']['gsc']

const PAGE_SIZE = 25

function fmtInt(n: number): string { return Math.round(n).toLocaleString() }
function fmtCtr(n: number): string { return `${(n * 100).toFixed(2)}%` }
function fmtPos(n: number): string { return n.toFixed(1) }
/** Decode a URL for display only (raw URL stays the href). Fails safe to the original. */
function safeDecodeUrl(u: string): string { try { return decodeURI(u) } catch { return u } }

export default function GscPanel({ projectId }: { projectId: string }) {
  const { language } = useDashboardLanguage()
  const t: Dict = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.gsc, [language])

  const [loading, setLoading] = useState(true)
  const [status, setStatus] = useState<StatusResponse | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  const [connecting, setConnecting] = useState(false)
  const [syncing, setSyncing] = useState(false)
  const [unassigning, setUnassigning] = useState(false)
  const [revoking, setRevoking] = useState(false)

  const [pickerOpen, setPickerOpen] = useState(false)
  const [properties, setProperties] = useState<PropertyView[] | null>(null)
  const [loadingProps, setLoadingProps] = useState(false)
  const [assigning, setAssigning] = useState<string | null>(null)

  const [activeWindow, setActiveWindow] = useState<WindowDays>(28)
  const [activeTab, setActiveTab] = useState<'queries' | 'opportunities' | 'multipage'>('queries')
  const [rows, setRows] = useState<(MetricRow | MultiPageRow)[]>([])
  const [total, setTotal] = useState(0)
  const [page, setPage] = useState(0)
  const [loadingRows, setLoadingRows] = useState(false)

  const errText = useCallback((code: string | null | undefined): string => {
    if (!code) return t.genericError
    return (t.errors as Record<string, string>)[code] ?? t.genericError
  }, [t])

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch(`/api/gsc/status?projectId=${projectId}`)
      if (res.status === 404) { setStatus(null); return }
      const data = (await res.json()) as StatusResponse
      setStatus(data)
    } catch { /* leave prior state */ } finally { setLoading(false) }
  }, [projectId])

  useEffect(() => { loadStatus() }, [loadStatus])

  // Surface the OAuth callback result (?gsc / ?gsc_error), then strip the params so a
  // refresh doesn't re-show the banner.
  useEffect(() => {
    const sp = new URLSearchParams(window.location.search)
    const ok = sp.get('gsc')
    const err = sp.get('gsc_error')
    if (ok === 'connected') setMessage({ text: t.statusConnected, ok: true })
    else if (err) setMessage({ text: errText(err), ok: false })
    if (ok || err) {
      sp.delete('gsc'); sp.delete('gsc_error')
      const qs = sp.toString()
      window.history.replaceState({}, '', window.location.pathname + (qs ? `?${qs}` : '') + window.location.hash)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connection = status?.connection ?? null
  const property = status?.property ?? null
  const connected = !!connection && connection.status !== 'revoked'

  const loadRows = useCallback(async () => {
    if (!property) return
    setLoadingRows(true)
    try {
      const res = await fetch(`/api/gsc/metrics?projectId=${projectId}&window=${activeWindow}&view=${activeTab}&page=${page}&pageSize=${PAGE_SIZE}`)
      const data = await res.json()
      if (data.ok) { setRows(data.rows ?? []); setTotal(data.total ?? 0) }
      else { setRows([]); setTotal(0) }
    } catch { setRows([]); setTotal(0) } finally { setLoadingRows(false) }
  }, [projectId, property, activeWindow, activeTab, page])

  useEffect(() => { setPage(0) }, [activeWindow, activeTab])
  useEffect(() => { if (property) loadRows() }, [loadRows, property])

  async function handleConnect() {
    setConnecting(true); setMessage(null)
    try {
      const res = await fetch('/api/gsc/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const data = await res.json()
      if (res.ok && data.authUrl) { window.location.href = data.authUrl; return }
      setMessage({ text: errText(data.error), ok: false })
    } catch { setMessage({ text: t.genericError, ok: false }) } finally { setConnecting(false) }
  }

  async function openPicker() {
    setPickerOpen(true); setLoadingProps(true); setProperties(null); setMessage(null)
    try {
      const res = await fetch(`/api/gsc/properties?projectId=${projectId}`)
      const data = await res.json()
      if (data.ok) setProperties(data.properties ?? [])
      else setMessage({ text: errText(data.error), ok: false })
    } catch { setMessage({ text: t.genericError, ok: false }) } finally { setLoadingProps(false) }
  }

  async function handleAssign(view: PropertyView) {
    // Non-covering or unverified properties are never assignable (button is disabled);
    // guard here too so a stale render can't POST one. No mismatch override exists.
    if (!view.covers || view.permissionLevel === 'siteUnverifiedUser') return
    setAssigning(view.siteUrl); setMessage(null)
    try {
      const res = await fetch('/api/gsc/property', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, siteUrl: view.siteUrl }) })
      const data = await res.json()
      if (data.ok) { setPickerOpen(false); await loadStatus() }
      else setMessage({ text: errText(data.error), ok: false })
    } catch { setMessage({ text: t.genericError, ok: false }) } finally { setAssigning(null) }
  }

  // Normal project-level disconnect: removes ONLY this project's property assignment.
  // Historical metrics and the shared Google connection are preserved.
  async function handleUnassign() {
    if (!window.confirm(t.unassignConfirm)) return
    setUnassigning(true); setMessage(null)
    try {
      const res = await fetch(`/api/gsc/property?projectId=${projectId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) await loadStatus()
      else setMessage({ text: errText(data.error), ok: false })
    } catch { setMessage({ text: t.genericError, ok: false }) } finally { setUnassigning(false) }
  }

  async function handleSync() {
    setSyncing(true); setMessage(null)
    try {
      const res = await fetch('/api/gsc/sync', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }) })
      const data = await res.json()
      if (res.ok && data.ok) {
        const anyFailed = Array.isArray(data.windows) && data.windows.some((w: { status: string }) => w.status === 'failed')
        setMessage({ text: anyFailed ? t.syncPartial : t.syncOk, ok: !anyFailed })
        await loadStatus(); await loadRows()
      } else {
        setMessage({ text: errText(data.error) || t.syncFail, ok: false })
      }
    } catch { setMessage({ text: t.syncFail, ok: false }) } finally { setSyncing(false) }
  }

  // GLOBAL, destructive: revokes the user's Google authorization for the WHOLE account.
  // Fails closed (409 connection_in_use) while any project still uses the connection.
  async function handleGlobalRevoke() {
    if (!window.confirm(t.confirmRevoke)) return
    setRevoking(true); setMessage(null)
    try {
      const res = await fetch(`/api/gsc/connection?projectId=${projectId}`, { method: 'DELETE' })
      const data = await res.json().catch(() => ({}))
      if (res.ok && data.ok) { setPickerOpen(false); await loadStatus() }
      else if (res.status === 409 && data.error === 'connection_in_use') setMessage({ text: t.connectionInUse(data.dependentProjectCount ?? 0), ok: false })
      else setMessage({ text: errText(data.error), ok: false })
    } catch { setMessage({ text: t.genericError, ok: false }) } finally { setRevoking(false) }
  }

  const statusBadge = () => {
    if (!connection) return null
    if (connection.status === 'connected') return <Badge variant="success">{t.statusConnected}</Badge>
    if (connection.status === 'reauth_required') return <Badge variant="warning">{t.statusReauthRequired}</Badge>
    if (connection.status === 'revoked') return <Badge variant="neutral">{t.statusRevoked}</Badge>
    return <Badge variant="danger">{t.statusError}</Badge>
  }

  return (
    <Card className="hover:translate-y-0">
      <div className="flex items-center justify-between gap-3 mb-1">
        <div className="flex items-center gap-2">
          <SearchIcon size={18} className="text-indigo-600 dark:text-indigo-400" />
          <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        </div>
        {statusBadge()}
      </div>
      <p className="text-sm text-slate-500 dark:text-slate-400 mb-4">{t.subtitle}</p>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
          <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : status && !status.oauthConfigured ? (
        <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-2 text-sm text-amber-800 dark:text-amber-300">
          {t.notConfigured}
        </div>
      ) : !connected ? (
        <div className="text-center py-6">
          <p className="text-sm text-slate-600 dark:text-slate-300 mb-3">{t.notConnected}</p>
          <Button size="sm" onClick={handleConnect} loading={connecting} disabled={connecting}>{connecting ? t.connecting : t.connect}</Button>
        </div>
      ) : (
        <div className="space-y-4">
          {/* Connection row. The GLOBAL Google-authorization revoke is intentionally
              de-emphasized (a small text link, not a primary button) — the normal
              per-project disconnect lives on the property row below. */}
          <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-slate-700 dark:text-slate-200">{t.connectedAccount}</span>
              {connection?.status === 'reauth_required' && (
                <Button size="sm" className="ms-auto" onClick={handleConnect} loading={connecting} disabled={connecting}>{t.reconnect}</Button>
              )}
            </div>
            {connection?.status === 'reauth_required' && (
              <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.reauthHint}</p>
            )}
            <div className="mt-2">
              <button type="button" onClick={handleGlobalRevoke} disabled={revoking}
                className="text-xs text-red-600/80 dark:text-red-400/80 hover:underline disabled:opacity-50">
                {revoking ? t.revoking : t.globalRevoke}
              </button>
            </div>
          </div>

          {/* Property assignment / picker */}
          {pickerOpen ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.selectPropertyTitle}</h4>
                <button type="button" onClick={() => setPickerOpen(false)} className="text-xs text-indigo-600 dark:text-indigo-400 hover:underline">✕</button>
              </div>
              {loadingProps ? (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-3">{t.loadingProperties}</div>
              ) : !properties || properties.length === 0 ? (
                <div className="text-sm text-slate-500 dark:text-slate-400 py-3">{t.noProperties}</div>
              ) : (
                <ul className="space-y-2">
                  {properties.map((p) => {
                    const isUnverified = p.permissionLevel === 'siteUnverifiedUser'
                    return (
                      <li key={p.siteUrl} className="flex flex-wrap items-center gap-2 rounded border border-slate-200 dark:border-slate-700 p-2">
                        <span className="font-mono text-xs text-slate-800 dark:text-slate-100 truncate max-w-full min-w-0" dir="ltr">{p.siteUrl}</span>
                        <Badge variant="neutral">{p.kind === 'domain' ? t.propertyKindDomain : t.propertyKindUrlPrefix}</Badge>
                        {isUnverified ? (
                          <Badge variant="danger">{t.unverified}</Badge>
                        ) : p.covers ? (
                          <Badge variant="success">{t.covers}</Badge>
                        ) : (
                          <Badge variant="warning">{t.notCovers}</Badge>
                        )}
                        <div className="ms-auto">
                          {/* Non-covering or unverified → visible for diagnostics but NOT assignable. */}
                          <Button size="sm" variant="outline" disabled={isUnverified || !p.covers || assigning === p.siteUrl} loading={assigning === p.siteUrl} onClick={() => handleAssign(p)}>
                            {assigning === p.siteUrl ? t.assigning : t.assign}
                          </Button>
                        </div>
                      </li>
                    )
                  })}
                </ul>
              )}
            </div>
          ) : !property ? (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3 text-center">
              <p className="text-sm text-slate-600 dark:text-slate-300 mb-2">{t.noPropertyAssigned}</p>
              <Button size="sm" onClick={openPicker}>{t.selectProperty}</Button>
            </div>
          ) : (
            <div className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-slate-500 dark:text-slate-400">{t.assignedProperty}:</span>
                <span className="font-mono text-sm text-slate-800 dark:text-slate-100 truncate max-w-full min-w-0" dir="ltr">{property.siteUrl}</span>
                <div className="flex flex-wrap items-center gap-2 ms-auto">
                  <Button size="sm" onClick={handleSync} loading={syncing} disabled={syncing || connection?.status === 'reauth_required'}>{syncing ? t.syncing : t.syncNow}</Button>
                  <Button size="sm" variant="outline" onClick={openPicker}>{t.changeProperty}</Button>
                  <Button size="sm" variant="outline" onClick={handleUnassign} loading={unassigning} disabled={unassigning} className="text-red-600 dark:text-red-400 border-red-200 dark:border-red-800">
                    {unassigning ? t.unassigning : t.unassignProperty}
                  </Button>
                </div>
              </div>
            </div>
          )}

          {message && (
            <div className={`text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800 text-green-700 dark:text-green-300' : 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800 text-red-700 dark:text-red-300'}`}>
              {message.text}
            </div>
          )}

          {/* Diagnostics — only when a property is assigned */}
          {property && !pickerOpen && (
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

              {(() => {
                const card = status?.windows?.[String(activeWindow)] ?? null
                if (!card) return <div className="text-sm text-slate-500 dark:text-slate-400 py-2">{t.neverSynced}</div>
                // A run created before the property-summary migration has no authoritative totals.
                if (card.summaryResyncRequired) {
                  return (
                    <div className="rounded-lg border border-amber-200 dark:border-amber-800 bg-amber-50 dark:bg-amber-900/20 px-3 py-3 text-sm text-amber-800 dark:text-amber-300 flex flex-wrap items-center gap-2">
                      <AlertTriangle size={14} /><span>{t.summaryResyncRequired}</span>
                      <Button size="sm" className="ms-auto" onClick={handleSync} loading={syncing} disabled={syncing || connection?.status === 'reauth_required'}>{syncing ? t.syncing : t.syncNow}</Button>
                    </div>
                  )
                }
                const empty = card.rowsFetched === 0
                return (
                  <>
                    {/* Authoritative property-level summary (separate byProperty request). */}
                    <div className="text-xs font-medium text-slate-500 dark:text-slate-400">{t.propertySummaryLabel}</div>
                    <div className="grid grid-cols-2 lg:grid-cols-4 gap-2">
                      {[
                        { label: t.cardClicks, value: fmtInt(card.clicks ?? 0) },
                        { label: t.cardImpressions, value: fmtInt(card.impressions ?? 0) },
                        { label: t.cardCtr, value: fmtCtr(card.ctr ?? 0) },
                        { label: t.cardAvgPosition, value: card.avgPosition != null ? fmtPos(card.avgPosition) : '—' },
                      ].map((c) => (
                        <div key={c.label} className="rounded-lg border border-slate-200 dark:border-slate-700 p-3">
                          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{c.label}</div>
                          <div className="text-xl font-bold text-slate-800 dark:text-slate-100">{c.value}</div>
                        </div>
                      ))}
                    </div>
                    <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
                      {card.startDate && card.endDate && <span>{t.dateRange}: <span dir="ltr">{card.startDate} → {card.endDate}</span></span>}
                      {card.latestAvailableDate && <span>{t.latestAvailableDate}: <span dir="ltr">{card.latestAvailableDate}</span></span>}
                      <span>{t.rowsFetched}: {fmtInt(card.rowsFetched)}</span>
                      {card.truncated && <span className="text-amber-600 dark:text-amber-400 inline-flex items-center gap-1"><AlertTriangle size={12} />{t.truncatedNote}</span>}
                    </div>
                    {/* Detail vs summary provenance note. */}
                    <p className="text-[11px] text-slate-400 dark:text-slate-500">{t.detailVsSummaryNote}</p>
                    {empty && <div className="text-sm text-slate-500 dark:text-slate-400">{t.emptySnapshot}</div>}
                  </>
                )
              })()}

              {/* Tabs */}
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
                  <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400 py-4">
                    <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
                  </div>
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
                            {/* Raw URL is the href; decoded for readable display; wraps up to two
                                lines; full decoded URL in the title; opens externally. */}
                            <a href={r.page} target="_blank" rel="noopener noreferrer" title={safeDecodeUrl(r.page)} dir="ltr"
                              className="inline-flex items-start gap-1 font-mono text-xs text-indigo-600 dark:text-indigo-400 hover:underline [overflow-wrap:anywhere] break-all line-clamp-2">
                              <ExternalLink size={11} className="mt-0.5 shrink-0" />
                              <span>{safeDecodeUrl(r.page)}</span>
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

              {/* Pagination */}
              {total > PAGE_SIZE && (
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs text-slate-500 dark:text-slate-400">{t.pageOf(page * PAGE_SIZE + 1, Math.min((page + 1) * PAGE_SIZE, total), total)}</span>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" disabled={page === 0 || loadingRows} onClick={() => setPage((p) => Math.max(0, p - 1))}>{t.prevPage}</Button>
                    <Button size="sm" variant="outline" disabled={(page + 1) * PAGE_SIZE >= total || loadingRows} onClick={() => setPage((p) => p + 1)}>{t.nextPage}</Button>
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Card>
  )
}
