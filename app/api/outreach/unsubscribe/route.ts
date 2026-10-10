/**
 * GET|POST /api/outreach/unsubscribe?t=<signed token> — the unsubscribe link carried by
 * every outbound prospecting email.
 *
 * PUBLIC on purpose (proxy.ts does not cover /api/*, and an unsubscribe must work for
 * someone who has no account), so the signed token is the only credential and
 * lib/outreach/http.ts checks it before anything changes. It only ever adds to the
 * suppression list, and it never redirects.
 *
 * POST is RFC 8058 one-click from a mail client; GET is the link a person taps.
 */
import { handleOutreachUnsubscribe } from '@/lib/outreach/http'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const deps = () => ({ admin: () => createAdminClient(), env: process.env })

export async function GET(request: Request) { return handleOutreachUnsubscribe(request, deps()) }
export async function POST(request: Request) { return handleOutreachUnsubscribe(request, deps()) }
