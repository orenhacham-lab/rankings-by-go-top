'use client'

/**
 * One GET per URL per screen, with an explicit loading state (see ./known).
 *
 * A screen often asks the same status from several components at once: the
 * settings screen's platform card and the WordPress panel under it both read
 * /api/wordpress/connection. They mount together, share one request, and agree.
 * A response is shared for a few seconds only, so a connection made elsewhere
 * shows as soon as the merchant comes back; `reload` asks again at once.
 *
 * What a component gets is `null` until the answer arrives: it is never given a
 * made-up "nothing connected" to draw in the meantime.
 */
import { useCallback, useEffect, useState } from 'react'
import type { ReadResponse } from './known'

const SHARE_MS = 10_000
type Entry = { at: number; promise: Promise<ReadResponse>; value?: ReadResponse }
const shared = new Map<string, Entry>()

function request(url: string, fresh: boolean): Promise<ReadResponse> {
  const hit = shared.get(url)
  if (!fresh && hit && Date.now() - hit.at < SHARE_MS) return hit.promise
  const entry: Entry = { at: Date.now(), promise: Promise.resolve({ status: 0, body: null }) }
  entry.promise = fetch(url, { cache: 'no-store' })
    .then(async (res) => ({ status: res.status, body: await res.json().catch(() => null) }))
    // A network failure is status 0: an error, never "not connected".
    .catch(() => ({ status: 0, body: null }))
    .then((response) => { entry.value = response; return response })
  shared.set(url, entry)
  return entry.promise
}

/** The answer already in hand for `url`, if another component of the screen (or a
 *  prefetch) read it moments ago: lets a card draw its final state on its first render. */
export function peekKnownRead(url: string | null): ReadResponse | undefined {
  if (!url) return undefined
  const hit = shared.get(url)
  return hit && Date.now() - hit.at < SHARE_MS ? hit.value : undefined
}

/**
 * The same shared read, for code that is not a hook (a component's own refresh):
 * `fresh` asks again past the sharing window; otherwise a request another
 * component of the screen already made is joined, not repeated.
 */
export function readKnown(url: string, { fresh = false }: { fresh?: boolean } = {}): Promise<ReadResponse> {
  return request(url, fresh)
}

/** A response already in hand (a server render, a test), served as if it had just been fetched. */
export function primeKnownRead(url: string, response: ReadResponse): void {
  shared.set(url, { at: Date.now(), promise: Promise.resolve(response), value: response })
}

/** Forget a URL, so the next reader asks again (after a write that changed it). */
export function forgetKnownRead(url: string): void {
  shared.delete(url)
}

/**
 * The response for `url` (null while it has not answered; `url` null asks nothing).
 * `reload` asks again past the sharing window and is loading until it answers.
 */
export function useKnownRead(url: string | null): { response: ReadResponse | null; reload: () => Promise<void> } {
  const [result, setResult] = useState<{ url: string; response: ReadResponse } | null>(() => {
    const primed = peekKnownRead(url)
    return url && primed ? { url, response: primed } : null
  })

  useEffect(() => {
    if (!url) return
    let cancelled = false
    void request(url, false).then((response) => { if (!cancelled) setResult({ url, response }) })
    return () => { cancelled = true }
  }, [url])

  // A reload keeps what is on screen until the new answer arrives: a panel that
  // re-reads after a save must not blink back to its skeleton.
  const reload = useCallback(async () => {
    if (!url) return
    const response = await request(url, true)
    setResult({ url, response })
  }, [url])

  // An answer for another URL (another project) is not this one's: loading.
  return { response: result && result.url === url ? result.response : null, reload }
}
