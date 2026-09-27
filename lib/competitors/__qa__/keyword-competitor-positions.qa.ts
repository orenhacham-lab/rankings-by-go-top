/**
 * "YOU VS. YOUR COMPETITORS" — the competitor positions a rank scan records,
 * proved through the real code that writes them and the pure comparison the
 * screens read them through.
 *
 * What the scanner itself does (extraction from the organic list, zero extra
 * provider calls, the project's own result unchanged field by field) is proved
 * against recorded Serper pages in lib/scanner/__qa__/competitor-positions.qa.ts.
 * This suite proves everything around it:
 *
 *   A) the rows one keyword check becomes;
 *   B) the save — scoped to the project's owner, and best effort by
 *      construction: a failing, throwing or hanging database resolves to an
 *      outcome, logs a stable code (never the provider's text) and never
 *      rejects; in-flight saves are handed to after() and bounded there;
 *   C) the competitor list a scan uses: this project's, this owner's, active;
 *   D) the MANUAL scan route, run for real (auth, ownership, entitlement,
 *      reservation, persistence, response) over the REAL scanner and recorded
 *      Serper pages: the same provider requests, the same scan result and the
 *      same response, the competitor rows under the SAME checked_at — and a
 *      failing, throwing, hanging or missing competitor side leaves the scan
 *      exactly as it was, and never makes it wait;
 *   E) the SCHEDULED scan, the same way;
 *   F) the comparison the keywords tab and the dashboard card show;
 *   G) the copy, in Hebrew and in English;
 *   H) source guards for what behaviour alone cannot show, each with its own
 *      mutation control.
 *
 * Nothing here contacts a provider or a database, and no quota is consumed.
 *
 * Run: npx tsx lib/competitors/__qa__/keyword-competitor-positions.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.SERPER_API_KEY = 'qa-serper'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'qa'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '1'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/1'
process.env.SHOPIFY_PARTNER_API_VERSION = '2025-01'

/* Everything the code under test logs is kept, in order, for the checks to
 * read; only this suite's own lines reach the report. */
const REAL = { log: console.log, warn: console.warn, error: console.error, info: console.info }
const say = (...a: unknown[]) => REAL.log(...a)
const LOGS: string[] = []
const show = (v: unknown) => { if (typeof v === 'string') return v; try { return JSON.stringify(v) } catch { return String(v) } }
const keep = (...a: unknown[]) => { LOGS.push(a.map(show).join(' ')) }
console.log = keep; console.warn = keep; console.error = keep; console.info = keep

/* A rejection nobody handles would crash a Node server; here it is recorded
 * so a check can say there was none. */
const UNHANDLED: unknown[] = []
process.on('unhandledRejection', (reason) => { UNHANDLED.push(reason) })

const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null
let REAL_SCANNER: any = null, REAL_NEXT_SERVER: any = null
/** What the scan code handed the scanner, and what the scanner answered. */
let SCANS: Array<{ engine: string; input: any; output: any }> = []
/** after() as the platform provides it inside a request: the callback runs once the response is out. */
let AFTER_CALLBACKS: Array<() => unknown> = []
let AFTER_MODE: 'request' | 'real' = 'request'
const CANNED_MAPS = { found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
const scannerStandIn = {
  runScan: async (engine: string, input: any) => {
    const snapshot = JSON.parse(JSON.stringify(input))
    // Maps is not what this suite proves, so it answers without a network.
    const output = engine === 'google_maps' ? { ...CANNED_MAPS } : await REAL_SCANNER.runScan(engine, input)
    SCANS.push({ engine, input: snapshot, output })
    return output
  },
}
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  // The REAL scanner runs, over recorded Serper pages; the stand-in only
  // records what it was given and what it answered.
  if (r.endsWith('lib/scanner/index.ts')) {
    REAL_SCANNER ??= origLoad.call(this, request, parent, isMain)
    return scannerStandIn
  }
  if (request === 'next/server') {
    REAL_NEXT_SERVER ??= origLoad.call(this, request, parent, isMain)
    return new Proxy(REAL_NEXT_SERVER, {
      get(target, prop) {
        if (prop === 'after') {
          return AFTER_MODE === 'request' ? (cb: () => unknown) => { AFTER_CALLBACKS.push(cb) } : target.after
        }
        return target[prop]
      },
    })
  }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
  return origLoad.call(this, request, parent, isMain)
}

const { readFileSync } = require('fs')
const { join } = require('path')
const { FakeAdmin } = require('../../__qa__/_fake-admin')
const { PAGE_1, PAGE_2, PROJECT_DOMAIN } = require('../../scanner/__qa__/serper-fixtures')
const { MAX_COMPETITOR_DOMAINS } = require('../../scanner/competitor-positions')
const {
  competitorPositionRows, recordCompetitorPositions, loadCompetitorDomainsForScan,
  finishCompetitorSavesAfterResponse, COMPETITOR_LOAD_TIMEOUT_MS, COMPETITOR_SAVE_TIMEOUT_MS,
} = require('../scan-positions')
const {
  buildCompetitorComparison, trackedCompetitorsFrom, sameInstant, relationToYou, isAheadOfYou,
} = require('../comparison')

const ROOT = join(__dirname, '..', '..', '..')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; say(`  ✓ ${name}`) } else { fail++; say(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const canon = (v: any): any => Array.isArray(v) ? v.map(canon)
  : v && typeof v === 'object' ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, canon(v[k])])) : v
const same = (a: unknown, b: unknown) => JSON.stringify(canon(a)) === JSON.stringify(canon(b))
const without = (o: any, keys: string[]) => Object.fromEntries(Object.entries(o ?? {}).filter(([k]) => !keys.includes(k)))
const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms))
/** `work`'s value, or `fallback` once `ms` has passed: a missing bound shows up as a failed check, not as a suite that never ends. */
function watchdog<T>(work: Promise<T>, ms: number, fallback: T): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  return Promise.race([work, new Promise<T>((resolve) => { timer = setTimeout(() => resolve(fallback), ms) })])
    .finally(() => clearTimeout(timer))
}
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8') as string

/** Provider text a database or network error could carry. It must never reach a log. */
const PROVIDER_TEXT = 'SECRET-PROVIDER-DETAIL'
const leaked = (lines: string[]) => lines.some((l) => l.includes(PROVIDER_TEXT))
const events = (lines: string[]) => lines.filter((l) => l.startsWith('[competitor-positions]'))

/** A query that never answers: every method chains, and awaiting it waits forever. */
const HANG: any = new Proxy({}, { get: (_t, prop) => (prop === 'then' ? () => {} : () => HANG) })
/** The fake admin with one table's `from()` replaced. */
function adminWith(fake: any, table: string, replace: () => any) {
  return new Proxy(fake, {
    get(target, prop) {
      if (prop === 'from') return (name: string) => (name === table ? replace() : target.from(name))
      const v = target[prop]
      return typeof v === 'function' ? v.bind(target) : v
    },
  })
}

const OWNER = '0a0a0a0a-1111-4111-8111-000000000001'
const OTHER_USER = '0a0a0a0a-1111-4111-8111-000000000002'
const STAFF = '0a0a0a0a-1111-4111-8111-000000000003'
const PROJECT = '0b0b0b0b-2222-4222-8222-000000000001'
const OTHER_PROJECT = '0b0b0b0b-2222-4222-8222-000000000002'
const KEYWORD = '0c0c0c0c-3333-4333-8333-000000000001'
const MAPS_KEYWORD = '0c0c0c0c-3333-4333-8333-000000000002'
const AT = '2026-09-27T07:00:00.000Z'

