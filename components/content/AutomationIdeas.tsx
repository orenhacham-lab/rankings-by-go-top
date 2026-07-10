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

type Source = 'keyword' | 'project_data' | 'keyword_research_url' | 'site_scan'

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
}

export default function AutomationIdeas({
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
}) {
  const t = getDashboardDictionary(language).contentHub.autoIdeas
  const isHebrew = language === 'he'
  const [lastCreatedIds, setLastCreatedIds] = useState<string[]>([])
  // How many of the just-created topics got a saved link plan (for the CTA
  // link-status summary: none / some / all).
  const [lastPlansCount, setLastPlansCount] = useState(0)
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
  const [source, setSource] = useState<Source>('keyword_research_url')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ideasExpanded, setIdeasExpanded] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [meta, setMeta] = useState<{ skippedDuplicates: number; finalCount: number; reason?: string; keywordResearchFailed?: boolean; newlyAdded: number; funnel?: { generated: number; corpusDuplicates: number; qualityFiltered: number; keywordExists: number; titleExists: number; coveredByExisting: number; hiddenOnLoad: number } } | null>(null)
  // Phase 3F.3 — persisted-ideas state: loaded on mount so ideas survive refresh.
  const [initialLoaded, setInitialLoaded] = useState(false)
  const [rejectingId, setRejectingId] = useState<string | null>(null)
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

  const sourceBadge = (s: Source) => (s === 'keyword' ? t.badgeKeyword : s === 'project_data' ? t.badgeProject : s === 'site_scan' ? t.badgeSiteScan : t.badgeResearch)

  // Monotonic request id: only the latest generate() call is allowed to write
  // state, so a slow earlier response can never overwrite a newer one.
  const reqRef = useRef(0)

  async function generate() {
    if (loading) return
    const reqId = ++reqRef.current
    // Do NOT clear the current list up-front — "find more" keeps existing pending
    // ideas visible and the response returns the combined active pending set.
    setLoading(true); setMessage(null); setMeta(null); setQueueSuccess(null)
    try {
      const res = await fetch('/api/content/automation/recommendations', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, source, keyword: keyword.trim() }),
      })
      const data = await res.json().catch(() => ({}))
      if (reqId !== reqRef.current) return // a newer request superseded this one
      if (!res.ok) {
        // keyword_required is a real validation error; anything else (5xx /
        // timeout / transient) must NOT read as "no ideas found".
        if (data?.error === 'keyword_required') {
          setMessage({ text: t.keywordPlaceholder, ok: false })
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
      })
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
    savedPlans: { topicId: string; linkCount: number }[]
    expectedPlans: number
  }
  async function createTopics(): Promise<CreateResult | null> {
    const chosen = suggestions.filter((s) => selected.has(s.id))
    if (chosen.length === 0) return null
    const expectedPlans = chosen.filter((s) => selectedLinksFor(s).length > 0).length
    const chosenPayload = chosen.map((s) => ({ ...s, selectedLinks: selectedLinksFor(s) }))
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
    setLastPlansCount(savedPlans.length)
    onCreated()

    const topicsForAction: ReviewTopic[] = []
    const resolvedIdeaIds: string[] = []
    const unresolved: { title: string; reason: string }[] = []
    const uncheckedByTopicId: Record<string, string[]> = {}
    const selectedByTopicId: Record<string, { url: string; anchor: string }[]> = {}
    const seen = new Set<string>()
    const addResolved = (s: Suggestion, topicId: string, title: string, pk: string | null) => {
      if (!seen.has(topicId)) { seen.add(topicId); topicsForAction.push({ id: topicId, topic: title, primary_keyword: pk }) }
      resolvedIdeaIds.push(s.id)
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
    return { topicsForAction, resolvedIdeaIds, unresolved, uncheckedByTopicId, selectedByTopicId, savedPlans, expectedPlans }
  }

  // Remove the given idea ids from the visible list + selection (called ONLY after
  // the caller's next step succeeded).
  function removeChosenIdeas(ideaIds: string[]) {
    if (ideaIds.length === 0) return
    const set = new Set(ideaIds)
    setSuggestions((prev) => prev.filter((s) => !set.has(s.id)))
    setSelected((prev) => { const n = new Set(prev); for (const id of ideaIds) n.delete(id); return n })
  }

  // Ensure the project's pool exists (never flips an active pool to paused) and add
  // the given approved topics to its publishing queue. TRUTHFUL: success only when
  // something was actually queued (or was already queued); otherwise a reason.
  async function enqueueTopics(ids: string[]): Promise<{ ok: boolean; reason?: string }> {
    if (ids.length === 0) return { ok: false, reason: 'no_topics' }
    try {
      let poolId: string | null = null
      try {
        const gr = await fetch(`/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`)
        if (gr.ok) { const gd = await gr.json(); poolId = gd.pool?.id ?? null }
      } catch { /* fall through to create */ }
      if (!poolId) {
        const pr = await fetch('/api/content/automation/pools', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, cadence: 'weekly', intervalDays: 7, isActive: false }),
        })
        if (!pr.ok) { const d = await pr.json().catch(() => ({})); return { ok: false, reason: d.error || `pool_${pr.status}` } }
        const pd = await pr.json()
        poolId = pd.pool?.id ?? null
      }
      if (!poolId) return { ok: false, reason: 'no_pool' }
      const ir = await fetch(`/api/content/automation/pools/${poolId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicIds: ids }),
      })
      if (!ir.ok) { const d = await ir.json().catch(() => ({})); return { ok: false, reason: d.error || `items_${ir.status}` } }
      const d = await ir.json().catch(() => ({}))
      const added = typeof d.added === 'number' ? d.added : 0
      const alreadyQueued = Array.isArray(d.alreadyQueued) ? d.alreadyQueued.length : 0
      const notApproved = Array.isArray(d.notApproved) ? d.notApproved.length : 0
      if (added > 0 || alreadyQueued > 0) return { ok: true }
      if (notApproved > 0) return { ok: false, reason: 'topics_not_approved' }
      return { ok: false, reason: 'nothing_queued' }
    } catch {
      return { ok: false, reason: 'network' }
    }
  }

  // PRIMARY (Phase 3F.3.5) — approve + save checked links + add to the publishing
  // queue in ONE action. No intermediate CTA / planner unless enqueue fails.
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
      // Enqueue the EXACT resolved topics (newly created + existing duplicates).
      const ids = r.topicsForAction.map((tp) => tp.id)
      const enq = await enqueueTopics(ids)
      if (!enq.ok) {
        // FAILURE — do NOT remove/hide the ideas. Show the exact reason + a clear
        // retry CTA (adds the same resolved topics to the queue).
        setLastCreatedIds(ids)
        onApproved?.({ topicIds: ids, plansSaved: r.savedPlans.length > 0 })
        window.setTimeout(() => ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
        setMessage({ text: `${t.queueFailedRetry}${enq.reason ? ` (${enq.reason})` : ''}`, ok: false })
        return
      }
      // SUCCESS — only now remove the ideas + show the prominent success box + refresh.
      removeChosenIdeas(r.resolvedIdeaIds)
      const partial = r.expectedPlans > 0 && r.savedPlans.length < r.expectedPlans
      setLastCreatedIds([]); setLastPlansCount(0)
      setQueueSuccess({ count: ids.length, links: r.savedPlans.length > 0 })
      // Keep only the amber partial-save warning as an inline note; the prominent
      // green box carries the success confirmation.
      setMessage(partial ? { text: t.linkSavePartialWarn, ok: false } : null)
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

  // Add the already-created (review-path or enqueue-failed) topics to the queue.
  async function addCreatedToSchedule() {
    if (scheduling || lastCreatedIds.length === 0) return
    setScheduling(true); setMessage(null)
    try {
      const count = lastCreatedIds.length
      const hadLinks = lastPlansCount > 0
      const enq = await enqueueTopics(lastCreatedIds)
      if (enq.ok) {
        setLastCreatedIds([]); setLastPlansCount(0)
        setQueueSuccess({ count, links: hadLinks })
        setMessage(null)
        onScheduled?.()
      } else {
        setMessage({ text: `${t.queueFailedRetry}${enq.reason ? ` (${enq.reason})` : ''}`, ok: false })
      }
    } finally {
      setScheduling(false)
    }
  }

  // Strongest SEO source first (site keyword research), then keyword, then project data.
  const sourceTabs: { key: Source; label: string }[] = [
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
          {loading ? (source === 'site_scan' ? t.siteScanAnalyzing : t.generating) : (suggestions.length > 0 ? t.findMore : t.generate)}
        </Button>
      </div>

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
      {/* When this run added nothing new, explain WHY (existing keywords / all
          known / keyword-research exhausted) — total pending stays visible above. */}
      {meta && suggestions.length > 0 && meta.newlyAdded === 0 && (
        <p className="text-xs text-amber-700 dark:text-amber-400 mb-2">
          {meta.reason === 'kr_exhausted'
            ? t.krExhausted
            : meta.reason === 'covered_by_existing'
              ? t.coveredByExisting
              : meta.reason === 'primary_keyword_exists'
                ? t.primaryKeywordExists
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
            .replace('{d}', String(meta.funnel.corpusDuplicates))
            .replace('{q}', String(meta.funnel.qualityFiltered))
            .replace('{k}', String(meta.funnel.keywordExists + meta.funnel.titleExists))
            .replace('{c}', String(meta.funnel.coveredByExisting))}
        </p>
      )}
      {/* No saved ideas yet (fresh project / after clearing all) — calm prompt. */}
      {initialLoaded && !loading && !meta && suggestions.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t.noSavedIdeas}</p>
      )}
      {lastCreatedIds.length > 0 && (
        <div ref={ctaRef} className="mb-3 rounded-lg border-2 border-indigo-400 dark:border-indigo-500/60 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-3 scroll-mt-4">
          <p className="text-sm font-semibold text-indigo-900 dark:text-indigo-100">{t.ctaTitle}</p>
          <p className="mt-0.5 text-xs text-indigo-800/90 dark:text-indigo-200/90">{t.ctaBody}</p>
          {/* Link-status summary: none / some / all of the approved topics. */}
          <p className="mt-1 text-[11px] text-indigo-700/80 dark:text-indigo-300/80">
            {lastPlansCount === 0 ? t.linkSummaryNone : lastPlansCount >= lastCreatedIds.length ? t.linkSummaryAll : t.linkSummaryMixed}
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
                      <Badge variant="neutral">{sourceBadge(s.source)}</Badge>
                      {typeof s.suggestionScore === 'number' && (
                        <span className="text-[10px] text-slate-400">{Math.round(s.suggestionScore * 100)}%</span>
                      )}
                      <button
                        type="button"
                        onClick={(e) => { e.preventDefault(); rejectOne(s.id) }}
                        disabled={rejectingId === s.id}
                        className="ms-auto text-[11px] text-slate-400 hover:text-red-600 dark:hover:text-red-400 disabled:opacity-50"
                      >
                        {rejectingId === s.id ? t.rejecting : t.reject}
                      </button>
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
                      // Phase 3F.3.6 — split into the PRIMARY commercial link (money
                      // target) and SUPPORTING links, each with its own heading.
                      const money = s.moneyTargetUrl ? s.suggestedInternalLinks.find((l) => l.url === s.moneyTargetUrl) : null
                      const supporting = s.suggestedInternalLinks.filter((l) => !money || l.url !== money.url)
                      const linkRow = (l: { url: string; anchor: string }) => (
                        <label key={l.url} className="flex items-start gap-1.5 text-[11px] cursor-pointer">
                          <input type="checkbox" checked={isLinkChecked(s, l.url)} onChange={() => toggleLink(s, l.url)} className="mt-0.5 h-3.5 w-3.5 accent-indigo-600" />
                          <span className="text-slate-600 dark:text-slate-300 break-words">{l.anchor || l.url}</span>
                        </label>
                      )
                      return (
                        <div className="mt-1" dir={isHebrew ? 'rtl' : 'ltr'}>
                          <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{t.internalLinksLabel}</div>
                          {money ? (
                            <div className="mt-1">
                              <div className="text-[10px] font-semibold text-emerald-700 dark:text-emerald-300">{t.primaryCommercialLink}</div>
                              <div className="mt-0.5">{linkRow(money)}</div>
                            </div>
                          ) : (
                            <p className="mt-0.5 text-[10px] text-amber-700 dark:text-amber-400">{t.noMoneyTargetNote}</p>
                          )}
                          {supporting.length > 0 && (
                            <div className="mt-1.5">
                              <div className="text-[10px] font-semibold text-slate-500 dark:text-slate-400">{t.supportingLinks}</div>
                              <div className="mt-0.5 space-y-0.5">{supporting.map(linkRow)}</div>
                            </div>
                          )}
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
