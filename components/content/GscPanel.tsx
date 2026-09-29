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

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Search as SearchIcon, X } from 'lucide-react'
import Notice from '@/components/ui/Notice'
import { Skeleton } from '@/components/ui/Skeleton'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { useConfirm } from '@/components/ui/ConfirmDialog'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import GscMetricsTable from '@/components/content/GscMetricsTable'
import { useGscEnabled } from '@/components/gsc/GscFeature'
import { gscStatusUrl, peekGscResponse, readGscResponse, type GscResponse } from '@/components/gsc/gsc-data'
import ConnectionLoadFailed from '@/components/shared/ConnectionLoadFailed'
import { gscStatusView } from '@/lib/gsc/widget-state'
import { AUTO_SYNC_MIN_INTERVAL_DAYS } from '@/lib/gsc/auto-sync'
import { formatDateTime } from '@/lib/utils'

type ConnStatus = 'connected' | 'reauth_required' | 'revoked' | 'error'
interface SanitizedConnection { id: string; status: ConnStatus; grantedScope: string | null; lastErrorCode: string | null; updatedAt: string }
interface AssignedProperty { siteUrl: string; permissionLevel: string | null; selectedAt: string }
// The read-only metrics view (windows summary + table) lives in GscMetricsTable now.
// `windows` is still read here for Area A's last-sync / next-eligible derivation.
interface StatusResponse { ok: boolean; oauthConfigured: boolean; /** Server says the viewer is an administrator and may read why. */ opsDetail?: boolean; connection: SanitizedConnection | null; property: AssignedProperty | null; windows?: Record<string, { finishedAt: string | null } | null> }

interface PropertyView { siteUrl: string; permissionLevel: string; kind: 'domain' | 'url_prefix'; covers: boolean; assignable: boolean }

type Dict = ReturnType<typeof getDashboardDictionary>['projectDetail']['contentSection']['gsc']

/** The status route's answer, as the panel needs it: the body only when the route
 *  really answered; switched off and failed reads are their own states. */
type PanelRead = { kind: 'loading' } | { kind: 'disabled' } | { kind: 'error' } | { kind: 'ready'; status: StatusResponse }
function panelRead(response: GscResponse | undefined): PanelRead {
  if (!response) return { kind: 'loading' }
  const view = gscStatusView(response.status, response.body)
  if (view.state === 'disabled') return { kind: 'disabled' }
  if (view.state === 'error') return { kind: 'error' }
  return { kind: 'ready', status: response.body as StatusResponse }
}

