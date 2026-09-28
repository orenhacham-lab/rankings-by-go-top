'use client'

/**
 * The content strategy board's own actions on an idea: approve, not a fit, swap, and
 * "add a keyword". Every request, and what each answer means, is in
 * lib/content/strategy/ideas.ts; this hook sends them on a click and nothing else, keeps
 * the board showing what was just done until a fresh read shows it too (optimistic),
 * and says every result in the screen's own words. A failure puts the idea back and
 * says so; no text from a route or a provider ever reaches the screen.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import {
  applyIdeaOverrides, approveRequest, deferIdea, keywordRequest, normalizeKeyword, overrideSettled,
  readApproveOutcome, readRejectOutcome, rejectRequest,
  type IdeaOutcome, type IdeaOverride, type IdeaRequest, type IdeaTarget,
} from '@/lib/content/strategy/ideas'
import { sameTopicKey, type StrategyData } from '@/lib/content/strategy/board'
import type { getDashboardDictionary } from '@/lib/i18n/dashboard/getDashboardDictionary'

type Dict = ReturnType<typeof getDashboardDictionary>
type Copy = Dict['contentStrategy']['ideaActions']
type Toasts = { success: (text: string) => void; error: (text: string) => void }

const TIMEOUT_MS = 30_000
/** A settled action whose effect a fresh read never showed (renamed on the server) stops standing in after this. */
const STALE_MS = 30_000

export type IdeaBusy = 'approve' | 'reject'
type Held = IdeaOverride & { doneAt?: number }
type Scoped = {
  projectId: string
  overrides: Held[]
  busy: Record<string, IdeaBusy>
  deferred: string[]
  approvedNow: string[]
  announcement: string
}
const empty = (projectId: string): Scoped => ({ projectId, overrides: [], busy: {}, deferred: [], approvedNow: [], announcement: '' })

async function send(req: IdeaRequest): Promise<{ ok: boolean; body: unknown }> {
  const controller = new AbortController()
  const timer = window.setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(req.url, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body), signal: controller.signal,
    })
    const body = await res.json().catch(() => null)
    return { ok: res.ok, body }
  } catch {
    return { ok: false, body: null }
  } finally {
    window.clearTimeout(timer)
  }
}

function outcomeCopy(a: Copy, o: IdeaOutcome, created: string, failed: string): string {
  return o === 'created' ? created : o === 'existing' ? a.existing : o === 'covered' ? a.covered : failed
}

