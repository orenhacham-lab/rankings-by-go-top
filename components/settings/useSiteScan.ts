'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n/locales'
import type { RescanView } from '@/lib/project-settings/types'
import { rescanNotice, retryAfterFrom, type RescanNotice } from '@/lib/project-settings/view'

/** How often a running scan is read, and for how long (stage A has about a minute). */
export const SCAN_POLL_MS = 3_000
export const SCAN_MAX_POLLS = 60

const sleep = (ms: number) => new Promise<void>((resolve) => window.setTimeout(resolve, ms))

type RunRead = { http: number; status: string | null; stalled: boolean } | null

async function readRun(projectId: string): Promise<RunRead> {
  try {
    const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/seed`, { cache: 'no-store' })
    const body = (await res.json().catch(() => null)) as { run?: { status?: unknown; stalled?: unknown } | null } | null
    const run = body?.run && typeof body.run === 'object' ? body.run : null
    return { http: res.status, status: typeof run?.status === 'string' ? run.status : null, stalled: run?.stalled === true }
  } catch {
    return null
  }
}

/**
 * "Scan the site again": start a run through the seed route, then follow it
 * until it ends and reload what it filled. Every answer of the route becomes
 * ONE notice (lib/project-settings/view.ts rescanNotice); nothing the route or
 * a provider said is shown.
 *
 * A run that was already going when the screen opened (from onboarding, or
 * another tab) is followed the same way.
 */
export function useSiteScan({
  projectId,
  enabled,
  rescan,
  locale,
  onFinished,
}: {
  projectId: string
  enabled: boolean
  rescan: RescanView | null
  locale: Locale
  /** Reload what the scan may have changed: the settings, and the project row. */
  onFinished: () => void | Promise<void>
}) {
  const [phase, setPhase] = useState<'idle' | 'starting' | 'following'>('idle')
  const [notice, setNotice] = useState<RescanNotice | null>(null)
  // The end of the run this screen followed was seen, even if the reload after it failed.
  const [endSeen, setEndSeen] = useState(false)
  const generation = useRef(0)
  const finished = useRef(onFinished)
  useEffect(() => {
    finished.current = onFinished
  })
  useEffect(
    () => () => {
      generation.current++
    },
    [],
  )

  const follow = useCallback(
    async (mine: number) => {
      let outcome: 'ended' | 'slow' | 'signed_out' | 'gone' = 'slow'
      let ended: string | null = null
      for (let i = 0; i < SCAN_MAX_POLLS; i++) {
        await sleep(SCAN_POLL_MS)
        if (mine !== generation.current) return
        const read = await readRun(projectId)
        if (mine !== generation.current) return
        // A network blip or a 5xx: read again on the next tick.
        if (!read || read.http >= 500) continue
        if (read.http === 401) {
          outcome = 'signed_out'
          break
        }
        if (read.http !== 200) {
          outcome = 'gone'
          break
        }
        if (read.status === 'running' && !read.stalled) continue
        outcome = 'ended'
        ended = read.status
        break
      }
      if (mine !== generation.current) return
      setNotice(
        outcome === 'slow'
          ? { kind: 'slow' }
          : outcome === 'signed_out'
            ? { kind: 'signed_out' }
            : ended === 'done' || ended === 'partial'
              ? { kind: 'finished' }
              : null,
      )
      setEndSeen(true)
      setPhase('idle')
      await finished.current()
    },
    [projectId],
  )

  // A run already going when the screen opened: follow it to its end.
  const liveFromData = enabled && rescan?.latest?.live === true
  useEffect(() => {
    if (!liveFromData) return
    const mine = ++generation.current
    void follow(mine)
  }, [liveFromData, follow])

  const start = useCallback(async () => {
    if (!enabled || phase !== 'idle') return
    const mine = ++generation.current
    setPhase('starting')
    setNotice(null)
    setEndSeen(false)

    let status = 0
    let code: unknown = null
    let retryAfter: number | null = null
    try {
      const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/seed`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'start', locale }),
      })
      status = res.status
      const body = (await res.json().catch(() => null)) as { code?: unknown } | null
      code = body?.code
      retryAfter = retryAfterFrom(res.headers.get('Retry-After'), body)
    } catch {
      // No answer at all reads as "could not start", with a retry.
    }
    if (mine !== generation.current) return
    const next = rescanNotice(status, code, retryAfter)
    setNotice(next)
    if (next.kind === 'started' || next.kind === 'in_progress') {
      setPhase('following')
      void follow(mine)
    } else {
      setPhase('idle')
    }
  }, [enabled, phase, projectId, locale, follow])

  const dismiss = useCallback(() => setNotice(null), [])
  // A run is going: the one this screen started, or one that was going when it opened.
  const following = phase === 'following' || (liveFromData && !endSeen)
  return {
    phase,
    following,
    /** Starting or following: the fields a scan fills are about to change. */
    busy: phase !== 'idle' || following,
    notice,
    start,
    dismiss,
  }
}

export type SiteScan = ReturnType<typeof useSiteScan>
