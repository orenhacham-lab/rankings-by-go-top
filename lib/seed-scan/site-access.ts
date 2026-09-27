/**
 * How steps a1 and b1 reach the network: only the project's own host, only
 * within a deadline, and with a record of every hop. b1 also passes its
 * robots.txt check (`allow`), so a disallowed path is never requested.
 *
 * The engine's fetchers (lib/free-check/site-fetch.ts) already admit every hop
 * as a public address and cap bytes and time per request. A seeding scan needs
 * two more properties, and both are enforced here, in the `fetchImpl` the
 * engine calls for every hop, so they cover every request the engine makes —
 * the home page, its redirects, robots.txt, llms.txt, and every sitemap,
 * including the children of a sitemap index:
 *
 *   1. ONLY THE PROJECT'S HOST. A merchant's project scans the merchant's site.
 *      A redirect to another domain is refused before any request leaves:
 *      `www.` and the bare domain are the same site (domainKey), anything else
 *      is not. (The engine itself now asks only for sitemap documents on the
 *      origin host, 09ee926; its redirects need only a public address, so this
 *      pin is what keeps every hop on the site.)
 *   2. A DEADLINE ACROSS HOPS AND BODY. The engine's own timeout now covers
 *      the body as well (09ee926), but it restarts at every redirect hop; the
 *      deadline signal passed here is also the request's signal, so it bounds a
 *      whole redirect chain, body included, at the step's own budget. A read it
 *      cuts short comes back as what arrived, truncated; a1 and b1 do not take
 *      such a page as read.
 *
 * The hop record is what lets a1 recognise a password-locked Shopify store even
 * when the password page itself answers 401 and the engine returns no HTML.
 *
 * WHOLE OR NOT. The engine hands back whatever text arrived when a body read
 * breaks off (a deadline, a dropped connection), with nothing to say so. For
 * robots.txt that difference decides everything (a cut file's missing half may
 * be its Disallow lines), so a caller can pass `body`, and learns whether the
 * body of the last response was read to its very end.
 */
import { detectPlatform, domainKey } from '@/lib/free-check'

export type FetchHop = {
  url: string
  status: number
  /** The response carried Shopify's own headers. */
  shopify: boolean
}

/** Thrown for a request to another host. The engine reports it as a network failure. */
export class OffHostRequestError extends Error {
  constructor() {
    super('off-host request refused')
    this.name = 'OffHostRequestError'
  }
}

/** Thrown for a request the caller's `allow` refuses (step b1: robots.txt). Also a network failure to the engine. */
export class DisallowedRequestError extends Error {
  constructor() {
    super('request not allowed')
    this.name = 'DisallowedRequestError'
  }
}

function requestUrl(input: RequestInfo | URL): URL | null {
  try {
    if (typeof input === 'string') return new URL(input)
    if (input instanceof URL) return input
    return new URL(input.url)
  } catch {
    return null
  }
}

function shopifyHeaders(headers: Headers): boolean {
  return headers.has('x-shopid') || headers.has('x-shopify-stage') || /shopify/i.test(headers.get('powered-by') ?? '')
}

/**
 * A fetch that only reaches hosts whose domainKey is `siteKey`, aborts at
 * `deadline`, and records every response in `trace`. `offHost` is set when a
 * request was refused, so the caller can tell "redirected away" from "down".
 *
 * `allow`, when given, is asked about every request on the host too — every
 * redirect hop included — and a refused one never leaves (`disallowed` is
 * then set). Step b1 passes its robots.txt check here.
 */
export function hostPinnedFetch(args: {
  siteKey: string
  base: typeof fetch
  deadline: AbortSignal
  trace: FetchHop[]
  offHost: { hit: boolean }
  allow?: (url: URL) => boolean
  disallowed?: { hit: boolean }
  /** Set to whether the body of the latest response was read to its end: not cut, not broken off. */
  body?: { complete: boolean }
}): typeof fetch {
  let hops = 0
  return async (input, init) => {
    // A new request: nothing of it is known to be whole yet.
    const hop = ++hops
    if (args.body) args.body.complete = false
    const url = requestUrl(input)
    if (!url || domainKey(url) !== args.siteKey) {
      args.offHost.hit = true
      throw new OffHostRequestError()
    }
    if (args.allow && !args.allow(url)) {
      if (args.disallowed) args.disallowed.hit = true
      throw new DisallowedRequestError()
    }
    const signal = init?.signal ? AbortSignal.any([init.signal, args.deadline]) : args.deadline
    const res = await args.base(url.toString(), { ...init, signal })
    args.trace.push({ url: url.toString(), status: res.status, shopify: shopifyHeaders(res.headers) })
    return args.body ? watchedBody(res, args.body, hop, () => hops) : res
  }
}

/**
 * The response with its body passed through a stream that marks `watch`
 * complete only when the body ends normally — never when it errors (an abort,
 * a dropped connection) or is cancelled (the engine's size cap) — and only for
 * the latest hop, so a redirect's unread body never counts.
 */
function watchedBody(res: Response, watch: { complete: boolean }, hop: number, latest: () => number): Response {
  if (!res.body) {
    if (hop === latest()) watch.complete = true
    return res
  }
  try {
    const piped = res.body.pipeThrough(
      new TransformStream<Uint8Array, Uint8Array>({
        flush() {
          if (hop === latest()) watch.complete = true
        },
      }),
    )
    return new Response(piped, { status: res.status, statusText: res.statusText, headers: res.headers })
  } catch {
    // Not a response we can re-wrap: its body is never known to be whole.
    return res
  }
}

const PASSWORD_FORM = /<form\b[^>]*\baction\s*=\s*["']?(?:https?:\/\/[^"'\s>/]+)?\/password["'\s>]/i
const PASSWORD_TEMPLATE = /\btemplate-password\b/i

function isPasswordPath(url: string): boolean {
  try {
    return new URL(url).pathname.replace(/\/+$/, '') === '/password'
  } catch {
    return false
  }
}

/**
 * A Shopify storefront behind its password page — a development store, or a
 * store that has not opened yet, like the app reviewer's test store. Its home
 * page redirects to /password, which answers with a login form (200 or 401).
 * Reading it as the store would report the password page's "problems" as the
 * merchant's, so a1 marks it and the later steps say "not measured" instead.
 *
 * Both halves are required: evidence that this is Shopify (its headers, its
 * markup, or a myshopify.com host) AND evidence of the password gate (the
 * redirect to /password, or the password template's own form).
 */
export function isLockedStorefront(input: { trace: FetchHop[]; html: string | null; siteHost: string }): boolean {
  const shopify =
    input.trace.some((h) => h.shopify) ||
    input.siteHost.endsWith('.myshopify.com') ||
    (input.html !== null && detectPlatform(input.html) === 'Shopify')
  if (!shopify) return false
  const redirectedToPassword = input.trace.some((h) => isPasswordPath(h.url))
  const passwordMarkup = input.html !== null && (PASSWORD_FORM.test(input.html) || PASSWORD_TEMPLATE.test(input.html))
  return redirectedToPassword || passwordMarkup
}
