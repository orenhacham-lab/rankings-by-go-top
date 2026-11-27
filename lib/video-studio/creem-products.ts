/**
 * Creem one-time products for the credit packs (USD, outside Israel).
 * Live ids were created in the owner's Creem account on 27.11.2026. Test mode has no
 * defaults: its ids differ, so they come from env (CREEM_VIDEO_PRODUCT_P30 / _P100),
 * and an unset id means "not available" rather than a guess. Env overrides in any mode.
 */
import { creemMode } from '@/lib/creem/config'
import { CREDIT_PACKS, type PackId } from './packs'

const LIVE_IDS: Record<PackId, string> = {
  p30: 'prod_1xw6wulXfUT5P4ibFpp1Ur',
  p100: 'prod_y2rlPAtrCIIXpgU4zrvYf',
}
const ENV_VAR: Record<PackId, string> = { p30: 'CREEM_VIDEO_PRODUCT_P30', p100: 'CREEM_VIDEO_PRODUCT_P100' }

export function creemPackProductId(pack: PackId): string | null {
  const fromEnv = process.env[ENV_VAR[pack]]?.trim()
  if (fromEnv) return fromEnv
  return creemMode() === 'live' ? LIVE_IDS[pack] : null
}

export function packForCreemProductId(productId: string | null | undefined): PackId | null {
  const id = productId?.trim()
  if (!id) return null
  for (const pack of Object.keys(CREDIT_PACKS) as PackId[]) {
    if (creemPackProductId(pack) === id) return pack
  }
  return null
}
