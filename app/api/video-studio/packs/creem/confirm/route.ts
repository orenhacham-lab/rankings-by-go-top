/** POST — after the return from Creem: read the checkout back and grant the credits, once. 404 unless VIDEO_STUDIO_ENABLED. */
import { packGate } from '@/lib/video-studio/pack-gate'
import { confirmPackCheckout } from '@/lib/video-studio/creem-packs'
import { realCreemPackDeps } from '@/lib/video-studio/pack-deps'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const gate = await packGate(request, 'USD')
  if (gate instanceof Response) return gate
  const body = (await request.json().catch(() => null)) as { checkoutId?: unknown } | null
  const r = await confirmPackCheckout(realCreemPackDeps, gate.user.id, body?.checkoutId)
  if (r.ok) return Response.json({ ok: true, credits: r.credits, alreadyBooked: r.alreadyBooked })
  return Response.json({ ok: false, error: r.error }, { status: r.error === 'invalid_pack' ? 400 : r.error === 'mismatch' ? 409 : r.error === 'not_completed' ? 202 : 502 })
}
