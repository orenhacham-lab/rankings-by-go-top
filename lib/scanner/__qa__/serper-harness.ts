/**
 * A stand-in for the network, for the rank-scanner QA: it answers Serper's
 * search endpoint from the recorded pages in ./serper-fixtures and records every
 * request the scanner makes, so a suite can COUNT provider calls and compare the
 * exact request bodies of two runs. Any request to another host fails loudly.
 */
import type { FixtureResponse } from './serper-fixtures'

export interface RecordedRequest { url: string; body: Record<string, unknown> }

export type PageAnswer = FixtureResponse | 'http_500'

function answer(a: PageAnswer): Response {
  if (a === 'http_500') return new Response('upstream exploded: secret-provider-detail', { status: 500, statusText: 'Internal Server Error' })
  return new Response(JSON.stringify(a), { status: 200, headers: { 'content-type': 'application/json' } })
}

/**
 * Installs a fetch that serves Serper from fixtures.
 *  - `pages`: answers by the request's `page` field (organic mode: 1 and 2).
 *  - `sequence`: answers in call order (radius mode: one call per scan point).
 * Returns the request log and a restore function.
 */
export function installSerperFetch(opts: { pages?: Record<number, PageAnswer>; sequence?: PageAnswer[] }) {
  const log: RecordedRequest[] = []
  const realFetch = globalThis.fetch
  let seq = 0
  globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.startsWith('https://google.serper.dev/')) throw new Error(`unexpected request in QA: ${url}`)
    const body = JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown>
    log.push({ url, body })
    if (opts.sequence) {
      const a = opts.sequence[seq++]
      if (!a) throw new Error('fixture sequence exhausted')
      return answer(a)
    }
    const page = Number(body.page ?? 0)
    const a = opts.pages?.[page]
    if (!a) throw new Error(`no fixture for page ${page}`)
    return answer(a)
  }) as typeof fetch
  return { log, restore: () => { globalThis.fetch = realFetch } }
}

/** Runs `work` with console output silenced — the scanner logs every result. */
export async function quietly<T>(work: () => Promise<T>): Promise<T> {
  const { log, warn, error } = console
  console.log = () => {}; console.warn = () => {}; console.error = () => {}
  try { return await work() } finally { console.log = log; console.warn = warn; console.error = error }
}
