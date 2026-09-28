/**
 * GET /api/keyword-research/scan — a project's keyword research (the seeding
 * scan's and the project's own), for the research tab: who may read it, what it
 * reads, and what it never does.
 *
 * The handler (lib/keyword-research/scan-route.ts) runs against an in-memory
 * Supabase (FakeAdmin) through recording clients, with the engine's REAL site
 * vocabulary reader:
 *
 *  A1-A5) signed in, else 401; the project is the caller's, else 404 (a malformed
 *         id and a stranger's project answer the same); the service role is not
 *         touched before ownership; the scan's flag and the caller's role are
 *         never asked: an unscanned project reads its own research too (A5);
 *  A6-A7) every read names the owner (the session client) or the proven project
 *         (the service role's vocabulary read); the project's own research is
 *         read beside the scan's; nothing of another account leaks;
 *  A8)    relevance is the engine's own filter, with b2's vocabulary rule;
 *  A9)    the answer: the merged research, the tracked keywords, never cached;
 *  A10)   every failure is a stable code; no database text in a body or a log;
 *  A11)   no Google Ads, Serper or model call and no network connection at all:
 *         provider modules are wrapped to record any call, fetch and every socket
 *         connect are trapped; controls show both traps fire;
 *  A12)   every refusal is exactly { ok: false, code } with a known code;
 *  A13)   the route file wires the real dependencies and exports GET only.
 *
 * Mutation controls: lib/keyword-research/__qa__/mutation-controls.mjs.
 *
 * Run: npx tsx lib/keyword-research/__qa__/scan-route.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports, @typescript-eslint/no-explicit-any */

// ── Traps first: nothing below may reach a provider or the network ──────────
const Module: any = require('module')
const net: typeof import('net') = require('net')
const { readFileSync } = require('fs') as typeof import('fs')
const { join } = require('path') as typeof import('path')

const providerCalls: string[] = []
const netCalls: string[] = []
const wrappedModules = new Set<string>()
const PROVIDERS = [
  /lib\/google-ads\/(client|keyword-ideas)\.ts$/, /lib\/seed-scan\/serper\.ts$/, /lib\/scanner\/google-(search|maps)\.ts$/,
  /lib\/content\/recommendations\/genai-client\.ts$/, /lib\/content\/recommendations\/brief-synthesis\.ts$/,
  /lib\/content\/article-generation\.ts$/, /lib\/content\/gemini-image\.ts$/, /lib\/ai-visibility\/gemini-semantic-classifier\.ts$/,
  /node_modules\/@google\/genai\//, /node_modules\/@google\/generative-ai\//, /node_modules\/openai\//, /node_modules\/@anthropic-ai\//,
]
const isErrorClass = (f: any) => { try { return f.prototype instanceof Error || f === Error } catch { return false } }
function recorded(name: string, exp: any): any {
  if (!exp || (typeof exp !== 'object' && typeof exp !== 'function')) return exp
  const fns = new Map<PropertyKey, any>()
  return new Proxy(exp, {
    get(target, prop) {
      const v = target[prop]
      if (typeof v !== 'function') return v
      if (!fns.has(prop)) {
        fns.set(prop, new Proxy(v, {
          apply(fn, self, args) { providerCalls.push(`${name}.${String(prop)}()`); return Reflect.apply(fn, self, args) },
          construct(fn, args, newTarget) {
            if (!isErrorClass(fn)) providerCalls.push(`new ${name}.${String(prop)}`)
            return Reflect.construct(fn, args, newTarget)
          },
        }))
      }
      return fns.get(prop)
    },
  })
}
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  let resolved = ''
  try { resolved = String(Module._resolveFilename(request, parent, isMain)) } catch { return real }
  if (!PROVIDERS.some((re) => re.test(resolved))) return real
  wrappedModules.add(resolved.replace(/^.*?(lib\/|node_modules\/)/, '$1'))
  return recorded(request, real)
}
const realFetch = globalThis.fetch
;(globalThis as any).fetch = async (input: any) => {
  netCalls.push(`fetch ${String(input?.url ?? input)}`)
  throw new Error('network is closed in this suite')
}
const origConnect = net.Socket.prototype.connect
;(net.Socket.prototype as any).connect = function (...args: any[]) {
  netCalls.push(`connect ${JSON.stringify(args.filter((a) => typeof a !== 'function'))}`)
  throw new Error('network is closed in this suite')
}

