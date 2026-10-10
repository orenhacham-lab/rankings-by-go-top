/**
 * POST /api/outreach/inbound — every reply to an outbound prospecting email.
 *
 * PUBLIC on purpose (proxy.ts does not cover /api/*, and the caller is the mailbox
 * provider, which has no session), so the webhook secret is the only credential and
 * lib/outreach/inbound-http.ts checks it in constant time before anything is read.
 *
 * It only ever adds to the suppression list, and only when the person asked to stop.
 */
import { handleInbound } from '@/lib/outreach/inbound-http'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  return handleInbound(request, { admin: () => createAdminClient(), env: process.env })
}
