'use client'

/**
 * The project's latest run, as the server reports it (GET /api/projects/[id]/seed),
 * read again while stage A works.
 *
 * The screen never moves on by a clock of its own: a step shows as done only
 * once the server says it is, so a refresh, a second tab or a slow site all
 * show the same truth. How often to read is pollDelay's decision
 * (lib/onboarding/summary-view.ts): soon while stage A works, rarely while it
 * is stalled, never once it has ended, and less often after failed reads.
 */
import { useCallback, useEffect, useRef, useState } from 'react'
import { startNotice, type Notice } from '@/lib/onboarding/notices'
import { pollDelay } from '@/lib/onboarding/summary-view'
import type { SeedRunView } from '@/lib/seed-scan/types'

/** Reads after a start before the screen stops waiting for the new run and shows whatever the server has. */
const MAX_AWAIT_READS = 20

type ReadState = {
  run: SeedRunView | null
  /** Reads in a row that did not reach an answer. */
  failures: number
  /** The server refused to show the run: the session ended, or the project is not available. */
  readError: Notice | null
  /** A start this screen made: the run it replaces, read until a newer one arrives. */
  awaiting: { replaces: string | null; reads: number } | null
}

export type SeedRunReader = {
  run: SeedRunView | null
  readError: Notice | null
  /** The last read failed; the screen says so and keeps trying. */
  reconnecting: boolean
  /** A start was accepted and its run has not been read yet. */
  awaitingStart: boolean
  /** Read the run now. */
  refresh: () => void
  /** A start was accepted: read until its run arrives. */
  expectNewRun: () => void
}

export function useSeedRun(projectId: string, initialRun: SeedRunView | null): SeedRunReader {
  const [state, setState] = useState<ReadState>({ run: initialRun, failures: 0, readError: null, awaiting: null })
  const [wake, setWake] = useState(0)
  const readNow = useRef(false)

  useEffect(() => {
    if (state.readError) return
    const delay = readNow.current ? 0 : pollDelay(state.run, state.failures, state.awaiting !== null)
    if (delay === null) return
    const controller = new AbortController()
    const timer = window.setTimeout(async () => {
      readNow.current = false
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/seed`, {
          cache: 'no-store',
          signal: controller.signal,
        })
        const body = (await res.json().catch(() => null)) as { ok?: unknown; run?: SeedRunView | null } | null
        if (controller.signal.aborted) return
        if (res.ok && body?.ok === true) {
          const run = body.run ?? null
          setState((s) => {
            let awaiting = s.awaiting
            if (awaiting) {
              const arrived = run !== null && run.id !== awaiting.replaces
              awaiting = arrived || awaiting.reads + 1 >= MAX_AWAIT_READS ? null : { ...awaiting, reads: awaiting.reads + 1 }
            }
            return { run, failures: 0, readError: null, awaiting }
          })
        } else if (res.status === 401 || res.status === 404) {
          setState((s) => ({ ...s, readError: startNotice(res.status, body), awaiting: null }))
        } else {
          setState((s) => ({ ...s, failures: s.failures + 1 }))
        }
      } catch {
        if (controller.signal.aborted) return
        setState((s) => ({ ...s, failures: s.failures + 1 }))
      }
    }, delay)
    return () => {
      window.clearTimeout(timer)
      controller.abort()
    }
  }, [projectId, state, wake])

  // Back on the tab after a while: read at once instead of waiting out a long backoff.
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState !== 'visible') return
      readNow.current = true
      setWake((w) => w + 1)
    }
    document.addEventListener('visibilitychange', onVisible)
    return () => document.removeEventListener('visibilitychange', onVisible)
  }, [])

  const refresh = useCallback(() => {
    readNow.current = true
    setWake((w) => w + 1)
  }, [])

  const expectNewRun = useCallback(() => {
    readNow.current = true
    setState((s) => ({ ...s, failures: 0, readError: null, awaiting: { replaces: s.run?.id ?? null, reads: 0 } }))
  }, [])

  return {
    run: state.run,
    readError: state.readError,
    reconnecting: state.failures > 0,
    awaitingStart: state.awaiting !== null,
    refresh,
    expectNewRun,
  }
}
