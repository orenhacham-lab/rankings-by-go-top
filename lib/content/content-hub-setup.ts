/**
 * K5 — pure selector for the Content Hub "missing connections" onboarding.
 *
 * Two INDEPENDENT dimensions, each producing one card (or none when ready):
 *   - Platform (publishing): none / failed / failed_scope / ready
 *   - Search Console (optional evidence): none / no_property / reauth / ready
 * The Setup block is shown iff at least one card is present. No React, no I/O —
 * so the six approved state combinations are unit-testable in isolation.
 */

/** DOM anchors the setup cards scroll to — the EXISTING K3/K4 panels (reuse, not
 *  duplicate). The hub stamps these ids on the panel wrappers. */
export const PLATFORM_SETUP_ANCHOR = 'hub-setup-platform'
export const GSC_SETUP_ANCHOR = 'hub-setup-gsc'

export type PlatformState = 'wordpress' | 'shopify' | 'conflict' | 'none'
export type GscState = 'connected' | 'reauth_required' | 'revoked' | 'error' | 'none'

/** Which platform card to show (null = platform is ready or handled elsewhere). */
export type PlatformCard = 'none' | 'failed' | 'failed_scope' | null
/** Which Search Console card to show (null = GSC is ready). */
export type GscCard = 'none' | 'no_property' | 'reauth' | null

export interface SetupInput {
  platform: PlatformState
  /** A connected platform whose connection_status is 'failed'. */
  platformFailed?: boolean
  /** Shopify connected but missing the write_content scope (can't publish yet). */
  shopifyNeedsScope?: boolean
  gscStatus: GscState
  /** A GSC property is assigned to THIS project. */
  gscHasProperty?: boolean
}

export interface SetupSelection {
  platformCard: PlatformCard
  gscCard: GscCard
  showSetup: boolean
}

export function selectSetupCards(input: SetupInput): SetupSelection {
  // ── Platform dimension ──────────────────────────────────────────────────────
  // 'conflict' (both connected) is intentionally NOT a setup card — the existing
  // conflict warning owns that. A healthy connected platform → no card.
  let platformCard: PlatformCard = null
  if (input.platform === 'none') platformCard = 'none'
  else if (input.platform !== 'conflict') {
    if (input.shopifyNeedsScope) platformCard = 'failed_scope'
    else if (input.platformFailed) platformCard = 'failed'
  }

  // ── Search Console dimension (optional evidence) ────────────────────────────
  let gscCard: GscCard = null
  if (input.gscStatus === 'reauth_required') gscCard = 'reauth'
  else if (input.gscStatus === 'connected') { if (!input.gscHasProperty) gscCard = 'no_property' }
  else gscCard = 'none' // none / revoked / error → connect (from scratch)

  return { platformCard, gscCard, showSetup: platformCard !== null || gscCard !== null }
}
