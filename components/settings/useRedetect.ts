'use client'

import { useCallback, useRef, useState } from 'react'
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