export default function GscPanel({ projectId, connectOrigin = 'project' }: { projectId: string; connectOrigin?: 'hub' | 'project' }) {
  const { language } = useDashboardLanguage()
  const t: Dict = useMemo(() => getDashboardDictionary(language).projectDetail.contentSection.gsc, [language])
  // In-app questions (never window.confirm): both disconnects are destructive, so danger.
  const { confirm, dialog: confirmDialog } = useConfirm()

  // What the status route answered, decided once (lib/gsc/widget-state): the panel
  // draws "not connected" only from an answer that says so. Read through the same
  // shared request as every Search Console widget, so when the screen already asked,
  // the first render has the answer.
  const gscEnabled = useGscEnabled()
  const statusUrl = gscStatusUrl(projectId)
  const [initial] = useState(() => panelRead(peekGscResponse(statusUrl)))
  const [loading, setLoading] = useState(initial.kind === 'loading')
  const [status, setStatus] = useState<StatusResponse | null>(initial.kind === 'ready' ? initial.status : null)
  // 'disabled': Search Console switched off on the server (nothing to offer);
  // 'error': the status could not be read (never drawn as "not connected").
  const [unavailable, setUnavailable] = useState<'disabled' | 'error' | null>(
    initial.kind === 'disabled' || initial.kind === 'error' ? initial.kind : null,
  )
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

  const loadStatus = useCallback(async (fresh = true) => {
    // Search Console is off on this server: the route answers 404, so do not ask.
    if (gscEnabled === false) { setStatus(null); setUnavailable('disabled'); setLoading(false); return }
    const read = panelRead(await readGscResponse(statusUrl, fresh))
    if (read.kind === 'ready') { setStatus(read.status); setUnavailable(null) }
    else if (read.kind === 'disabled') { setStatus(null); setUnavailable('disabled') }
    // A re-read that failed keeps what is on screen; a first one says it failed.
    else setUnavailable((was) => (statusRef.current ? was : 'error'))
    setLoading(false)
  }, [statusUrl, gscEnabled])
  const statusRef = useRef(status)
  statusRef.current = status

  useEffect(() => { if (initial.kind === 'loading' || gscEnabled === false) void loadStatus(false) }, [loadStatus, initial.kind, gscEnabled])

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
    if (!(await confirm({ title: t.unassignConfirmTitle, body: t.unassignConfirmBody, confirmLabel: t.revoke, tone: 'danger' }))) return
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
    if (!(await confirm({ title: t.confirmRevokeTitle, body: t.confirmRevokeBody, confirmLabel: t.confirmRevokeAction, tone: 'danger' }))) return
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

  // Switched off on the server: like every Search Console widget, nothing at all.
  if (unavailable === 'disabled' || gscEnabled === false) return null

  return (
    <Card className="p-5 sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-4" data-gsc-card={loading ? 'loading' : unavailable ? 'error' : connected ? 'connected' : 'none'}>
        <div className="flex min-w-0 items-center gap-3">
          <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-inset bg-action-soft text-action">
            <SearchIcon className="size-5" />
          </span>
          <div className="min-w-0">
            <h3 className="flex flex-wrap items-center gap-2 text-section font-semibold text-ink">
              {t.title}
              {statusBadge()}
            </h3>
            <p className="mt-0.5 text-copy text-muted">{t.subtitle}</p>
          </div>
        </div>
        {!loading && !unavailable && status?.oauthConfigured !== false && !connected && (
          <Button size="sm" onClick={handleConnect} loading={connecting} disabled={connecting} className="shrink-0" data-gsc-connect>
            {connecting ? t.connecting : t.connect}
          </Button>
        )}
      </div>

      {loading ? (
        <div aria-busy="true" data-connection-loading="gsc"><Skeleton className="mt-4 h-12 w-full rounded-inset" /></div>
      ) : unavailable === 'error' ? (
        <ConnectionLoadFailed className="mt-4" onRetry={() => { setLoading(true); void loadStatus() }} />
      ) : status && !status.oauthConfigured ? (
        // A merchant reads that it is unavailable, with nothing to press; only an administrator
        // (the server's opsDetail) also reads the configuration reason.
        <Notice tone="info" className="mt-4">
          <span data-gsc-unavailable={status.opsDetail ? 'admin' : 'merchant'}>{t.unavailable}</span>
          {status.opsDetail && <span className="mt-1 block text-caption text-body">{t.notConfigured}</span>}
        </Notice>
      ) : !connected ? (
        <>
          <p className="mt-3 text-caption text-muted">{t.notConnected}</p>
          {message && (
            <Notice tone="bad" className="mt-3">{message.text}</Notice>
          )}
        </>
      ) : (
        <div className="mt-4 space-y-4">
          {/* Connection row. The GLOBAL Google-authorization revoke is intentionally
              de-emphasized (a small text link, not a primary button) — the normal
              per-project disconnect lives on the property row below. */}
          <div className="rounded-inset border border-line bg-sunk/60 p-4">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-copy text-body">{t.connectedAccount}</span>
              {connection?.status === 'reauth_required' && (
                <Button size="sm" className="ms-auto" onClick={handleConnect} loading={connecting} disabled={connecting}>{t.reconnect}</Button>
              )}
            </div>
            {connection?.status === 'reauth_required' && (
              <Notice tone="warn" className="mt-2">{t.reauthHint}</Notice>
            )}
            <div className="mt-2">
              <button type="button" onClick={handleGlobalRevoke} disabled={revoking}
                className="text-caption font-medium text-bad hover:underline disabled:opacity-50">
                {revoking ? t.revoking : t.globalRevoke}
              </button>
            </div>
          </div>

          {/* Property assignment / picker */}
          {pickerOpen ? (
            <div className="rounded-inset border border-line p-4">
              <div className="mb-3 flex items-center justify-between">
                <h4 className="text-copy font-semibold text-ink">{t.selectPropertyTitle}</h4>
                <button type="button" onClick={() => setPickerOpen(false)} aria-label={getDashboardDictionary(language).common.close} className="grid size-8 place-items-center rounded-control text-muted transition-colors duration-150 hover:bg-sunk hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"><X className="size-4" aria-hidden="true" /></button>
              </div>
              {loadingProps ? (
                <div className="py-3 text-copy text-muted">{t.loadingProperties}</div>
              ) : !properties || properties.length === 0 ? (
                <div className="py-3 text-copy text-muted">{t.noProperties}</div>
              ) : (
                <ul className="space-y-2">
                  {properties.map((p) => {
                    const isUnverified = p.permissionLevel === 'siteUnverifiedUser'
                    return (
                      <li key={p.siteUrl} className="flex flex-wrap items-center gap-2 rounded-control border border-line px-3 py-2">
                        <span className="min-w-0 max-w-64 truncate text-copy text-ink" dir="ltr" title={p.siteUrl}>{p.siteUrl}</span>
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
                          <Button size="sm" variant="secondary" disabled={isUnverified || !p.covers || assigning === p.siteUrl} loading={assigning === p.siteUrl} onClick={() => handleAssign(p)}>
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
            <div className="rounded-inset border border-line p-4 text-center">
              <p className="mb-3 text-copy text-body">{t.noPropertyAssigned}</p>
              <Button size="sm" onClick={openPicker}>{t.selectProperty}</Button>
            </div>
          ) : (
            <div className="rounded-inset border border-line bg-sunk/60 p-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-caption text-muted">{t.assignedProperty}:</span>
                <span className="min-w-0 max-w-full truncate text-copy font-medium text-ink" dir="ltr" title={property.siteUrl}>{property.siteUrl}</span>
                <div className="ms-auto flex flex-wrap items-center gap-2">
                  <Button size="sm" onClick={handleSync} loading={syncing} disabled={syncing || connection?.status === 'reauth_required'}>{syncing ? t.syncing : t.syncNow}</Button>
                  <Button size="sm" variant="ghost" onClick={openPicker}>{t.changeProperty}</Button>
                  <Button size="sm" variant="ghost" onClick={handleUnassign} loading={unassigning} disabled={unassigning} className="text-bad hover:bg-bad-soft hover:text-bad">
                    {unassigning ? t.unassigning : t.unassignProperty}
                  </Button>
                </div>
              </div>

              {/* Area A — last successful sync + the derived next AUTOMATIC eligibility.
                  The weekly auto-sync is a daily dispatcher, so the shown time is the
                  EARLIEST the project becomes eligible (a lower bound), never a promise
                  of an exact run time. The manual "Sync now" button stays available. */}
              <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-caption text-muted">
                <span>{t.lastSyncedAt}: {lastSyncedAt ? formatDateTime(lastSyncedAt) : t.neverSyncedShort}</span>
                {nextEligibleSyncAt && (
                  <span title={t.nextAutoSyncHint}>{t.nextAutoSyncFrom}: {formatDateTime(nextEligibleSyncAt)}</span>
                )}
              </div>
              {nextEligibleSyncAt && <p className="mt-1 text-caption text-muted">{t.nextAutoSyncHint}</p>}
            </div>
          )}

          {message && (
            <Notice tone={message.ok ? 'ok' : 'bad'}>
              {message.text}
            </Notice>
          )}

          {/* Diagnostics — the read-only SC data view (shared GscMetricsTable). */}
          {property && !pickerOpen && (
            <GscMetricsTable projectId={projectId} refreshKey={dataRefresh} />
          )}
        </div>
      )}
      {confirmDialog}
    </Card>
  )
}
