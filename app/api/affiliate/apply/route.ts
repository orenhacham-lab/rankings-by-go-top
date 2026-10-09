/**
 * POST /api/affiliate/apply — an application to join the partner program.
 *
 * PUBLIC and unauthenticated by design: the people we want are not customers,
 * they are agencies, freelancers and creators with an audience, and asking them
 * to open an account before they can apply would lose most of them.
 *
 * This route is NOT covered by proxy.ts (its matcher excludes /api/), so
 * everything it needs it checks itself:
 *   - the fields, with lib/affiliate/application.ts, which holds the same limits
 *     the table's CHECK constraints do;
 *   - three applications per address per hour, counted from the applications
 *     themselves. The form is public, so it is a spam target;
 *   - one open application per email: a second one updates nothing and answers
 *     "received", so an applicant who clicks twice is not told off.
 *
 * NOTHING IS GRANTED HERE. The row is `pending` and a pending partner has no
 * code (a CHECK constraint, not a convention), so no link exists until a person
 * has read the application in /admin/affiliates. That manual approval is the
 * program's defence against someone joining to refer themselves.
 *
 * THE ADDRESS IS RECORDED (`applied_ip`), and the trigger on `affiliates` makes
 * it unchangeable afterwards. It is there for one purpose — telling a ring of
 * fake applications from a real agency — and the privacy policy says so.
 */
import { createAdminClient } from '@/lib/supabase/admin'
import { readApplication, APPLICATION_RATE_LIMIT } from '@/lib/affiliate/application'
import { clientIpFrom } from '@/lib/free-check/store'
import { notifyOperatorOfApplication } from '@/lib/affiliate/notify'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function POST(request: Request) {
  let body: unknown
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'invalid_json' }, { status: 400 })
  }

  const parsed = readApplication((body ?? {}) as Record<string, unknown>)
  if (!parsed.ok) return Response.json({ error: 'invalid_fields', fields: parsed.errors }, { status: 400 })

  const ip = clientIpFrom(request.headers)
  try {
    const admin = createAdminClient()

    const since = new Date(Date.now() - 60 * 60 * 1000).toISOString()
    const recent = await admin
      .from('affiliates')
      .select('id')
      .eq('applied_ip', ip)
      .gte('applied_at', since)
    // A read failure must not open the gate: an unknown count is treated as
    // over the limit, not under it.
    if (recent.error) {
      console.error('[affiliate-apply] rate-limit read failed:', recent.error.code)
      return Response.json({ error: 'unavailable' }, { status: 503 })
    }
    if ((recent.data ?? []).length >= APPLICATION_RATE_LIMIT.perIpPerHour) {
      return Response.json({ error: 'rate_limited' }, { status: 429 })
    }

    // Already applied and not yet decided: the honest answer is the same one, so
    // nobody learns from this route whether an address is already a partner.
    const open = await admin
      .from('affiliates')
      .select('id, status')
      .eq('email', parsed.fields.email)
      .in('status', ['pending', 'approved', 'suspended'])
      .maybeSingle()
    if (open.error) {
      console.error('[affiliate-apply] duplicate read failed:', open.error.code)
      return Response.json({ error: 'unavailable' }, { status: 503 })
    }
    if (open.data) return Response.json({ status: 'received' })

    const inserted = await admin
      .from('affiliates')
      .insert({ ...parsed.fields, status: 'pending', applied_ip: ip })
      .select('id')
      .single()
    if (inserted.error) {
      console.error('[affiliate-apply] insert failed:', inserted.error.code)
      return Response.json({ error: 'unavailable' }, { status: 503 })
    }

    // The operator is told, because an application nobody reads is an
    // application nobody approves. Never fails the application.
    try {
      await notifyOperatorOfApplication(parsed.fields)
    } catch (notifyError) {
      console.error('[affiliate-apply] notice failed:', notifyError instanceof Error ? notifyError.name : 'unknown')
    }

    return Response.json({ status: 'received' })
  } catch (err) {
    console.error('[affiliate-apply] unexpected:', err instanceof Error ? err.name : 'unknown')
    return Response.json({ error: 'unavailable' }, { status: 503 })
  }
}
