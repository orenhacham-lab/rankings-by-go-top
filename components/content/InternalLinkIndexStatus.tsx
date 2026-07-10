'use client'

/**
 * InternalLinkIndexStatus — project-level "Internal-link index" status card
 * (Phase 2E.1). READ-ONLY status + a MANUAL refresh button.
 *
 * - Gated behind NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING.
 * - On mount it performs a single read-only status fetch (GET …/index/status).
 *   It NEVER auto-refreshes the WordPress scan on load.
 * - Refresh runs ONLY when the user clicks the button (POST …/index/refresh,
 *   force:true), then re-reads status; if a scan is in progress it polls status
 *   until completed/partial/failed. No topic/plan/apply UI here.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { formatDateTime } from '@/lib/utils'

const FLAG_ON = process.env.NEXT_PUBLIC_ENABLE_INTERNAL_LINK_PLANNING === 'true'
const TERMINAL = new Set(['completed', 'partial', 'failed'])

interface IndexStatus {
  exists: boolean
  scanStatus?: 'running' | 'completed' | 'partial' | 'failed'
  scannerVersion?: string | null
  currentScannerVersion?: string | null
  stale?: boolean
  versionStale?: boolean
  ttlDays?: number
  scanStartedAt?: string | null
  scanCompletedAt?: string | null
  scanDurationMs?: number | null
  expiresAt?: string | null
  errorMessage?: string | null
  siteUrl?: string | null
  truncated?: boolean | null
  // Phase 3I.1 — why products are (or are not) in the index.
  storeEntityDiscovery?: {
    source: 'store_api' | 'store_api_legacy' | 'rest_product' | 'none'
    lastHttpStatus: number | null
    productsFound: number
    categoriesFound: number
    productTargetsAdded: number
    categoryTargetsAdded: number
  } | null
  // Phase 3I.2 — skip breakdown + type mix (site-type-aware diagnostics).
  contentSkipBreakdown?: { timeBudget: number; fetchFailed: number; rateLimited: number; tooLarge: number; abortedAfterFailures: number } | null
  targetsByType?: Record<string, number> | null
  counts?: {
    targetsStored?: number | null
    uniqueTargets?: number | null
    targetsEligible?: number | null
    targetsWithUsableAnchors?: number | null
    contentItemsSkipped?: number | null
  }
}

export default function InternalLinkIndexStatus({ projectId, language }: { projectId: string; language: 'he' | 'en' }) {
  const t = useMemo(() => getDashboardDictionary(language).contentHub.internalLinkIndex, [language])
  const [status, setStatus] = useState<IndexStatus | null>(null)
  const [loading, setLoading] = useState(true)
  const [refreshing, setRefreshing] = useState(false)
  const pollRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const mountedRef = useRef(true)

  const fetchStatus = useCallback(async (): Promise<IndexStatus | null> => {
    try {
      const res = await fetch(`/api/content/automation/internal-links/index/status?projectId=${encodeURIComponent(projectId)}`)
      if (!res.ok) return null
      const data = (await res.json()) as IndexStatus
      if (mountedRef.current) setStatus(data)
      return data
    } catch {
      return null
    }
  }, [projectId])

  // Poll status until a terminal state (used after a user-initiated refresh AND
  // when a background auto-scan is detected). Read-only GETs; never writes.
  const startPolling = useCallback((attempt = 0) => {
    if (!mountedRef.current || attempt > 60) { setRefreshing(false); return }
    pollRef.current = setTimeout(async () => {
      const s = await fetchStatus()
      if (!mountedRef.current) return
      if (s && s.scanStatus && TERMINAL.has(s.scanStatus)) { setRefreshing(false); return }
      startPolling(attempt + 1)
    }, 5000)
  }, [fetchStatus])

  // Phase 3H.2 — BOUNDED watch for the background auto-scan (triggered by a
  // WordPress connection save): a not-yet-scanned project is re-checked every
  // 10s for ~3 minutes so the card flips to running/completed WITHOUT a page
  // refresh. Read-only; stops as soon as a terminal state exists.
  const startWatch = useCallback((attempt = 0) => {
    if (!mountedRef.current || attempt > 18) return
    pollRef.current = setTimeout(async () => {
      const s = await fetchStatus()
      if (!mountedRef.current) return
      if (s?.scanStatus === 'running') { startPolling(); return }
      if (s?.exists && s.scanStatus && TERMINAL.has(s.scanStatus)) return
      startWatch(attempt + 1)
    }, 10000)
  }, [fetchStatus, startPolling])

  // Read-only status fetch on mount / project change. NEVER triggers a scan —
  // but it FOLLOWS one that is already running (or about to start) in the
  // background, so the status updates live.
  useEffect(() => {
    mountedRef.current = true
    setLoading(true)
    fetchStatus().then((s) => {
      if (!mountedRef.current) return
      if (s?.scanStatus === 'running') startPolling()
      else if (!s?.exists) startWatch()
    }).finally(() => { if (mountedRef.current) setLoading(false) })
    return () => {
      mountedRef.current = false
      if (pollRef.current) clearTimeout(pollRef.current)
    }
  }, [fetchStatus, startPolling, startWatch])

  // Manual refresh — the ONLY write, and only on explicit click.
  const onRefresh = useCallback(async () => {
    if (refreshing) return
    setRefreshing(true)
    try {
      // Synchronous scan; resolves when done (or 202 if another run is in flight).
      await fetch('/api/content/automation/internal-links/index/refresh', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, force: true }),
      }).catch(() => {})
    } finally {
      const s = await fetchStatus()
      if (s && s.scanStatus === 'running') startPolling()
      else if (mountedRef.current) setRefreshing(false)
    }
  }, [projectId, refreshing, fetchStatus, startPolling])

  if (!FLAG_ON) return null

  const scanStatus = refreshing ? 'running' : status?.scanStatus
  const exists = !!status?.exists && !refreshing
  const tone: 'neutral' | 'info' | 'warning' | 'success' | 'danger' =
    scanStatus === 'completed' ? 'success'
      : scanStatus === 'partial' ? 'warning'
        : scanStatus === 'running' ? 'info'
          : scanStatus === 'failed' ? 'danger'
            : 'neutral'
  const headline = !exists && !refreshing ? t.notScanned
    : scanStatus === 'running' ? t.statusRunning
      : scanStatus === 'partial' ? t.statusPartial
        : scanStatus === 'failed' ? t.statusFailed
          : t.statusReady
  const c = status?.counts ?? {}

  return (
    <Card className="hover:translate-y-0 mb-4 p-4">
      {/* Header — title + status badge + manual refresh grouped together */}
      <div className="flex flex-wrap items-center gap-2">
        <h3 className="text-sm font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        <Badge variant={tone}>{headline}</Badge>
        <Button size="sm" variant="outline" onClick={onRefresh} loading={refreshing} disabled={refreshing}>
          {refreshing ? t.refreshing : t.refresh}
        </Button>
      </div>

      {loading ? (
        <div className="pt-2">
          <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
        </div>
      ) : (
        <>
          {/* Warnings (compact, single line) */}
          {!refreshing && exists && (status?.stale || status?.versionStale) && (
            <div className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">
              {status?.stale ? t.stale : ''}{status?.stale && status?.versionStale ? ' · ' : ''}{status?.versionStale ? t.versionStale : ''}
            </div>
          )}
          {!refreshing && exists && scanStatus === 'failed' && status?.errorMessage && (
            <div className="mt-1 text-[11px] text-red-600 dark:text-red-400">{t.errorPrefix}: {status.errorMessage}</div>
          )}

          {/* Counts + scan meta — one compact wrapping line (no big empty gaps) */}
          {exists ? (
            <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-slate-500 dark:text-slate-400">
              <span><b className="text-slate-700 dark:text-slate-200">{c.uniqueTargets ?? c.targetsStored ?? 0}</b> {t.cUnique}</span>
              <span><b className="text-slate-700 dark:text-slate-200">{c.targetsEligible ?? 0}</b> {t.cEligible}</span>
              <span><b className="text-slate-700 dark:text-slate-200">{c.targetsWithUsableAnchors ?? 0}</b> {t.cAnchors}</span>
              {(c.contentItemsSkipped ?? 0) > 0 && <span><b className="text-slate-700 dark:text-slate-200">{c.contentItemsSkipped}</b> {t.cSkipped}</span>}
              {/* Phase 3I.1/3I.2 — store entity discovery outcome. The negative
                  (amber) variant is shown ONLY when the index actually contains
                  ecommerce targets — on a service/content site, missing product
                  discovery is irrelevant and must not read as the blocker. */}
              {status?.storeEntityDiscovery && (() => {
                const d = status.storeEntityDiscovery!
                const ecomTargets = (status.targetsByType?.product ?? 0) + (status.targetsByType?.category ?? 0)
                if (d.source !== 'none') {
                  return <span><b className="text-slate-700 dark:text-slate-200">{d.productsFound}</b> {t.cStoreProducts} · <b className="text-slate-700 dark:text-slate-200">{d.categoriesFound}</b> {t.cStoreCategories}</span>
                }
                if (ecomTargets > 0) {
                  return <span className="text-amber-700 dark:text-amber-400">{t.storeDiscoveryNone}{d.lastHttpStatus ? ` (HTTP ${d.lastHttpStatus})` : ''}</span>
                }
                return null // service/content site — product discovery not relevant
              })()}
              {/* Phase 3I.2 — WHY content was skipped (rate limit is the common
                  real-world cause of "74 skipped, 1 with anchors"). */}
              {status?.contentSkipBreakdown && (status.contentSkipBreakdown.rateLimited > 0 || status.contentSkipBreakdown.abortedAfterFailures > 0) && (
                <span className="text-amber-700 dark:text-amber-400">
                  {t.rateLimitedNote.replace('{n}', String(status.contentSkipBreakdown.rateLimited + status.contentSkipBreakdown.abortedAfterFailures))}
                </span>
              )}
              {(status?.scanCompletedAt || status?.scannerVersion) && <span className="text-slate-300 dark:text-slate-600">·</span>}
              {status?.scanCompletedAt && <span>{t.lastScanned}: {formatDateTime(status.scanCompletedAt)}</span>}
              {status?.scannerVersion && <span>{t.scannerVersion} {status.scannerVersion}</span>}
              {status?.truncated ? <span className="text-amber-700 dark:text-amber-400">{t.truncated}</span> : null}
            </div>
          ) : (
            !refreshing && <p className="mt-1 text-[11px] text-slate-400">{t.notScannedHint}</p>
          )}

          {/* Coverage clarification (Phase 3F.1.1) — the index intentionally covers
              the most useful link destinations from posts/pages, not the full
              product catalog, so "partial" on large WooCommerce sites is expected. */}
          {exists && <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t.coverageNote}</p>}

          {/* Advanced diagnostics — collapsed; 2-col grid keeps it compact + connected */}
          {exists && (
            <details className="mt-1.5">
              <summary className="cursor-pointer select-none text-[11px] text-slate-500 dark:text-slate-400">{t.techDetails}</summary>
              <div className="mt-1 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
                {status?.siteUrl && <div dir="ltr" className="sm:col-span-2">{t.siteUrl}: <span className="font-mono">{status.siteUrl}</span></div>}
                <div>{t.scannerVersion}: {status?.scannerVersion ?? '—'} · {t.currentVersion}: {status?.currentScannerVersion ?? '—'}</div>
                <div>{t.ttlDays}: {status?.ttlDays ?? '—'}</div>
                {status?.scanStartedAt && <div>{t.startedAt}: {formatDateTime(status.scanStartedAt)}</div>}
                {status?.expiresAt && <div>{t.expires}: {formatDateTime(status.expiresAt)}</div>}
                {typeof status?.scanDurationMs === 'number' && <div>{t.duration}: {status.scanDurationMs}ms</div>}
                <div>{t.cStored}: {c.targetsStored ?? 0}</div>
                {/* Phase 3I.2 — full skip-reason breakdown + type mix. */}
                {status?.contentSkipBreakdown && (
                  <div className="sm:col-span-2">{t.skipBreakdown}: {t.sbRateLimited} {status.contentSkipBreakdown.rateLimited + status.contentSkipBreakdown.abortedAfterFailures} · {t.sbTimeBudget} {status.contentSkipBreakdown.timeBudget} · {t.sbFetchFailed} {status.contentSkipBreakdown.fetchFailed} · {t.sbTooLarge} {status.contentSkipBreakdown.tooLarge}</div>
                )}
                {status?.targetsByType && (
                  <div className="sm:col-span-2" dir="ltr">{Object.entries(status.targetsByType).map(([k, v]) => `${k}: ${v}`).join(' · ')}</div>
                )}
              </div>
            </details>
          )}
        </>
      )}
    </Card>
  )
}
