/**
 * GET|POST /api/reminders/unsubscribe?t=<signed token> — the link in every reminder email.
 *
 * PUBLIC on purpose (proxy.ts does not cover /api/*, and an unsubscribe must work without a
 * login), so the signed token is the only credential and lib/reminders/http.ts checks it
 * against the project's current owner before anything changes. It only turns that project's
 * reminders off, idempotently, and never redirects.
 */
import { handleUnsubscribe } from '@/lib/reminders/http'
import { createAdminClient } from '@/lib/supabase/admin'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const deps = () => ({ admin: () => createAdminClient(), now: () => new Date(), env: process.env })

export async function GET(request: Request) { return handleUnsubscribe(request, deps()) }
export async function POST(request: Request) { return handleUnsubscribe(request, deps()) }