// ── The code under test (loaded after the traps) ────────────────────────────
const { FakeAdmin } = require('../../__qa__/_fake-admin') as typeof import('../../__qa__/_fake-admin')
const { handleScanResearchGet, MAX_TRACKED } = require('../scan-route') as typeof import('../scan-route')
const { SCAN_RESEARCH_ERROR_CODES } = require('../scan-research') as typeof import('../scan-research')
const { buildSiteVocabulary } = require('../../content/recommendations/engine') as typeof import('../../content/recommendations/engine')
const { MAX_MANUAL_ROWS } = require('../project-research') as typeof import('../project-research')
const { researchKeywordIssue, MIN_SITE_VOCAB_TOKENS } = require('../../content/recommendations/keyword-research') as typeof import('../../content/recommendations/keyword-research')
const { tokens } = require('../../content/recommendations/dedupe') as typeof import('../../content/recommendations/dedupe')

type Deps = import('../scan-route').ScanRouteDeps

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const show = (v: unknown) => JSON.stringify(v)

// ── Fixtures ────────────────────────────────────────────────────────────────
const OWNER = '0a000000-0000-4000-8000-000000000001'
const STRANGER = '0a000000-0000-4000-8000-000000000002'
const ADMIN = '0a000000-0000-4000-8000-000000000003'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const OTHER_PROJECT = 'b1111111-2222-3333-4444-555555555555'
const OWNERS_SECOND = 'c1111111-2222-3333-4444-555555555555'
const ADMIN_PROJECT = 'd1111111-2222-3333-4444-555555555555'
const SECRET = 'SECRET relation "keyword_research_cache" does not exist'

const kw = (keyword: string, avgMonthlySearches: number | null, competition: string | null, low: number | null = null, high: number | null = null) =>
  ({ keyword, avgMonthlySearches, competition, competitionIndex: null, lowTopOfPageBid: low, highTopOfPageBid: high, currency: 'ILS' })
const cacheRow = (user: string, project: string, seedType: string, seedValue: string, fetchedAt: string, results: unknown[]) =>
  ({ id: `${project}-${seedValue}`, user_id: user, project_id: project, seed_type: seedType, seed_value: seedValue, country: 'IL', language: 'he', results_json: results, fetched_at: fetchedAt })

