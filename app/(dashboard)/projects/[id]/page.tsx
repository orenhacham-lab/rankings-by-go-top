'use client'

import { useState, useEffect, useCallback, useMemo, useRef, use } from 'react'
import { useSearchParams } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Project, Client, TrackingTarget, ScanResult } from '@/lib/supabase/types'
import { useDashboardLanguage } from '@/lib/i18n/dashboard/useDashboardLanguage'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import Header from '@/components/layout/Header'
import { Card } from '@/components/ui/Card'
import { ActiveBadge } from '@/components/ui/StatusBadge'
import Button from '@/components/ui/Button'
import Modal from '@/components/ui/Modal'
import ProjectForm from '@/components/projects/ProjectForm'
import TrackingTargetsTable from '@/components/keywords/TrackingTargetsTable'
import TrackingTargetForm from '@/components/keywords/TrackingTargetForm'
import AIVisibilitySection from '@/components/ai-visibility/AIVisibilitySection'
import ContentSection from '@/components/content/ContentSection'
import GscPanel from '@/components/content/GscPanel'
import ProjectSwitcher from '@/components/projects/ProjectSwitcher'
import Link from 'next/link'
import { formatDate, formatDateTime } from '@/lib/utils'
import Badge from '@/components/ui/Badge'
import { Search, BarChart3, Sparkles, FileText, Newspaper } from 'lucide-react'

