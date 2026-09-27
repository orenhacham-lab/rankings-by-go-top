/**
 * Step a4's search: Serper, the rank scanner's conventions, three requests at
 * most per run, and nothing of the provider's words in what comes back.
 *
 * The scanner (lib/scanner/google-search.ts) keeps its domain helpers private
 * and is being extended in parallel, so serper.ts mirrors them. PARITY below
 * compiles the scanner's own helpers out of its source at test time and
 * compares both on a corpus, so a drift on either side fails here.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-serper.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import * as ts from 'typescript'
import { runStageA } from '../runner'
import { createSerperSearch, isDomainMatch, isNonCompetitor, normalizeResultDomain, RESULTS_PER_QUERY } from '../serper'
import { createSeedRun } from '../store'
import { initialSummary } from '../summary'
import {
  captureConsole,
  FakeNetwork,
  fakeModel,
  HE_WP,
  HE_WP_INSIGHT,
  heWordPressSite,
  installFakeDns,
  makeChecker,
  NOW,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
} from './_fixtures'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')

/** The source of `function name(...) {...}` in `src`, found by brace matching. */
function functionSource(src: string, name: string): string {
  const start = src.indexOf(`function ${name}(`)
  if (start < 0) throw new Error(`function ${name} not found`)
  const open = src.indexOf('{', src.indexOf(')', start))
  let depth = 0
  for (let i = open; i < src.length; i++) {
    if (src[i] === '{') depth++
    else if (src[i] === '}' && --depth === 0) return src.slice(start, i + 1)
  }
  throw new Error(`function ${name} is unbalanced`)
}

type Oracle = { normalizeDomain: (s: string) => string; isDomainMatch: (a: string, b: string) => boolean }

/** The scanner's own helpers, compiled from its source. */
function scannerOracle(): Oracle {
  const src = readFileSync(join(ROOT, 'lib/scanner/google-search.ts'), 'utf8')
  const code = ['safeDecodeURL', 'unwrapRedirect', 'extractHostname', 'normalizeDomain', 'isDomainMatch'].map((n) => functionSource(src, n)).join('\n')
  const js = ts.transpileModule(code, { compilerOptions: { target: ts.ScriptTarget.ES2020, module: ts.ModuleKind.None } }).outputText
  return new Function(`${js}\nreturn { normalizeDomain, isDomainMatch }`)() as Oracle
}

const CORPUS = [
  'https://www.example.com/path?q=1',
  'example.com',
  'blog.example.com',
  'www.example.com',
  'https://www.google.com/url?q=https%3A%2F%2Fexample.com',
  'https://www.google.com/url?q=https://dest.co.il/page&sa=U',
  'http://www.google.com/aclk?sa=l&adurl=https://ads-dest.com/x',
  'https://google.co.il/url?url=https%253A%252F%252Fdouble.com',
  'https://www.googleadservices.com/pagead/aclk?adurl=https://adv.com',
  'HTTPS://WWW.EXAMPLE.COM/',
  'https://m.facebook.com/page',
  'https://he.wikipedia.org/wiki/%D7%90',
  'https://xn--4dbrk0ce.co.il/',
  'https://shop.example.co.il:8443/x',
  'not a url at all',
  '%E0%A4%A',
  '',
  'www.',
  'https://www.www.example.com',
]

