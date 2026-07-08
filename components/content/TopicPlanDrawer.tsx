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
interface DryItem { targetUrl: string; targetTitle: string; targetRole: string; targetPriority: string; eligibility: string; anchorText: string | null; anchorSource: string | null; relevance: number; priorityBonus: number; confidence: number; reason: string; rejectedReasons: string[]; reviewability?: string; canManualApprove?: boolean }
const dmkey = (l: { targetUrl: string; anchorText: string | null }) => `${l.targetUrl}||${(l.anchorText ?? '').toLowerCase()}`

export interface DrawerTopic { id: string; topic: string; primary_keyword: string | null }

export default function TopicPlanDrawer({
  open, onClose, projectId, topic, language, onStatusChange, onReturnToQueue, onPlanSaved,
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
}) {
  const t = useMemo(() => getDashboardDictionary(language).contentHub.topicPlan, [language])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ exists: boolean; batch: SavedBatch | null; links: SavedLink[]; stale: boolean; staleReasons: string[] } | null>(null)
  const [dry, setDry] = useState<{ selected: DryItem[]; rejected: DryItem[]; summary: string; cacheState: string; warnings: string[] } | null>(null)
  // Manually-selected reviewable candidates for the current dry-run (mkey set).
  const [manualSel, setManualSel] = useState<Set<string>>(new Set())
  // Phase 3F.3.4b — recommended links CHECKED for the plan (default all checked).
  const [recSel, setRecSel] = useState<Set<string>>(new Set())
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [justSaved, setJustSaved] = useState(false)
  const [busyLink, setBusyLink] = useState<string | null>(null)
  // Guards against the /plan/saved refetch loop: reqIdRef ignores stale
  // responses; abortRef cancels an in-flight load when topic/open changes.
  const reqIdRef = useRef(0)
  const abortRef = useRef<AbortController | null>(null)

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
      if (!res.ok) { setError(t.loadError); setSaved({ exists: false, batch: null, links: [], stale: false, staleReasons: [] }); return }
      if (!data.exists) { setSaved({ exists: false, batch: null, links: [], stale: false, staleReasons: [] }); emitStatus({ exists: false, links: [], batch: null, stale: false }); return }
      const batch: SavedBatch = { id: data.batch.id, status: data.batch.status, linkCount: data.batch.linkCount ?? 0, cacheState: data.batch.cacheState }
      const links: SavedLink[] = Array.isArray(data.links) ? data.links : []
      setSaved({ exists: true, batch, links, stale: !!data.stale, staleReasons: Array.isArray(data.staleReasons) ? data.staleReasons : [] })
      emitStatus({ exists: true, links, batch, stale: !!data.stale })
    } catch (e) {
      if (reqIdRef.current !== myId || (e as { name?: string })?.name === 'AbortError') return
      setError(t.loadError)
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
    setDry(null); setJustSaved(false)
    loadSavedRef.current()
    // Phase 3F.3.4b — auto-preview recommended links so they are always visible
    // and directly checkable (no need to click "find recommended" first).
    runPlanRef.current()
    return () => { abortRef.current?.abort() }
  }, [open, projectId, topic?.id])

  const runPlan = useCallback(async () => {
    if (!topic || running) return
    setRunning(true); setError(null); setJustSaved(false)
    try {
      const res = await fetch(`/api/content/automation/internal-links/plan?projectId=${encodeURIComponent(projectId)}&topicIds=${encodeURIComponent(topic.id)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setDry({ selected: [], rejected: [], summary: '', cacheState: data.cacheState || 'missing', warnings: data.warnings || [data.warning].filter(Boolean) }); return }
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
      })
    } finally {
      setRunning(false)
    }
  }, [projectId, topic, running])
  // Keep the auto-preview effect pointing at the latest runPlan (Phase 3F.3.4b).
  runPlanRef.current = runPlan

  const savePlan = useCallback(async () => {
    if (!topic || saving) return
    setSaving(true); setError(null)
    try {
      // Phase 3F.3.4b — persist the EXACT checked selection (recommended + manual)
      // via the exact-mode bulk-save. When no dry-run is loaded, fall back to the
      // legacy /plan/save (re-runs the planner and saves all recommended links).
      let res: Response
      if (dry) {
        const recommended = dry.selected
          .filter((d) => recSel.has(dmkey(d)) && (d.anchorText || '').trim())
          .map((d) => ({ topicId: topic.id, targetUrl: d.targetUrl, anchorText: d.anchorText as string }))
        const manual = dry.rejected
          .filter((r) => r.reviewability === 'reviewable' && r.canManualApprove && manualSel.has(dmkey(r)) && (r.anchorText || '').trim())
          .map((r) => ({ topicId: topic.id, targetUrl: r.targetUrl, anchorText: r.anchorText as string }))
        res = await fetch('/api/content/automation/internal-links/plan/bulk-save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, topicIds: [topic.id], selectedLinks: [...recommended, ...manual], approve: false }),
        })
      } else {
        res = await fetch('/api/content/automation/internal-links/plan/save', {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ projectId, topicId: topic.id }),
        })
      }
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.warning || d.error || t.saveError) }
      else { setJustSaved(true); onPlanSaved?.() } // success → show completion state + notify hub
      setDry(null); setManualSel(new Set()); setRecSel(new Set())
      await loadSaved()
    } finally {
      setSaving(false)
    }
  }, [projectId, topic, saving, dry, manualSel, recSel, loadSaved, t.saveError, onPlanSaved])

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
          <Button size="sm" variant="outline" onClick={runPlan} loading={running} disabled={running}>{running ? t.running : t.runPlan}</Button>
          <Button size="sm" onClick={savePlan} loading={saving} disabled={saving}>{saving ? t.saving : (dry ? `${t.savePlan}${checkedCount ? ` (${checkedCount})` : ''}` : t.savePlan)}</Button>
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
              const blocked = dry.rejected.filter((r) => r.reviewability !== 'reviewable')
              return (
              <div className="mt-4">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.recommendedTitle}</div>
                {dry.selected.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.zeroLink}</p>
                ) : (
                  <>
                    <p className="mb-1 text-[11px] text-slate-500 dark:text-slate-400">{t.recommendedCheckNote}</p>
                    <div className="space-y-1.5">{dry.selected.map((d) => recommendedRow(d))}</div>
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
