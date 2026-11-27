/** POST — capture an approved PayPal order and grant the credits, once. 404 unless VIDEO_STUDIO_ENABLED. */
import { packGate } from '@/lib/video-studio/pack-gate'
import { capturePackOrder } from '@/lib/video-studio/paypal-packs'
import { realPayPalPackDeps } from '@/lib/video-studio/pack-deps'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const gate = await packGate(request, 'ILS')
  if (gate instanceof Response) return gate
  const body = (await request.json().catch(() => null)) as { orderId?: unknown } | null
  const r = await capturePackOrder(realPayPalPackDeps, gate.user.id, body?.orderId)
  return r.ok ? Response.json({ ok: true, credits: r.credits, alreadyBooked: r.alreadyBooked }) : Response.json({ ok: false, error: r.error }, { status: r.error === 'invalid_pack' ? 400 : r.error === 'mismatch' ? 409 : 502 })
}
