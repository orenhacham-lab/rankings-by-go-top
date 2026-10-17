/**
 * The one way a webhook request leaves the server. Server-side only.
 *
 * A custom-site webhook POSTs to an address the merchant typed, so it is an
 * SSRF primitive unless every request is admitted first. It reuses the app's
 * existing admission rules for outbound fetches (lib/free-check/url-guard.ts,
 * imported, not copied) and adds what a signed POST needs:
 *
 *   1. SYNTAX — `normalizeCheckUrl`: no credentials, no explicit port, no IP
 *      literal in any spelling, no localhost / .local / .internal / metadata
 *      names. Then https only: an http:// webhook is refused, never upgraded.
 *   2. RESOLUTION — `assertPublicHost`: every A/AAAA answer must be public.
 *   3. AT CONNECT TIME — the socket's own DNS lookup runs through the same
 *      check, so a name that re-resolves to 10.0.0.5 between step 2 and the
 *      connection (DNS rebinding) still cannot connect.
 *   4. NO REDIRECTS. A 3xx answer is never followed — not to a public host,
 *      and certainly not to a private one. The delivery fails with
 *      `webhook_redirect_refused` and the merchant is told to give the final URL.
 *   5. CAPS — a request timeout, a request-body cap and a response-body cap.
 *
 * The transport and the resolver are injectable so the QA suite exercises every
 * refusal with a fake network; production passes neither.
 */
import https from 'https'
import dns from 'dns'
import type { LookupAddress } from 'dns'
import { normalizeCheckUrl, assertPublicHost } from '@/lib/free-check/url-guard'
import type { SiteErrorCode } from './types'

export const WEBHOOK_TIMEOUT_MS = 10_000
export const WEBHOOK_MAX_BODY_BYTES = 2_000_000
export const WEBHOOK_MAX_RESPONSE_BYTES = 64_000

export type Resolver = (hostname: string) => Promise<{ address: string; family: number }[]>

export type UrlVerdict =
  | { ok: true; url: URL }
  | { ok: false; code: Extract<SiteErrorCode, 'invalid_url' | 'url_not_https' | 'url_not_public' | 'url_unresolvable'> }