export default function ProjectDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params)
  const searchParams = useSearchParams()
  const { language } = useDashboardLanguage()
  const dict = getDashboardDictionary(language)
  const k = dict.projectDetail

  // Phase 3 — weekly/monthly_first_day removed; the dead 'daily' branch
  // (never a valid value anywhere — not the DB constraint, not the form)
  // is also removed.
  const localizedFrequencyLabel = (freq: string | null | undefined): string => {
    const f = (freq || 'manual').toLowerCase()
    const map = dict.projects.frequency as Record<string, string>
    if (f === 'monthly') return map.monthly
    return map.manual
  }

  const [project, setProject] = useState<Project & { clients?: Client } | null>(null)
  const [targets, setTargets] = useState<TrackingTarget[]>([])
  const [latestResults, setLatestResults] = useState<Record<string, ScanResult>>({})
  const [clients, setClients] = useState<Client[]>([])
  const [loading, setLoading] = useState(true)
  const [showEdit, setShowEdit] = useState(false)
  const [showAddTarget, setShowAddTarget] = useState(false)
  const [scanning, setScanning] = useState(false)
  const [scanningTargets, setScanningTargets] = useState<Set<string>>(new Set())
  const [scanMessage, setScanMessage] = useState('')
  const [scanError, setScanError] = useState(false)
  const [updatingVolumes, setUpdatingVolumes] = useState(false)
  /** The project row could not be read. A TERMINAL state, with a retry — not a
   *  spinner that never ends. */
  const [dataError, setDataError] = useState(false)
  /** The keyword table's own data. Reported on the table, never by the page. */
  const [secondaryLoading, setSecondaryLoading] = useState(true)
  const [secondaryError, setSecondaryError] = useState(false)
  // A NEW KEYWORD HAS NO SEARCH VOLUME UNTIL SOMETHING FETCHES ONE. The direct
  // "+ Add keyword" path never scheduled that (only the keyword-research path
  // carried metrics through), so a keyword added here stayed blank until the
  // merchant found the manual button. This tracks the automatic refresh so the
  // row can say "fetching" rather than showing an empty cell that looks broken.
  const [volumePending, setVolumePending] = useState(false)
  // A SILENT catch left the merchant looking at a dash with no way to tell a
  // keyword that has no volume from one whose lookup failed. The automatic
  // refresh now records that it did not succeed, so the row can offer a retry —
  // without ever suggesting the keyword itself failed to save.
  const [volumeUnavailable, setVolumeUnavailable] = useState(false)
  // IN-FLIGHT GUARD, in a ref rather than state: two clicks in the same tick
  // must not both start work, and a ref is read synchronously.
  const volumeRequestInFlight = useRef(false)
  // The same synchronous guard for both scan entry points. UX protection only —
  // it stops a second click in THIS component and nothing else. The server's
  // single-flight claim is what actually prevents duplicate work, and remains
  // mandatory: two tabs, a reload mid-flight and two direct POSTs never reach
  // this ref at all.
  const scanAllInFlight = useRef(false)
  const targetScansInFlight = useRef<Set<string>>(new Set())

  /**
   * THE PAGE MUST REACH A TERMINAL STATE, AND THE HEADER MUST NOT WAIT FOR THE
   * WHOLE BATCH.
   *
   * Measured on the previous version, in Chromium over a production build, by
   * delaying ONE of the four calls at the network layer:
   *
   *   one call delayed 20s -> the sidebar appeared at 200ms and the project
   *                           body stayed a bare spinner for 20,344ms;
   *   one call FAILING     -> the body was a spinner FOREVER: no error, no
   *                           retry, nothing to read (`usable: NEVER`);
   *   nothing delayed      -> usable at 656ms.
   *
   * Neither branch had a timeout and `loadData` had no catch or finally, so
   * `loading` could only ever be cleared by the success path. That is the shape
   * of the reported ~190-second refresh: not a loop, not a duplicated request —
   * one slow call holding a page that had nothing else to show.
   *
   * So: the PROJECT is fetched on its own and rendered as soon as it lands (the
   * header, the tabs and the actions need only it), the rest loads beside it,
   * every path is bounded, and a failure ends in a localized error with a retry
   * instead of an unbounded spinner.
   */
  // A NEW ARRAY EVERY RENDER IS A NEW DEPENDENCY.
  //
  // This was `targets.map(...).filter(Boolean)` written inline in the JSX, so
  // every render of this page handed AIVisibilitySection a fresh array
  // identity — and that array is in the dependency list of an effect that calls
  // the Gemini-backed `/api/ai-visibility/enriched-suggestions`. Measured after
  // a hard refresh: that endpoint was called THREE times for one page load,
  // along with two competitor-analysis calls. In production those are the
  // slowest requests the page makes.
  const projectKeywords = useMemo(
    () => targets.map((t) => t.keyword).filter(Boolean),
    [targets],
  )

  const loadData = useCallback(async () => {
    const supabase = createClient()
    setDataError(false)
    // A ceiling for the whole load. Long enough that a healthy-but-busy request
    // still succeeds, short enough that a person is told something is wrong
    // instead of watching a spinner.
    const deadline = <T,>(work: PromiseLike<T>, ms = 15000): Promise<T | null> =>
      Promise.race([
        Promise.resolve(work).catch(() => null),
        new Promise<null>((resolve) => setTimeout(() => resolve(null), ms)),
      ])

    // THE HEADER'S OWN DATA, FIRST AND ALONE. One row, one round trip; the
    // title, the project switcher, the tabs and the action bar need nothing
    // else, so they must not queue behind the keyword table.
    const projectRes = await deadline(
      supabase.from('projects').select('*, clients(*)').eq('id', id).single())
    if (!projectRes || projectRes.error || !projectRes.data) {
      setDataError(true)
      setLoading(false)
      return
    }
    setProject(projectRes.data)
    setLoading(false)

    setSecondaryLoading(true)
    const [targetsRes, clientsRes] = await Promise.all([
      deadline(supabase.from('tracking_targets').select('*').eq('project_id', id).order('created_at')),
      deadline(supabase.from('clients').select('*').eq('is_active', true)),
    ])
    const targetsData = targetsRes?.data ?? null
    setTargets(targetsData || [])
    setClients(clientsRes?.data || [])
    // A secondary list that could not be read is reported where it belongs —
    // on the table — never by holding the whole page.
    setSecondaryError(!targetsRes || !!targetsRes.error)

    // Load latest results for each target
    if (targetsData && targetsData.length > 0) {
      const targetIds = targetsData.map((t) => t.id)
      const { data: resultsData } = await supabase
        .from('scan_results')
        .select('*')
        .in('tracking_target_id', targetIds)
        .order('checked_at', { ascending: false })

      // Keep only the latest result per target
      const latest: Record<string, ScanResult> = {}
      for (const result of resultsData || []) {
        if (!latest[result.tracking_target_id]) {
          latest[result.tracking_target_id] = result
        }
      }
      setLatestResults(latest)
    }

    setSecondaryLoading(false)
  }, [id])

  useEffect(() => {
    // `loadData` never rejects — every await inside it is already bounded and
    // caught — but the guard stays so a future edit cannot reintroduce the
    // permanent spinner this page had.
    loadData().catch(() => { setDataError(true); setLoading(false); setSecondaryLoading(false) })
  }, [loadData])

  // Deep-link support: ?section=ai-visibility | rankings scrolls to that area.
  useEffect(() => {
    if (loading) return
    const section = searchParams.get('section')
    if (!section) return
    const sectionMap: Record<string, string> = {
      'ai-visibility': 'ai-visibility',
      rankings: 'keywords-section',
      reports: 'keywords-section',
      content: 'content-section',
    }
    const elementId = sectionMap[section]
    if (!elementId) return
    requestAnimationFrame(() => {
      const el = document.getElementById(elementId)
      if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
    })
  }, [loading, searchParams])

  /**
   * A LOCALIZED message from the route's stable CODE — never the route's own
   * error text. `scanError(data.error)` used to print whatever the server sent,
   * which after a fatal error was a raw provider or database string, and in one
   * language regardless of the merchant's.
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
        await loadData()
      } else if (response.ok && (data?.updated === 0 && data?.noData === 0)) {
        // Nothing needed fetching — the volumes are current, not unavailable.
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
  }, [id, loadData])

  function showScanResult(message: string, isError: boolean) {
    setScanMessage(message)
    setScanError(isError)
    setTimeout(() => setScanMessage(''), 5000)
  }

  async function handleScanAll() {
    const keywordsSection = document.getElementById('keywords-section')
    if (keywordsSection) {
      keywordsSection.scrollIntoView({ behavior: 'smooth', block: 'start' })
      keywordsSection.classList.add('ring-2', 'ring-indigo-400')
      setTimeout(() => {
        keywordsSection.classList.remove('ring-2', 'ring-indigo-400')
      }, 1500)
    }
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
        await loadData()
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
        await loadData()
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
        // TRANSIENT and retryable — distinct from "not configured", which no
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
        await loadData()
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

  // A TERMINAL, READABLE STATE — checked before the spinner, so a failure can
  // never present as "still loading". Measured on the previous version: a
  // single failing data call left this page a spinner forever, with no error
  // and no way to retry.
  if (dataError && !project) {
    return (
      <div className="text-center py-20">
        <p className="text-slate-500 dark:text-slate-400 mb-4">{k.messages.loadFailed}</p>
        <Button
          onClick={() => { setLoading(true); setDataError(false); void loadData() }}
        >
          {k.messages.retry}
        </Button>
      </div>
    )
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-slate-400">
        <span className="w-6 h-6 border-2 border-blue-500 border-t-transparent rounded-full animate-spin ml-2" />
        {k.messages.loading}
      </div>
    )
  }

  if (!project) {
    return <div className="text-center py-20 text-slate-400">{k.messages.projectNotFound}</div>
  }

  const activeTargets = targets.filter((t) => t.is_active)
  const primaryEngine = activeTargets[0]?.engine_type || 'google_search'

  let deviceLabel: string
  if (project.device_type === 'mobile') {
    deviceLabel = dict.common.deviceMobile
  } else if (project.device_type === 'desktop') {
    deviceLabel = dict.common.deviceDesktop
  } else {
    deviceLabel = dict.common.deviceDefault
  }

  let searchTypeLabel: string
  if (primaryEngine === 'google_search') {
    if (project.device_type === 'mobile') {
      searchTypeLabel = dict.common.searchTypeGoogleMobile
    } else {
      searchTypeLabel = dict.common.searchTypeGoogleDesktop
    }
  } else if (primaryEngine === 'google_maps') {
    searchTypeLabel = dict.common.engineGoogleMaps
  } else {
    searchTypeLabel = primaryEngine
  }

  const scanParams = {
    engine: searchTypeLabel,
    device: deviceLabel,
    gl: project.country.toLowerCase(),
    hl: project.language,
    location: project.city || '—',
  }

  return (
    <div>
      <Header
        title={project.name}
        subtitle={project.clients?.name}
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <ProjectSwitcher currentProjectId={id} currentProjectName={project.name} />
            <Link href="/projects">
              <Button variant="outline" size="sm">{k.backToProjects}</Button>
            </Link>
            <Button variant="secondary" size="sm" onClick={() => setShowEdit(true)}>
              {k.edit}
            </Button>
            <Button
              onClick={() => {
                const section = document.getElementById('keywords-section')
                section?.scrollIntoView({ behavior: 'smooth', block: 'start' })
              }}
              className="flex items-center gap-2"
            >
              <Search size={18} strokeWidth={2} />
              {k.goToKeywordScanning}
            </Button>
          </div>
        }
      />

      {scanMessage && (
        <div
          role="alert"
          aria-live="polite"
          className="fixed top-4 sm:top-6 left-4 right-4 sm:left-1/2 sm:right-auto sm:-translate-x-1/2 sm:max-w-md sm:w-auto z-[100]"
        >
          <div
            className={`p-3 pr-2 rounded-lg text-sm flex items-center gap-2 shadow-lg ${
              scanError
                ? 'bg-red-50 border border-red-200 text-red-700'
                : 'bg-green-50 border border-green-200 text-green-700'
            }`}
          >
            <span>{scanError ? '✗' : '✓'}</span>
            <span className="flex-1">{scanMessage}</span>
            <button
              type="button"
              onClick={() => setScanMessage('')}
              aria-label="Close"
              className={`shrink-0 w-6 h-6 inline-flex items-center justify-center rounded hover:bg-black/5 ${
                scanError ? 'text-red-700' : 'text-green-700'
              }`}
            >
              ×
            </button>
          </div>
        </div>
      )}

      {/* Project Module Navigation */}
      <nav className="mb-4 -mx-1 overflow-x-auto" aria-label="Project modules">
        <div className="flex items-center gap-1 px-1 py-1.5 bg-gradient-to-r from-slate-50 via-white to-slate-50 dark:from-slate-900 dark:via-slate-900 dark:to-slate-900 rounded-xl border border-slate-200/70 dark:border-slate-700 shadow-sm">
          <a
            href="#keywords-section"
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-900 dark:text-slate-100 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 shadow-sm hover:shadow transition whitespace-nowrap"
          >
            <BarChart3 size={18} strokeWidth={2} className="text-slate-600 dark:text-slate-300" />
            <span>{k.tabs.googleRankings}</span>
          </a>
          {process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true' && (
            <a
              href="#ai-visibility"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold text-white bg-gradient-to-r from-indigo-600 to-blue-600 hover:shadow-sm transition whitespace-nowrap"
            >
              <Sparkles size={18} strokeWidth={2} />
              <span>{k.tabs.aiVisibility}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-white/25 font-bold tracking-wider">{k.tabs.aiVisibilityBadge}</span>
            </a>
          )}
          {process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true' && (
            <a
              href="#content-section"
              className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
            >
              <Newspaper size={18} strokeWidth={2} className="text-slate-600 dark:text-slate-300" />
              <span>{k.tabs.content}</span>
              <span className="text-[10px] px-1.5 py-0.5 rounded-full bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 font-bold tracking-wider">{k.tabs.contentBadge}</span>
            </a>
          )}
          <Link
            href={`/reports?project_id=${id}`}
            className="flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-medium text-slate-600 dark:text-slate-300 hover:bg-white/70 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-slate-100 transition whitespace-nowrap"
          >
            <FileText size={18} strokeWidth={2} className="text-slate-600 dark:text-slate-300" />
            <span>{k.tabs.reports}</span>
          </Link>
        </div>
      </nav>

      {/* Project Summary — 5 compact cards in one row on desktop */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 mb-6">
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.summary.domain}</div>
          <div className="font-mono text-sm font-semibold text-slate-800 dark:text-slate-100 truncate">{project.target_domain}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.summary.keywords}</div>
          <div className="text-2xl font-bold text-slate-800 dark:text-slate-100">{targets.length}</div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.summary.lastScan}</div>
          <div className="text-sm font-medium text-slate-800 dark:text-slate-100 truncate">
            {project.last_scan_at ? formatDateTime(project.last_scan_at) : '—'}
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.summary.frequency}</div>
          <div className="flex items-center gap-2">
            <Badge variant={project.auto_scan_enabled ? 'info' : 'neutral'}>
              {localizedFrequencyLabel(project.scan_frequency)}
            </Badge>
          </div>
        </Card>
        <Card className="p-3">
          <div className="text-xs text-slate-500 dark:text-slate-400 mb-1">{k.summary.scanParameters}</div>
          <div className="text-[11px] text-slate-700 dark:text-slate-300 leading-tight">
            {scanParams.engine} · {scanParams.device} · gl={scanParams.gl} · hl={scanParams.hl}
            {scanParams.location !== '—' && <> · {scanParams.location}</>}
          </div>
        </Card>
      </div>

      {/* AI Visibility module — placed prominently above the keyword table */}
      {/* Gated by client-side NEXT_PUBLIC_ENABLE_AI_VISIBILITY flag (build-time). */}
      {process.env.NEXT_PUBLIC_ENABLE_AI_VISIBILITY === 'true' && (
        <div id="ai-visibility" className="scroll-mt-6">
          <AIVisibilitySection
            projectId={id}
            projectCountry={project.country}
            projectLanguage={project.language}
            projectDomain={project.target_domain}
            projectBrandName={project.business_name}
            projectBrandAliases={project.brand_aliases}
            projectDomainAliases={project.domain_aliases}
            projectCity={project.city}
            projectKeywords={projectKeywords}
          />
        </div>
      )}

      {/* Content & Articles module — Phase 1: WordPress connection + dashboard */}
      {/* Gated by client-side NEXT_PUBLIC_ENABLE_CONTENT flag (build-time). */}
      {process.env.NEXT_PUBLIC_ENABLE_CONTENT === 'true' && (
        <div id="content-section" className="scroll-mt-6">
          <ContentSection projectId={id} />
        </div>
      )}

      {/* Stage E1 — Google Search Console diagnostics (read-only, observability only). */}
      {/* Gated by the client-side NEXT_PUBLIC_GSC_READ_ONLY_ENABLED mirror; the server */}
      {/* routes independently re-check the authoritative GSC_READ_ONLY_ENABLED flag. */}
      {process.env.NEXT_PUBLIC_GSC_READ_ONLY_ENABLED === 'true' && (
        <div id="gsc-section" className="mb-6 scroll-mt-6">
          <GscPanel projectId={id} />
        </div>
      )}

      {/* Tracking Targets */}
      <div id="keywords-section" className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 gap-3 scroll-mt-6">
        <h2 className="text-lg font-semibold text-slate-800 dark:text-slate-100">
          {k.keywordsSection.title} ({targets.length})
        </h2>
        <div className="w-full sm:w-auto flex flex-col sm:flex-row gap-2">
          {/* Primary actions: scan + add on the same row, taller on mobile */}
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Button
              onClick={handleScanAll}
              loading={scanning}
              disabled={activeTargets.length === 0}
              className="flex items-center justify-center gap-2 w-full sm:w-auto py-3 sm:py-1.5 text-sm"
              size="sm"
            >
              <Search size={16} strokeWidth={2} />
              {scanning ? k.keywordsSection.scanning : k.keywordsSection.scanAllButton}
            </Button>
            <Button size="sm" onClick={() => setShowAddTarget(true)} className="w-full sm:w-auto py-3 sm:py-1.5 text-sm">
              {k.keywordsSection.addKeywordButton}
            </Button>
          </div>
          {/* Secondary actions: report + update volumes — same row on mobile, normal flow on desktop */}
          <div className="grid grid-cols-2 gap-2 sm:contents">
            <Link href={`/reports?project_id=${id}`} className="w-full sm:w-auto">
              <Button variant="outline" size="sm" className="flex items-center justify-center gap-1.5 w-full sm:w-auto">
                <FileText size={16} strokeWidth={2} />
                {k.keywordsSection.reportButton}
              </Button>
            </Link>
            <Button
              variant="outline"
              size="sm"
              onClick={handleUpdateVolumes}
              loading={updatingVolumes}
              disabled={targets.length === 0}
              className="w-full sm:w-auto"
            >
              {updatingVolumes
                ? k.keywordsSection.updatingVolumes
                : k.keywordsSection.updateVolumesButton}
            </Button>
          </div>
        </div>
      </div>
      <TrackingTargetsTable
        targets={targets}
        latestResults={latestResults}
        projectId={id}
        projectCity={project.city}
        projectCountry={project.country}
        projectDomain={project.target_domain}
        projectBusinessName={project.business_name || undefined}
        onScanTarget={handleScanTarget}
        scanningTargets={scanningTargets}
        targetsLoading={secondaryLoading}
        targetsError={secondaryError}
        onRetryTargets={() => { void loadData() }}
        volumePending={volumePending}
        volumeUnavailable={volumeUnavailable}
        onRetryVolumes={handleUpdateVolumes}
        projectDevice={project.device_type}
        onActionComplete={loadData}
      />

      {/* Edit Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title={k.modals.editProjectTitle} size="lg">
        <ProjectForm
          project={project}
          clients={clients}
          onSuccess={() => { setShowEdit(false); loadData() }}
          onCancel={() => setShowEdit(false)}
        />
      </Modal>

      {/* Add Target Modal */}
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
            // the background — one refresh for a single add, one deduplicated
            // batch for a bulk add, and never anything the creation waits on.
            void loadData().then(() => refreshMissingVolumes())
          }}
          onCancel={() => setShowAddTarget(false)}
        />
      </Modal>
    </div>
  )
}
