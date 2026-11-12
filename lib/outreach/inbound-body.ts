/**
 * The report's own body, which the webhook does not send.
 *
 * WHAT THE EVIDENCE SAID. Every delivery report this channel has ever recorded —
 * 34 of them between 27 Oct and 5 Nov 2026 — was stored `unreadable report, no
 * recipient named`, so the brake counted none of them and a dead address stayed
 * open to a second message. On 27 Oct the shape of the payload was written into
 * the event row itself (the console log it had been printed to is kept about
 * fifty minutes, and a bounce arrives when it arrives), and the rows say plainly
 * what is wrong:
 *
 *   {id,event,timestamp,data:{attachments:[],bodyUrl:string,cc:[],date:string,
 *    eventId:string,from:string,htmlBody:strin…
 *
 * with an extracted body of exactly 200 characters, every time. The provider
 * sends a 200-character PREVIEW and a `bodyUrl` for the rest. A bounce names its
 * recipient in the transcript line far past the 200th character, so no amount of
 * cleverness in the parser could ever have found it. The body has to be fetched.
 *
 * WHY THE HOST IS CHECKED. The URL arrives inside a payload, and a handler that
 * fetches whatever URL a payload names is a request forgery waiting for the day
 * the webhook secret leaks. Only https, only a host this file names, and when
 * the host is not one of them nothing is fetched and the host is written into
 * the event row instead — the same trick as the shape above, so an unknown host
 * is learned from evidence rather than guessed at. The value of the URL is never
 * logged: it carries a token.
 */

/**
 * WHAT THE EVIDENCE SAID NEXT (11 Nov 2026). The fetch above shipped with four
 * Hostinger hosts in this list, guessed from where the provider's own API lives.
 * Every report since has written `bodyUrl host storage.googleapis.com` into its
 * event row — nine of them between 8 and 11 Nov — so the provider does not serve
 * bodies from its own domain at all. It hands out a Google Cloud Storage URL, and
 * the list below was wrong rather than incomplete.
 *
 * `storage.googleapis.com` is every GCS bucket, not the provider's alone, which
 * is a wider gate than a host of theirs would have been. What it is allowed to do
 * is bounded by everything around it: https only, one request, no redirects, five
 * seconds, 512KB, and the body is only ever read by the delivery classifier. The
 * webhook secret still guards the door. To close the gate properly the bucket has
 * to be named, so `bodyUrlBucket` below writes the first path segment into the
 * event row on every read — learned from evidence, like the shape before it, and
 * then this list can say the bucket instead of the host.
 */

/** Hosts the provider serves message bodies from. A host not here is not fetched. */
export const BODY_URL_HOSTS: readonly string[] = [
  'hostinger.com',
  'hostinger.io',
  'hstgr.io',
  'hstgr.cloud',
  'storage.googleapis.com',
]

/** How long the fetch may take, and how much of it is read. */
export const BODY_FETCH_TIMEOUT_MS = 5000
export const BODY_MAX_BYTES = 512 * 1024

/** The `bodyUrl` the payload carries, wherever the provider nests it. */
export function bodyUrlIn(payload: unknown): string | null {
  const seen = new Set<unknown>()
  const walk = (node: unknown, depth: number): string | null => {
    if (depth > 6 || node === null || typeof node !== 'object' || seen.has(node)) return null
    seen.add(node)
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      if ((key === 'bodyUrl' || key === 'body_url') && typeof value === 'string' && value) return value
      const found = walk(value, depth + 1)
      if (found !== null) return found
    }
    return null
  }
  return walk(payload, 0)
}

/** The URL's host, lowercased, or null when it is not a URL we would ever fetch. */
export function bodyUrlHost(url: string): string | null {
  let parsed: URL
  try {
    parsed = new URL(url)
  } catch {
    return null
  }
  if (parsed.protocol !== 'https:') return null
  return parsed.hostname.toLowerCase()
}

/**
 * The URL's first path segment, which on a bucket host is the bucket's name.
 *
 * Never the query string, which carries the token, and never a segment past the
 * first, which is the object's own path and can name the message.
 */
export function bodyUrlBucket(url: string): string | null {
  try {
    const first = new URL(url).pathname.split('/').filter((part) => part !== '')[0]
    return first === undefined ? null : first.slice(0, 63)
  } catch {
    return null
  }
}

/** True when the body may be fetched from this URL. */
export function allowedBodyUrl(url: string): boolean {
  const host = bodyUrlHost(url)
  if (host === null) return false
  return BODY_URL_HOSTS.some((allowed) => host === allowed || host.endsWith(`.${allowed}`))
}

export type BodyFetcher = (url: string) => Promise<{ status: number; text: string }>

/** What one attempt at the body produced, in terms the event row can carry. */
export type BodyRead =
  /** The body itself. `bucket` is the first path segment, for tightening the list. */
  | { ok: true; text: string; bucket: string | null }
  /** No URL in the payload at all: nothing to try. */
  | { ok: false; why: 'no_url' }
  /** A URL we will not fetch. `host` is null when it was not even a URL. */
  | { ok: false; why: 'host_not_allowed'; host: string | null; bucket: string | null }
  /** The provider answered, but not with a body. */
  | { ok: false; why: 'status'; status: number }
  /** It did not answer in time, or at all. */
  | { ok: false; why: 'unreachable' }

/**
 * The report's body, fetched.
 *
 * Never throws: this runs inside the webhook handler, and a provider whose
 * storage is briefly down must not turn into a 503 that makes it deliver the
 * same report again. A failure here leaves the preview in place, which is
 * exactly what the handler did before this existed.
 */
export async function readReportBody(payload: unknown, fetchBody: BodyFetcher): Promise<BodyRead> {
  const url = bodyUrlIn(payload)
  if (url === null) return { ok: false, why: 'no_url' }
  if (!allowedBodyUrl(url)) {
    return { ok: false, why: 'host_not_allowed', host: bodyUrlHost(url), bucket: bodyUrlBucket(url) }
  }
  try {
    const answer = await fetchBody(url)
    if (answer.status !== 200) return { ok: false, why: 'status', status: answer.status }
    const text = answer.text.slice(0, BODY_MAX_BYTES)
    if (text.trim().length === 0) return { ok: false, why: 'unreachable' }
    return { ok: true, text, bucket: bodyUrlBucket(url) }
  } catch {
    return { ok: false, why: 'unreachable' }
  }
}

/** The one short phrase a failed read leaves in the event row. No URL, no token. */
export function bodyReadNote(read: BodyRead): string | null {
  if (read.ok) return null
  switch (read.why) {
    case 'no_url': return 'no bodyUrl'
    case 'host_not_allowed':
      return `bodyUrl host ${read.host ?? 'unparsable'}${read.bucket === null ? '' : ` bucket ${read.bucket}`}`
    case 'status': return `bodyUrl status ${read.status}`
    case 'unreachable': return 'bodyUrl unreachable'
  }
}

/** The real fetch, with the timeout and the size cap the comment above promises. */
export async function fetchBodyOverHttp(url: string): Promise<{ status: number; text: string }> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), BODY_FETCH_TIMEOUT_MS)
  try {
    const answer = await fetch(url, {
      signal: controller.signal,
      redirect: 'error',
      headers: { accept: 'text/plain, message/rfc822, */*' },
    })
    const text = answer.ok ? (await answer.text()).slice(0, BODY_MAX_BYTES) : ''
    return { status: answer.status, text }
  } finally {
    clearTimeout(timer)
  }
}
