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
}
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

const TZ_OPTIONS = ['Asia/Jerusalem', 'UTC', 'Europe/London', 'America/New_York']

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
      if (p) {
        setPreset(p.intervalDays === 7 ? 'weekly1' : p.intervalDays === 3 ? 'weekly2' : 'custom')
        if (p.intervalDays !== 7 && p.intervalDays !== 3) setCustomDays(p.intervalDays)
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

  function presetToCadence(): { cadence: Cadence; intervalDays: number } {
    if (preset === 'weekly1') return { cadence: 'weekly', intervalDays: 7 }
    if (preset === 'weekly2') return { cadence: 'custom', intervalDays: 3 }
    return { cadence: 'custom', intervalDays: Math.max(1, Math.min(365, customDays)) }
  }

  async function saveSettings(activate?: boolean) {
    setSaving(true); setMessage(null)
    try {
      const { cadence, intervalDays } = presetToCadence()
      const isActive = activate ?? pool?.isActive ?? false
      const res = await fetch('/api/content/automation/pools', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ projectId, cadence, intervalDays, publishTime, timezone, isActive }),
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
    const { cadence, intervalDays } = presetToCadence()
    const res = await fetch('/api/content/automation/pools', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ projectId, cadence, intervalDays, publishTime, timezone, isActive: false }),
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

  const fmt = (iso: string | null) => {
    if (!iso) return t.notScheduled
    try { return new Date(iso).toLocaleString(locale, { timeZone: pool?.timezone || timezone, dateStyle: 'medium', timeStyle: 'short' }) } catch { return iso }
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

      {/* Settings */}
      <div className="rounded-lg border border-slate-100 dark:border-slate-800 p-3 space-y-3">
        <div>
          <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.cadenceLabel}</div>
          <div className="flex flex-wrap items-center gap-2">
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
        <div className="flex flex-wrap items-end gap-3">
          <label className="text-xs text-slate-600 dark:text-slate-300">
            <span className="block mb-1">{t.publishTime}</span>
            <input type="time" value={publishTime} onChange={(e) => setPublishTime(e.target.value)}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs" />
          </label>
          <label className="text-xs text-slate-600 dark:text-slate-300">
            <span className="block mb-1">{t.timezone}</span>
            <select value={timezone} onChange={(e) => setTimezone(e.target.value)}
              className="rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 px-2 py-1 text-xs">
              {TZ_OPTIONS.map((tz) => <option key={tz} value={tz}>{tz}</option>)}
            </select>
          </label>
          <Button size="sm" onClick={() => saveSettings()} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>
          <Button size="sm" variant="outline" onClick={togglePause} disabled={saving}>{active ? t.pause : t.resume}</Button>
        </div>
        <div className="text-[11px] text-slate-500 dark:text-slate-400">
          {t.nextPublish}: <span className="font-medium">{fmt(pool?.nextPublishAt ?? null)}</span>
        </div>
        <p className="text-[11px] text-slate-400">{t.weekdayNote}</p>
      </div>

      {/* Add approved topics */}
      <div className="mt-4">
        <div className="text-xs font-medium text-slate-600 dark:text-slate-300 mb-1">{t.addApprovedTitle}</div>
        {approved.length === 0 ? (
          <p className="text-xs text-slate-400">{t.noApproved}</p>
        ) : (
          <div className="space-y-1.5">
            {approved.map((tp) => (
              <label key={tp.id} className="flex items-center gap-2 text-sm text-slate-700 dark:text-slate-200">
                <input type="checkbox" checked={selected.has(tp.id)} onChange={() => toggle(tp.id)} className="h-4 w-4 accent-indigo-600" />
                <span className="truncate">{tp.topic}</span>
              </label>
            ))}
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
            {items.map((it, idx) => (
              <div key={it.id} className="rounded-lg border border-slate-100 dark:border-slate-800 p-2.5 flex flex-wrap items-center gap-2">
                <div className="flex flex-col gap-0.5">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 leading-none">↑</button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} className="text-slate-400 hover:text-slate-600 disabled:opacity-30 leading-none">↓</button>
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className="text-sm text-slate-800 dark:text-slate-100 truncate">{it.topicTitle}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400">{fmt(it.projectedPublishAt)}{it.lastError ? ` · ${it.lastError}` : ''}</div>
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
          </div>
        )}
      </div>
    </Card>
  )
}
