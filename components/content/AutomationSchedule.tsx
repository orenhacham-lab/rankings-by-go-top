'use client'

/**
 * AutomationSchedule — "תזמון פרסום אוטומטי" (content automation, Phase 4).
 *
 * Management only: create/update the project's automation pool (cadence +
 * publish time + timezone), pause/resume, add APPROVED topics to the queue, and
 * manage queue items (remove / retry / skip / reorder). No generation, no
 * publishing, no cron — that arrives in Phases 5-7. Gated by the caller.
 */

import { canPublishFirstNow } from '@/lib/content/strategy/first-article'
import { useCallback, useEffect, useState } from 'react'
import Link from 'next/link'
import Button from '@/components/ui/Button'
import Badge from '@/components/ui/Badge'
import { Skeleton } from '@/components/ui/Skeleton'
import { FIELD_CLASSES } from '@/components/ui/Input'
import { cn } from '@/lib/utils'
import { ChevronDown, ChevronUp, ExternalLink, FileText, RotateCcw, SkipForward, Trash2 } from 'lucide-react'
import Checkbox from '@/components/ui/Checkbox'
import Notice from '@/components/ui/Notice'
import RowMenu, { type RowMenuItem } from '@/components/ui/RowMenu'
import Segmented from '@/components/ui/Segmented'
import Select from '@/components/ui/Select'
import { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'
import { presentAlert } from '@/lib/content/automation/alert-presentation'
import { alertReasonCode, type ActiveAlert } from '@/lib/content/automation/alert-read-model'
import { intlLocaleOf, type PublicLocale } from '@/lib/i18n/locales'

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
/** Nothing is published on Friday or Saturday, so they are never offered. */
const WORKING_WEEKDAYS = [0, 1, 2, 3, 4]
/**
 * Who sets the rhythm. 'owner' — the account picks its own days — is reached
 * only by an account with no plan and no trial, which is an admin: the owner's
 * rule of 4 October 2026 is that no customer controls this, on a trial or on a
 * subscription. A trial says its dates were fixed when the account opened; a
 * paid plan says what the plan gives.
 */
type Rhythm =
  | {
    source: 'plan'
    perWeek: number
    weekdays: number[]
    intervalDays?: number | null
    /** The split, which IS the customer's: see the share panel below. */
    share?: number | null
    accountMonthly?: number
    siteMonthly?: number
    maxShare?: number
    multiSite?: boolean
  }
  | { source: 'trial' }
  | { source: 'owner' }
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


/** The statuses that still have a publish ahead of them — the API's own list
 *  (app/api/content/automation/pools/route.ts), which is what decides whether a
 *  row carries a projected slot or a date it already has. */
const PENDING_STATUSES = ['queued', 'scheduled', 'generating', 'generated', 'publishing']

export default function AutomationSchedule({
  projectId,
  uiLocale,
  refreshKey,
  onChanged,
  articles,
}: {
  /** The project's articles (id + status), for "publish now", which only the first article has. */
  articles?: readonly { id: string; status: string }[]
  projectId: string
  uiLocale: PublicLocale
  refreshKey: number
  onChanged?: () => void
}) {
  const t = getDashboardDictionary(uiLocale).contentHub.autoSchedule
  const locale = intlLocaleOf(uiLocale)
  // Phase 3G.2 — map a stored failure code (e.g. gemini_quota_exceeded) to short,
  // localized prose. See reasonLabel below for why the stored string's TAIL is
  // never rendered.
  const genErrors = getDashboardDictionary(uiLocale).contentHub.genErrors as Record<string, string>
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
  // Without the workspace's list, the queue's own articles stand in for the project's.
  const articlesForFirst = articles ?? items.filter((i) => !!i.articleId).map((i) => ({ id: i.articleId!, status: i.status === 'published' ? 'published' : 'ready' }))
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
  const cadenceOptions: { value: Preset; label: string }[] = [{ value: 'weekly1', label: t.weekly1 }, { value: 'weekly2', label: t.weekly2 }, { value: 'custom', label: t.customLabel }]
  const [customDays, setCustomDays] = useState(3)
  const [publishTime, setPublishTime] = useState('09:00')
  const [timezone, setTimezone] = useState('Asia/Jerusalem')
  const [weekdays, setWeekdays] = useState<number[]>(DEFAULT_DAYS_1)
  const [rhythm, setRhythm] = useState<Rhythm | null>(null)
  /**
   * THE ONE SCHEDULE FIELD A PAYING CUSTOMER DOES OWN.
   *
   * The plan decides the days, the times and the ceiling. How much of the
   * account's monthly allowance each of its websites gets is the customer's,
   * because only they know which of their websites matters more. Empty means
   * the even split, which is the default and what every account has today.
   */
  const [shareInput, setShareInput] = useState('')
  const [savingShare, setSavingShare] = useState(false)
  const [shareMsg, setShareMsg] = useState<{ text: string; ok: boolean } | null>(null)
  // Anything but 'owner' means the schedule is not this account's to change:
  // the picker, the save button and "create the article now" are all withheld.
  const scheduleLocked = rhythm !== null && rhythm.source !== 'owner'
  const weekdayOptions = WORKING_WEEKDAYS.map((i) => ({ value: String(i), label: t.weekdays[i] as string }))
  const [approvedExpanded, setApprovedExpanded] = useState(false)
  const [queueExpanded, setQueueExpanded] = useState(false)
  const [historyOpen, setHistoryOpen] = useState(false)

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
      const nextRhythm: Rhythm | null = pd.rhythm && typeof pd.rhythm === 'object' ? pd.rhythm as Rhythm : null
      setRhythm(nextRhythm)
      setShareInput(nextRhythm?.source === 'plan' && typeof nextRhythm.share === 'number' ? String(nextRhythm.share) : '')
      if (p) {
        const days = (Array.isArray(p.publishDays) ? p.publishDays : []).filter((d) => WORKING_WEEKDAYS.includes(d))
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

  async function saveShare() {
    if (!pool || savingShare) return
    setSavingShare(true); setShareMsg(null)
    const raw = shareInput.trim()
    try {
      const res = await fetch(`/api/content/automation/pools/${pool.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ monthlyShare: raw === '' ? null : Number(raw) }),
      })
      const d = await res.json().catch(() => ({}))
      if (!res.ok) {
        // The server decides, and says how much room is left; the screen only
        // repeats its number, never its own guess.
        const max = typeof d?.maxShare === 'number' ? String(d.maxShare) : '—'
        setShareMsg({
          text: d?.error === 'share_too_large' ? t.shareTooLarge.replace('{max}', max)
            : d?.error === 'share_invalid' ? t.shareInvalid
              : t.shareFailed,
          ok: false,
        })
        return
      }
      setShareMsg({ text: t.shareSaved, ok: true })
      await load()
      onChanged?.()
    } catch {
      setShareMsg({ text: t.shareFailed, ok: false })
    } finally {
      setSavingShare(false)
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

  /**
   * Reorder within the UPCOMING list.
   *
   * The arrows used to act on the whole list, published history included, so on
   * an old queue "up" swapped an article that is still to come with one that
   * went out in July. The queue's order only ever meant the order of what is
   * still to come; the server is still sent the full order, with the finished
   * rows where they already were.
   */
  async function move(index: number, dir: -1 | 1) {
    const j = index + dir
    if (j < 0 || j >= upcoming.length) return
    const a = items.findIndex((x) => x.id === upcoming[index]!.id)
    const b = items.findIndex((x) => x.id === upcoming[j]!.id)
    if (a < 0 || b < 0) return
    const next = [...items]
    ;[next[a], next[b]] = [next[b]!, next[a]!]
    setItems(next)
    if (!pool) return
    await fetch(`/api/content/automation/pools/${pool.id}/items`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ orderedItemIds: next.map((i) => i.id) }),
    })
    onChanged?.()
  }

  /**
   * WHAT IS STILL TO COME, AND WHAT ALREADY WENT OUT — two lists, not one.
   *
   * The queue is stored and returned in `position` order, which is the order
   * the runner will work through. The screen showed that one list whole, so an
   * account with months of history opened on its THREE OLDEST PUBLISHED
   * articles — July, on a screen whose job is to say what happens next — and
   * where a published row had drifted to a position after the pending ones,
   * the dates ran backwards in the middle of the list. Reported by the owner,
   * 4 October 2026: "the publishing queues are a mess and the dates are out of
   * order."
   *
   * Upcoming keeps the queue's own order, which IS its date order: the API
   * hands each pending item the slot the runner will publish it in, in this
   * order. History is newest first, the way a log reads, and is closed until
   * asked for.
   */
  const upcoming = items.filter((i) => PENDING_STATUSES.includes(i.status))
  const history = items
    .filter((i) => !PENDING_STATUSES.includes(i.status))
    .sort((a, b) => (Date.parse(b.projectedPublishAt ?? '') || 0) - (Date.parse(a.projectedPublishAt ?? '') || 0))

  /** One queue row. `reorderable` is what tells the upcoming list from the
   *  finished one: only what is still to come has an order to change. */
  const renderRow = (it: QueueItem, idx: number, reorderable: boolean) => (
            <div key={it.id} className="flex flex-wrap items-center gap-3 py-3">
              {reorderable && (
                <div className="flex flex-col">
                  <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0} aria-label={t.moveUp}
                    className="rounded-control p-0.5 text-muted transition-colors hover:bg-sunk hover:text-ink disabled:opacity-30"><ChevronUp aria-hidden="true" className="size-4" /></button>
                  <button type="button" onClick={() => move(idx, 1)} disabled={idx === upcoming.length - 1} aria-label={t.moveDown}
                    className="rounded-control p-0.5 text-muted transition-colors hover:bg-sunk hover:text-ink disabled:opacity-30"><ChevronDown aria-hidden="true" className="size-4" /></button>
                </div>
              )}
              <div className="flex-1 min-w-[10rem]">
                <div className="truncate text-copy font-medium text-ink">{it.topicTitle}</div>
                <div className="text-caption text-muted">{fmtDay(it.projectedPublishAt, PENDING_STATUSES.includes(it.status))}{it.lastError ? ` · ${reasonLabel(it.lastError)}` : ''}</div>
              </div>
              <Badge variant={it.status === 'published' || it.status === 'generated' ? 'success' : it.status === 'failed' || it.status === 'quality_check_failed' ? 'danger' : 'neutral'}>{statusLabel(it.status)}</Badge>
              <div className="flex items-center gap-1">
                {it.status === 'publishing' && <span className="text-caption text-muted">{t.publishingNow}</span>}
                {it.status === 'published' && <span className="text-caption text-ok">{t.publishedDone}</span>}
                {/* The row's one inline action; the rest is in the row menu. */}
                {/* "Publish now" belongs to the project's first article only (lib/content/strategy/first-article.ts);
                    every other article goes out on the plan's rhythm. A failed publish keeps its retry. */}
                {it.status === 'generated' && canPublishFirstNow({ articles: articlesForFirst, queue: items, itemId: it.id }) && (
                  <Button size="sm" variant="secondary" onClick={() => publishItem(it.id)} loading={busyItem === it.id} disabled={busyItem === it.id}>
                    {busyItem === it.id ? t.publishingNow : t.publishNow}
                  </Button>
                )}
                {it.status === 'failed' && it.articleId && (
                  <Button size="sm" variant="secondary" onClick={() => publishItem(it.id)} loading={busyItem === it.id} disabled={busyItem === it.id}>
                    {busyItem === it.id ? t.publishingNow : t.retry}
                  </Button>
                )}
                {!scheduleLocked && (it.status === 'queued' || it.status === 'quality_check_failed' || (it.status === 'failed' && !it.articleId)) && (
                  <Button size="sm" variant="secondary" onClick={() => generateItem(it.id)} loading={busyItem === it.id} disabled={busyItem === it.id}>
                    {busyItem === it.id ? t.generatingArticle : t.generateNow}
                  </Button>
                )}
                {(() => {
                  const menu: RowMenuItem[] = []
                  if (it.status === 'published' && it.wpPostUrl) menu.push({ key: 'post', label: t.openPost, onSelect: () => window.open(it.wpPostUrl!, '_blank', 'noopener,noreferrer'), icon: <ExternalLink className="size-4" aria-hidden="true" /> })
                  if (it.status === 'generated' && it.articleId) menu.push({ key: 'editor', label: t.openEditor, href: `/content/articles/${it.articleId}`, icon: <FileText className="size-4" aria-hidden="true" /> })
                  if (it.status === 'skipped' || it.status === 'paused') menu.push({ key: 'unskip', label: t.retry, onSelect: () => itemAction(it.id, 'unskip'), disabled: busyItem === it.id, icon: <RotateCcw className="size-4" aria-hidden="true" /> })
                  if (it.status === 'queued') menu.push({ key: 'skip', label: t.skip, onSelect: () => itemAction(it.id, 'skip'), disabled: busyItem === it.id, icon: <SkipForward className="size-4 rtl:-scale-x-100" aria-hidden="true" /> })
                  if (it.status !== 'publishing') menu.push({ key: 'remove', label: t.remove, danger: true, onSelect: () => itemAction(it.id, 'remove'), disabled: busyItem === it.id, icon: <Trash2 className="size-4" aria-hidden="true" /> })
                  return menu.length > 0 ? <RowMenu label={`${t.queueTitle}: ${it.topicTitle}`} items={menu} /> : null
                })()}
              </div>
            </div>
  )

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
  // The plan sets the rhythm for a paid plan: the day picker does not apply, the
  // screen says what the plan gives (the dates below are the real ones).
  const planRhythm = rhythm?.source === 'plan' ? rhythm : null
  const rhythmLine = planRhythm
    // More sites than a weekly rhythm can serve: this one publishes every N
    // days instead of on a fixed weekday, so the line names the gap.
    ? planRhythm.intervalDays
      ? t.planRhythmGapLine.replace('{n}', String(planRhythm.intervalDays))
      : (planRhythm.perWeek === 1 ? t.planRhythmLineOne : t.planRhythmLine)
        .replace('{n}', String(planRhythm.perWeek))
        .replace('{days}', planRhythm.weekdays.map((d) => t.weekdays[d]).join(', '))
    : rhythm?.source === 'trial' ? t.trialRhythmLine : null

  /**
   * The split panel. Offered only on a plan with more than one website — on a
   * one-site plan there is nothing to divide — and only once the queue exists,
   * since the number is stored on the queue.
   */
  const shareRhythm = planRhythm && planRhythm.multiSite === true && pool ? planRhythm : null
  const sharePanel = shareRhythm ? (
    <div className="mt-3" data-article-share="">
      <div className="text-copy font-semibold text-ink">{t.shareTitle}</div>
      <div className="mt-2 flex flex-wrap items-end gap-2">
        <label className="inline-flex flex-col gap-1.5 text-caption font-semibold text-ink">
          {t.shareLabel}
          <input
            type="number"
            min={1}
            max={shareRhythm.maxShare ?? undefined}
            inputMode="numeric"
            value={shareInput}
            placeholder={t.shareEven}
            aria-label={t.shareLabel}
            onChange={(e) => { setShareInput(e.target.value); setShareMsg(null) }}
            disabled={savingShare}
            data-article-share-input=""
            className={cn(FIELD_CLASSES, 'h-9 w-28 py-1')}
          />
        </label>
        <Button size="sm" variant="secondary" onClick={() => saveShare()} disabled={savingShare} data-article-share-save="">
          {t.shareSave}
        </Button>
      </div>
      <p className="mt-2 max-w-prose text-caption text-muted" data-article-share-help="">
        {t.shareHelp
          .replace('{left}', String(shareRhythm.maxShare ?? 0))
          .replace('{total}', String(shareRhythm.accountMonthly ?? 0))
          .replace('{max}', String(shareRhythm.maxShare ?? 0))}
      </p>
      {shareMsg && <Notice tone={shareMsg.ok ? 'ok' : 'bad'} className="mt-2">{shareMsg.text}</Notice>}
    </div>
  ) : null

  // Flat inside the strategy's "advanced" card, below a divider (final review R14).
  return (
    <div data-auto-schedule="">
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-section font-semibold text-ink">{t.title}</h3>
        <Badge variant={active ? 'success' : 'neutral'}>{active ? t.active : t.paused}</Badge>
      </div>
      <p className="mt-1 mb-4 max-w-prose text-copy text-muted">{t.intro}</p>

      {message && <Notice tone={message.ok ? 'ok' : 'bad'} className="mb-3">{message.text}</Notice>}

      {/* Part א — schedule settings. Compact single row (cadence · publish day(s) ·
          actions); stacks on mobile. Exact time/timezone stay internal (hidden).
          It sits on the page surface; no inner panel (final review R14). */}
      <div className="mb-2 text-copy font-semibold text-ink">{t.settingsTitle}</div>
      <div className="space-y-3">
        <div className="flex flex-wrap items-end gap-x-4 gap-y-3">
          {/* Cadence — the owner's choice only when the plan does not set it */}
          {scheduleLocked ? (
            <div className="min-w-0">
              <p className="min-w-0 max-w-prose text-copy text-body" data-plan-rhythm="">{rhythmLine}</p>
              {sharePanel}
            </div>
          ) : (<>
          <div className="min-w-0 max-w-full">
            <div className="mb-1.5 text-caption font-semibold text-ink">{t.cadenceLabel}</div>
            <div className="flex flex-wrap items-center gap-2">
              {/* Three long options do not fit a phone: a Select below sm, the
                  Segmented from sm (same state, same values). */}
              <div className="w-full sm:hidden" data-cadence-select="">
                <Select
                  id="automation-cadence"
                  aria-label={t.cadenceLabel}
                  value={preset}
                  onChange={(e) => setPreset(e.target.value as Preset)}
                  options={cadenceOptions}
                />
              </div>
              <div className="hidden sm:block">
                <Segmented<Preset>
                  ariaLabel={t.cadenceLabel}
                  value={preset}
                  onChange={setPreset}
                  options={cadenceOptions}
                  className="max-w-full"
                />
              </div>
              {preset === 'custom' && (
                <label className="inline-flex items-center gap-1.5 text-caption text-body">
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
              <div className="mb-1.5 text-caption font-semibold text-ink">{t.weekdayLabel}</div>
              <div className="flex flex-wrap items-center gap-1.5">
                <Select value={String(weekdays[0] ?? 0)} aria-label={t.weekdayLabel}
                  onChange={(e) => setWeekdays(preset === 'weekly1' ? [Number(e.target.value)] : [Number(e.target.value), weekdays[1] ?? DEFAULT_DAYS_2[1]!])}
                  options={weekdayOptions} className="h-9 w-auto" />
                {preset === 'weekly2' && (
                  <Select value={String(weekdays[1] ?? DEFAULT_DAYS_2[1]!)} aria-label={t.weekdayLabel}
                    onChange={(e) => setWeekdays([weekdays[0] ?? DEFAULT_DAYS_2[0]!, Number(e.target.value)])}
                    options={weekdayOptions} className="h-9 w-auto" />
                )}
              </div>
            </div>
          )}
          </>)}

          {/* Actions */}
          <div className="ms-auto flex items-center gap-2">
            {!scheduleLocked && <Button size="sm" onClick={() => saveSettings()} loading={saving} disabled={saving}>{saving ? t.saving : t.save}</Button>}
            <Button size="sm" variant="secondary" onClick={togglePause} disabled={saving} title={t.resumeHint}>{active ? t.pause : t.resume}</Button>
          </div>
        </div>

        {/* Publish-day note + next publish on one compact line */}
        <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 pt-0.5">
          <p className="text-caption text-muted">{scheduleLocked ? t.noWeekendNote : `${t.publishDayNote} ${t.noWeekendNote}`}</p>
          <div className="text-caption text-muted">
            {t.nextPublish}: <span className="font-semibold text-ink">{fmtDay(pool?.nextPublishAt ?? null, true)}</span>
          </div>
        </div>

        {/* Phase 3C — visible alert when the automatic-publishing queue needs
            attention (a scheduled publish/generation failed, an item is stuck, or
            the queue is overdue with nothing to publish). */}
        {health?.needsAttention && (
          <Notice tone="warn" items={[
            health.failedCount > 0 ? t.alertFailed.replace('{n}', String(health.failedCount)) : null,
            health.stuckCount > 0 ? t.alertStuck.replace('{n}', String(health.stuckCount)) : null,
            health.overdue ? t.alertOverdue : null,
            health.latestError ? reasonLabel(health.latestError) : null,
          ].filter((x): x is string => !!x)}>
            <span className="block font-semibold">{t.alertNeedsAttention}</span>
            <span className="block text-body">{t.alertHint}</span>
          </Notice>
        )}

        {/* Safety A — the alert store is a required dependency; if its migration
            is missing, say so clearly instead of showing a healthy-looking zero. */}
        {alertsMigrationMissing && (
          <Notice tone="bad">{t.alertsMigrationMissing}</Notice>
        )}

        {/* Phase 4B.1 — persisted final-failure alerts: one per item after the
            LAST failed publish attempt, with view / retry-now / dismiss. */}
        {alerts.length > 0 && (
          <div className="mt-2 space-y-2">
            {alerts.map((a) => (
              <Notice
                key={a.id}
                tone="bad"
                onDismiss={() => dismissAlert(a.id)}
                action={a.poolItemId && busyItem !== a.poolItemId ? { label: t.alertRetryNow, onClick: () => retryFromAlert(a.poolItemId!) } : null}
              >
                <span className="block font-semibold">{presentAlert(a, alertDict).heading}</span>
                <span className="block break-words text-body">{presentAlert(a, alertDict).detail}</span>
                {a.articleId && (
                  <Link href={`/content/articles/${a.articleId}`} className="mt-1 inline-flex text-caption font-semibold text-action hover:underline">
                    {t.alertViewArticle}
                  </Link>
                )}
              </Notice>
            ))}
          </div>
        )}
      </div>

      {/* Part ב — publishing queue (add approved topics + the queue list below).
          A thin top divider separates it from the settings panel above. */}
      <div className="mt-6 border-t border-line pt-6">
        <h4 className="mb-2 text-copy font-semibold text-ink">{t.addApprovedTitle}</h4>
        {approved.length === 0 ? (
          <p className="text-caption text-muted">{t.noApproved}</p>
        ) : (
          <div className="space-y-2">
            {(approvedExpanded ? approved : approved.slice(0, 3)).map((tp) => (
              <div key={tp.id} className="rounded-control px-2 py-1.5 transition-colors hover:bg-sunk/60">
                <Checkbox checked={selected.has(tp.id)} onChange={() => toggle(tp.id)} label={<span className="text-copy text-body">{tp.topic}</span>} />
              </div>
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
            <Button size="sm" variant="secondary" onClick={addSelected} loading={saving} disabled={saving || selected.size === 0}>
              {t.addSelected} ({selected.size})
            </Button>
          </div>
        )}
      </div>

      {/* Queue */}
      <div className="mt-6">
        <h4 className="mb-2 text-copy font-semibold text-ink">{t.queueTitle}</h4>
        {loading ? (
          <div role="status" aria-busy="true" className="space-y-2">
            <span className="sr-only">{t.queueTitle}</span>
            {[0, 1].map((i) => <Skeleton key={i} className="h-16 rounded-inset" />)}
          </div>
        ) : upcoming.length === 0 ? (
          <p className="rounded-inset border border-dashed border-line-strong px-4 py-5 text-center text-copy text-muted">{t.queueEmpty}</p>
        ) : (
          <div className="list-enter divide-y divide-line border-y border-line">
            {(queueExpanded ? upcoming : upcoming.slice(0, 3)).map((it, idx) => renderRow(it, idx, true))}
            {upcoming.length > 3 && (
              <div className="py-3">
                <button
                  type="button"
                  onClick={() => setQueueExpanded((v) => !v)}
                  className="inline-flex h-8 items-center justify-center gap-1 rounded-pill border border-line bg-surface px-3.5 text-caption font-semibold text-action shadow-control transition-colors hover:border-line-strong hover:bg-action-soft"
                >
                  {queueExpanded ? t.showLess : `${t.showMore} (${upcoming.length - 3})`}
                </button>
              </div>
            )}
          </div>
        )}
      </div>

      {/* WHAT ALREADY WENT OUT — closed until asked for. It is a log, so it
          reads newest first and has no arrows: its order is a fact, not a
          choice. Keeping it out of the queue above is what stops a screen
          about the next article from opening on one published in July. */}
      {history.length > 0 && (
        <div className="mt-6">
          <button
            type="button"
            onClick={() => setHistoryOpen((v) => !v)}
            aria-expanded={historyOpen}
            className="inline-flex items-center gap-1.5 rounded-control text-copy font-semibold text-ink hover:text-action focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20"
          >
            <ChevronDown aria-hidden="true" className={cn('size-4 shrink-0 transition-transform duration-150', historyOpen && 'rotate-180')} />
            {t.publishedTitle} ({history.length})
          </button>
          {historyOpen && (
            <div className="mt-2 list-enter divide-y divide-line border-y border-line">
              {history.map((it) => renderRow(it, 0, false))}
            </div>
          )}
        </div>
      )}

      {/* Admin/QA tools — collapsed by default so normal clients aren't confused
          by the manual run action. */}
      <details className="group mt-6 border-t border-line pt-4">
        <summary className="inline-flex cursor-pointer select-none list-none items-center gap-1.5 rounded-control text-caption font-semibold text-muted hover:text-ink focus-visible:outline-none focus-visible:ring-4 focus-visible:ring-action/20 [&::-webkit-details-marker]:hidden">
          <ChevronDown aria-hidden="true" className="size-4 shrink-0 transition-transform duration-150 group-open:rotate-180" />
          {t.advancedTitle}
        </summary>
        {/* Distinct soft block: this acts on the EXISTING publishing queue only —
            visually separated from the "add approved topics to queue" area above. */}
        <div className="mt-3 space-y-2">
          <p className="text-caption font-medium text-body">{t.runNowSectionTitle}</p>
          <Button size="sm" variant="secondary" onClick={runNow} loading={runningNow} disabled={runningNow}>
            {runningNow ? t.runNowRunning : t.runNowLabel}
          </Button>
          <p className="text-caption text-muted">{t.runNowHelper}</p>
          {runMsg && (
            <Notice tone={runMsg.tone === 'ok' ? 'ok' : runMsg.tone === 'error' ? 'bad' : 'info'}>
              {runMsg.text}
            </Notice>
          )}
        </div>
      </details>
    </div>
  )
}
