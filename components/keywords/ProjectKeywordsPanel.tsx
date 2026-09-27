'use client'

/**
 * The keyword tracking of ONE project: its keywords, their positions, and the
 * actions that change them (scan, add, refresh volumes, report).
 *
 * This lived on the project page, under the project's AI visibility, content and
 * Search Console sections, so "my keywords" meant opening a project first and
 * scrolling past three other tools. It is the Keywords tab now, for the project
 * the top bar names. What the project page had earned came with it unchanged:
 * every load is bounded, the table reports its own state, one click is one
 * request, and a provider failure never reaches the merchant as raw text.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Link from 'next/link'
import { Search, FileText } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type { Project, TrackingTarget, ScanResult } from '@/lib/supabase/types'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { withDeadline } from '@/lib/active-project/useProjectRow'
import { formatDateTime } from '@/lib/utils'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import Badge from '@/components/ui/Badge'
import TrackingTargetsTable from '@/components/keywords/TrackingTargetsTable'
import TrackingTargetForm from '@/components/keywords/TrackingTargetForm'
import CompetitorSummary from '@/components/competitors/CompetitorSummary'
import { useCompetitorComparison, type CompetitorView } from '@/components/competitors/useCompetitorComparison'
import type { OwnCheck } from '@/lib/competitors/comparison'

export default function ProjectKeywordsPanel({ project }: { project: Project }) {
  const id = project.id
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const k = dict.projectDetail
  const kp = dict.keywordsPage

  const [targets, setTargets] = useState<TrackingTarget[]>([])
  const [latestResults, setLatestResults] = useState<Record<string, ScanResult>>({})
  /** The keyword table's own data. Reported on the table, never by the page. */
  const [targetsLoading, setTargetsLoading] = useState(true)
  const [targetsError, setTargetsError] = useState(false)
  const [search, setSearch] = useState('')
  const [engineFilter, setEngineFilter] = useState('')
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanningTargets, setScanningTargets] = useState<Set<string>>(new Set())
  const [scanMessage, setScanMessage] = useState('')
  const [scanError, setScanError] = useState(false)
  const [updatingVolumes, setUpdatingVolumes] = useState(false)
  // A NEW KEYWORD HAS NO SEARCH VOLUME UNTIL SOMETHING FETCHES ONE. The direct
  // "+ Add keyword" path never scheduled that (only the keyword-research path
  // carried metrics through), so a keyword added here stayed blank until the
  // merchant found the manual button. This tracks the automatic refresh so the
  // row can say "fetching" rather than showing an empty cell that looks broken.
  const [volumePending, setVolumePending] = useState(false)
  // A SILENT catch left the merchant looking at a dash with no way to tell a
  // keyword that has no volume from one whose lookup failed. The automatic
  // refresh records that it did not succeed, so the row can offer a retry,
  // without ever suggesting the keyword itself failed to save.
  const [volumeUnavailable, setVolumeUnavailable] = useState(false)
  // IN-FLIGHT GUARD, in a ref rather than state: two clicks in the same tick
  // must not both start work, and a ref is read synchronously.
  const volumeRequestInFlight = useRef(false)
  // The same synchronous guard for both scan entry points. UX protection only:
  // it stops a second click in THIS component and nothing else. The server's
  // single-flight claim is what actually prevents duplicate work, and remains
  // mandatory: two tabs, a reload mid-flight and two direct POSTs never reach
  // this ref at all.
  const scanAllInFlight = useRef(false)
  const targetScansInFlight = useRef<Set<string>>(new Set())

  const loadTargets = useCallback(async () => {
    const supabase = createClient()
    setTargetsLoading(true)
    const targetsRes = await withDeadline(
      supabase.from('tracking_targets').select('*').eq('project_id', id).order('created_at'))
    const targetsData = targetsRes?.data ?? null
    setTargets(targetsData || [])
    // A list that could not be read is reported where it belongs, on the table.
    setTargetsError(!targetsRes || !!targetsRes.error)

    if (targetsData && targetsData.length > 0) {
      const targetIds = targetsData.map((t) => t.id)
      const resultsRes = await withDeadline(
        supabase.from('scan_results').select('*').in('tracking_target_id', targetIds).order('checked_at', { ascending: false }))
      // Keep only the latest result per target
      const latest: Record<string, ScanResult> = {}
      for (const result of resultsRes?.data || []) {
        if (!latest[result.tracking_target_id]) latest[result.tracking_target_id] = result
      }
      setLatestResults(latest)
    } else {
      setLatestResults({})
    }
    setTargetsLoading(false)
  }, [id])

  useEffect(() => {
    // `loadTargets` never rejects (every await in it is bounded and caught), but
    // the guard stays so a future edit cannot bring back a spinner that never ends.
    loadTargets().catch(() => { setTargetsError(true); setTargetsLoading(false) })
  }, [loadTargets])

  /**
   * The automatic search-volume refresh.
   *
   * It asks for the PROJECT, not for a list of keywords: the route's default
   * already selects exactly the targets with no metrics (or metrics older than
   * thirty days) and batches them through one deduplicated provider request.
   * So a single add schedules one refresh, a bulk add schedules one batch, and
   * a repeat click while the previous one is still running does nothing.
   *
   * It NEVER blocks or fails keyword creation: the keyword is already saved
   * before this runs, and every failure path here only leaves the volume blank
   * with the manual button still available.
   */
  const refreshMissingVolumes = useCallback(async () => {
    if (volumeRequestInFlight.current) return
    volumeRequestInFlight.current = true
    setVolumePending(true)
    try {
      const response = await fetch('/api/google-ads/keyword-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      })
      const data = await response.json().catch(() => null)
      if (response.ok && data?.updated > 0) {
        setVolumeUnavailable(false)
        await loadTargets()
      } else if (response.ok && (data?.updated === 0 && data?.noData === 0)) {
        // Nothing needed fetching: the volumes are current, not unavailable.
        setVolumeUnavailable(false)
      } else {
        // NOT an error toast: the keyword was created and saved. The row says
        // its volume is unavailable and offers a retry, which is the truth.
        setVolumeUnavailable(true)
      }
    } catch {
      setVolumeUnavailable(true)
    } finally {
      volumeRequestInFlight.current = false
      setVolumePending(false)
    }
  }, [id, loadTargets])

  /**
   * A LOCALIZED message from the route's stable CODE, never the route's own
   * error text, which after a fatal error was a raw provider or database string,
   * and in one language regardless of the merchant's.
   */
  function scanFailureMessage(data: { errorCode?: string; error?: string }): string {
    if (data?.errorCode === 'SCAN_IN_PROGRESS') return k.messages.scanInProgress
    if (data?.errorCode === 'SCAN_TIMEOUT') return k.messages.scanTimeout
    if (data?.errorCode === 'SCAN_FAILED') return k.messages.scanRetryable
    if (data?.errorCode === 'ENTITLEMENT_UNAVAILABLE') return k.messages.scanRetryable
    // A quota refusal is a real, specific answer and already localized by the
    // server's bilingual quota payload; anything else degrades to the safe
    // retryable line rather than echoing server text.
    if (data?.errorCode === 'QUOTA_KEYWORD_CHECKS' && data.error) return data.error
    return k.messages.scanRetryable
  }

  function showScanResult(message: string, isError: boolean) {
    setScanMessage(message)
    setScanError(isError)
    setTimeout(() => setScanMessage(''), 5000)
  }

  async function handleScanAll() {
    if (scanAllInFlight.current) return
    scanAllInFlight.current = true
    setScanning(true)
    setScanMessage('')
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      })
      const data = await response.json()
      if (response.ok) {
        await loadTargets()
        showScanResult(k.messages.scanComplete(data.completed, data.total), data.failed > 0 && data.completed === 0)
      } else {
        showScanResult(scanFailureMessage(data), true)
      }
    } catch {
      showScanResult(k.messages.scanNetworkError, true)
    } finally {
      scanAllInFlight.current = false
      setScanning(false)
    }
  }

  async function handleUpdateVolumes() {
    // The automatic refresh and this button share one in-flight guard, so a
    // repeated click cannot create duplicate provider work.
    if (volumeRequestInFlight.current) return
    volumeRequestInFlight.current = true
    setUpdatingVolumes(true)
    setScanMessage('')
    try {
      const response = await fetch('/api/google-ads/keyword-metrics', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id }),
      })
      const data = await response.json()
      if (response.ok && data.success) {
        const updated = typeof data.updated === 'number' ? data.updated : 0
        const noData = typeof data.noData === 'number' ? data.noData : 0
        const skipped = typeof data.skipped === 'number' ? data.skipped : 0
        if (updated === 0 && noData === 0 && skipped > 0) {
          showScanResult(k.keywordsSection.volumesUpToDate, false)
        } else if (updated > 0 && noData > 0) {
          showScanResult(k.keywordsSection.volumesPartial(updated, noData), false)
        } else if (updated > 0) {
          showScanResult(k.keywordsSection.volumesSuccess(updated), false)
        } else {
          showScanResult(k.keywordsSection.volumesNoData, false)
        }
        await loadTargets()
      } else if (data?.errorCode === 'GOOGLE_ADS_NOT_CONFIGURED'
        || data?.errorCode === 'GOOGLE_ADS_CLIENT_CREDENTIALS_INVALID'
        || data?.errorCode === 'GOOGLE_ADS_REAUTH_REQUIRED') {
        // All three mean the same thing to a merchant: the search-volume
        // connection is not usable and no amount of retrying will change that.
        // They differ only in which operator action fixes them, which the
        // structured operation line carries.
        showScanResult(k.keywordsSection.volumesNotConfigured, true)
      } else if (data?.errorCode === 'RATE_LIMITED' || response.status === 429) {
        showScanResult(k.keywordsSection.volumesQuota, true)
      } else if (data?.errorCode === 'VOLUME_IN_PROGRESS') {
        showScanResult(k.keywordsSection.volumesInProgress, false)
      } else if (data?.errorCode === 'PROVIDER_UNAVAILABLE') {
        // TRANSIENT and retryable, distinct from "not configured", which no
        // amount of retrying fixes. Both used to be the same 503.
        showScanResult(k.keywordsSection.volumesUnavailable, true)
      } else if (data?.errorCode === 'PERSIST_FAILED') {
        showScanResult(k.keywordsSection.volumesFailedToSave, true)
      } else {
        showScanResult(k.keywordsSection.volumesError, true)
      }
    } catch {
      showScanResult(k.keywordsSection.volumesError, true)
    } finally {
      volumeRequestInFlight.current = false
      setUpdatingVolumes(false)
    }
  }

  async function handleScanTarget(targetId: string) {
    if (targetScansInFlight.current.has(targetId)) return
    targetScansInFlight.current.add(targetId)
    setScanningTargets((prev) => new Set([...prev, targetId]))
    setScanMessage('')
    try {
      const response = await fetch('/api/scan', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId: id, targetId }),
      })
      const data = await response.json()
      if (response.ok) {
        await loadTargets()
        showScanResult(k.messages.scanSuccess, false)
      } else {
        showScanResult(scanFailureMessage(data), true)
      }
    } catch {
      showScanResult(k.messages.scanNetworkErrorTarget, true)
    } finally {
      targetScansInFlight.current.delete(targetId)
      setScanningTargets((prev) => {
        const next = new Set(prev)
        next.delete(targetId)
        return next
      })
    }
  }

  // Search and engine filters narrow what the table shows; they never change
  // what a scan or a volume refresh acts on, which is always the whole project.
  const visibleTargets = useMemo(() => {
    const q = search.trim().toLowerCase()
    return targets.filter((t) =>
      (!q || t.keyword.toLowerCase().includes(q)) && (!engineFilter || t.engine_type === engineFilter))
  }, [targets, search, engineFilter])
  const filtering = search.trim() !== '' || engineFilter !== ''

  const activeTargets = targets.filter((t) => t.is_active)
  const facts = scanFacts(project, activeTargets[0]?.engine_type || 'google_search', dict)

  // You vs. competitors: each keyword's latest check, the one the table shows,
  // paired with the competitor positions recorded in that same check.
  const checks = useMemo<OwnCheck[]>(() => targets.map((t) => {
    const r = latestResults[t.id]
    return { targetId: t.id, engine: t.engine_type, checkedAt: r?.checked_at ?? null, found: !!r?.found, position: r?.position ?? null }
  }), [targets, latestResults])
  const comparedView = useCompetitorComparison(id, checks, !targetsLoading && !targetsError)
  // Keywords that could not be read cannot be compared: say so, and retry them.
  const competitorView: CompetitorView = targetsError && comparedView.status !== 'no_competitors'
    ? { ...comparedView, status: 'error', retry: () => { void loadTargets() } }
    : comparedView

  return (
    <div>
      {scanMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed top-4 sm:top-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md sm:w-auto z-[100] animate-pop-in"
        >
          <div
            className={`p-3 pr-2 rounded-control text-sm flex items-center gap-2 shadow-pop border ${
              scanError ? 'bg-bad-soft border-bad/20 text-bad' : 'bg-ok-soft border-ok/20 text-ok'
            }`}
          >
            <span>{scanError ? '✗' : '✓'}</span>
            <span className="flex-1">{scanMessage}</span>
            <button
              type="button"
              onClick={() => setScanMessage('')}
              aria-label="Close"
              className="shrink-0 w-6 h-6 inline-flex items-center justify-center rounded hover:bg-black/5"
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* What every scan of this project is measured against: the facts that used
          to be the project page's summary row. */}
      <dl className="mb-6 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-line bg-line lg:grid-cols-4">
        <Fact label={k.summary.domain}><span dir="ltr" className="font-mono">{project.target_domain}</span></Fact>
        <Fact label={k.summary.lastScan}>{project.last_scan_at ? formatDateTime(project.last_scan_at) : '—'}</Fact>
        <Fact label={k.summary.frequency}>
          <Badge variant={project.auto_scan_enabled ? 'info' : 'neutral'}>{facts.frequency}</Badge>
        </Fact>
        <Fact label={k.summary.scanParameters}>
          <span className="text-caption">
            {facts.engine} · {facts.device} · gl={facts.gl} · hl={facts.hl}
            {facts.location !== '—' && <> · {facts.location}</>}
          </span>
        </Fact>
      </dl>

      <CompetitorSummary view={competitorView} variant="full" className="mb-6" />

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex flex-1 gap-2">
          <input
            type="search"
            placeholder={kp.searchPlaceholder}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full max-w-xs rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink placeholder-muted focus:outline-none focus:ring-2 focus:ring-action"
          />
          <select
            value={engineFilter}
            onChange={(e) => setEngineFilter(e.target.value)}
            aria-label={k.table.scanType}
            className="rounded-control border border-line bg-surface px-3 py-2 text-sm text-ink focus:outline-none focus:ring-2 focus:ring-action"
          >
            <option value="">{kp.allEngines}</option>
            <option value="google_search">{kp.engineGoogleSearch}</option>
            <option value="google_maps">{kp.engineGoogleMaps}</option>
          </select>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button onClick={handleScanAll} loading={scanning} disabled={activeTargets.length === 0} size="sm" className="gap-2">
            <Search size={16} strokeWidth={2} />
            {scanning ? k.keywordsSection.scanning : k.keywordsSection.scanAllButton}
          </Button>
          <Button size="sm" variant="secondary" onClick={() => setShowAddTarget(true)}>
            {k.keywordsSection.addKeywordButton}
          </Button>
          <Button variant="outline" size="sm" onClick={handleUpdateVolumes} loading={updatingVolumes} disabled={targets.length === 0}>
            {updatingVolumes ? k.keywordsSection.updatingVolumes : k.keywordsSection.updateVolumesButton}
          </Button>
          <Link href="/reports">
            <Button variant="ghost" size="sm" className="gap-1.5">
              <FileText size={16} strokeWidth={2} />
              {k.keywordsSection.reportButton}
            </Button>
          </Link>
        </div>
      </div>

      {filtering && targets.length > 0 && visibleTargets.length === 0 ? (
        <p className="rounded-card border border-line bg-surface px-4 py-10 text-center text-sm text-muted">{kp.noMatches}</p>
      ) : (
        <TrackingTargetsTable
          targets={visibleTargets}
          latestResults={latestResults}
          projectId={id}
          projectCity={project.city}
          projectCountry={project.country}
          projectDomain={project.target_domain}
          projectBusinessName={project.business_name || undefined}
          onScanTarget={handleScanTarget}
          scanningTargets={scanningTargets}
          targetsLoading={targetsLoading}
          targetsError={targetsError}
          onRetryTargets={() => { void loadTargets() }}
          volumePending={volumePending}
          volumeUnavailable={volumeUnavailable}
          onRetryVolumes={handleUpdateVolumes}
          projectDevice={project.device_type}
          onActionComplete={loadTargets}
          competitorView={competitorView}
        />
      )}

      <Modal open={showAddTarget} onClose={() => setShowAddTarget(false)} title={k.modals.addKeywordTitle} size="md">
        <TrackingTargetForm
          projectId={id}
          projectCity={project.city || undefined}
          projectCountry={project.country}
          defaultDomain={project.target_domain}
          defaultBusinessName={project.business_name || undefined}
          onSuccess={() => {
            setShowAddTarget(false)
            // The keyword is already saved. Show it, then fetch its volume in
            // the background: one refresh for a single add, one deduplicated
            // batch for a bulk add, and never anything the creation waits on.
            void loadTargets().then(() => refreshMissingVolumes())
          }}
          onCancel={() => setShowAddTarget(false)}
        />
      </Modal>
    </div>
  )
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="bg-surface px-4 py-3">
      <dt className="text-caption text-muted">{label}</dt>
      <dd className="mt-1 truncate text-sm font-medium text-ink">{children}</dd>
    </div>
  )
}

/** The scan parameters in words, exactly as the project page derived them. */
function scanFacts(project: Project, primaryEngine: string, dict: ReturnType<typeof getDashboardDictionary>) {
  const map = dict.projects.frequency as Record<string, string>
  const frequency = (project.scan_frequency || 'manual').toLowerCase() === 'monthly' ? map.monthly : map.manual

  const device = project.device_type === 'mobile' ? dict.common.deviceMobile
    : project.device_type === 'desktop' ? dict.common.deviceDesktop
    : dict.common.deviceDefault

  const engine = primaryEngine === 'google_search'
    ? (project.device_type === 'mobile' ? dict.common.searchTypeGoogleMobile : dict.common.searchTypeGoogleDesktop)
    : primaryEngine === 'google_maps' ? dict.common.engineGoogleMaps
    : primaryEngine

  return {
    frequency,
    engine,
    device,
    gl: project.country.toLowerCase(),
    hl: project.language,
    location: project.city || '—',
  }
}
