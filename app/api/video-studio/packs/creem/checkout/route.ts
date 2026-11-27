/** POST — open a Creem checkout for a credit pack (USD, outside Israel). 404 unless VIDEO_STUDIO_ENABLED. Grants nothing. */
import { createClient } from '@/lib/supabase/server'
import { packGate } from '@/lib/video-studio/pack-gate'
import { createPackCheckout } from '@/lib/video-studio/creem-packs'
import { realCreemPackDeps } from '@/lib/video-studio/pack-deps'

export const runtime = 'nodejs'

export async function POST(request: Request) {
  const gate = await packGate(request, 'USD')
  if (gate instanceof Response) return gate
  const body = (await request.json().catch(() => null)) as { pack?: unknown } | null
  const { data: { user } } = await (await createClient()).auth.getUser()
  const r = await createPackCheckout(realCreemPackDeps, { id: gate.user.id, email: user?.email ?? null }, body?.pack)
  if (r.ok) return Response.json({ ok: true, checkoutUrl: r.checkoutUrl })
  return Response.json({ ok: false, error: r.error }, { status: r.error === 'invalid_pack' ? 400 : r.error === 'not_configured' ? 503 : 502 })
}
