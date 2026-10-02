/**
 * The only outbound HTTP the free site check performs.
 *
 * Every property that keeps a public, unauthenticated scanner from becoming a
 * proxy for the attacker lives here:
 *   - each hop (the original URL and every redirect target) is re-admitted
 *     through normalizeCheckUrl + assertPublicHost, so a 302 to
 *     http://169.254.169.254/ is refused as firmly as typing it in the form;
 *   - redirects are followed manually, at most MAX_REDIRECTS times;
 *   - the body is read through the stream and abandoned at MAX_BYTES, so a
 *     multi-gigabyte response cannot exhaust the function's memory;
 *   - a wall-clock timeout bounds every request AND its body read, so a server
 *     that answers headers instantly and then dribbles bytes forever cannot
 *     hold the function open;
 *   - no cookies, no credentials, no caller-supplied headers are forwarded.
 * Errors are returned as coarse reason codes; raw provider text never reaches
 * the merchant (a standing rule in CLAUDE.md).
 */
import { assertPublicHost, normalizeCheckUrl } from './url-guard'

export const MAX_BYTES = 1_500_000
export const MAX_REDIRECTS = 3
export const REQUEST_TIMEOUT_MS = 12_000
const USER_AGENT = 'GoTopFreeCheck/1.0 (+https://gotopseo.com/free-check)'

export type FetchFailure = 'blocked' | 'dns' | 'timeout' | 'http_error' | 'not_html' | 'too_large' | 'network'

export type FetchedPage = {
  ok: true
  /** Final URL after redirects. */
  url: string
  status: number
  html: string
  /** True when the body hit MAX_BYTES and was cut; parsers must tolerate it. */
  truncated: boolean
}

export type FetchedText = { ok: true; url: string; status: number; text: string }

export type FetchResult<T> = T | { ok: false; reason: FetchFailure; status?: number }

type Deps = { fetchImpl?: typeof fetch }

/**
 * Read a response body under a cap, and never throw.
 *
 * A body read fails in ordinary ways — the connection drops, the deadline
 * aborts the stream mid-transfer — and each of those used to escape as an
 * exception from whichever caller happened to be reading. They are ordinary
 * outcomes of fetching a stranger's website, so they come back as a flag and
 * whatever was read so far.
 */
async function readCapped(res: Response): Promise<{ text: string; truncated: boolean; failed: boolean }> {
  const body = res.body
  if (!body) return { text: '', truncated: false, failed: false }
  const reader = body.getReader()
  const decoder = new TextDecoder('utf-8', { fatal: false })
  let out = ''
  let total = 0
  let truncated = false
  let failed = false
  try {
    for (;;) {
      const { done, value } = await reader.read()
      if (done) break
      if (!value) continue
      total += value.byteLength
      if (total > MAX_BYTES) {
        out += decoder.decode(value.slice(0, Math.max(0, MAX_BYTES - (total - value.byteLength))), { stream: false })
        truncated = true
        await reader.cancel().catch(() => {})
        break
      }
      out += decoder.decode(value, { stream: true })
    }
  } catch {
    // An aborted or broken stream: keep what arrived, and say it is partial.
    failed = true
    truncated = true
  }
  if (!truncated) out += decoder.decode()
  return { text: out, truncated, failed }
}

/** One admitted, size- and time-capped GET. No redirect following. */
/**
 * One admitted GET. No redirect following.
 *
 * The deadline is NOT cleared when the headers arrive: it belongs to the whole
 * exchange, and the caller clears it once it has finished reading the body.
 * Clearing it here is what let a slow-drip response run unbounded — the request
 * looked instant and the read took forever.
 */
async function guardedGet(
  url: URL,
  accept: string,
  deps: Deps,
): Promise<FetchResult<{ ok: true; res: Response; url: URL; done: () => void }>> {
  const host = await assertPublicHost(url.hostname)
  if (!host.ok) return { ok: false, reason: host.reason === 'dns' ? 'dns' : 'blocked' }

  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS)
  const done = () => clearTimeout(timer)
  try {
    const res = await (deps.fetchImpl ?? fetch)(url.toString(), {
      method: 'GET',
      redirect: 'manual',
      signal: controller.signal,
      headers: { accept, 'user-agent': USER_AGENT, 'accept-language': 'he,en;q=0.8' },
      cache: 'no-store',
    })
    return { ok: true, res, url, done }
  } catch (err) {
    done()
    const aborted = err instanceof Error && (err.name === 'AbortError' || err.name === 'TimeoutError')
    return { ok: false, reason: aborted ? 'timeout' : 'network' }
  }
}

/** Follow up to MAX_REDIRECTS hops, re-admitting every target. */
async function followed(
  start: URL,
  accept: string,
  deps: Deps,
): Promise<FetchResult<{ ok: true; res: Response; url: URL; done: () => void }>> {
  let current = start
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const attempt = await guardedGet(current, accept, deps)
    if (!attempt.ok) return attempt
    const { res, done } = attempt
    if (res.status >= 300 && res.status < 400) {
      // This hop is finished: release its deadline before starting the next.
      done()
      const location = res.headers.get('location')
      if (!location) return { ok: false, reason: 'http_error', status: res.status }
      let next: URL
      try {
        next = new URL(location, current)
      } catch {
        return { ok: false, reason: 'blocked' }
      }
      // Re-run SYNTAX admission on the hop too — a redirect to file:// or to
      // http://127.0.0.1 must die here, not at the socket.
      const admitted = normalizeCheckUrl(next.toString())
      if (!admitted.ok) return { ok: false, reason: 'blocked' }
      current = admitted.url
      continue
    }
    return { ok: true, res, url: current, done }
  }
  return { ok: false, reason: 'blocked' }
}

/** Fetch a page and return its HTML, or a coarse failure reason. */
export async function fetchSiteHtml(start: URL, deps: Deps = {}): Promise<FetchResult<FetchedPage>> {
  const attempt = await followed(start, 'text/html,application/xhtml+xml', deps)
  if (!attempt.ok) return attempt
  const { res, url, done } = attempt
  try {
    if (!res.ok) return { ok: false, reason: 'http_error', status: res.status }

    const type = (res.headers.get('content-type') ?? '').toLowerCase()
    if (type && !type.includes('html') && !type.includes('xml') && !type.includes('text/plain')) {
      return { ok: false, reason: 'not_html' }
    }
    const declared = Number(res.headers.get('content-length') ?? '0')
    if (declared > MAX_BYTES * 4) return { ok: false, reason: 'too_large' }

    const { text, truncated, failed } = await readCapped(res)
    // A read that died with nothing usable is a failed fetch; one that died
    // with a page's worth of HTML is a truncated page, which the parsers
    // already tolerate.
    if (!text.trim()) return { ok: false, reason: failed ? 'timeout' : 'not_html' }
    return { ok: true, url: url.toString(), status: res.status, html: text, truncated }
  } finally {
    done()
  }
}

/**
 * Fetch a small companion text file (robots.txt, llms.txt). A 404 is a real
 * answer here, not an error, so the caller gets the status either way.
 */
export async function fetchSiteText(start: URL, deps: Deps = {}): Promise<FetchResult<FetchedText>> {
  const attempt = await followed(start, 'text/plain,*/*;q=0.5', deps)
  if (!attempt.ok) return attempt
  const { res, url, done } = attempt
  try {
    const { text, failed } = await readCapped(res)
    if (failed && !text.trim()) return { ok: false, reason: 'timeout' }
    return { ok: true, url: url.toString(), status: res.status, text: text.slice(0, 100_000) }
  } finally {
    done()
  }
}
