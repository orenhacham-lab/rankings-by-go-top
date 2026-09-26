/**
 * K5 — pure selector for the Content Hub "missing connections" onboarding.
 *
 * Two INDEPENDENT dimensions, each producing one card (or none when ready):
 *   - Platform (publishing): none / failed / failed_scope / ready
 *   - Search Console (optional evidence): none / no_property / reauth / ready
 * The Setup block is shown iff at least one card is present. No React, no I/O —
 * so the six approved state combinations are unit-testable in isolation.
 */

/** The DOM anchor the Search Console setup card LINKS to — the EXISTING K4 panel
 *  (reuse, not duplicate). The Search Console screen stamps this id on its wrapper.
 *  There is no platform equivalent: the platform connection lives on the project page,
 *  under that page's own #content-section anchor. */
export const GSC_SETUP_ANCHOR = 'hub-setup-gsc'

/** The project page's own anchor for its connection section. */
export const PROJECT_CONNECTION_ANCHOR = 'content-section'

/**
 * Where each setup card sends the merchant. The cards used to scroll to a panel further
 * down the same 1,325-line page; the panels have their own screens now, so a scroll would
 * land nowhere. The platform connection is project SETTINGS (the project page owns the
 * connect form); Search Console is set up on the screen that shows its data.
 */
export function platformSetupHref(projectId: string): string {
  return `/projects/${encodeURIComponent(projectId)}#${PROJECT_CONNECTION_ANCHOR}`
}
export function gscSetupHref(): string {
  return `/content/search-console#${GSC_SETUP_ANCHOR}`
}

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
