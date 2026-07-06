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

import { useCallback, useEffect, useMemo, useState } from 'react'
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
interface DryItem { targetUrl: string; targetTitle: string; targetRole: string; targetPriority: string; eligibility: string; anchorText: string | null; anchorSource: string | null; relevance: number; priorityBonus: number; confidence: number; reason: string; rejectedReasons: string[] }

export interface DrawerTopic { id: string; topic: string; primary_keyword: string | null }

export default function TopicPlanDrawer({
  open, onClose, projectId, topic, language, onStatusChange,
}: {
  open: boolean
  onClose: () => void
  projectId: string
  topic: DrawerTopic | null
  language: 'he' | 'en'
  onStatusChange?: (topicId: string, summary: TopicPlanSummary) => void
}) {
  const t = useMemo(() => getDashboardDictionary(language).contentHub.topicPlan, [language])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState<{ exists: boolean; batch: SavedBatch | null; links: SavedLink[]; stale: boolean; staleReasons: string[] } | null>(null)
  const [dry, setDry] = useState<{ selected: DryItem[]; rejected: DryItem[]; summary: string; cacheState: string; warnings: string[] } | null>(null)
  const [running, setRunning] = useState(false)
  const [saving, setSaving] = useState(false)
  const [busyLink, setBusyLink] = useState<string | null>(null)

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
    setLoading(true); setError(null)
    try {
      const res = await fetch(`/api/content/automation/internal-links/plan/saved?projectId=${encodeURIComponent(projectId)}&topicId=${encodeURIComponent(topic.id)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setError(t.loadError); setSaved({ exists: false, batch: null, links: [], stale: false, staleReasons: [] }); return }
      if (!data.exists) { setSaved({ exists: false, batch: null, links: [], stale: false, staleReasons: [] }); emitStatus({ exists: false, links: [], batch: null, stale: false }); return }
      const batch: SavedBatch = { id: data.batch.id, status: data.batch.status, linkCount: data.batch.linkCount ?? 0, cacheState: data.batch.cacheState }
      const links: SavedLink[] = Array.isArray(data.links) ? data.links : []
      setSaved({ exists: true, batch, links, stale: !!data.stale, staleReasons: Array.isArray(data.staleReasons) ? data.staleReasons : [] })
      emitStatus({ exists: true, links, batch, stale: !!data.stale })
    } catch {
      setError(t.loadError)
    } finally {
      setLoading(false)
    }
  }, [projectId, topic, t.loadError, emitStatus])

  useEffect(() => { if (open && topic) { setDry(null); loadSaved() } }, [open, topic, loadSaved])

  const runPlan = useCallback(async () => {
    if (!topic || running) return
    setRunning(true); setError(null)
    try {
      const res = await fetch(`/api/content/automation/internal-links/plan?projectId=${encodeURIComponent(projectId)}&topicIds=${encodeURIComponent(topic.id)}`)
      const data = await res.json().catch(() => ({}))
      if (!res.ok) { setDry({ selected: [], rejected: [], summary: '', cacheState: data.cacheState || 'missing', warnings: data.warnings || [data.warning].filter(Boolean) }); return }
      const plan = Array.isArray(data.topics) ? data.topics[0] : null
      setDry({
        selected: plan?.selected ?? [],
        rejected: plan?.rejected ?? [],
        summary: plan?.summary ?? '',
        cacheState: data.cacheState || 'ok',
        warnings: data.warnings ?? [],
      })
    } finally {
      setRunning(false)
    }
  }, [projectId, topic, running])

  const savePlan = useCallback(async () => {
    if (!topic || saving) return
    setSaving(true); setError(null)
    try {
      const res = await fetch('/api/content/automation/internal-links/plan/save', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, topicId: topic.id }),
      })
      if (!res.ok) { const d = await res.json().catch(() => ({})); setError(d.warning || d.error || t.saveError) }
      setDry(null)
      await loadSaved()
    } finally {
      setSaving(false)
    }
  }, [projectId, topic, saving, loadSaved, t.saveError])

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

  const dryItemRow = (d: DryItem, rejected: boolean) => (
    <div key={`${d.targetUrl}-${d.anchorText}`} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2 text-[11px]">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-slate-800 dark:text-slate-100 font-medium">{d.anchorText || '—'}</span>
        <span className="text-slate-400">{t.confidence} {d.confidence}</span>
        <span className="text-slate-400">{d.targetPriority}</span>
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

        {/* Warnings */}
        {saved?.stale && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.staleWarn}{saved.staleReasons.length ? ` (${saved.staleReasons.join(', ')})` : ''}</p>}
        {dry?.cacheState === 'missing' && <p className="mt-2 text-xs text-amber-700 dark:text-amber-400">{t.cacheMissing}</p>}
        {dry?.warnings?.includes('cache_stale') && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t.cacheStale}</p>}
        {dry?.warnings?.includes('cache_version_stale') && <p className="mt-1 text-xs text-amber-700 dark:text-amber-400">{t.versionStale}</p>}
        {error && <p className="mt-2 text-xs text-red-600 dark:text-red-400">{error}</p>}

        {/* Actions — all manual */}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button size="sm" variant="outline" onClick={runPlan} loading={running} disabled={running}>{running ? t.running : t.runPlan}</Button>
          <Button size="sm" onClick={savePlan} loading={saving} disabled={saving}>{saving ? t.saving : (saved?.exists ? t.regenerate : t.savePlan)}</Button>
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
            {dry && (
              <div className="mt-4">
                <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.dryRunTitle}</div>
                {dry.selected.length === 0 ? (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{t.zeroLink}</p>
                ) : (
                  <div className="space-y-1.5">{dry.selected.map((d) => dryItemRow(d, false))}</div>
                )}
                {dry.selected.length > 0 && <p className="mt-1 text-[11px] text-slate-400">{t.saveHint}</p>}
                {dry.rejected.length > 0 && (
                  <details className="mt-2">
                    <summary className="cursor-pointer select-none text-[11px] text-slate-500 dark:text-slate-400">{t.rejectedTitle} ({dry.rejected.length})</summary>
                    <div className="mt-1.5 space-y-1.5">{dry.rejected.slice(0, 30).map((d) => dryItemRow(d, true))}</div>
                  </details>
                )}
              </div>
            )}

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
