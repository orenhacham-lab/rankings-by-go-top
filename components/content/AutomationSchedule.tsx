'use client'

/**
 * AutomationSchedule — "תזמון פרסום אוטומטי" (content automation, Phase 4).
 *
 * Management only: create/update the project's automation pool (cadence +
 * publish time + timezone), pause/resume, add APPROVED topics to the queue, and
 * manage queue items (remove / retry / skip / reorder). No generation, no
 * publishing, no cron — that arrives in Phases 5-7. Gated by the caller.
 */

import { useCallback, useEffect, useState } from 'react'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Cadence = 'daily' | 'weekly' | 'monthly' | 'custom'
type Preset = 'weekly1' | 'weekly2' | 'custom'

interface Pool {
  id: string
  cadence: Cadence
  intervalDays: number
  publishTime: string | null
  timezone: string
  isActive: boolean
  nextPublishAt: string | null
  publishDays: number[]
}

const DEFAULT_DAYS_1 = [0]      // Sunday
const DEFAULT_DAYS_2 = [0, 3]   // Sunday + Wednesday (never Saturday by default)
interface QueueItem {
  id: string
  topicId: string | null
  articleId: string | null
  wpPostUrl: string | null
  topicTitle: string
  status: string
  position: number
  attempts: number
  lastError: string | null
  projectedPublishAt: string | null
}
interface ApprovedTopic { id: string; topic: string; status: string }


