'use client'

/**
 * TopicPlanDrawer — per-topic internal-link planning modal (Phase 2E.2).
 *
 * MANUAL, read/plan/review only. Reuses existing endpoints:
 *   GET  …/plan?topicIds=…            (dry-run, no write)
 *   POST …/plan/save                 (persist / regenerate — supersedes prior)
 *   GET  …/plan/saved?topicId=…       (read latest saved batch + links)
 *   PATCH …/plan/link/[id]            (approve/reject one link)
 * No content mutation, no apply UI, no auto actions — every call is a button.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import Modal from '@/components/ui/Modal'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { TopicPlanSummary } from '@/components/content/TopicPlanBadge'
import { resolveQueueLinkExpectation } from '@/lib/content/queue-link-expectation'
import { LatestRequest, isAbortError } from '@/lib/content/latest-request'

const REASON_HE: Record<string, string> = {
  low_relevance: 'רלוונטיות נמוכה',
  no_usable_anchor: 'אין עוגן שמיש',
  no_natural_anchor: 'אין עוגן טבעי',
  too_similar_self_link: 'דומה מדי (קישור עצמי)',
  self_target: 'קישור עצמי',
  duplicate_topic_target: 'נושא כפול',
  existing_same_topic_article: 'מאמר קיים לאותו נושא',
  too_similar_to_planned_topic: 'דומה מדי לנושא המתוכנן',
  target_ineligible: 'יעד לא כשיר',
  target_caution_excluded: 'יעד בזהירות — לא נכלל',
  low_confidence: 'ביטחון נמוך',
  duplicate_url: 'כתובת כפולה',
  duplicate_anchor: 'עוגן כפול',
  over_cap: 'מעל המכסה',
  content_skipped_no_anchors: 'תוכן דולג — אין עוגנים',
  off_domain_or_empty_url: 'כתובת חיצונית/ריקה',
  blocked_cross_cluster: 'אשכול מוצר/שירות שונה',
  blocked_generic_only: 'התאמה על מילים כלליות בלבד',
  unknown_no_exact: 'ללא אשכול מזוהה — לא התאמה מדויקת',
}
function reasonLabel(r?: string | null): string {
  if (!r) return ''
  const base = r.split('(')[0]!
  const he = REASON_HE[base]
  return he ? he + (r.includes('(') ? ` ${r.slice(r.indexOf('('))}` : '') : r
}

interface SavedLink {
  id: string
  target_url: string
  target_title: string | null
  target_role: string | null
  target_priority: string | null
  anchor_text: string | null
  anchor_source: string | null
  confidence: number | null
  relevance: number | null
  reason: string | null
  status: string
}
interface SavedBatch { id: string; status: string; linkCount: number; cacheState?: string | null }
interface DryItem { targetUrl: string; targetTitle: string; targetRole: string; targetPriority: string; eligibility: string; anchorText: string | null; anchorSource: string | null; relevance: number; priorityBonus: number; confidence: number; reason: string; rejectedReasons: string[]; reviewability?: string; canManualApprove?: boolean; displayBlocked?: boolean }
const dmkey = (l: { targetUrl: string; anchorText: string | null }) => `${l.targetUrl}||${(l.anchorText ?? '').toLowerCase()}`

export interface DrawerTopic { id: string; topic: string; primary_keyword: string | null }

export default function TopicPlanDrawer({
  open, onClose, projectId, topic, language, onStatusChange, onReturnToQueue, onPlanSaved, onSaveAndQueue,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  topic: DrawerTopic | null
  language: 'he' | 'en'
  onStatusChange?: (topicId: string, summary: TopicPlanSummary) => void
  // Phase 3F.3.3e — completion actions that guide the user back to the queue.
  onReturnToQueue?: () => void
  onPlanSaved?: () => void
  // Phase 3F.3.6 (Part G) — streamlined "save links and add to queue". When
  // provided, the drawer offers a one-click save+enqueue; returns queue success.
  //
  // `expectsLinks` is passed EXPLICITLY rather than inferred downstream: it is
  // the drawer that knows whether a link plan was reviewed and persisted, and
  // approve-and-queue verifies a saved plan only when it is true.
  onSaveAndQueue?: (topicId: string, expectsLinks: boolean) => Promise<boolean>
}) {
  const t = useMemo(() => getDashboardDictionary(language).contentHub.topicPlan, [language])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ exists: boolean; batch: SavedBatch | null; links: SavedLink[]; stale: boolean; staleReasons: string[] } | null>(null)
  const [dry, setDry] = useState<{ selected: DryItem[]; rejected: DryItem[]; summary: string; cacheState: string; warnings: string[]; moneyTargetUrl: string | null } | null>(null)
  /**
   * Whether each lookup POSITIVELY completed, tracked separately from its data.
   *
   * A failed request is not a fact about the project: a thrown preview does not
   * mean the site index is missing, and a failed saved-plan lookup does not mean
   * no plan exists. Conflating the two is what would let an infrastructure blip
   * queue an article without the internal links it was supposed to have. Both
   * start 'pending' and are reset on every open/topic change, so a result
   * belonging to a previously opened topic can never take part in the decision.
   */
  const [previewStatus, setPreviewStatus] = useState<'pending' | 'unavailable' | 'loaded'>('pending')
  const [savedStatus, setSavedStatus] = useState<'pending' | 'unavailable' | 'loaded'>('pending')
  // Manually-selected reviewable candidates for the current dry-run (mkey set).
  const [manualSel, setManualSel] = useState<Set<string>>(new Set())
  // Phase 3F.3.4b — recommended links CHECKED for the plan (default all checked).
  const [recSel, setRecSel] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [savingQueue, setSavingQueue] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [busyLink, setBusyLink] = useState<string | null>(null)
  // Guards against the /plan/saved refetch loop: reqIdRef ignores stale
  // responses; abortRef cancels an in-flight load when topic/open changes.
  const reqIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)
  /**
   * The PREVIEW's own supersede guard. It used to have none: switching topics
   * mid-flight let the previous topic's preview write its dry-run, cache state
   * and default selection into the new topic's drawer — and the queue decision
   * reads that cache state. Separate from the saved-plan guard above because
   * the two lookups run concurrently and each must supersede only itself.
   */
  const previewRequest = useRef(new LatestRequest())
  // Identity of the cached snapshot under review (from the dry-run GET), echoed on save so
  // the server persists THIS reviewed plan and refuses (typed 409) only if the cache changed.
  const reviewedSnapshotRef = useRef<{ scannerVersion: string | null; scanCompletedAt: string | null } | null>(null)

  const emitStatus = useCallback((s: { exists: boolean; links: SavedLink[]; batch: SavedBatch | null; stale: boolean }) => {
    if (!topic) return
    onStatusChange?.(topic.id, {
      exists: s.exists,
      linkCount: s.batch?.linkCount ?? s.links.length,
      approvedCount: s.links.filter((l) => l.status === 'approved').length,
      stale: s.stale,
    })
  }, [topic, onStatusChange])

  const loadSaved = useCallback(async () => {
    if (!topic) return
    const myId = ++reqIdRef.current
    abortRef.current?.abort()
    const controller = new AbortController()
    abortRef.current = controller
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/content/automation/internal-links/plan/saved?projectId=${encodeURIComponent(projectId)}&topicId=${encodeURIComponent(topic.id)}`, { signal: controller.signal })
      const data = await res.json().catch(() => ({}))
      if (reqIdRef.current !== myId) return
      // A non-2xx is an UNAVAILABLE lookup, not a confirmed "no saved plan".
      // It used to write exists:false, which the queue decision would have read
      // as proof that nothing was saved.
      if (!res.ok) { setError(t.loadError); setSaved(null); setSavedStatus('unavailable'); return }
      if (!data.exists) { setSaved({ exists: false, batch: null, links: [], stale: false, staleReasons: [] }); setSavedStatus('loaded'); emitStatus({ exists: false, links: [], batch: null, stale: false }); return }
      const batch: SavedBatch = { id: data.batch.id, status: data.batch.status, linkCount: data.batch.linkCount ?? 0, cacheState: data.batch.cacheState }
      const links: SavedLink[] = Array.isArray(data.links) ? data.links : []
      setSaved({ exists: true, batch, links, stale: !!data.stale, staleReasons: Array.isArray(data.staleReasons) ? data.staleReasons : [] })
      setSavedStatus('loaded')
      emitStatus({ exists: true, links, batch, stale: !!data.stale })
    } catch (e) {
      // An abort is a supersede, not a failure — the newer request owns the
      // state. Any other throw leaves the fact unknown, never assumed.
      if (reqIdRef.current !== myId || (e as { name?: string })?.name === 'AbortError') return
      setError(t.loadError); setSaved(null); setSavedStatus('unavailable')
    } finally {
      if (reqIdRef.current === myId) setLoading(false)
    }
  }, [projectId, topic, t.loadError, emitStatus])

  // Keep a stable pointer to the latest loadSaved so the load effect can fire
  // it without depending on its (churning) identity — that dependency was the
  // source of the /plan/saved refetch loop.
  const loadSavedRef = useRef(loadSaved)
  loadSavedRef.current = loadSaved
  // Stable pointer to the latest runPlan for the auto-preview effect (Phase 3F.3.4b).
  const runPlanRef = useRef<() => void>(() => {})

  // Load the saved plan exactly once per (open, project, topic). Depends only on
  // primitives — parent re-renders / callback-identity churn can no longer
  // retrigger it. Cleanup aborts any in-flight request on topic/open change.
  useEffect(() => {
    if (!open || !topic) return
    // Captured for the cleanup: the LatestRequest instance is stable for the
    // life of the component, but reading a ref inside cleanup is flagged, and
    // the local also makes it obvious that THIS effect's preview is the one
    // being superseded.
    const preview = previewRequest.current
    // Reset every lookup, so nothing from a previously opened topic survives
    // into this topic's decision.
    setDry(null); setPreviewStatus('pending')
    setSaved(null); setSavedStatus('pending')
    setJustSaved(false)
    loadSavedRef.current()
    // Phase 3F.3.4b — auto-preview recommended links so they are always visible
    // and directly checkable (no need to click "find recommended" first).
    runPlanRef.current()
    // Supersede BOTH in-flight lookups. cancel() bumps the preview's sequence
    // as well as aborting, so a response already past its abort check still
    // fails isCurrent and writes nothing.
    return () => { abortRef.current?.abort(); preview.cancel() }
  }, [open, projectId, topic?.id])

  const runPlan = useCallback(async () => {
    if (!topic) return
    // NO `running` GUARD. It is shared state, so while topic A's preview was in
    // flight it made topic B's preview return immediately — B then had no
    // preview of its own, and A's response arrived to fill the gap. Concurrency
    // is safe here precisely because every write below is gated on `token`:
    // starting a second preview supersedes the first rather than being refused.
    const { token, signal } = previewRequest.current.start()
    const current = () => previewRequest.current.isCurrent(token)
    setRunning(true); setError(null); setJustSaved(false); setPreviewStatus('pending')
    try {
      const res = await fetch(`/api/content/automation/internal-links/plan?projectId=${encodeURIComponent(projectId)}&topicIds=${encodeURIComponent(topic.id)}`, { signal })
      const data = await res.json().catch(() => ({}))
      if (!current()) return
      if (!res.ok) {
        // A non-2xx counts as a LOADED preview only when the response itself
        // states the cache state (e.g. an explicit 'missing'). Defaulting to
        // 'missing' here — which this used to do — turned any server error into
        // a false claim that the site has no index.
        const reported = typeof data.cacheState === 'string' && data.cacheState.length > 0 ? data.cacheState : null
        if (!reported) { setDry(null); setPreviewStatus('unavailable'); setError(t.loadError); return }
        setDry({ selected: [], rejected: [], summary: '', cacheState: reported, warnings: data.warnings || [data.warning].filter(Boolean), moneyTargetUrl: null })
        setPreviewStatus('loaded')
        return
      }
      reviewedSnapshotRef.current = { scannerVersion: typeof data.scannerVersion === 'string' ? data.scannerVersion : null, scanCompletedAt: typeof data.scanCompletedAt === 'string' ? data.scanCompletedAt : null }
      const plan = Array.isArray(data.topics) ? data.topics[0] : null
      const selected: DryItem[] = plan?.selected ?? []
      setManualSel(new Set())
      setRecSel(new Set(selected.map((d) => dmkey(d)))) // recommended default-checked
      setDry({
        selected,
        rejected: plan?.rejected ?? [],
        summary: plan?.summary ?? '',
        cacheState: data.cacheState || 'ok',
        warnings: data.warnings ?? [],
        moneyTargetUrl: typeof plan?.moneyTargetUrl === 'string' ? plan.moneyTargetUrl : null,
      })
      setPreviewStatus('loaded')
    } catch (e) {
      // An abort is a supersede, not a failure — the newer attempt owns the
      // state. Any other throw says the lookup did not complete, which is
      // nothing about whether the site has an index: it is reported as the
      // ordinary load error with a retry, never as a confirmed missing cache.
      if (!current() || isAbortError(e)) return
      setDry(null); setPreviewStatus('unavailable'); setError(t.loadError)
    } finally {
      // Even the loading flag is gated: a superseded attempt clearing it would
      // wrongly present the NEWER request as finished.
      if (current()) setRunning(false)
    }
  }, [projectId, topic, t.loadError])
  // Keep the auto-preview effect pointing at the latest runPlan (Phase 3F.3.4b).
  runPlanRef.current = runPlan

  // Persist the EXACT checked selection (recommended + manual) via the exact-mode
  // bulk-save; falls back to /plan/save when no dry-run is loaded. Returns success.
  //
  // Phase 3G.7 — `approve` distinguishes ENQUEUE-INTENT saves from plain saves:
  // "save + add to queue" MUST approve the checked links (generation only
  // auto-inserts approved links; a planned-only save produced the "נשמרו אך טרם
  // אושרו" articles). Plain "save plan" keeps approve=false. The server's
  // approval count is VERIFIED — a shortfall or dropped links surface a warning
  // instead of silently continuing.
  // The EXACT links that would be saved, computed once so the save payload and
  // the "is anything selected?" decision below can never disagree — a mismatch
  // there is what would let a checked link be silently dropped.
  const checkedLinks = useMemo(() => {
    if (!topic || !dry) return { recommended: [], manual: [] }
    return {
      recommended: dry.selected
        .filter((d) => recSel.has(dmkey(d)) && (d.anchorText || '').trim())
        .map((d) => ({ topicId: topic.id, targetUrl: d.targetUrl, anchorText: d.anchorText as string })),
      manual: dry.rejected
        .filter((r) => r.reviewability === 'reviewable' && r.canManualApprove && manualSel.has(dmkey(r)) && (r.anchorText || '').trim())
        .map((r) => ({ topicId: topic.id, targetUrl: r.targetUrl, anchorText: r.anchorText as string })),
    }
  }, [topic, dry, recSel, manualSel])
  const checkedLinkCount = checkedLinks.recommended.length + checkedLinks.manual.length

  /**
   * Whether this queue action must persist and claim a link plan.
   *
   * The internal-link index is OPTIONAL. When the project has no index and the
   * user selected nothing, there is no plan to save and none to verify, so the
   * topic is queued on its own instead of being blocked by a bulk-save that
   * correctly refuses a missing cache. Every other case keeps the existing
   * save-then-server-verify flow untouched. See lib/content/queue-link-expectation.ts.
   */
  const queueDecision = useMemo(() => resolveQueueLinkExpectation({
    // `running` keeps a refresh in flight as 'pending' even while stale data is
    // still on screen, so a re-run can never be decided on the previous answer.
    preview: running || previewStatus === 'pending' || !dry
      ? { status: 'pending' as const }
      : previewStatus === 'unavailable'
        ? { status: 'unavailable' as const }
        : { status: 'loaded' as const, cacheState: dry.cacheState },
    savedPlan: savedStatus === 'pending' || (savedStatus === 'loaded' && !saved)
      ? { status: 'pending' as const }
      : savedStatus === 'unavailable'
        ? { status: 'unavailable' as const }
        : { status: 'loaded' as const, exists: saved!.exists },
    checkedLinkCount,
  }), [dry, running, previewStatus, savedStatus, saved, checkedLinkCount])

  const persistSelection = useCallback(async (approve: boolean): Promise<{ ok: boolean; warning: string | null }> => {
    if (!topic) return { ok: false, warning: null }
    let warning: string | null = null
    let res: Response
    if (dry) {
      const { recommended, manual } = checkedLinks
      const checkedCount = recommended.length + manual.length
      res = await fetch('/api/content/automation/internal-links/plan/bulk-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, topicIds: [topic.id], selectedLinks: [...recommended, ...manual], approve, reviewedSnapshot: reviewedSnapshotRef.current ?? undefined }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.reason === 'cache_changed_replan_required' ? t.cacheChanged : (d.warning || d.error || t.saveError)); return { ok: false, warning: null } }
      if (approve) {
        const d = await res.json().catch(() => ({}))
        const r0 = Array.isArray(d.results) ? d.results[0] : null
        const approvedCount = typeof r0?.approvedCount === 'number' ? r0.approvedCount : 0
        const droppedCount = Array.isArray(r0?.droppedLinks) ? r0.droppedLinks.length : 0
        if (checkedCount > 0 && approvedCount < checkedCount) {
          warning = `${t.approvalIncomplete} (${approvedCount}/${checkedCount}${droppedCount ? ` · ${t.droppedShort}: ${droppedCount}` : ''})`
        }
      }
      return { ok: true, warning }
    }
    res = await fetch('/api/content/automation/internal-links/plan/save', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, topicId: topic.id, approve }),
    })
    if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.warning || d.error || t.saveError); return { ok: false, warning: null } }
    if (approve) {
      const d = await res.json().catch(() => ({}))
      if (typeof d.linkCount === 'number' && typeof d.approvedCount === 'number' && d.approvedCount < d.linkCount) {
        warning = `${t.approvalIncomplete} (${d.approvedCount}/${d.linkCount})`
      }
    }
    return { ok: true, warning }
  }, [projectId, topic, dry, checkedLinks, t])

  const savePlan = useCallback(async () => {
    if (!topic || saving) return
    setSaving(true); setError(null)
    try {
      const { ok } = await persistSelection(false) // plain save → planned only (by design)
      if (ok) { setJustSaved(true); onPlanSaved?.() } // success → show completion state + notify hub
      setDry(null); setManualSel(new Set()); setRecSel(new Set())
      await loadSaved()
    } finally {
      setSaving(false)
    }
  }, [topic, saving, persistSelection, loadSaved, onPlanSaved])

  // Phase 3F.3.6 (Part G) — streamlined: save the current plan AND add the topic to
  // the publishing queue in one action, then close. Only shown when the parent
  // provides an enqueue handler.
  const saveAndQueue = useCallback(async () => {
    if (!topic || saving || savingQueue || !onSaveAndQueue) return
    // RACE GUARD. The button is also disabled until BOTH lookups confirm their
    // fact, but a programmatic or rapid click must not be able to act on an
    // unconfirmed state: the two requests run concurrently, so the preview
    // resolving first is not enough on its own.
    if (!queueDecision.canQueue) return
    setSavingQueue(true); setError(null)
    try {
      let warning: string | null = null
      if (queueDecision.persistPlan) {
        // Phase 3G.7 — enqueue intent ⇒ APPROVE the checked links, so generation
        // auto-inserts them (planned-only links are never inserted).
        const saveResult = await persistSelection(true)
        if (!saveResult.ok) return
        warning = saveResult.warning
        onPlanSaved?.()
      }
      // NOTHING IS SAVED on the no-links path — no plan/save, no bulk-save, and
      // no empty batch invented to satisfy the queue. `expectsLinks: false`
      // tells the server there is no plan to verify; every other check it
      // performs (ownership, manual-topic approval, queue validation) is
      // unchanged.
      const queued = await onSaveAndQueue(topic.id, queueDecision.expectsLinks)
      setManualSel(new Set()); setRecSel(new Set())
      // An approval warning keeps the drawer OPEN so the user actually sees it
      // (set AFTER loadSaved, which clears the error state).
      if (queued && !warning) { onClose() }
      else {
        setJustSaved(true)
        await loadSaved()
        if (warning) setError(warning)
      }
    } finally {
      setSavingQueue(false)
    }
  }, [topic, saving, savingQueue, queueDecision, onSaveAndQueue, persistSelection, onPlanSaved, onClose, loadSaved])

  const setLinkStatus = useCallback(async (linkId: string, status: 'approved' | 'rejected') => {
    if (busyLink) return
    setBusyLink(linkId)
    try {
      const res = await fetch(`/api/content/automation/internal-links/plan/link/${encodeURIComponent(linkId)}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status }),
      })
      if (res.ok) {
        setSaved((prev) => {
          if (!prev) return prev
          const links = prev.links.map((l) => (l.id === linkId ? { ...l, status } : l))
          emitStatus({ exists: true, links, batch: prev.batch, stale: prev.stale })
          return { ...prev, links }
        })
      }
    } finally {
      setBusyLink(null)
    }
  }, [projectId, busyLink, emitStatus])

  if (!topic) return null

  const statusHe = (s: string) => (t.linkStatus as Record<string, string>)[s] ?? s
  const linkRow = (l: SavedLink) => (
    <div key={l.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{l.anchor_text || '—'}</span>
        <Badge variant={l.status === 'approved' ? 'success' : l.status === 'rejected' ? 'danger' : 'neutral'}>{statusHe(l.status)}</Badge>
        <span className="text-[10px] text-slate-400">{t.confidence} {l.confidence ?? '—'}</span>
        <div className="flex items-center gap-1 ms-auto">
          <Button size="sm" variant="outline" onClick={() => setLinkStatus(l.id, 'approved')} disabled={busyLink === l.id || l.status === 'approved' || l.status === 'superseded'}>{t.approve}</Button>
          <Button size="sm" variant="ghost" onClick={() => setLinkStatus(l.id, 'rejected')} disabled={busyLink === l.id || l.status === 'rejected' || l.status === 'superseded'} className="text-red-600 dark:text-red-400">{t.reject}</Button>
        </div>
      </div>
      <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400">
        <a href={l.target_url} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-indigo-600 dark:text-indigo-400 hover:underline">{l.target_title || l.target_url}</a>
        <span> · {l.target_priority}</span>
        {l.anchor_source ? <span> · {l.anchor_source}</span> : null}
      </div>
    </div>
  )

  const typeLabel = (priority: string): string =>
    priority === 'commercial_category_or_service_hub' ? t.typeCategory
      : priority === 'product_or_specific_offer' ? t.typeProduct
        : priority === 'post_or_article' ? t.typeArticle
          : t.typePage
  // Keys already persisted in the saved plan → "already in plan" state on rows.
  const savedKeys = new Set((saved?.links ?? []).map((l) => dmkey({ targetUrl: l.target_url, anchorText: l.anchor_text })))
  // How many recommended + manual links are checked, and whether the checked set
  // differs from what's already saved (→ the save button becomes primary/active).
  const checkedRecommended = (dry?.selected ?? []).filter((d) => recSel.has(dmkey(d)) && (d.anchorText || '').trim())
  const checkedManual = (dry?.rejected ?? []).filter((r) => r.reviewability === 'reviewable' && r.canManualApprove && manualSel.has(dmkey(r)) && (r.anchorText || '').trim())
  const checkedCount = checkedRecommended.length + checkedManual.length
  const checkedKeys = new Set([...checkedRecommended, ...checkedManual].map((d) => dmkey(d)))
  const hasUnsavedChanges = !!dry && !justSaved && (
    checkedKeys.size !== savedKeys.size || [...checkedKeys].some((k) => !savedKeys.has(k))
  )

  // Recommended link row with a checkbox (default checked). Unchecking removes it
  // from the plan that will be saved; already-persisted links are flagged.
  const recommendedRow = (d: DryItem) => {
    const k = dmkey(d)
    const inPlan = savedKeys.has(k)
    return (
      <label key={`${d.targetUrl}-rec-${d.anchorText}`} className="flex flex-wrap items-start gap-2 rounded-lg border border-emerald-100 dark:border-emerald-500/20 bg-emerald-50/40 dark:bg-emerald-900/10 p-2 text-[11px] cursor-pointer">
        <input type="checkbox" checked={recSel.has(k)} onChange={() => setRecSel((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })} className="mt-0.5 accent-emerald-600" />
        <span className="flex-1 min-w-0">
          <span className="flex flex-wrap items-center gap-2">
            <span className="font-medium text-slate-800 dark:text-slate-100 break-words">{d.anchorText || '—'}</span>
            <Badge variant="neutral">{typeLabel(d.targetPriority)}</Badge>
            {inPlan ? <Badge variant="success">{t.alreadyInPlan}</Badge> : null}
            <span className="text-slate-400">{t.confidence} {d.confidence}</span>
          </span>
          <a href={d.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="block text-indigo-600 dark:text-indigo-400 hover:underline break-all">{d.targetTitle || d.targetUrl}</a>
        </span>
      </label>
    )
  }

  const dryItemRow = (d: DryItem, rejected: boolean) => (
    <div key={`${d.targetUrl}-${d.anchorText}`} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-800 dark:text-slate-100 font-medium">{d.anchorText || '—'}</span>
        <Badge variant="neutral">{typeLabel(d.targetPriority)}</Badge>
        <span className="text-slate-400">{t.confidence} {d.confidence}</span>
      </div>
      <div className="mt-0.5 text-slate-500 dark:text-slate-400">
        <a href={d.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="hover:underline">{d.targetTitle || d.targetUrl}</a>
        {rejected && d.rejectedReasons?.length ? <span className="text-amber-700 dark:text-amber-400"> · {d.rejectedReasons.map(reasonLabel).join(' · ')}</span> : null}
      </div>
    </div>
  )

  return (
    <Modal open={open} onClose={onClose} title={t.drawerTitle} size="lg">
      <div dir={language === 'he' ? 'rtl' : 'ltr'}>
        <p className="text-sm font-medium text-slate-800 dark:text-slate-100">{topic.topic}</p>
        {topic.primary_keyword && <p className="text-xs text-slate-500 dark:text-slate-400">{t.primaryKeyword}: {topic.primary_keyword}</p>}

        {/* Persistent completion state after a successful save (Phase 3F.3.3f) —
            placed at the top so it is always visible, and stays until the user
            returns / keeps editing / closes / starts a new search. */}
        {justSaved && (
          <div className="mt-3 rounded-lg border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-3 py-3">
            <p className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">✓ {t.savedOk}</p>
            <p className="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/90">{t.savedBody}</p>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <Button size="sm" onClick={() => { onReturnToQueue?.(); onClose() }}>{t.returnToQueue}</Button>
              <Button size="sm" variant="outline" onClick={() => setJustSaved(false)}>{t.keepEditing}</Button>
            </div>
          </div>
        )}

        {/* Purpose + step hint (hidden once saved, to keep the completion clear). */}
        {!justSaved && (
          <div className="mt-2 rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/30 px-3 py-2">
            <p className="text-xs text-slate-600 dark:text-slate-300">{t.drawerIntro1}</p>
            <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.drawerIntro2}</p>
            <ol className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-slate-500 dark:text-slate-400">
              <li>1. {t.step1}</li>
              <li>2. {t.step2}</li>
              <li>3. {t.step3}</li>
              <li>4. {t.step4}</li>
            </ol>
          </div>
        )}

        {/* Warnings */}
        {saved?.stale && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.staleWarn}{saved.staleReasons.length ? ` (${saved.staleReasons.join(', ')})` : ''}</p>}
        {dry?.cacheState === 'missing' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.cacheMissing}</p>}
        {dry?.warnings?.includes('cache_stale') && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t.cacheStale}</p>}
        {dry?.warnings?.includes('cache_version_stale') && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t.versionStale}</p>}
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

        {/* Actions — all manual */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={runPlan} loading={running} disabled={running || savingQueue}>{running ? t.running : t.runPlan}</Button>
          <Button size="sm" onClick={savePlan} loading={saving} disabled={saving || savingQueue}>{saving ? t.saving : (dry ? `${t.savePlan}${checkedCount ? ` (${checkedCount})` : ''}` : t.savePlan)}</Button>
          {/* Phase 3F.3.6 (Part G) — streamlined save + enqueue in one click. */}
          {onSaveAndQueue && (
            /* The label states what the click will actually do. With no site
               index and nothing selected there is no plan to save, so promising
               "save links and add to queue" would be untrue. Disabled until the
               preview resolves, so the label can never describe the wrong path. */
            <Button
              size="sm"
              onClick={saveAndQueue}
              loading={savingQueue}
              disabled={saving || savingQueue || !queueDecision.canQueue}
            >
              {savingQueue ? t.savingQueue : queueDecision.canQueue && !queueDecision.expectsLinks ? t.queueWithoutLinks : t.saveAndQueue}
            </Button>
          )}
          {hasUnsavedChanges && <span className="text-[11px] font-medium text-amber-700 dark:text-amber-400">{t.unsavedChanges}</span>}
        </div>

        {loading ? (
          <div className="py-4"><span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" /></div>
        ) : (
          <>
            {/* Saved plan */}
            <div className="mt-4">
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.plannedLinksTitle}</div>
              {!saved?.exists ? (
                <p className="text-xs text-slate-400">{t.noSavedPlan}</p>
              ) : saved.links.length === 0 ? (
                <p className="text-xs text-slate-500 dark:text-slate-400">{t.zeroLink}</p>
              ) : (
                <div className="space-y-2">{saved.links.map(linkRow)}</div>
              )}
            </div>

            {/* Dry-run result (preview before save) */}
            {dry && (() => {
              const reviewable = dry.rejected.filter((r) => r.reviewability === 'reviewable' && r.canManualApprove && (r.anchorText || '').trim())
              // Phase 3G.5 — the blocked list shows ONLY true hard-safety/target
              // failures (displayBlocked); merely-irrelevant candidates are hidden noise.
              const blocked = dry.rejected.filter((r) => r.reviewability !== 'reviewable' && r.displayBlocked !== false)
              return (
              <div className="mt-4">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.recommendedTitle}</div>
                {dry.selected.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.zeroLink}</p>
                ) : (
                  <>
                    <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{t.recommendedCheckNote}</p>
                    {(() => {
                      // Phase 3F.3.6 — primary commercial link first, supporting below.
                      const money = dry.moneyTargetUrl ? dry.selected.find((d) => d.targetUrl === dry.moneyTargetUrl) : null
                      const supporting = dry.selected.filter((d) => !money || d.targetUrl !== money.targetUrl)
                      return (
                        <>
                          {money && (
                            <div className="mb-2">
                              <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300 mb-0.5">{t.primaryCommercialLink}</div>
                              {recommendedRow(money)}
                            </div>
                          )}
                          {!money && <p className="mb-1 text-[10px] text-amber-700 dark:text-amber-400">{t.noMoneyTargetNote}</p>}
                          {supporting.length > 0 && (
                            <>
                              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400 mb-0.5">{t.supportingLinks}</div>
                              <div className="space-y-1.5">{supporting.map((d) => recommendedRow(d))}</div>
                            </>
                          )}
                        </>
                      )
                    })()}
                  </>
                )}

                {/* Reviewable — manual-override candidates */}
                {reviewable.length > 0 && (
                  <details className="mt-3" open={dry.selected.length === 0}>
                    <summary className="cursor-pointer select-none text-[11px] font-medium text-indigo-700 dark:text-indigo-300">{t.reviewableTitle} ({reviewable.length})</summary>
                    <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{t.reviewableNote}</p>
                    <p className="text-[10px] text-slate-500 dark:text-slate-400">{t.reviewableSelectNote}</p>
                    <div className="mt-1.5 space-y-1.5">
                      {reviewable.map((d, i) => {
                        const k = dmkey(d)
                        return (
                          <label key={`${d.targetUrl}-rv-${i}`} className="flex flex-wrap items-start gap-2 rounded-lg border border-indigo-100 dark:border-indigo-500/20 p-2 text-[11px] cursor-pointer">
                            <input type="checkbox" checked={manualSel.has(k)} onChange={() => setManualSel((prev) => { const n = new Set(prev); n.has(k) ? n.delete(k) : n.add(k); return n })} className="mt-0.5 accent-indigo-600" />
                            <span className="flex-1 min-w-0">
                              <span className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-800 dark:text-slate-100 break-words">{d.anchorText || '—'}</span>
                                <Badge variant="neutral">{t.manualBadge}</Badge>
                                <span className="text-amber-700 dark:text-amber-400">{d.rejectedReasons.map(reasonLabel).join(' · ')}</span>
                                <span className="text-slate-400">{t.confidence} {d.confidence}</span>
                              </span>
                              <a href={d.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="block text-indigo-600 dark:text-indigo-400 hover:underline break-all">{d.targetTitle || d.targetUrl}</a>
                            </span>
                          </label>
                        )
                      })}
                    </div>
                  </details>
                )}

                {/* Phase 3G.7 — honest empty state: no manual alternatives passed
                    the quality filter (instead of looking broken/empty). */}
                {reviewable.length === 0 && dry.selected.length > 0 && (
                  <p className="mt-2 text-[10px] text-slate-400 dark:text-slate-500">{t.noManualOptions}</p>
                )}

                {/* Blocked — advanced diagnostics, not selectable */}
                {blocked.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-[11px] text-slate-500 dark:text-slate-400">{t.blockedTitle} ({blocked.length})</summary>
                    <div className="mt-1.5 space-y-1.5 opacity-70">{blocked.slice(0, 30).map((d) => dryItemRow(d, true))}</div>
                  </details>
                )}
              </div>
              )
            })()}

            {/* Advanced diagnostics */}
            {(saved?.exists || dry) && (
              <details className="mt-3">
                <summary className="cursor-pointer select-none text-[11px] text-slate-500 dark:text-slate-400">{t.techDetails}</summary>
                <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 space-y-0.5">
                  {saved?.batch && <div>{t.savedStatus}: {statusHe(saved.batch.status)} · {saved.batch.linkCount} · cache: {saved.batch.cacheState ?? '—'}</div>}
                  {saved?.staleReasons?.length ? <div>stale: {saved.staleReasons.join(', ')}</div> : null}
                  {dry && <div>dry-run cache: {dry.cacheState}{dry.warnings.length ? ` · ${dry.warnings.join(', ')}` : ''}</div>}
                </div>
              </details>
            )}
          </>
        )}
      </div>
    </Modal>
  )
}
