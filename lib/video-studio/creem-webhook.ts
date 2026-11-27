/** Recognises Creem's checkout.completed event for a credit-pack checkout (pure). */
import { VIDEO_CHECKOUT_KIND } from './creem-packs'

export function isVideoCreditCheckoutEvent(event: unknown): { checkoutId: string } | null {
  if (!event || typeof event !== 'object') return null
  const e = event as { eventType?: unknown; event_type?: unknown; object?: unknown }
  const type = e.eventType ?? e.event_type
  if (type !== 'checkout.completed') return null
  const o = e.object
  if (!o || typeof o !== 'object' || Array.isArray(o)) return null
  const obj = o as { id?: unknown; metadata?: unknown }
  const meta = obj.metadata
  if (!meta || typeof meta !== 'object' || (meta as { kind?: unknown }).kind !== VIDEO_CHECKOUT_KIND) return null
  return typeof obj.id === 'string' ? { checkoutId: obj.id } : null
}