export default function AutomationSchedule({
  projectId,
  language,
  refreshKey,
  onChanged,
}: {
  projectId: string
  language: 'he' | 'en'
  refreshKey: number
  onChanged?: () => void
}) {
  const t = getDashboardDictionary(language).contentHub.autoSchedule
  const locale = language === 'he' ? 'he-IL' : 'en-US'

  const [pool, setPool] = useState<Pool | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [health, setHealth] = useState<{ needsAttention: boolean; overdue: boolean; failedCount: number; stuckCount: number; latestError: string | null } | null>(null)
  const [approved, setApproved] = useState<ApprovedTopic[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)

  // Settings form.
  const [preset, setPreset] = useState<Preset>('weekly1')
  const [customDays, setCustomDays] = useState(3)
  const [publishTime, setPublishTime] = useState('09:00')
  const [timezone, setTimezone] = useState('Asia/Jerusalem')
  const [weekdays, setWeekdays] = useState<number[]>(DEFAULT_DAYS_1)
  const [approvedExpanded, setApprovedExpanded] = useState(false)
  const [queueExpanded, setQueueExpanded] = useState(false)

  const load = useCallback(async () => {
    if (!projectId) return
    setLoading(true)
    try {
      const [pr, tr] = await Promise.all([
        fetch(`/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`),
        fetch(`/api/content/topics?projectId=${encodeURIComponent(projectId)}`),
      ])
      if (pr.status === 503) { setMessage({ text: t.migrationRequired, ok: false }); setLoading(false); return }
      const pd = pr.ok ? await pr.json() : { pool: null, items: [] }
      const p: Pool | null = pd.pool ?? null
      setPool(p)
      setItems(Array.isArray(pd.items) ? pd.items : [])
      setHealth(pd.health ?? null)
      if (p) {
        const days = Array.isArray(p.publishDays) ? p.publishDays : []
        // Preset from weekday count first, else fall back to interval-days.
        const nextPreset: Preset = days.length === 1 ? 'weekly1' : days.length === 2 ? 'weekly2' : p.intervalDays === 7 ? 'weekly1' : p.intervalDays === 3 ? 'weekly2' : 'custom'
        setPreset(nextPreset)
        if (nextPreset === 'custom') setCustomDays(p.intervalDays)
        setWeekdays(days.length ? days : nextPreset === 'weekly2' ? DEFAULT_DAYS_2 : DEFAULT_DAYS_1)
        setPublishTime(p.publishTime || '09:00')
        setTimezone(p.timezone || 'Asia/Jerusalem')
      }
      const td = tr.ok ? await tr.json() : { topics: [] }
      const queuedIds = new Set((Array.isArray(pd.items) ? pd.items : []).map((i: QueueItem) => i.topicId).filter(Boolean))
      setApproved(((td.topics ?? []) as ApprovedTopic[]).filter((x) => x.status === 'approved' && !queuedIds.has(x.id)))
    } catch {
      setMessage({ text: 'error', ok: false })
    } finally {
      setLoading(false)
    }
  }, [projectId, t.migrationRequired])

  useEffect(() => { load() }, [load, refreshKey])

  function presetToCadence(): { cadence: Cadence; intervalDays: number; publishDays: number[] } {
    if (preset === 'weekly1') return { cadence: 'weekly', intervalDays: 7, publishDays: [weekdays[0] ?? 0] }
    if (preset === 'weekly2') {
      const two = [weekdays[0] ?? DEFAULT_DAYS_2[0]!, weekdays[1] ?? DEFAULT_DAYS_2[1]!]
      return { cadence: 'custom', intervalDays: 3, publishDays: Array.from(new Set(two)) }
    }
    return { cadence: 'custom', intervalDays: Math.max(1, Math.min(365, customDays)), publishDays: [] }
  }

  async function saveSettings(activate?: boolean) {
    setSaving(true); setMessage(null)
    try {
      const { cadence, intervalDays, publishDays } = presetToCadence()
      const isActive = activate ?? pool?.isActive ?? false
      const res = await fetch('/api/content/automation/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, cadence, intervalDays, publishDays, publishTime, timezone, isActive }),
      })
      if (res.status === 503) { setMessage({ text: t.migrationRequired, ok: false }); return }
      if (!res.ok) { setMessage({ text: 'error', ok: false }); return }
      setMessage({ text: t.saved, ok: true })
      await load()
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function runNow() {
    setSaving(true); setMessage(null)
    try {
      const res = await fetch('/api/content/automation/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
      })
      const d = await res.json().catch(() => ({}))
      if (res.ok) {
        setMessage({ text: t.ranSummary.replace('{published}', String(d.published ?? 0)).replace('{generated}', String(d.generated ?? 0)).replace('{failures}', String(d.failures ?? 0)), ok: true })
      } else {
        setMessage({ text: d?.error === 'automation_migration_required' ? t.migrationRequired : 'error', ok: false })
      }
      await load(); onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function togglePause() {
    if (!pool) { await saveSettings(true); return }
    setSaving(true)
    try {
      const res = await fetch(`/api/content/automation/pools/${pool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !pool.isActive }),
      })
      if (res.ok) { await load(); onChanged?.() }
    } finally {
      setSaving(false)
    }
  }

  async function ensurePoolId(): Promise<string | null> {
    if (pool) return pool.id
    // GET-first so we NEVER mutate (e.g. pause) an existing pool just to get its
    // id. Only create a new paused pool when none exists.
    try {
      const gr = await fetch(`/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`)
      if (gr.ok) { const gd = await gr.json(); if (gd.pool?.id) return gd.pool.id }
    } catch { /* fall through to create */ }
    const { cadence, intervalDays, publishDays } = presetToCadence()
    const res = await fetch('/api/content/automation/pools', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, cadence, intervalDays, publishDays, publishTime, timezone, isActive: false }),
    })
    if (!res.ok) return null
    const d = await res.json()
    return d.pool?.id ?? null
  }

  async function addSelected() {
    const ids = Array.from(selected)
    if (ids.length === 0) return
    setSaving(true); setMessage(null)
    try {
      const poolId = await ensurePoolId()
      if (!poolId) { setMessage({ text: t.migrationRequired, ok: false }); return }
      const res = await fetch(`/api/content/automation/pools/${poolId}/items`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ topicIds: ids }),
      })
      if (res.status === 503) { setMessage({ text: t.migrationRequired, ok: false }); return }
      const d = await res.json()
      const added = d.added ?? 0
      const already = (d.alreadyQueued ?? []).length
      setMessage({ text: already > 0 ? t.alreadyQueuedToast.replace('{n}', String(already)) : t.addedToast.replace('{n}', String(added)), ok: true })
      setSelected(new Set())
      await load()
      onChanged?.()
    } finally {
      setSaving(false)
    }
  }

  async function itemAction(itemId: string, action: 'remove' | 'retry' | 'skip' | 'unskip') {
    setBusyItem(itemId)
    try {
      if (action === 'remove') {
        await fetch(`/api/content/automation/items/${itemId}`, { method: 'DELETE' })
      } else {
        const status = action === 'skip' ? 'skipped' : 'queued'
        await fetch(`/api/content/automation/items/${itemId}`, {
          method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status }),
        })
      }
      await load(); onChanged?.()
    } finally {
      setBusyItem(null)
    }
  }

  async function generateItem(itemId: string) {
    setBusyItem(itemId); setMessage(null)
    try {
      const res = await fetch(`/api/content/automation/items/${itemId}/generate`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (d?.status === 'failed' || d?.status === 'quality_check_failed') {
        setMessage({ text: `${d.status}${d.reason ? `: ${d.reason}` : ''}`, ok: false })
      }
      await load(); onChanged?.()
    } finally {
      setBusyItem(null)
    }
  }

  async function publishItem(itemId: string) {
    setBusyItem(itemId); setMessage(null)
    try {
      const res = await fetch(`/api/content/automation/items/${itemId}/publish`, { method: 'POST' })
      const d = await res.json().catch(() => ({}))
      if (d?.status === 'failed' || d?.status === 'quality_check_failed') {
        setMessage({ text: `${d.status}${d.reason ? `: ${d.reason}` : ''}`, ok: false })
      }
      await load(); onChanged?.()
    } finally {
      setBusyItem(null)
    }
  }

  async function move(index: number, dir: -1 | 1) {
    const next = [...items]
    const j = index + dir
    if (j < 0 || j >= next.length) return
    ;[next[index], next[j]] = [next[j]!, next[index]!]
    setItems(next)
    if (!pool) return
    await fetch(`/api/content/automation/pools/${pool.id}/items`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedItemIds: next.map((i) => i.id) }),
    })
    onChanged?.()
  }

  // Date-only (no exact hour, since a daily cron can't guarantee the minute).
  // For still-pending items we append "· during the day".
  const fmtDay = (iso: string | null, pending = false) => {
    if (!iso) return t.notScheduled
    try {
      const d = new Date(iso).toLocaleDateString(locale, { timeZone: pool?.timezone || timezone, weekday: 'long', day: 'numeric', month: 'long' })
      return pending ? `${d} ${t.duringDay}` : d
    } catch { return iso }
  }
  const statusLabel = (s: string) => (t.status as Record<string, string>)[s] ?? s
  const toggle = (id: string) => setSelected((p) => { const n = new Set(p); n.has(id) ? n.delete(id) : n.add(id); return n })

  const active = pool?.isActive ?? false

  return (
    <Card className="hover:translate-y-0">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-base font-semibold text-slate-800 dark:text-slate-100">{t.title}</h3>
        <Badge variant={active ? 'success' : 'neutral'}>{active ? t.active : t.paused}</Badge>
      </div>
      <p className="text-xs text-slate-500 dark:text-slate-400 mt-1 mb-3">{t.intro}</p>

      {message && <p className={`text-xs mb-2 ${message.ok ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'}`}>{message.text}</p>}

      {/* Part א — schedule settings. Compact single row (cadence · publish day(s) ·
          actions); stacks on mobile. Exact time/timezone stay internal (hidden).
          Subtle tint marks it as a distinct panel without adding a heavy card. */}
      <div className="text-xs font-semibold text-slate-700 dark:text-slate-200 mb-1.5">{t.settingsTitle}</div>
      <div className="rounded-lg border border-slate-100 dark:border-slate-800 bg-slate-50/50 dark:bg-slate-800/30 p-3 space-y-2">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {/* Cadence */}
          <div className="min-w-[11rem]">
            <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.cadenceLabel}</div>
            <div className="flex flex-wrap items-center gap-1.5">
              {([['weekly1', t.weekly1], ['weekly2', t.weekly2], ['custom', t.customLabel]] as [Preset, string][]).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setPreset(key)}
                  className={`text-xs font-medium rounded-full px-3 py-1.5 border ${preset === key ? 'border-indigo-500 bg-indigo-50 text-indigo-700 dark:bg-indigo-500/10 dark:text-indigo-300' : 'border-slate-200 dark:border-slate-700 text-slate-600 dark:text-slate-300'}`}>
                  {label}
                </button>
              ))}
              {preset === 'custom' && (
                <label className="text-xs text-slate-600 dark:text-slate-300 inline-flex items-center gap-1">
                  {t.customDays}
                  <input type="number" min={1} max={365} value={customDays} onChange={(e) => setCustomDays(Number(e.target.value) || 1)}
                    className="w-16 rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
                </label>
              )}
            </div>
          </div>

          {/* Publish day(s) — only for the weekly presets */}
          {(preset === 'weekly1' || preset === 'weekly2') && (
            <div>
              <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.weekdayLabel}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={weekdays[0] ?? 0}
                  onChange={(e) => setWeekdays(preset === 'weekly1' ? [Number(e.target.value)] : [Number(e.target.value), weekdays[1] ?? DEFAULT_DAYS_2[1]!])}
                  className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs">
                  {t.weekdays.map((d: string, i: number) => <option key={i} value={i}>{d}</option>)}
                </select>
                {preset === 'weekly2' && (
                  <select value={weekdays[1] ?? DEFAULT_DAYS_2[1]!}
                    onChange={(e) => setWeekdays([weekdays[0] ?? DEFAULT_DAYS_2[0]!, Number(e.target.value)])}
                    className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs">
                    {t.weekdays.map((d: string, i: number) => <option key={i} value={i}>{d}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 ms-auto">
            <Button size="sm" onClick={() => saveSettings()} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>
            <Button size="sm" variant="outline" onClick={togglePause} disabled={saving} title={t.resumeHint}>{active ? t.pause : t.resume}</Button>
          </div>
        </div>

        {/* Publish-day note + next publish on one compact line */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-0.5">
          <p className="text-[11px] text-slate-500 dark:text-slate-400">{t.publishDayNote}</p>
          <div className="text-[11px] text-slate-500 dark:text-slate-400">
            {t.nextPublish}: <span className="font-medium">{fmtDay(pool?.nextPublishAt ?? null, true)}</span>
          </div>
        </div>

        {/* Phase 3C — visible alert when the automatic-publishing queue needs
            attention (a scheduled publish/generation failed, an item is stuck, or
            the queue is overdue with nothing to publish). */}
        {health?.needsAttention && (
          <div className="mt-2 rounded-lg border border-amber-300 dark:border-amber-500/40 bg-amber-50 dark:bg-amber-900/20 px-3 py-2">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-300">{t.alertNeedsAttention}</p>
            <p className="mt-0.5 text-[11px] text-amber-700 dark:text-amber-400">
              {[
                health.failedCount > 0 ? t.alertFailed.replace('{n}', String(health.failedCount)) : null,
                health.stuckCount > 0 ? t.alertStuck.replace('{n}', String(health.stuckCount)) : null,
                health.overdue ? t.alertOverdue : null,
              ].filter(Boolean).join(' · ')}
            </p>
            {health.latestError && <p className="mt-0.5 text-[11px] text-amber-700/90 dark:text-amber-400/90 break-words" dir="ltr">{health.latestError}</p>}
            <p className="mt-1 text-[11px] text-amber-700 dark:text-amber-400">{t.alertHint}</p>
          </div>
        )}
      </div>

      {/* Part ב — publishing queue (add approved topics + the queue list below).
          A thin top divider separates it from the settings panel above. */}
      <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.addApprovedTitle}</div>
        {approved.length === 0 ? (
          <p className="text-xs text-slate-400">{t.noApproved}</p>
        ) : (
          <div className="space-y-1.5">
            {(approvedExpanded ? approved : approved.slice(0, 3)).map((tp) => (
              <label key={tp.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={selected.has(tp.id)} onChange={() => toggle(tp.id)} className="h-4 w-4 accent-indigo-600" />
                <span className="truncate">{tp.topic}</span>
              </label>
            ))}
            {approved.length > 3 && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setApprovedExpanded((v) => !v)}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-500/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                  {approvedExpanded ? t.showLess : `${t.showMore} (${approved.length - 3})`}
                </button>
              </div>
            )}
            <Button size="sm" onClick={addSelected} loading={saving} disabled={saving || selected.size === 0}>
              {t.addSelected} ({selected.size})
            </Button>
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="mt-4">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.queueTitle}</div>
        {loading ? (
          <p className="text-xs text-slate-400">…</p>
        ) : items.length === 0 ? (
          <p className="text-xs text-slate-400">{t.queueEmpty}</p>
        ) : (
          <div className="space-y-2">
            {(queueExpanded ? items : items.slice(0, 3)).map((it, idx) => (
              <div key={it.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 leading-none">↑</button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 leading-none">↓</button>
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className="text-sm text-slate-800 dark:text-slate-100 truncate">{it.topicTitle}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{fmtDay(it.projectedPublishAt, ['queued', 'scheduled', 'generated', 'generating', 'publishing'].includes(it.status))}{it.lastError ? ` · ${it.lastError}` : ''}</div>
                </div>
                <Badge variant={it.status === 'published' || it.status === 'generated' ? 'success' : it.status === 'failed' || it.status === 'quality_check_failed' ? 'danger' : 'neutral'}>{statusLabel(it.status)}</Badge>
                <div className="flex items-center gap-1">
                  {it.status === 'publishing' && <span className="text-[11px] text-slate-500 dark:text-slate-400">{t.publishingNow}</span>}
                  {it.status === 'published' && (
                    <>
                      <span className="text-[11px] text-emerald-600 dark:text-emerald-400">{t.publishedDone}</span>
                      {it.wpPostUrl && (
                        <a href={it.wpPostUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{t.openPost}</a>
                      )}
                    </>
                  )}
                  {it.status === 'generated' && (
                    <>
                      {it.articleId && (
                        <a href={`/content/articles/${it.articleId}`} className="text-xs font-medium text-indigo-600 dark:text-indigo-400 hover:underline">{t.openEditor}</a>
                      )}
                      <Button size="sm" variant="outline" onClick={() => publishItem(it.id)} loading={busyItem === it.id} disabled={busyItem === it.id}>
                        {busyItem === it.id ? t.publishingNow : t.publishNow}
                      </Button>
                    </>
                  )}
                  {it.status === 'failed' && it.articleId && (
                    <Button size="sm" variant="outline" onClick={() => publishItem(it.id)} loading={busyItem === it.id} disabled={busyItem === it.id}>
                      {busyItem === it.id ? t.publishingNow : t.publishNow}
                    </Button>
                  )}
                  {(it.status === 'queued' || it.status === 'quality_check_failed' || (it.status === 'failed' && !it.articleId)) && (
                    <Button size="sm" variant="outline" onClick={() => generateItem(it.id)} loading={busyItem === it.id} disabled={busyItem === it.id}>
                      {busyItem === it.id ? t.generatingArticle : t.generateNow}
                    </Button>
                  )}
                  {(it.status === 'skipped' || it.status === 'paused') && (
                    <Button size="sm" variant="ghost" onClick={() => itemAction(it.id, 'unskip')} disabled={busyItem === it.id}>{t.retry}</Button>
                  )}
                  {it.status === 'queued' && (
                    <Button size="sm" variant="ghost" onClick={() => itemAction(it.id, 'skip')} disabled={busyItem === it.id}>{t.skip}</Button>
                  )}
                  {it.status !== 'publishing' && (
                    <Button size="sm" variant="ghost" onClick={() => itemAction(it.id, 'remove')} disabled={busyItem === it.id} className="text-red-600 dark:text-red-400">{t.remove}</Button>
                  )}
                </div>
              </div>
            ))}
            {items.length > 3 && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setQueueExpanded((v) => !v)}
                  className="inline-flex items-center justify-center gap-1 rounded-full border border-indigo-200 dark:border-indigo-500/40 px-3.5 py-1.5 text-xs font-semibold text-indigo-700 dark:text-indigo-300 hover:bg-indigo-50 dark:hover:bg-indigo-500/10 transition-colors"
                >
                  {queueExpanded ? t.showLess : `${t.showMore} (${items.length - 3})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Admin/QA tools — collapsed by default so normal clients aren't confused
          by the manual run action. */}
      <details className="mt-4">
        <summary className="text-xs text-slate-500 dark:text-slate-400 cursor-pointer select-none">{t.advancedTitle}</summary>
        <div className="mt-2 rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-2">
          <Button size="sm" variant="outline" onClick={runNow} disabled={saving}>{t.runNowLabel}</Button>
          <p className="text-[11px] text-slate-400">{t.runNowHelper}</p>
        </div>
      </details>
    </Card>
  )
}
