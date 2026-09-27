/**
 * W8 — the four Shopify routes that start a store's first seeding scan,
 * driven for real, end to end:
 *
 *   an App Store merchant   POST /api/shopify/link/complete (install, linked)
 *                           GET  /api/shopify/app-home      (before a plan, after
 *                                                          the plan, and again)
 *                           POST /api/shopify/sync          (the Sync button)
 *   a website merchant      GET  /api/shopify/oauth/callback (store connected)
 *                           POST /api/shopify/sync
 *
 * Everything between the request and the database is the production code: the
 * session-token and HMAC checks, the pending-link cookie, the atomic link and
 * ownership RPCs (FakeAdmin's faithful models), the billing cache, the real
 * entitlement decision (lib/subscription.ts explainAccess), the real credential
 * load (the token encrypted with the real key and decrypted by the resolver),
 * the real sync, the hook, the runner, the store's steps. Only the edges are
 * replaced: the database (FakeAdmin), the Supabase session and cookies,
 * next/server's `after` (collected, then run by hand, as Next runs it after the
 * response), Shopify's Admin and Partner APIs and its token exchange (fakes
 * that count their calls), and — for the run itself — the storefront's
 * network, the model and the search.
 *
 * Each journey runs three times on identical worlds: with the hook's call
 * reduced to nothing (the baseline — the routes as they were), with the
 * feature off, and with it on. Off must equal the baseline exactly: the same
 * answers, the same log lines, the same database. On must give the same
 * answers too, and change nothing but what the scan owns.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-shopify-routes.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
import crypto from 'crypto'
import type { Tables } from './_fixtures'

process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.ENABLE_CONTENT = 'true'
process.env.SHOPIFY_APP_URL = 'https://app.gotop.test'
process.env.SHOPIFY_PUBLIC_CLIENT_ID = 'qa-client-id'
process.env.SHOPIFY_PUBLIC_CLIENT_SECRET = 'qa-client-secret'
process.env.SHOPIFY_APP_HANDLE = 'go-top-seo'
process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = crypto.randomBytes(32).toString('hex')
for (const k of ['ENABLE_SEED_SCAN', 'GEMINI_API_KEY', 'SERPER_API_KEY', 'SHOPIFY_CLIENT_ID', 'SHOPIFY_CLIENT_SECRET', 'SEED_SCAN_USER_DAILY_CAP', 'SEED_SCAN_GLOBAL_DAILY_CAP']) {
  delete process.env[k]
}
const CLIENT_SECRET = 'qa-client-secret'

// ── The edges ───────────────────────────────────────────────────────────────

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))
const TOKEN = 'shpat_QA_ROUTE_TOKEN_NEVER_STORED'
const SHOP_NAME = 'Northwind Candles'
const DEV_STORE = 'dev-store-42.myshopify.com'
const SHOP_GID = 'gid://shopify/Shop/42'
const ALL_SCOPES = ['read_products', 'read_content', 'write_content']

const DISCOVERED = [
  { gid: 'gid://shopify/Collection/1', numericId: '1', type: 'collection', title: 'Soy candles', handle: 'soy-candles', status: null, isActive: true, bodyExcerpt: 'Hand-poured soy wax candles.', metadata: {}, updatedAt: '2026-09-20T10:00:00.000Z' },
  { gid: 'gid://shopify/Product/10', numericId: '10', type: 'product', title: 'Lavender soy candle', handle: 'lavender', status: 'ACTIVE', isActive: true, bodyExcerpt: 'Calming lavender, 45-hour burn.', metadata: { product_type: 'Candle', vendor: 'Northwind', tags: ['soy', 'lavender'] }, updatedAt: '2026-09-21T10:00:00.000Z' },
  { gid: 'gid://shopify/Product/11', numericId: '11', type: 'product', title: 'Cedar & sage candle', handle: 'cedar', status: 'ACTIVE', isActive: true, bodyExcerpt: '', metadata: { product_type: 'Candle', vendor: 'Northwind', tags: [] }, updatedAt: '2026-09-19T10:00:00.000Z' },
  { gid: 'gid://shopify/Product/12', numericId: '12', type: 'product', title: 'Draft wax melt', handle: 'draft', status: 'DRAFT', isActive: false, bodyExcerpt: '', metadata: {}, updatedAt: '2026-09-22T10:00:00.000Z' },
  { gid: 'gid://shopify/Page/20', numericId: '20', type: 'page', title: 'About us', handle: 'about', status: 'published', isActive: true, bodyExcerpt: 'Our story.', metadata: {}, updatedAt: '2026-09-18T10:00:00.000Z' },
].map((e) => ({ ...e, canonicalUrl: `https://${DEV_STORE}/${e.type}s/${e.handle}` }))

const ACTIVE_PLAN = {
  ok: true, active: true, planHandle: 'regular', trialEndsAt: '2026-10-11T00:00:00.000Z',
  currentPeriodEnd: null, currentPeriodStart: null, cancelAtEndOfCycle: false,
}
const NO_PLAN = { ok: true, active: false, reason: 'no_subscription' }

const state = {
  admin: null as unknown,
  sessionUser: null as { id: string } | null,
  cookies: {} as Record<string, string>,
  /** 'baseline': the routes' hook call reduced to nothing, as the routes were before it. */
  hookMode: 'real' as 'real' | 'baseline',
  partner: NO_PLAN as unknown,
  partnerDelayMs: 0,
  /** The deadline each run was handed. */
  deadlines: [] as number[],
  grantedScopes: ALL_SCOPES,
  discoverDelayMs: 0,
  calls: { discover: 0, test: 0, identity: 0, exchange: 0, partner: 0, market: 0 },
  tokens: [] as string[],
  stageDeps: (): unknown => ({}),
}
/** What the routes handed to after(), in order. */
const scheduled: (() => Promise<void>)[] = []

