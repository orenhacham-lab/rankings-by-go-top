/**
 * THE ONE PLACE A REQUEST BODY IS BUILT FOR SERPER, AND THE REASON IT EXISTS.
 *
 * Serper is the search provider behind the rank scan, the Maps scan and the
 * pre-signup research. It REFUSED TO SIGN A DATA PROCESSING AGREEMENT
 * (/mnt/project-files/legal/serper-dpa-refusal-2026-10-12.md), and the privacy
 * policy says so in all nine languages rather than implying a contract that
 * does not exist. The mitigation we chose instead of a contract is this file:
 * if there is no Art. 28 agreement, then no personal data may reach them, and
 * that has to be a property of the code rather than a habit of whoever edits
 * the next call site.
 *
 * So every Serper request body goes through `serperBody`, which keeps the keys
 * the search API actually reads and DROPS everything else. It drops rather than
 * throws on purpose: a scan that silently loses a parameter it should not have
 * sent is a bug, while a scan that throws in production is an outage, and the
 * suite is what turns the bug into a build failure. `lib/scanner/__qa__
 * /serper-payload.qa.ts` fails if a call site builds a key this list does not
 * carry, so a new key is a deliberate decision with a sentence behind it and
 * never an accident.
 *
 * WHAT THE ALLOWED KEYS ARE, AND WHY EACH IS NOT PERSONAL DATA:
 *   q         the search phrase — the keyword the customer tracks, which is
 *             what they typed as a market query, not a fact about a person
 *   gl, hl    country and interface language of the search
 *   type      'search' or 'maps'
 *   device    'mobile' or 'desktop' — the scan's own choice, NOT read from any
 *             visitor's User-Agent
 *   ll        the coordinates of the point the rank is measured from — a point
 *             on a map we picked, never a device location
 *   location  a city or postcode string for geocoding context
 *   num, page how many results and which page
 *
 * None of them carries an email address, a name, an account id, a project id,
 * an IP address or a browser identifier, and that is the whole claim the
 * privacy policy makes about this provider.
 */

/** The only keys that may be sent to Serper. */
export const SERPER_ALLOWED_KEYS = [
  'q',
  'gl',
  'hl',
  'type',
  'device',
  'll',
  'location',
  'num',
  'page',
] as const

export type SerperAllowedKey = (typeof SERPER_ALLOWED_KEYS)[number]

const ALLOWED = new Set<string>(SERPER_ALLOWED_KEYS)

/**
 * The body as it will be sent: allowed keys with a defined value, and nothing
 * else.
 *
 * IT FILTERS AND DOES NOT REORDER. The caller's own key order is kept, so
 * introducing this function changed no request by a single byte — which is
 * what let lib/scanner/__qa__/competitor-positions.qa.ts keep comparing live
 * request bodies against the bodies recorded in original-scanner-outputs.json
 * from before any of this existed. A normalized order would have been tidier
 * and would have retired that baseline, and the baseline is worth more.
 *
 * `dropped` names what was removed, for a caller that wants to log a
 * classified reason. It is deliberately not thrown: see the header.
 */
export function serperPayload(input: Record<string, unknown>): {
  body: Record<string, unknown>
  dropped: string[]
} {
  const body: Record<string, unknown> = {}
  const dropped: string[] = []
  for (const key of Object.keys(input)) {
    if (input[key] === undefined) continue
    if (ALLOWED.has(key)) body[key] = input[key]
    else dropped.push(key)
  }
  return { body, dropped }
}

/**
 * The JSON string to put in `body:`. Every Serper `fetch` uses this and never
 * `JSON.stringify` on a body of its own, which is what the source guard
 * checks.
 */
export function serperBody(input: Record<string, unknown>, label = 'serper'): string {
  const { body, dropped } = serperPayload(input)
  if (dropped.length > 0) {
    // A classified reason, not the values: the values are what we are keeping
    // out of a log as much as out of the request.
    console.warn(`[${label}] dropped non-allowlisted Serper parameters: ${dropped.join(', ')}`)
  }
  return JSON.stringify(body)
}