function tables(): Record<string, Record<string, unknown>[]> {
  return {
    projects: [
      { id: PROJECT, user_id: OWNER, business_name: 'Pegasus Runners' },
      { id: OTHER_PROJECT, user_id: STRANGER, business_name: 'Other Shop' },
      { id: OWNERS_SECOND, user_id: OWNER, business_name: 'Second Shop' },
      { id: ADMIN_PROJECT, user_id: ADMIN, business_name: 'Admin Shop' },
    ],
    keyword_research_cache: [
      cacheRow(OWNER, PROJECT, 'keyword', 'seed:keywords:נעלי ריצה|נעלי שטח', '2026-09-20T08:01:00Z', [
        kw('נעלי ריצה', 12100, 'HIGH', 2, 7), kw('נעלי ריצה לנשים', 2900, 'MEDIUM', 1.2, 4.8), kw('run shop', 1500, 'LOW', 1, 2), kw('נעליים', 40000, 'HIGH', 1, 3), kw('pegasus runners', 880, 'LOW', 1, 2),
      ]),
      cacheRow(OWNER, PROJECT, 'url', 'seed:site:runshop.co.il', '2026-09-20T08:02:00Z', [kw('איך לבחור נעלי ריצה', 320, 'LOW', 0.6, 2.2), kw('נעלי ריצה לנשים', 2800, 'MEDIUM')]),
      cacheRow(OWNER, PROJECT, 'url', 'seed:competitor:rival.co.il', '2026-09-20T08:03:00Z', [kw('נעלי שטח לנשים', 700, 'LOW', 1, 3), kw('מכונת כביסה', 5000, 'LOW', 1, 2)]),
      // The project's own research, not the scan's (the owner's, or the engine's demand research): read as `manual`.
      cacheRow(OWNER, PROJECT, 'url', 'https://runshop.co.il/', '2026-09-21T08:00:00Z', [kw('נעלי ריצה במבצע', 999, 'LOW')]),
      // …but never another account's, on this project id, or the owner's other project's.
      cacheRow(STRANGER, PROJECT, 'keyword', 'LEAK stranger manual', '2026-09-23T08:00:00Z', [kw('LEAK stranger manual', 999, 'LOW')]),
      cacheRow(OWNER, OWNERS_SECOND, 'keyword', 'LEAK second manual', '2026-09-23T08:00:00Z', [kw('LEAK second manual', 999, 'LOW')]),
      // Another account's rows, on this project id and on its own project.
      cacheRow(STRANGER, PROJECT, 'url', 'seed:site:stranger.co.il', '2026-09-22T08:00:00Z', [kw('LEAK stranger row', 999, 'LOW')]),
      cacheRow(STRANGER, OTHER_PROJECT, 'url', 'seed:site:other.co.il', '2026-09-22T08:00:00Z', [kw('LEAK other project', 999, 'LOW')]),
      cacheRow(OWNER, OWNERS_SECOND, 'url', 'seed:site:second.co.il', '2026-09-22T08:00:00Z', [kw('LEAK second project', 999, 'LOW')]),
      cacheRow(ADMIN, ADMIN_PROJECT, 'url', 'seed:site:admin.co.il', '2026-09-20T08:00:00Z', [kw('נעלי ריצה לגברים', 1300, 'LOW', 1, 2)]),
    ],
    tracking_targets: [
      { id: 't1', user_id: OWNER, project_id: PROJECT, keyword: 'נעלי ריצה', avg_monthly_searches: 12100, competition: 'HIGH', competition_index: 91, low_top_of_page_bid: 2, high_top_of_page_bid: 7, metrics_currency: 'ILS' },
      { id: 't2', user_id: OWNER, project_id: PROJECT, keyword: 'מדריך מידות', avg_monthly_searches: null, competition: null, competition_index: null, low_top_of_page_bid: null, high_top_of_page_bid: null, metrics_currency: null },
      { id: 't3', user_id: STRANGER, project_id: PROJECT, keyword: 'LEAK stranger tracked' },
      { id: 't4', user_id: OWNER, project_id: OWNERS_SECOND, keyword: 'LEAK second tracked' },
    ],
    project_seed_runs: [
      {
        id: 'run-1', project_id: PROJECT, user_id: OWNER, trigger: 'project_created', stage: 'b', status: 'done', error_code: null, created_at: '2026-09-20T08:00:00Z',
        summary: { version: 1, domain: 'runshop.co.il', url: 'https://runshop.co.il/', seedKeywords: ['נעלי ריצה', 'נעלי שטח'], business: { companyName: 'Pegasus Runners Ltd' } },
      },
    ],
    profiles: [{ id: ADMIN, role: 'admin' }, { id: OWNER, role: 'user' }],
  }
}

type Query = { client: 'session' | 'admin'; seq: number; table: string; calls: [string, unknown[]][] }
let seq = 0
function recordingClient(db: InstanceType<typeof FakeAdmin>, client: Query['client'], log: Query[], auth?: unknown): any {
  return {
    auth,
    from(table: string) {
      const entry: Query = { client, seq: ++seq, table, calls: [] }
      log.push(entry)
      const q: any = db.from(table)
      const proxy: any = new Proxy(q, {
        get(target, prop) {
          const v = target[prop]
          if (typeof v !== 'function') return v
          return (...args: unknown[]) => {
            if (prop !== 'then') entry.calls.push([String(prop), args])
            const out = v.apply(target, args)
            return out === target ? proxy : out
          }
        },
      })
      return proxy
    },
  }
}

type Run = {
  status: number; body: any; cacheControl: string | null; log: Query[]; adminCreatedAt: number[]
  vocabularyCalls: { projectId: string; extras: string[]; userId: string }[]; errors: string[]
}