export function useIdeaActions({ projectId, automation, dict, toast, onChanged }: {
  projectId: string
  automation: boolean
  dict: Dict
  toast: Toasts
  /** Read the board (and the workspace's topics) again after a change. */
  onChanged: () => void
}) {
  const a = dict.contentStrategy.ideaActions
  const [state, setState] = useState<Scoped>(() => empty(projectId))
  const inFlight = useRef(new Set<string>())
  // Another project: nothing carries over (adjusted while rendering, not in an effect).
  if (state.projectId !== projectId) setState(empty(projectId))
  const scope = state.projectId === projectId ? state : empty(projectId)

  // Every update is dropped when it lands after the project changed.
  const update = useCallback((fn: (s: Scoped) => Scoped) => {
    setState((s) => (s.projectId === projectId ? fn(s) : s))
  }, [projectId])
  const ops = useMemo(() => ({
    hold: (o: Held) => update((s) => ({ ...s, overrides: [...s.overrides.filter((x) => x.key !== o.key), o] })),
    drop: (key: string) => update((s) => ({ ...s, overrides: s.overrides.filter((x) => x.key !== key) })),
    settle: (key: string) => update((s) => ({ ...s, overrides: s.overrides.map((x) => (x.key === key ? { ...x, doneAt: Date.now() } : x)) })),
    busy: (key: string, v: IdeaBusy | null) => update((s) => {
      const busy = { ...s.busy }
      if (v) busy[key] = v; else delete busy[key]
      return { ...s, busy }
    }),
    approvedNow: (title: string) => update((s) => ({ ...s, approvedNow: [...s.approvedNow, sameTopicKey(title)] })),
    announce: (text: string) => update((s) => ({ ...s, announcement: text })),
  }), [update])

  const say = useCallback((text: string, kind: 'success' | 'error') => {
    ops.announce(text)
    if (kind === 'success') toast.success(text); else toast.error(text)
  }, [ops, toast])

  const approve = useCallback(async (t: IdeaTarget) => {
    if (!projectId || inFlight.current.has(t.key)) return
    inFlight.current.add(t.key)
    ops.busy(t.key, 'approve')
    ops.hold({ kind: 'approve', key: t.key, ideaId: t.ideaId, title: t.title, keyword: t.keyword, reason: t.reason, at: new Date().toISOString() })
    const req = approveRequest(t, projectId, automation)
    const { ok, body } = await send(req)
    const outcome = readApproveOutcome(req.url, ok, body)
    if (outcome === 'created') {
      ops.settle(t.key)
      ops.approvedNow(t.title)
    } else {
      // "existing" and "covered" leave no topic of this title to wait for; a failure undoes it.
      ops.drop(t.key)
    }
    say(outcomeCopy(a, outcome, a.approved, a.approveError), outcome === 'failed' ? 'error' : 'success')
    if (outcome !== 'failed') onChanged()
    ops.busy(t.key, null)
    inFlight.current.delete(t.key)
  }, [projectId, automation, a, ops, say, onChanged])

  const reject = useCallback(async (t: IdeaTarget) => {
    if (!projectId || !t.ideaId || inFlight.current.has(t.key)) return
    inFlight.current.add(t.key)
    ops.busy(t.key, 'reject')
    ops.hold({ kind: 'reject', key: t.key, ideaId: t.ideaId })
    const { ok, body } = await send(rejectRequest(t.ideaId, projectId))
    if (readRejectOutcome(ok, body)) {
      ops.settle(t.key)
      say(a.rejected, 'success')
      onChanged()
    } else {
      ops.drop(t.key)
      say(a.rejectError, 'error')
    }
    ops.busy(t.key, null)
    inFlight.current.delete(t.key)
  }, [projectId, a, ops, say, onChanged])

  /** No request: the next pending idea takes its place, and nothing is rejected. */
  const swap = useCallback((t: IdeaTarget) => {
    update((s) => ({ ...s, deferred: deferIdea(s.deferred, t.key), announcement: a.swapped }))
  }, [a, update])

  /** `ok` when the field can close (added, or already there); otherwise the line to show under it. */
  const addKeyword = useCallback(async (raw: string): Promise<{ ok: boolean; error?: string }> => {
    const keyword = normalizeKeyword(raw)
    if (!keyword) return { ok: false, error: a.keywordInvalid }
    const key = `keyword:${sameTopicKey(keyword)}`
    if (!projectId || inFlight.current.has(key)) return { ok: false }
    inFlight.current.add(key)
    ops.hold({ kind: 'keyword', key, title: keyword, at: new Date().toISOString() })
    const req = keywordRequest(keyword, projectId)
    const { ok, body } = await send(req)
    const outcome = readApproveOutcome(req.url, ok, body)
    if (outcome === 'created') { ops.settle(key); ops.approvedNow(keyword) } else ops.drop(key)
    inFlight.current.delete(key)
    if (outcome === 'failed') { ops.announce(a.keywordError); return { ok: false, error: a.keywordError } }
    say(outcomeCopy(a, outcome, a.keywordAdded, a.keywordError), 'success')
    onChanged()
    return { ok: true }
  }, [projectId, a, ops, say, onChanged])

  const { overrides } = scope
  /** The rows the board is built from, with what was just done applied. */
  const view = useCallback((data: StrategyData) => applyIdeaOverrides(data, overrides), [overrides])

  /** A fresh read that shows an action (or one that settled long ago) retires its stand-in. */
  const prune = useCallback((data: StrategyData) => {
    update((s) => {
      const now = Date.now()
      const kept = s.overrides.filter((o) => !(o.doneAt !== undefined && (overrideSettled(data, o) || now - o.doneAt > STALE_MS)))
      return kept.length === s.overrides.length ? s : { ...s, overrides: kept }
    })
  }, [update])

  const approvedNow = useMemo(() => new Set(scope.approvedNow), [scope.approvedNow])

  return { approve, reject, swap, addKeyword, view, prune, busy: scope.busy, deferred: scope.deferred, approvedNow, announcement: scope.announcement }
}

export type IdeaActions = ReturnType<typeof useIdeaActions>
