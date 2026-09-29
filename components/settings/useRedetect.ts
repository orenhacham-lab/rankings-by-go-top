'use client'

import { useCallback, useEffect, useRef, useState } from 'react'
import type { Locale } from '@/lib/i18n/locales'
import type { RedetectSection, RedetectSuggestions } from '@/lib/project-settings/types'
import { knownRedetectCode, redetectNotice, retryAfterFrom, type RedetectNotice } from '@/lib/project-settings/view'

/**
 * "Detect again with AI" for one section: one request to the redetect route,
 * which answers suggestions or a stable code. Suggestions are only held here
 * until the owner picks what goes into the form; nothing is saved by this.
 *
 * One request at a time from this screen (the route also allows only one per
 * project, so a second tab gets "already detecting" rather than a second
 * model call).
 */
export function useRedetect<S extends RedetectSection>(projectId: string, section: S) {
  const [working, setWorking] = useState(false)
  const [notice, setNotice] = useState<RedetectNotice | null>(null)
  const [suggestions, setSuggestions] = useState<RedetectSuggestions[S] | null>(null)
  // Each answer gets its own number, so the panel starts fresh on every answer.
  const [answer, setAnswer] = useState(0)
  const busy = useRef(false)

  const run = useCallback(
    async (locale: Locale) => {
      if (busy.current) return
      busy.current = true
      setWorking(true)
      setNotice(null)
      setSuggestions(null)
      try {
        const res = await fetch(`/api/projects/${encodeURIComponent(projectId)}/redetect`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ section, locale }),
        })
        const body = (await res.json().catch(() => null)) as
          | { ok?: unknown; section?: unknown; suggestions?: unknown; code?: unknown }
          | null
        if (res.ok && body?.ok === true && body.section === section && body.suggestions && typeof body.suggestions === 'object') {
          setSuggestions(body.suggestions as RedetectSuggestions[S])
          setAnswer((n) => n + 1)
        } else {
          setNotice(redetectNotice(knownRedetectCode(body?.code), retryAfterFrom(res.headers.get('Retry-After'), body)))
        }
      } catch {
        setNotice({ kind: 'failed' })
      } finally {
        busy.current = false
        setWorking(false)
      }
    },
    [projectId, section],
  )

  /** A notice the screen already knows the route would give (no scan yet), without asking it. */
  const preempt = useCallback((next: RedetectNotice) => {
    setSuggestions(null)
    setNotice(next)
  }, [])

  const clear = useCallback(() => {
    setSuggestions(null)
    setNotice(null)
  }, [])

  return { working, notice, suggestions, answer, run, preempt, clear }
}

/**
 * One "detect again with AI" for the whole group of business cards (review P2-6: the same button
 * three times read as three different things). The screen runs the cards one after another (the
 * route allows one detection per project at a time); `turn` changes when it is this card's turn,
 * and the card answers `done(stop)`, stop meaning "no scan yet: the others would say the same".
 */
export type RedetectChain = {
  /** A new number each time it becomes this card's turn; 0 while it is not. */
  turn: number
  done: (stop: boolean) => void
  /** Only the group's first card carries the button. */
  lead: { working: boolean; start: () => void } | null
}

/** Run the card's own detection when the group reaches it. */
export function useChainTurn(chain: RedetectChain | undefined, act: () => Promise<boolean>) {
  const seen = useRef(0)
  const latest = useRef({ chain, act })
  useEffect(() => { latest.current = { chain, act } })
  const turn = chain?.turn ?? 0
  useEffect(() => {
    if (!turn || turn === seen.current) return
    seen.current = turn
    const { chain: c, act: run } = latest.current
    void run().then((stop) => c?.done(stop), () => c?.done(false))
  }, [turn])
}
