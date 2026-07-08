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
}

export default function AutomationIdeas({
  projectId,
  language,
  onCreated,
  onScheduled,
  onTopicsCreated,
  onPlansSaved,
  onApproved,
}: {
  projectId: string
  language: 'he' | 'en'
  onCreated: () => void
  onScheduled?: () => void
  // Phase 2F.1 — fires with the newly-created topics so the hub can offer the
  // internal-link planning step for exactly those new topic IDs.
  onTopicsCreated?: (topics: { id: string; topic: string; primary_keyword: string | null }[]) => void
  // Phase 3F.3.2a — fires with per-topic saved planned-link counts (from idea-stage
  // selection) so the hub can seed the topic-row plan badge immediately.
  onPlansSaved?: (plans: { topicId: string; linkCount: number }[]) => void
  // Phase 3F.3.3 — fires after approval so the hub can scroll to the queue,
  // highlight the new rows, and show the "queued for scheduled creation" notice.
  onApproved?: (info: { topicIds: string[]; plansSaved: boolean }) => void
}) {
  const t = getDashboardDictionary(language).contentHub.autoIdeas
  const isHebrew = language === 'he'
  const [lastCreatedIds, setLastCreatedIds] = useState<string[]>([])
  const [lastLinksSaved, setLastLinksSaved] = useState(false)
  const [scheduling, setScheduling] = useState(false)
  // Phase 3F.3.3a — the truthful "next step" CTA to scroll into view after approval.
  const ctaRef = useRef<HTMLDivElement | null>(null)

  // Default to the most SEO-grounded source (real Google Ads keyword data).
  const [source, setSource] = useState<Source>('keyword_research_url')
  const [keyword, setKeyword] = useState('')
  const [loading, setLoading] = useState(false)
  const [creating, setCreating] = useState(false)
  const [suggestions, setSuggestions] = useState<Suggestion[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [ideasExpanded, setIdeasExpanded] = useState(false)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  const [meta, setMeta] = useState<{ skippedDuplicates: number; finalCount: number; reason?: string; keywordResearchFailed?: boolean; newlyAdded: number } | null>(null)
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

  const sourceBadge = (s: Source) => (s === 'keyword' ? t.badgeKeyword : s === 'project_data' ? t.badgeProject : s === 'site_scan' ? t.badgeSiteScan : t.badgeResearch)

  // Monotonic request id: only the latest generate() call is allowed to write
  // state, so a slow earlier response can never overwrite a newer one.
  const reqRef = useRef(0)

  async function generate() {
    if (loading) return
    const reqId = ++reqRef.current
    // Do NOT clear the current list up-front — "find more" keeps existing pending
    // ideas visible and the response returns the combined active pending set.
    setLoading(true); setMessage(null); setMeta(null)
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

  async function approveSelected() {
    if (creating) return
    const chosen = suggestions.filter((s) => selected.has(s.id))
    if (chosen.length === 0) return
    // Phase 3F.3.2 — attach each idea's CHECKED suggested links so they become the
    // new topic's planned link set (server re-validates; unchecked are omitted).
    const chosenPayload = chosen.map((s) => ({ ...s, selectedLinks: selectedLinksFor(s) }))
    setCreating(true); setMessage(null)
    try {
      const res = await fetch('/api/content/automation/topics/bulk', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, status: 'approved', topics: chosenPayload }),
      })
      const data = await res.json()
      if (!res.ok) {
        setMessage({ text: data?.error === 'automation_migration_required' ? 'automation_migration_required' : (data?.error || 'error'), ok: false })
        return
      }
      const created = data.created ?? 0
      // Truthful: topics are APPROVED and now in the ready list — NOT yet in the
      // automatic publishing queue (that's the explicit next-step CTA below).
      setMessage({ text: t.approvedReady, ok: true })
      // Remove the created ones from the list and refresh the topics table.
      setSuggestions((prev) => prev.filter((s) => !selected.has(s.id)))
      setSelected(new Set())
      setLastCreatedIds(Array.isArray(data.ids) ? data.ids : [])
      const createdTopics = Array.isArray(data.topics)
        ? (data.topics as { id?: unknown; topic?: unknown; primary_keyword?: unknown }[])
            .filter((r): r is { id: string; topic: string; primary_keyword: string | null } => typeof r?.id === 'string')
            .map((r) => ({ id: r.id, topic: typeof r.topic === 'string' ? r.topic : '', primary_keyword: typeof r.primary_keyword === 'string' ? r.primary_keyword : null }))
        : []
      // Phase 3F.3.2 — topics whose idea-stage selected links were already saved as
      // a plan skip the planning panel (avoids re-selection / clobbering it); the
      // rest still open the panel as before.
      const plannedIds = new Set(Array.isArray(data.plannedTopicIds) ? (data.plannedTopicIds as unknown[]).filter((x): x is string => typeof x === 'string') : [])
      const needPlanning = createdTopics.filter((tp) => !plannedIds.has(tp.id))
      if (needPlanning.length) onTopicsCreated?.(needPlanning)
      // Seed the topic-row plan badge so saved idea-stage links show immediately
      // (not 0) even though the planning panel was skipped for those topics.
      const savedPlans = Array.isArray(data.savedPlans)
        ? (data.savedPlans as unknown[]).map((p) => p as { topicId?: unknown; linkCount?: unknown }).filter((p) => typeof p.topicId === 'string' && typeof p.linkCount === 'number').map((p) => ({ topicId: p.topicId as string, linkCount: p.linkCount as number }))
        : []
      if (savedPlans.length) onPlansSaved?.(savedPlans)
      setLastLinksSaved(savedPlans.length > 0)
      // Phase 3F.3.3a — highlight the new "ready" rows in the list, and scroll the
      // truthful next-step CTA ("add to publishing queue") into view here.
      if (createdTopics.length) onApproved?.({ topicIds: createdTopics.map((tp) => tp.id), plansSaved: savedPlans.length > 0 })
      window.setTimeout(() => ctaRef.current?.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80)
      onCreated()
    } catch {
      setMessage({ text: 'error', ok: false })
    } finally {
      setCreating(false)
    }
  }

  async function addCreatedToSchedule() {
    if (scheduling || lastCreatedIds.length === 0) return
    setScheduling(true); setMessage(null)
    try {
      // Ensure the project's pool exists WITHOUT mutating an existing one: GET
      // first, and only create a new (paused) pool when none exists. This never
      // flips an already-active pool to paused.
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
        if (!pr.ok) { setMessage({ text: 'error', ok: false }); return }
        const pd = await pr.json()
        poolId = pd.pool?.id ?? null
      }
      if (!poolId) { setMessage({ text: 'error', ok: false }); return }
      await fetch(`/api/content/automation/pools/${poolId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicIds: lastCreatedIds }),
      })
      setLastCreatedIds([])
      onScheduled?.()
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
      </div>

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
      {/* No saved ideas yet (fresh project / after clearing all) — calm prompt. */}
      {initialLoaded && !loading && !meta && suggestions.length === 0 && (
        <p className="text-xs text-slate-500 dark:text-slate-400 mb-2">{t.noSavedIdeas}</p>
      )}
      {lastCreatedIds.length > 0 && (
        <div ref={ctaRef} className="mb-3 rounded-lg border-2 border-indigo-400 dark:border-indigo-500/60 bg-indigo-50 dark:bg-indigo-500/10 px-3 py-3 scroll-mt-4">
          <div className="text-[11px] font-semibold uppercase tracking-wide text-indigo-700 dark:text-indigo-300">↓ {t.nextStep}</div>
          <p className="mt-0.5 text-sm font-medium text-indigo-900 dark:text-indigo-100">{t.approvedCta.replace('{n}', String(lastCreatedIds.length))}</p>
          <p className="mt-0.5 text-[11px] text-indigo-700/80 dark:text-indigo-300/80">{lastLinksSaved ? t.approvedReadyLinks : t.approvedReadyNoLinks}</p>
          <div className="mt-2">
            <Button onClick={addCreatedToSchedule} loading={scheduling} disabled={scheduling}>{t.addToSchedule}</Button>
          </div>
        </div>
      )}

      {suggestions.length === 0 && !loading ? (
        null
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 mb-2">
            <Button size="sm" variant="ghost" onClick={selectAll}>{t.selectAll}</Button>
            <Button size="sm" variant="ghost" onClick={clearSel}>{t.clear}</Button>
            <div className="flex-1" />
            <Button size="sm" variant="outline" onClick={rejectSelected} disabled={selected.size === 0}>{t.rejectSelected}</Button>
            <Button size="sm" onClick={approveSelected} loading={creating} disabled={creating || selected.size === 0}>
              {creating ? t.creating : `${t.approveNext}${selected.size > 0 ? ` (${selected.size})` : ''}`}
            </Button>
          </div>
          <p className="text-[10px] text-slate-400 dark:text-slate-500 mb-2">{t.approveNextHint}</p>

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
                    {s.suggestedInternalLinks.length > 0 && (
                      <div className="mt-1" dir={isHebrew ? 'rtl' : 'ltr'}>
                        <div className="text-[11px] font-medium text-slate-600 dark:text-slate-300">{t.internalLinksLabel}</div>
                        <p className="text-[10px] text-slate-500 dark:text-slate-400">{t.linksFoundHint}</p>
                        <div className="mt-1 space-y-0.5">
                          {s.suggestedInternalLinks.map((l, i) => (
                            <label key={`${l.url}-${i}`} className="flex items-start gap-1.5 text-[11px] cursor-pointer">
                              <input type="checkbox" checked={isLinkChecked(s, l.url)} onChange={() => toggleLink(s, l.url)} className="mt-0.5 h-3.5 w-3.5 accent-indigo-600" />
                              <span className="text-slate-600 dark:text-slate-300 break-words">{l.anchor || l.url}</span>
                            </label>
                          ))}
                        </div>
                        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{t.linksSelectHint}</p>
                        <p className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{t.linksQualityHint}</p>
                      </div>
                    )}
                    {s.suggestedInternalLinks.length === 0 && (
                      <div className="mt-0.5 text-[10px] text-slate-400 dark:text-slate-500">{t.linksNoneHint}</div>
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
