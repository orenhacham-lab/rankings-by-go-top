/**
 * The "switch platform" modal's decisions, as pure functions (no React, no
 * network) so the QA suite can hold every state:
 *
 *   - which fields a choice reveals (none until something is chosen);
 *   - whether the disconnect warning shows (whenever something is connected,
 *     from the moment the modal opens — before any choice);
 *   - the exact order of requests on confirm. A new Wix or webhook connection
 *     is VALIDATED before the current one is disconnected, so a typo never
 *     leaves the project with nothing; WordPress and Shopify keep their own
 *     connect flows, which open after the disconnect.
 */
import type { ChoosablePlatform } from './types'

export type SwitchField = 'siteUrl' | 'siteId' | 'apiKey' | 'endpointUrl'

export const FIELDS_BY_PLATFORM: Record<ChoosablePlatform, SwitchField[]> = {
  wordpress: [],
  shopify: [],
  wix: ['siteUrl', 'siteId', 'apiKey'],
  webhook: ['endpointUrl'],
}

export type SwitchView = {
  /** The platform the warning names, or null when nothing is connected. */
  warnAbout: ChoosablePlatform | null
  fields: SwitchField[]
  /** The explanatory line under a choice that has no fields of its own. */
  nextNote: 'wordpress' | 'shopify' | null
  /** The chosen platform is the one already connected: nothing to switch to. */
  sameAsCurrent: boolean
  confirmLabel: 'switch' | 'connect'
  canConfirm: boolean
  /** Only Wix has an in-modal "test connection". */
  canTest: boolean
}

export type SwitchValues = Partial<Record<SwitchField, string>>

export function switchView(current: ChoosablePlatform | null, choice: ChoosablePlatform | null, values: SwitchValues = {}): SwitchView {
  const fields = choice ? FIELDS_BY_PLATFORM[choice] : []
  const sameAsCurrent = !!choice && choice === current
  const filled = (f: SwitchField) => f === 'siteUrl' || !!values[f]?.trim()
  return {
    warnAbout: current,
    fields,
    nextNote: choice === 'wordpress' || choice === 'shopify' ? choice : null,
    sameAsCurrent,
    confirmLabel: current ? 'switch' : 'connect',
    canConfirm: !!choice && !sameAsCurrent && fields.every(filled),
    canTest: choice === 'wix' && !!values.siteId?.trim() && !!values.apiKey?.trim(),
  }
}

/** The existing disconnect endpoint of each platform (reused as-is). */
export function disconnectUrl(platform: ChoosablePlatform, projectId: string): string {
  const q = `projectId=${encodeURIComponent(projectId)}`
  if (platform === 'wordpress') return `/api/wordpress/connection?${q}`
  if (platform === 'shopify') return `/api/shopify/connection?${q}`
  return `/api/site-platforms/connection?${q}`
}

export type SwitchStep =
  | { kind: 'validate'; platform: 'wix' | 'webhook' }
  | { kind: 'disconnect'; platform: ChoosablePlatform }
  | { kind: 'save'; platform: 'wix' | 'webhook' }
  | { kind: 'openPanel'; platform: 'wordpress' | 'shopify' }

/** The requests the confirm button makes, in order. */
export function switchSteps(current: ChoosablePlatform | null, choice: ChoosablePlatform): SwitchStep[] {
  const steps: SwitchStep[] = []
  if (choice === 'wix' || choice === 'webhook') steps.push({ kind: 'validate', platform: choice })
  if (current && current !== choice) steps.push({ kind: 'disconnect', platform: current })
  if (choice === 'wix' || choice === 'webhook') steps.push({ kind: 'save', platform: choice })
  else steps.push({ kind: 'openPanel', platform: choice })
  return steps
}
