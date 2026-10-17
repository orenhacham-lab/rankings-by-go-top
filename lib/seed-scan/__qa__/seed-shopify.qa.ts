/**
 * W8 — the seeding scan's first run for a store that was just installed
 * (trigger 'shopify_install'), end to end over fixture stores.
 *
 * The hook (lib/seed-scan/shopify-install.ts) and the store's steps
 * (lib/seed-scan/shopify-steps.ts) run for real: the flag, the entitlement
 * gate, the caps, the single flight, the catalog read from shopify_entities,
 * the storefront read through the scan's own SSRF-safe fetchers against a fake
 * network, the one model call, the searches, the settings, the runner and the
 * cron's resume. Only the edges are fakes: the database (FakeAdmin), DNS and
 * sockets, the model, the search, and Shopify itself (the credential load, the
 * sync, the shop's name).
 *
 * Fixtures: a password-locked development store (401) and a locked store on
 * its own domain (200), a password page behind a proxy that strips Shopify's
 * headers and markup, a public store, an empty store, an unreachable
 * storefront; installs arriving together and one after another; the feature
 * off; every gate; the work window and the cron.
 *
 * Every source guard at the end carries a MUTATION CONTROL: the same guard run
 * on a deliberately broken copy of the source must fail.
 *
 * Run: npx tsx lib/seed-scan/__qa__/seed-shopify.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { isAdminUser } from '@/lib/auth/admin-role'
import { domainKey, type BusinessInsight, type InsightResult, type SiteSignals } from '@/lib/free-check'
import { resumeSeedRun, runStageA, type SeedRunResult } from '../runner'
import {
  INSTALL_WINDOW_MS,
  PREPARE_LEASE_MS,
  scheduleShopifySeedScan,
  SHOPIFY_WORK_WINDOW_MS,
  shopifySeedDeps,
  startShopifySeedScan,
  type ShopifySeedDeps,
  type ShopifySeedInput,
  type ShopifySeedOutcome,
} from '../shopify-install'
import {
  catalogText,
  MAX_COLLECTIONS,
  MAX_PRODUCTS,
  readShopInfo,
  readStoredCatalog,
  SHOPIFY_STAGE_A_EXECUTORS,
  STORE_MARKET_FALLBACK,
  storefrontTarget,
  storeMarket,
  storeSignals,
  type StoreCatalog,
} from '../shopify-steps'
import { getShopMarket } from '@/lib/shopify/client'
import { MAX_SEARCHES, STAGE_A_EXECUTORS } from '../steps'
import { createSeedRun } from '../store'
import { initialSummary, readSummary } from '../summary'
import { SEED_STEP_ERROR_CODES, type SeedScope, type SeedSummary } from '../types'
import { auditOwners } from './_owner-audit'
import {
  captureConsole,
  clock,
  dnsOverrides,
  EN_SHOP,
  EN_SHOP_INSIGHT,
  enShopifySite,
  FakeNetwork,
  fakeSearch,
  installFakeDns,
  lockedShopifySite200,
  lockedShopifySite401,
  makeChecker,
  NOW,
  OTHER_PROJECT,
  OTHER_USER,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
  type FakeRoute,
  type Tables,
} from './_fixtures'

const { check, finish } = makeChecker()
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')

const SCOPE: SeedScope = { projectId: PROJECT, userId: USER }
const ON = { ENABLE_SEED_SCAN: 'true' }
const CONN = 'cccccccc-cccc-4ccc-8ccc-cccccccccccc'
const OLD_CONN = 'dddddddd-dddd-4ddd-8ddd-dddddddddddd'
const NEW_CONN = 'eeeeeeee-eeee-4eee-8eee-eeeeeeeeeeee'
/** The store's Admin API token: Shopify's own calls may see it, nothing else may. */
const TOKEN = 'shpat_QA_TOKEN_NEVER_STORED'
const SHOP_NAME = 'Northwind Candles'
const DEV_STORE = 'dev-store-42.myshopify.com'
const MIN = 60_000
const HOUR = 60 * MIN
const DAY = 24 * HOUR

type Row = Record<string, unknown>

// ── The store ───────────────────────────────────────────────────────────────

function storeProject(over: Row = {}): Row {
  return projectRow({ name: 'My store', target_domain: DEV_STORE, country: 'US', language: 'en', ...over })
}

function connectionRow(over: Row = {}): Row {
  return {
    id: CONN,
    user_id: USER,
    project_id: PROJECT,
    shop_domain: DEV_STORE,
    storefront_domain: null,
    connection_status: 'connected',
    archived_at: null,
    // Ciphertext: the plaintext token exists only in what the credential load returns.
    access_token_encrypted: 'v1:qa-ciphertext',
    granted_scopes: ['read_products', 'read_content', 'write_content'],
    created_at: new Date(NOW.getTime() - 30 * MIN).toISOString(),
    ...over,
  }
}

let entitySeq = 0
function entity(type: 'product' | 'collection' | 'page', title: string, over: Row = {}): Row {
  entitySeq++
  return {
    id: `ent-${entitySeq}`,
    project_id: PROJECT,
    user_id: USER,
    connection_id: CONN,
    entity_type: type,
    shopify_gid: `gid://shopify/${type}/${entitySeq}`,
    title,
    handle: title.toLowerCase().replace(/\W+/g, '-'),
    canonical_url: null,
    status: 'ACTIVE',
    is_active: true,
    body_excerpt: null,
    metadata: {},
    // Newer first: the earlier a fixture row is made, the more recently it changed.
    shopify_updated_at: new Date(NOW.getTime() - entitySeq * MIN).toISOString(),
    ...over,
  }
}

/** Rows a1 must never read: a page, an archived product, another store's, another owner's, another project's. */
const NEVER_READ = ['About us', 'Discontinued wax melt', 'Old store product', 'Foreign product', 'Other project product']

/** The store's catalog as its sync left it, with the rows a1 must never read. */
function catalogRows(): Row[] {
  return [
    entity('collection', 'Soy candles', { body_excerpt: 'Hand-poured soy wax candles in reusable jars.' }),
    entity('collection', 'Gift sets'),
    entity('product', 'Lavender soy candle', {
      body_excerpt: 'Calming lavender, 45-hour burn.',
      metadata: { product_type: 'Candle', vendor: 'Northwind', tags: ['soy', 'lavender'] },
    }),
    entity('product', 'Cedar & sage candle', { metadata: { product_type: 'Candle', vendor: 'Northwind', tags: ['soy', 'woody'] } }),
    entity('product', 'Three-candle gift set', { metadata: { product_type: 'Gift set', vendor: 'Northwind', tags: [] } }),
    entity('page', 'About us'),
    entity('product', 'Discontinued wax melt', { is_active: false, status: 'ARCHIVED' }),
    entity('product', 'Old store product', { connection_id: OLD_CONN }),
    entity('product', 'Foreign product', { user_id: OTHER_USER }),
    entity('product', 'Other project product', { project_id: OTHER_PROJECT }),
  ]
}
const onlyNeverRead = () => catalogRows().filter((r) => NEVER_READ.includes(String(r.title)))

/** A store on its own domain behind a proxy that strips Shopify's headers: no Shopify evidence at all. */
const PROXIED = 'proxied-candles.com'
const PROXIED_PASSWORD_HTML = `<!doctype html><html lang="en"><head><title>Opening soon</title>
<meta name="viewport" content="width=device-width, initial-scale=1"></head>
<body><h1>Opening soon</h1><p>Be the first to know when we launch.</p>
<form method="post" action="/password" id="login_form"><input type="password" name="password"><button>Enter</button></form>
</body></html>`
function proxiedLockedSite(): Record<string, FakeRoute> {
  return {
    [`https://${PROXIED}/`]: { status: 302, headers: { location: `https://${PROXIED}/password` } },
    [`https://${PROXIED}/password`]: { status: 200, headers: { 'content-type': 'text/html; charset=utf-8' }, body: PROXIED_PASSWORD_HTML },
  }
}

// ── The model and the search ────────────────────────────────────────────────

type SeenCall = { locale: string; selfDomain: string; signals: SiteSignals }

/**
 * A model that answers `answer`, fixing what fetchBusinessInsight itself takes
 * from the page whatever the model says (business-insight.ts buildBusiness):
 * the platform off the markup, the language off `lang`, the contact off JSON-LD.
 */
function storeModel(answer: BusinessInsight | (() => Promise<InsightResult>) = EN_SHOP_INSIGHT) {
  const calls: SeenCall[] = []
  const fn = async (signals: SiteSignals, locale: string, selfDomain: string): Promise<InsightResult> => {
    calls.push({ locale, selfDomain, signals: JSON.parse(JSON.stringify(signals)) as SiteSignals })
    if (typeof answer === 'function') return answer()
    const business = {
      ...answer.business,
      platform: signals.platform ?? answer.business.platform,
      language: signals.htmlLang,
      address: signals.contact.address,
      phone: signals.contact.phone,
    }
    return { ok: true, insight: { ...answer, business } }
  }
  return { fn: fn as unknown as typeof import('@/lib/free-check').fetchBusinessInsight, calls }
}

const STORE_RESULTS: Record<string, string[]> = {
  'soy candles': ['boysmells.com', 'etsy.com', 'amazon.com'],
  'hand poured candles': ['etsy.com', 'amazon.com', 'reddit.com'],
}

// ── The harness ─────────────────────────────────────────────────────────────

