/**
 * K5 — pure selector for the Content Hub "missing connections" onboarding.
 *
 * Two INDEPENDENT dimensions, each producing one card (or none when ready):
 *   - Platform (publishing): none / failed / failed_scope / ready
 *   - Search Console (optional evidence): none / no_property / reauth / ready
 * The Setup block is shown iff at least one card is present. No React, no I/O —
 * so the six approved state combinations are unit-testable in isolation.
 */

import type { GscStatusView } from '@/lib/gsc/widget-state'

/** The settings screen's anchors for the project's two connections. The settings
 *  screen stamps these ids on the sections, so a link and its target cannot drift. */
export const PROJECT_CONNECTION_ANCHOR = 'platform'
export const SETTINGS_GSC_ANCHOR = 'search-console'

/**
 * Where each setup card sends the merchant. The cards used to scroll to a panel further
 * down the same 1,325-line page; the panels have their own screens now, so a scroll would
 * land nowhere. Both connections are sections of the project's SETTINGS, which own the
 * connect forms (Search Console is no longer a screen of its own: it feeds the others).
 *
 * The project rides along as `?projectId`, so the link opens the project it was
 * made for even from another tab where a different project is current.
 */
export function platformSetupHref(projectId: string): string {
  return `/settings?projectId=${encodeURIComponent(projectId)}#${PROJECT_CONNECTION_ANCHOR}`
}
/** The Search Console connection in the project's settings. */
export function settingsGscHref(projectId: string): string {
  return `/settings?projectId=${encodeURIComponent(projectId)}#${SETTINGS_GSC_ANCHOR}`
}

export type PlatformState = 'wordpress' | 'shopify' | 'wix' | 'webhook' | 'conflict' | 'none'
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

/**
 * The setup line's decision from what is KNOWN (lib/connection-status/known.ts).
 *
 * The line used to start from gscStatus 'none' and draw "Search Console is not
 * connected" until the status answered, which a connected merchant read as a
 * disconnection on every content screen (the owner's report, 2026-09-28). Now:
 *   - the platform is unknown (null) until the overview for THIS project answered,
 *     and Search Console until its status did: while either is unknown, 'loading'
 *     and the line is not drawn at all;
 *   - a Search Console status that failed, or Search Console switched off on the
 *     server, is not "not connected": the line leaves Search Console out;
 *   - only a real answer draws a card, the same cards as selectSetupCards.
 */
export function setupRowFromKnown(
  platform: Omit<SetupInput, 'gscStatus' | 'gscHasProperty'> | null,
  gsc: GscStatusView,
): SetupSelection | 'loading' {
  if (!platform || gsc.state === 'loading') return 'loading'
  let gscCard: GscCard = null
  switch (gsc.state) {
    case 'not_connected': gscCard = 'none'; break
    case 'reauth_required': gscCard = 'reauth'; break
    case 'no_property': gscCard = 'no_property'; break
    default: gscCard = null // ready, never_synced (connected), error, disabled
  }
  const { platformCard } = selectSetupCards({ ...platform, gscStatus: 'connected', gscHasProperty: true })
  return { platformCard, gscCard, showSetup: platformCard !== null || gscCard !== null }
}