async function main() {
  console.log('PARITY) the mirrored normalization is the scanner\'s')
  const oracle = scannerOracle()
  const mismatches = CORPUS.filter((s) => oracle.normalizeDomain(s) !== normalizeResultDomain(s))
  check(`normalizeResultDomain equals the scanner's normalizeDomain on ${CORPUS.length} inputs`, mismatches.length === 0,
    mismatches.map((s) => `${s} → ${oracle.normalizeDomain(s)} vs ${normalizeResultDomain(s)}`).join(' ; '))
  const pairs: [string, string][] = [['blog.example.com', 'example.com'], ['notexample.com', 'example.com'], ['example.com', 'example.com'], ['example.co', 'example.com'], ['', 'x.com'], ['a.b.example.com', 'b.example.com']]
  check('isDomainMatch equals the scanner\'s', pairs.every(([a, b]) => oracle.isDomainMatch(a, b) === isDomainMatch(a, b)))
  check("the scanner's documented examples hold",
    normalizeResultDomain('https://www.example.com/path?q=1') === 'example.com' && normalizeResultDomain('blog.example.com') === 'blog.example.com'
    && normalizeResultDomain('https://www.google.com/url?q=https%3A%2F%2Fexample.com') === 'example.com')
  // MUTATION CONTROL: a normalization that forgets to strip www must be caught.
  const broken = (s: string) => normalizeResultDomain(s).replace(/^/, s.includes('www.') ? 'www.' : '')
  check('MUTATION CONTROL: a drifted normalization is detected by the same comparison', CORPUS.some((s) => oracle.normalizeDomain(s) !== broken(s)))

  console.log('\nNON-COMPETITORS) platforms that rank for everything')
  for (const d of ['facebook.com', 'm.facebook.com', 'he.wikipedia.org', 'youtube.com', 'youtu.be', 'google.co.il', 'maps.google.com', 'google.de', 'instagram.com', 'reddit.com', 'x.com'])
    check(`${d} is not a competitor`, isNonCompetitor(d))
  for (const d of ['easy.co.il', 'notfacebook.com', 'googleplex-shop.com', 'wikipedia-fans.co.il', 'max.com'])
    check(`${d} can be a competitor`, !isNonCompetitor(d))

  console.log('\nREQUEST) one request per query, the scanner\'s conventions, bounded')
  {
    const requests: { url: string; init: RequestInit }[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      requests.push({ url, init })
      return Response.json({ organic: [
        { link: 'https://www.rival.co.il/a' }, { link: 'https://rival.co.il/b' },
        { link: 'https://www.google.com/url?q=https%3A%2F%2Fwrapped.co.il%2Fx' }, { link: 'https://Shop.Other.co.il/' },
        ...Array.from({ length: 12 }, (_, i) => ({ link: `https://site${i}.com/` })),
      ] })
    }) as unknown as typeof fetch
    const search = createSerperSearch({ apiKey: 'test-key', fetchImpl })
    const r = await search('אינסטלטור', { gl: 'il', hl: 'he' })
    const body = JSON.parse(String(requests[0]?.init.body)) as Record<string, unknown>
    const headers = requests[0]?.init.headers as Record<string, string>
    check('exactly one request', requests.length === 1)
    check("POST to Serper's search endpoint with the key in X-API-KEY", requests[0]?.url === 'https://google.serper.dev/search' && requests[0]?.init.method === 'POST' && headers['X-API-KEY'] === 'test-key')
    check('body: q, gl, hl, type search, top 10, first page', body.q === 'אינסטלטור' && body.gl === 'il' && body.hl === 'he' && body.type === 'search' && body.num === RESULTS_PER_QUERY && body.page === 1, JSON.stringify(body))
    check('result domains: normalized, distinct, redirect unwrapped, in rank order, top 10 only',
      r.ok && r.domains.slice(0, 4).join(',') === 'rival.co.il,wrapped.co.il,shop.other.co.il,site0.com' && r.domains.length === 9, JSON.stringify(r))
  }
  {
    let called = 0
    const search = createSerperSearch({ apiKey: null, fetchImpl: (async () => { called++; return Response.json({}) }) as unknown as typeof fetch })
    const r = await search('q', { gl: 'il', hl: 'he' })
    check('no SERPER_API_KEY → search_unavailable, and nothing is sent', !r.ok && r.code === 'search_unavailable' && called === 0)
  }
  {
    const refusal = new Response(`{"message":"${SECRET}"}`, { status: 403, statusText: SECRET })
    const search = createSerperSearch({ apiKey: 'k', fetchImpl: (async () => refusal) as unknown as typeof fetch })
    const r = await search('q', { gl: 'il', hl: 'he' })
    check("a refusal → search_failed; the provider's status text and body are not even read", !r.ok && r.code === 'search_failed' && refusal.bodyUsed === false && !JSON.stringify(r).includes(SECRET))
  }
  {
    const search = createSerperSearch({ apiKey: 'k', fetchImpl: (async () => { throw new Error(`${SECRET} ECONNRESET`) }) as unknown as typeof fetch })
    const r = await search('q', { gl: 'il', hl: 'he' })
    check('a network error → search_failed, its text nowhere', !r.ok && r.code === 'search_failed' && !JSON.stringify(r).includes(SECRET))
    const bad = createSerperSearch({ apiKey: 'k', fetchImpl: (async () => new Response('<html>not json', { status: 200 })) as unknown as typeof fetch })
    const noOrganic = createSerperSearch({ apiKey: 'k', fetchImpl: (async () => Response.json({ error: SECRET })) as unknown as typeof fetch })
    const a = await bad('q', { gl: 'il', hl: 'he' })
    const b = await noOrganic('q', { gl: 'il', hl: 'he' })
    check('a body that is not JSON, or has no organic results → search_failed', !a.ok && a.code === 'search_failed' && !b.ok && b.code === 'search_failed' && !JSON.stringify(b).includes(SECRET))
  }
  {
    const hang = (async (_u: string, init: RequestInit) => new Promise((_resolve, reject) => {
      init.signal?.addEventListener('abort', () => reject(Object.assign(new Error('aborted'), { name: 'AbortError' })))
    })) as unknown as typeof fetch
    const t0 = Date.now()
    const r = await createSerperSearch({ apiKey: 'k', fetchImpl: hang, timeoutMs: 100 })('q', { gl: 'il', hl: 'he' })
    check('a hung request is aborted at its timeout → search_timeout', !r.ok && r.code === 'search_timeout' && Date.now() - t0 < 1_000)
  }

  console.log('\nSPEND) through a whole run: three requests at most, whatever the keywords')
  installFakeDns()
  {
    const serperRequests: string[] = []
    const fetchImpl = (async (url: string, init: RequestInit) => {
      serperRequests.push(`${url} ${JSON.parse(String(init.body)).q}`)
      return Response.json({ organic: [{ link: 'https://rival-plumber.co.il/' }] })
    }) as unknown as typeof fetch
    const { tables, admin } = world(projectRow())
    const scope = { projectId: PROJECT, userId: USER }
    const created = await createSeedRun(admin, scope, { trigger: 'create', stage: 'a', summary: initialSummary({ source: 'scan', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }), now: NOW })
    if (!created.ok) throw new Error('create')
    await captureConsole(() => runStageA({ admin, scope, runId: created.run.id, lease: created.lease, deps: { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: createSerperSearch({ apiKey: 'k', fetchImpl }), now: () => NOW } }))
    check('five seed keywords → exactly three Serper requests, one per query', serperRequests.length === 3 && new Set(serperRequests).size === 3, serperRequests.join(' | '))
    check('…and the run completes', tables.project_seed_runs[0].status === 'done')
  }
  {
    const fetchImpl = (async () => new Response(`{"message":"${SECRET}: invalid API key"}`, { status: 401, statusText: SECRET })) as unknown as typeof fetch
    const { tables, admin } = world(projectRow())
    const scope = { projectId: PROJECT, userId: USER }
    const created = await createSeedRun(admin, scope, { trigger: 'create', stage: 'a', summary: initialSummary({ source: 'scan', domain: HE_WP.key, url: 'https://plumber-tlv.co.il/', locale: 'he' }), now: NOW })
    if (!created.ok) throw new Error('create')
    const { output } = await captureConsole(() => runStageA({ admin, scope, runId: created.run.id, lease: created.lease, deps: { fetchImpl: new FakeNetwork(heWordPressSite()).fetch, insight: fakeModel({ ok: true, insight: HE_WP_INSIGHT }).fn, search: createSerperSearch({ apiKey: 'k', fetchImpl }), now: () => NOW } }))
    const a4 = tables.project_seed_steps.find((s) => s.step === 'a4')
    check('Serper refusing every search → a4 failed search_failed, run partial', a4?.status === 'failed' && a4?.error_code === 'search_failed' && tables.project_seed_runs[0].status === 'partial')
    check(`…${SECRET} in no row and no log line`, !JSON.stringify(tables).includes(SECRET) && !output.includes(SECRET))
    check('…the model\'s suggestions stay in the snapshot, unvalidated', ((tables.project_seed_runs[0].summary as { competitors: { validated: boolean }[] }).competitors ?? []).every((c) => c.validated === false))
    check('…and nothing unvalidated is added to the project', tables.ai_visibility_competitors.length === 0)
  }

  finish()
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}