async function call(opts: {
  user?: string | null; projectId?: string; env?: Record<string, string | undefined>; hooks?: Record<string, any>
  sessionThrows?: boolean; vocabulary?: Deps['vocabulary']; sessionFromThrows?: boolean
}): Promise<Run> {
  const data = tables()
  const hooks = opts.hooks ?? {}
  const sessionDb = new FakeAdmin(data, hooks)
  const adminDb = new FakeAdmin(data, {})
  const log: Query[] = []
  const adminCreatedAt: number[] = []
  const vocabularyCalls: Run['vocabularyCalls'] = []
  const errors: string[] = []
  const origError = console.error
  console.error = (...args: unknown[]) => { errors.push(args.map((a) => (a instanceof Error ? `${a.name}: ${a.message}` : typeof a === 'string' ? a : JSON.stringify(a))).join(' ')) }
  const session = recordingClient(sessionDb, 'session', log)
  if (opts.sessionFromThrows) session.from = () => { throw new Error(SECRET) }
  const deps: Deps = {
    session: async () => {
      if (opts.sessionThrows) throw new Error(SECRET)
      return { userId: opts.user === undefined ? OWNER : opts.user, db: session }
    },
    admin: () => { adminCreatedAt.push(++seq); return recordingClient(adminDb, 'admin', log) },
    vocabulary: async (admin, projectId, extras, userId) => {
      vocabularyCalls.push({ projectId, extras, userId })
      return (opts.vocabulary ?? buildSiteVocabulary)(admin, projectId, extras, userId)
    },
  }
  // The scan's flag, as the process would have it: the route must not care. On unless
  // a scenario says otherwise, so a gate put back decides A5 alone (its mutation control).
  const savedFlag = process.env.ENABLE_SEED_SCAN
  const flag = opts.env && 'ENABLE_SEED_SCAN' in opts.env ? opts.env.ENABLE_SEED_SCAN : 'true'
  if (flag === undefined) delete process.env.ENABLE_SEED_SCAN
  else process.env.ENABLE_SEED_SCAN = flag
  try {
    const res = await handleScanResearchGet(new Request(`http://localhost/api/keyword-research/scan?projectId=${encodeURIComponent(opts.projectId ?? PROJECT)}`), deps)
    return { status: res.status, body: await res.json(), cacheControl: res.headers.get('cache-control'), log, adminCreatedAt, vocabularyCalls, errors }
  } finally {
    console.error = origError
    if (savedFlag === undefined) delete process.env.ENABLE_SEED_SCAN
    else process.env.ENABLE_SEED_SCAN = savedFlag
  }
}

const eqs = (q: Query | undefined) => Object.fromEntries((q?.calls ?? []).filter(([m]) => m === 'eq').map(([, a]) => [String(a[0]), a[1]]))
const WRITES = new Set(['insert', 'update', 'upsert', 'delete', 'rpc'])

