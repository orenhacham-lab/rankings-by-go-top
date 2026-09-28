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
import Link from 'next/link'
import { Card } from '@/components/ui/Card'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { FIELD_CLASSES } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp } from 'lucide-react'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { presentAlert } from '@/lib/content/automation/alert-presentation'
import { alertReasonCode, type ActiveAlert } from '@/lib/content/automation/alert-read-model'

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
  // Phase 3G.2 — map a stored failure code (e.g. gemini_quota_exceeded) to short,
  // localized prose. See reasonLabel below for why the stored string's TAIL is
  // never rendered.
  const genErrors = getDashboardDictionary(language).contentHub.genErrors as Record<string, string>
  // ONE dictionary slice for the alert composer, so the card and its test read
  // the same strings through the same function.
  const alertDict = {
    alertBlockedTitle: t.alertBlockedTitle,
    alertPublishFailedShopify: t.alertPublishFailedShopify,
    alertPublishFailedWordPress: t.alertPublishFailedWordPress,
    alertPublishFailedGeneric: t.alertPublishFailedGeneric,
    alertAttempts: t.alertAttempts,
    alertReasonOther: t.alertReasonOther,
    genErrors,
  }
  /**
   * It used to append the stored string's tail — `label — <tail>` — "so it is
   * debuggable". That tail is the PROVIDER's own text: for a Shopify failure it
   * is the GraphQL userError, verbatim, on the merchant's screen. Debuggability
   * belongs in the row and the server log, both of which still hold the full
   * string; the panel shows the CODE's sentence and nothing else. An
   * unrecognised code degrades to a localized sentence rather than printing
   * itself, so the identifier never leaks either. alertReasonCode is the shared
   * extractor, so this panel and the alert read model agree on what a code is.
   */
  const reasonLabel = (code: string | null | undefined): string => {
    if (!code) return ''
    const base = alertReasonCode(code)
    if (!base) return t.alertReasonOther
    return genErrors[base] ?? t.alertReasonOther
  }

  const [pool, setPool] = useState<Pool | null>(null)
  const [items, setItems] = useState<QueueItem[]>([])
  const [health, setHealth] = useState<{ needsAttention: boolean; overdue: boolean; failedCount: number; stuckCount: number; latestError: string | null } | null>(null)
  // Phase 4B.1 — persisted final-failure alerts (one per item, owner-scoped).
  // The API now returns the shared read model: a channel, a derived heading and a
  // typed reason CODE. The raw `error` string is deliberately absent from the
  // payload — it can carry provider/GraphQL text and belongs in server logs.
  const [alerts, setAlerts] = useState<ActiveAlert[]>([])
  // Safety A — surface a clear config error when the alerts migration is missing
  // (never silently hide that failures aren't being recorded).
  const [alertsMigrationMissing, setAlertsMigrationMissing] = useState(false)
  const [approved, setApproved] = useState<ApprovedTopic[]>([])
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [busyItem, setBusyItem] = useState<string | null>(null)
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null)
  // Dedicated state for the manual "check & run due publish" tool.
  const [runningNow, setRunningNow] = useState(false)
  const [runMsg, setRunMsg] = useState<{ text: string; tone: 'ok' | 'info' | 'error' } | null>(null)

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
      const [pr, tr, ar] = await Promise.all([
        fetch(`/api/content/automation/pools?projectId=${encodeURIComponent(projectId)}`),
        fetch(`/api/content/topics?projectId=${encodeURIComponent(projectId)}`),
        fetch(`/api/content/automation/alerts?projectId=${encodeURIComponent(projectId)}`),
      ])
      {
        const ad = await ar.json().catch(() => ({}))
        setAlertsMigrationMissing(ar.status === 503 && ad?.migrationRequired === true)
        setAlerts(ar.ok && Array.isArray(ad.alerts) ? ad.alerts : [])
      }
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
    if (runningNow) return
    setRunningNow(true); setRunMsg({ text: t.runNowLoading, tone: 'info' })
    try {
      const res = await fetch('/api/content/automation/run', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        setRunMsg({ text: d?.error === 'automation_migration_required' ? t.migrationRequired : t.runResFailure, tone: 'error' })
        return
      }
      // Build a clear outcome message from the existing run-response fields.
      const gen = d.generated ?? 0
      const pub = d.published ?? 0
      const fail = d.failures ?? 0
      const diags = Array.isArray(d.diagnostics) ? d.diagnostics : []
      const notDue = diags.length > 0 && diags.every((x: { due?: boolean }) => x?.due === false)
      if (pub > 0 && gen > 0) setRunMsg({ text: t.runResGeneratedPublished, tone: 'ok' })
      else if (pub > 0) setRunMsg({ text: t.runResPublished, tone: 'ok' })
      else if (gen > 0) setRunMsg({ text: t.runResGeneratedOnly, tone: 'ok' })
      else if (fail > 0) setRunMsg({ text: t.runResFailure, tone: 'error' })
      else if (notDue) setRunMsg({ text: t.runResNotDue, tone: 'info' })
      else setRunMsg({ text: t.runResNothing, tone: 'info' })
      await load(); onChanged?.()
    } catch {
      setRunMsg({ text: t.runResFailure, tone: 'error' })
    } finally {
      setRunningNow(false)
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

  // Phase 4B.1 — dismiss a persisted failure alert (owner-scoped).
  async function dismissAlert(alertId: string) {
    setAlerts((prev) => prev.filter((a) => a.id !== alertId)) // optimistic
    try {
      await fetch(`/api/content/automation/alerts/${alertId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ projectId }),
      })
    } catch { /* best-effort; a reload reconciles */ }
  }

  // Phase 4B.1 — retry from an alert: reset the item to an eligible state
  // (status=queued clears the error/lock AND resets attempts server-side). The
  // alert stays open until the next SUCCESSFUL publish resolves it. No duplicate
  // WordPress post — wp_post_id reconciliation guards the eventual publish.
  async function retryFromAlert(poolItemId: string) {
    setBusyItem(poolItemId)
    try {
      await fetch(`/api/content/automation/items/${poolItemId}`, {
        method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'queued' }),
      })
      await load(); onChanged?.()
      setMessage({ text: t.alertRetryQueued, ok: true })
    } finally {
      setBusyItem(null)
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
        setMessage({ text: d.reason ? reasonLabel(d.reason) : d.status, ok: false })
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
        setMessage({ text: d.reason ? reasonLabel(d.reason) : d.status, ok: false })
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
    <Card>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <Badge variant={active ? 'success' : 'neutral'}>{active ? t.active : t.paused}</Badge>
      </div>
      <p className="mt-1 mb-4 max-w-prose text-copy text-muted">{t.intro}</p>

      {message && <p className={`text-caption mb-2 ${message.ok ? 'text-ok' : 'text-bad'}`}>{message.text}</p>}

      {/* Part א — schedule settings. Compact single row (cadence · publish day(s) ·
          actions); stacks on mobile. Exact time/timezone stay internal (hidden).
          Subtle tint marks it as a distinct panel without adding a heavy card. */}
      <div className="mb-2 text-copy font-semibold text-ink">{t.settingsTitle}</div>
      <div className="space-y-3 rounded-inset border border-line bg-sunk/60 p-4">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {/* Cadence */}
          <div className="min-w-[11rem]">
            <div className="text-caption font-medium text-body mb-1">{t.cadenceLabel}</div>
            <div className="flex flex-wrap items-center gap-2">
              <div role="group" aria-label={t.cadenceLabel} className="inline-flex flex-wrap rounded-control border border-line bg-surface p-0.5">
              {([['weekly1', t.weekly1], ['weekly2', t.weekly2], ['custom', t.customLabel]] as [Preset, string][]).map(([key, label]) => (
                <button key={key} type="button" onClick={() => setPreset(key)} aria-pressed={preset === key}
                  className={`inline-flex h-8 items-center rounded-[0.375rem] px-3 text-caption font-semibold transition-[background-color,color] duration-150 ${preset === key ? 'bg-action-soft text-action' : 'text-muted hover:text-ink'}`}>
                  {label}
                </button>
              ))}
              </div>
              {preset === 'custom' && (
                <label className="text-caption text-body inline-flex items-center gap-1">
                  {t.customDays}
                  <input type="number" min={1} max={365} value={customDays} onChange={(e) => setCustomDays(Number(e.target.value) || 1)}
                    className={cn(FIELD_CLASSES, 'h-9 w-20 py-1')} />
                </label>
              )}
            </div>
          </div>

          {/* Publish day(s) — only for the weekly presets */}
          {(preset === 'weekly1' || preset === 'weekly2') && (
            <div>
              <div className="text-caption font-medium text-body mb-1">{t.weekdayLabel}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <select value={weekdays[0] ?? 0}
                  onChange={(e) => setWeekdays(preset === 'weekly1' ? [Number(e.target.value)] : [Number(e.target.value), weekdays[1] ?? DEFAULT_DAYS_2[1]!])}
                  className={cn(FIELD_CLASSES, 'h-9 w-auto cursor-pointer py-1')}>
                  {t.weekdays.map((d: string, i: number) => <option key={i} value={i}>{d}</option>)}
                </select>
                {preset === 'weekly2' && (
                  <select value={weekdays[1] ?? DEFAULT_DAYS_2[1]!}
                    onChange={(e) => setWeekdays([weekdays[0] ?? DEFAULT_DAYS_2[0]!, Number(e.target.value)])}
                    className={cn(FIELD_CLASSES, 'h-9 w-auto cursor-pointer py-1')}>
                    {t.weekdays.map((d: string, i: number) => <option key={i} value={i}>{d}</option>)}
                  </select>
                )}
              </div>
            </div>
          )}

          {/* Actions */}
          <div className="ms-auto flex items-center gap-2">
            <Button size="sm" onClick={() => saveSettings()} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>
            <Button size="sm" variant="outline" onClick={togglePause} disabled={saving} title={t.resumeHint}>{active ? t.pause : t.resume}</Button>
          </div>
        </div>

        {/* Publish-day note + next publish on one compact line */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-0.5">
          <p className="text-caption text-muted">{t.publishDayNote}</p>
          <div className="text-caption text-muted">
            {t.nextPublish}: <span className="font-semibold text-ink">{fmtDay(pool?.nextPublishAt ?? null, true)}</span>
          </div>
        </div>

        {/* Phase 3C — visible alert when the automatic-publishing queue needs
            attention (a scheduled publish/generation failed, an item is stuck, or
            the queue is overdue with nothing to publish). */}
        {health?.needsAttention && (
          <div className="mt-2 rounded-control border border-warn/30 bg-warn-soft px-3 py-2">
            <p className="text-caption font-medium text-warn">{t.alertNeedsAttention}</p>
            <p className="mt-0.5 text-caption text-warn">
              {[
                health.failedCount > 0 ? t.alertFailed.replace('{n}', String(health.failedCount)) : null,
                health.stuckCount > 0 ? t.alertStuck.replace('{n}', String(health.stuckCount)) : null,
                health.overdue ? t.alertOverdue : null,
              ].filter(Boolean).join(' · ')}
            </p>
            {health.latestError && <p className="mt-0.5 text-caption text-warn break-words">{reasonLabel(health.latestError)}</p>}
            <p className="mt-1 text-caption text-warn">{t.alertHint}</p>
          </div>
        )}

        {/* Safety A — the alert store is a required dependency; if its migration
            is missing, say so clearly instead of showing a healthy-looking zero. */}
        {alertsMigrationMissing && (
          <div className="mt-2 rounded-control border border-bad/30 bg-bad-soft px-3 py-2">
            <p className="text-caption font-semibold text-bad">{t.alertsMigrationMissing}</p>
          </div>
        )}

        {/* Phase 4B.1 — persisted final-failure alerts: one per item after the
            LAST failed publish attempt, with view / retry-now / dismiss. */}
        {alerts.length > 0 && (
          <div className="mt-2 space-y-2">
            {alerts.map((a) => (
              <div key={a.id} className="rounded-control border border-bad/30 bg-bad-soft px-3 py-2">
                <p className="text-caption font-semibold text-bad">
                  {presentAlert(a, alertDict).heading}
                </p>
                <p className="mt-0.5 text-caption text-bad break-words">
                  {presentAlert(a, alertDict).detail}
                </p>
                <div className="mt-1.5 flex flex-wrap items-center gap-2">
                  {a.articleId && (
                    <Link href={`/content/articles/${a.articleId}`} className="text-caption font-medium text-action hover:underline">
                      {t.alertViewArticle}
                    </Link>
                  )}
                  {a.poolItemId && (
                    <button type="button" onClick={() => retryFromAlert(a.poolItemId!)} disabled={busyItem === a.poolItemId}
                      className="text-caption font-medium text-ok hover:underline disabled:opacity-50">
                      {t.alertRetryNow}
                    </button>
                  )}
                  <button type="button" onClick={() => dismissAlert(a.id)}
                    className="text-caption font-medium text-muted hover:underline">
                    {t.alertDismiss}
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Part ב — publishing queue (add approved topics + the queue list below).
          A thin top divider separates it from the settings panel above. */}
      <div className="mt-5 border-t border-line pt-5">
        <div className="mb-2 text-copy font-semibold text-ink">{t.addApprovedTitle}</div>
        {approved.length === 0 ? (
          <p className="text-caption text-muted">{t.noApproved}</p>
        ) : (
          <div className="space-y-2">
            {(approvedExpanded ? approved : approved.slice(0, 3)).map((tp) => (
              <label key={tp.id} className="flex cursor-pointer items-center gap-2.5 rounded-control px-2 py-1.5 text-copy text-body transition-colors hover:bg-sunk/60">
                <input type="checkbox" checked={selected.has(tp.id)} onChange={() => toggle(tp.id)} className="size-4 shrink-0 accent-action" />
                <span className="truncate">{tp.topic}</span>
              </label>
            ))}
            {approved.length > 3 && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setApprovedExpanded((v) => !v)}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-pill border border-line bg-surface px-3.5 text-caption font-semibold text-action shadow-control transition-colors hover:border-line-strong hover:bg-action-soft"
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
      <div className="mt-5">
        <div className="mb-2 text-copy font-semibold text-ink">{t.queueTitle}</div>
        {loading ? (
          <div role="status" aria-busy="true" className="space-y-2">
            <span className="sr-only">{t.queueTitle}</span>
            {[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-inset" />)}
          </div>
        ) : items.length === 0 ? (
          <p className="rounded-inset border border-dashed border-line-strong px-4 py-5 text-center text-copy text-muted">{t.queueEmpty}</p>
        ) : (
          <div className="list-enter space-y-2">
            {(queueExpanded ? items : items.slice(0, 3)).map((it, idx) => (
              <div key={it.id} className="flex flex-wrap items-center gap-3 rounded-inset border border-line bg-surface p-3 transition-colors hover:border-line-strong">
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={t.moveUp}
                    className="rounded-control p-0.5 text-muted transition-colors hover:bg-sunk hover:text-ink disabled:opacity-30"><ChevronUp size={16} aria-hidden /></button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === items.length - 1} aria-label={t.moveDown}
                    className="rounded-control p-0.5 text-muted transition-colors hover:bg-sunk hover:text-ink disabled:opacity-30"><ChevronDown size={16} aria-hidden /></button>
                </div>
                <div className="flex-1 min-w-[10rem]">
                  <div className="truncate text-copy font-medium text-ink">{it.topicTitle}</div>
                  <div className="text-caption text-muted">{fmtDay(it.projectedPublishAt, ['queued', 'scheduled', 'generated', 'generating', 'publishing'].includes(it.status))}{it.lastError ? ` · ${reasonLabel(it.lastError)}` : ''}</div>
                </div>
                <Badge variant={it.status === 'published' || it.status === 'generated' ? 'success' : it.status === 'failed' || it.status === 'quality_check_failed' ? 'danger' : 'neutral'}>{statusLabel(it.status)}</Badge>
                <div className="flex items-center gap-1">
                  {it.status === 'publishing' && <span className="text-caption text-muted">{t.publishingNow}</span>}
                  {it.status === 'published' && (
                    <>
                      <span className="text-caption text-ok">{t.publishedDone}</span>
                      {it.wpPostUrl && (
                        <a href={it.wpPostUrl} target="_blank" rel="noopener noreferrer" dir="ltr" className="text-caption font-medium text-action hover:underline">{t.openPost}</a>
                      )}
                    </>
                  )}
                  {it.status === 'generated' && (
                    <>
                      {it.articleId && (
                        <a href={`/content/articles/${it.articleId}`} className="text-caption font-medium text-action hover:underline">{t.openEditor}</a>
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
                    <Button size="sm" variant="ghost" onClick={() => itemAction(it.id, 'remove')} disabled={busyItem === it.id} className="text-bad">{t.remove}</Button>
                  )}
                </div>
              </div>
            ))}
            {items.length > 3 && (
              <div className="pt-0.5">
                <button
                  type="button"
                  onClick={() => setQueueExpanded((v) => !v)}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-pill border border-line bg-surface px-3.5 text-caption font-semibold text-action shadow-control transition-colors hover:border-line-strong hover:bg-action-soft"
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
      <details className="mt-5 border-t border-line pt-4">
        <summary className="cursor-pointer select-none text-caption font-medium text-muted hover:text-ink">{t.advancedTitle}</summary>
        {/* Distinct soft block: this acts on the EXISTING publishing queue only —
            visually separated from the "add approved topics to queue" area above. */}
        <div className="mt-3 space-y-2 rounded-inset border border-line bg-sunk/60 p-4">
          <p className="text-caption font-medium text-body">{t.runNowSectionTitle}</p>
          <Button size="sm" variant="outline" onClick={runNow} loading={runningNow} disabled={runningNow}>
            {runningNow ? t.runNowRunning : t.runNowLabel}
          </Button>
          <p className="text-caption text-muted">{t.runNowHelper}</p>
          {runMsg && (
            <p className={`text-caption ${runMsg.tone === 'ok' ? 'text-ok' : runMsg.tone === 'error' ? 'text-bad' : 'text-body'}`}>
              {runMsg.text}
            </p>
          )}
        </div>
      </details>
    </Card>
  )
}
