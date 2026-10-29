'use client'

/**
 * AN AFFILIATE MARKETPLACE'S TRACKING PIXEL, SHOWN ONLY ONCE MARKETING IS
 * ALLOWED.
 *
 * WHY IT EXISTS AT ALL. /go/<platform> deliberately carried no pixel: a
 * conversion pixel is a marketing tag by this project's own classification
 * (lib/consent/categories.ts), the page is read by buyers in the EU and the
 * UK, and the sale completes on the platform's own checkout anyway. JVZoo's
 * compliance review refuses that reading and makes the pixel a condition of
 * listing: issue 3, "Missing JVZoo buy button or tracking pixel ... which
 * corrupts the product's stats and is unfair to affiliates". The owner chose
 * to satisfy it the only way that does not break the consent promise the
 * cookie notice makes in four languages: the pixel exists, and it is gated.
 *
 * WHAT IT IS, AND WHY AN <img> AND NOT A SCRIPT. The platform's own snippet is
 * a 1x1 image - for JVZoo, `<img src='https://i.jvzoo.com/0/<product>/99'
 * width='1' height='1'>`. No script runs, nothing is written to the device,
 * and nothing is read back from it. The gate is therefore stricter than
 * ePrivacy Art. 5(3) requires of this particular tag; it is applied anyway,
 * because the visitor's IP reaching a third party on page load is the thing
 * the marketing category is about, and because a tag that answers to the
 * banner is the only kind this codebase ships.
 *
 *   marketing granted   the image is in the document and the request is made.
 *   anything else       i.jvzoo.com is never contacted. Not for a visitor with
 *                       no decision, not for a reject-all, and not for the
 *                       analytics-only visitor.
 *   withdrawal          the element is removed on the next consent event. An
 *                       image request already made cannot be recalled, which
 *                       is exactly why it must not be made before the grant.
 *
 * Rendering nothing until the effect has run also keeps the server and the
 * first client paint identical: consent lives in localStorage, so reading it
 * during render would hydrate differently for a visitor who had decided.
 */
import { useEffect, useState } from 'react'
import { CONSENT_CHANGED_EVENT, currentChoices } from '@/lib/consent/client-store'

export function MarketplacePixel({ src, alt }: { src: string; alt: string }) {
  const [allowed, setAllowed] = useState(false)

  useEffect(() => {
    const apply = () => setAllowed(currentChoices().marketing === true)
    apply()
    window.addEventListener(CONSENT_CHANGED_EVENT, apply)
    return () => window.removeEventListener(CONSENT_CHANGED_EVENT, apply)
  }, [])

  if (!allowed) return null
  return (
    // The platform's own 1x1 beacon, which must be requested verbatim: the
    // image optimiser would proxy it and the request would reach the platform
    // from Vercel rather than from the visitor, which is not a page view.
    // eslint-disable-next-line @next/next/no-img-element
    <img src={src} alt={alt} width={1} height={1} data-consented-tags="1" />
  )
}
