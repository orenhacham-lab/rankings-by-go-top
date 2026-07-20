'use client'

/**
 * AutomationIdeas — "רעיונות אוטומטיים למאמרים" (content automation, Phase 3).
 *
 * Simple, non-SEO-user flow: pick a source (keyword / project data / site
 * keyword research), generate ideas, review cards, bulk-approve selected → they
 * become article_topics (status 'approved'). Rejecting just clears them from the
 * list. No scheduling here (Phase 4). Gated by the caller (automation flag).
 */

import { useEffect, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { partitionByCheckedLinks, evaluateLinkSave, buildQueueTopics, type BulkSaveTopicResult } from '@/lib/content/automation/one-click-queue'

type Source = 'keyword' | 'project_data' | 'keyword_research_url' | 'site_scan' | 'hybrid'
type ProviderStatus = { source: Source; ok: boolean; count: number; reason?: string }

/** Phase 3I.6 — per-rejected-idea evidence of WHAT blocked it (from
 *  meta.debug.primaryKeywordMatches; returned on runs that added nothing new). */
interface KeywordMatchEvidence {
  ideaTitle: string
  ideaPrimaryKeyword: string
  normalizedPrimaryKeyword: string
  ideaSourceContext: string
  ideaSuggestedUrl: string | null
  rule: string
  matches: { source: string; original: string; status: string | null; detail: string }[]
}

interface Suggestion {
  id: string
  /** Persisted idea id (Phase 3F.3) — present when the idea is stored server-side. */
  ideaId?: string
  title: string
  primaryKeyword: string
  secondaryKeywords: string[]
  searchIntent: string
  recommendedWordCount: number
  angle: string
  suggestedInternalLinks: { url: string; anchor: string }[]
  source: Source
  suggestionReason: string
  suggestionScore: number
  /** Phase 3F.3.4a — why there are no suggested links (for a helpful message). */
  linkPreviewReason?: string
  /** Phase 3F.3.6 — URL of the best commercial destination (shown first, labelled). */
  moneyTargetUrl?: string | null
  /** Phase 4C — hybrid provenance: which providers support this idea. */
  supportingSources?: Source[]
  /** P0 — canonical role-aware link plan (roles rendered from here, never re-inferred). */
  linkPlan?: {
    primaryCommercialTarget: { url: string; title: string; pageType: string } | null
    secondaryCommercialTargets: { url: string; title: string; pageType: string }[]
    supportingInformationalLinks: { url: string; title: string; pageType: string }[]
    sourceReferences: { url: string; title: string; pageType: string }[]
  }
  /** P0 — recommended destination type; badge shown on the card. */
  recommendedPageType?: 'article' | 'commercial_landing_page' | 'category_page' | 'service_page' | 'product_page_improvement' | 'existing_page_improvement'
  /** This single idea was refined with the Pro model via "שפר עם Gemini Pro". */
  improvedWithPro?: boolean
}

export default function AutomationIdeas({
  proFirst = false,
  projectId,
  language,
  onCreated,
  onScheduled,
  onTopicsCreated,
  onPlansSaved,
  onApproved,
  planSavedHint = false,
  scrollCtaSignal = 0,
  queueSuccessSignal = null,
  onGoToQueue,
}: {
  projectId: string
  language: 'he' | 'en'
  onCreated: () => void
  onScheduled?: () => void
  // Phase 2F.1 — fires with the newly-created topics so the hub can offer the
  // internal-link planning step for exactly those new topic IDs.
  onTopicsCreated?: (topics: { id: string; topic: string; primary_keyword: string | null }[], uncheckedByTopicId?: Record<string, string[]>, selectedByTopicId?: Record<string, { url: string; anchor: string }[]>) => void
  // Phase 3F.3.2a — fires with per-topic saved planned-link counts (from idea-stage
  // selection) so the hub can seed the topic-row plan badge immediately.
  onPlansSaved?: (plans: { topicId: string; linkCount: number }[]) => void
  // Phase 3F.3.3 — fires after approval so the hub can scroll to the queue,
  // highlight the new rows, and show the "queued for scheduled creation" notice.
  onApproved?: (info: { topicIds: string[]; plansSaved: boolean }) => void
  // Phase 3F.3.3b — user asked to review/edit links before enqueue: the hub
  // scrolls to + highlights the approved rows (and hints at "Open link planning").
  onReviewLinks?: (topicIds: string[]) => void
  // Phase 3F.3.3e — a link plan was saved in the drawer: show a "now add to
  // queue" note in the CTA; a bumped scrollCtaSignal re-scrolls the CTA in view.
  planSavedHint?: boolean
  scrollCtaSignal?: number
  // Phase 3F.3.7i — bumped by the hub when an enqueue succeeds from the drawer/
  // review panel, so this section shows + scrolls its success box into view.
  queueSuccessSignal?: { n: number; count: number } | null
  // Phase 3H — "go to queue" button in the success box (scrolls the hub to the
  // publishing-schedule section). Only the button navigates — no auto-scroll.
  onGoToQueue?: () => void
  /** Stage D — server-derived (RECO_PRO_FIRST_CONTROLLER via isProFirstControllerEnabled).
   *  The SINGLE authoritative flag; when true the selector is hidden and no tier is sent. */
  proFirst?: boolean
}) {
  const t = getDashboardDictionary(language).contentHub.autoIdeas
  const isHebrew = language === 'he'
  // The exact per-topic queue payload to RETRY (links already saved; only the enqueue
  // step failed) — re-sent to the authoritative approve-and-queue route.
  const [lastQueueTopics, setLastQueueTopics] = useState<{ topicId: string; expectsLinks: boolean; recommendedPageType: string }[]>([])
  const [scheduling, setScheduling] = useState(false)
  // Which approve action is running (for per-button spinners): the one-click
  // queue action or the advanced review action. Phase 3F.3.5.
  const [busyAction, setBusyAction] = useState<'queue' | 'review' | null>(null)
  // Phase 3F.3.7g — prominent success confirmation after a successful enqueue.
  const [queueSuccess, setQueueSuccess] = useState<{ count: number; links: boolean } | null>(null)
  // Phase 3F.3.3a — the truthful "next step" CTA to scroll into view after approval.
  const ctaRef = useRef<HTMLDivElement | null>(null)
  // Phase 3F.3.7i — the enqueue success box scrolls itself into view here.
  const successRef = useRef<HTMLDivElement | null>(null)

  // Default to the most SEO-grounded source (real Google Ads keyword data).
  // Phase 4C — default to the combined "סריקה משולבת" source (still switchable to
  // any individual source). Selection only; nothing runs until the user clicks.
  const [source, setSource] = useState<Source>('hybrid')
  const [keyword, setKeyword] = useState('')
  // Model tier (Phase 2 — explicit, truthful): sent on EVERY generate request.
  // The selector is OPERATOR-facing (Preview / flag-gated); customers never see
  // model names or costs. The choice is remembered locally per operator.
  // QUALITY_SELECTOR_ENABLED now gates ONLY the operator model-path telemetry line;
  // the model selector itself is a production customer-facing control.
  const QUALITY_SELECTOR_ENABLED = process.env.NEXT_PUBLIC_RECO_QUALITY_SELECTOR === '1'
  // Stage D — the SINGLE authoritative flag comes from the SERVER (the `proFirst` prop,
  // derived from RECO_PRO_FIRST_CONTROLLER via isProFirstControllerEnabled), never from a
  // separate NEXT_PUBLIC var that could drift out of sync with the route. When true: the
  // Flash/Pro selector + all model/tier/fallback wording are hidden and no tier is sent.
  const PRO_FIRST = proFirst
  const [qualityMode, setQualityMode] = useState<'standard' | 'premium'>(() => {
    // Default to מהיר (standard). Remember the customer's explicit choice locally.
    if (typeof window === 'undefined') return 'standard'
    const saved = window.localStorage.getItem('reco-quality-mode')
    return saved === 'premium' || saved === 'standard' ? saved : 'standard'
  })
  const chooseQuality = (m: 'standard' | 'premium') => {
    setQualityMode(m)
    try { window.localStorage.setItem('reco-quality-mode', m) } catch { /* private mode */ }
  }
  // Preview-only truthfulness: the ACTUAL model path of the last run (never shown
  // to customers — present only when server diagnostics are enabled).
  const [modelPath, setModelPath] = useState<{ requestedTier: string; model: string | null; tierUsed: string; downgraded: boolean; downgradeReason: string | null } | null>(null)
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ideasExpanded, setIdeasExpanded] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [meta, setMeta] = useState<{ skippedDuplicates: number; finalCount: number; reason?: string; keywordResearchFailed?: boolean; newlyAdded: number; funnel?: { generated: number; corpusDuplicates: number; qualityFiltered: number; engineFiltered?: number; keywordExists: number; titleExists: number; coveredByExisting: number; hiddenOnLoad: number }; keywordMatches?: KeywordMatchEvidence[]; providers?: ProviderStatus[] } | null>(null)
  // Phase 3F.3 — persisted-ideas state: loaded on mount so ideas survive refresh.
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
  // Per-item "שפר עם Gemini Pro": the id currently being improved (spinner + disable).
  const [improvingId, setImprovingId] = useState<string | null>(null)
  // Phase 3F.3.2 — per-idea suggested-link selection (keyed by suggestion id →
  // set of selected link URLs). Undefined for an idea means "all checked".
  const [linkSel, setLinkSel] = useState<Record<string, Set<string>>>({})
  const isLinkChecked = (s: Suggestion, url: string) => { const set = linkSel[s.id]; return set ? set.has(url) : true }
  const toggleLink = (s: Suggestion, url: string) => {
    setLinkSel((prev) => {
      const current = prev[s.id] ?? new Set(s.suggestedInternalLinks.map((l) => l.url))
      const next = new Set(current)
      next.has(url) ? next.delete(url) : next.add(url)
      return { ...prev, [s.id]: next }
    })
  }
  const selectedLinksFor = (s: Suggestion) => s.suggestedInternalLinks.filter((l) => isLinkChecked(s, l.url))

  // Load the project's previously-saved PENDING ideas so they appear without the
  // user clicking generate again (survives page refresh). Best-effort/read-only.
  useEffect(() => {
    let cancelled = false
    setInitialLoaded(false); setSuggestions([]); setSelected(new Set()); setMeta(null); setMessage(null)
    ;(async () => {
      try {
        const res = await fetch(`/api/content/automation/topic-ideas?projectId=${encodeURIComponent(projectId)}`)
        const data = await res.json().catch(() => ({}))
        if (cancelled) return
        const list: Suggestion[] = Array.isArray(data.suggestions) ? data.suggestions : []
        if (list.length) setSuggestions(list)
      } catch { /* ignore — falls back to empty */ } finally {
        if (!cancelled) setInitialLoaded(true)
      }
    })()
    return () => { cancelled = true }
  }, [projectId])

  // Phase 3F.3.3e — "return to add to publishing queue" from the drawer bumps
  // this signal; bring the CTA back into view.
  useEffect(() => {
    if (scrollCtaSignal > 0) window.setTimeout(() => ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
  }, [scrollCtaSignal])

  // Phase 3F.3.7i — an enqueue from the drawer/review panel bumps this signal;
  // show the success box here so the confirmation lands on the Ideas section.
  useEffect(() => {
    if (queueSuccessSignal && queueSuccessSignal.n > 0) setQueueSuccess({ count: queueSuccessSignal.count, links: true })
  }, [queueSuccessSignal])

  // Phase 3F.3.7h/i — when the enqueue success box appears, scroll IT into view
  // (so the viewport lands on the Automatic Ideas section, not the schedule).
  // Phase 3H — keep it visible ~8s (still dismissible earlier via the ✕), with a
  // "go to queue" button as the only way to navigate to the schedule.
  useEffect(() => {
    if (!queueSuccess) return
    window.setTimeout(() => successRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 60)
    const id = window.setTimeout(() => setQueueSuccess(null), 8000)
    return () => window.clearTimeout(id)
  }, [queueSuccess])

  const sourceBadge = (s: Source) => (s === 'keyword' ? t.badgeKeyword : s === 'project_data' ? t.badgeProject : s === 'site_scan' ? t.badgeSiteScan : s === 'hybrid' ? t.badgeHybrid : t.badgeResearch)

  // Monotonic request id: only the latest generate() call is allowed to write
  // state, so a slow earlier response can never overwrite a newer one.
  const reqRef = useRef(0)
  // LIVE project scope (cross-project display-leak fix): the closure-captured
  // `projectId` inside generate() is frozen at click time, so comparing it to
  // itself can never detect a mid-flight project switch. This ref always holds
  // the CURRENT project; switching projects also invalidates in-flight requests.
  const currentProjectRef = useRef(projectId)
  useEffect(() => {
    if (currentProjectRef.current !== projectId) {
      currentProjectRef.current = projectId
      reqRef.current++ // any in-flight response for the previous project is stale
      setLoading(false)
    }
  }, [projectId])

  async function generate() {
    if (loading) return
    const reqId = ++reqRef.current
    // Capture the request scope at click time. The response must echo the SAME
    // projectId + clientRequestId or it is a stale response (e.g. the user switched
    // projects mid-flight) and must NOT update this project's list.
    const requestProjectId = projectId
    const clientRequestId = (globalThis.crypto?.randomUUID?.() ?? `${reqId}-${Date.now()}`)
    // Do NOT clear the current list up-front — "find more" keeps existing pending
    // ideas visible and the response returns the combined active pending set.
    setLoading(true); setMessage(null); setMeta(null); setQueueSuccess(null)
    try {
      const res = await fetch('/api/content/automation/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        // Stage D — when the Pro-first controller owns the flow the client sends NO
        // tier: the server always runs Pro-first and ignores any legacy tier field.
        body: JSON.stringify({ projectId: requestProjectId, source, keyword: keyword.trim(), clientRequestId, ...(PRO_FIRST ? {} : { qualityMode }) }),
      })
      const data = await res.json().catch(() => ({}))
      if (reqId !== reqRef.current) return // a newer request superseded this one
      // Hard scope check: reject a response bound to a different project / request.
      if (res.ok && ((data?.meta?.projectId && data.meta.projectId !== requestProjectId) ||
                     (data?.meta?.clientRequestId && data.meta.clientRequestId !== clientRequestId) ||
                     requestProjectId !== currentProjectRef.current)) {
        return // stale/cross-project response — discard, never write another project's list
      }
      if (!res.ok) {
        // keyword_required is a real validation error; anything else (5xx /
        // timeout / transient) must NOT read as "no ideas found".
        if (data?.error === 'keyword_required') {
          setMessage({ text: t.keywordPlaceholder, ok: false })
        } else if (data?.error === 'billing_exhausted' || data?.meta?.reason === 'billing_exhausted') {
          // HONEST billing state — never "try a broader keyword". No provider details.
          setMessage({ text: 'יתרת Gemini API הסתיימה ולכן הסריקה לא בוצעה. יש להוסיף קרדיט בחשבון Google AI Studio ולנסות שוב.', ok: false })
        } else if (data?.error === 'run_in_progress') {
          // A duplicate click while a run is active — silently ignore.
        } else {
          setMeta({ skippedDuplicates: 0, finalCount: 0, reason: 'http_error', newlyAdded: 0 })
        }
        return
      }
      const list: Suggestion[] = Array.isArray(data.suggestions) ? data.suggestions : []
      setSuggestions(list)
      // No auto-select: persisted ideas accumulate, so approval must be explicit
      // to avoid bulk-approving previously-seen ideas.
      setSelected(new Set())
      setMeta({
        skippedDuplicates: data.meta?.skippedDuplicates ?? 0,
        finalCount: data.meta?.finalCount ?? list.length,
        reason: data.meta?.reason,
        keywordResearchFailed: data.meta?.keywordResearchFailed,
        // This run's NEW additions (not the total pending). Falls back to legacy field.
        newlyAdded: typeof data.meta?.newlyAddedCount === 'number' ? data.meta.newlyAddedCount : (data.meta?.newlySaved ?? 0),
        // Phase 3I.3 — production funnel counts (why a run produced 0/few).
        funnel: data.meta?.funnel,
        // Phase 3I.6 — exact primary-keyword match evidence (zero-new runs).
        keywordMatches: Array.isArray(data.meta?.debug?.primaryKeywordMatches) ? data.meta.debug.primaryKeywordMatches : undefined,
        // Phase 4C — per-provider status for a hybrid run (partial-failure transparency).
        providers: Array.isArray(data.meta?.providers) ? data.meta.providers : undefined,
      })
      // TRUTHFUL model path (operator/Preview only — present only when server
      // diagnostics are enabled; customers never receive it).
      const mp = data.meta?.isolationDebug?.briefDiagnostics?.modelPath
      setModelPath(mp && typeof mp === 'object' ? mp : null)
    } catch {
      if (reqId !== reqRef.current) return
      setMeta({ skippedDuplicates: 0, finalCount: 0, reason: 'http_error', newlyAdded: 0 })
    } finally {
      if (reqId === reqRef.current) setLoading(false)
    }
  }

  function toggle(id: string) {
    setSelected((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id); else next.add(id)
      return next
    })
  }
  const selectAll = () => setSelected(new Set(suggestions.map((s) => s.id)))
  const clearSel = () => setSelected(new Set())

  // Durable reject: mark ideas rejected server-side so they don't come back, then
  // drop them from the active list. Best-effort — for non-persisted (table
  // missing) ideas the endpoint no-ops and we still remove them from the session.
  async function rejectIds(ids: string[]) {
    if (ids.length === 0) return
    const idSet = new Set(ids)
    try {
      await fetch('/api/content/automation/topic-ideas/reject', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ideaIds: ids }),
      })
    } catch { /* still remove locally */ }
    setSuggestions((prev) => prev.filter((s) => !idSet.has(s.id)))
    setSelected((prev) => { const next = new Set(prev); for (const id of ids) next.delete(id); return next })
  }

  async function rejectOne(id: string) {
    if (rejectingId) return
    setRejectingId(id)
    try { await rejectIds([id]) } finally { setRejectingId(null) }
  }

  // Per-item "שפר עם Gemini Pro": polish only THIS recommendation's wording with Pro
  // and mark it. The server preserves the keyword/intent/links/coverage; only the
  // title + reason may change. The item is never degraded (server keeps the original
  // wording if the polish is off-subject) and stays in place.
  async function improveOne(s: Suggestion) {
    const ideaId = s.ideaId ?? s.id
    if (improvingId || !ideaId) return
    setImprovingId(s.id); setMessage(null)
    try {
      const res = await fetch('/api/content/automation/topic-ideas/improve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, ideaId }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok || !data?.ok) {
        setMessage({ text: data?.reason === 'pro_model_unavailable' ? t.improveUnavailable : t.improveFailed, ok: false })
        return
      }
      if (data.changed === false) { setMessage({ text: t.improveNoChange, ok: true }); return }
      const updated = data.suggestion as Suggestion | undefined
      if (updated) {
        setSuggestions((prev) => prev.map((x) => (x.id === s.id ? { ...x, ...updated, id: s.id, improvedWithPro: true } : x)))
      }
    } catch {
      setMessage({ text: t.improveFailed, ok: false })
    } finally {
      setImprovingId(null)
    }
  }

  function rejectSelected() {
    void rejectIds(suggestions.filter((s) => selected.has(s.id)).map((s) => s.id))
  }

  // Phase 3F.3.7e — ONE resolution used by BOTH buttons. The SERVER is authoritative:
  // topics/bulk returns `resolvedTopics` (one per selected idea, in order) with the
  // created OR existing topic id, so the client never guesses duplicates. No idea is
  // removed here — the caller removes only after its action (enqueue / open panel)
  // has succeeded.
  type ReviewTopic = { id: string; topic: string; primary_keyword: string | null }
  type CreateResult = {
    topicsForAction: ReviewTopic[]
    resolvedIdeaIds: string[]
    unresolved: { title: string; reason: string }[]
    uncheckedByTopicId: Record<string, string[]>
    // Phase 3G.3 — the CHECKED idea-stage links per created topic, so the review
    // panel can seed/display them even if its fresh dry-run recomputes differently.
    selectedByTopicId: Record<string, { url: string; anchor: string }[]>
    // topicId → the idea ids that resolved to it (to remove ONLY successfully-queued ideas).
    ideaIdsByTopicId: Record<string, string[]>
    // topicId → the idea's recommendedPageType (passed to approve-and-queue).
    pageTypeByTopicId: Record<string, string>
    savedPlans: { topicId: string; linkCount: number }[]
    expectedPlans: number
  }
  async function createTopics(): Promise<CreateResult | null> {
    const chosen = suggestions.filter((s) => selected.has(s.id))
    if (chosen.length === 0) return null
    const expectedPlans = chosen.filter((s) => selectedLinksFor(s).length > 0).length
    // topics/bulk RESOLVES/creates topics only — it is NOT the authoritative link layer, so
    // the checked links are NOT sent here (they are persisted via the reviewed-snapshot
    // bulk-save contract below). This removes the old best-effort double-save.
    const chosenPayload = chosen.map((s) => ({ ...s }))
    const res = await fetch('/api/content/automation/topics/bulk', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, status: 'approved', topics: chosenPayload }),
    })
    const data = await res.json().catch(() => ({}))
    if (!res.ok) {
      setMessage({ text: data?.error === 'automation_migration_required' ? 'automation_migration_required' : (data?.error || 'error'), ok: false })
      return null
    }
    const savedPlans = Array.isArray(data.savedPlans)
      ? (data.savedPlans as unknown[]).map((p) => p as { topicId?: unknown; linkCount?: unknown }).filter((p) => typeof p.topicId === 'string' && typeof p.linkCount === 'number').map((p) => ({ topicId: p.topicId as string, linkCount: p.linkCount as number }))
      : []
    if (savedPlans.length) onPlansSaved?.(savedPlans)
    onCreated()

    const topicsForAction: ReviewTopic[] = []
    const resolvedIdeaIds: string[] = []
    const unresolved: { title: string; reason: string }[] = []
    const uncheckedByTopicId: Record<string, string[]> = {}
    const selectedByTopicId: Record<string, { url: string; anchor: string }[]> = {}
    const ideaIdsByTopicId: Record<string, string[]> = {}
    const pageTypeByTopicId: Record<string, string> = {}
    const seen = new Set<string>()
    const addResolved = (s: Suggestion, topicId: string, title: string, pk: string | null) => {
      if (!seen.has(topicId)) { seen.add(topicId); topicsForAction.push({ id: topicId, topic: title, primary_keyword: pk }) }
      resolvedIdeaIds.push(s.id)
      ;(ideaIdsByTopicId[topicId] ??= []).push(s.id)
      if (!pageTypeByTopicId[topicId]) pageTypeByTopicId[topicId] = s.recommendedPageType ?? 'article'
      const checkedLinks = selectedLinksFor(s)
      const checked = new Set(checkedLinks.map((l) => l.url))
      const unchecked = s.suggestedInternalLinks.filter((l) => !checked.has(l.url)).map((l) => l.url)
      if (unchecked.length && !uncheckedByTopicId[topicId]) uncheckedByTopicId[topicId] = unchecked
      if (checkedLinks.length && !selectedByTopicId[topicId]) selectedByTopicId[topicId] = checkedLinks.map((l) => ({ url: l.url, anchor: l.anchor }))
    }

    // AUTHORITATIVE path: map resolvedTopics[i] ↔ chosen[i] by INDEX (same order).
    const resolved: unknown[] = Array.isArray(data.resolvedTopics) ? data.resolvedTopics : []
    if (resolved.length > 0) {
      for (let i = 0; i < chosen.length; i++) {
        const s = chosen[i]!
        const r = resolved[i] as { topicId?: unknown; title?: unknown; primaryKeyword?: unknown; unresolvedReason?: unknown } | undefined
        if (r && typeof r.topicId === 'string' && r.topicId) {
          addResolved(s, r.topicId, typeof r.title === 'string' ? r.title : s.title, typeof r.primaryKeyword === 'string' ? r.primaryKeyword : s.primaryKeyword)
        } else {
          unresolved.push({ title: s.title, reason: r && typeof r.unresolvedReason === 'string' ? r.unresolvedReason : 'unresolved' })
        }
      }
    } else {
      // Fallback (older server without resolvedTopics): use created rows by keyword.
      const createdTopics: ReviewTopic[] = Array.isArray(data.topics)
        ? (data.topics as { id?: unknown; topic?: unknown; primary_keyword?: unknown }[])
            .filter((r): r is ReviewTopic => typeof r?.id === 'string')
            .map((r) => ({ id: r.id, topic: typeof r.topic === 'string' ? r.topic : '', primary_keyword: typeof r.primary_keyword === 'string' ? r.primary_keyword : null }))
        : []
      const byKw = new Map<string, ReviewTopic>()
      for (const ct of createdTopics) byKw.set((ct.primary_keyword || '').toLowerCase(), ct)
      for (const s of chosen) {
        const ct = byKw.get((s.primaryKeyword || '').toLowerCase())
        if (ct) addResolved(s, ct.id, ct.topic, ct.primary_keyword)
        else unresolved.push({ title: s.title, reason: 'unresolved' })
      }
    }
    return { topicsForAction, resolvedIdeaIds, unresolved, uncheckedByTopicId, selectedByTopicId, ideaIdsByTopicId, pageTypeByTopicId, savedPlans, expectedPlans }
  }

  // Remove the given idea ids from the visible list + selection (called ONLY after
  // the caller's next step succeeded).
  function removeChosenIdeas(ideaIds: string[]) {
    if (ideaIds.length === 0) return
    const set = new Set(ideaIds)
    setSuggestions((prev) => prev.filter((s) => !set.has(s.id)))
    setSelected((prev) => { const n = new Set(prev); for (const id of ideaIds) n.delete(id); return n })
  }

  // Ensure the project's pool exists (never flips an active pool to paused). Returns poolId.
  async function ensurePool(): Promise<string | null> {
    try {
      const gr = await fetch(`/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`)
      if (gr.ok) { const gd = await gr.json(); if (gd.pool?.id) return gd.pool.id as string }
    } catch { /* fall through to create */ }
    try {
      const pr = await fetch('/api/content/automation/pools', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, cadence: 'weekly', intervalDays: 7, isActive: false }),
      })
      if (pr.ok) { const pd = await pr.json(); return (pd.pool?.id ?? null) as string | null }
    } catch { /* ignore */ }
    return null
  }

  // Save the EXACT checked links for the given topics through the SAME reviewed-snapshot
  // bulk-save contract the drawer/panel use (GET plan snapshot → POST bulk-save approve:true).
  // The SERVER re-validates every link (idea-card URLs are never trusted); no force. Returns
  // the topic ids whose links FULLY persisted + approved, and typed failures.
  type LinkSaveOutcome = { okIds: Set<string>; failures: { topicId: string; reason: string }[]; hardReason: string | null }
  async function saveCheckedLinks(topicIds: string[], selectedByTopicId: Record<string, { url: string; anchor: string }[]>): Promise<LinkSaveOutcome> {
    const out: LinkSaveOutcome = { okIds: new Set(), failures: [], hardReason: null }
    if (topicIds.length === 0) return out
    const failAll = (reason: string) => { out.hardReason = reason; for (const id of topicIds) out.failures.push({ topicId: id, reason }); return out }
    // 1) current plan snapshot → the reviewed-snapshot identity.
    let reviewedSnapshot: { scannerVersion: string | null; scanCompletedAt: string | null } | undefined
    try {
      const gr = await fetch(`/api/content/automation/internal-links/plan?projectId=${encodeURIComponent(projectId)}&topicIds=${encodeURIComponent(topicIds.join(','))}`)
      const gd = await gr.json().catch(() => ({}))
      if (!gr.ok) return failAll(gd.cacheState === 'missing' ? 'no_cache' : 'plan_unavailable')
      reviewedSnapshot = { scannerVersion: typeof gd.scannerVersion === 'string' ? gd.scannerVersion : null, scanCompletedAt: typeof gd.scanCompletedAt === 'string' ? gd.scanCompletedAt : null }
    } catch { return failAll('plan_unavailable') }
    // 2) exact checked selection → bulk-save (approve + reviewedSnapshot).
    const selectedLinks = topicIds.flatMap((id) => (selectedByTopicId[id] ?? []).map((l) => ({ topicId: id, targetUrl: l.url, anchorText: l.anchor })))
    let data: { results?: unknown[]; reason?: string; cacheState?: string } = {}
    try {
      const sr = await fetch('/api/content/automation/internal-links/plan/bulk-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, topicIds, approve: true, selectedLinks, reviewedSnapshot }),
      })
      data = await sr.json().catch(() => ({}))
      if (!sr.ok) return failAll(data.reason === 'cache_changed_replan_required' ? 'cache_changed_replan_required' : data.cacheState === 'missing' ? 'no_cache' : 'link_plan_failed')
    } catch { return failAll('link_plan_failed') }
    // 3) TRUTHFUL per-topic success (pure, shared with tests).
    const results = (Array.isArray(data.results) ? data.results : []).filter((r): r is BulkSaveTopicResult => !!r && typeof (r as { topicId?: unknown }).topicId === 'string')
    const evln = evaluateLinkSave(topicIds, selectedByTopicId, { ok: true, results })
    for (const id of evln.okIds) out.okIds.add(id)
    out.failures.push(...evln.failures)
    return out
  }

  // Queue topics through the AUTHORITATIVE approve-and-queue route (which itself re-verifies a
  // saved plan exists for every expectsLinks topic). Returns the topics actually queued.
  type QueueTopic = { topicId: string; expectsLinks: boolean; recommendedPageType: string }
  async function queueTopicsAuthoritative(poolId: string, queue: QueueTopic[]): Promise<{ ok: boolean; queuedIds: Set<string>; linkPlanFailedIds: Set<string>; reason?: string }> {
    const queuedIds = new Set<string>(); const linkPlanFailedIds = new Set<string>()
    if (queue.length === 0) return { ok: false, queuedIds, linkPlanFailedIds, reason: 'no_topics' }
    try {
      const ir = await fetch(`/api/content/automation/pools/${poolId}/approve-and-queue`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topics: queue }),
      })
      const d = await ir.json().catch(() => ({}))
      if (!ir.ok && ir.status !== 207) return { ok: false, queuedIds, linkPlanFailedIds, reason: d.error || `queue_${ir.status}` }
      for (const r of (Array.isArray(d.results) ? d.results : []) as { topicId?: string; state?: string }[]) {
        if (!r || typeof r.topicId !== 'string') continue
        if (r.state === 'success' || r.state === 'already_queued') queuedIds.add(r.topicId)
        else if (r.state === 'link_plan_failed') linkPlanFailedIds.add(r.topicId)
      }
      return { ok: queuedIds.size > 0, queuedIds, linkPlanFailedIds }
    } catch { return { ok: false, queuedIds, linkPlanFailedIds, reason: 'network' } }
  }

  // PRIMARY (Phase 3F.3.5, rewired) — ONE authoritative persistence + queue path:
  //   topics/bulk (resolve topics) → GET plan snapshot → reviewed-snapshot bulk-save
  //   (approve) → approve-and-queue. A topic whose CHECKED links did not fully persist is
  //   NEVER queued. topics/bulk's best-effort savedPlans no longer decides anything.
  async function approveAndQueue() {
    if (creating) return
    setCreating(true); setBusyAction('queue'); setMessage(null); setQueueSuccess(null)
    try {
      const r = await createTopics()
      if (!r) return
      if (r.topicsForAction.length === 0) {
        // Could not resolve ANY selected idea to a topic — keep them visible. This is
        // the PRIMARY path, so it must NOT show the review-panel error.
        setMessage({ text: `${t.topicResolveFailed}${r.unresolved[0]?.reason ? ` (${r.unresolved[0].reason})` : ''}`, ok: false })
        return
      }
      const allIds = r.topicsForAction.map((tp) => tp.id)
      const { withLinks: withLinksIds, noLinks: noLinksIds } = partitionByCheckedLinks(allIds, r.selectedByTopicId)

      // 1) Save the CHECKED links authoritatively (reviewed-snapshot bulk-save, server revalidates).
      const save = await saveCheckedLinks(withLinksIds, r.selectedByTopicId)
      const failedLinkCount = save.failures.length

      // 2) Queue set = link-free topics (expectsLinks:false) + topics whose checked links FULLY
      //    persisted (expectsLinks:true). Topics with checked-but-unsaved links are excluded.
      const queue = buildQueueTopics(noLinksIds, [...save.okIds], r.pageTypeByTopicId)
      if (queue.length === 0) {
        // C — no topic could be queued (every checked-link topic failed to save; no link-free
        // topic). Show an error; NEVER "topics added"; keep the ideas visible.
        setLastQueueTopics([])
        const reason = save.hardReason ?? save.failures[0]?.reason ?? 'link_plan_failed'
        setMessage({ text: `${t.linkSaveAllFailed} (${reason})`, ok: false })
        return
      }

      // 3) Queue via the AUTHORITATIVE route (it re-verifies the saved plan for expectsLinks topics).
      const poolId = await ensurePool()
      if (!poolId) { setLastQueueTopics(queue); window.setTimeout(() => ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80); setMessage({ text: `${t.queueFailedRetry} (no_pool)`, ok: false }); return }
      const q = await queueTopicsAuthoritative(poolId, queue)
      if (q.queuedIds.size === 0) {
        // The queue step itself failed — links ARE saved; offer a retry of just the enqueue.
        setLastQueueTopics(queue)
        onApproved?.({ topicIds: queue.map((x) => x.topicId), plansSaved: save.okIds.size > 0 })
        window.setTimeout(() => ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
        setMessage({ text: `${t.queueFailedRetry}${q.reason ? ` (${q.reason})` : ''}`, ok: false })
        return
      }

      // 4) SUCCESS (full or partial). Remove ONLY the ideas whose topic actually queued.
      const queuedIdeaIds = allIds.filter((id) => q.queuedIds.has(id)).flatMap((id) => r.ideaIdsByTopicId[id] ?? [])
      removeChosenIdeas(queuedIdeaIds)
      setLastQueueTopics([])
      onApproved?.({ topicIds: [...q.queuedIds], plansSaved: save.okIds.size > 0 })
      setQueueSuccess({ count: q.queuedIds.size, links: save.okIds.size > 0 })
      if (failedLinkCount === 0) {
        setMessage(null) // A — everything saved + queued.
      } else {
        // B — exact counts + typed reason; a failed-link topic stays in the topics table.
        const reason = save.hardReason ?? save.failures[0]?.reason ?? 'link_plan_failed'
        setMessage({ text: t.queuePartial.replace('{queued}', String(q.queuedIds.size)).replace('{failed}', String(failedLinkCount)).replace('{reason}', reason), ok: false })
      }
      onScheduled?.()
    } catch {
      setMessage({ text: 'error', ok: false })
    } finally {
      setCreating(false); setBusyAction(null)
    }
  }

  // SECONDARY / advanced (Part E) — approve/resolve topics, then open the batch
  // review panel. Never enqueues here. Never shows "all duplicates" when any
  // selected idea resolves to a topic.
  async function approveAndReview() {
    if (creating) return
    setCreating(true); setBusyAction('review'); setMessage(null); setQueueSuccess(null)
    try {
      const r = await createTopics()
      if (!r) return
      if (r.topicsForAction.length > 0) {
        // Open the panel FIRST, then remove only the ideas that resolved.
        onTopicsCreated?.(r.topicsForAction, r.uncheckedByTopicId, r.selectedByTopicId)
        removeChosenIdeas(r.resolvedIdeaIds)
      } else {
        // Nothing resolvable at all — keep the ideas visible + a real error.
        setMessage({ text: `${t.reviewOpenFailed}${r.unresolved[0]?.reason ? ` (${r.unresolved[0].reason})` : ''}`, ok: false })
      }
    } catch {
      setMessage({ text: 'error', ok: false })
    } finally {
      setCreating(false); setBusyAction(null)
    }
  }

  // Retry the queue step for topics whose links ALREADY saved (only the enqueue failed) —
  // through the SAME authoritative approve-and-queue route.
  async function addCreatedToSchedule() {
    if (scheduling || lastQueueTopics.length === 0) return
    setScheduling(true); setMessage(null)
    try {
      const hadLinks = lastQueueTopics.some((x) => x.expectsLinks)
      const poolId = await ensurePool()
      if (!poolId) { setMessage({ text: `${t.queueFailedRetry} (no_pool)`, ok: false }); return }
      const q = await queueTopicsAuthoritative(poolId, lastQueueTopics)
      if (q.queuedIds.size > 0) {
        setLastQueueTopics([])
        setQueueSuccess({ count: q.queuedIds.size, links: hadLinks })
        setMessage(null)
        onScheduled?.()
      } else {
        setMessage({ text: `${t.queueFailedRetry}${q.reason ? ` (${q.reason})` : ''}`, ok: false })
      }
    } finally {
      setScheduling(false)
    }
  }

  // Phase 4C — hybrid first (combines all sources), then the individual sources
  // kept for advanced/manual use.
  const sourceTabs: { key: Source; label: string }[] = [
    { key: 'hybrid', label: t.sourceHybrid },
    { key: 'keyword_research_url', label: t.sourceResearch },
    { key: 'site_scan', label: t.sourceSiteScan },
    { key: 'keyword', label: t.sourceKeyword },
    { key: 'project_data', label: t.sourceProject },
  ]

  return (
    <Card className="hover:translate-y-0">
      <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">{t.intro}</p>

      {/* Onboarding / chronology block (Phase 3F.3.3a) — more visible, explains
          the two-step flow (approve → add to publishing queue). */}
      <div className="mb-4 rounded-xl border border-indigo-200 dark:border-indigo-500/30 bg-indigo-50/60 dark:bg-indigo-500/10 px-4 py-3">
        <div className="text-sm font-semibold text-indigo-800 dark:text-indigo-200">{t.onboardTitle}</div>
        <p className="mt-1 text-xs text-slate-600 dark:text-slate-300">{t.onboardBody}</p>
        <ol className="mt-2 grid gap-1 text-xs text-slate-600 dark:text-slate-300 sm:grid-cols-2">
          <li><span className="font-semibold text-indigo-700 dark:text-indigo-300">1.</span> {t.onboardStep1}</li>
          <li><span className="font-semibold text-indigo-700 dark:text-indigo-300">2.</span> {t.onboardStep2}</li>
          <li><span className="font-semibold text-indigo-700 dark:text-indigo-300">3.</span> {t.onboardStep3}</li>
          <li><span className="font-semibold text-indigo-700 dark:text-indigo-300">4.</span> {t.onboardStep4}</li>
          <li><span className="font-semibold text-indigo-700 dark:text-indigo-300">5.</span> {t.onboardStep5}</li>
        </ol>
        <p className="mt-2 text-[11px] text-slate-500 dark:text-slate-400">{t.onboardHelperNote}</p>
      </div>

      {/* Phase 3F.3.7g — prominent, dismissible success confirmation after enqueue. */}
      {queueSuccess && (
        <div ref={successRef} className="mb-4 rounded-xl border-2 border-emerald-300 dark:border-emerald-700 bg-emerald-50 dark:bg-emerald-900/20 px-4 py-3 scroll-mt-4">
          <div className="flex items-start gap-2">
            <span className="text-lg leading-none text-emerald-600 dark:text-emerald-400">✓</span>
            <div className="flex-1 min-w-0">
              <div className="text-sm font-semibold text-emerald-800 dark:text-emerald-200">{queueSuccess.count > 1 ? t.queueSuccessTitleMany : t.queueSuccessTitleOne}</div>
              <p className="mt-0.5 text-xs text-emerald-700/90 dark:text-emerald-300/90">{queueSuccess.count > 1 ? t.queueSuccessBodyMany : t.queueSuccessBodyOne}</p>
              {queueSuccess.links && <p className="mt-1 text-xs text-emerald-700/90 dark:text-emerald-300/90">{t.queueSuccessLinksNote}</p>}
              {onGoToQueue && (
                <div className="mt-2">
                  <Button size="sm" onClick={() => { setQueueSuccess(null); onGoToQueue() }}>{t.goToQueue}</Button>
                </div>
              )}
            </div>
            <button type="button" onClick={() => setQueueSuccess(null)} className="text-emerald-700/70 dark:text-emerald-300/70 hover:text-emerald-900 dark:hover:text-emerald-100 text-xs" aria-label={t.dismiss}>✕</button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {sourceTabs.map((s) => (
          <button
            key={s.key}
            type="button"
            onClick={() => setSource(s.key)}
            className={`text-xs font-medium rounded-full px-3 py-1.5 border ${
              source === s.key
                ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300'
                : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'
            }`}
          >
            {s.label}
          </button>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-2 mb-3">
        {source === 'keyword' && (
          <input
            type="text"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder={t.keywordPlaceholder}
            className="flex-1 min-w-[12rem] rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2.5 py-1.5 text-sm"
          />
        )}
        <Button onClick={generate} loading={loading} disabled={loading || (source === 'keyword' && !keyword.trim())}>
          {PRO_FIRST
            ? (loading ? 'יוצר המלצות…' : 'צור המלצות')
            : (loading ? (source === 'site_scan' ? t.siteScanAnalyzing : t.generating) : (suggestions.length > 0 ? t.findMore : t.generate))}
        </Button>
      </div>

      {/* PRODUCTION model selector — two clear options with a short explanation each.
          Default מהיר. No model names / tiers / costs here (telemetry lives in QA). The
          chosen tier is sent EXPLICITLY on every request; one tier per generation run.
          Stage D: HIDDEN entirely when the global Pro-first controller is active. */}
      {!PRO_FIRST && (
      <div className="mb-3" data-testid="reco-quality-selector">
        <span id="reco-quality-label" className="block text-[11px] font-medium text-slate-500 dark:text-slate-400 mb-1">{t.qualityChooseLabel}</span>
        <div role="radiogroup" aria-labelledby="reco-quality-label" className="grid grid-cols-1 sm:grid-cols-2 gap-2">
          {([
            { m: 'standard' as const, label: t.qualityFastLabel, desc: t.qualityFastDesc },
            { m: 'premium' as const, label: t.qualityProLabel, desc: t.qualityProDesc },
          ]).map(({ m, label, desc }) => (
            <button
              key={m}
              type="button"
              role="radio"
              aria-checked={qualityMode === m}
              aria-label={m === 'premium' ? `${label} — Gemini Pro` : `${label} — Gemini Flash`}
              onClick={() => chooseQuality(m)}
              disabled={loading}
              className={`text-start rounded-lg border px-3 py-2 transition-colors disabled:opacity-60 ${qualityMode === m
                ? 'border-indigo-400 bg-indigo-50 dark:border-indigo-500 dark:bg-indigo-950/50'
                : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'}`}
            >
              <span className={`flex items-center gap-1.5 text-sm font-medium ${qualityMode === m ? 'text-indigo-800 dark:text-indigo-200' : 'text-slate-700 dark:text-slate-200'}`}>
                <span className={`inline-block h-3.5 w-3.5 rounded-full border-2 ${qualityMode === m ? 'border-indigo-500 bg-indigo-500' : 'border-slate-300 dark:border-slate-600'}`} aria-hidden />
                {label}
              </span>
              <span className="mt-0.5 block text-[11px] leading-snug text-slate-500 dark:text-slate-400">{desc}</span>
            </button>
          ))}
        </div>
      </div>
      )}

      {/* Operator-only (flag-gated) model-path truthfulness — NEVER shown to customers.
          Model name / tier / downgrade state stay out of the normal UI (QA/admin only).
          Stage D: also hidden whenever the Pro-first controller is active. */}
      {modelPath && QUALITY_SELECTOR_ENABLED && !PRO_FIRST && !loading && (
        <p className={`text-[11px] mb-2 ${modelPath.downgraded ? 'text-amber-700 dark:text-amber-400' : 'text-slate-400 dark:text-slate-500'}`} data-testid="reco-model-path">
          {modelPath.downgraded
            ? t.qualityDowngraded.replace('{model}', String(modelPath.model ?? '—'))
            : t.qualityModelUsed.replace('{model}', String(modelPath.model ?? '—'))}
        </p>
      )}

      {message && (
        <p className={`text-xs mb-2 ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>
      )}
      {/* Accurate per-run summary: NEW additions this run vs TOTAL saved shown —
          never labels the total as "new". */}
      {meta && suggestions.length > 0 && (
        <p className="text-[11px] text-slate-500 dark:text-slate-400 mb-1">
          {t.runSummary.replace('{new}', String(meta.newlyAdded)).replace('{total}', String(suggestions.length))}
        </p>
      )}
      {/* Phase 4C — hybrid per-provider transparency: which sources ran, and a
          clear "X unavailable" for any that failed (the run never fails wholesale). */}
      {meta?.providers && meta.providers.length > 0 && !loading && (
        <p className="text-[11px] mb-2">
          {meta.providers.map((p, i) => (
            <span key={p.source} className={p.ok ? 'text-slate-500 dark:text-slate-400' : 'text-amber-700 dark:text-amber-400'}>
              {i > 0 && ' · '}
              {p.ok ? `${sourceBadge(p.source)}: ${p.count}` : t.hybridProviderUnavailable.replace('{s}', sourceBadge(p.source))}
            </span>
          ))}
        </p>
      )}
      {/* When this run added nothing new, explain WHY (existing keywords / all
          known / keyword-research exhausted) — total pending stays visible above. */}
      {meta && suggestions.length > 0 && meta.newlyAdded === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
          {meta.reason === 'kr_exhausted'
            ? t.krExhausted
            : meta.reason === 'covered_by_existing'
              ? t.coveredByExisting
              : meta.reason === 'primary_keyword_exists'
                // Phase 3I.7 — after a SUCCESSFUL site-scan run saved its ideas, a
                // repeat click hitting only known keywords is a normal state, not
                // a failure: point at the saved ideas + the real next actions.
                ? (source === 'site_scan' ? t.primaryKeywordExistsScan : t.primaryKeywordExists)
                : meta.reason === 'kr_all_known' || meta.reason === 'kr_no_new'
                  ? t.krNoNew
                  : meta.reason === 'all_known' || meta.reason === 'no_new'
                    ? t.allKnown
                    : t.noNewThisRun.replace('{total}', String(suggestions.length))}
        </p>
      )}
      {/* Nothing to show at all — helpful empty reason. */}
      {meta && suggestions.length === 0 && !loading && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
          {meta.reason === 'no_scan'
            ? t.noScan
            : meta.reason === 'insufficient_data'
              ? t.insufficientScan
              : meta.reason === 'covered_by_existing'
                ? t.coveredByExisting
                : meta.reason === 'all_quality_filtered'
                  ? t.qualityFiltered
                  : meta.reason === 'kr_unrelated'
                    ? t.krUnrelated
                    : meta.reason === 'kr_exhausted'
                      ? t.krExhausted
                      : meta.reason === 'kr_thin' || meta.reason === 'no_keyword_data'
                        ? t.krThin
                        : meta.reason === 'kr_all_known' || meta.reason === 'kr_no_new'
                          ? t.krNoNew
                        : meta.reason === 'primary_keyword_exists' && source === 'site_scan'
                          ? t.primaryKeywordExistsScan
                        : meta.reason === 'all_known' || meta.reason === 'no_new' || meta.reason === 'primary_keyword_exists'
                          ? t.allKnown
                          : meta.reason === 'model_error' || meta.reason === 'http_error'
                            ? t.temporaryError
                            : meta.keywordResearchFailed || meta.reason === 'keyword_research_failed'
                              ? t.researchFailed
                              : meta.reason === 'all_duplicates'
                                ? t.allDuplicates
                                : t.tryOther}
        </p>
      )}
      {/* Phase 3I.3/3I.4 — the exact funnel: where this run's candidates went.
          Shown for EVERY run that added nothing — INCLUDING generated=0 ("0
          נוצרו" is itself the answer: the blocker is the generator stage, not
          the filters). The old `generated > 0` gate hid the line in exactly
          that case. */}
      {meta?.funnel && meta.newlyAdded === 0 && !loading && (
        <p className="text-[11px] text-slate-400 dark:text-slate-500 mb-2">
          {t.funnelLine
            .replace('{g}', String(meta.funnel.generated))
            .replace('{e}', String(meta.funnel.engineFiltered ?? 0))
            .replace('{d}', String(meta.funnel.corpusDuplicates))
            .replace('{q}', String(meta.funnel.qualityFiltered))
            .replace('{k}', String(meta.funnel.keywordExists + meta.funnel.titleExists))
            .replace('{c}', String(meta.funnel.coveredByExisting))}
        </p>
      )}
      {/* Phase 3I.6 — EXACT match evidence for a zero-new run blocked on existing
          keywords: which existing row (source/status/keyword) killed each idea.
          Collapsible tech details; rendered only when the API returned evidence. */}
      {meta?.keywordMatches && meta.keywordMatches.length > 0 && meta.newlyAdded === 0 && !loading && (
        <details className="mb-2 rounded border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/40 px-2 py-1.5">
          <summary className="cursor-pointer text-[11px] font-medium text-slate-600 dark:text-slate-300">
            {t.kwMatchTitle.replace('{n}', String(meta.keywordMatches.length))}
          </summary>
          <ul className="mt-1.5 space-y-1.5">
            {meta.keywordMatches.map((m, i) => (
              <li key={i} className="text-[11px] leading-relaxed text-slate-600 dark:text-slate-400 border-t border-slate-200/70 dark:border-slate-700/70 pt-1.5 first:border-t-0 first:pt-0">
                <span className="font-medium text-slate-700 dark:text-slate-300">{m.ideaTitle}</span>
                {' · '}{t.kwMatchKeyword}: „{m.ideaPrimaryKeyword}”
                <br />
                {t.kwMatchBlockedBy}:{' '}
                {m.matches.map((x, j) => (
                  <span key={j}>
                    {j > 0 && ' · '}
                    {x.source === 'tracking_keyword' ? t.kwSrcTracking : x.source === 'topic_keyword' ? t.kwSrcTopic : x.source === 'idea_keyword' ? t.kwSrcIdea : t.kwSrcScan}
                    {' „'}{x.original}{'”'}
                    {x.status ? ` (${x.status})` : ''}
                    {x.detail ? ` — ${x.detail}` : ''}
                  </span>
                ))}
                {m.ideaSourceContext ? <><br /><span className="text-slate-500 dark:text-slate-500">{m.ideaSourceContext}</span></> : null}
              </li>
            ))}
          </ul>
        </details>
      )}
      {/* No saved ideas yet (fresh project / after clearing all) — calm prompt. */}
      {initialLoaded && !loading && !meta && suggestions.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t.noSavedIdeas}</p>
      )}
      {lastQueueTopics.length > 0 && (
        <div ref={ctaRef} className="mb-3 rounded-lg border-2 border-indigo-400 dark:border-indigo-500/60 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-3 scroll-mt-4">
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{t.ctaTitle}</p>
          <p className="mt-0.5 text-xs text-indigo-800/90 dark:text-indigo-200/90">{t.ctaBody}</p>
          {/* Link-status summary: none / some / all of the topics being queued. */}
          <p className="mt-1 text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
            {(() => { const withLinks = lastQueueTopics.filter((x) => x.expectsLinks).length; return withLinks === 0 ? t.linkSummaryNone : withLinks >= lastQueueTopics.length ? t.linkSummaryAll : t.linkSummaryMixed })()}
          </p>
          {planSavedHint && (
            <p className="mt-1 text-[11px] font-medium text-emerald-700 dark:text-emerald-300">{t.planSavedNote}</p>
          )}
          {/* Phase 3F.3.6 (Part F/H) — the ONLY action here is add-to-queue. The
              review flow already ran on the first click; a duplicate "review/edit
              links" button is intentionally NOT rendered. */}
          <p className="mt-1 text-[11px] text-indigo-800/80 dark:text-indigo-200/80">{t.reviewEditHelper}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Button onClick={addCreatedToSchedule} loading={scheduling} disabled={scheduling}>{t.addToSchedule}</Button>
          </div>
        </div>
      )}

      {suggestions.length === 0 && !loading ? (
        null
      ) : (
        <>
          {/* Part F — one clear instruction: pick topics, optionally check links,
              then one primary button adds them straight to the publishing queue. */}
          <p className="text-xs text-slate-600 dark:text-slate-300 mb-2">{t.approveQueueHelper}</p>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Button size="sm" variant="ghost" onClick={selectAll} disabled={creating}>{t.selectAll}</Button>
            <Button size="sm" variant="ghost" onClick={clearSel} disabled={creating}>{t.clear}</Button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={rejectSelected} disabled={selected.size === 0 || creating}>{t.rejectSelected}</Button>
          </div>
          <div className="flex flex-wrap items-center gap-2 mb-1">
            {/* PRIMARY — approve + save links + enqueue in one click. */}
            <Button onClick={approveAndQueue} loading={creating && busyAction === 'queue'} disabled={creating || selected.size === 0}>
              {creating && busyAction === 'queue' ? t.creating : `${t.approveAndQueue}${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </Button>
            {/* SECONDARY — advanced review/edit before adding. */}
            <Button variant="outline" onClick={approveAndReview} loading={creating && busyAction === 'review'} disabled={creating || selected.size === 0}>
              {creating && busyAction === 'review' ? t.creating : t.reviewEditBeforeBtn}
            </Button>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">{t.linksOptionalNote}</p>

          <div className="space-y-2">
            {(ideasExpanded ? suggestions : suggestions.slice(0, 3)).map((s) => (
              <div key={s.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                <label className="flex items-start gap-2">
                  <input type="checkbox" checked={selected.has(s.id)} onChange={() => toggle(s.id)} className="mt-1 h-4 w-4 accent-indigo-600" />
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100">{s.title}</span>
                      {/* Per-item "improved with Pro" marker (survives reload). */}
                      {s.improvedWithPro && (
                        <Badge variant="success" data-testid="reco-improved-badge">{t.improvedWithProBadge}</Badge>
                      )}
                      {/* P0 — recommended destination type (visible, survives reload). */}
                      {s.recommendedPageType && (
                        <Badge variant={s.recommendedPageType === 'article' ? 'default' : 'warning'}>
                          {s.recommendedPageType === 'article' ? t.pageTypeArticle
                            : s.recommendedPageType === 'commercial_landing_page' ? t.pageTypeCommercialLanding
                              : s.recommendedPageType === 'category_page' ? t.pageTypeCategory
                                : s.recommendedPageType === 'service_page' ? t.pageTypeService
                                  : s.recommendedPageType === 'existing_page_improvement' ? t.pageTypeExistingImprovement
                                    : t.pageTypeProductImprovement}
                        </Badge>
                      )}
                      {/* Phase 4C — hybrid provenance: show each supporting source
                          as a badge + a count when >1 (multi-source agreement). */}
                      {s.supportingSources && s.supportingSources.length > 0 ? (
                        <>
                          {s.supportingSources.map((ss) => (
                            <Badge key={ss} variant="success">{sourceBadge(ss)}</Badge>
                          ))}
                          {s.supportingSources.length > 1 && (
                            <span className="text-[10px] font-medium text-emerald-700 dark:text-emerald-400">{t.hybridSupportedBy.replace('{n}', String(s.supportingSources.length))}</span>
                          )}
                        </>
                      ) : (
                        <Badge variant="neutral">{sourceBadge(s.source)}</Badge>
                      )}
                      {typeof s.suggestionScore === 'number' && (
                        <span className="text-[10px] text-slate-400">{Math.round(s.suggestionScore * 100)}%</span>
                      )}
                      <span className="ms-auto flex items-center gap-2">
                        {/* Optional per-item Pro polish — refines only this item's wording. */}
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); improveOne(s) }}
                          disabled={improvingId === s.id || !!improvingId}
                          data-testid="reco-improve-one"
                          className="text-[11px] font-medium text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 disabled:opacity-50"
                        >
                          {improvingId === s.id ? t.improvingWithPro : t.improveWithPro}
                        </button>
                        <button
                          type="button"
                          onClick={(e) => { e.preventDefault(); rejectOne(s.id) }}
                          disabled={rejectingId === s.id}
                          className="text-[11px] text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                        >
                          {rejectingId === s.id ? t.rejecting : t.reject}
                        </button>
                      </span>
                    </div>
                    <div className="text-[11px] text-slate-600 dark:text-slate-300 mt-1">
                      {t.keywordLabel}: <span className="font-medium">{s.primaryKeyword}</span>
                      {s.searchIntent ? <> · {t.intentLabel}: {s.searchIntent}</> : null}
                    </div>
                    {s.secondaryKeywords.length > 0 && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.secondaryLabel}: {s.secondaryKeywords.join(' · ')}</div>
                    )}
                    {s.suggestionReason && (
                      <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">{t.reasonLabel}: {s.suggestionReason}</div>
                    )}
                    {s.suggestedInternalLinks.length > 0 && (() => {
                      // P0 — render role sections from the CANONICAL linkPlan (roles are
                      // NEVER re-inferred here). Fallback to the legacy money/supporting
                      // split for old rows without a link_plan.
                      const linkRow = (l: { url: string; anchor: string }) => (
                        <label key={l.url} className="flex items-start gap-1.5 text-[11px] cursor-pointer">
                          <input type="checkbox" checked={isLinkChecked(s, l.url)} onChange={() => toggleLink(s, l.url)} className="mt-0.5 h-3.5 w-3.5 accent-indigo-600" />
                          <span className="text-slate-600 dark:text-slate-300 break-words">{l.anchor || l.url}</span>
                        </label>
                      )
                      const asRow = (x: { url: string; title: string }) => linkRow({ url: x.url, anchor: x.title })
                      const lp = s.linkPlan
                      const section = (label: string, items: { url: string; title: string }[], cls: string) => items.length > 0 && (
                        <div className="mt-1.5">
                          <div className={`text-[10px] font-semibold ${cls}`}>{label}</div>
                          <div className="mt-0.5 space-y-0.5">{items.map(asRow)}</div>
                        </div>
                      )
                      return (
                        <div className="mt-1" dir={isHebrew ? 'rtl' : 'ltr'}>
                          <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{t.internalLinksLabel}</div>
                          {lp ? (
                            <>
                              {lp.primaryCommercialTarget
                                ? <div className="mt-1">
                                    <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{t.primaryCommercialLink}</div>
                                    <div className="mt-0.5">{asRow(lp.primaryCommercialTarget)}</div>
                                  </div>
                                : <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">{t.noMoneyTargetNote}</p>}
                              {section(t.secondaryCommercialLinks, lp.secondaryCommercialTargets, 'text-teal-700 dark:text-teal-300')}
                              {section(t.supportingLinks, lp.supportingInformationalLinks, 'text-slate-500 dark:text-slate-400')}
                              {section(t.sourceReferencesLabel, lp.sourceReferences, 'text-slate-400 dark:text-slate-500')}
                            </>
                          ) : (() => {
                            const money = s.moneyTargetUrl ? s.suggestedInternalLinks.find((l) => l.url === s.moneyTargetUrl) : null
                            const supporting = s.suggestedInternalLinks.filter((l) => !money || l.url !== money.url)
                            return (<>
                              {money
                                ? <div className="mt-1"><div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{t.primaryCommercialLink}</div><div className="mt-0.5">{linkRow(money)}</div></div>
                                : <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">{t.noMoneyTargetNote}</p>}
                              {supporting.length > 0 && <div className="mt-1.5"><div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t.supportingLinks}</div><div className="mt-0.5 space-y-0.5">{supporting.map(linkRow)}</div></div>}
                            </>)
                          })()}
                          <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{t.linksSelectHint}</p>
                        </div>
                      )
                    })()}
                    {s.suggestedInternalLinks.length === 0 && (
                      <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">
                        {s.linkPreviewReason === 'low_confidence_only' ? t.linkReasonLowConf
                          : s.linkPreviewReason === 'stale_index' ? t.linkReasonStale
                            : (s.linkPreviewReason === 'valid_no_match' || s.linkPreviewReason === 'target_type_gap' || s.linkPreviewReason === 'already_linked_or_duplicate') ? t.noPreciseLink
                              : t.linksNoneHint}
                      </div>
                    )}
                  </div>
                </label>
              </div>
            ))}
            {suggestions.length > 3 && (
              <div className="pt-1">
                <button
                  type="button"
                  onClick={() => setIdeasExpanded((v) => !v)}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-500/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                  {ideasExpanded ? t.showLess : `${t.showMoreIdeas} (${suggestions.length - 3})`}
                </button>
              </div>
            )}
          </div>

          <p className="text-[11px] text-slate-400 mt-3">{t.nextStepHint}</p>
        </>
      )}
    </Card>
  )
}
