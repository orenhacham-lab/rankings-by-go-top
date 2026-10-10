/**
 * POST /api/outreach/inbound — the mailbox provider's delivery of an inbound reply.
 *
 * proxy.ts does not cover /api/*, so this handler authenticates itself. The provider
 * authenticates with the webhook secret as `Authorization: Bearer <secret>`, compared in
 * constant time against OUTREACH_INBOUND_SECRET. No secret configured means every
 * delivery is refused: an unauthenticated caller must never be able to write to the
 * suppression list, and must never be able to learn whether an address is on it.
 *
 * The answer says nothing about the message: the same 200 for a reply we acted on and a
 * reply we left alone, so the endpoint cannot be used to probe. A failure to record an
 * opt-out answers 503, which is the provider's signal to deliver it again — the one case
 * where a retry is what we want.
 */
import { timingSafeEqual } from 'crypto'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { handleInboundReply } from './inbound'

export interface InboundDeps {
  admin: () => ServiceRoleClient
  env: Record<string, string | undefined>
}

const NO_STORE = { 'cache-control': 'no-store' }
const json = (status: number, body: unknown) => Response.json(body, { status, headers: NO_STORE })

/** True only for the exact configured secret. No secret configured authorizes nobody. */
export function authorized(request: Request, env: Record<string, string | undefined>): boolean {
  const expected = env.OUTREACH_INBOUND_SECRET
  if (!expected) return false
  const header = request.headers.get('authorization') ?? ''
  const prefix = 'Bearer '
  if (!header.startsWith(prefix)) return false
  const got = Buffer.from(header.slice(prefix.length), 'utf8')
  const want = Buffer.from(expected, 'utf8')
  return got.length === want.length && timingSafeEqual(got, want)
}

export async function handleInbound(request: Request, deps: InboundDeps): Promise<Response> {
  if (!authorized(request, deps.env)) return json(401, { ok: false })
  let payload: unknown = null
  try {
    payload = await request.json()
  } catch {
    return json(400, { ok: false })
  }
  let outcome
  try {
    outcome = await handleInboundReply(payload, deps.admin())
  } catch {
    return json(503, { ok: false })
  }
  // 503 asks the provider to deliver again; everything else is settled.
  if (outcome.action === 'failed') return json(503, { ok: false })
  return json(200, { ok: true })
}
