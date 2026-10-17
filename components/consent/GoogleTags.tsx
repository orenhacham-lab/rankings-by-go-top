'use client'

/**
 * GOOGLE TAG MANAGER, LOADED ONLY ONCE A DECISION ALLOWS IT.
 *
 * The container id is a build-time constant, not a secret — it ships in the
 * page either way. What this component controls is WHEN googletagmanager.com is
 * contacted at all:
 *
 *   no decision yet   nothing is requested. A first-time visitor's browser
 *                     never touches Google from our pages before they answer.
 *   reject all / gpc   nothing is requested, ever, on any page view. Not a
 *                     cookieless ping, not a container download — a refusal
 *                     that still fetches the tag is not a refusal.
 *   analytics and/or   gtm.js is appended once, AFTER `gtag('consent','update')`
 *   marketing on       has put the granted signals on the dataLayer, so each tag
 *                      inside the container sees the real state from its first
 *                      evaluation and a tag added to GTM later is still bound by it.
 *
 * Withdrawal is honoured without a reload: an `update` with the signals denied
 * is pushed the moment the visitor turns a category off. The script element
 * cannot be un-run, which is exactly why Consent Mode exists — the tags read
 * the signals on every event, so a denied update stops them collecting.
 *
 * The <noscript> GTM iframe that used to sit at the top of <body> is gone on
 * purpose. It fired the container for every visitor with JavaScript disabled —
 * the one visitor who has no way to be asked and no way to refuse.
 */
import { useEffect, useRef } from 'react'
import { CONSENT_CHANGED_EVENT, currentChoices } from '@/lib/consent/client-store'
import { googleConsentFrom, type GoogleConsentState } from '@/lib/consent/google-consent-mode'
import type { ConsentChoices } from '@/lib/consent/categories'

const GTM_ID = 'GTM-PC29G3NQ'
const GTM_SRC = `https://www.googletagmanager.com/gtm.js?id=${GTM_ID}`

type DataLayerWindow = Window & {
  dataLayer?: unknown[]
  gtag?: (...args: unknown[]) => void
}

/**
 * THE UPDATE GOES THROUGH `gtag`, AND THE SHAPE IS THE WHOLE POINT.
 *
 * This used to push a plain array — `dataLayer.push(['consent','update',…])` —
 * on the reasoning that we should not depend on a global we did not define. We
 * do define it: `GOOGLE_CONSENT_DEFAULT_SCRIPT` runs first in <head> and sets
 * `gtag()`, which pushes its `arguments` OBJECT. Google reads a consent command
 * only in that shape. An array is left on the dataLayer and ignored, so the
 * default — everything optional denied — stayed in force for a visitor who had
 * just accepted everything.
 *
 * Measured on the live site on 17 October 2026 before this fix: after clicking
 * "accept all", the GA4 hit carried `gcs=G100` (ad_storage denied,
 * analytics_storage denied) and `npa=1`. Google answers 204 to such a hit and
 * keeps nothing: it is a cookieless ping, absent from Realtime and from every
 * report. Hence months of an empty property with the tag "installed".
 *
 * The proof of the shape, from the same capture: GTM stamps every dataLayer
 * entry it processes with `gtm.uniqueEventId`. The two entries from the
 * `gtag`-shaped default carried the stamp; the two array-shaped updates had no
 * stamp at all.
 *
 * The fallback builds the same `arguments` object without the global, for the
 * case where this component runs before the inline script (it should not, but a
 * consent signal is not the place to rely on that).
 */
function pushConsentUpdate(choices: ConsentChoices) {
  const w = window as DataLayerWindow
  w.dataLayer = w.dataLayer || []
  const state = googleConsentFrom(choices)
  if (typeof w.gtag === 'function') {
    w.gtag('consent', 'update', state)
    return
  }
  const layer = w.dataLayer
  // Declared without parameters and typed through a cast, because what must
  // reach the dataLayer is the `arguments` object itself — named parameters
  // would be unused by construction, and rest parameters would turn it into a
  // real Array, which is the shape Google ignores.
  const pushArguments = function () {
    // eslint-disable-next-line prefer-rest-params -- the arguments OBJECT *is* the contract.
    layer.push(arguments)
  } as unknown as (command: 'consent', action: 'update', state: GoogleConsentState) => void
  pushArguments('consent', 'update', state)
}

function wantsTags(choices: ConsentChoices): boolean {
  return choices.analytics || choices.marketing
}

export function GoogleTags() {
  const loaded = useRef(false)

  useEffect(() => {
    const apply = () => {
      const choices = currentChoices()
      // Always declare the state first: on a withdrawal this is the whole job,
      // because the already-loaded container must stop collecting immediately.
      pushConsentUpdate(choices)
      if (!wantsTags(choices) || loaded.current) return
      if (document.querySelector(`script[src="${GTM_SRC}"]`)) {
        loaded.current = true
        return
      }
      const script = document.createElement('script')
      script.async = true
      script.src = GTM_SRC
      script.setAttribute('data-consented-tags', '1')
      document.head.appendChild(script)
      loaded.current = true
    }

    apply()
    window.addEventListener(CONSENT_CHANGED_EVENT, apply)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, apply)
  }, [])

  return null
}
