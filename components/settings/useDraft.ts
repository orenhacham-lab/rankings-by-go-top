'use client'

import { useCallback, useEffect, useState } from 'react'

/**
 * A card's working copy of its saved values.
 *
 * It starts as the saved values and follows them when they change underneath
 * it (a site scan finished, another card's save answered with fresh data) for
 * as long as the owner has not touched it. Once they have, their draft stays
 * until they save or discard it: a scan finishing in the background never
 * wipes what someone is typing.
 */
export function useDraft<T>(saved: T, same: (a: T, b: T) => boolean) {
  const [state, setState] = useState({ saved, draft: saved })

  // The saved values moved: adopt them, and the draft with them if it was clean.
  let current = state
  if (!same(state.saved, saved)) {
    current = { saved, draft: same(state.draft, state.saved) ? saved : state.draft }
    setState(current)
  }

  const setDraft = useCallback((update: (draft: T) => T) => setState((s) => ({ ...s, draft: update(s.draft) })), [])
  const discard = useCallback(() => setState((s) => ({ ...s, draft: s.saved })), [])
  /** A save answered: these are the saved values now, and the draft is them. */
  const commit = useCallback((next: T) => setState({ saved: next, draft: next }), [])

  return { draft: current.draft, dirty: !same(current.draft, current.saved), setDraft, discard, commit }
}

/** "Now", refreshed every `everyMs`, for relative times that must not go stale on an open tab. */
export function useClock(everyMs = 30_000): Date {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), everyMs)
    return () => window.clearInterval(id)
  }, [everyMs])
  return now
}
