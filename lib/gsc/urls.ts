/**
 * THE SPELLING OF THE SEARCH CONSOLE READ PATHS, in a module with no 'use
 * client' on it.
 *
 * The widgets' shared reader (components/gsc/gsc-data.ts) is a client module,
 * so every export of it is a client reference: the dashboard layout, a server
 * component, cannot call one. It needs the status path, because it builds that
 * answer itself and hands it to the widgets keyed by the URL they would have
 * fetched. Keeping the spelling here lets both sides use the same one, which is
 * the whole point — a seeded answer under a different URL is an answer nobody
 * reads.
 */
export function gscStatusUrl(projectId: string): string {
  return `/api/gsc/status?projectId=${encodeURIComponent(projectId)}`
}

/** An answer from a /api/gsc route: the HTTP status and the parsed body. Declared
 *  here, not in the client reader, so a server component can name it. */
export interface GscResponse { status: number; body: unknown }

export type GscMetricsView = 'pages' | 'keywords' | 'trend'

export function gscMetricsUrl(projectId: string, view: GscMetricsView): string {
  return `/api/gsc/metrics?projectId=${encodeURIComponent(projectId)}&window=28&view=${view}`
}

/**
 * THE SEEDED ANSWERS ARRIVE ON `globalThis`, PUT THERE BY A SCRIPT TAG.
 *
 * A server-rendered answer has to be in the store BEFORE the first widget
 * renders, or the widget starts its own request and the seed buys nothing. Two
 * things can push a React component's render later than that:
 *
 *  - it sits in a Suspense boundary, which may be hydrated in a LATER commit
 *    than the page's, after the page's effects have already fetched;
 *  - the client module holding the store can be emitted into more than one
 *    chunk, so a component importing it from the layout's entry and a widget
 *    importing it from the page's entry write to two different Maps (the same
 *    reason lib/client/seed-read.ts keeps ITS registry here).
 *
 * A `<script>` has neither problem: the browser runs it while parsing the HTML,
 * long before any hydration, and `globalThis` is the one place both chunks can
 * see. The shared reader adopts what it finds here on its first touch of a URL.
 */
export const GSC_SEED_GLOBAL = '__goTopGscSeed__'

/** How old a seed may be when a widget first asks. A tab left open for minutes
 *  must not be handed the status from page load as if it were current. */
export const GSC_SEED_MAX_AGE_MS = 30_000

export interface GscSeedEntry { at: number; status: number; body: unknown }

/** The script body that puts one answer on `globalThis`, with `<` escaped so a
 *  string inside the answer can never close the tag. */
export function gscSeedScript(url: string, status: number, body: unknown): string {
  const payload = JSON.stringify({ url, status, body }).replace(/</g, '\\u003c')
  return `(function(){try{var s=${payload};var g=globalThis;` +
    `(g.${GSC_SEED_GLOBAL}=g.${GSC_SEED_GLOBAL}||{})[s.url]={at:Date.now(),status:s.status,body:s.body}}catch(e){}})()`
}

/** The seeded answer for `url`, taken (and removed, so it is served once) when it
 *  is still fresh enough to pass for a just-fetched one. */
export function takeGscSeed(url: string): GscSeedEntry | null {
  const store = (globalThis as Record<string, unknown>)[GSC_SEED_GLOBAL] as
    | Record<string, GscSeedEntry | undefined>
    | undefined
  const hit = store?.[url]
  if (!hit) return null
  delete store![url]
  return Date.now() - hit.at < GSC_SEED_MAX_AGE_MS ? hit : null
}