const Module: any = require('module')
const origLoad = Module._load
Module._load = function (request: string, parent: any, isMain: boolean) {
  let resolved = request
  try {
    resolved = String(Module._resolveFilename(request, parent, isMain))
  } catch {
    /* virtual */
  }
  const from = String(parent?.filename ?? '')
  const real = () => origLoad.call(this, request, parent, isMain)
  if (resolved.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => state.admin }
  if (resolved.endsWith('lib/supabase/server.ts')) {
    return { createClient: async () => ({ auth: { getUser: async () => ({ data: { user: state.sessionUser }, error: null }) } }) }
  }
  if (request === 'next/headers') {
    return {
      cookies: async () => ({ get: (name: string) => (state.cookies[name] === undefined ? undefined : { name, value: state.cookies[name] }) }),
      headers: async () => new Headers(),
    }
  }
  if (request === 'next/server') return { ...real(), after: (task: () => Promise<void>) => void scheduled.push(task) }
  if (resolved.endsWith('lib/shopify/client.ts')) {
    return {
      ...real(),
      testShopifyConnection: async (creds: { accessToken: string; apiVersion: string }) => {
        state.calls.test++
        state.tokens.push(creds.accessToken)
        return { ok: true, status: 'connection_ok', shopName: SHOP_NAME, storefrontDomain: null, grantedScopes: state.grantedScopes, missingScopes: [], apiVersionRequested: creds.apiVersion, apiVersionActual: creds.apiVersion }
      },
      // The shop's market (a store in Canada, in English): read-only shop fields.
      getShopMarket: async (creds: { accessToken: string }) => {
        state.calls.market++
        state.tokens.push(creds.accessToken)
        return { country: 'CA', locale: 'en-CA' }
      },
      getShopIdentity: async (creds: { shopDomain: string }) => {
        state.calls.identity++
        return { shopGid: SHOP_GID, myshopifyDomain: creds.shopDomain }
      },
      discoverEntities: async (creds: { accessToken: string }) => {
        state.calls.discover++
        state.tokens.push(creds.accessToken)
        if (state.discoverDelayMs) await sleep(state.discoverDelayMs)
        const types = ['product', 'collection', 'page', 'blog', 'article']
        return { entities: DISCOVERED, perType: types.map((type) => ({ type, ok: true, fetched: DISCOVERED.filter((e) => e.type === type).length })), apiVersionActual: null }
      },
    }
  }
  if (resolved.endsWith('lib/shopify/oauth.ts')) {
    return {
      ...real(),
      exchangeCodeForToken: async () => {
        state.calls.exchange++
        return { accessToken: TOKEN, refreshToken: 'shprt_QA_REFRESH', expiresIn: 86_400, refreshTokenExpiresIn: 7_776_000, scope: state.grantedScopes.join(',') }
      },
    }
  }
  if (resolved.endsWith('lib/shopify/partner-client.ts')) {
    return {
      ...real(),
      getActiveShopifySubscription: async () => {
        state.calls.partner++
        if (state.partnerDelayMs) await sleep(state.partnerDelayMs)
        return state.partner
      },
    }
  }
  // The routes' view of the hook: the real one, or — for the baseline — nothing at all.
  if (resolved.endsWith('lib/seed-scan/shopify-install.ts') && /app\/api\/shopify\//.test(from)) {
    const mod = real()
    return {
      ...mod,
      get scheduleShopifySeedScan() {
        return state.hookMode === 'real' ? mod.scheduleShopifySeedScan : () => false
      },
    }
  }
  // The hook's run: the real runner, on the fake storefront, model and search.
  if (resolved.endsWith('lib/seed-scan/runner.ts') && from.endsWith('lib/seed-scan/shopify-install.ts')) {
    const mod = real()
    return {
      ...mod,
      runStageA: (args: any) => {
        state.deadlines.push(args.deadlineAt)
        return mod.runStageA({ ...args, deps: state.stageDeps() })
      },
    }
  }
  return real()
}

