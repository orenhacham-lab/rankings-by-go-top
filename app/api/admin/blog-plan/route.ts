/**
 * POST /api/admin/blog-plan — the operator's say over what the blog publishes next.
 *
 * Three actions, one gate. NOT covered by proxy.ts (its matcher excludes
 * /api/), so the route checks the administrator role itself, through the
 * service-role client, never from the request body.
 *
 *   reject   take a planned keyword out of the queue, with a reason. The row
 *            stays (so research does not re-add the same keyword tomorrow) but
 *            is never claimed again.
 *   restore  put a rejected or failed row back in the queue, attempts reset.
 *   add      plan a keyword by hand, with the angle written as the topic.
 *
 * Nothing here publishes or deletes an article: a published article is edited in
 * /admin/articles like any other.
 */

import { requireAdminApi } from '@/lib/auth/require-admin'
import { createAdminClient } from '@/lib/supabase/admin'
import { PLAN_TABLE } from '@/lib/blog/auto/store'
import { isBlogAutoLocale } from '@/lib/blog/auto/rotation'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function POST(request: Request) {
  const gate = await requireAdminApi()
  if (!gate.ok) return gate.response

  let body: Record<string, unknown>
  try {
    body = (await request.json()) as Record<string, unknown>
  } catch {
    return Response.json({ error: 'invalid_body' }, { status: 400 })
  }

  const action = str(body.action)
  const admin = createAdminClient()

  if (action === 'reject') {
    const id = str(body.id)
    if (!id) return Response.json({ error: 'missing_id' }, { status: 400 })
    const { error } = await admin
      .from(PLAN_TABLE)
      .update({ status: 'rejected', note: str(body.note).slice(0, 300) || null, locked_at: null })
      .eq('id', id)
      .in('status', ['planned', 'failed', 'generating'])
    if (error) return Response.json({ error: 'update_failed' }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === 'restore') {
    const id = str(body.id)
    if (!id) return Response.json({ error: 'missing_id' }, { status: 400 })
    const { error } = await admin
      .from(PLAN_TABLE)
      .update({ status: 'planned', attempts: 0, last_error: null, locked_at: null })
      .eq('id', id)
      .in('status', ['rejected', 'failed'])
    if (error) return Response.json({ error: 'update_failed' }, { status: 500 })
    return Response.json({ ok: true })
  }

  if (action === 'add') {
    const locale = str(body.locale)
    const keyword = str(body.primary_keyword)
    if (!isBlogAutoLocale(locale)) return Response.json({ error: 'bad_locale' }, { status: 400 })
    if (!keyword) return Response.json({ error: 'missing_keyword' }, { status: 400 })
    const { error } = await admin.from(PLAN_TABLE).insert([{
      locale,
      primary_keyword: keyword.slice(0, 200),
      topic: (str(body.topic) || keyword).slice(0, 300),
      source: 'manual',
    }])
    // The unique (locale, primary_keyword) constraint: the keyword is already planned.
    if (error) return Response.json({ error: 'already_planned_or_failed' }, { status: 409 })
    return Response.json({ ok: true })
  }

  return Response.json({ error: 'unknown_action' }, { status: 400 })
}
