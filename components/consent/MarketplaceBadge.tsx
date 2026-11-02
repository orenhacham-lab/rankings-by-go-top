'use client'

/**
 * A MARKETPLACE'S TRUST BADGE, LOADED ONLY ONCE MARKETING IS ALLOWED.
 *
 * The sibling of MarketplacePixel, for a tag that is not a beacon. Digistore24
 * require this one before a product may be submitted at all: their
 * pre-submission checklist makes the vendor confirm that "Your sales page
 * trust badge and footer badge are both added to your sales page". It renders
 * a sticky banner naming Digistore24 as the reseller, which is also the thing
 * the sales page says in its own words.
 *
 * WHY IT IS GATED. The badge URL answers with `set-cookie: ds_gb_id=...;
 * Max-Age=604800` - a week-long identifier written to the visitor's device
 * before anything is bought. That is storage under ePrivacy Art. 5(3), and
 * lib/consent/eprivacy-territory.ts already sets out why neither carve-out
 * reaches a tag like this: the page renders identically without it, so it is
 * not strictly necessary to a service the visitor asked for. Where consent is
 * required, consent comes first.
 *
 * WHY document.createElement AND NOT A <script> IN JSX. React hoists a script
 * element rendered from JSX and will not re-insert one it has already seen,
 * which makes "remove on withdrawal, add again on a later grant" unreliable
 * in exactly the case this component exists to handle. Appending the element
 * ourselves keeps the lifecycle ours, and the element we appended is the
 * element we can remove.
 *
 * WHAT WITHDRAWAL CAN AND CANNOT UNDO, STATED RATHER THAN IMPLIED. On
 * withdrawal this removes the script it added and the nodes the badge
 * rendered. It cannot unset a cookie on digistore24.com - no first-party
 * script can - and it cannot unload code the browser has already executed.
 * That asymmetry is the whole reason the tag must not load before the grant:
 * the write is the thing consent protects, and a write already made cannot be
 * recalled. Anyone tempted to relax the gate "because withdrawal cleans up"
 * should read this paragraph again.
 */
import { useEffect } from 'react'
import { CONSENT_CHANGED_EVENT, currentChoices } from '@/lib/consent/client-store'
import { marketingBeaconAllowed } from './MarketplacePixel'

/**
 * What the badge leaves in the document, so withdrawal has something precise
 * to remove. `ds24b` is the global the vendor snippet creates; the rendered
 * banner is its own element and is matched by attribute rather than by a
 * class name, because a class name is theirs to restyle and an id is not.
 */
const BADGE_NODE_SELECTOR = '[id^="ds24"], [class^="ds24"], [data-ds24]'

export function MarketplaceBadge({ src }: { src: string }) {
  useEffect(() => {
    let script: HTMLScriptElement | null = null

    const removeBadge = () => {
      script?.remove()
      script = null
      // Their loader appends its own nodes; ours is not the only one to go.
      document.querySelectorAll(BADGE_NODE_SELECTOR).forEach((node) => node.remove())
    }

    const apply = () => {
      const allowed = marketingBeaconAllowed(currentChoices())
      if (allowed && !script) {
        script = document.createElement('script')
        script.src = src
        script.async = true
        script.dataset.consentedTags = '1'
        document.body.appendChild(script)
        return
      }
      if (!allowed) removeBadge()
    }

    apply()
    window.addEventListener(CONSENT_CHANGED_EVENT, apply)
    return () => {
      window.removeEventListener(CONSENT_CHANGED_EVENT, apply)
      // Only our own element on unmount: the visitor has not withdrawn
      // anything by navigating, and tearing the banner out of a page they are
      // leaving would be a flicker for no gain.
      script?.remove()
    }
  }, [src])

  return null
}
