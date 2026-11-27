/**
 * Buying a credit pack with PayPal (Israel, shekels). Two steps, both server-side:
 * createOrder opens an order for a pack OUR config prices; captureOrder captures it and
 * grants credits ONLY from PayPal's own answer: status COMPLETED, the amount and currency
 * equal to our pack price, and the custom_id naming this user and this pack. The grant is
 * idempotent on the capture id (video_credit_purchase), so a retry never pays out twice.
 * Fetch and database are injected; the QA suite runs this against fakes.
 */
import { CREDIT_PACKS, isPackId, majorAmount, type PackId } from './packs'

type Json = Record<string, unknown>
export interface PayPalPackDeps {
  paypal: (path: string, init: { method: 'POST'; body?: Json }) => Promise<{ ok: boolean; json: Json }>
  grant: (g: { userId: string; credits: number; ref: string; pack: PackId; amountMinor: number; currency: 'ILS' }) => Promise<boolean | null>
}
export type PackFailure = 'invalid_pack' | 'provider_failed' | 'not_completed' | 'mismatch' | 'unexpected'
export type CreateResult = { ok: true; orderId: string } | { ok: false; error: PackFailure }
export type CaptureResult = { ok: true; credits: number; alreadyBooked: boolean } | { ok: false; error: PackFailure }

const str = (v: unknown) => (typeof v === 'string' ? v : null)

export async function createPackOrder(deps: PayPalPackDeps, userId: string, pack: unknown): Promise<CreateResult> {
  if (!isPackId(pack)) return { ok: false, error: 'invalid_pack' }
  const p = CREDIT_PACKS[pack]
  try {
    const res = await deps.paypal('/v2/checkout/orders', {
      method: 'POST',
      body: {
        intent: 'CAPTURE',
        purchase_units: [{
          custom_id: `${userId}|${pack}`,
          description: `${p.credits} video credits`,
          amount: { currency_code: 'ILS', value: majorAmount(p.amountMinor.ILS) },
        }],
      },
    })
    const id = str(res.json.id)
    return res.ok && id ? { ok: true, orderId: id } : { ok: false, error: 'provider_failed' }
  } catch { return { ok: false, error: 'provider_failed' } }
}

export async function capturePackOrder(deps: PayPalPackDeps, userId: string, orderId: unknown): Promise<CaptureResult> {
  if (typeof orderId !== 'string' || !/^[A-Za-z0-9-]{6,64}$/.test(orderId)) return { ok: false, error: 'invalid_pack' }
  try {
    const res = await deps.paypal(`/v2/checkout/orders/${orderId}/capture`, { method: 'POST' })
    if (!res.ok) return { ok: false, error: 'provider_failed' }
    if (res.json.status !== 'COMPLETED') return { ok: false, error: 'not_completed' }
    const unit = (Array.isArray(res.json.purchase_units) ? res.json.purchase_units[0] : null) as Json | null
    const cap = ((unit?.payments as Json | undefined)?.captures as Json[] | undefined)?.[0]
    const capId = str(cap?.id)
    const custom = str(cap?.custom_id) ?? str(unit?.custom_id)
    const [owner, pack] = (custom ?? '').split('|')
    if (!cap || !capId || cap.status !== 'COMPLETED' || owner !== userId || !isPackId(pack)) return { ok: false, error: 'mismatch' }
    const amount = cap.amount as Json | undefined
    const p = CREDIT_PACKS[pack]
    if (amount?.currency_code !== 'ILS' || amount?.value !== majorAmount(p.amountMinor.ILS)) return { ok: false, error: 'mismatch' }
    const fresh = await deps.grant({ userId, credits: p.credits, ref: capId, pack, amountMinor: p.amountMinor.ILS, currency: 'ILS' })
    if (fresh === null) return { ok: false, error: 'unexpected' }
    return { ok: true, credits: p.credits, alreadyBooked: !fresh }
  } catch { return { ok: false, error: 'unexpected' } }
}