async function main() {
  console.log('GET /api/keyword-research/scan — the scan\'s research, read-only, the owner\'s only')
  const refusals: { name: string; status: number; body: any; cacheControl: string | null }[] = []
  const all: Run[] = []
  const run = async (name: string, opts: Parameters<typeof call>[0]) => {
    const r = await call(opts)
    all.push(r)
    if (r.status !== 200) refusals.push({ name, status: r.status, body: r.body, cacheControl: r.cacheControl })
    return r
  }

  console.log('\nA) who may read')
  const anon = await run('anonymous', { user: null })
  check('A1: not signed in → 401 unauthorized, before any read', anon.status === 401 && anon.body.code === 'unauthorized' && anon.log.length === 0 && anon.adminCreatedAt.length === 0, show(anon.body))
  const down = await run('session down', { sessionThrows: true })
  check('A2: the session cannot be read → 503 unavailable', down.status === 503 && down.body.code === 'unavailable' && down.log.length === 0, show(down.body))
  const malformed = await run('malformed id', { projectId: 'not-a-uuid' })
  const injected = await run('injected id', { projectId: `${PROJECT}' or 1=1 --` })
  check('A3: a malformed project id → 404 not_found, before any read',
    [malformed, injected].every((r) => r.status === 404 && r.body.code === 'not_found' && r.log.length === 0), show([malformed.body, injected.body]))
  const stranger = await run('stranger', { user: STRANGER })
  const missing = await run('missing', { projectId: 'e1111111-2222-3333-4444-555555555555' })
  check('A4: another account\'s project answers exactly like one that does not exist (404), and nothing else is read; the service role is never created',
    stranger.status === 404 && show(stranger.body) === show(missing.body) && show(stranger.body) === show({ ok: false, code: 'not_found' })
    && stranger.log.length === 1 && stranger.log[0].table === 'projects' && stranger.adminCreatedAt.length === 0 && missing.adminCreatedAt.length === 0,
    show({ body: stranger.body, tables: stranger.log.map((q) => q.table) }))
  const flagOff = await run('flag off', { env: { ENABLE_SEED_SCAN: undefined } })
  const flagOffAdmin = await run('flag off, admin', { env: { ENABLE_SEED_SCAN: undefined }, user: ADMIN, projectId: ADMIN_PROJECT })
  const flagOn = await call({ env: { ENABLE_SEED_SCAN: 'true' } })
  all.push(flagOn)
  const routeSrc = readFileSync(join(__dirname, '..', 'scan-route.ts'), 'utf8').replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
  check('A5: every owner reads their project\'s research whether the scan is switched on or not, with the same answer; the role is never read and the route names neither the flag nor the role (an unscanned project is not a second-class one)',
    flagOff.status === 200 && flagOn.status === 200 && show(flagOff.body) === show(flagOn.body)
    && flagOffAdmin.status === 200 && flagOffAdmin.body.keywords?.length === 1
    && !all.some((r) => r.log.some((q) => q.table === 'profiles'))
    && !/ENABLE_SEED_SCAN|isAdmin|deps\.env/.test(routeSrc),
    show({ off: flagOff.status, admin: flagOffAdmin.status, on: flagOn.status, same: show(flagOff.body) === show(flagOn.body), profiles: all.filter((r) => r.log.some((q) => q.table === 'profiles')).length }))

  console.log('\nB) what it reads')
  {
    const s = (t: string) => flagOn.log.find((q) => q.client === 'session' && q.table === t)
    const researchReads = flagOn.log.filter((q) => q.client === 'session' && q.table === 'keyword_research_cache')
    const project = eqs(s('projects')), research = eqs(researchReads[0]), own = eqs(researchReads[1]), tracked = eqs(s('tracking_targets')), runRow = eqs(s('project_seed_runs'))
    const like = researchReads[0]?.calls.find(([m]) => m === 'like')?.[1]
    const notLike = researchReads[1]?.calls.find(([m]) => m === 'not')?.[1]
    const ownLimit = researchReads[1]?.calls.find(([m]) => m === 'limit')?.[1]?.[0]
    const limit = s('tracking_targets')?.calls.find(([m]) => m === 'limit')?.[1]?.[0]
    const sessionTables = [...new Set(flagOn.log.filter((q) => q.client === 'session').map((q) => q.table))].sort()
    const adminQueries = flagOn.log.filter((q) => q.client === 'admin')
    const projectSeq = s('projects')?.seq ?? Infinity
    const adminOk = adminQueries.every((q) => {
      const e = eqs(q)
      if (q.table === 'site_crawl_index') return e.user_id === OWNER && e.project_id === PROJECT
      if (q.table === 'wordpress_content_index' || q.table === 'wordpress_connections' || q.table === 'shopify_entities') return e.project_id === PROJECT
      return false
    })
    const writes = all.flatMap((r) => r.log.flatMap((q) => q.calls.filter(([m]) => WRITES.has(m)).map(([m]) => `${q.client}:${q.table}.${m}`)))
    check('A6: every read names the owner: the project (id and owner), the scan\'s research (owner, project, `seed:` rows), the project\'s own research (owner, project, every other row, 20 at most), the tracked keywords and the run; the service role reads the proven project\'s site index only, after ownership; nothing is written',
      project.id === PROJECT && project.user_id === OWNER
      && researchReads.length === 2
      && research.project_id === PROJECT && research.user_id === OWNER && show(like) === show(['seed_value', 'seed:%'])
      && own.project_id === PROJECT && own.user_id === OWNER && show(notLike) === show(['seed_value', 'like', 'seed:%']) && ownLimit === MAX_MANUAL_ROWS
      && tracked.project_id === PROJECT && tracked.user_id === OWNER && limit === MAX_TRACKED
      && runRow.project_id === PROJECT && runRow.user_id === OWNER
      && show(sessionTables) === show(['keyword_research_cache', 'project_seed_runs', 'projects', 'tracking_targets'])
      && adminQueries.length > 0 && adminOk && adminQueries.every((q) => q.seq > projectSeq) && flagOn.adminCreatedAt.every((t) => t > projectSeq)
      && writes.length === 0,
      show({ project, research, like, own, notLike, ownLimit, tracked, limit, runRow, sessionTables, admin: adminQueries.map((q) => [q.table, eqs(q)]), writes }))
    const text = show(flagOn.body)
    const ownRow = flagOn.body.keywords.find((k: any) => k.keyword === 'נעלי ריצה במבצע')
    check('A7: the project\'s own research reaches the answer, marked `manual`; nothing of another account or another project does',
      flagOn.status === 200 && !text.includes('LEAK') && flagOn.body.tracked.length === 2 && show(ownRow?.origins) === show(['manual']),
      show({ leaks: text.match(/LEAK[^"]*/g), own: ownRow }))
  }

  console.log('\nC) relevance, with the engine\'s own filter')
  {
    const brandTokens = tokens('Pegasus Runners')
    const expect = (vocab: Set<string> | null) => Object.fromEntries(flagOn.body.keywords.map((k: any) => [k.keyword, researchKeywordIssue(k.keyword, { brandTokens, vocab }) === null]))
    const got = (r: Run) => Object.fromEntries(r.body.keywords.map((k: any) => [k.keyword, k.relevant]))
    // The real reader finds no site index here: the vocabulary is the name and the seeds, too small to use (b2's rule).
    const small = got(flagOn)
    const shoeWords = ['נעלי', 'נעליים', 'ריצה', 'לנשים', 'נשים', 'שטח', 'לשטח', 'איך', 'לבחור', 'בחירת', 'מידות', 'מדריך', 'גברים', 'לגברים', 'ילדים', 'לילדים',
      'ספורט', 'הליכה', 'טיולים', 'אימון', 'מרתון', 'סוליה', 'נוחות', 'ריפוד', 'רשת', 'קלות', 'עמידות', 'מבצע']
    const big = await call({ vocabulary: async () => new Set(shoeWords) })
    const tiny = await call({ vocabulary: async () => new Set(shoeWords.slice(0, MIN_SITE_VOCAB_TOKENS - 1)) })
    all.push(big, tiny)
    check('A8: each keyword\'s "relevant" is researchKeywordIssue(...) === null with the business name\'s tokens (the brand itself is never suggested), and the site vocabulary only from 25 tokens (b2\'s rule)',
      show(small) === show(expect(null)) && small['pegasus runners'] === false && small['run shop'] === false && small['נעליים'] === false && small['נעלי ריצה לנשים'] === true
      && researchKeywordIssue('pegasus runners', { brandTokens: new Set(), vocab: null }) === null
      && show(got(big)) === show(expect(new Set(shoeWords))) && got(big)['מכונת כביסה'] === false && small['מכונת כביסה'] === true
      && show(got(tiny)) === show(expect(null))
      && flagOn.vocabularyCalls.length === 1 && show(flagOn.vocabularyCalls[0]) === show({ projectId: PROJECT, extras: ['Pegasus Runners', 'נעלי ריצה', 'נעלי שטח'], userId: OWNER }),
      show({ small, big: got(big), vocab: flagOn.vocabularyCalls }))
  }

  console.log('\nD) the answer')
  {
    const b = flagOn.body
    const keys = Object.keys(b)
    const shoes = b.keywords.find((k: any) => k.keyword === 'נעלי ריצה לנשים')
    const t2 = b.tracked.find((t: any) => t.id === 't2')
    const okHeaders = all.filter((r) => r.status === 200).every((r) => r.cacheControl === 'no-store')
    check('A9: one merged list (most searched first, every seed that found it), the market, the tracked keywords with their stored metrics; never cached',
      show(keys) === show(['ok', 'market', 'fetchedAt', 'keywords', 'truncated', 'tracked', 'sources']) && b.ok === true
      && show(b.market) === show({ country: 'IL', language: 'he' }) && b.fetchedAt === '2026-09-21T08:00:00Z' && b.truncated === false
      && show(b.sources) === show({ scan: true, manualAt: '2026-09-21T08:00:00Z' })
      && show(b.keywords.map((k: any) => k.keyword)) === show(['נעליים', 'נעלי ריצה', 'מכונת כביסה', 'נעלי ריצה לנשים', 'run shop', 'נעלי ריצה במבצע', 'pegasus runners', 'נעלי שטח לנשים', 'איך לבחור נעלי ריצה'])
      && show(shoes?.origins) === show(['seed_keywords', 'site']) && shoes?.avgMonthlySearches === 2800
      && show(b.keywords.find((k: any) => k.keyword === 'נעלי שטח לנשים')?.competitors) === show(['rival.co.il'])
      && b.tracked[0].metrics?.avgMonthlySearches === 12100 && t2?.metrics === null && okHeaders,
      show({ keys, keywords: b.keywords.map((k: any) => [k.keyword, k.origins]), tracked: b.tracked }))
  }

  console.log('\nE) failures')
  {
    const selectError = () => ({ code: '42P01', message: SECRET })
    const projectDown = await run('projects read fails', { hooks: { projects: { select: selectError } } })
    const researchDown = await run('research read fails', { hooks: { keyword_research_cache: { select: selectError } } })
    const trackedDown = await run('tracked read fails', { hooks: { tracking_targets: { select: selectError } } })
    const unexpected = await run('unexpected throw', { sessionFromThrows: true })
    const runDown = await call({ hooks: { project_seed_runs: { select: selectError } } })
    const vocabDown = await call({ vocabulary: async () => { throw new Error(SECRET) } })
    all.push(runDown, vocabDown)
    const bodies = all.map((r) => show(r.body)).join('\n')
    const logs = all.flatMap((r) => r.errors)
    check('A10: a failed read of the project, the research or the tracked keywords is 500 internal; an unreadable run or vocabulary still answers; no database text in any body or log line',
      [projectDown, researchDown, trackedDown, unexpected].every((r) => r.status === 500 && show(r.body) === show({ ok: false, code: 'internal' }))
      && runDown.status === 200 && show(runDown.vocabularyCalls[0]?.extras) === show(['Pegasus Runners', 'נעלי ריצה', 'נעלי שטח'])
      && vocabDown.status === 200 && vocabDown.body.keywords.every((k: any) => typeof k.relevant === 'boolean')
      && !bodies.includes('SECRET') && !bodies.includes('42P01') && !logs.some((l) => l.includes('SECRET')) && unexpected.errors.length === 1,
      show({ statuses: [projectDown.status, researchDown.status, trackedDown.status, unexpected.status, runDown.status, vocabDown.status], logs }))
  }

  console.log('\nF) no provider, no network')
  {
    const loaded = [...wrappedModules]
    const quiet = providerCalls.length === 0 && netCalls.length === 0
    const before = { providerCalls: [...providerCalls], netCalls: [...netCalls] }
    // Controls: the traps do fire.
    const ideas = require('../../google-ads/keyword-ideas')
    await Promise.resolve().then(() => ideas.generateKeywordIdeas({ researchType: 'keyword', keywords: ['x'], country: 'IL', language: 'he' })).catch(() => null)
    await Promise.resolve().then(() => fetch('https://google.serper.dev/search')).catch(() => null)
    const socket = new net.Socket()
    try { socket.connect(443, 'googleads.googleapis.com') } catch { /* trapped */ }
    const trapsFire = providerCalls.some((c) => c.includes('generateKeywordIdeas')) && netCalls.some((c) => c.includes('serper')) && netCalls.some((c) => c.includes('googleads'))
    check('A11: across every scenario, no Google Ads, Serper or model function ran and no connection was opened (the provider modules were loaded, wrapped; the traps fire when called)',
      quiet && loaded.some((m) => m.includes('google-ads/keyword-ideas')) && trapsFire,
      show({ before, loaded: loaded.slice(0, 8), after: { providerCalls, netCalls } }))
  }

  console.log('\nG) the contract\'s shape')
  {
    const bad = refusals.filter((r) => show(Object.keys(r.body)) !== show(['ok', 'code']) || r.body.ok !== false
      || !(SCAN_RESEARCH_ERROR_CODES as readonly string[]).includes(r.body.code) || r.cacheControl !== 'no-store')
    check('A12: every refusal is exactly { ok: false, code } with one of our codes, never cached',
      refusals.length >= 10 && bad.length === 0, show(bad.map((r) => [r.name, r.status, r.body, r.cacheControl])))
    const route = readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'keyword-research', 'scan', 'route.ts'), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/.*$/gm, '$1')
    const exported = [...route.matchAll(/export\s+(?:async\s+)?(?:function|const)\s+(\w+)/g)].map((m) => m[1]).sort()
    check('A13: the route wires the real session (createClient + auth.getUser), the service role and the engine\'s vocabulary, and no flag or role; it exports GET only',
      /createClient\(\)/.test(route) && /\.auth\.getUser\(\)/.test(route) && /admin:\s*\(\)\s*=>\s*createAdminClient\(\)/.test(route)
      && /buildSiteVocabulary\(admin,\s*projectId,\s*extras,\s*userId\)/.test(route)
      && !/isAdminUser|process\.env/.test(route) && /handleScanResearchGet\(request,/.test(route)
      && show(exported) === show(['GET', 'dynamic', 'runtime']),
      show(exported))
  }

  globalThis.fetch = realFetch
  net.Socket.prototype.connect = origConnect
  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((err) => { console.error(err); process.exit(1) })

export {}
