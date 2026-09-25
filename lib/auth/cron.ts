import { createHash, timingSafeEqual } from 'crypto'

/**
 * Bearer CRON_SECRET check shared by every scheduled route.
 *
 * FAILS CLOSED: an unset secret means "refuse", never "no authentication
 * required". /api/schedule and /api/content/automation/cron used to skip the
 * check entirely when CRON_SECRET was unset, so any environment missing it
 * (a Preview, a mis-set Production) let anyone trigger scans or article
 * generation/publishing for every tenant with the service-role client.
 *
 * The comparison hashes both sides to a fixed length and uses timingSafeEqual,
 * so neither the secret's content nor its length leaks through timing.
 *
 * Returns null when authorized, or the Response to send.
 */
export function authorizeCronRequest(request: Request, label: string): Response | null {
  const secret = process.env.CRON_SECRET
  if (!secret) {
    console.error(`[${label}] refused: CRON_SECRET is not configured`)
    return Response.json({ ok: false, error: 'cron_not_configured' }, { status: 503 })
  }
  const got = createHash('sha256').update(request.headers.get('authorization') ?? '').digest()
  const want = createHash('sha256').update(`Bearer ${secret}`).digest()
  if (!timingSafeEqual(got, want)) {
    return Response.json({ ok: false, error: 'unauthorized' }, { status: 401 })
  }
  return null
}
