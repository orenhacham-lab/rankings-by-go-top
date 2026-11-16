/**
 * AN ANSWER THE SERVER ALREADY HAS, HANDED TO THE BROWSER INSTEAD OF ASKED FOR.
 *
 * A screen's reads cost a browser round trip each, and a round trip here is
 * about 650ms whatever it reads: `/api/version` — no auth, no database, a
 * constant — measured 510-760ms from Oren's browser against production on
 * 16.11.2026. When the server rendering the page could answer the question
 * itself, in its own region, beside the database, the round trip is pure
 * waiting.
 *
 * THE ANSWER ARRIVES AS A SCRIPT, NOT AS A COMPONENT'S PROPS. Two things push a
 * React component's render later than the first widget that wants the answer:
 *
 *  - a Suspense boundary, which React may hydrate in a LATER commit than the
 *    page's, after the page's effects have already fetched;
 *  - a client module emitted into more than one chunk, where a component
 *    importing the store from one entry and a widget importing it from another
 *    write to two different Maps.
 *
 * A `<script>` has neither problem: the browser runs it while parsing the HTML,
 * before any hydration, and `globalThis` is the one place every chunk can see.
 * (lib/client/seed-read.ts keeps its own registry there for the same reason.)
 *
 * A reader takes the answer on its first touch of that URL and from then on
 * behaves exactly as if it had fetched it. If there is nothing here — the seed
 * was for another project, the server could not build it, the page was served
 * before this existed — the reader fetches, which is what it did before.
 */

/** The one place on `globalThis` where every seeded answer waits. */
export const HTML_SEED_GLOBAL = '__goTopHtmlSeed__'

/**
 * How old a seed may be when a reader first asks. A tab left open for minutes
 * must never be handed the answer from page load as if it were current.
 */
export const HTML_SEED_MAX_AGE_MS = 30_000

export interface SeededAnswer { status: number; body: unknown }
interface SeedEntry extends SeededAnswer { at: number }

/**
 * The script body that puts one answer on `globalThis`, keyed by the URL the
 * browser would otherwise have fetched. `<` is escaped so no string inside the
 * answer can close the tag, and the whole thing is wrapped so a failure here
 * can never stop the page: the reader simply fetches.
 */
export function seedScript(url: string, status: number, body: unknown): string {
  const payload = JSON.stringify({ url, status, body }).replace(/</g, '\\u003c')
  return `(function(){try{var s=${payload};var g=globalThis;` +
    `(g.${HTML_SEED_GLOBAL}=g.${HTML_SEED_GLOBAL}||{})[s.url]={at:Date.now(),status:s.status,body:s.body}}catch(e){}})()`
}

/**
 * The seeded answer for `url`, taken (and removed, so it is served once) when it
 * is still fresh enough to pass for a just-fetched one. A stale one is dropped
 * rather than served.
 */
export function takeSeed(url: string): SeededAnswer | null {
  const store = (globalThis as Record<string, unknown>)[HTML_SEED_GLOBAL] as
    | Record<string, SeedEntry | undefined>
    | undefined
  const hit = store?.[url]
  if (!hit || !store) return null
  delete store[url]
  return Date.now() - hit.at < HTML_SEED_MAX_AGE_MS ? { status: hit.status, body: hit.body } : null
}
