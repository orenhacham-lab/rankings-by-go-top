'use client'

/**
 * THE META PIXEL, LOADED ONLY ONCE MARKETING IS ALLOWED.
 *
 * The reason this component exists rather than a tag in the GTM container is in
 * lib/consent/meta-pixel.ts: the container's tags carry no consent settings, so
 * the pixel fired for a visitor who had refused marketing. Here the gate is
 * `metaPixelAllowed`, one predicate, covered by a guard and by a browser
 * journey that watches for the connect.facebook.net request itself.
 *
 * Shape notes, both of which are the official snippet's and not ours to improve:
 *
 *  - `fbq` is defined as a queue BEFORE the script loads, so calls made in the
 *    same tick are replayed by fbevents.js once it arrives. That is why init
 *    and the first PageView can be issued immediately.
 *  - A withdrawal is `fbq('consent','revoke')`. Meta holds events after a
 *    revoke instead of sending them, which is the only thing that can be done
 *    once a script element exists.
 *
 * A PageView is sent for each page the visitor reaches, not only for the first:
 * this is a client-routed app, so a navigation does not reload the document and
 * the container's version of this tag counted one view per full load.
 *
 * While the container still carries the old Meta tags — they are removed by
 * hand, in GTM, and this code cannot do it — the pixel may already be
 * initialised by the time we run. `alreadyRegistered` keeps us from counting
 * that visitor's PageView twice.
 */
import { useEffect, useRef } from 'react'
import { usePathname } from 'next/navigation'
import { CONSENT_CHANGED_EVENT, currentChoices } from '@/lib/consent/client-store'
import { META_PIXEL_ID, META_PIXEL_SRC, metaPixelAllowed } from '@/lib/consent/meta-pixel'

type Fbq = ((...args: unknown[]) => void) & {
  callMethod?: (...args: unknown[]) => void
  queue?: unknown[][]
  loaded?: boolean
  version?: string
  push?: unknown
  getState?: () => { pixels?: { id?: string }[] }
}

type PixelWindow = Window & { fbq?: Fbq; _fbq?: Fbq }

/** The official snippet's queue, written as a function instead of as a blob. */
function ensureFbq(w: PixelWindow): Fbq {
  if (w.fbq) return w.fbq
  const fbq: Fbq = function (...args: unknown[]) {
    // `.apply(fbq, …)` rather than a spread, because fbevents.js installs its
    // own callMethod and the official snippet calls it with `fbq` as the
    // receiver. A spread would call it with no receiver, which is a change to
    // someone else's contract and not a tidy-up.
    // eslint-disable-next-line prefer-spread -- the receiver is part of Meta's snippet.
    if (fbq.callMethod) fbq.callMethod.apply(fbq, args)
    else (fbq.queue = fbq.queue || []).push(args)
  } as Fbq
  fbq.push = fbq
  fbq.loaded = true
  fbq.version = '2.0'
  fbq.queue = []
  w.fbq = fbq
  if (!w._fbq) w._fbq = fbq
  return fbq
}

/** True when something else already initialised our pixel in this document. */
function alreadyRegistered(fbq: Fbq): boolean {
  try {
    const pixels = fbq.getState?.().pixels
    return Array.isArray(pixels) && pixels.some((p) => p?.id === META_PIXEL_ID)
  } catch {
    return false
  }
}

export function MetaPixel() {
  const initialised = useRef(false)
  const lastViewed = useRef<string | null>(null)
  const pathname = usePathname()

  useEffect(() => {
    const apply = () => {
      const w = window as PixelWindow
      const allowed = metaPixelAllowed(currentChoices())

      if (!allowed) {
        // Nothing was loaded unless a grant came first, so there is only
        // something to say when this is a withdrawal.
        if (initialised.current) {
          w.fbq?.('consent', 'revoke')
          lastViewed.current = null
        }
        return
      }

      const fbq = ensureFbq(w)
      if (!initialised.current) {
        if (alreadyRegistered(fbq)) {
          // The container's tag got here first: adopt its pixel rather than
          // registering a second one, and leave its PageView as the one.
          initialised.current = true
          lastViewed.current = pathname
        } else {
          if (!document.querySelector(`script[src="${META_PIXEL_SRC}"]`)) {
            const script = document.createElement('script')
            script.async = true
            script.src = META_PIXEL_SRC
            script.setAttribute('data-consented-tags', '1')
            document.head.appendChild(script)
          }
          fbq('init', META_PIXEL_ID)
          initialised.current = true
        }
      } else {
        // A re-grant after a withdrawal: the script is still there, so the only
        // thing to undo is the revoke.
        fbq('consent', 'grant')
      }

      if (lastViewed.current !== pathname) {
        fbq('track', 'PageView')
        lastViewed.current = pathname
      }
    }

    apply()
    window.addEventListener(CONSENT_CHANGED_EVENT, apply)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, apply)
  }, [pathname])

  return null
}
