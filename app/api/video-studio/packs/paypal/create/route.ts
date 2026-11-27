/** POST — open a PayPal order for a credit pack (Israel, shekels). 404 unless VIDEO_STUDIO_ENABLED. */
import { packGate } from '@/lib/video-studio/pack-gate'
import { createPackOrder } from '@/lib/video-studio/paypal-packs'
import { realPayPalPackDeps } from '@/lib/video-studio/pack-deps'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const gate = await packGate(request, 'ILS')
  if (gate instanceof Response) return gate
  const body = (await request.json().catch(() => null)) as { pack?: unknown } | null
  const r = await createPackOrder(realPayPalPackDeps, gate.user.id, body?.pack)
  return r.ok ? Response.json({ ok: true, orderId: r.orderId }) : Response.json({ ok: false, error: r.error }, { status: r.error === 'invalid_pack' ? 400 : 502 })
}
