/**
 * The gates in front of a credit purchase, in the order the subscription checkout uses:
 * flag, sanctions list, the two "not cleared to sell in our own name" refusals, session,
 * and the market (Israel pays here, in shekels; everyone else is Creem's path).
 * Returns the user, or a Response to send back. Server-only.
 */
import { createClient } from '@/lib/supabase/server'
import { isVideoStudioEnabled } from './config'
import { logRestrictedAttempt, restrictionForRequest } from '@/lib/sanctions/guard'
import { KOREA_SALE_REFUSAL_REASON, koreaOwnSaleBlockedForRequest } from '@/lib/billing/korea-sale'
import { OWN_NAME_SALE_REFUSAL_REASON, ownNameSaleBlockedForRequest } from '@/lib/billing/own-name-sale'
import { resolveBillingMarket, storedMarketOf } from '@/lib/billing/server-market'

const refuse = (reason: string, status: number) => Response.json({ error: 'Not available', reason }, { status })

export async function packGate(request: Request, wantMarket: 'ILS'): Promise<{ user: { id: string } } | Response> {
  if (!isVideoStudioEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  const restricted = restrictionForRequest(request.headers)
  if (restricted) { logRestrictedAttempt('video-packs', restricted); return refuse('restricted_country', 451) }
  if (koreaOwnSaleBlockedForRequest(request.headers)) return refuse(KOREA_SALE_REFUSAL_REASON, 451)
  if (ownNameSaleBlockedForRequest(request.headers)) return refuse(OWN_NAME_SALE_REFUSAL_REASON, 451)
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 })
  const market = storedMarketOf(user) ?? (await resolveBillingMarket(supabase, user).catch(() => null))?.market ?? null
  if (market !== wantMarket) return refuse('market_not_supported', 409)
  return { user: { id: user.id } }
}
