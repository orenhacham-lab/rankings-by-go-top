'use client'

/**
 * NewTopicsLinkPlanPanel — Phase 2F.1.
 *
 * Shown ONCE, right after topics are created, for the newly-created topic IDs.
 * Runs a single read-only dry-run (GET /plan?topicIds=…) on mount to surface
 * internal-link suggestions, lets the user select topics and Save (POST
 * /plan/bulk-save) with an optional auto-approve. It writes NOTHING to articles:
 * only plan batches/links are persisted, and approval is review-status only.
 *
 * Manual only: the mount-time dry-run is the sole automatic call (it exists only
 * because the panel itself is mounted by the explicit "create topics" action —
 * never on page load or list render). Save/approve happen on button click.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import type { TopicPlanSummary } from '@/components/content/TopicPlanBadge'
import { Link2, X } from 'lucide-react'

export interface NewTopic { id: string; topic: string; primary_keyword: string | null }

interface DryLink { targetUrl: string; targetTitle: string; anchorText: string | null; confidence: number; relevance: number; reason: string; rejectedReasons: string[]; reviewability?: string; canManualApprove?: boolean }
interface DryPlan { topicId: string; selected: DryLink[]; rejected: DryLink[]; reviewable: DryLink[]; summary: string }

const mkey = (l: { targetUrl: string; anchorText: string | null }) => `${l.targetUrl}||${(l.anchorText ?? '').toLowerCase()}`

interface BulkResult { topicId: string; ok: boolean; linkCount: number; approvedCount: number; reason?: string }

const REASON_HE: Record<string, string> = {
  low_relevance: 'רלוונטיות נמוכה',
  no_usable_anchor: 'אין עוגן שמיש',
  no_natural_anchor: 'אין עוגן טבעי',
  too_similar_self_link: 'דומה מדי (קישור עצמי)',
  self_target: 'קישור עצמי',
  duplicate_topic_target: 'נושא כפול',
  too_similar_to_planned_topic: 'דומה מדי לנושא',
  target_ineligible: 'יעד לא כשיר',
  low_confidence: 'ביטחון נמוך',
  duplicate_url: 'כתובת כפולה',
  duplicate_anchor: 'עוגן כפול',
  over_cap: 'מעל המכסה',
}
function reasonLabel(r?: string | null): string {
  if (!r) return ''
  const base = r.split('(')[0]!
  return REASON_HE[base] ?? r
}

export default function NewTopicsLinkPlanPanel({
  projectId, language, topics, onClose, onSaved,
}: {
  projectId: string
  language: 'he' | 'en'
  topics: NewTopic[]
  onClose: () => void
  onSaved: (results: { topicId: string; summary: TopicPlanSummary }[]) => void
}) {
  const t = useMemo(() => getDashboardDictionary(language).contentHub.newTopicsPlan, [language])
  const isHebrew = language === 'he'
  // Locale-aware label for soft (reviewable) reasons; falls back to REASON_HE.
  const revLabel = useCallback((r?: string | null) => {
    const base = (r || '').split('(')[0]!
    return (t.reviewReasons as Record<string, string>)[base] ?? reasonLabel(r)
  }, [t])

  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [warnNote, setWarnNote] = useState<string | null>(null)
  const [plans, setPlans] = useState<Record<string, DryPlan>>({})
  const [selected, setSelected] = useState<Set<string>>(new Set())
  // Manually-selected reviewable candidates, keyed by topicId → set of mkey().
  const [manualSel, setManualSel] = useState<Record<string, Set<string>>>({})
  const [autoApprove, setAutoApprove] = useState(false)
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<Record<string, 'saved' | 'approved' | 'zero' | 'failed'>>({})

  // Bring the panel into view once when it first appears (after topic creation).
  const rootRef = useRef<HTMLDivElement | null>(null)
  const scrolled = useRef(false)
  useEffect(() => {
    if (scrolled.current) return
    scrolled.current = true
    const id = window.setTimeout(() => rootRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }), 60)
    return () => window.clearTimeout(id)
  }, [])

  // Single dry-run on mount (this component only mounts after topic creation).
  const ran = useRef(false)
  useEffect(() => {
    if (ran.current) return
    ran.current = true
    const ids = topics.map((tp) => tp.id).join(',')
    ;(async () => {
      try {
        const res = await fetch(`/api/content/automation/internal-links/plan?projectId=${encodeURIComponent(projectId)}&topicIds=${encodeURIComponent(ids)}`)
        const data = await res.json().catch(() => ({}))
        if (!res.ok) { setError(data.cacheState === 'missing' ? t.cacheMissing : t.loadError); return }
        if (Array.isArray(data.warnings) && (data.warnings.includes('cache_stale') || data.warnings.includes('cache_version_stale'))) setWarnNote(t.cacheStale)
        const map: Record<string, DryPlan> = {}
        for (const p of Array.isArray(data.topics) ? data.topics : []) {
          const rejected: DryLink[] = Array.isArray(p.rejected) ? p.rejected : []
          const reviewable = rejected.filter((r) => r.reviewability === 'reviewable' && r.canManualApprove && (r.anchorText || '').trim())
          const plan: DryPlan = { topicId: p.topicId, selected: p.selected ?? [], rejected, reviewable, summary: p.summary ?? '' }
          map[p.topicId] = plan
        }
        setPlans(map)
        // Check ALL newly-created topics by default (not only those with
        // recommended links) so a zero-link/no-recommendation topic is still part
        // of the batch — it saves an auditable zero-link plan and its row badge
        // updates. Users can uncheck any topic they don't want saved.
        setSelected(new Set(topics.map((tp) => tp.id)))
      } catch {
        setError(t.loadError)
      } finally {
        setLoading(false)
      }
    })()
  }, [projectId, topics, t])

  const toggle = useCallback((id: string) => {
    setSelected((prev) => { const next = new Set(prev); next.has(id) ? next.delete(id) : next.add(id); return next })
  }, [])
  const toggleManual = useCallback((topicId: string, key: string) => {
    setManualSel((prev) => {
      const set = new Set(prev[topicId] ?? [])
      set.has(key) ? set.delete(key) : set.add(key)
      return { ...prev, [topicId]: set }
    })
  }, [])

  // A topic is saved if its recommended box is checked OR it has ≥1 manual pick.
  const topicIdsToSave = useMemo(() => {
    const ids = new Set(selected)
    for (const [tid, set] of Object.entries(manualSel)) if (set.size > 0) ids.add(tid)
    return Array.from(ids)
  }, [selected, manualSel])

  const save = useCallback(async () => {
    if (saving || topicIdsToSave.length === 0) return
    setSaving(true); setError(null)
    // Build server-revalidated manual candidates (targetUrl + anchorText only).
    const manualCandidates: { topicId: string; targetUrl: string; anchorText: string }[] = []
    for (const [tid, set] of Object.entries(manualSel)) {
      const rev = plans[tid]?.reviewable ?? []
      for (const l of rev) if (set.has(mkey(l)) && l.anchorText) manualCandidates.push({ topicId: tid, targetUrl: l.targetUrl, anchorText: l.anchorText })
    }
    try {
      const res = await fetch('/api/content/automation/internal-links/plan/bulk-save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, topicIds: topicIdsToSave, approve: autoApprove, manualCandidates }),
      })
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(data.cacheState === 'missing' ? t.cacheMissing : t.saveError); return }
      const results: BulkResult[] = Array.isArray(data.results) ? data.results : []
      const nextStatus: Record<string, 'saved' | 'approved' | 'zero' | 'failed'> = {}
      const summaries: { topicId: string; summary: TopicPlanSummary }[] = []
      for (const r of results) {
        if (!r.ok) { nextStatus[r.topicId] = 'failed'; continue }
        nextStatus[r.topicId] = r.linkCount === 0 ? 'zero' : r.approvedCount > 0 ? 'approved' : 'saved'
        summaries.push({ topicId: r.topicId, summary: { exists: true, linkCount: r.linkCount, approvedCount: r.approvedCount, stale: false } })
      }
      setSaveStatus((prev) => ({ ...prev, ...nextStatus }))
      onSaved(summaries)
    } catch {
      setError(t.saveError)
    } finally {
      setSaving(false)
    }
  }, [saving, topicIdsToSave, manualSel, plans, projectId, autoApprove, t, onSaved])

  // Summary counts (session-only, from the dry-run + save results).
  const topicsWithLinks = Object.values(plans).filter((p) => p.selected.length > 0).length
  const linksSuggested = Object.values(plans).reduce((n, p) => n + p.selected.length, 0)
  const reviewableTotal = Object.values(plans).reduce((n, p) => n + p.reviewable.length, 0)
  const plansSaved = Object.values(saveStatus).filter((s) => s !== 'failed').length
  const linksApproved = Object.entries(saveStatus).filter(([, s]) => s === 'approved').length
  // Calm empty state: no recommended AND no reviewable across all new topics.
  const nothingFound = Object.keys(plans).length > 0 && linksSuggested === 0 && reviewableTotal === 0

  const statusBadge = (id: string) => {
    const s = saveStatus[id]
    if (s === 'approved') return <Badge variant="success">{t.statusApproved}</Badge>
    if (s === 'saved') return <Badge variant="success">{t.statusSaved}</Badge>
    if (s === 'zero') return <Badge variant="neutral">{t.statusZero}</Badge>
    if (s === 'failed') return <Badge variant="danger">{t.statusFailed}</Badge>
    return <Badge variant="neutral">{t.statusSuggested}</Badge>
  }

  return (
    <Card className="mb-4 hover:translate-y-0 border-indigo-200 dark:border-indigo-500/30 ring-1 ring-indigo-100 dark:ring-indigo-500/20">
      <div ref={rootRef} dir={isHebrew ? 'rtl' : 'ltr'} className="scroll-mt-4">
        <div className="flex items-start justify-between gap-3">
          <span className="inline-flex items-center gap-2">
            <Link2 size={16} className="text-indigo-600 dark:text-indigo-400" />
            <span className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</span>
          </span>
          <button type="button" onClick={onClose} aria-label={t.close} className="text-slate-400 hover:text-slate-600 dark:hover:text-slate-200"><X size={16} /></button>
        </div>
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{t.intro}</p>
        <p className="mt-1 text-[11px] text-slate-400 dark:text-slate-500">{t.sessionOnlyNote} {t.alsoFromRow}</p>

        {warnNote && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{warnNote}</p>}
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

        {loading ? (
          <div className="py-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
            <span className="inline-block w-4 h-4 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />{t.loading}
          </div>
        ) : (
          <>
            {/* Summary */}
            <p className="mt-3 text-[11px] text-slate-500 dark:text-slate-400">
              {t.sumTopicsChecked}: {topicIdsToSave.length} · {t.sumTopicsWithLinks}: {topicsWithLinks} · {t.sumLinksSuggested}: {linksSuggested} · {t.sumReviewable}: {reviewableTotal}
              {plansSaved > 0 && <> · {t.sumPlansSaved}: {plansSaved} · {t.sumLinksApproved}: {linksApproved}</>}
            </p>

            {/* Calm empty state — not an error. */}
            {nothingFound && (
              <p className="mt-2 text-xs text-slate-500 dark:text-slate-400 bg-slate-50 dark:bg-slate-800/40 border border-slate-100 dark:border-slate-800 rounded-lg px-3 py-2">{t.noneFound}</p>
            )}

            <div className="mt-3 space-y-2">
              {topics.map((tp) => {
                const plan = plans[tp.id]
                const links = plan?.selected ?? []
                const reviewable = plan?.reviewable ?? []
                const blocked = (plan?.rejected ?? []).filter((r) => r.reviewability !== 'reviewable')
                const mset = manualSel[tp.id] ?? new Set<string>()
                return (
                  <div key={tp.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-3">
                    <div className="flex flex-wrap items-center gap-2">
                      <input type="checkbox" checked={selected.has(tp.id)} onChange={() => toggle(tp.id)} disabled={saving} className="accent-indigo-600" />
                      <span className="text-sm font-medium text-slate-800 dark:text-slate-100 break-words">{tp.topic}</span>
                      {statusBadge(tp.id)}
                      <span className="text-[11px] text-slate-400 ms-auto">{links.length ? `${links.length} ${t.suggestedLinks}` : ''}</span>
                    </div>
                    {tp.primary_keyword && <p className="mt-0.5 text-[11px] text-slate-500 dark:text-slate-400">{t.primaryKeyword}: {tp.primary_keyword}</p>}

                    {/* Recommended */}
                    {links.length === 0 ? (
                      <p className="mt-1.5 text-[11px] text-slate-500 dark:text-slate-400">{t.zeroLink}</p>
                    ) : (
                      <>
                        <div className="mt-1.5 text-[10px] font-medium text-slate-500 dark:text-slate-400">{t.recommendedTitle}</div>
                        <div className="mt-1 space-y-1.5">
                          {links.map((l, i) => (
                            <div key={`${l.targetUrl}-${i}`} className="rounded-md bg-slate-50 dark:bg-slate-800/60 p-2 text-[11px]">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="font-medium text-slate-800 dark:text-slate-100 break-words">{l.anchorText || '—'}</span>
                                <span className="text-slate-400">{t.confidence} {l.confidence}</span>
                              </div>
                              <a href={l.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="block text-indigo-600 dark:text-indigo-400 hover:underline break-all">{l.targetTitle || l.targetUrl}</a>
                            </div>
                          ))}
                        </div>
                      </>
                    )}

                    {/* Reviewable — collapsed manual-override options */}
                    {reviewable.length > 0 && (
                      <details className="mt-2" open={links.length === 0}>
                        <summary className="cursor-pointer select-none text-[11px] font-medium text-indigo-700 dark:text-indigo-300">{t.reviewableTitle} ({reviewable.length})</summary>
                        <p className="mt-1 text-[10px] text-slate-500 dark:text-slate-400">{t.reviewableNote}</p>
                        <div className="mt-1.5 space-y-1.5">
                          {reviewable.map((l, i) => {
                            const k = mkey(l)
                            return (
                              <label key={`${l.targetUrl}-rv-${i}`} className="flex flex-wrap items-start gap-2 rounded-md border border-indigo-100 dark:border-indigo-500/20 p-2 text-[11px] cursor-pointer">
                                <input type="checkbox" checked={mset.has(k)} onChange={() => toggleManual(tp.id, k)} disabled={saving} className="mt-0.5 accent-indigo-600" />
                                <span className="flex-1 min-w-0">
                                  <span className="flex flex-wrap items-center gap-2">
                                    <span className="font-medium text-slate-800 dark:text-slate-100 break-words">{l.anchorText || '—'}</span>
                                    <Badge variant="neutral">{t.manualBadge}</Badge>
                                    <span className="text-amber-700 dark:text-amber-400">{l.rejectedReasons.map(revLabel).join(' · ')}</span>
                                    <span className="text-slate-400">{t.confidence} {l.confidence}</span>
                                  </span>
                                  <a href={l.targetUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="block text-indigo-600 dark:text-indigo-400 hover:underline break-all">{l.targetTitle || l.targetUrl}</a>
                                </span>
                              </label>
                            )
                          })}
                        </div>
                      </details>
                    )}

                    {/* Blocked — advanced diagnostics, not selectable */}
                    {blocked.length > 0 && (
                      <details className="mt-1.5">
                        <summary className="cursor-pointer select-none text-[10px] text-slate-400">{t.blockedTitle} ({blocked.length})</summary>
                        <div className="mt-1 space-y-1">
                          {blocked.slice(0, 20).map((l, i) => (
                            <div key={`${l.targetUrl}-b-${i}`} className="text-[10px] text-slate-400 line-through decoration-slate-300">
                              <span className="break-words no-underline">{l.anchorText || l.targetTitle || l.targetUrl}</span>
                              {l.rejectedReasons?.length ? <span className="text-slate-400"> · {l.rejectedReasons.map(revLabel).join(' · ')}</span> : null}
                            </div>
                          ))}
                        </div>
                      </details>
                    )}
                  </div>
                )
              })}
            </div>

            <div className="mt-3 flex flex-wrap items-center gap-3">
              <label className="inline-flex items-center gap-2 text-[11px] text-slate-600 dark:text-slate-300">
                <input type="checkbox" checked={autoApprove} onChange={(e) => setAutoApprove(e.target.checked)} disabled={saving} className="accent-indigo-600" />
                {t.autoApprove}
              </label>
              <Button size="sm" onClick={save} loading={saving} disabled={saving || topicIdsToSave.length === 0} className="ms-auto">
                {saving ? t.saving : t.save}
              </Button>
            </div>
          </>
        )}
      </div>
    </Card>
  )
}
