/**
 * How step a1 reaches the network: only the project's own host, only within a
 * deadline, and with a record of every hop.
 *
 * The engine's fetchers (lib/free-check/site-fetch.ts) already admit every hop
 * as a public address and cap bytes and time per request. A seeding scan needs
 * two more properties, and both are enforced here, in the `fetchImpl` the
 * engine calls for every hop, so they cover every request the engine makes —
 * the home page, its redirects, robots.txt, llms.txt, and every sitemap,
 * including the children of a sitemap index:
 *
 *   1. ONLY THE PROJECT'S HOST. A merchant's project scans the merchant's site.
 *      A redirect to another domain, or a sitemap index that lists a child on
 *      another domain, is refused before any request leaves: `www.` and the bare
 *      domain are the same site (domainKey), anything else is not.
 *   2. A DEADLINE ACROSS HOPS AND BODY. The engine's per-request timeout ends
 *      when the headers arrive; the deadline signal passed here is also the
 *      request's signal, so it bounds reading the body too, and it bounds a
 *      whole redirect chain rather than each hop.
 *
 * The hop record is what lets a1 recognise a password-locked Shopify store even
 * when the password page itself answers 401 and the engine returns no HTML.
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
 */
export function hostPinnedFetch(args: {
  siteKey: string
  base: typeof fetch
  deadline: AbortSignal
  trace: FetchHop[]
  offHost: { hit: boolean }
}): typeof fetch {
  return async (input, init) => {
    const url = requestUrl(input)
    if (!url || domainKey(url) !== args.siteKey) {
      args.offHost.hit = true
      throw new OffHostRequestError()
    }
    const signal = init?.signal ? AbortSignal.any([init.signal, args.deadline]) : args.deadline
    const res = await args.base(url.toString(), { ...init, signal })
    args.trace.push({ url: url.toString(), status: res.status, shopify: shopifyHeaders(res.headers) })
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