const fx = require('./_fixtures') as typeof import('./_fixtures')
const { encryptCredential } = require('../../security/credentials-crypto.ts') as typeof import('@/lib/security/credentials-crypto')
const { PENDING_LINK_COOKIE, signPendingLinkCookieValue } = require('../../shopify/pending-link.ts') as typeof import('@/lib/shopify/pending-link')
const { OAUTH_NONCE_COOKIE, signNonceCookie } = require('../../shopify/oauth.ts') as typeof import('@/lib/shopify/oauth')
const { readSummary } = require('../summary.ts') as typeof import('../summary')
const { SHOPIFY_WORK_WINDOW_MS } = require('../shopify-install.ts') as typeof import('../shopify-install')
const link = require('../../../app/api/shopify/link/complete/route.ts') as { POST: (r: Request) => Promise<Response> }
const home = require('../../../app/api/shopify/app-home/route.ts') as { GET: (r: Request) => Promise<Response> }
const sync = require('../../../app/api/shopify/sync/route.ts') as { POST: (r: Request) => Promise<Response> }
const callback = require('../../../app/api/shopify/oauth/callback/route.ts') as { GET: (r: Request) => Promise<Response> }

const { check, finish } = fx.makeChecker()
const { USER, PROJECT, SECRET } = fx
const APP = 'https://app.gotop.test'
const PENDING = 'a'.repeat(64)
const STATE = 'qa-oauth-state-0001'
const ENC_TOKEN = encryptCredential(TOKEN)
const ENC_REFRESH = encryptCredential('shprt_QA_REFRESH')
const MIN = 60_000
const iso = (msFromNow: number) => new Date(Date.now() + msFromNow).toISOString()

// ── Requests ────────────────────────────────────────────────────────────────

const b64url = (v: unknown) => Buffer.from(JSON.stringify(v)).toString('base64url')

/** An App Bridge session token for the store, signed with the app's secret (lib/shopify/session-token.ts verifies it). */
function sessionToken(shop: string): string {
  const now = Math.floor(Date.now() / 1000)
  const head = b64url({ alg: 'HS256', typ: 'JWT' })
  const body = b64url({ iss: `https://${shop}/admin`, dest: `https://${shop}`, aud: 'qa-client-id', sub: '1', exp: now + 60, nbf: now - 5, iat: now - 5, jti: 'qa', sid: 'qa' })
  const sig = crypto.createHmac('sha256', CLIENT_SECRET).update(`${head}.${body}`).digest('base64url')
  return `${head}.${body}.${sig}`
}