/** The project's competitors as the AI visibility tab stores them — and rows this scan must NOT use. */
function competitorRows() {
  return [
    { id: 'c1', user_id: OWNER, project_id: PROJECT, name: 'Rival Shoes', domain: ' https://WWW.Rival-Shoes.com/ ', is_active: true },
    { id: 'c2', user_id: OWNER, project_id: PROJECT, name: 'Competitor B', domain: 'competitor-b.co.il', is_active: true },
    { id: 'c3', user_id: OWNER, project_id: PROJECT, name: 'Competitor C', domain: 'competitor-c.com', is_active: true },
    { id: 'c4', user_id: OWNER, project_id: PROJECT, name: 'Absent', domain: 'absent-competitor.org', is_active: true },
    // In the recorded pages at 13, 6 and 8 respectively — so a leak would show.
    { id: 'c5', user_id: OWNER, project_id: PROJECT, name: 'Paused', domain: 'competitor-d.net', is_active: false },
    { id: 'c6', user_id: OWNER, project_id: OTHER_PROJECT, name: 'Another project', domain: 'adidas.co.il', is_active: true },
    { id: 'c7', user_id: OTHER_USER, project_id: PROJECT, name: 'Another owner', domain: 'facebook.com', is_active: true },
  ]
}
/** What the scan hands the scanner: the configured strings of this project's owner's active competitors. */
const CONFIGURED_FOR_SCAN = ['https://WWW.Rival-Shoes.com/', 'competitor-b.co.il', 'competitor-c.com', 'absent-competitor.org']
const NOT_THIS_SCAN = ['competitor-d.net', 'adidas.co.il', 'facebook.com']

/** A Shopify-governed store on an active trial: the same shape the reviewer workflow suite uses. */
function tables(opts: { competitors?: boolean; staff?: boolean } = {}): Record<string, any[]> {
  const now = Date.now()
  return {
    profiles: [{ id: OWNER, role: 'user' }, ...(opts.staff ? [{ id: STAFF, role: 'admin' }] : [])],
    billing_governance: [{ user_id: OWNER, signup_origin: 'shopify_app_store',
      billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }],
    shopify_connections: [{
      id: 'conn-1', user_id: OWNER, connection_status: 'connected', archived_at: null,
      shop_domain: 'shoes-il.myshopify.com', shop_gid: 'gid://shopify/Shop/1',
      shopify_plan_handle: 'advanced', shopify_subscription_status: 'active',
      shopify_trial_ends_at: new Date(now + 4 * 86_400_000).toISOString(),
      shopify_current_period_start: null, shopify_current_period_end: null,
      shopify_billing_verified_at: new Date(now - 60_000).toISOString(),
      updated_at: new Date(now).toISOString(),
    }],
    shopify_billing_migrations: [], subscriptions: [],
    projects: [
      { id: PROJECT, user_id: OWNER, target_domain: PROJECT_DOMAIN, business_name: 'Shoes IL',
        country: 'IL', city: null, language: 'he', device_type: 'desktop' },
      { id: OTHER_PROJECT, user_id: OWNER, target_domain: 'other.example', business_name: 'Other',
        country: 'IL', city: null, language: 'he', device_type: 'desktop' },
    ],
    tracking_targets: [
      { id: KEYWORD, project_id: PROJECT, user_id: OWNER, keyword: 'נעלי ריצה תל אביב',
        engine_type: 'google_search', is_active: true, location_mode: 'project', target_domain: null },
      { id: MAPS_KEYWORD, project_id: PROJECT, user_id: OWNER, keyword: 'חנות נעלי ריצה',
        engine_type: 'google_maps', is_active: true, location_mode: 'project', target_domain: null },
    ],
    scans: [], scan_results: [], usage_reservations: [],
    ai_visibility_competitors: opts.competitors === false ? [] : competitorRows(),
    keyword_competitor_positions: [],
  }
}

/** Serper, answered from the recorded pages; every request is kept, and any other host is refused and recorded. */
function serperNet() {
  const log: string[] = []
  const other: string[] = []
  const realFetch = globalThis.fetch
  globalThis.fetch = (async (input: any, init?: any) => {
    const url = String(input instanceof Request ? input.url : input)
    if (!url.startsWith('https://google.serper.dev/')) { other.push(url); throw new Error('network is disabled in QA') }
    const raw = String(init?.body ?? '')
    log.push(`${url} ${raw}`)
    const page = ({ 1: PAGE_1, 2: PAGE_2 } as Record<number, unknown>)[Number(JSON.parse(raw || '{}').page ?? 0)]
    if (!page) throw new Error('no recorded page')
    return new Response(JSON.stringify(page), { status: 200, headers: { 'content-type': 'application/json' } })
  }) as typeof fetch
  return { log, other, restore: () => { globalThis.fetch = realFetch } }
}

interface RouteRun {
  status: number; body: any; ms: number; t: Record<string, any[]>
  serper: string[]; other: string[]; scans: typeof SCANS; afters: Array<() => unknown>; logs: () => string[]
}
/** POST /api/scan, for real, as `requester`. */
async function scanRoute(t: Record<string, any[]>, opts: {
  body?: Record<string, unknown>; hooks?: Record<string, unknown>; admin?: (fake: any) => any; requester?: string
} = {}): Promise<RouteRun> {
  const { POST } = require('../../../app/api/scan/route.ts')
  const fake = new FakeAdmin(t, opts.hooks ?? {})
  ADMIN_CLIENT = opts.admin ? opts.admin(fake) : fake
  USER_CLIENT = new FakeAdmin(t)
  USER_CLIENT.auth = { getUser: async () => ({ data: { user: { id: opts.requester ?? OWNER } } }) }
  const net = serperNet()
  SCANS = []; AFTER_CALLBACKS = []
  const from = LOGS.length
  const t0 = Date.now()
  let status = 0, body: any = null
  try {
    const res = await POST(new Request('http://localhost/api/scan', {
      method: 'POST', body: JSON.stringify(opts.body ?? { projectId: PROJECT, targetId: KEYWORD }) }))
    status = res.status
    body = await res.json()
  } finally { net.restore() }
  const ms = Date.now() - t0
  return { status, body, ms, t, serper: net.log, other: net.other, scans: SCANS, afters: AFTER_CALLBACKS.slice(), logs: () => LOGS.slice(from) }
}
/** Runs the callbacks the route handed to after(), as the platform does once the response is sent. */
async function afterResponse(run: RouteRun): Promise<number> {
  const t0 = Date.now()
  await watchdog(Promise.all(run.afters.map((cb) => cb())), COMPETITOR_SAVE_TIMEOUT_MS + 3_000, [])
  return Date.now() - t0
}

const resultRows = (t: Record<string, any[]>, drop = ['id', 'scan_id', 'checked_at']) => t.scan_results.map((r) => without(r, drop))
const scanRows = (t: Record<string, any[]>) => t.scans.map((s) => without(s, ['id', 'started_at', 'completed_at', 'created_at']))
const ledger = (t: Record<string, any[]>) => t.usage_reservations.map((r) => [r.status, Number(r.reserved_amount), Number(r.consumed_amount)])
const responseOf = (b: any) => without(b, ['scanId', 'requestId'])
const positionsOf = (t: Record<string, any[]>) => t.keyword_competitor_positions
  .map((r) => ({ domain: r.competitor_domain, position: r.position, url: r.url }))

