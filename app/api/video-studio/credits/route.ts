/** GET — the signed-in user's credit balance, and whether they can buy packs here (Israel, PayPal). 404 unless VIDEO_STUDIO_ENABLED. */
import { createClient } from '@/lib/supabase/server'
import { createAdminClient } from '@/lib/supabase/admin'
import { isVideoStudioEnabled } from '@/lib/video-studio/config'
import { isCreemEnabled } from '@/lib/creem/config'
import { resolveBillingMarket, storedMarketOf } from '@/lib/billing/server-market'

export const runtime = 'nodejs'

export async function GET() {
  if (!isVideoStudioEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  const { data, error } = await createAdminClient().from('video_credit_wallets').select('balance').eq('user_id', user.id).maybeSingle()
  if (error) return Response.json({ ok: false, error: 'unexpected' }, { status: 500 })
  const market = storedMarketOf(user) ?? (await resolveBillingMarket(supabase, user).catch(() => null))?.market ?? null
  return Response.json({ ok: true, balance: (data as { balance?: number } | null)?.balance ?? 0, canBuy: market === 'ILS', provider: market === 'ILS' ? 'paypal' : market === 'USD' && isCreemEnabled() ? 'creem' : null })
}
