/** Read a one-time checkout back from Creem (used by the video credit packs). Kept out of client.ts so that file's declared inbound fields stay closed. */
import { creemFetch, idOf, minorAmountOf, stringOf, type CreemResult } from './client'

/** A checkout read back from Creem: the only trusted source for "was this one-time payment completed". */
export interface CreemCheckoutSnapshot {
  id: string
  status: string
  productId: string | null
  requestId: string | null
  metadata: Record<string, unknown> | null
  orderId: string | null
  orderStatus: string | null
  /** Order currency and pre-tax amount in minor units, when Creem reports them. */
  currency: string | null
  amount: number | null
}

export async function fetchCreemCheckout(checkoutId: string): Promise<CreemResult<CreemCheckoutSnapshot>> {
  const id = checkoutId?.trim()
  if (!id) return { ok: false, reason: 'not_found' }
  const result = await creemFetch(`/v1/checkouts?checkout_id=${encodeURIComponent(id)}`, { method: 'GET' })
  if (!result.ok) return result
  const body = result.value as Record<string, unknown>
  const status = stringOf(body.status)
  const returnedId = stringOf(body.id)
  // A response about a different checkout is never accepted.
  if (!status || !returnedId || returnedId !== id) {
    console.error('[creem] checkout response had no id/status or was for another id')
    return { ok: false, reason: 'malformed_response' }
  }
  const metadata = body.metadata && typeof body.metadata === 'object' && !Array.isArray(body.metadata)
    ? (body.metadata as Record<string, unknown>)
    : null
  const order = body.order && typeof body.order === 'object' && !Array.isArray(body.order)
    ? (body.order as Record<string, unknown>)
    : null
  return {
    ok: true,
    value: {
      id: returnedId,
      status,
      productId: idOf(body.product),
      requestId: stringOf(body.request_id) ?? stringOf(body.requestId),
      metadata,
      orderId: order ? stringOf(order.id) : null,
      orderStatus: order ? stringOf(order.status) : null,
      currency: order ? stringOf(order.currency) : null,
      amount: order ? minorAmountOf(order.amount) : null,
    },
  }
}
