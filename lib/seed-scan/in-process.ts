/**
 * Calling one of the app's own route handlers inside the same request, as the
 * same merchant: steps b4 and b6 reach the recommendation engine and the scan
 * route exactly the way the content tab and the keywords tab do, so every
 * check those routes make (session, ownership, entitlement, quota, their own
 * cost controls) applies unchanged.
 *
 * The handler is called as a function with a Request of the shape the tab
 * sends; the merchant's session is the one the calling route holds (next's
 * cookies() still answers inside `after()` of a route handler). Only the
 * status and the parsed body come back; the body is read for a count and
 * nothing of it is stored or logged.
 */
import type { RouteAnswer } from './steps-b'

export type RouteHandler = (request: Request) => Promise<Response>

/** A host that never leaves the process: the handler is called directly, nothing is fetched. */
const INTERNAL_ORIGIN = 'http://seed.internal'

export async function callRouteInProcess(handler: RouteHandler, path: string, body: Record<string, unknown>): Promise<RouteAnswer> {
  const request = new Request(new URL(path, INTERNAL_ORIGIN), {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  })
  const response = await handler(request)
  let parsed: unknown = null
  try {
    parsed = await response.json()
  } catch {
    parsed = null
  }
  return { status: response.status, body: parsed }
}
