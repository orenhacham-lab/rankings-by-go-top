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
 *
 * Drawn like the settings screen's platform card (an icon tile, the name, one
 * line of what it is for, the one action beside it), with the design tokens;
 * what it does is unchanged.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { Search as SearchIcon } from 'lucide-react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import GscMetricsTable from '@/components/content/GscMetricsTable'
import { AUTO_SYNC_MIN_INTERVAL_DAYS } from '@/lib/gsc/auto-sync'
import { formatDateTime } from '@/lib/utils'

type ConnStatus = 'connected' | 'reauth_required' | 'revoked' | 'error'
interface SanitizedConnection { id: string; status: ConnStatus; grantedScope: string | null; lastErrorCode: string | null; updatedAt: string }
interface AssignedProperty { siteUrl: string; permissionLevel: string | null; selectedAt: string }
// The read-only metrics view (windows summary + table) lives in GscMetricsTable now.
// `windows` is still read here for Area A's last-sync / next-eligible derivation.
interface StatusResponse { ok: boolean; oauthConfigured: boolean; connection: SanitizedConnection | null; property: AssignedProperty | null; windows?: Record<string, { finishedAt: string | null } | null> }

interface PropertyView { siteUrl: string; permissionLevel: string; kind: 'domain' | 'url_prefix'; covers: boolean; assignable: boolean }

type Dict = ReturnType<typeof getDashboardDictionary>['projectDetail']['contentSection']['gsc']

