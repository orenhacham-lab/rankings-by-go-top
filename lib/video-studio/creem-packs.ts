/**
 * Buying a credit pack with Creem (USD, outside Israel). Creem is the merchant of record.
 * createPackCheckout opens a one-time checkout for a pack OUR config prices (the browser sends
 * a pack id, never an amount). confirmPackCheckout reads the checkout back from Creem and grants
 * credits ONLY from that answer: status completed, the product is one of our two pack products,
 * the owner named on the checkout is the expected user, and the amount is not below the pack price.
 * The grant is idempotent on the checkout id (video_credit_purchase), so the return-page confirm
 * and the webhook can both run and credits are paid out once. Collaborators are injected for QA.
 */
import type { CreemResult, CreemCheckoutSession } from '@/lib/creem/client'
import type { CreemCheckoutSnapshot } from '@/lib/creem/checkout-read'
import { creemMayWriteToAccount } from '@/lib/creem/config'
import { CREDIT_PACKS, isPackId, type PackId } from './packs'
import { creemPackProductId, packForCreemProductId } from './creem-products'

export const VIDEO_CHECKOUT_KIND = 'video_credits'

export interface CreemPackDeps {
  createCheckout: (p: { productId: string; requestId: string; customerEmail: string | null; metadata: Record<string, string> }) => Promise<CreemResult<CreemCheckoutSession>>
  readCheckout: (checkoutId: string) => Promise<CreemResult<CreemCheckoutSnapshot>>
  grant: (g: { userId: string; credits: number; ref: string; pack: PackId; amountMinor: number; currency: 'USD' }) => Promise<boolean | null>
}
export type CreemPackFailure = 'invalid_pack' | 'not_configured' | 'provider_failed' | 'not_completed' | 'mismatch' | 'unexpected'
export type CreemCreateResult = { ok: true; checkoutUrl: string } | { ok: false; error: CreemPackFailure }
export type CreemConfirmResult = { ok: true; credits: number; alreadyBooked: boolean } | { ok: false; error: CreemPackFailure }

export async function createPackCheckout(deps: CreemPackDeps, user: { id: string; email?: string | null }, pack: unknown): Promise<CreemCreateResult> {
  if (!isPackId(pack)) return { ok: false, error: 'invalid_pack' }
  const productId = creemPackProductId(pack)
  if (!productId) return { ok: false, error: 'not_configured' }
  try {
    const r = await deps.createCheckout({
      productId,
      requestId: user.id,
      customerEmail: user.email ?? null,
      metadata: { user_id: user.id, pack, kind: VIDEO_CHECKOUT_KIND },
    })
    return r.ok ? { ok: true, checkoutUrl: r.value.checkoutUrl } : { ok: false, error: 'provider_failed' }
  } catch { return { ok: false, error: 'provider_failed' } }
}

/** expectedUserId: the signed-in caller on the return page; null on the webhook, where the owner is whoever the checkout names. */
export async function confirmPackCheckout(deps: CreemPackDeps, expectedUserId: string | null, checkoutId: unknown): Promise<CreemConfirmResult> {
  if (typeof checkoutId !== 'string' || !/^[A-Za-z0-9_-]{6,80}$/.test(checkoutId)) return { ok: false, error: 'invalid_pack' }
  try {
    const r = await deps.readCheckout(checkoutId)
    if (!r.ok) return { ok: false, error: 'provider_failed' }
    const c = r.value
    if (c.status !== 'completed') return { ok: false, error: 'not_completed' }
    const pack = packForCreemProductId(c.productId)
    if (!pack) return { ok: false, error: 'mismatch' }
    const metaUser = typeof c.metadata?.user_id === 'string' ? c.metadata.user_id : null
    const owner = metaUser ?? c.requestId
    if (!owner || (c.requestId && metaUser && c.requestId !== metaUser)) return { ok: false, error: 'mismatch' }
    if (expectedUserId !== null && owner !== expectedUserId) return { ok: false, error: 'mismatch' }
    if (c.metadata?.pack !== undefined && c.metadata.pack !== pack) return { ok: false, error: 'mismatch' }
    if (!creemMayWriteToAccount(owner)) return { ok: false, error: 'mismatch' }
    const p = CREDIT_PACKS[pack]
    if (c.orderStatus && c.orderStatus !== 'paid') return { ok: false, error: 'not_completed' }
    if (c.currency && c.currency.toUpperCase() !== 'USD') return { ok: false, error: 'mismatch' }
    if (c.amount !== null && c.amount < p.amountMinor.USD) return { ok: false, error: 'mismatch' }
    const fresh = await deps.grant({ userId: owner, credits: p.credits, ref: c.id, pack, amountMinor: p.amountMinor.USD, currency: 'USD' })
    if (fresh === null) return { ok: false, error: 'unexpected' }
    return { ok: true, credits: p.credits, alreadyBooked: !fresh }
  } catch { return { ok: false, error: 'unexpected' } }
}