const homeRequest = () => new Request(`${APP}/api/shopify/app-home`, { headers: { authorization: `Bearer ${sessionToken(DEV_STORE)}` } })
const postJson = (path: string, body: unknown) =>
  new Request(`${APP}${path}`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

/** Shopify's redirect to the OAuth callback, HMAC-signed as Shopify signs it. */
function callbackRequest(): Request {
  const params: Record<string, string> = { code: 'qa-code', shop: DEV_STORE, state: STATE, timestamp: String(Math.floor(Date.now() / 1000)) }
  const message = Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&')
  params.hmac = crypto.createHmac('sha256', CLIENT_SECRET).update(message).digest('hex')
  return new Request(`${APP}/api/shopify/oauth/callback?${new URLSearchParams(params).toString()}`)
}

// ── Worlds ──────────────────────────────────────────────────────────────────

const shopTables = (): Tables => ({
  profiles: [{ id: USER, role: 'user' }],
  shopify_connections: [],
  shopify_entities: [],
  shopify_pending_installs: [],
  shopify_oauth_states: [],
  shopify_preauth_states: [],
  billing_governance: [],
  shopify_billing_migrations: [],
  subscriptions: [],
  generated_articles: [],
  wordpress_connections: [],
})

function makeWorld(extra: Tables) {
  const w = fx.world(fx.projectRow({ name: 'My store', target_domain: DEV_STORE, country: 'IL', language: 'he' }), { ...shopTables(), ...extra }, {}, () => new Date())
  const net = new fx.FakeNetwork(fx.lockedShopifySite401())
  const model = fx.fakeModel({ ok: true, insight: fx.EN_SHOP_INSIGHT })
  const search = fx.fakeSearch({ 'soy candles': ['boysmells.com', 'etsy.com'], 'hand poured candles': ['etsy.com'] })
  state.admin = w.fake
  state.stageDeps = () => ({ fetchImpl: net.fetch, insight: model.fn, search: search.fn })
  state.calls = { discover: 0, test: 0, identity: 0, exchange: 0, partner: 0, market: 0 }
  state.tokens = []
  state.discoverDelayMs = 0
  state.partnerDelayMs = 0
  state.deadlines = []
  state.grantedScopes = ALL_SCOPES
  return { ...w, net, model, search }
}
type World = ReturnType<typeof makeWorld>

/** An App Store install waiting to be linked: the pending row the managed install wrote. */
function appStoreWorld(role: 'user' | 'admin' = 'user'): World {
  return makeWorld({
    profiles: [{ id: USER, role }],
    shopify_pending_installs: [{
      token: PENDING, shop_domain: DEV_STORE, shop_gid: SHOP_GID, install_origin: 'shopify_app_store',
      access_token_encrypted: ENC_TOKEN, refresh_token_encrypted: ENC_REFRESH, access_token_expires_at: iso(60 * MIN), refresh_token_expires_at: iso(90 * 24 * 60 * MIN),
      oauth_app_edition: 'public', api_version: '2026-07', granted_scopes: ALL_SCOPES, storefront_domain: null,
      expires_at: iso(30 * MIN), consumed_at: null, created_at: iso(-MIN),
    }],
  })
}

/** A website merchant, in their trial, who started connecting their store from the dashboard. */
function websiteWorld(): World {
  return makeWorld({
    shopify_oauth_states: [{ state: STATE, user_id: USER, project_id: PROJECT, shop_domain: DEV_STORE, expires_at: iso(10 * MIN), used_at: null }],
    subscriptions: [{ id: 'sub-1', user_id: USER, status: 'trial', trial_ends_at: iso(7 * 24 * 60 * MIN), current_period_end: null, created_at: iso(-60 * MIN) }],
  })
}

// ── Driving a route ─────────────────────────────────────────────────────────

type Step = {
  name: string
  status: number
  location: string | null
  setCookie: string | null
  body: string
  routeLog: string
  tasks: number
  taskLog: string
  handlerMs: number
  taskMs: number
  /** The moment the handler returned: what the scan had done by then. */
  atReturn: { runs: number; discover: number; requests: number; model: number }
  /** When the request was made. */
  sentAt: number
}

/**
 * One request, then — as Next does after the response — each task it handed
 * to after(), in turn. `lost`: the function ends before its after() work runs
 * (a timeout, a crash), so the tasks are dropped unrun.
 */
async function drive(w: World, steps: Step[], name: string, handler: () => Promise<Response>, lost = false): Promise<void> {
  scheduled.length = 0
  const discoverBefore = state.calls.discover
  const t0 = Date.now()
  const { value: res, output: routeLog } = await fx.captureConsole(handler)
  const handlerMs = Date.now() - t0
  const atReturn = {
    runs: w.tables.project_seed_runs.length,
    discover: state.calls.discover - discoverBefore,
    requests: w.net.requests.length,
    model: w.model.calls.length,
  }
  const body = await res.text()
  const tasks = scheduled.splice(0)
  const t1 = Date.now()
  const { output: taskLog } = await fx.captureConsole(async () => {
    if (!lost) for (const task of tasks) await task()
  })
  steps.push({
    name, status: res.status, location: res.headers.get('location'), setCookie: res.headers.get('set-cookie'), body, routeLog,
    tasks: tasks.length, taskLog, handlerMs, taskMs: Date.now() - t1, atReturn, sentAt: t0,
  })
}

type Mode = 'baseline' | 'off' | 'on'
function setMode(mode: Mode) {
  state.hookMode = mode === 'baseline' ? 'baseline' : 'real'
  if (mode === 'on') process.env.ENABLE_SEED_SCAN = 'true'
  else delete process.env.ENABLE_SEED_SCAN
}

/** Link, the embedded app before and after the plan, again, then the Sync button. */
async function appStoreJourney(mode: Mode, opts: { slow?: boolean; slowRequest?: boolean; role?: 'user' | 'admin'; linkTaskLost?: boolean } = {}) {
  setMode(mode)
  const w = appStoreWorld(opts.role)
  const steps: Step[] = []
  state.sessionUser = { id: USER }
  state.cookies = { [PENDING_LINK_COOKIE]: signPendingLinkCookieValue(PENDING, CLIENT_SECRET) }
  await drive(w, steps, 'link', () => link.POST(postJson('/api/shopify/link/complete', { projectId: PROJECT })), opts.linkTaskLost)
  state.cookies = {}
  state.sessionUser = null
  state.partner = NO_PLAN
  await drive(w, steps, 'home, no plan yet', () => home.GET(homeRequest()))
  state.partner = ACTIVE_PLAN
  if (opts.slow) state.discoverDelayMs = 800
  if (opts.slowRequest) state.partnerDelayMs = 500
  await drive(w, steps, 'home, plan approved', () => home.GET(homeRequest()))
  state.discoverDelayMs = 0
  state.partnerDelayMs = 0
  await drive(w, steps, 'home, again', () => home.GET(homeRequest()))
  state.sessionUser = { id: USER }
  await drive(w, steps, 'sync', () => sync.POST(postJson('/api/shopify/sync', { projectId: PROJECT })))
  return { w, steps, calls: { ...state.calls }, tokens: [...state.tokens], deadlines: [...state.deadlines] }
}

/** The store connected from the dashboard (OAuth), then the Sync button. */
async function websiteJourney(mode: Mode, opts: { missingScopes?: boolean } = {}) {
  setMode(mode)
  const w = websiteWorld()
  const steps: Step[] = []
  if (opts.missingScopes) state.grantedScopes = ['read_products']
  state.sessionUser = { id: USER }
  state.cookies = { [OAUTH_NONCE_COOKIE]: signNonceCookie(STATE, CLIENT_SECRET) }
  await drive(w, steps, 'oauth callback', () => callback.GET(callbackRequest()))
  state.cookies = {}
  if (!opts.missingScopes) await drive(w, steps, 'sync', () => sync.POST(postJson('/api/shopify/sync', { projectId: PROJECT })))
  return { w, steps, calls: { ...state.calls }, tokens: [...state.tokens], deadlines: [...state.deadlines] }
}

// ── Comparing ───────────────────────────────────────────────────────────────

const ISO_TIME = /\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?(?:Z|[+-]\d{2}:\d{2})/g
const FAKE_ID = /fake-(?:conn|row|mig|token|lease)-\d+/g
/** Times, generated ids and ciphertexts (random IVs) differ between two identical runs; nothing else may. */
const norm = (v: unknown): string =>
  (typeof v === 'string' ? v : String(JSON.stringify(v, (k, x) => (/_encrypted$/.test(k) && x ? 'ENC' : x)))).replace(ISO_TIME, 'T').replace(FAKE_ID, 'ID')

const answer = (s: Step) => norm({ status: s.status, location: s.location, setCookie: s.setCookie, body: s.body })
const sameAnswers = (a: Step[], b: Step[]) => a.length === b.length && a.every((s, i) => answer(s) === answer(b[i]))
/** The paths at which two JSON values differ, leaf by leaf. */
function jsonDiff(a: unknown, b: unknown, path = ''): string[] {
  if (a && b && typeof a === 'object' && typeof b === 'object' && Array.isArray(a) === Array.isArray(b)) {
    const keys = [...new Set([...Object.keys(a as object), ...Object.keys(b as object)])]
    return keys.flatMap((k) => jsonDiff((a as any)[k], (b as any)[k], path ? `${path}.${k}` : k))
  }
  return norm(a) === norm(b) ? [] : [path]
}
const bodyDiff = (a: Step, b: Step): string[] => {
  try {
    return jsonDiff(JSON.parse(a.body), JSON.parse(b.body))
  } catch {
    return a.body === b.body ? [] : ['(body)']
  }
}
const changedTables = (a: Tables, b: Tables) => [...new Set([...Object.keys(a), ...Object.keys(b)])].filter((t) => norm(a[t] ?? []) !== norm(b[t] ?? [])).sort()
/** What the scan owns: its run, and the settings it fills (lib/seed-scan/settings.ts). */
const SCAN_TABLES = ['ai_visibility_competitors', 'project_audiences', 'project_profiles', 'project_seed_runs', 'project_seed_steps', 'projects']

async function main() {
  fx.installFakeDns()

  // ── 1. The App Store merchant ─────────────────────────────────────────────
  console.log('1) An App Store merchant: install and link, the embedded app before and after the plan, the Sync button')
  const base = await appStoreJourney('baseline')
  const off = await appStoreJourney('off')
  const on = await appStoreJourney('on', { slow: true })
  check('the baseline journey is what it always was: linked, the embedded app connected, synced',
    base.steps.map((s) => s.status).join() === '200,200,200,200,200' && JSON.parse(base.steps[0].body).success === true && JSON.parse(base.steps[4].body).ok === true,
    base.steps.map((s) => `${s.name}:${s.status}`).join(' '))

  check('OFF: every answer is the baseline\'s — status, redirect, cookies, body', sameAnswers(off.steps, base.steps),
    off.steps.map((s, i) => (answer(s) === answer(base.steps[i]) ? '=' : `${s.name}≠`)).join(' '))
  check('OFF: every route logs what it logged before', off.steps.every((s, i) => norm(s.routeLog) === norm(base.steps[i].routeLog)))
  check('OFF: the database ends exactly as in the baseline (the install unchanged)', changedTables(off.w.tables, base.w.tables).length === 0, changedTables(off.w.tables, base.w.tables).join(','))
  check('OFF: the embedded app hands nothing to after() (it knows the role); link and sync one task each',
    off.steps.map((s) => s.tasks).join() === '1,0,0,0,1', off.steps.map((s) => s.tasks).join())
  check('OFF: those tasks read the role, say nothing, and start nothing',
    off.steps.every((s) => s.taskLog === '') && off.w.tables.project_seed_runs.length === 0 && off.w.model.calls.length === 0 && off.w.net.requests.length === 0)
  check('OFF: Shopify is called exactly as in the baseline', JSON.stringify(off.calls) === JSON.stringify(base.calls), `${JSON.stringify(off.calls)} vs ${JSON.stringify(base.calls)}`)

  // The one thing the embedded app shows differently is what the scan was for:
  // a business name, empty until the run filled it (only an empty field is
  // ever filled — lib/seed-scan/settings.ts).
  const sameHead = (a: Step, b: Step) => a.status === b.status && a.location === b.location && a.setCookie === b.setCookie
  const againBody = JSON.parse(on.steps[3].body)
  check('ON: every answer is still the baseline\'s — until the run has filled the empty business name, the one field that then shows',
    on.steps.every((s, i) => sameHead(s, base.steps[i]) && (i === 3 || answer(s) === answer(base.steps[i])))
    && bodyDiff(on.steps[3], base.steps[3]).join() === 'project.businessName' && JSON.parse(base.steps[3].body).project.businessName === null
    && !!againBody.project.businessName && againBody.project.businessName === on.w.tables.projects[0].business_name,
    on.steps.map((s, i) => (answer(s) === answer(base.steps[i]) ? '=' : `${s.name}≠[${bodyDiff(s, base.steps[i]).join('|')}]`)).join(' '))
  check('ON: every route still logs what it logged before', on.steps.every((s, i) => norm(s.routeLog) === norm(base.steps[i].routeLog)))
  check('ON: each route hands one task to after()', on.steps.map((s) => s.tasks).join() === '1,1,1,1,1', on.steps.map((s) => s.tasks).join())
  check('ON: linked, but no plan chosen yet — not entitled, one line with that code, no run',
    /not started/.test(on.steps[0].taskLog) && on.steps[0].taskLog.includes('"code":"not_entitled"') && on.steps[1].taskLog.includes('"code":"not_entitled"'), on.steps[0].taskLog)
  const approved = on.steps[2]
  check('ON: the first load after the plan is approved starts the store\'s run', /\[seed-shopify\] run started/.test(approved.taskLog) && approved.taskLog.includes('"source":"app_home"'),
    approved.taskLog.split('\n').find((l) => l.includes('seed-shopify')))
  check('ON: the answer returned before the run began: no run, no sync, no storefront request, no model call',
    approved.atReturn.runs === 0 && approved.atReturn.discover === 0 && approved.atReturn.requests === 0 && approved.atReturn.model === 0, JSON.stringify(approved.atReturn))
  check('ON: with a slow sync (800ms) the answer still took no part of it',
    approved.taskMs >= 800 && approved.handlerMs < 400 && approved.handlerMs < approved.taskMs, `handler ${approved.handlerMs}ms, task ${approved.taskMs}ms`)
  check('ON: loaded again, and synced by hand: already seeded, silently', on.steps[3].taskLog === '' && on.steps[4].taskLog === '')

  const t = on.w.tables
  const run = t.project_seed_runs[0] ?? {}
  const steps = (step: string) => (t.project_seed_steps.find((r) => r.step === step) ?? {}) as Record<string, any>
  const s = readSummary(run.summary)
  check('ON: ONE run, trigger shopify_install, done', t.project_seed_runs.length === 1 && run.trigger === 'shopify_install' && run.status === 'done' && run.stage === 'a',
    JSON.stringify({ n: t.project_seed_runs.length, trigger: run.trigger, status: run.status }))
  check('ON: a1 read the catalog the store\'s own sync landed — its active products and collections only',
    steps('a1').detail?.catalog?.products?.map((p: { title: string }) => p.title).join() === 'Lavender soy candle,Cedar & sage candle'
    && steps('a1').detail?.catalog?.collections?.map((c: { title: string }) => c.title).join() === 'Soy candles', JSON.stringify(steps('a1').detail?.catalog))
  check('ON: the store is locked (a development store): not checked, not failed',
    steps('a1').detail?.storefront === 'locked' && s?.geo.state === 'unavailable' && s?.geo.unavailableReason === 'storefront_locked' && s?.findings.length === 0)
  check('ON: one model call, in English; the run\'s snapshot is English', on.w.model.calls.length === 1 && on.w.model.calls[0].locale === 'en' && s?.locale === 'en')
  check('ON: the shop\'s name came from Shopify once; the sync ran once for the run and once for the button',
    on.calls.test === 1 && on.calls.discover === 2 && base.calls.discover === 1 && steps('a1').detail?.shop?.name === SHOP_NAME, JSON.stringify(on.calls))
  check('ON: a project left at the form\'s IL / he is searched in the store\'s market (ca / en), and its country and language stay IL / he',
    on.w.search.calls.length > 0 && on.w.search.calls.every((c) => c.gl === 'ca' && c.hl === 'en') && on.calls.market === 1 && base.calls.market === 0
    && on.w.tables.projects[0].country === 'IL' && on.w.tables.projects[0].language === 'he', JSON.stringify(on.w.search.calls.map((c) => `${c.gl}/${c.hl}`)))
  check('ON: the Partner API is called exactly as in the baseline (the scan never asks it)', on.calls.partner === base.calls.partner && on.calls.partner === 3)
  check('ON: the database differs from the baseline only where the scan writes', changedTables(on.w.tables, base.w.tables).every((x) => SCAN_TABLES.includes(x)),
    changedTables(on.w.tables, base.w.tables).join(','))
  check('ON: the Admin API token was decrypted for Shopify\'s calls only — in no row and no log line',
    on.tokens.length === 4 && on.tokens.every((x) => x === TOKEN) && !JSON.stringify(t).includes(TOKEN) && !on.steps.some((x) => x.taskLog.includes(TOKEN) || x.routeLog.includes(TOKEN)))
  check('ON: no provider or database text in any log line', !on.steps.some((x) => x.taskLog.includes(SECRET) || /message|stack/i.test(x.taskLog)))

  // ── 2. The website merchant ───────────────────────────────────────────────
  console.log('\n2) A website merchant in their trial connects a store from the dashboard (OAuth), then presses Sync')
  const wBase = await websiteJourney('baseline')
  const wOff = await websiteJourney('off')
  const wOn = await websiteJourney('on')
  check('the baseline: connected (redirect to the content hub), then synced',
    wBase.steps[0].status === 307 && String(wBase.steps[0].location).includes('/content') && wBase.steps[1].status === 200, `${wBase.steps[0].status} ${wBase.steps[0].location}`)
  check('OFF: the same answers, log lines and database as the baseline',
    sameAnswers(wOff.steps, wBase.steps) && wOff.steps.every((x, i) => norm(x.routeLog) === norm(wBase.steps[i].routeLog)) && changedTables(wOff.w.tables, wBase.w.tables).length === 0,
    changedTables(wOff.w.tables, wBase.w.tables).join(','))
  check('OFF: one silent task per route, and no run', wOff.steps.map((x) => x.tasks).join() === '1,1' && wOff.steps.every((x) => x.taskLog === '') && wOff.w.tables.project_seed_runs.length === 0)
  check('ON: the same answers as the baseline', sameAnswers(wOn.steps, wBase.steps))
  check('ON: the callback\'s task starts the run (entitled by the trial); the Sync button\'s finds it seeded',
    /run started/.test(wOn.steps[0].taskLog) && wOn.steps[0].taskLog.includes('"source":"oauth"') && wOn.steps[1].taskLog === '' && wOn.w.tables.project_seed_runs.length === 1
    && wOn.w.tables.project_seed_runs[0].status === 'done', wOn.steps[0].taskLog)
  check('ON: the name the callback read is used — Shopify is not asked again',
    wOn.calls.test === wBase.calls.test && wOn.calls.test === 1 && (wOn.w.tables.project_seed_steps.find((r) => r.step === 'a1')?.detail as any)?.shop?.name === SHOP_NAME)
  check('ON: only the scan\'s own tables differ from the baseline', changedTables(wOn.w.tables, wBase.w.tables).every((x) => SCAN_TABLES.includes(x)), changedTables(wOn.w.tables, wBase.w.tables).join(','))

  const mBase = await websiteJourney('baseline', { missingScopes: true })
  const mOn = await websiteJourney('on', { missingScopes: true })
  check('a store connected without a required scope: the same warning redirect, and nothing handed to after()',
    mOn.steps[0].status === 307 && String(mOn.steps[0].location).includes('missing_scopes') && sameAnswers(mOn.steps, mBase.steps) && mOn.steps[0].tasks === 0 && mOn.w.tables.project_seed_runs.length === 0,
    `${mOn.steps[0].location} tasks=${mOn.steps[0].tasks}`)

  // ── 3. An administrator, the feature off ──────────────────────────────────
  console.log('\n3) An administrator\'s store with the feature off: the seed route\'s admin bypass, through the link and the embedded app')
  const admin = await appStoreJourney('off', { role: 'admin' })
  const adminRuns = admin.w.tables.project_seed_runs
  check('the link\'s task reads the role itself and starts the run — entitled as an administrator, before any plan',
    /run started/.test(admin.steps[0].taskLog) && admin.steps[0].taskLog.includes('"source":"link"') && adminRuns.length === 1 && adminRuns[0].status === 'done'
    && adminRuns[0].trigger === 'shopify_install' && admin.calls.partner === 0,
    `${admin.steps[0].taskLog.split('\n').find((l) => l.includes('seed-shopify'))} partner=${admin.calls.partner}`)
  check('the embedded app, knowing the role, hands each load to after(); every one finds the store seeded, silently',
    admin.steps.slice(1).every((x) => x.tasks === 1 && x.taskLog === '') && adminRuns.length === 1 && admin.w.model.calls.length === 1,
    admin.steps.map((x) => `${x.name}:${x.tasks}`).join(' '))
  const lost = await appStoreJourney('off', { role: 'admin', linkTaskLost: true })
  const lostRuns = lost.w.tables.project_seed_runs
  check('if the link\'s after() work is lost, the embedded app\'s first load starts the run instead — and only that one',
    lost.steps[0].taskLog === '' && /run started/.test(lost.steps[1].taskLog) && lost.steps[1].taskLog.includes('"source":"app_home"')
    && lost.steps.slice(2).every((x) => x.taskLog === '') && lostRuns.length === 1 && lostRuns[0].status === 'done' && lost.w.model.calls.length === 1,
    lost.steps.map((x) => `${x.name}:${x.taskLog.split('\n').find((l) => l.includes('seed-shopify')) ?? '-'}`).join(' '))

  // ── 4. The work window ────────────────────────────────────────────────────
  console.log('\n4) The run\'s window counts from the request\'s start: maxDuration covers the request and its after() work together')
  {
    const late = await appStoreJourney('on', { slowRequest: true })
    const slowLoad = late.steps[2]
    const deadline = late.deadlines[0] ?? 0
    check('a slow request (the Partner API took 500ms) leaves the run that much less: the window starts at the handler\'s first line',
      late.deadlines.length === 1 && slowLoad.handlerMs >= 500
      && deadline >= slowLoad.sentAt + SHOPIFY_WORK_WINDOW_MS && deadline <= slowLoad.sentAt + SHOPIFY_WORK_WINDOW_MS + 100,
      `deadline − request = ${deadline - slowLoad.sentAt}ms, handler ${slowLoad.handlerMs}ms`)
    check('…and the run still finished inside it', late.w.tables.project_seed_runs.length === 1 && late.w.tables.project_seed_runs[0].status === 'done')
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
export {}