type Access = { allowed: boolean; authority: string }
type HarnessOpts = {
  project?: Row
  connection?: Row | null
  entities?: Row[]
  extra?: Tables
  site?: Record<string, FakeRoute>
  env?: Record<string, string | undefined>
  role?: 'admin' | 'user'
  /** 'real': lib/subscription.ts explainAccess over the FakeAdmin, as in production. */
  access?: Access | 'real' | (() => Promise<Access>)
  syncLands?: Row[]
  syncOk?: boolean
  syncThrows?: boolean
  /** How far the run's clock moves while the sync runs. */
  syncClockMs?: number
  /** How long the sync really takes (wall clock). */
  syncWallMs?: number
  loadRefused?: boolean
  loadThrows?: boolean
  shopName?: string | null
  /** What the shop states of its market (lib/shopify/client.ts getShopMarket); 'throws' with provider text. */
  market?: { country: string | null; locale: string | null } | 'throws'
  model?: ReturnType<typeof storeModel>
  /** How far the run's clock moves on every storefront request. */
  netClockMs?: number
  deps?: Partial<ShopifySeedDeps>
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function harness(o: HarnessOpts = {}) {
  const clk = clock()
  const extra: Tables = {
    shopify_connections: o.connection === null ? [] : [o.connection ?? connectionRow()],
    shopify_entities: o.entities ?? catalogRows(),
    profiles: [{ id: USER, role: o.role ?? 'user' }],
    ...o.extra,
  }
  const w = world(o.project ?? storeProject(), extra)
  const net = new FakeNetwork(o.site ?? lockedShopifySite401())
  const fetchImpl: typeof fetch = async (input, init) => {
    if (o.netClockMs) clk.advance(o.netClockMs)
    return net.fetch(input, init)
  }
  const model = o.model ?? storeModel()
  const search = fakeSearch(STORE_RESULTS)
  const counts = { isAdmin: 0, access: 0, load: 0, sync: 0, shopName: 0, shopMarket: 0, runStage: 0 }
  const tokensSeen: string[] = []
  const deadlines: number[] = []
  const stageDeps = { fetchImpl, insight: model.fn, search: search.fn, now: clk.now }
  const overrides: Partial<ShopifySeedDeps> = {
    isAdmin: async (admin, userId) => {
      counts.isAdmin++
      return isAdminUser(admin, userId)
    },
    loadConnection: async (_admin, projectId) => {
      counts.load++
      if (o.loadThrows) throw new Error(`${SECRET}: credential store down`)
      const row = w.tables.shopify_connections.find((r) => r.project_id === projectId && r.archived_at == null)
      if (!row || o.loadRefused) return { error: 'No Shopify connection for this project', status: 404 as const, reason: 'no_shopify_connection' as const }
      return { connection: row as never, creds: { shopDomain: String(row.shop_domain), accessToken: TOKEN, apiVersion: '2025-07' } }
    },
    sync: async (_admin, loaded) => {
      counts.sync++
      tokensSeen.push(loaded.creds.accessToken)
      if (o.syncWallMs) await sleep(o.syncWallMs)
      if (o.syncClockMs) clk.advance(o.syncClockMs)
      if (o.syncThrows) throw new Error(`${SECRET}: Shopify answered 500`)
      for (const r of o.syncLands ?? []) w.tables.shopify_entities.push({ ...r })
      return { ok: o.syncOk ?? true }
    },
    shopName: async (creds) => {
      counts.shopName++
      tokensSeen.push(creds.accessToken)
      return o.shopName === undefined ? SHOP_NAME : o.shopName
    },
    shopMarket: async (creds) => {
      counts.shopMarket++
      tokensSeen.push(creds.accessToken)
      if (o.market === 'throws') throw new Error(`${SECRET}: Shopify answered 500`)
      return o.market ?? { country: 'US', locale: 'en-US' }
    },
    runStage: (args) => {
      counts.runStage++
      deadlines.push(args.deadlineAt)
      return runStageA({ ...args, deps: stageDeps })
    },
    now: clk.now,
    env: o.env ?? ON,
    ...o.deps,
  }
  if (o.access !== 'real') {
    const access = o.access ?? { allowed: true, authority: 'shopify' }
    overrides.access = async () => {
      counts.access++
      return typeof access === 'function' ? access() : access
    }
  }
  const deps = shopifySeedDeps(overrides)
  return { w, tables: w.tables, net, model, search, counts, tokensSeen, deadlines, stageDeps, clk, deps, overrides }
}
type Harness = ReturnType<typeof harness>

const input = (h: Harness, over: Partial<ShopifySeedInput> = {}): ShopifySeedInput => ({
  admin: h.w.admin,
  source: 'link',
  userId: USER,
  projectId: PROJECT,
  connectionId: CONN,
  ...over,
})

async function install(h: Harness, over: Partial<ShopifySeedInput> = {}, deadlineAt?: number) {
  const until = deadlineAt ?? h.clk.now().getTime() + SHOPIFY_WORK_WINDOW_MS
  return captureConsole(() => startShopifySeedScan(input(h, over), h.deps, until))
}

/** Every `.from()` from here on, counted. */
function countQueries(h: Harness): { n: number; tables: string[] } {
  const fake = h.w.fake as unknown as { from: (name: string) => unknown }
  const inner = fake.from.bind(fake)
  const seen = { n: 0, tables: [] as string[] }
  fake.from = (name: string) => {
    seen.n++
    seen.tables.push(name)
    return inner(name)
  }
  return seen
}

// ── Reading the world ───────────────────────────────────────────────────────

const runRow = (t: Tables) => (t.project_seed_runs[0] ?? {}) as Row
const stepRow = (t: Tables, step: string) => (t.project_seed_steps.find((s) => s.step === step) ?? {}) as Row
const detailOf = (t: Tables, step: string) => (stepRow(t, step).detail ?? {}) as Row
const summaryOf = (t: Tables) => readSummary(runRow(t).summary) as SeedSummary
const statusLine = (t: Tables) =>
  ['a1', 'a2', 'a3', 'a4'].map((s) => `${s}:${stepRow(t, s).status}${stepRow(t, s).error_code ? `(${stepRow(t, s).error_code})` : ''}`).join(' ')
const codeOf = (o: ShopifySeedOutcome) => (o.state === 'skipped' || o.state === 'failed' ? o.reason : o.state)
const isDone = (o: ShopifySeedOutcome) => o.state === 'started' && o.result.outcome === 'finished' && o.result.status === 'done'
/** a1's catalog; an empty one when a1 kept none, so a broken run fails its checks instead of the suite. */
const catalogOf = (t: Tables) => (detailOf(t, 'a1').catalog ?? { shopName: null, products: [], collections: [] }) as StoreCatalog
const titles = (list: { title: string }[] | undefined) => (list ?? []).map((x) => x.title).join(',')
const HEBREW = /[֐-׿]/

// ── Source guards ───────────────────────────────────────────────────────────

/** Comments go, code stays: strings, templates and regular expressions are kept whole. */
function stripComments(src: string): string {
  let out = ''
  let i = 0
  const stack: ({ kind: 'code'; braces: number } | { kind: 'tpl' })[] = [{ kind: 'code', braces: 0 }]
  let lastSig = ''
  const regexMayStart = () => {
    if (lastSig === '' || '(,=:[!&|?{};+-*%<>~^'.includes(lastSig)) return true
    return /(^|[^\w$])(return|typeof|case|in|of|delete|void|throw|new|await|yield)$/.test(out.trimEnd())
  }
  while (i < src.length) {
    const top = stack[stack.length - 1]
    const c = src[i]
    const n = src[i + 1]
    if (top.kind === 'tpl') {
      if (c === '\\') { out += c + (n ?? ''); i += 2; continue }
      if (c === '`') { stack.pop(); out += c; i++; lastSig = 'a'; continue }
      if (c === '$' && n === '{') { stack.push({ kind: 'code', braces: 0 }); out += '${'; i += 2; lastSig = '{'; continue }
      out += c; i++; continue
    }
    if (c === '/' && n === '/') { while (i < src.length && src[i] !== '\n') i++; continue }
    if (c === '/' && n === '*') { const end = src.indexOf('*/', i + 2); i = end < 0 ? src.length : end + 2; out += ' '; continue }
    if (c === "'" || c === '"') {
      let j = i + 1
      while (j < src.length && src[j] !== c && src[j] !== '\n') j += src[j] === '\\' ? 2 : 1
      out += src.slice(i, j + 1); i = j + 1; lastSig = 'a'; continue
    }
    if (c === '`') { stack.push({ kind: 'tpl' }); out += c; i++; continue }
    if (c === '/' && regexMayStart()) {
      let j = i + 1
      let inClass = false
      while (j < src.length && src[j] !== '\n') {
        if (src[j] === '\\') { j += 2; continue }
        if (src[j] === '[') inClass = true
        else if (src[j] === ']') inClass = false
        else if (src[j] === '/' && !inClass) break
        j++
      }
      j++
      while (j < src.length && /[a-z]/i.test(src[j])) j++
      out += src.slice(i, j); i = j; lastSig = 'a'; continue
    }
    if (c === '{') top.braces++
    if (c === '}') {
      if (top.braces === 0 && stack.length > 1) { stack.pop(); out += c; i++; continue }
      top.braces--
    }
    out += c
    if (!/\s/.test(c)) lastSig = c
    i++
  }
  return out
}

const ROUTES = {
  link: 'app/api/shopify/link/complete/route.ts',
  oauth: 'app/api/shopify/oauth/callback/route.ts',
  home: 'app/api/shopify/app-home/route.ts',
  sync: 'app/api/shopify/sync/route.ts',
} as const
type RouteName = keyof typeof ROUTES

/** Who the run belongs to, as each route verified it — never the request body. */
const OWNER_ARGS: Record<RouteName, string> = {
  link: 'userId: user.id, projectId, connectionId: linked.connectionId',
  oauth: 'userId: auth.project.user_id, projectId: auth.project.id, connectionId: claim.connectionId',
  home: 'userId: connection.user_id, projectId: connection.project_id, connectionId: connection.id',
  sync: 'userId: auth.user.id, projectId: auth.project.id, connectionId: loaded.connection.id',
}

/** The hook's call in a route: one, handed to after(), never awaited, after the store is known to be connected. */
function routeOffenders(name: RouteName, raw: string): string[] {
  const src = stripComments(raw)
  const out: string[] = []
  const calls = src.match(/scheduleShopifySeedScan\(/g) ?? []
  if (calls.length !== 1) out.push(`${name}: ${calls.length} calls`)
  if (!/import \{[^}]*\bafter\b[^}]*\} from 'next\/server'/.test(src)) out.push(`${name}: after() is not next/server's`)
  if (/await\s+scheduleShopifySeedScan/.test(src)) out.push(`${name}: the answer waits for the hook`)
  if (/\b(startShopifySeedScan|runStageA|runSeedStage|createSeedRun)\b/.test(src)) out.push(`${name}: runs the scan itself`)
  const at = src.indexOf('scheduleShopifySeedScan(after, {')
  if (at < 0) return [...out, `${name}: not handed to after()`]
  const before = src.slice(0, at)
  const line = src.slice(src.lastIndexOf('\n', at) + 1, src.indexOf('\n', at))
  if (!line.includes(OWNER_ARGS[name])) out.push(`${name}: the owner is not the verified one`)
  // maxDuration covers the request and its after() work: the window counts from the handler's first line.
  if (!/export async function (GET|POST)\(request: Request\) \{\s*const startedAt = Date\.now\(\)\n/.test(src)) out.push(`${name}: the request's start is not taken first`)
  if (!/, startedAt \}\)\s*$/.test(line)) out.push(`${name}: the request's start is not passed`)
  switch (name) {
    case 'link':
      if (!/if \(status === 'connected'\) scheduleShopifySeedScan\(after, \{/.test(line)) out.push('link: also for a store that did not connect')
      if (!before.includes('if (!linked.ok)')) out.push('link: before the link is known to have landed')
      break
    case 'oauth':
      if (!/if \(missing\.length === 0\) \{\s*$/.test(before)) out.push('oauth: also for a store missing scopes')
      if (!before.includes('if (!claim.ok)')) out.push('oauth: before the claim is known to have landed')
      break
    case 'home':
      if (!/if \(connection\.connection_status === 'connected'\) \{\s*$/.test(before)) out.push('home: also for a store that is not connected')
      if (!line.includes(', isAdmin, startedAt })')) out.push('home: the role it already read is not passed')
      if (!before.includes('const isAdmin = await isAdminUser(admin, connection.user_id)')) out.push('home: the role is not the one read here')
      break
    case 'sync':
      if (!before.includes('if (!result.ok)')) out.push('sync: before the sync is known to have succeeded')
      if (src.indexOf('ok: true,', at) < 0) out.push('sync: not before the success answer')
      break
  }
  return out
}

/** shopify-install.ts: the gates are the existing ones, the work is in the task, the flag is exact. */
function hookOffenders(raw: string): string[] {
  const src = stripComments(raw)
  const out: string[] = []
  if ((src.match(/deps\.env\.ENABLE_SEED_SCAN !== 'true'/g) ?? []).length !== 2) out.push('the flag is not read exactly as the seed route reads it')
  if (!src.includes("if (deps.env.ENABLE_SEED_SCAN !== 'true' && input.isAdmin === false) return false")) out.push('off for a known non-admin still schedules')
  if (!/schedule\(async \(\) => \{\s*try \{\s*const outcome = await startShopifySeedScan\(/.test(src)) out.push('the work is not inside the scheduled task')
  const fnAt = src.indexOf('export function scheduleShopifySeedScan(')
  const schedAt = src.indexOf('schedule(async () =>', fnAt)
  if (fnAt < 0 || schedAt < 0 || /\bawait\b/.test(src.slice(fnAt, schedAt))) out.push('something is awaited before the task is handed over')
  for (const uses of ['explainAccess(userId, admin)', 'isAdminUser(admin, userId)', 'runShopifySync(admin, loaded.connection, loaded.creds)', 'loadShopifyConnection(admin, projectId)', 'checkSeedCaps(admin, scope, now, deps.env)', 'createSeedRun(admin, scope,', 'countProjectSeedRuns(admin, scope)']) {
    if (!src.includes(uses)) out.push(`does not use ${uses}`)
  }
  for (const never of ['createAdminClient(', 'fetch(', 'startSeedStageB', 'runSeedStage', "trigger: 'create'", "trigger: 'rescan'"]) {
    if (src.includes(never)) out.push(`uses ${never}`)
  }
  if (!src.includes("trigger: 'shopify_install'")) out.push('the run is not a shopify_install run')
  // Admin first (the role, or the flag), then the entitlement, then the caps, then the run.
  const order = ['deps.isAdmin(', 'countProjectSeedRuns(', 'readProject(', 'readConnection(', 'deps.access(', 'checkSeedCaps(', 'createSeedRun(', 'prepareStore(input', 'deps.runStage(']
  const body = src.slice(src.indexOf('export async function startShopifySeedScan('))
  const at = order.map((s) => body.indexOf(s))
  if (at.some((i) => i < 0) || at.some((i, k) => k > 0 && i < at[k - 1])) out.push(`the gates are out of order (${at.join(',')})`)
  return out
}

/** shopify-steps.ts: no model call, search or network of its own; catalog reads name the owner and the store. */
function storeStepOffenders(raw: string): string[] {
  const src = stripComments(raw)
  const out: string[] = []
  if (/\.insight\(|\.search\(|fetchImpl\(|\bfetch\(|createAdminClient\(/.test(src)) out.push('calls the model, a search or the network itself')
  for (const via of ['a1Live(view)', 'a2Live({', 'a3Live(ctx)', 'a4: a4Store']) if (!src.includes(via)) out.push(`does not go through ${via}`)
  // a4 is the ordinary a4, handed the store's market in place of the project's — a view, never a write.
  const a4At = src.indexOf('async function a4Store(')
  const a4Body = a4At >= 0 ? src.slice(a4At, src.indexOf('\n}\n', a4At)) : ''
  if (!a4Body.includes('const market = storeSearchMarket(ctx.details)')
    || !a4Body.includes('return STAGE_A_EXECUTORS.a4({ ...ctx, project: { ...ctx.project, country: market.country, language: market.language } })')) out.push('a4 does not search in the store\'s market')
  if (/\.from\('projects'\)|\.update\(|\.upsert\(|\.insert\(/.test(src)) out.push('writes the database itself')
  const from = src.indexOf(".from('shopify_entities')")
  const to = src.indexOf('.limit(limit)', from)
  const query = from >= 0 && to > from ? src.slice(from, to) : ''
  for (const f of [".eq('project_id', scope.projectId)", ".eq('user_id', scope.userId)", ".eq('is_active', true)", ".eq('connection_id', shop.connectionId)"]) {
    if (!query.includes(f)) out.push(`the catalog is read without ${f}`)
  }
  if (!src.includes("finished('skipped', 'store_empty'")) out.push('an empty store does not end as store_empty')
  return out
}

/** The log lines of the hook: ids and stable codes only. */
function hookLogOffenders(raw: string): string[] {
  const src = stripComments(raw)
  const out: string[] = []
  const keys = new Set(['runId', 'projectId', 'source', 'synced', 'state', 'code', 'error'])
  const values = /^(outcome\.(runId|synced|state)|input\.(projectId|source)|errorName\(err\)|code)$/
  const re = /console\.(log|warn|error|info)\(\s*'\[seed-shopify\][^']*',\s*\{([^}]*)\}\s*\)/g
  let calls = 0
  for (let m = re.exec(src); m; m = re.exec(src)) {
    calls++
    for (const pair of m[2].split(',').map((p) => p.trim()).filter(Boolean)) {
      const [k, v = k] = pair.split(':').map((p) => p.trim())
      if (!keys.has(k) || !values.test(v)) out.push(`logs ${pair}`)
    }
  }
  const all = (src.match(/console\.(log|warn|error|info)\(/g) ?? []).length
  if (all !== calls || calls < 3) out.push(`${all - calls} log lines of another shape (${calls} checked)`)
  return out
}

// ── The suite ───────────────────────────────────────────────────────────────

async function main() {
  installFakeDns()

  // ── 1. A locked development store with products and collections ──────────
  console.log('1) A password-locked development store (401), with products and collections: installed from the App Store')
  const s1 = harness()
  {
    const h = s1
    const { value: out, output } = await install(h)
    const t = h.tables
    const s = summaryOf(t)
    const a1 = detailOf(t, 'a1')
    const shop = a1.shop as Row
    const call = h.model.calls[0]
    const sig = call?.signals
    const json = JSON.stringify(h.model.calls)

    check('the install starts the store\'s run, and it finishes done', isDone(out), JSON.stringify(out))
    check('one run: trigger shopify_install, stage A, done, its lease dropped',
      t.project_seed_runs.length === 1 && runRow(t).trigger === 'shopify_install' && runRow(t).stage === 'a' && runRow(t).status === 'done' && runRow(t).lease_expires_at === null)
    check('a1 read the store, a2 understood it, a3 is "not checked", a4 searched', statusLine(t) === 'a1:done a2:done a3:skipped(storefront_locked) a4:done', statusLine(t))
    check('a1: the active products and collections of THIS store and owner, newest first',
      titles(catalogOf(t).products) === 'Lavender soy candle,Cedar & sage candle,Three-candle gift set' && titles(catalogOf(t).collections) === 'Soy candles,Gift sets',
      `${titles(catalogOf(t).products)} | ${titles(catalogOf(t).collections)}`)
    check('a1: its item count is the catalog read (3 + 2)', stepRow(t, 'a1').item_count === 5, String(stepRow(t, 'a1').item_count))
    check('a1: the storefront is locked, and nothing of it is kept',
      a1.mode === 'shopify' && a1.storefront === 'locked' && a1.storefrontLocked === true && a1.signals === null)
    check('a1: the shop as the install noted it — this connection, its name, its address',
      shop?.connectionId === CONN && shop?.name === SHOP_NAME && shop?.shopDomain === DEV_STORE, JSON.stringify(shop))
    check('snapshot: the store\'s own address (not /password), locked, no sitemap count, English',
      s.url === `https://${DEV_STORE}/` && s.storefrontLocked === true && s.sitemapUrlCount === null && s.locale === 'en' && s.domain === DEV_STORE, `${s.url} ${s.locale}`)
    check('only the home page and the password page were requested, on the store\'s own host',
      h.net.requests.length === 2 && h.net.requests[1] === `https://${DEV_STORE}/password` && h.net.hosts().join() === DEV_STORE, h.net.requests.join(','))
    check('ONE model call, in English, told the store itself', h.model.calls.length === 1 && call?.locale === 'en' && call?.selfDomain === DEV_STORE,
      `${h.model.calls.length} ${call?.locale} ${call?.selfDomain}`)
    check('the model reads the store: its name, its collections, its products',
      !!sig && sig.title === SHOP_NAME && sig.h1[0] === SHOP_NAME && sig.h2.includes('Soy candles') && sig.h2.includes('Gift sets')
      && sig.text.includes(`STORE: ${SHOP_NAME}`) && sig.text.includes('COLLECTIONS: Soy candles | Gift sets')
      && sig.text.includes('- Lavender soy candle (Candle; Northwind; tags: soy, lavender). Calming lavender, 45-hour burn.'), sig?.text.slice(0, 300))
    check('…as a Shopify store on its own address, with no page language guessed',
      sig?.platform === 'Shopify' && sig?.htmlLang === null && sig?.finalUrl === `https://${DEV_STORE}/`, `${sig?.platform} ${sig?.htmlLang} ${sig?.finalUrl}`)
    check('nothing of the password page, an archived product, another store, owner or project reaches the model',
      !json.includes('Opening soon') && NEVER_READ.every((x) => !json.includes(x)), NEVER_READ.filter((x) => json.includes(x)).join(','))
    check('snapshot: the business as the store states it — Shopify, and no language', s.business?.platform === 'Shopify' && s.business?.language === null && s.business?.companyName === SHOP_NAME,
      JSON.stringify(s.business))
    const p = t.projects[0]
    check('settings: the empty business name is filled; the country and language already chosen are kept',
      p.business_name === SHOP_NAME && p.country === 'US' && p.language === 'en', JSON.stringify(p))
    const profile = t.project_profiles[0]
    check('settings: the profile is written and each field marked scan (platform Shopify)',
      profile?.detected_platform === 'Shopify' && Object.values(profile?.field_sources as Record<string, string>).every((v) => v === 'scan'), JSON.stringify(profile))
    check('AI readiness: "not checked, the store is password protected" — not four failures',
      s.geo.state === 'unavailable' && s.geo.unavailableReason === 'storefront_locked' && s.geo.total === 0 && s.geo.passed === 0 && s.counters.geoTotal === 0, JSON.stringify(s.geo))
    check('no finding is reported for a locked storefront', s.findings.length === 0 && s.counters.fixes === 0 && stepRow(t, 'a3').error_code === 'storefront_locked')
    check(`a4: at most ${MAX_SEARCHES} searches, in the market the store states (us / en)`,
      h.search.calls.length === 3 && h.search.calls.length <= MAX_SEARCHES && h.search.calls.every((c) => c.gl === 'us' && c.hl === 'en'), JSON.stringify(h.search.calls))
    const comp = s.competitors.map((c) => `${c.domain}:${c.source}`).join(' ')
    check('a4: competitors are the ones the searches showed', comp === 'boysmells.com:model etsy.com:search amazon.com:search', comp)
    check('the catalog was already synced: no sync; the shop\'s name and market asked once each', h.counts.sync === 0 && h.counts.shopName === 1 && h.counts.shopMarket === 1 && h.counts.load === 1,
      JSON.stringify(h.counts))
    check('the Admin API token reached Shopify\'s own call only: in no row and no log line',
      h.tokensSeen.length === 2 && h.tokensSeen.every((x) => x === TOKEN) && !JSON.stringify(t).includes(TOKEN) && !output.includes(TOKEN))
    check('log lines carry ids and codes only: no shop name, product or store address',
      output.includes('[seed-scan]') && !output.includes(SHOP_NAME) && !output.includes('Lavender') && !output.includes(DEV_STORE), output.slice(0, 300))
    check('stage B is not started: the run stays at stage A, with no stage-B step',
      runRow(t).stage === 'a' && t.project_seed_steps.every((r) => String(r.step).startsWith('a')) && t.project_seed_steps.length === 4)
  }

  console.log('\n1b) A locked store on its own domain (200), connected from the website: the callback already knows its name')
  {
    const h = harness({
      project: storeProject({ target_domain: 'locked-candles.com' }),
      connection: connectionRow({ shop_domain: 'locked-candles.myshopify.com', storefront_domain: 'locked-candles.com' }),
      site: lockedShopifySite200(),
    })
    const { value: out } = await install(h, { source: 'oauth', shopName: '  Locked \n  Candles  ' })
    const t = h.tables
    const s = summaryOf(t)
    const shop = detailOf(t, 'a1').shop as Row
    check('the run is done: a1 locked, a2 understood the catalog, a3 not checked',
      isDone(out) && statusLine(t) === 'a1:done a2:done a3:skipped(storefront_locked) a4:done', statusLine(t))
    check('the name the callback had is used, cleaned; Shopify is not asked for it again', h.counts.shopName === 0 && shop?.name === 'Locked Candles', JSON.stringify(shop))
    check('the snapshot is the store\'s own address', s.url === 'https://locked-candles.com/' && s.storefrontLocked === true, s.url)
    check('the model reads the store under its own name',
      h.model.calls.length === 1 && h.model.calls[0]?.signals.title === 'Locked Candles' && h.model.calls[0]?.signals.finalUrl === 'https://locked-candles.com/')
    check('AI readiness is not checked, not failed', s.geo.state === 'unavailable' && s.geo.unavailableReason === 'storefront_locked' && s.findings.length === 0)
  }

  console.log('\n1c) A password page behind a proxy that strips Shopify\'s headers and markup')
  {
    const h = harness({
      project: storeProject({ target_domain: PROXIED }),
      connection: connectionRow({ shop_domain: 'proxied-candles.myshopify.com', storefront_domain: PROXIED }),
      site: proxiedLockedSite(),
    })
    const { value: out } = await install(h)
    const t = h.tables
    const s = summaryOf(t)
    check('a store just installed IS Shopify: its password page reads as locked', isDone(out) && detailOf(t, 'a1').storefront === 'locked' && s.storefrontLocked === true,
      statusLine(t))
    check('…so no finding of the password page, and AI readiness is "not checked"',
      s.findings.length === 0 && s.geo.state === 'unavailable' && s.geo.unavailableReason === 'storefront_locked')
    check('…and the page\'s own words never reach the model', h.model.calls.length === 1 && !JSON.stringify(h.model.calls).includes('Be the first to know'))

    // The control: the same page, for a project nobody said is a store (the rule for any site, unchanged).
    const c = harness({ project: storeProject({ target_domain: PROXIED }), site: proxiedLockedSite() })
    const created = await createSeedRun(c.w.admin, SCOPE, {
      trigger: 'create',
      stage: 'a',
      summary: initialSummary({ source: 'scan', domain: PROXIED, url: `https://${PROXIED}/`, locale: 'en' }),
      now: NOW,
    })
    if (!created.ok) throw new Error('createSeedRun')
    await captureConsole(() => runStageA({ admin: c.w.admin, scope: SCOPE, runId: created.run.id, lease: created.lease, deps: c.stageDeps }))
    check('CONTROL: with no evidence of Shopify, a run that does not know it is a store reads the page as the site (the old rule, unchanged)',
      summaryOf(c.tables).storefrontLocked === false && summaryOf(c.tables).geo.state === 'measured' && detailOf(c.tables, 'a1').mode === 'live')
  }

  // ── 2. A public store ─────────────────────────────────────────────────────
  console.log('\n2) A public store with products and collections: the storefront and the catalog together')
  {
    const h = harness({
      project: storeProject({ target_domain: EN_SHOP.target }),
      connection: connectionRow({ shop_domain: 'northwind-candles.myshopify.com', storefront_domain: 'www.northwind-candles.com' }),
      site: enShopifySite(),
    })
    const { value: out } = await install(h, { source: 'app_home', isAdmin: false })
    const t = h.tables
    const s = summaryOf(t)
    const a1 = detailOf(t, 'a1')
    const sig = h.model.calls[0]?.signals
    const text = sig?.text ?? ''
    check('the run is done, every step done', isDone(out) && statusLine(t) === 'a1:done a2:done a3:done a4:done', statusLine(t))
    check('a1: the storefront is public, its page kept for a2 and a3, its sitemaps counted',
      a1.storefront === 'public' && a1.storefrontLocked === false && (a1.signals as Row)?.finalUrl === EN_SHOP.home && (a1.sitemap as Row)?.count === 14, JSON.stringify(a1.sitemap))
    check('a1: and the catalog beside it (3 + 2)', catalogOf(t).products.length === 3 && catalogOf(t).collections.length === 2 && stepRow(t, 'a1').item_count === 5)
    check('snapshot: the storefront\'s own address and sitemap count', s.url === EN_SHOP.home && s.sitemapUrlCount === 14 && s.storefrontLocked === false, `${s.url} ${s.sitemapUrlCount}`)
    check('the model reads the storefront first, then the catalog',
      !!sig && sig.title === 'Northwind Candles — Hand-poured soy candles' && sig.h1.join() === 'Hand-poured soy candles'
      && sig.h2.includes('Bestsellers') && sig.h2.includes('Soy candles')
      && text.indexOf('Every Northwind candle is poured by hand') >= 0
      && text.indexOf('Every Northwind candle is poured by hand') < text.indexOf(`STORE: ${SHOP_NAME}`), text.slice(0, 200))
    check('…in the page\'s own language, as Shopify', sig?.htmlLang === 'en' && sig?.platform === 'Shopify' && s.business?.language === 'en' && s.business?.platform === 'Shopify')
    check('a3: the storefront is measured — four AI-readiness checks and its own findings',
      s.geo.state === 'measured' && s.geo.total === 4 && s.geo.signals.find((g) => g.id === 'llms')?.ok === true && s.findings.length > 0, JSON.stringify(s.geo).slice(0, 200))
    check('findings and checks are in English', !HEBREW.test(JSON.stringify(s.findings)) && !HEBREW.test(JSON.stringify(s.geo)))
    check('a4: three searches', h.search.calls.length === 3)
    check('no request left the store\'s host (the off-host sitemap child is never fetched)',
      h.net.requests.every((u) => domainKey(new URL(u)) === EN_SHOP.key) && !h.net.requests.some((u) => u.includes('evil-sitemaps')), h.net.hosts().join(','))
  }

  // ── 3. An empty store ─────────────────────────────────────────────────────
  console.log('\n3) An empty store: nothing to understand, and the model is never asked')
  {
    const h = harness({ entities: onlyNeverRead() })
    const { value: out } = await install(h)
    const t = h.tables
    const s = summaryOf(t)
    check('nothing synced yet: the store\'s sync runs once, and lands nothing', h.counts.sync === 1 && out.state === 'started' && out.synced === true)
    check('a1: locked, and an empty catalog (the rows it must never read do not count)',
      detailOf(t, 'a1').storefront === 'locked' && stepRow(t, 'a1').item_count === 0 && catalogOf(t).products.length === 0 && catalogOf(t).collections.length === 0)
    check('a2 ends as store_empty — a stable code — and NO model call', stepRow(t, 'a2').status === 'skipped' && stepRow(t, 'a2').error_code === 'store_empty' && h.model.calls.length === 0)
    check('store_empty is a documented step code', (SEED_STEP_ERROR_CODES as readonly string[]).includes('store_empty'))
    check('a3: not checked (locked); a4: nothing to search, no search spent',
      stepRow(t, 'a3').error_code === 'storefront_locked' && s.geo.state === 'unavailable' && stepRow(t, 'a4').error_code === 'no_seed_keywords' && h.search.calls.length === 0)
    check('the run is done, not failed', isDone(out), JSON.stringify(out))
    check('settings are left alone', t.project_profiles.length === 0 && t.projects[0].business_name === null && t.project_audiences.length === 0)
  }
  {
    const h = harness({ entities: [], project: storeProject({ target_domain: EN_SHOP.target }), site: enShopifySite() })
    const { value: out } = await install(h)
    const t = h.tables
    const sig = h.model.calls[0]?.signals
    check('an empty store with a public storefront: a2 reads the storefront alone (one model call)',
      isDone(out) && stepRow(t, 'a2').status === 'done' && h.model.calls.length === 1 && !!sig && !sig.text.includes('PRODUCTS:') && sig.title === 'Northwind Candles — Hand-poured soy candles')
    check('…and a3 measures it', summaryOf(t).geo.state === 'measured')
  }
  {
    dnsOverrides.set(DEV_STORE, 'fail')
    const h = harness({ entities: [] })
    const { value: out } = await install(h)
    const t = h.tables
    check('an empty store whose storefront cannot be reached: a1 fails site_unreachable and the run fails',
      out.state === 'started' && out.result.outcome === 'finished' && out.result.status === 'failed' && stepRow(t, 'a1').error_code === 'site_unreachable', statusLine(t))
    check('…the later steps say there was nothing to read, with no model call and no search',
      statusLine(t) === 'a1:failed(site_unreachable) a2:skipped(site_unreadable) a3:skipped(site_unreadable) a4:skipped(site_unreadable)'
      && h.model.calls.length === 0 && h.search.calls.length === 0, statusLine(t))
    dnsOverrides.delete(DEV_STORE)
  }
  {
    dnsOverrides.set(DEV_STORE, 'fail')
    const h = harness()
    const { value: out } = await install(h)
    const t = h.tables
    const s = summaryOf(t)
    const a1 = detailOf(t, 'a1')
    check('a store whose storefront cannot be reached still has its catalog: the run is done',
      isDone(out) && statusLine(t) === 'a1:done a2:done a3:skipped(site_unreachable) a4:done', statusLine(t))
    check('a1: the storefront "unavailable", with its code; the snapshot is not locked and counts no sitemap',
      a1.storefront === 'unavailable' && a1.storefrontCode === 'site_unreachable' && s.storefrontLocked === false && s.sitemapUrlCount === null && s.scannedAt === NOW.toISOString())
    check('a2: one model call, from the catalog, on the project\'s address', h.model.calls.length === 1 && h.model.calls[0]?.signals.finalUrl === `https://${DEV_STORE}/`)
    check('a3: not measured, which is not failing: no findings, no reason invented',
      s.geo.state === 'unavailable' && s.geo.unavailableReason === null && s.geo.total === 0 && s.findings.length === 0)
    dnsOverrides.delete(DEV_STORE)
  }

  // ── 4. The store made readable ────────────────────────────────────────────
  console.log('\n4) Nothing synced yet: the store\'s own sync, once, then the catalog it landed')
  {
    const h = harness({ entities: [], syncLands: catalogRows() })
    const { value: out } = await install(h)
    const t = h.tables
    check('the sync ran once and the run notes it', h.counts.sync === 1 && out.state === 'started' && out.synced === true)
    check('a1 reads what the sync landed — and still only this store\'s active rows',
      stepRow(t, 'a1').item_count === 5 && (h.model.calls[0]?.signals.text ?? '').includes('Lavender soy candle')
      && NEVER_READ.every((x) => !JSON.stringify(h.model.calls).includes(x)))
    check('the run is done', isDone(out))
  }
  {
    const h = harness({ entities: [], shopName: null })
    const { value: out } = await install(h, { source: 'sync' })
    check('from the sync route (which just synced): never a second sync', h.counts.sync === 0 && out.state === 'started' && out.synced === false)
    check('…its name asked, and a name Shopify does not give is simply absent', h.counts.shopName === 1 && (detailOf(h.tables, 'a1').shop as Row)?.name === null)
  }
  for (const c of [
    { name: 'the sync answers not ok', opts: { syncOk: false } as HarnessOpts },
    { name: 'the sync throws, with provider text', opts: { syncThrows: true } as HarnessOpts },
    { name: 'the credentials are refused', opts: { loadRefused: true } as HarnessOpts },
    { name: 'the credential load throws, with provider text', opts: { loadThrows: true } as HarnessOpts },
  ]) {
    const h = harness({ entities: [], ...c.opts })
    const { value: out, output } = await install(h)
    const t = h.tables
    check(`${c.name}: the run goes on with what is there (store_empty, no model call), the provider's words nowhere`,
      isDone(out) && out.state === 'started' && out.synced === false && stepRow(t, 'a2').error_code === 'store_empty' && h.model.calls.length === 0
      && !JSON.stringify(t).includes(SECRET) && !output.includes(SECRET), `${codeOf(out)} ${statusLine(t)}`)
  }
  // The credential loader reads by project alone (lib/shopify/api-auth.ts): what it hands back is
  // used only when it is the very connection, and the very owner, the run was created for.
  for (const c of [
    { name: 'the credentials loaded are another store\'s (the connection replaced meanwhile)', row: { id: NEW_CONN } },
    { name: 'the credentials loaded are another owner\'s', row: { user_id: OTHER_USER } },
  ]) {
    const h = harness({
      entities: [],
      deps: { loadConnection: async () => ({ connection: connectionRow(c.row) as never, creds: { shopDomain: DEV_STORE, accessToken: TOKEN, apiVersion: '2025-07' } }) },
    })
    const { value: out } = await install(h)
    const t = h.tables
    check(`${c.name}: never synced nor asked with them; the run goes on with what is there`,
      isDone(out) && out.state === 'started' && out.synced === false && h.counts.sync === 0 && h.counts.shopName === 0 && h.tokensSeen.length === 0
      && stepRow(t, 'a2').error_code === 'store_empty' && h.model.calls.length === 0, `${codeOf(out)} ${JSON.stringify(h.counts)}`)
  }

  // ── 5. One run per project ────────────────────────────────────────────────
  console.log('\n5) One automatic run per project: installs together, installs again, syncs again')
  {
    const h = harness({ entities: [], syncLands: catalogRows() })
    const outs = await Promise.all([
      install(h, { source: 'link' }),
      install(h, { source: 'app_home', isAdmin: false }),
      install(h, { source: 'oauth' }),
    ])
    const codes = outs.map((o) => codeOf(o.value))
    const t = h.tables
    check('three calls at once (link, embedded app, callback): ONE run', t.project_seed_runs.length === 1 && codes.filter((c) => c === 'started').length === 1, codes.join(','))
    check('…the others step aside (already seeded, or the run in progress)', codes.filter((c) => c !== 'started').every((c) => c === 'already_seeded' || c === 'run_in_progress'), codes.join(','))
    check('…one sync, one model call, at most three searches', h.counts.sync === 1 && h.model.calls.length === 1 && h.search.calls.length <= MAX_SEARCHES,
      JSON.stringify({ ...h.counts, model: h.model.calls.length, search: h.search.calls.length }))
    check('…and that run is done', runRow(t).status === 'done' && runRow(t).trigger === 'shopify_install')

    // Later: a reinstall (the old connection archived, a new one), a re-auth, a second sync, the embedded app loaded again.
    const conn = t.shopify_connections.find((r) => r.id === CONN) as Row
    conn.archived_at = NOW.toISOString()
    t.shopify_connections.push(connectionRow({ id: NEW_CONN, created_at: NOW.toISOString() }))
    const before = { runs: t.project_seed_runs.length, sync: h.counts.sync, model: h.model.calls.length, net: h.net.requests.length, search: h.search.calls.length }
    const q = countQueries(h)
    const later: string[] = []
    for (const over of [
      { source: 'link', connectionId: NEW_CONN },
      { source: 'oauth', connectionId: NEW_CONN },
      { source: 'sync', connectionId: NEW_CONN },
      { source: 'app_home', connectionId: NEW_CONN, isAdmin: false },
      { source: 'app_home', connectionId: NEW_CONN, isAdmin: false },
    ] as Partial<ShopifySeedInput>[]) {
      later.push(codeOf((await install(h, over)).value))
    }
    check('a reinstall, a re-auth, a second sync, the embedded app again: already seeded, every one', later.every((c) => c === 'already_seeded'), later.join(','))
    check('…no second run, sync, model call, search or storefront request',
      t.project_seed_runs.length === before.runs && h.counts.sync === before.sync && h.model.calls.length === before.model && h.net.requests.length === before.net && h.search.calls.length === before.search)
    check('…each stopped at its first query (the project\'s run count)', q.n === 5 && q.tables.every((x) => x === 'project_seed_runs'), `${q.n} ${q.tables.join(',')}`)
  }
  for (const c of [
    { name: 'a project already seeded from its address (onboarding, trigger create)', trigger: 'create', status: 'done' },
    { name: 'a project whose store run failed earlier', trigger: 'shopify_install', status: 'failed' },
    { name: 'a project with a run still going', trigger: 'create', status: 'running' },
  ]) {
    const h = harness({
      extra: {
        project_seed_runs: [{ id: 'run-before', project_id: PROJECT, user_id: USER, trigger: c.trigger, stage: 'a', status: c.status, created_at: new Date(NOW.getTime() - HOUR).toISOString(), lease_expires_at: c.status === 'running' ? new Date(NOW.getTime() + MIN).toISOString() : null }],
      },
    })
    const { value: out } = await install(h)
    check(`${c.name}: already seeded, nothing else read or run`, codeOf(out) === 'already_seeded' && h.tables.project_seed_runs.length === 1 && h.counts.access === 0 && h.counts.sync === 0)
  }

  // ── 6. The feature off ────────────────────────────────────────────────────
  console.log('\n6) ENABLE_SEED_SCAN off: nothing happens, for anyone but an administrator')
  {
    const h = harness({ env: {} })
    const before = JSON.stringify(h.tables)
    const q = countQueries(h)
    const { value: out, output } = await install(h)
    check('off, for a merchant: "off"', codeOf(out) === 'off')
    check('…after one read — the role — and nothing written', q.n === 1 && q.tables[0] === 'profiles' && JSON.stringify(h.tables) === before, q.tables.join(','))
    check('…no entitlement check, sync, name, storefront request, model call or search',
      h.counts.access === 0 && h.counts.sync === 0 && h.counts.shopName === 0 && h.net.requests.length === 0 && h.model.calls.length === 0 && h.search.calls.length === 0)
    check('…and not a log line', output === '', output)
  }
  {
    const h = harness({ env: {} })
    const q = countQueries(h)
    const { value: out } = await install(h, { source: 'app_home', isAdmin: false })
    check('off, where the route already read the role (the embedded app): not even a query', codeOf(out) === 'off' && q.n === 0 && h.counts.isAdmin === 0)
  }
  for (const flag of ['false', 'TRUE', '1', ' true']) {
    const h = harness({ env: { ENABLE_SEED_SCAN: flag } })
    const { value: out } = await install(h)
    check(`ENABLE_SEED_SCAN=${JSON.stringify(flag)} is off`, codeOf(out) === 'off' && h.tables.project_seed_runs.length === 0)
  }
  {
    const h = harness({ env: {}, role: 'admin' })
    const { value: out } = await install(h)
    check('off, for an administrator: the run starts, like the seed route\'s admin bypass', isDone(out) && h.tables.project_seed_runs.length === 1)
  }
  {
    const h = harness({ env: {}, deps: { isAdmin: async () => { throw new Error(SECRET) } } })
    const { value: out } = await install(h)
    check('off, and the role cannot be read: off (fails closed)', codeOf(out) === 'off' && h.tables.project_seed_runs.length === 0)
  }

  // ── 7. The gates ──────────────────────────────────────────────────────────
  console.log('\n7) The gates: entitlement (admin first), a new install, a connected store of this owner, the caps')
  const today = new Date(NOW.getTime() - HOUR).toISOString()
  const pastRun = (i: number, over: Row) => ({ id: `past-${i}`, project_id: OTHER_PROJECT, user_id: USER, trigger: 'create', stage: 'a', status: 'done', created_at: today, lease_expires_at: null, ...over })
  const gates: { name: string; opts: HarnessOpts; over?: Partial<ShopifySeedInput>; code: string }[] = [
    { name: 'an account that is not entitled (no plan chosen yet)', opts: { access: { allowed: false, authority: 'shopify' } }, code: 'not_entitled' },
    { name: 'an entitlement that cannot be read', opts: { access: { allowed: false, authority: 'unreadable' } }, code: 'entitlement_unavailable' },
    { name: 'a store connected eight days ago (not a new install)', opts: { connection: connectionRow({ created_at: new Date(NOW.getTime() - 8 * DAY).toISOString() }) }, code: 'not_new' },
    { name: 'a store whose connection failed (missing scopes)', opts: { connection: connectionRow({ connection_status: 'failed' }) }, code: 'not_connected' },
    { name: 'no store connection at all', opts: { connection: null }, code: 'no_connection' },
    { name: 'only an archived connection', opts: { connection: connectionRow({ archived_at: NOW.toISOString() }) }, code: 'no_connection' },
    { name: 'a stale call (another connection is live now)', opts: {}, over: { connectionId: OLD_CONN }, code: 'no_connection' },
    { name: 'a connection of another owner on this project', opts: { connection: connectionRow({ user_id: OTHER_USER }) }, code: 'no_connection' },
    { name: 'another user\'s project', opts: {}, over: { userId: OTHER_USER }, code: 'no_project' },
    { name: 'this user\'s tenth run today', opts: { extra: { project_seed_runs: Array.from({ length: 10 }, (_, i) => pastRun(i, {})) } }, code: 'user_daily_cap' },
    { name: 'the user cap from the environment', opts: { env: { ...ON, SEED_SCAN_USER_DAILY_CAP: '1' }, extra: { project_seed_runs: [pastRun(0, {})] } }, code: 'user_daily_cap' },
    { name: 'the global cap from the environment', opts: { env: { ...ON, SEED_SCAN_GLOBAL_DAILY_CAP: '2' }, extra: { project_seed_runs: [pastRun(0, { user_id: OTHER_USER }), pastRun(1, { user_id: OTHER_USER })] } }, code: 'global_daily_cap' },
  ]
  for (const g of gates) {
    const h = harness(g.opts)
    const { value: out } = await install(h, g.over)
    const runsOfProject = h.tables.project_seed_runs.filter((r) => r.project_id === PROJECT)
    check(`${g.name}: ${g.code}, no run, no sync, no request, no model call`,
      codeOf(out) === g.code && runsOfProject.length === 0 && h.counts.sync === 0 && h.counts.shopName === 0 && h.net.requests.length === 0 && h.model.calls.length === 0,
      `${codeOf(out)} runs=${runsOfProject.length} ${JSON.stringify(h.counts)}`)
  }
  {
    const h = harness({ connection: connectionRow({ created_at: new Date(NOW.getTime() - INSTALL_WINDOW_MS + MIN).toISOString() }) })
    const { value: out } = await install(h)
    check('a store connected a minute inside the seven-day window is a new install', isDone(out))
  }
  {
    const h = harness({ access: 'real', role: 'admin' })
    const { value: out } = await install(h)
    check('the real entitlement decision: an administrator first, whatever the plan', isDone(out))
  }
  {
    const h = harness({ access: 'real' })
    const { value: out } = await install(h)
    check('the real entitlement decision: a website account with no subscription is not entitled', codeOf(out) === 'not_entitled')
  }
  {
    const h = harness({ access: 'real', extra: { subscriptions: [{ id: 'sub-1', user_id: USER, status: 'trial', trial_ends_at: new Date(Date.now() + 7 * DAY).toISOString(), current_period_end: null, created_at: today }] } })
    const { value: out } = await install(h)
    check('the real entitlement decision: an account in its trial is entitled', isDone(out))
  }
  {
    const h = harness({ access: 'real', extra: { billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }] } })
    const { value: out } = await install(h)
    check('the real entitlement decision: an App Store account without an active Shopify plan is not entitled', codeOf(out) === 'not_entitled')
  }
  {
    const h = harness({ access: 'real', extra: { billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }] } })
    const conn = h.tables.shopify_connections[0]
    Object.assign(conn, { shopify_subscription_status: 'active', shopify_plan_handle: 'regular', shopify_billing_verified_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    const { value: out } = await install(h)
    check('…and entitled once its plan is active (the embedded app records it before it schedules)', isDone(out))
  }

  // ── 8. Owners ─────────────────────────────────────────────────────────────
  console.log('\n8) Every query names the owner the shop is linked to')
  {
    const h = harness({ entities: [...onlyNeverRead()], syncLands: catalogRows().filter((r) => !NEVER_READ.includes(String(r.title))) })
    const audit = auditOwners(h.w.fake)
    const { value: out } = await install(h)
    const ours = audit.ours()
    const files = [...new Set(ours.map((q) => q.file))].sort()
    check('the whole install and run completed', isDone(out))
    check('queries of the hook and of the store steps are among those audited',
      files.includes('lib/seed-scan/shopify-install.ts') && files.includes('lib/seed-scan/shopify-steps.ts'), files.join(','))
    const offenders = audit.offenders(USER)
    check(`no query of ours without the owner (${ours.length} audited)`, offenders.length === 0, offenders.join(' | '))
    const entityReads = ours.filter((q) => q.table === 'shopify_entities')
    check('every read of the catalog names this store\'s connection',
      entityReads.length >= 3 && entityReads.every((q) => q.calls.some((c) => c.op === 'eq' && c.args[0] === 'connection_id' && c.args[1] === CONN)), String(entityReads.length))
    check('the store\'s connection is read as the owner\'s, never by project alone',
      ours.filter((q) => q.table === 'shopify_connections').every((q) => q.calls.some((c) => c.op === 'eq' && c.args[0] === 'user_id' && c.args[1] === USER)))
  }

  // ── 9. Scheduling ─────────────────────────────────────────────────────────
  console.log('\n9) scheduleShopifySeedScan: the work is handed to after(), and the answer never waits for it')
  {
    const h = harness({ entities: [], syncLands: catalogRows(), syncWallMs: 600 })
    const tasks: (() => Promise<void>)[] = []
    const q = countQueries(h)
    const t0 = Date.now()
    const handed = scheduleShopifySeedScan((task) => tasks.push(task), input(h), h.overrides)
    const handMs = Date.now() - t0
    check('with the feature on it hands over one task, at once', handed === true && tasks.length === 1 && handMs < 50, `${handMs}ms`)
    check('…and nothing of the scan has happened yet: no query, no sync, no request, no run',
      q.n === 0 && h.counts.sync === 0 && h.net.requests.length === 0 && h.tables.project_seed_runs.length === 0)
    const t1 = Date.now()
    const { output } = await captureConsole(() => tasks[0]())
    const taskMs = Date.now() - t1
    check('the task does the work — a slow sync included — well after the hand-over', taskMs >= 600 && handMs < taskMs && runRow(h.tables).status === 'done', `${taskMs}ms`)
    check(`the run works inside the window: with no request start given, the deadline is ${SHOPIFY_WORK_WINDOW_MS / 1000}s from the hand-over`, h.deadlines[0] === NOW.getTime() + SHOPIFY_WORK_WINDOW_MS)
    check('one line says it started, with ids only', /\[seed-shopify\] run started/.test(output) && output.includes(String(runRow(h.tables).id)) && output.includes('"source":"link"')
      && !output.includes(SHOP_NAME) && !output.includes(DEV_STORE) && !output.includes(TOKEN), output.split('\n').find((l) => l.includes('seed-shopify')))
  }
  {
    // maxDuration covers the request and its after() work together: a request
    // that already took 90s leaves the run 90s less.
    const deadlineFor = async (startedAt: unknown) => {
      const h = harness()
      const tasks: (() => Promise<void>)[] = []
      scheduleShopifySeedScan((task) => tasks.push(task), input(h, { startedAt: startedAt as number }), h.overrides)
      await captureConsole(() => tasks[0]())
      return h.deadlines[0]
    }
    const slow = await deadlineFor(NOW.getTime() - 90_000)
    check('the window counts from the request\'s start: a 90s request leaves the run 90s less',
      slow === NOW.getTime() - 90_000 + SHOPIFY_WORK_WINDOW_MS, String(slow - NOW.getTime()))
    const future = await deadlineFor(NOW.getTime() + 60_000)
    const garbage = await deadlineFor(Number.NaN)
    check('a start in the future or not a number reads as the hand-over — never a longer window',
      future === NOW.getTime() + SHOPIFY_WORK_WINDOW_MS && garbage === NOW.getTime() + SHOPIFY_WORK_WINDOW_MS, `${future - NOW.getTime()} ${garbage - NOW.getTime()}`)
  }
  {
    const h = harness({ env: {} })
    const tasks: (() => Promise<void>)[] = []
    const handed = scheduleShopifySeedScan((task) => tasks.push(task), input(h, { source: 'app_home', isAdmin: false }), h.overrides)
    check('off, for a caller that knows this is no administrator: nothing is handed over', handed === false && tasks.length === 0)
  }
  {
    const h = harness({ env: {} })
    const tasks: (() => Promise<void>)[] = []
    const before = JSON.stringify(h.tables)
    const handed = scheduleShopifySeedScan((task) => tasks.push(task), input(h), h.overrides)
    const { output } = await captureConsole(() => tasks[0]())
    check('off, for a caller that does not know the role: one task, which reads the role and stops, silently',
      handed === true && tasks.length === 1 && JSON.stringify(h.tables) === before && output === '' && h.counts.isAdmin === 1)
  }
  {
    const h = harness()
    const { value: handed, output } = await captureConsole(async () =>
      scheduleShopifySeedScan(() => { throw new TypeError(`${SECRET}: after() outside a request`) }, input(h), h.overrides))
    check('after() itself throws: the hook returns false and never throws into the route', handed === false)
    check('…one line, with the error\'s name only', /\[seed-shopify\] not scheduled/.test(output) && output.includes('TypeError') && !output.includes(SECRET), output)
  }
  {
    const h = harness({ access: async () => { throw new Error(`${SECRET}: subscription store down`) } })
    const tasks: (() => Promise<void>)[] = []
    scheduleShopifySeedScan((task) => tasks.push(task), input(h), h.overrides)
    let rejected = false
    const { output } = await captureConsole(() => tasks[0]().catch(() => { rejected = true }))
    check('a crash inside the task never rejects after()', rejected === false)
    check('…it is one line, with the error\'s name only', /\[seed-shopify\] crashed/.test(output) && output.includes('"error":"Error"') && !output.includes(SECRET), output)
  }
  {
    const h = harness({ access: { allowed: false, authority: 'shopify' } })
    const tasks: (() => Promise<void>)[] = []
    scheduleShopifySeedScan((task) => tasks.push(task), input(h, { source: 'app_home', isAdmin: false }), h.overrides)
    const { output } = await captureConsole(() => tasks[0]())
    check('a skip that matters is one line with its code', /\[seed-shopify\] not started/.test(output) && output.includes('"code":"not_entitled"'), output)
  }
  {
    const tasks: (() => Promise<void>)[] = []
    scheduleShopifySeedScan((task) => tasks.push(task), input(s1, { source: 'app_home', isAdmin: false }), s1.overrides)
    const { output } = await captureConsole(() => tasks[0]())
    check('the steady state — the store already seeded — says nothing', output === '', output)
  }

  // ── 10. The work window and the cron ──────────────────────────────────────
  console.log('\n10) What does not fit in the route\'s window is the cron\'s, and the cron reads the store the same way')
  {
    // 20s left of the window: less than a1's own worst case (26s).
    const h = harness({ entities: [], syncLands: catalogRows(), syncClockMs: SHOPIFY_WORK_WINDOW_MS - 20_000 })
    const { value: out } = await install(h)
    const t = h.tables
    check('a slow sync leaves no room for a1: the run is handed back untouched (time_cap)',
      out.state === 'started' && out.result.outcome === 'stopped' && out.result.reason === 'time_cap' && runRow(t).status === 'running' && runRow(t).lease_expires_at === null
      && statusLine(t) === 'a1:pending a2:pending a3:pending a4:pending', statusLine(t))
    const resumed = await captureConsole(() => resumeSeedRun({ admin: h.w.admin, scope: SCOPE, runId: String(runRow(t).id), deps: h.stageDeps, quiet: true }))
    const r = resumed.value as SeedRunResult
    check('the cron resumes it with the store\'s steps: the catalog the sync landed, the store locked',
      r.outcome === 'finished' && r.status === 'done' && detailOf(t, 'a1').mode === 'shopify' && stepRow(t, 'a1').item_count === 5 && detailOf(t, 'a1').storefront === 'locked', statusLine(t))
    check('…one model call in all', h.model.calls.length === 1)
  }
  {
    const h = harness({ netClockMs: 3_000 })
    const { value: out } = await install(h, {}, NOW.getTime() + 26_001)
    const t = h.tables
    check('a1 fits, a2 does not: a1 is saved, the run handed back at a2',
      out.state === 'started' && out.result.outcome === 'stopped' && out.result.reason === 'time_cap' && statusLine(t) === 'a1:done a2:pending a3:pending a4:pending', statusLine(t))
    const r = (await captureConsole(() => resumeSeedRun({ admin: h.w.admin, scope: SCOPE, runId: String(runRow(t).id), deps: h.stageDeps, quiet: true }))).value as SeedRunResult
    check('the resumed a2 reads the catalog a1 saved, and asks the model once',
      r.outcome === 'finished' && r.status === 'done' && h.model.calls.length === 1 && !!h.model.calls[0]?.signals.text.includes('Cedar & sage candle')
      && statusLine(t) === 'a1:done a2:done a3:skipped(storefront_locked) a4:done', statusLine(t))
  }
  {
    const h = harness({ deps: { runStage: async () => { throw new Error(`${SECRET}: worker died`) } } })
    let crashed = false
    await captureConsole(() => startShopifySeedScan(input(h), h.deps, NOW.getTime() + SHOPIFY_WORK_WINDOW_MS).catch(() => { crashed = true }))
    const t = h.tables
    const runId = String(runRow(t).id)
    check('the worker dies after the run was created: the run keeps its prepare lease',
      crashed && runRow(t).status === 'running' && runRow(t).lease_expires_at === new Date(NOW.getTime() + PREPARE_LEASE_MS).toISOString())
    const early = clock(new Date(NOW.getTime() + PREPARE_LEASE_MS - MIN))
    const tooSoon = (await captureConsole(() => resumeSeedRun({ admin: h.w.admin, scope: SCOPE, runId, deps: { ...h.stageDeps, now: early.now }, quiet: true }))).value as SeedRunResult
    check('…so the cron leaves it alone while that lease holds', tooSoon.outcome === 'stopped' && tooSoon.reason === 'not_running')
    const late = clock(new Date(NOW.getTime() + PREPARE_LEASE_MS + MIN))
    const r = (await captureConsole(() => resumeSeedRun({ admin: h.w.admin, scope: SCOPE, runId, deps: { ...h.stageDeps, now: late.now }, quiet: true }))).value as SeedRunResult
    check('…and finishes it with the store\'s steps once it lapses', r.outcome === 'finished' && r.status === 'done' && detailOf(t, 'a1').mode === 'shopify' && h.model.calls.length === 1)
  }

  // ── 11. Pieces ────────────────────────────────────────────────────────────
  console.log('\n11) The pieces: the address read, the shop read back, the catalog\'s text, the store\'s signals')
  {
    const shop = { connectionId: CONN, name: SHOP_NAME, shopDomain: DEV_STORE, storefrontDomain: 'www.northwind-candles.com', market: null }
    check('the project\'s own address is what a1 reads', storefrontTarget('northwind-candles.com', shop) === 'northwind-candles.com')
    check('…falling back to the storefront, then the shop, only when the project has none usable',
      storefrontTarget('', shop) === 'www.northwind-candles.com' && storefrontTarget('localhost', { ...shop, storefrontDomain: null }) === DEV_STORE && storefrontTarget(null, null) === '')
    const back = readShopInfo({ shop: { connectionId: 42, name: '  Two \n Words ', shopDomain: 'not a host!', storefrontDomain: 'Shop.Example.COM' } })
    check('the shop is read back field by field: a malformed field is dropped, never trusted',
      back?.connectionId === null && back?.name === 'Two Words' && back?.shopDomain === null && back?.storefrontDomain === 'shop.example.com', JSON.stringify(back))
    check('…and no shop is null', readShopInfo({}) === null && readShopInfo(undefined) === null)
    const many: StoreCatalog = {
      shopName: SHOP_NAME,
      collections: Array.from({ length: MAX_COLLECTIONS }, (_, i) => ({ title: `Collection ${i}`, excerpt: null })),
      products: Array.from({ length: MAX_PRODUCTS }, (_, i) => ({ title: `Product ${i} ${'x'.repeat(100)}`, type: 'Candle', vendor: 'Northwind', tags: ['a', 'b'], excerpt: 'y'.repeat(160) })),
    }
    const text = catalogText(many)
    check('the catalog\'s text stays inside its share of the model\'s page text, line by line',
      text.length <= 3_800 && text.startsWith(`STORE: ${SHOP_NAME}`) && text.includes('- Product 0') && text.split('\n').every((l) => l.length <= 600), String(text.length))
    const stored = readStoredCatalog({ shopName: SHOP_NAME, products: [...many.products, ...many.products], collections: [{ title: 5 }, { title: 'Kept' }] })
    check('a stored catalog is re-read with its caps, a malformed entry dropped',
      stored?.products.length === MAX_PRODUCTS && titles(stored?.collections) === 'Kept' && readStoredCatalog('garbage') === null && readStoredCatalog({ products: [] }) === null)
    const sig = storeSignals(many, null, `https://${DEV_STORE}/`)
    check('the store\'s signals without a storefront: its name as the title, no language, Shopify, and at most 25 headings',
      sig.title === SHOP_NAME && sig.htmlLang === null && sig.platform === 'Shopify' && sig.h2.length <= 25 && sig.text === catalogText(many))
    check('a store has its own a1-a4 (a4: the ordinary searches, in the store\'s market)',
      (['a1', 'a2', 'a3', 'a4'] as const).every((k) => SHOPIFY_STAGE_A_EXECUTORS[k] !== STAGE_A_EXECUTORS[k]))
  }

  // ── 11b. The store's market ───────────────────────────────────────────────
  console.log('\n11b) a4 searches in the store\'s own market — never the project\'s form defaults (IL / he) — and writes no project field')
  const IL_HE = { country: 'IL', language: 'he' }
  const a4Detail = (t: Tables) => detailOf(t, 'a4')
  {
    const h = harness({ project: storeProject(IL_HE), market: { country: 'CA', locale: 'fr-CA' } })
    const { value: out } = await install(h)
    const t = h.tables
    check('a store in Canada, in French, on a project left at IL / he: every search is gl ca, hl fr',
      isDone(out) && h.search.calls.length === 3 && h.search.calls.every((c) => c.gl === 'ca' && c.hl === 'fr'), JSON.stringify(h.search.calls.map((c) => `${c.gl}/${c.hl}`)))
    check('…the market is noted on a1 as Shopify stated it, and on a4 as searched',
      JSON.stringify((detailOf(t, 'a1').shop as Row)?.market) === '{"country":"CA","language":"fr"}' && JSON.stringify(a4Detail(t).market) === '{"gl":"ca","hl":"fr"}',
      JSON.stringify(a4Detail(t).market))
    check('…and the project\'s own country and language are not written (IL / he, as the merchant left them)',
      t.projects[0].country === 'IL' && t.projects[0].language === 'he', JSON.stringify({ c: t.projects[0].country, l: t.projects[0].language }))
    check('…the market asked once, with the store\'s own credentials', h.counts.shopMarket === 1 && h.tokensSeen.every((x) => x === TOKEN))
  }
  for (const c of [
    { name: 'Shopify states no market', opts: { market: { country: null, locale: null } } as HarnessOpts },
    { name: 'the market query fails, with provider text', opts: { market: 'throws' } as HarnessOpts },
    { name: 'the credentials are refused (nothing asked)', opts: { loadRefused: true } as HarnessOpts },
  ]) {
    const h = harness({ project: storeProject(IL_HE), ...c.opts })
    const { value: out, output } = await install(h)
    const t = h.tables
    check(`${c.name}: US / en, never IL / he — and the project untouched`,
      isDone(out) && h.search.calls.length > 0 && h.search.calls.every((x) => x.gl === 'us' && x.hl === 'en') && t.projects[0].country === 'IL' && t.projects[0].language === 'he'
      && !JSON.stringify(t).includes(SECRET) && !output.includes(SECRET), JSON.stringify(h.search.calls.map((x) => `${x.gl}/${x.hl}`)))
  }
  {
    const h = harness({ project: storeProject(IL_HE), market: { country: 'DE', locale: null } })
    await install(h)
    check('a country with no locale: that country, in English', h.search.calls.every((x) => x.gl === 'de' && x.hl === 'en'), JSON.stringify(h.search.calls.map((x) => `${x.gl}/${x.hl}`)))
  }
  {
    // What does not fit is the cron's: the resumed a4 reads the market a1 noted.
    const h = harness({ project: storeProject(IL_HE), entities: [], syncLands: catalogRows(), syncClockMs: SHOPIFY_WORK_WINDOW_MS - 20_000, market: { country: 'GB', locale: 'en-GB' } })
    const { value: out } = await install(h)
    const r = (await captureConsole(() => resumeSeedRun({ admin: h.w.admin, scope: SCOPE, runId: String(runRow(h.tables).id), deps: h.stageDeps, quiet: true }))).value as SeedRunResult
    check('resumed by the cron: a4 still searches in the store\'s market (gb / en)',
      out.state === 'started' && r.outcome === 'finished' && r.status === 'done' && h.search.calls.length > 0 && h.search.calls.every((x) => x.gl === 'gb' && x.hl === 'en'), JSON.stringify(h.search.calls.map((x) => `${x.gl}/${x.hl}`)))
  }
  {
    // A run whose a1 noted no market (an older run, or a malformed field): US / en.
    const bad = readShopInfo({ shop: { connectionId: CONN, market: { country: 'Canada', language: 'fr' } } })
    check('a malformed market is dropped when read back', bad?.market === null, JSON.stringify(bad))
    check('what Shopify says, made the searches\' market: country upper-cased, the locale\'s language only, each part falling back on its own',
      JSON.stringify(storeMarket({ country: 'ca', locale: 'fr-CA' })) === '{"country":"CA","language":"fr"}'
      && JSON.stringify(storeMarket({ country: '*', locale: 'pt-BR' })) === '{"country":"US","language":"pt"}'
      && JSON.stringify(storeMarket({ country: 'JP', locale: 'english' })) === '{"country":"JP","language":"en"}'
      && JSON.stringify(storeMarket(null)) === JSON.stringify(STORE_MARKET_FALLBACK) && STORE_MARKET_FALLBACK.country === 'US' && STORE_MARKET_FALLBACK.language === 'en')
  }
  {
    // lib/shopify/client.ts getShopMarket, over a fake Shopify: the shop's own fields only.
    const creds = { shopDomain: DEV_STORE, accessToken: TOKEN, apiVersion: '2025-07' }
    const realFetch = globalThis.fetch
    const seen: { url: string; token: string | null; query: string }[] = []
    const answer = (replies: (Record<string, unknown> | number)[]) => {
      let i = 0
      globalThis.fetch = (async (url: string, init: RequestInit) => {
        const headers = new Headers(init.headers)
        seen.push({ url: String(url), token: headers.get('x-shopify-access-token'), query: String(JSON.parse(String(init.body)).query) })
        const r = replies[Math.min(i++, replies.length - 1)]
        return typeof r === 'number' ? new Response('{}', { status: r }) : new Response(JSON.stringify(r), { status: 200, headers: { 'content-type': 'application/json' } })
      }) as typeof fetch
    }
    try {
      answer([{ data: { shop: { billingAddress: { countryCodeV2: 'CA' }, primaryDomain: { localization: { country: 'CA', defaultLocale: 'fr-CA' } } } } }])
      const full = await getShopMarket(creds)
      check('getShopMarket: the shop\'s country and its primary domain\'s default locale, from its own admin endpoint',
        full.country === 'CA' && full.locale === 'fr-CA' && seen.length === 1 && seen[0].url === `https://${DEV_STORE}/admin/api/2025-07/graphql.json` && seen[0].token === TOKEN, JSON.stringify(full))
      check('…asking for shop fields only — no locales query, nothing that needs a scope the app lacks',
        /^\{ shop \{ billingAddress \{ countryCodeV2 \} primaryDomain \{ localization \{ country defaultLocale \} \} \} \}$/.test(seen[0].query), seen[0].query)
      seen.length = 0
      answer([{ errors: [{ message: 'Access denied for localization field.', extensions: { code: 'ACCESS_DENIED' } }] }, { data: { shop: { billingAddress: { countryCodeV2: 'AU' } } } }])
      const partial = await getShopMarket(creds)
      check('…the domain\'s localization refused: the address alone is asked, and its country kept',
        partial.country === 'AU' && partial.locale === null && seen.length === 2 && seen[1].query === '{ shop { billingAddress { countryCodeV2 } } }', JSON.stringify(partial))
      seen.length = 0
      answer([401])
      const none = await getShopMarket(creds)
      check('…refused altogether: nulls, never a throw', none.country === null && none.locale === null, JSON.stringify(none))
    } finally {
      globalThis.fetch = realFetch
    }
  }

  // ── 12. Source guards ─────────────────────────────────────────────────────
  console.log('\n12) Source guards, each with its mutation control')
  {
    const src = Object.fromEntries((Object.keys(ROUTES) as RouteName[]).map((n) => [n, read(ROUTES[n])])) as Record<RouteName, string>
    for (const n of Object.keys(ROUTES) as RouteName[]) {
      const off = routeOffenders(n, src[n])
      check(`${ROUTES[n]}: one call, handed to after(), never awaited, the verified owner, only once connected`, off.length === 0, off.join(' | '))
    }
    const call = (n: RouteName) => {
      const at = src[n].indexOf('scheduleShopifySeedScan(after, {')
      return src[n].slice(at, src[n].indexOf('\n', at))
    }
    check('MUTATION CONTROL: a link that did not connect still scheduling is caught',
      routeOffenders('link', src.link.replace("if (status === 'connected') scheduleShopifySeedScan", 'scheduleShopifySeedScan')).length > 0)
    const linkLine = src.link.split('\n').find((l) => l.includes('scheduleShopifySeedScan(after, {')) ?? ''
    check('MUTATION CONTROL: scheduling before the link is known to have landed is caught',
      linkLine !== '' && routeOffenders('link', src.link.replace(`${linkLine}\n`, '').replace('  if (!linked.ok) {', `${linkLine}\n  if (!linked.ok) {`)).length > 0)
    check('MUTATION CONTROL: the callback scheduling for a store missing scopes is caught',
      routeOffenders('oauth', src.oauth.replace('  if (missing.length === 0) {\n    scheduleShopifySeedScan', '  {\n    scheduleShopifySeedScan')).length > 0)
    check('MUTATION CONTROL: the owner taken from somewhere else is caught',
      routeOffenders('oauth', src.oauth.replace('userId: auth.project.user_id, projectId', 'userId: st.user_id, projectId')).length > 0)
    check('MUTATION CONTROL: the embedded app not passing the role it read is caught',
      routeOffenders('home', src.home.replace(', isAdmin, startedAt })', ', startedAt })')).length > 0)
    check('MUTATION CONTROL: a route not passing the request\'s start is caught',
      routeOffenders('sync', src.sync.replace(', startedAt })', ' })')).length > 0)
    check('MUTATION CONTROL: the start taken at the hand-over instead of the handler\'s first line is caught',
      routeOffenders('link', src.link.replace('  const startedAt = Date.now()\n', '').replace("  if (status === 'connected') scheduleShopifySeedScan", "  const startedAt = Date.now()\n  if (status === 'connected') scheduleShopifySeedScan")).length > 0)
    check('MUTATION CONTROL: the embedded app scheduling for a store that is not connected is caught',
      routeOffenders('home', src.home.replace("  if (connection.connection_status === 'connected') {\n    scheduleShopifySeedScan", '  {\n    scheduleShopifySeedScan')).length > 0)
    check('MUTATION CONTROL: a sync route awaiting the hook is caught',
      routeOffenders('sync', src.sync.replace('    scheduleShopifySeedScan(after', '    await scheduleShopifySeedScan(after')).length > 0)
    check('MUTATION CONTROL: a second call is caught',
      routeOffenders('sync', src.sync.replace('    return Response.json({\n      ok: true,', `    ${call('sync')}\n    return Response.json({\n      ok: true,`)).length > 0)
    check('MUTATION CONTROL: a route running the scan itself is caught',
      routeOffenders('link', `${src.link}\nconst x = () => runStageA({})`).length > 0)

    const hook = read('lib/seed-scan/shopify-install.ts')
    const hookOff = hookOffenders(hook)
    check('shopify-install.ts: the exact flag, the existing gates in order, the work inside the task, a shopify_install run', hookOff.length === 0, hookOff.join(' | '))
    check('MUTATION CONTROL: a flag read loosely is caught', hookOffenders(hook.replace("if (deps.env.ENABLE_SEED_SCAN !== 'true') {", 'if (!deps.env.ENABLE_SEED_SCAN) {')).length > 0)
    check('MUTATION CONTROL: work done before the hand-over is caught',
      hook.includes('    const deadlineAt = startedAt + SHOPIFY_WORK_WINDOW_MS\n')
      && hookOffenders(hook.replace('    const deadlineAt = startedAt + SHOPIFY_WORK_WINDOW_MS\n', '    const deadlineAt = startedAt + SHOPIFY_WORK_WINDOW_MS\n    await deps.isAdmin(input.admin, input.userId)\n')).length > 0)
    check('MUTATION CONTROL: the caps checked before the entitlement is caught',
      hookOffenders(hook.replace('  const access = await deps.access(admin, userId)', '  await checkSeedCaps(admin, scope, deps.now(), deps.env)\n  const access = await deps.access(admin, userId)')).length > 0)
    check('MUTATION CONTROL: a run of another trigger is caught', hookOffenders(hook.replace("trigger: 'shopify_install'", "trigger: 'create'")).length > 0)
    check('MUTATION CONTROL: stage B started from here is caught', hookOffenders(`${hook}\nconst b = () => startSeedStageB`).length > 0)

    const steps = read('lib/seed-scan/shopify-steps.ts')
    const stepsOff = storeStepOffenders(steps)
    check('shopify-steps.ts: the live steps\' own model call, searches and fetchers; the catalog of this owner\'s store', stepsOff.length === 0, stepsOff.join(' | '))
    check('MUTATION CONTROL: a second model call site is caught', storeStepOffenders(`${steps}\nconst again = (ctx: StepContext) => ctx.deps.insight(null as never, 'en', '')`).length > 0)
    check('MUTATION CONTROL: a catalog read without the connection is caught',
      storeStepOffenders(steps.replace("    if (shop?.connectionId) query = query.eq('connection_id', shop.connectionId)\n", '')).length > 0)
    check('MUTATION CONTROL: an empty store asking the model anyway is caught',
      storeStepOffenders(steps.replace("finished('skipped', 'store_empty'", "finished('skipped', 'site_unreadable'")).length > 0)
    check('MUTATION CONTROL: a4 searching in the project\'s market is caught',
      storeStepOffenders(steps.replace('country: market.country, language: market.language', 'country: ctx.project.country, language: ctx.project.language')).length > 0)
    check('MUTATION CONTROL: the store\'s steps writing the project is caught',
      storeStepOffenders(`${steps}\nconst w = (ctx: StepContext) => ctx.admin.from('projects').update({ country: 'US' })`).length > 0)

    // lib/shopify/client.ts getShopMarket: the shop's own fields, read only — no locales query (read_locales is not a scope the app has).
    const client = stripComments(read('lib/shopify/client.ts'))
    const marketOffenders = (src: string): string[] => {
      const at = src.indexOf('export async function getShopMarket(')
      const body = at >= 0 ? src.slice(at, src.indexOf('\n}\n', at)) : ''
      const out: string[] = []
      if (!body) out.push('no getShopMarket')
      if (/shopLocales|locales\s*\{|mutation|markets?\s*\(|fetch\(/.test(body)) out.push('asks for more than the shop\'s own fields')
      const queries = body.match(/`\{ shop \{[^`]*`/g) ?? []
      if (queries.length !== 2) out.push(`${queries.length} shop queries`)
      return out
    }
    const mOff = marketOffenders(client)
    check('client.ts getShopMarket: two read-only shop queries, no locales query', mOff.length === 0, mOff.join(' | '))
    check('MUTATION CONTROL: a locales query (a scope the app lacks) is caught',
      marketOffenders(client.replace('primaryDomain { localization { country defaultLocale } }', 'shopLocales { locale primary }')).length > 0)

    const logOff = hookLogOffenders(hook)
    check('shopify-install.ts logs ids and stable codes only', logOff.length === 0, logOff.join(' | '))
    check('MUTATION CONTROL: a log line carrying the shop\'s name is caught',
      hookLogOffenders(hook.replace('source: input.source, synced: outcome.synced', 'source: input.source, synced: outcome.synced, shop: input.shopName')).length > 0)
    check('MUTATION CONTROL: a log line carrying the raw error is caught',
      hookLogOffenders(hook.replace("source: input.source, error: errorName(err) })\n      }\n    })", "source: input.source, error: err })\n      }\n    })")).length > 0)

    const runner = stripComments(read('lib/seed-scan/runner.ts'))
    const pick = /const executors = run\.trigger === 'shopify_install' \? SHOPIFY_STAGE_A_EXECUTORS : STAGE_A_EXECUTORS\s*outcome = await executors\[/
    check('runner.ts picks the store\'s executors by the run\'s trigger, for every stage-A step', pick.test(runner))
    check('MUTATION CONTROL: a runner that ignores the trigger is caught', !pick.test(runner.replace("run.trigger === 'shopify_install' ?", "run.trigger === 'never' ?")))
    const a1Src = stripComments(read('lib/seed-scan/steps.ts'))
    const known = /isLockedStorefront\(\{ trace, html: fetched\?\.html \?\? null, siteHost: start\.hostname, knownShopify: ctx\.trigger === 'shopify_install' \}\)/
    check('steps.ts: only a shopify_install run is told the site is Shopify', known.test(a1Src) && (a1Src.match(/knownShopify/g) ?? []).length === 1)
    check('MUTATION CONTROL: every run told it is Shopify is caught', !known.test(a1Src.replace("knownShopify: ctx.trigger === 'shopify_install'", 'knownShopify: true')))
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})
export {}