/** Syntax only (no network): what the form can check before anything is sent. */
export function admitWebhookUrlSyntax(raw: string): UrlVerdict {
  const input = String(raw ?? '').trim()
  if (!input) return { ok: false, code: 'invalid_url' }
  // The scheme must be typed and must be https. Without this, normalizeCheckUrl
  // would read "example.com/hook" as https — fine for a page check, but a
  // developer should see exactly the address we will sign and POST to.
  if (/^http:\/\//i.test(input)) return { ok: false, code: 'url_not_https' }
  if (!/^https:\/\//i.test(input)) return { ok: false, code: 'invalid_url' }
  const admitted = normalizeCheckUrl(input)
  if (!admitted.ok) {
    if (admitted.reason === 'scheme') return { ok: false, code: 'url_not_https' }
    if (admitted.reason === 'host_reserved') return { ok: false, code: 'url_not_public' }
    return { ok: false, code: 'invalid_url' }
  }
  if (admitted.url.protocol !== 'https:') return { ok: false, code: 'url_not_https' }
  return { ok: true, url: admitted.url }
}

/** Syntax, then every DNS answer must be a public address. */
export async function admitWebhookUrl(raw: string, resolver?: Resolver): Promise<UrlVerdict> {
  const syntax = admitWebhookUrlSyntax(raw)
  if (!syntax.ok) return syntax
  const host = await assertPublicHost(syntax.url.hostname, resolver)
  if (!host.ok) return { ok: false, code: host.reason === 'dns' ? 'url_unresolvable' : 'url_not_public' }
  return syntax
}

export type TransportRequest = {
  url: URL
  headers: Record<string, string>
  body: string
  timeoutMs: number
  maxResponseBytes: number
}
export type TransportResponse = { status: number; location: string | null; body: string }
/** Sends ONE request. Never follows a redirect. Throws WebhookTransportError on failure. */
export type Transport = (req: TransportRequest) => Promise<TransportResponse>

export class WebhookTransportError extends Error {
  constructor(public readonly kind: 'timeout' | 'blocked' | 'network') {
    super(`webhook transport ${kind}`)
    this.name = 'WebhookTransportError'
  }
}

/**
 * The socket's own lookup: resolve, then refuse unless EVERY answer is public
 * (the same all-or-nothing rule as assertPublicHost, applied to the exact
 * addresses the connection will use).
 */
function publicOnlyLookup(
  hostname: string,
  options: dns.LookupOneOptions | dns.LookupAllOptions,
  callback: (err: NodeJS.ErrnoException | null, address: string | LookupAddress[], family?: number) => void,
): void {
  dns.lookup(hostname, { ...(options as object), all: true }, (err, addresses) => {
    if (err) return callback(err, '', 0)
    const list = (Array.isArray(addresses) ? addresses : [addresses]) as LookupAddress[]
    void assertPublicHost(hostname, async () => list).then((verdict) => {
      if (!verdict.ok) return callback(new WebhookTransportError('blocked') as NodeJS.ErrnoException, '', 0)
      if ((options as dns.LookupAllOptions).all) callback(null, list)
      else callback(null, list[0].address, list[0].family)
    })
  })
}

/** Production transport: one HTTPS POST, pinned lookup, no redirects, capped both ways. */
export const httpsTransport: Transport = (req) =>
  new Promise((resolve, reject) => {
    const r = https.request(
      {
        protocol: 'https:',
        hostname: req.url.hostname,
        port: 443,
        path: `${req.url.pathname}${req.url.search}`,
        method: 'POST',
        headers: { ...req.headers, 'Content-Length': String(Buffer.byteLength(req.body)) },
        lookup: publicOnlyLookup as unknown as undefined,
        timeout: req.timeoutMs,
      },
      (res) => {
        const chunks: Buffer[] = []
        let size = 0
        res.on('data', (c: Buffer) => {
          size += c.length
          if (size > req.maxResponseBytes) { res.destroy(); return }
          chunks.push(c)
        })
        const done = () => resolve({
          status: res.statusCode ?? 0,
          location: typeof res.headers.location === 'string' ? res.headers.location : null,
          body: Buffer.concat(chunks).toString('utf8'),
        })
        res.on('end', done)
        res.on('close', done)
        res.on('error', done)
      },
    )
    const deadline = setTimeout(() => r.destroy(new WebhookTransportError('timeout')), req.timeoutMs)
    r.on('timeout', () => r.destroy(new WebhookTransportError('timeout')))
    r.on('error', (e) => {
      clearTimeout(deadline)
      reject(e instanceof WebhookTransportError ? e : new WebhookTransportError('network'))
    })
    r.on('close', () => clearTimeout(deadline))
    r.end(req.body)
  })

export type GuardedResult =
  | { ok: true; status: number; body: string }
  | { ok: false; code: SiteErrorCode; retryable: boolean; status?: number }

/**
 * Admit the URL, then send the body once. Every outcome is a stable code; the
 * receiver's own words (its error page, its JSON) are never passed on.
 */
export async function sendGuardedPost(
  rawUrl: string,
  headers: Record<string, string>,
  body: string,
  deps: { resolver?: Resolver; transport?: Transport } = {},
): Promise<GuardedResult> {
  if (Buffer.byteLength(body) > WEBHOOK_MAX_BODY_BYTES) return { ok: false, code: 'webhook_too_large', retryable: false }
  const admitted = await admitWebhookUrl(rawUrl, deps.resolver)
  if (!admitted.ok) return { ok: false, code: admitted.code, retryable: admitted.code === 'url_unresolvable' }
  const transport = deps.transport ?? httpsTransport
  let res: TransportResponse
  try {
    res = await transport({ url: admitted.url, headers, body, timeoutMs: WEBHOOK_TIMEOUT_MS, maxResponseBytes: WEBHOOK_MAX_RESPONSE_BYTES })
  } catch (e) {
    const kind = e instanceof WebhookTransportError ? e.kind : 'network'
    if (kind === 'blocked') return { ok: false, code: 'url_not_public', retryable: false }
    if (kind === 'timeout') return { ok: false, code: 'webhook_timeout', retryable: true }
    return { ok: false, code: 'webhook_unreachable', retryable: true }
  }
  // Never followed — wherever it points. (The Location is read only to be dropped.)
  if (res.status >= 300 && res.status < 400) return { ok: false, code: 'webhook_redirect_refused', retryable: false, status: res.status }
  if (res.status >= 200 && res.status < 300) return { ok: true, status: res.status, body: res.body }
  const retryable = res.status === 429 || res.status >= 500
  return { ok: false, code: 'webhook_rejected', retryable, status: res.status }
}