async function main() {
  say('QA: competitor positions — persistence, the scan paths, and the comparison\n')

  // ── A) the rows one check becomes ─────────────────────────────────────────
  say('A) the rows one keyword check becomes')
  {
    const rows = competitorPositionRows({
      ownerId: OWNER, projectId: PROJECT, trackingTargetId: KEYWORD, checkedAt: AT,
      positions: [
        { domain: 'rival-shoes.com', position: 3, url: 'https://m.rival-shoes.com/tlv/running' },
        { domain: 'rival-shoes.com', position: 11, url: 'https://rival-shoes.com/' },
        { domain: 'competitor-b.co.il', position: null, url: 'https://competitor-b.co.il/stale' },
        { domain: 'zero.com', position: 0, url: 'https://zero.com/' },
        { domain: 'past.com', position: 21, url: 'https://past.com/' },
        { domain: 'fraction.com', position: 3.5, url: 'https://fraction.com/' },
        { domain: 'long-url.com', position: 9, url: `https://long-url.com/${'x'.repeat(2100)}` },
        { domain: '   ', position: 1, url: 'https://blank.example/' },
        { domain: ' spaced.com ', position: 2, url: 'https://spaced.com/' },
      ],
    })
    const at = (d: string) => rows.find((r: any) => r.competitor_domain === d)
    check('A1: one row per competitor, first entry wins for a repeated domain',
      rows.length === 7 && at('rival-shoes.com')?.position === 3, JSON.stringify(rows.map((r: any) => r.competitor_domain)))
    check('A2: every row carries the owner, the project, the keyword and the check instant — and nothing else',
      rows.every((r: any) => same(Object.keys(r).sort(),
        ['checked_at', 'competitor_domain', 'position', 'project_id', 'tracking_target_id', 'url', 'user_id'])
        && r.user_id === OWNER && r.project_id === PROJECT && r.tracking_target_id === KEYWORD && r.checked_at === AT))
    check('A3: a ranked competitor keeps its position and URL',
      same(at('rival-shoes.com'), { user_id: OWNER, project_id: PROJECT, tracking_target_id: KEYWORD,
        competitor_domain: 'rival-shoes.com', position: 3, url: 'https://m.rival-shoes.com/tlv/running', checked_at: AT }))
    check('A4: not in the top 20 is a row with no position and no URL',
      at('competitor-b.co.il')?.position === null && at('competitor-b.co.il')?.url === null)
    check('A5: 0, 21 and 3.5 are not positions: stored as absent, URL dropped',
      ['zero.com', 'past.com', 'fraction.com'].every((d) => at(d)?.position === null && at(d)?.url === null))
    check('A6: an over-long URL is dropped, the position is kept',
      at('long-url.com')?.position === 9 && at('long-url.com')?.url === null)
    check('A7: a blank domain is skipped and a padded one trimmed',
      !rows.some((r: any) => !r.competitor_domain.trim()) && at('spaced.com')?.position === 2)
  }

  // ── B) the save ───────────────────────────────────────────────────────────
  say('\nB) the save: owner-scoped, best effort, never rejects')
  {
    const positions = [
      { domain: 'rival-shoes.com', position: 3, url: 'https://m.rival-shoes.com/tlv/running' },
      { domain: 'absent-competitor.org', position: null, url: null },
    ]
    const args = { ownerId: OWNER, projectId: PROJECT, trackingTargetId: KEYWORD, checkedAt: AT, positions }
    {
      const t: Record<string, any[]> = { keyword_competitor_positions: [] }
      const out = await recordCompetitorPositions(new FakeAdmin(t), args)
      check('B1: a healthy save writes exactly the rows of section A',
        out === 'saved' && same(t.keyword_competitor_positions.map((r) => without(r, ['id'])), competitorPositionRows(args)),
        `${out} ${JSON.stringify(t.keyword_competitor_positions)}`)
    }
    {
      const touched: string[] = []
      const spy = { from: (n: string) => { touched.push(n); return new FakeAdmin({}).from(n) } }
      const outs = [
        await recordCompetitorPositions(spy, { ...args, ownerId: null }),
        await recordCompetitorPositions(spy, { ...args, positions: [] }),
        await recordCompetitorPositions(spy, { ...args, positions: null }),
        await recordCompetitorPositions(spy, { ...args, positions: [{ domain: ' ', position: 1, url: null }] }),
      ]
      check('B2: no owner, no positions or nothing valid: skipped, and the database is not touched',
        outs.every((o) => o === 'skipped') && touched.length === 0, `${outs} touched=${touched}`)
    }
    {
      const from = LOGS.length
      const t: Record<string, any[]> = { keyword_competitor_positions: [] }
      const failing = new FakeAdmin(t, { keyword_competitor_positions: {
        insert: () => ({ code: '42501', message: `${PROVIDER_TEXT} permission denied for table keyword_competitor_positions` }) } })
      const out = await recordCompetitorPositions(failing, args)
      const lines = LOGS.slice(from)
      check('B3: a database error resolves to "failed" and writes nothing',
        out === 'failed' && t.keyword_competitor_positions.length === 0, out)
      check('B4: it logs one stable code with the SQLSTATE — never the provider\'s message',
        events(lines).length === 1 && /"event":"save_failed"/.test(lines[0]) && /"code":"42501"/.test(lines[0]) && !leaked(lines),
        lines.join(' | ').slice(0, 200))
    }
    {
      const from = LOGS.length
      const odd = new FakeAdmin({}, { keyword_competitor_positions: {
        insert: () => ({ code: `${PROVIDER_TEXT}-not-a-sqlstate`, message: 'x' }) } })
      await recordCompetitorPositions(odd, args)
      const lines = LOGS.slice(from)
      check('B5: an error "code" that is really text is not logged either', /"code":null/.test(lines.join(' ')) && !leaked(lines),
        lines.join(' | ').slice(0, 200))
    }
    {
      const from = LOGS.length
      const throwing = adminWith(new FakeAdmin({}), 'keyword_competitor_positions', () => { throw new Error(`${PROVIDER_TEXT} socket hang up`) })
      let rejected = false
      const out = await recordCompetitorPositions(throwing, args).catch(() => { rejected = true; return 'rejected' })
      const lines = LOGS.slice(from)
      check('B6: a client that throws resolves to "failed" — the promise never rejects',
        out === 'failed' && !rejected, String(out))
      check('B7: …logged as save_exception, without the thrown text',
        events(lines).length === 1 && /"event":"save_exception"/.test(lines[0]) && !leaked(lines), lines.join(' | ').slice(0, 200))
    }

    // The bounded waits run side by side: a hanging save, a hanging list read,
    // and the after() callback holding a save that never settles.
    const hangingSave = (async () => {
      const t0 = Date.now()
      const out = await watchdog(
        recordCompetitorPositions(adminWith(new FakeAdmin({}), 'keyword_competitor_positions', () => HANG), args),
        COMPETITOR_SAVE_TIMEOUT_MS + 3_000, 'still waiting')
      return { out, ms: Date.now() - t0 }
    })()
    const hangingLoad = (async () => {
      const t0 = Date.now()
      const out = await watchdog(
        loadCompetitorDomainsForScan(adminWith(new FakeAdmin({}), 'ai_visibility_competitors', () => HANG), { projectId: PROJECT, ownerId: OWNER }),
        COMPETITOR_LOAD_TIMEOUT_MS + 3_000, ['still waiting'])
      return { out, ms: Date.now() - t0 }
    })()
    AFTER_CALLBACKS = []
    const pendingForever = new Promise(() => {})
    const handedOver = finishCompetitorSavesAfterResponse([pendingForever])
    const heldCallbacks = AFTER_CALLBACKS.slice()
    const boundedAfter = (async () => {
      const t0 = Date.now()
      await watchdog(Promise.all(heldCallbacks.map((cb) => cb())), COMPETITOR_SAVE_TIMEOUT_MS + 3_000, [])
      return Date.now() - t0
    })()
    const from = LOGS.length
    const [save, load, afterMs] = await Promise.all([hangingSave, hangingLoad, boundedAfter])
    const lines = LOGS.slice(from)
    check(`B8: a save that never answers gives up at its bound (${COMPETITOR_SAVE_TIMEOUT_MS} ms): "timeout", not a hang`,
      save.out === 'timeout' && save.ms >= COMPETITOR_SAVE_TIMEOUT_MS - 50 && save.ms < COMPETITOR_SAVE_TIMEOUT_MS + 1_000,
      `${save.out} after ${save.ms} ms`)
    check('B9: …and says so with a stable code', lines.some((l) => /"event":"save_timeout"/.test(l)))
    check('B10: saves still in flight when the scan ends are handed to after() — one callback, nothing awaited by the scan',
      handedOver === 'after_response' && heldCallbacks.length === 1, `${handedOver} ${heldCallbacks.length}`)
    check('B11: that callback is bounded too: a save that never settles is let go after the grace period',
      afterMs >= COMPETITOR_SAVE_TIMEOUT_MS - 50 && afterMs < COMPETITOR_SAVE_TIMEOUT_MS + 1_000, `${afterMs} ms`)
    {
      AFTER_CALLBACKS = []
      let settle: () => void = () => {}
      const save = new Promise<void>((resolve) => { settle = resolve })
      finishCompetitorSavesAfterResponse([save])
      const t0 = Date.now()
      setTimeout(() => settle(), 40)
      await Promise.all(AFTER_CALLBACKS.map((cb) => cb()))
      const ms = Date.now() - t0
      check('B12: and it waits for saves that do finish, so they are not cut off', ms >= 35 && ms < 1_000, `${ms} ms`)
    }
    {
      AFTER_CALLBACKS = []
      const none = finishCompetitorSavesAfterResponse([])
      AFTER_MODE = 'real'
      let threw = false, outside = ''
      try { outside = finishCompetitorSavesAfterResponse([Promise.resolve('saved')]) } catch { threw = true }
      AFTER_MODE = 'request'
      check('B13: nothing in flight registers nothing', none === 'none' && AFTER_CALLBACKS.length === 0)
      check('B14: outside a request (a script, a test) there is nothing to hold: it says so and never throws',
        !threw && outside === 'no_request_scope', `${threw} ${outside}`)
    }

    say('\nC) the competitor list a scan uses')
    check(`C1: a list read that never answers gives up at its bound (${COMPETITOR_LOAD_TIMEOUT_MS} ms) with no competitors`,
      same(load.out, []) && load.ms >= COMPETITOR_LOAD_TIMEOUT_MS - 50 && load.ms < COMPETITOR_LOAD_TIMEOUT_MS + 1_000,
      `${JSON.stringify(load.out)} after ${load.ms} ms`)
    check('C2: …and says so with a stable code', lines.some((l) => /"event":"competitors_load_timeout"/.test(l)))
  }
  {
    const t = tables()
    const got = await loadCompetitorDomainsForScan(new FakeAdmin(t), { projectId: PROJECT, ownerId: OWNER })
    check('C3: this project\'s, this owner\'s, active competitors — as configured, trimmed, in order',
      same(got, CONFIGURED_FOR_SCAN), JSON.stringify(got))
    check('C4: never a paused competitor, another project\'s or another owner\'s',
      !NOT_THIS_SCAN.some((d) => got.some((g: string) => g.includes(d))))
    const many = Array.from({ length: 14 }, (_, i) => ({ user_id: OWNER, project_id: PROJECT, name: `c${i}`, domain: `c${i % 12}.com`, is_active: true }))
    many.push({ user_id: OWNER, project_id: PROJECT, name: 'blank', domain: '  ', is_active: true })
    many.push({ user_id: OWNER, project_id: PROJECT, name: 'no domain', domain: null as unknown as string, is_active: true })
    const capped = await loadCompetitorDomainsForScan(new FakeAdmin({ ai_visibility_competitors: many }), { projectId: PROJECT, ownerId: OWNER })
    check(`C5: repeats collapse, blanks are skipped, at most ${MAX_COMPETITOR_DOMAINS} are used`,
      capped.length === MAX_COMPETITOR_DOMAINS && new Set(capped).size === capped.length && !capped.some((d: string) => !d.trim()),
      JSON.stringify(capped))
    const touched: string[] = []
    const spy = { from: (n: string) => { touched.push(n); return new FakeAdmin(tables()).from(n) } }
    const noOwner = await loadCompetitorDomainsForScan(spy, { projectId: PROJECT, ownerId: null })
    check('C6: no owner, no read at all', same(noOwner, []) && touched.length === 0)
    {
      const from = LOGS.length
      const failing = new FakeAdmin(tables(), { ai_visibility_competitors: {
        select: () => ({ code: '57014', message: `${PROVIDER_TEXT} canceling statement due to statement timeout` }) } })
      const out = await loadCompetitorDomainsForScan(failing, { projectId: PROJECT, ownerId: OWNER })
      const lines = LOGS.slice(from)
      check('C7: a read error means no competitors, logged as a stable code with its SQLSTATE and no provider text',
        same(out, []) && /"event":"competitors_load_failed"/.test(lines.join(' ')) && /"code":"57014"/.test(lines.join(' ')) && !leaked(lines),
        lines.join(' | ').slice(0, 200))
    }
    {
      const from = LOGS.length
      const throwing = adminWith(new FakeAdmin(tables()), 'ai_visibility_competitors', () => { throw new Error(`${PROVIDER_TEXT} boom`) })
      let rejected = false
      const out = await loadCompetitorDomainsForScan(throwing, { projectId: PROJECT, ownerId: OWNER }).catch(() => { rejected = true })
      const lines = LOGS.slice(from)
      check('C8: a client that throws means no competitors — the promise never rejects',
        same(out, []) && !rejected && /"event":"competitors_load_exception"/.test(lines.join(' ')) && !leaked(lines))
    }
  }

  // ── D) the manual scan route ──────────────────────────────────────────────
  say('\nD) the manual scan: POST /api/scan, real route, real scanner, recorded Serper pages')
  const base = await scanRoute(tables({ competitors: false }))
  await afterResponse(base)
  const withC = await scanRoute(tables())
  const afterMs = await afterResponse(withC)
  {
    check('D1: without competitors the scan is what it always was: 200, completed, the project at 2',
      base.status === 200 && base.body?.status === 'completed' && base.t.scan_results[0]?.position === 2
      && base.t.keyword_competitor_positions.length === 0 && base.afters.length === 0,
      `${base.status} ${JSON.stringify(base.body).slice(0, 120)}`)
    check('D2: with competitors the scanner is handed this owner\'s active competitors of this project, and no others',
      same(withC.scans[0]?.input.competitorDomains, CONFIGURED_FOR_SCAN), JSON.stringify(withC.scans[0]?.input.competitorDomains))
    check(`D3: the same Serper requests, byte for byte (${withC.serper.length} with competitors, ${base.serper.length} without)`,
      withC.serper.length === 2 && same(withC.serper, base.serper) && !withC.serper.some((r) => /rival|competitor-/i.test(r)))
    check('D4: and no request to any other host', withC.other.length === 0 && base.other.length === 0,
      JSON.stringify([...withC.other, ...base.other]))
    check('D5: the scan_results row is identical, field by field (the project still at 2)',
      withC.t.scan_results.length === 1 && same(resultRows(withC.t), resultRows(base.t)) && withC.t.scan_results[0].position === 2,
      JSON.stringify(resultRows(withC.t)).slice(0, 160))
    check('D6: the response is identical', withC.status === base.status && same(responseOf(withC.body), responseOf(base.body)),
      JSON.stringify(responseOf(withC.body)).slice(0, 160))
    check('D7: the scan record and the usage ledger are identical (one check reserved, one consumed)',
      same(scanRows(withC.t), scanRows(base.t)) && same(ledger(withC.t), ledger(base.t)) && same(ledger(withC.t), [['consumed', 1, 1]]),
      `${JSON.stringify(ledger(withC.t))} vs ${JSON.stringify(ledger(base.t))}`)
    const reported = (withC.scans[0]?.output.competitorPositions ?? []).map((p: any) => ({ domain: p.domain, position: p.position, url: p.url }))
    check('D8: one row per competitor, exactly what the scanner found on that page',
      reported.length === 4 && same(positionsOf(withC.t), reported), JSON.stringify(positionsOf(withC.t)))
    const at = (d: string) => positionsOf(withC.t).find((p) => p.domain === d)
    check('D9: …which is: rival-shoes.com 3 (its subdomain\'s URL), competitor-b.co.il 4, competitor-c.com 12, absent-competitor.org none',
      at('rival-shoes.com')?.position === 3 && at('rival-shoes.com')?.url === 'https://m.rival-shoes.com/tlv/running'
      && at('competitor-b.co.il')?.position === 4 && at('competitor-c.com')?.position === 12
      && at('absent-competitor.org')?.position === null && at('absent-competitor.org')?.url === null)
    const own = withC.t.scan_results[0]
    check('D10: every row is the owner\'s, for this project and keyword, under the SAME checked_at as the scan result',
      withC.t.keyword_competitor_positions.every((r) => r.user_id === OWNER && r.project_id === PROJECT
        && r.tracking_target_id === KEYWORD && r.checked_at === own?.checked_at),
      JSON.stringify(withC.t.keyword_competitor_positions.map((r) => r.checked_at)) + ' vs ' + own?.checked_at)
    check('D11: nothing for a paused competitor, another project\'s or another owner\'s (all on the page)',
      !positionsOf(withC.t).some((p) => NOT_THIS_SCAN.includes(p.domain)))
    check('D12: the save was handed to after() — the scan answered without waiting for it', withC.afters.length === 1,
      String(withC.afters.length))
    check('D13: no error was logged and no promise went unhandled',
      events(withC.logs()).length === 0 && UNHANDLED.length === 0 && afterMs < 1_000,
      `${events(withC.logs()).join(' | ')} unhandled=${UNHANDLED.length}`)
  }
  {
    const all = await scanRoute(tables(), { body: { projectId: PROJECT } })
    await afterResponse(all)
    const maps = all.scans.find((s) => s.engine === 'google_maps')
    const organic = all.scans.find((s) => s.engine === 'google_search')
    check('D14: "scan all": Maps gets no competitors, organic does',
      !!maps && !('competitorDomains' in maps.input) && same(organic?.input.competitorDomains, CONFIGURED_FOR_SCAN))
    check('D15: …and rows are written for the organic keyword only',
      all.t.keyword_competitor_positions.length === 4 && all.t.keyword_competitor_positions.every((r) => r.tracking_target_id === KEYWORD)
      && all.body?.completed === 2, JSON.stringify(all.body).slice(0, 120))
  }
  {
    const failing = await scanRoute(tables(), { hooks: { keyword_competitor_positions: {
      insert: () => ({ code: '42501', message: `${PROVIDER_TEXT} new row violates row-level security policy` }) } } })
    await afterResponse(failing)
    const lines = failing.logs()
    check('D16: a failing save: the response, the scan result, the scan record and the ledger are all unchanged',
      failing.status === 200 && same(responseOf(failing.body), responseOf(base.body)) && same(resultRows(failing.t), resultRows(base.t))
      && same(scanRows(failing.t), scanRows(base.t)) && same(ledger(failing.t), ledger(base.t)),
      `${failing.status} ${JSON.stringify(responseOf(failing.body)).slice(0, 120)}`)
    check('D17: …logged as one stable code, no provider text, nothing unhandled',
      events(lines).length === 1 && /save_failed/.test(events(lines)[0]) && !leaked(lines) && UNHANDLED.length === 0,
      events(lines).join(' | '))
  }
  {
    const throwing = await scanRoute(tables(), { admin: (fake) => adminWith(fake, 'keyword_competitor_positions',
      () => { throw new Error(`${PROVIDER_TEXT} client exploded`) }) })
    await afterResponse(throwing)
    const lines = throwing.logs()
    check('D18: a save that throws: the scan is unchanged, logged as save_exception, nothing unhandled',
      throwing.status === 200 && same(responseOf(throwing.body), responseOf(base.body)) && same(resultRows(throwing.t), resultRows(base.t))
      && events(lines).some((l) => /save_exception/.test(l)) && !leaked(lines) && UNHANDLED.length === 0,
      `${throwing.status} ${events(lines).join(' | ')}`)
  }
  {
    const hanging = await scanRoute(tables(), { admin: (fake) => adminWith(fake, 'keyword_competitor_positions', () => HANG) })
    check(`D19: a save that never answers does not hold the scan: answered in ${hanging.ms} ms (without competitors ${base.ms} ms; the save's own bound is ${COMPETITOR_SAVE_TIMEOUT_MS} ms)`,
      hanging.status === 200 && hanging.ms < base.ms + 1_000 && hanging.ms < COMPETITOR_SAVE_TIMEOUT_MS)
    check('D20: …and the scan is unchanged',
      same(responseOf(hanging.body), responseOf(base.body)) && same(resultRows(hanging.t), resultRows(base.t)))
    const held = await afterResponse(hanging)
    check('D21: after the response, the platform holds the function only up to the bound, then lets go',
      held < COMPETITOR_SAVE_TIMEOUT_MS + 1_000 && hanging.logs().some((l) => /save_timeout/.test(l)), `${held} ms`)
  }
  {
    const loadFails = await scanRoute(tables(), { hooks: { ai_visibility_competitors: {
      select: () => ({ code: '57014', message: `${PROVIDER_TEXT} canceling statement` }) } } })
    const lines = loadFails.logs()
    check('D22: the competitor list cannot be read: the keyword is scanned exactly as before, with no competitors',
      loadFails.status === 200 && !('competitorDomains' in (loadFails.scans[0]?.input ?? {}))
      && same(responseOf(loadFails.body), responseOf(base.body)) && same(resultRows(loadFails.t), resultRows(base.t))
      && same(loadFails.serper, base.serper) && loadFails.t.keyword_competitor_positions.length === 0)
    check('D23: …logged as a stable code, no provider text', /competitors_load_failed/.test(lines.join(' ')) && !leaked(lines))
  }
  {
    const loadHangs = await scanRoute(tables(), { admin: (fake) => adminWith(fake, 'ai_visibility_competitors', () => HANG) })
    check(`D24: a competitor list that never arrives does not hold the scan: answered in ${loadHangs.ms} ms (the read's own bound is ${COMPETITOR_LOAD_TIMEOUT_MS} ms)`,
      loadHangs.status === 200 && loadHangs.ms < base.ms + 1_000 && loadHangs.ms < COMPETITOR_LOAD_TIMEOUT_MS)
    check('D25: …the keyword is scanned without competitors, exactly as before',
      !('competitorDomains' in (loadHangs.scans[0]?.input ?? {})) && same(responseOf(loadHangs.body), responseOf(base.body))
      && same(resultRows(loadHangs.t), resultRows(base.t)) && loadHangs.t.keyword_competitor_positions.length === 0)
    await sleep(Math.max(0, COMPETITOR_LOAD_TIMEOUT_MS + 200 - loadHangs.ms))
    check('D26: and the read gives up at its bound with a stable code', loadHangs.logs().some((l) => /competitors_load_timeout/.test(l)))
  }
  {
    AFTER_MODE = 'real'
    const outside = await scanRoute(tables())
    await sleep(20)
    AFTER_MODE = 'request'
    check('D27: without a request scope for after(), the scan is unchanged and the saves still land',
      outside.status === 200 && same(responseOf(outside.body), responseOf(base.body))
      && same(positionsOf(outside.t), positionsOf(withC.t)) && UNHANDLED.length === 0)
  }
  {
    const byStaff = await scanRoute(tables({ staff: true }), { requester: STAFF })
    await afterResponse(byStaff)
    check('D28: an administrator scanning a merchant\'s project writes the rows as the PROJECT OWNER\'s, never the requester\'s',
      byStaff.status === 200 && byStaff.t.keyword_competitor_positions.length === 4
      && byStaff.t.keyword_competitor_positions.every((r) => r.user_id === OWNER),
      `${byStaff.status} ${JSON.stringify(byStaff.t.keyword_competitor_positions.map((r) => r.user_id))}`)
  }
  {
    const foreign = await scanRoute(tables(), { requester: OTHER_USER })
    check('D29: another user cannot scan the project, so nothing about its competitors is read or written',
      foreign.status === 404 && foreign.scans.length === 0 && foreign.t.keyword_competitor_positions.length === 0)
  }

  // ── E) the scheduled scan ─────────────────────────────────────────────────
  say('\nE) the scheduled scan: processScheduledScanForProject, real scanner, recorded Serper pages')
  {
    const { processScheduledScanForProject } = require('../../scan-scheduler/process-scheduled-scan.ts')
    const NOW = new Date('2026-09-27T06:00:00.000Z')
    // The owner is an administrator, so the run skips the usage ledger (proved in
    // lib/scan-scheduler/__qa__); under test here is what the loop sends and writes.
    const schedTables = (competitors = true) => {
      const t = tables({ competitors })
      t.profiles = [{ id: OWNER, role: 'admin' }]
      Object.assign(t.projects[0], { name: 'Shoes IL', is_active: true, auto_scan_enabled: true, scan_frequency: 'monthly',
        next_scan_at: NOW.toISOString(), scan_claimed_at: null, scan_retry_count: 0 })
      return t
    }
    const runScheduled = async (t: Record<string, any[]>, opts: { hooks?: Record<string, unknown>; admin?: (fake: any) => any } = {}) => {
      const fake = new FakeAdmin(t, opts.hooks ?? {}, () => NOW.getTime())
      const admin = opts.admin ? opts.admin(fake) : fake
      const net = serperNet()
      SCANS = []; AFTER_CALLBACKS = []
      const from = LOGS.length
      const t0 = Date.now()
      let outcome: any
      try { outcome = await processScheduledScanForProject(admin, { ...t.projects[0] }, { now: NOW }) } finally { net.restore() }
      const ms = Date.now() - t0
      return { outcome, ms, t, serper: net.log, other: net.other, scans: SCANS, afters: AFTER_CALLBACKS.slice(), logs: () => LOGS.slice(from) }
    }
    const sBase = await runScheduled(schedTables(false))
    const sWith = await runScheduled(schedTables())
    await Promise.all(sWith.afters.map((cb) => cb()))
    const sRows = (t: Record<string, any[]>) => t.scan_results.map((r) => without(r, ['id', 'scan_id']))
    check('E1: the outcome is the same with competitors as without (completed 2, failed 0)',
      same(sWith.outcome, sBase.outcome) && same(sBase.outcome, { status: 'completed', completed: 2, failed: 0 }), JSON.stringify(sWith.outcome))
    check('E2: organic is handed the competitors, Maps is not',
      same(sWith.scans.find((s) => s.engine === 'google_search')?.input.competitorDomains, CONFIGURED_FOR_SCAN)
      && !('competitorDomains' in (sWith.scans.find((s) => s.engine === 'google_maps')?.input ?? { competitorDomains: 1 })))
    check('E3: the same Serper requests, byte for byte, and no other host',
      sWith.serper.length === 2 && same(sWith.serper, sBase.serper) && sWith.other.length === 0)
    check('E4: every scan_results row is identical, checked_at included',
      sWith.t.scan_results.length === 2 && same(sRows(sWith.t), sRows(sBase.t)), JSON.stringify(sRows(sWith.t)).slice(0, 160))
    const organicRow = sWith.t.scan_results.find((r) => r.tracking_target_id === KEYWORD)
    check('E5: the rows are the owner\'s, for the organic keyword, under the SAME checked_at as its scan result',
      sWith.t.keyword_competitor_positions.length === 4
      && sWith.t.keyword_competitor_positions.every((r) => r.user_id === OWNER && r.project_id === PROJECT
        && r.tracking_target_id === KEYWORD && r.checked_at === organicRow?.checked_at && r.checked_at === NOW.toISOString()),
      JSON.stringify(sWith.t.keyword_competitor_positions.map((r) => [r.tracking_target_id, r.checked_at])))
    check('E6: …with the positions the manual scan recorded from the same page',
      same(positionsOf(sWith.t), positionsOf(withC.t)))
    check('E7: the saves were handed to after(), and nothing was logged or left unhandled',
      sWith.afters.length === 1 && events(sWith.logs()).length === 0 && UNHANDLED.length === 0)

    const sFail = await runScheduled(schedTables(), { hooks: { keyword_competitor_positions: {
      insert: () => ({ code: '42501', message: `${PROVIDER_TEXT} denied` }) } } })
    await Promise.all(sFail.afters.map((cb) => cb()))
    check('E8: a failing save: the same outcome and the same scan results; one stable code, no provider text',
      same(sFail.outcome, sBase.outcome) && same(sRows(sFail.t), sRows(sBase.t)) && sFail.t.keyword_competitor_positions.length === 0
      && events(sFail.logs()).length === 1 && /save_failed/.test(events(sFail.logs())[0]) && !leaked(sFail.logs()),
      `${JSON.stringify(sFail.outcome)} ${events(sFail.logs()).join(' | ')}`)
    const sThrow = await runScheduled(schedTables(), { admin: (fake) => adminWith(fake, 'keyword_competitor_positions',
      () => { throw new Error(`${PROVIDER_TEXT} boom`) }) })
    await Promise.all(sThrow.afters.map((cb) => cb()))
    check('E9: a save that throws: the same outcome, logged as save_exception, nothing unhandled',
      same(sThrow.outcome, sBase.outcome) && same(sRows(sThrow.t), sRows(sBase.t)) && UNHANDLED.length === 0 && !leaked(sThrow.logs())
      && events(sThrow.logs()).some((l) => /save_exception/.test(l)), events(sThrow.logs()).join(' | '))
    const sHang = await runScheduled(schedTables(), { admin: (fake) => adminWith(fake, 'keyword_competitor_positions', () => HANG) })
    check(`E10: a save that never answers does not hold the run: finished in ${sHang.ms} ms (without competitors ${sBase.ms} ms)`,
      same(sHang.outcome, sBase.outcome) && sHang.ms < sBase.ms + 1_000 && sHang.ms < COMPETITOR_SAVE_TIMEOUT_MS)
    const sNoList = await runScheduled(schedTables(), { hooks: { ai_visibility_competitors: {
      select: () => ({ code: '57014', message: `${PROVIDER_TEXT} timeout` }) } } })
    check('E11: the competitor list cannot be read: scanned exactly as before, with no competitors',
      same(sNoList.outcome, sBase.outcome) && same(sRows(sNoList.t), sRows(sBase.t)) && sNoList.t.keyword_competitor_positions.length === 0
      && !sNoList.scans.some((s) => 'competitorDomains' in s.input) && !leaked(sNoList.logs()))
    const sListHangs = await runScheduled(schedTables(), { admin: (fake) => adminWith(fake, 'ai_visibility_competitors', () => HANG) })
    check(`E12: a competitor list that never arrives does not hold the run: finished in ${sListHangs.ms} ms, scanned as before`,
      same(sListHangs.outcome, sBase.outcome) && same(sRows(sListHangs.t), sRows(sBase.t))
      && sListHangs.ms < sBase.ms + 1_000 && sListHangs.ms < COMPETITOR_LOAD_TIMEOUT_MS
      && sListHangs.t.keyword_competitor_positions.length === 0)
    await sleep(Math.max(0, COMPETITOR_LOAD_TIMEOUT_MS + 200 - sListHangs.ms))
  }

  // ── F) the comparison ─────────────────────────────────────────────────────
  say('\nF) the comparison the keywords tab and the dashboard show')
  {
    const competitors = trackedCompetitorsFrom([
      { name: 'Rival Shoes', domain: ' https://WWW.Rival-Shoes.com/ ', is_active: true },
      { name: '  ', domain: 'competitor-b.co.il', is_active: true },
      { name: 'Duplicate', domain: 'rival-shoes.com/other-page', is_active: true },
      { name: 'Paused', domain: 'paused.com', is_active: false },
      { name: 'No domain', domain: null, is_active: true },
      { name: 'Competitor C', domain: 'http://competitor-c.com/deals', is_active: true },
    ])
    check('F1: tracked competitors: active, normalized exactly like the scanner, one per domain, name or domain as the label',
      same(competitors, [
        { name: 'Rival Shoes', domain: 'rival-shoes.com' },
        { name: 'competitor-b.co.il', domain: 'competitor-b.co.il' },
        { name: 'Competitor C', domain: 'competitor-c.com' },
      ]), JSON.stringify(competitors))

    const check_ = (targetId: string, engine: string, checkedAt: string | null, found: boolean, position: number | null) =>
      ({ targetId, engine, checkedAt, found, position })
    const row = (target: string, domain: string, position: number | null, checkedAt: string, url: string | null = null) =>
      ({ tracking_target_id: target, competitor_domain: domain, position, url, checked_at: checkedAt })
    const checks = [
      check_('k1', 'google_search', '2026-09-27T10:00:00.000Z', true, 5),
      check_('k2', 'google_search', '2026-09-27T10:00:05.000Z', false, null),
      check_('k3', 'google_search', '2026-09-27T10:00:10.123Z', true, 2),
      check_('k4', 'google_maps', '2026-09-27T10:00:15.000Z', true, 1),
      check_('k5', 'google_search', null, false, null),
      check_('k6', 'google_search', '2026-09-27T10:00:20.000Z', true, 9),
      check_('k7', 'google_search', '2026-09-27T10:00:30.000Z', true, 4),
    ]
    const rows = [
      // k1, as PostgREST returns a timestamptz: the same instant in another spelling.
      row('k1', 'rival-shoes.com', 3, '2026-09-27T10:00:00+00:00', 'https://m.rival-shoes.com/a'),
      row('k1', 'competitor-b.co.il', 5, '2026-09-27T10:00:00+00:00', 'https://competitor-b.co.il/b'),
      row('k1', 'competitor-c.com', 12, '2026-09-27T10:00:00+00:00', 'https://competitor-c.com/c'),
      row('k1', 'rival-shoes.com', 1, '2026-09-26T10:00:00+00:00', 'https://rival-shoes.com/yesterday'),
      row('k1', 'removed-competitor.com', 1, '2026-09-27T10:00:00+00:00', 'https://removed-competitor.com/'),
      row('k2', 'rival-shoes.com', 7, '2026-09-27T10:00:05+00:00', 'https://rival-shoes.com/k2'),
      row('k2', 'competitor-b.co.il', null, '2026-09-27T10:00:05+00:00'),
      row('k3', 'rival-shoes.com', 1, '2026-09-27T10:00:10.123+00:00', 'https://rival-shoes.com/k3'),
      row('k3', 'competitor-b.co.il', 20, '2026-09-27T10:00:10.123+00:00', 'https://competitor-b.co.il/k3'),
      row('k3', 'competitor-c.com', 21, '2026-09-27T10:00:10.123+00:00', 'https://competitor-c.com/k3'),
      row('k4', 'rival-shoes.com', 1, '2026-09-27T10:00:15+00:00', 'https://rival-shoes.com/maps'),
      row('k6', 'rival-shoes.com', 2, '2026-09-20T10:00:20+00:00', 'https://rival-shoes.com/last-week'),
      row('k7', 'rival-shoes.com', null, '2026-09-27T10:00:30+00:00'),
      row('k7', 'competitor-b.co.il', null, '2026-09-27T10:00:30+00:00'),
      row('k7', 'competitor-c.com', null, '2026-09-27T10:00:30+00:00'),
    ]
    const cmp = buildCompetitorComparison({ competitors, checks, rows })
    const c = cmp.cells
    const brief = (e: any) => [e.domain, e.position, e.relation, e.aheadOfYou]
    check('F2: the SAME check is matched by instant, not by spelling; yesterday\'s page is never used',
      c.k1?.kind === 'best' && c.k1.best.domain === 'rival-shoes.com' && c.k1.best.position === 3
      && c.k1.best.url === 'https://m.rival-shoes.com/a', JSON.stringify(c.k1))
    check('F3: above, same and below are measured against YOUR position in that check (you: 5)',
      c.k1?.kind === 'best' && same(c.k1.entries.map(brief), [
        ['rival-shoes.com', 3, 'above', true], ['competitor-b.co.il', 5, 'same', false], ['competitor-c.com', 12, 'below', false]]),
      JSON.stringify(c.k1?.kind === 'best' ? c.k1.entries.map(brief) : c.k1))
    check('F4: a competitor that is no longer tracked is ignored', !JSON.stringify(cmp).includes('removed-competitor.com'))
    check('F5: you not in the top 20: any competitor that is, is above you; one outside it is unknown, never ahead',
      c.k2?.kind === 'best' && same(c.k2.entries.map(brief), [
        ['rival-shoes.com', 7, 'above', true], ['competitor-b.co.il', null, 'unknown', false]]), JSON.stringify(c.k2))
    check('F6: a position outside 1-20 in the data is treated as absent, and its URL is not shown',
      c.k3?.kind === 'best' && same(c.k3.entries.map(brief), [
        ['rival-shoes.com', 1, 'above', true], ['competitor-b.co.il', 20, 'below', false], ['competitor-c.com', null, 'unknown', false]])
      && c.k3.entries[2].url === null, JSON.stringify(c.k3))
    check('F7: Maps is not compared', c.k4?.kind === 'not_organic')
    check('F8: never checked says so', c.k5?.kind === 'not_checked')
    check('F9: a check with no rows of its own says "not recorded" instead of borrowing last week\'s', c.k6?.kind === 'not_recorded')
    check('F10: recorded, none in the top 20: its own state, with every competitor listed',
      c.k7?.kind === 'none_in_top20' && c.k7.entries.length === 3 && c.k7.entries.every((e: any) => e.position === null && !e.aheadOfYou))
    check('F11: the summary: per competitor, keywords where it is above you, of the keywords that recorded it — most ahead first',
      same(cmp.standings, [
        { domain: 'rival-shoes.com', name: 'Rival Shoes', ahead: 3, compared: 4 },
        { domain: 'competitor-b.co.il', name: 'competitor-b.co.il', ahead: 0, compared: 4 },
        { domain: 'competitor-c.com', name: 'Competitor C', ahead: 0, compared: 3 },
      ]) && cmp.comparedKeywords === 4, JSON.stringify(cmp.standings))
    const tie = buildCompetitorComparison({
      competitors: [{ name: 'Z', domain: 'z.com' }, { name: 'A', domain: 'a.com' }],
      checks: [check_('k', 'google_search', AT, true, 10)],
      rows: [row('k', 'a.com', 4, AT), row('k', 'z.com', 4, AT)],
    })
    check('F12: a tie keeps the configured order, and the best of a tie is the first configured',
      same(tie.standings.map((s: any) => s.domain), ['z.com', 'a.com']) && tie.cells.k.kind === 'best' && tie.cells.k.best.domain === 'z.com')
    check('F13: relation and "ahead" agree everywhere',
      relationToYou(3, { found: true, position: 3 }) === 'same' && !isAheadOfYou(3, { found: true, position: 3 })
      && isAheadOfYou(2, { found: true, position: 3 }) && !isAheadOfYou(null, { found: false, position: null })
      && isAheadOfYou(20, { found: false, position: null }))
    check('F14: an instant that cannot be read never matches',
      !sameInstant('not a date', 'not a date') && !sameInstant(null, AT) && sameInstant('2026-09-27T07:00:00+00:00', AT))
    const empty = buildCompetitorComparison({ competitors, checks: [], rows: [] })
    check('F15: no keywords: every competitor at 0 of 0', empty.comparedKeywords === 0
      && empty.standings.every((s: any) => s.ahead === 0 && s.compared === 0))
    const links = buildCompetitorComparison({
      competitors: [{ name: 'A', domain: 'a.com' }, { name: 'B', domain: 'b.com' }, { name: 'C', domain: 'c.com' }],
      checks: [check_('k', 'google_search', AT, true, 10)],
      rows: [row('k', 'a.com', 2, AT, 'javascript:alert(1)'), row('k', 'b.com', 3, AT, 'HTTPS://b.com/page'),
        row('k', 'c.com', 4, AT, 'data:text/html,<b>x</b>')],
    })
    const linkOf = (d: string) => links.cells.k.kind === 'best' ? links.cells.k.entries.find((e: any) => e.domain === d)?.url : 'no cell'
    check('F16: only an http(s) page becomes a link; any other scheme is shown as text',
      linkOf('a.com') === null && linkOf('b.com') === 'HTTPS://b.com/page' && linkOf('c.com') === null,
      JSON.stringify(['a.com', 'b.com', 'c.com'].map(linkOf)))
  }

  // ── G) the copy ───────────────────────────────────────────────────────────
  say('\nG) the copy, in Hebrew and in English')
  {
    const { dashboardHe } = require('../../i18n/dashboard/he.ts')
    const { dashboardEn } = require('../../i18n/dashboard/en.ts')
    const he = dashboardHe.competitors, en = dashboardEn.competitors
    const keys = (o: any) => Object.keys(o ?? {}).sort()
    const onlyIn = (a: any, b: any) => keys(a).filter((k) => !(k in (b ?? {})))
    check('G1: the same keys in both languages', keys(he).length > 20 && same(keys(he), keys(en)),
      JSON.stringify([...onlyIn(he, en), ...onlyIn(en, he)]))
    const render = (d: any) => keys(d).map((k) => typeof d[k] === 'function' ? d[k]('Rival Shoes', 3, 4) : d[k])
    check('G2: every entry is text, and every sentence takes the same arguments in both',
      keys(he).every((k) => typeof he[k] === typeof en[k] && (typeof he[k] !== 'function' || he[k].length === en[k].length))
      && [...render(he), ...render(en)].every((v) => typeof v === 'string' && v.trim().length > 0))
    const hebrew = /[֐-׿]/
    check('G3: the English copy has no Hebrew (Shopify surfaces are English-only)', !render(en).some((v: string) => hebrew.test(v)))
    check('G4: the Hebrew copy is Hebrew', ['title', 'topCompetitor', 'noCompetitors', 'manageCompetitors'].every((k) => hebrew.test(he[k])))
    check('G5: the counted sentences carry their numbers in both',
      [he, en].every((d) => /3/.test(d.aboveYouSentence('Rival Shoes', 3, 4)) && /4/.test(d.aboveYouSentence('Rival Shoes', 3, 4))
        && /Rival Shoes/.test(d.aboveYouSentence('Rival Shoes', 3, 4)) && /4/.test(d.ofKeywords(4)) && /2/.test(d.moreCompetitors(2))))
  }

  // ── H) source guards ──────────────────────────────────────────────────────
  say('\nH) source guards, each with a mutation control')
  {
    const route = strip(read('app/api/scan/route.ts'))
    const sched = strip(read('lib/scan-scheduler/process-scheduled-scan.ts'))
    const positions = strip(read('lib/competitors/scan-positions.ts'))
    const screens = ['components/competitors/useCompetitorComparison.ts', 'components/competitors/CompetitorSummary.tsx',
      'components/competitors/TopCompetitorLine.tsx', 'lib/competitors/comparison.ts',
      'components/keywords/ProjectKeywordsPanel.tsx', 'components/keywords/TrackingTargetsTable.tsx']
      .map((p) => [p, strip(read(p))] as const)
    const count = (s: string, needle: string) => s.split(needle).length - 1

    const G = {
      /** Written once, only after this check's own row is in, under that row's checked_at. */
      routeAfterOwnRow: (s: string) => {
        const insert = s.indexOf(".from('scan_results').insert(resultData)")
        const thrown = s.indexOf('throw new Error(`scan_results_insert_failed:', insert)
        const record = s.indexOf('recordCompetitorPositions(admin', insert)
        return insert > 0 && thrown > insert && record > thrown && count(s, 'recordCompetitorPositions(admin') === 1
          && /checkedAt: resultData\.checked_at as string, positions: scanOutput\.competitorPositions/.test(s.slice(record, record + 300))
      },
      schedAfterOwnRow: (s: string) => {
        const insert = s.indexOf(".from('scan_results').insert({")
        const thrown = s.indexOf('throw new Error(`scan_results_insert_failed:', insert)
        const record = s.indexOf('recordCompetitorPositions(admin', insert)
        return insert > 0 && thrown > insert && record > thrown && count(s, 'recordCompetitorPositions(admin') === 1
          && /const checkedAt = now\.toISOString\(\)/.test(s) && /checked_at: checkedAt,/.test(s)
          && /trackingTargetId: target\.id,\s*checkedAt, positions: scanOutput\.competitorPositions/.test(s)
      },
      /** The scan never awaits the competitor side. */
      neverAwaited: (s: string) => /void loadCompetitorDomainsForScan\(admin/.test(s)
        && /competitorSaves\.push\(recordCompetitorPositions\(admin/.test(s)
        && !/await[^\n;]*(loadCompetitorDomainsForScan|recordCompetitorPositions|competitorSaves|settleCompetitorSaves)/.test(s),
      /** Organic only: Maps is never handed competitors. */
      routeOrganicOnly: (s: string) =>
        /\.\.\.\(target\.engine_type === 'google_search' && competitorDomains\.length > 0 \? \{ competitorDomains \} : \{\}\)/.test(s)
        && count(s, 'competitorDomains }') === 1,
      schedOrganicOnly: (s: string) =>
        /const withCompetitors = target\.engine_type === 'google_search' && competitorDomains\.length > 0\s*\? \{ competitorDomains \}\s*: \{\}/.test(s)
        && /deviceType: project\.device_type,\s*\.\.\.withCompetitors,/.test(s),
      /** In-flight saves are handed to after(): after the loop in the route, in `finally` in the scheduler. */
      routeHandsOver: (s: string) => {
        const loopEnd = s.indexOf('finishCompetitorSavesAfterResponse(competitorSaves)')
        return loopEnd > s.indexOf('recordCompetitorPositions(admin') && loopEnd < s.indexOf('const { data: allScanResultRows }')
      },
      schedHandsOver: (s: string) => /\} finally \{\s*finishCompetitorSavesAfterResponse\(competitorSaves\)\s*\}\s*\}\s*$/.test(s),
      /** The list read is scoped to the project AND its owner, active only. */
      scopedRead: (s: string) => /\.from\('ai_visibility_competitors'\)\s*\.select\('domain'\)\s*\.eq\('project_id', scope\.projectId\)\s*\.eq\('user_id', scope\.ownerId\)\s*\.eq\('is_active', true\)/.test(s),
      /** The owner, never the requester, owns the rows. */
      ownerRows: (s: string) => /recordCompetitorPositions\(admin, \{\s*ownerId: project\.user_id,/.test(s)
        && /loadCompetitorDomainsForScan\(admin, \{ projectId(: project\.id)?, ownerId: project\.user_id \}\)/.test(s),
      /** No provider text is ever logged: codes only. */
      codesOnly: (s: string) => !/\.message\b/.test(s) && !/String\(error\)/.test(s) && !/stack/.test(s)
        && /code: errorCode\(error\)/.test(s),
      /** The screens read through the signed-in client and RLS — never the service role. */
      noServiceRole: (files: ReadonlyArray<readonly [string, string]>) => files.every(([, s]) =>
        !/createAdminClient|lib\/supabase\/admin|SUPABASE_SERVICE_ROLE_KEY|service_role/.test(s))
        && /from '@\/lib\/supabase\/client'/.test(files[0][1]),
    }

    check('H1: route — competitor rows are written once, after the scan_results insert succeeded, under its checked_at', G.routeAfterOwnRow(route))
    check('H1-MUT: a separately taken timestamp fails H1',
      !G.routeAfterOwnRow(route.replace('checkedAt: resultData.checked_at as string', 'checkedAt: new Date().toISOString()')))
    check('H2: scheduler — the same, under the one checkedAt its scan_results row uses', G.schedAfterOwnRow(sched))
    check('H2-MUT: a second clock reading in the scheduler fails H2',
      !G.schedAfterOwnRow(sched.replace('checked_at: checkedAt,', 'checked_at: now.toISOString(),')))
    check('H3: route and scheduler never await the competitor list or a save', G.neverAwaited(route) && G.neverAwaited(sched))
    check('H3-MUT: awaiting the list fails H3',
      !G.neverAwaited(route.replace('void loadCompetitorDomainsForScan(admin', 'competitorDomains = await loadCompetitorDomainsForScan(admin')))
    check('H3-MUT: awaiting a save fails H3',
      !G.neverAwaited(sched.replace('competitorSaves.push(recordCompetitorPositions(admin', 'await recordCompetitorPositions(admin')))
    check('H4: only an organic keyword is handed competitors', G.routeOrganicOnly(route) && G.schedOrganicOnly(sched))
    check('H4-MUT: dropping the organic condition fails H4',
      !G.routeOrganicOnly(route.replace("target.engine_type === 'google_search' && competitorDomains.length > 0 ? { competitorDomains } : {}", 'competitorDomains.length > 0 ? { competitorDomains } : {}'))
      && !G.schedOrganicOnly(sched.replace("target.engine_type === 'google_search' && competitorDomains.length > 0", 'competitorDomains.length > 0')))
    check('H5: in-flight saves are handed to after() — after the route\'s loop, in the scheduler\'s finally',
      G.routeHandsOver(route) && G.schedHandsOver(sched))
    check('H5-MUT: dropping the hand-over fails H5',
      !G.routeHandsOver(route.replace('finishCompetitorSavesAfterResponse(competitorSaves)', ''))
      && !G.schedHandsOver(sched.replace(/\} finally \{\s*finishCompetitorSavesAfterResponse\(competitorSaves\)\s*\}/, '}')))
    check('H6: the competitor list is read for this project AND its owner, active only', G.scopedRead(positions))
    check('H6-MUT: a read without the owner filter fails H6', !G.scopedRead(positions.replace(".eq('user_id', scope.ownerId)", '')))
    check('H7: the rows and the list are the PROJECT OWNER\'s in both paths', G.ownerRows(route) && G.ownerRows(sched))
    check('H7-MUT: the requester as the owner fails H7',
      !G.ownerRows(route.replace('ownerId: project.user_id, projectId, trackingTargetId', 'ownerId: user.id, projectId, trackingTargetId')))
    check('H8: the save logs codes only — no message, no stringified error, no stack', G.codesOnly(positions))
    check('H8-MUT: logging the error\'s message fails H8',
      !G.codesOnly(positions.replace('code: errorCode(error) })', 'code: errorCode(error), detail: (error as any).message })')))
    check('H9: the screens never touch the service role; the data hook reads through the signed-in client', G.noServiceRole(screens))
    check('H9-MUT: importing the admin client into a screen fails H9',
      !G.noServiceRole(screens.map(([p, s], i) => [p, i === 0 ? `import { createAdminClient } from '@/lib/supabase/admin'\n${s}` : s] as const)))
  }

  check('Z: no promise went unhandled anywhere in this suite', UNHANDLED.length === 0, UNHANDLED.map(String).join(' | ').slice(0, 200))
  say(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main().catch((e) => { REAL.error(e); process.exitCode = 1 })

/* A MODULE, not a global script: without it `main`, `check`, `pass` and `fail`
 * collide with every other QA suite at type-check time. A plain import cannot be
 * used for the code under test — ES imports hoist above the Module._load hook. */
export {}
