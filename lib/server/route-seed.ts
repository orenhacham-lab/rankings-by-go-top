/**
 * ONE OF THE APP'S OWN GET ROUTES, ANSWERED INSIDE THE PAGE'S OWN REQUEST.
 *
 * A screen's reads cost a browser round trip each, and a round trip is about
 * 650ms whatever it reads (`/api/version` — no auth, no database, a constant —
 * measured 510-760ms from Oren's browser against production on 16.11.2026).
 * Worse, each route is its own serverless function with its own cold start, and
 * at this traffic most first loads of the day pay it.
 *
 * So the page's own render calls the route handler as a function, in its own
 * region, beside the database, and hands the answer to the screen through
 * lib/client/html-seed.ts. The handler is the SAME CODE the browser would have
 * reached, so every check it makes — session, ownership, entitlement, feature
 * flag, its own error shapes — applies unchanged and no seeded answer can drift
 * from the route's. next's `cookies()` answers inside a server component's
 * render, so the caller is the same signed-in person.
 *
 * ANY FAILURE SEEDS NOTHING AND COSTS ONLY ITSELF: a throw, a 401, a 404, a
 * body that is not JSON. The screen then asks the route over the network
 * exactly as it did before, so this is additive by construction.
 */

/** The answer, under the URL the browser would have fetched. */
export interface SeedAnswer {
  url: string
  status: number
  body: unknown
}

/** A host that never leaves the process: the handler is called directly, nothing is fetched. */
const SEED_ORIGIN = 'http://seed.internal'

/**
 * Calls one GET handler for `url` and returns its answer, or null for anything
 * that is not a plain 200 with a JSON body. `url` is the path the browser's
 * reader spells, and it is what the answer is keyed by: a seed stored under any
 * other spelling is an answer nobody reads, which is why every one of these
 * paths is built by a shared url module rather than written out twice.
 */
export async function seedAnswer(
  url: string,
  call: (request: Request) => Promise<Response>,
): Promise<SeedAnswer | null> {
  try {
    const response = await call(new Request(new URL(url, SEED_ORIGIN), { method: 'GET' }))
    if (response.status !== 200) return null
    return { url, status: 200, body: await response.json() }
  } catch {
    return null
  }
}