export default function GscPanel({ projectId, connectOrigin = 'project' }: { projectId: string; connectOrigin?: 'hub' | 'project' }) {
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
  // Bumped after a sync / property change to force GscMetricsTable to re-fetch.
  const [dataRefresh, setDataRefresh] = useState(0)

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

  // Area A — the most recent successful sync across the stored windows, and the
  // earliest moment the weekly auto-sync would pick this project up again.
  // (Area L moved the metrics TABLE into GscMetricsTable; the panel still reads the
  //  per-window finishedAt timestamps from /api/gsc/status for this derivation.)
  const lastSyncedAt = useMemo(() => {
    const times = Object.values(status?.windows ?? {})
      .map((w) => (w?.finishedAt ? Date.parse(w.finishedAt) : NaN))
      .filter((n) => Number.isFinite(n)) as number[]
    return times.length ? new Date(Math.max(...times)).toISOString() : null
  }, [status])
  const nextEligibleSyncAt = useMemo(
    () => (lastSyncedAt ? new Date(Date.parse(lastSyncedAt) + AUTO_SYNC_MIN_INTERVAL_DAYS * 24 * 60 * 60 * 1000).toISOString() : null),
    [lastSyncedAt],
  )

  async function handleConnect() {
    setConnecting(true); setMessage(null)
    try {
      // K4 — `origin` tells the callback where to return: 'hub' → the Content Hub,
      // otherwise the project page. It's a fixed enum, never a URL (no open redirect).
      const res = await fetch('/api/gsc/connect', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId, origin: connectOrigin }) })
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
      if (data.ok) { setPickerOpen(false); await loadStatus(); setDataRefresh((k) => k + 1) }
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
      if (res.ok && data.ok) { await loadStatus(); setDataRefresh((k) => k + 1) }
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
        await loadStatus(); setDataRefresh((k) => k + 1)
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
      <div className="flex flex-wrap items-center justify-between gap-4" data-gsc-card={connected ? 'connected' : 'none'}>
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-xl bg-info-soft text-info">
            <SearchIcon size={18} />
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-section font-semibold text-ink">
              {t.title}
              {statusBadge()}
            </h3>
            <p className="mt-0.5 text-copy text-muted">{t.subtitle}</p>
          </div>
        </div>
        {!loading && status?.oauthConfigured !== false && !connected && (
          <Button size="sm" onClick={handleConnect} loading={connecting} disabled={connecting} className="shrink-0" data-gsc-connect>
            {connecting ? t.connecting : t.connect}
          </Button>
        )}
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-muted pt-4">
          <span className="inline-block w-4 h-4 border-2 border-action border-t-transparent rounded-full animate-spin" />
        </div>
      ) : status && !status.oauthConfigured ? (
        <div className="mt-4 rounded-lg border border-warn/25 bg-warn-soft px-3 py-2 text-sm text-warn">
          {t.notConfigured}
        </div>
      ) : !connected ? (
        <>
          <p className="mt-3 text-caption text-muted">{t.notConnected}</p>
          {message && (
            <div role="alert" className="mt-3 text-sm rounded-lg px-3 py-2 border bg-bad-soft border-bad/20 text-bad">{message.text}</div>
          )}
        </>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Connection row. The GLOBAL Google-authorization revoke is intentionally
              de-emphasized (a small text link, not a primary button) — the normal
              per-project disconnect lives on the property row below. */}
          <div className="rounded-lg border border-line p-3">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-sm text-body">{t.connectedAccount}</span>
              {connection?.status === 'reauth_required' && (
                <Button size="sm" className="ms-auto" onClick={handleConnect} loading={connecting} disabled={connecting}>{t.reconnect}</Button>
              )}
            </div>
            {connection?.status === 'reauth_required' && (
              <p className="mt-2 text-xs text-warn">{t.reauthHint}</p>
            )}
            <div className="mt-2">
              <button type="button" onClick={handleGlobalRevoke} disabled={revoking}
                className="text-xs text-bad/80 hover:underline disabled:opacity-50">
                {revoking ? t.revoking : t.globalRevoke}
              </button>
            </div>
          </div>

          {/* Property assignment / picker */}
          {pickerOpen ? (
            <div className="rounded-lg border border-line p-3">
              <div className="flex items-center justify-between mb-2">
                <h4 className="text-sm font-semibold text-ink">{t.selectPropertyTitle}</h4>
                <button type="button" onClick={() => setPickerOpen(false)} className="text-xs text-action hover:underline">✕</button>
              </div>
              {loadingProps ? (
                <div className="text-sm text-muted py-3">{t.loadingProperties}</div>
              ) : !properties || properties.length === 0 ? (
                <div className="text-sm text-muted py-3">{t.noProperties}</div>
              ) : (
                <ul className="space-y-2">
                  {properties.map((p) => {
                    const isUnverified = p.permissionLevel === 'siteUnverifiedUser'
                    return (
                      <li key={p.siteUrl} className="flex flex-wrap items-center gap-2 rounded border border-line p-2">
                        <span className="font-mono text-xs text-ink truncate max-w-full min-w-0" dir="ltr">{p.siteUrl}</span>
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
            <div className="rounded-lg border border-line p-3 text-center">
              <p className="text-sm text-body mb-2">{t.noPropertyAssigned}</p>
              <Button size="sm" onClick={openPicker}>{t.selectProperty}</Button>
            </div>
          ) : (
            <div className="rounded-lg border border-line p-3">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs text-muted">{t.assignedProperty}:</span>
                <span className="font-mono text-sm text-ink truncate max-w-full min-w-0" dir="ltr">{property.siteUrl}</span>
                <div className="flex flex-wrap items-center gap-2 ms-auto">
                  <Button size="sm" onClick={handleSync} loading={syncing} disabled={syncing || connection?.status === 'reauth_required'}>{syncing ? t.syncing : t.syncNow}</Button>
                  <Button size="sm" variant="outline" onClick={openPicker}>{t.changeProperty}</Button>
                  <Button size="sm" variant="outline" onClick={handleUnassign} loading={unassigning} disabled={unassigning} className="text-bad border-bad/30">
                    {unassigning ? t.unassigning : t.unassignProperty}
                  </Button>
                </div>
              </div>

              {/* Area A — last successful sync + the derived next AUTOMATIC eligibility.
                  The weekly auto-sync is a daily dispatcher, so the shown time is the
                  EARLIEST the project becomes eligible (a lower bound), never a promise
                  of an exact run time. The manual "Sync now" button stays available. */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted">
                <span>{t.lastSyncedAt}: {lastSyncedAt ? formatDateTime(lastSyncedAt) : t.neverSyncedShort}</span>
                {nextEligibleSyncAt && (
                  <span title={t.nextAutoSyncHint}>{t.nextAutoSyncFrom}: {formatDateTime(nextEligibleSyncAt)}</span>
                )}
              </div>
              {nextEligibleSyncAt && <p className="mt-1 text-[11px] text-muted">{t.nextAutoSyncHint}</p>}
            </div>
          )}

          {message && (
            <div className={`text-sm rounded-lg px-3 py-2 border ${message.ok ? 'bg-ok-soft border-ok/25 text-ok' : 'bg-bad-soft border-bad/20 text-bad'}`}>
              {message.text}
            </div>
          )}

          {/* Diagnostics — the read-only SC data view (shared GscMetricsTable). */}
          {property && !pickerOpen && (
            <GscMetricsTable projectId={projectId} refreshKey={dataRefresh} />
          )}
        </div>
      )}
    </Card>
  )
}
