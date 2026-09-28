/* eslint-disable @typescript-eslint/no-require-imports -- plain Node CJS scripts, run with `node`, never bundled. */
/**
 * A minimal stand-in for the Supabase REST + Auth API, good enough to drive the
 * real application end to end in a browser without any network egress.
 *
 * It exists to make ONE production fact reproducible locally: PostgREST answers
 * an `authenticated` caller reading public.billing_governance with SQLSTATE
 * 42501, because the table is REVOKEd from that role. The stub therefore
 * decides the role from the bearer key, exactly as Supabase does — the service
 * key sees the table, the anon key is refused. Every other table is readable by
 * both, which is why page reads stayed healthy during the incident.
 */
const http = require('http')
const { URL } = require('url')
const { randomUUID } = require('crypto')

// No ANON constant: ANY key that is not the service key is `authenticated`,
// which is how Supabase behaves — an unrecognised key is not privileged.
const SERVICE = process.env.STUB_SERVICE_KEY || 'stub-service-key'
const PORT = Number(process.env.STUB_PORT || 5555)

const USER_ID = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const PROJECT_ID = 'a1111111-2222-3333-4444-555555555555'
const SHOP = 'go-top-seo-test.myshopify.com'
const EMAIL = 'reviewer@example.com'
const now = () => Date.now()
const iso = (ms) => new Date(ms).toISOString()

// ── Search Console (lib/gsc) ─────────────────────────────────────────────────
// Two fixtures of the tables the Search Console widgets read (status, metrics
// and opportunities routes):
//   disconnected — the default, what every journey starts from: the merchant
//                  never connected Google, so every one of them is empty;
//   connected    — one Google connection for the user, a property assigned to
//                  the project, ten weekly 28-day syncs with their property
//                  totals, and the query+page rows of the latest sync.
// /__stub/fixture?gsc=connected|disconnected swaps them in and leaves every
// other table as it is, so a journey can connect halfway through.
//
// The syncs are stored NEWEST FIRST: the app reads the latest one with
// order(started_at desc).limit(1), and this stub honours `limit` but not `order`.
const DAY_MS = 86_400_000
const GSC_SITE = `https://${SHOP}`
/** [query, path, clicks, impressions, position] of the latest sync. `shopify` is the
 *  keyword journey.js adds, so its row in the keywords table has figures. */
const GSC_ROWS = [
  ['shopify', '/', 120, 3400, 6.2],
  ['shopify', '/pages/about', 8, 310, 14.1],
  ['go top test', '/', 55, 130, 1.2],
  ['running shoes', '/collections/running-shoes', 96, 5200, 8.4],
  ['trail running shoes', '/collections/running-shoes', 41, 2300, 11.7],
  ['trail runner 2', '/products/trail-runner-2', 64, 900, 3.1],
  ['how to choose running shoes', '/blogs/news/how-to-choose-running-shoes', 37, 4100, 9.8],
  ['best running shoes for flat feet', '/blogs/news/running-shoes-for-flat-feet', 22, 3100, 12.6],
  ['merino running socks', '/products/merino-running-socks', 18, 760, 7.4],
  ['running socks', '/products/merino-running-socks', 6, 820, 16.2],
]
/** Property totals of the ten syncs, newest first (they include anonymised queries,
 *  so they are larger than the sum of the rows, as in Search Console). */
const GSC_TOTALS = [
  [905, 28750, 11.6], [850, 27400, 12.0], [790, 26100, 12.5], [800, 25600, 12.4], [760, 24400, 12.8],
  [720, 23900, 13.1], [690, 23100, 13.6], [700, 22500, 13.5], [655, 21800, 13.9], [640, 21000, 14.2],
]

function gscTables(state) {
  if (state !== 'connected') {
    return { gsc_connections: [], project_gsc_properties: [], gsc_sync_runs: [], gsc_query_page_metrics: [] }
  }
  const day = (ms) => iso(ms).slice(0, 10)
  // Search Console data ends a few days before the sync that reads it.
  const latestEnd = now() - 3 * DAY_MS
  const runs = GSC_TOTALS.map(([clicks, impressions, position], i) => {
    const end = latestEnd - 7 * i * DAY_MS
    return { id: `gsc-run-${i + 1}`, sync_group_id: `gsc-group-${i + 1}`, project_id: PROJECT_ID,
      connection_id: 'gsc-conn-1', site_url: `sc-domain:${SHOP}`, window_days: 28,
      start_date: day(end - 27 * DAY_MS), end_date: day(end), status: 'succeeded',
      rows_fetched: i === 0 ? GSC_ROWS.length : 400, api_batches: 1, truncated: false,
      latest_available_date: day(end), total_clicks: clicks, total_impressions: impressions,
      weighted_position_sum: position * impressions, summary_total_clicks: clicks,
      summary_total_impressions: impressions, summary_total_ctr: clicks / impressions,
      summary_average_position: position, summary_aggregation_type: 'byProperty',
      summary_data_state: 'final', summary_response_metadata: null,
      started_at: iso(end + 2 * DAY_MS + 5 * 3_600_000), finished_at: iso(end + 2 * DAY_MS + 5 * 3_600_000 + 40_000),
      sanitized_error_code: null }
  })
  return {
    gsc_connections: [{ id: 'gsc-conn-1', user_id: USER_ID, encrypted_refresh_token: 'stub-not-a-token',
      encryption_version: 1, granted_scope: 'https://www.googleapis.com/auth/webmasters.readonly',
      status: 'connected', last_error_code: null, last_error_message: null,
      created_at: iso(now() - 70 * DAY_MS), updated_at: iso(now() - DAY_MS) }],
    project_gsc_properties: [{ project_id: PROJECT_ID, connection_id: 'gsc-conn-1', site_url: `sc-domain:${SHOP}`,
      permission_level: 'siteOwner', selected_by: USER_ID, selected_at: iso(now() - 70 * DAY_MS),
      updated_at: iso(now() - 70 * DAY_MS) }],
    gsc_sync_runs: runs,
    gsc_query_page_metrics: GSC_ROWS.map(([query, path, clicks, impressions, position]) => ({
      sync_run_id: runs[0].id, project_id: PROJECT_ID, query, page: `${GSC_SITE}${path}`,
      clicks, impressions, ctr: clicks / impressions, position, created_at: runs[0].finished_at })),
  }
}

function freshDb() {
  return {
    profiles: [{ id: USER_ID, role: 'user', full_name: 'Shopify Reviewer', email: EMAIL }],
    billing_governance: [{ user_id: USER_ID, signup_origin: 'shopify_app_store',
      billing_authority: 'shopify', authority_reason: 'shopify_app_store_install',
      authority_changed_at: iso(now() - 6 * 86400000), created_at: iso(now() - 6 * 86400000), updated_at: iso(now()) }],
    shopify_connections: [{ id: 'conn-1', user_id: USER_ID, connection_status: 'connected', archived_at: null,
      shop_domain: SHOP, shop_gid: 'gid://shopify/Shop/1', shopify_plan_handle: 'advanced',
      shopify_subscription_status: 'active', shopify_trial_ends_at: iso(now() + 4 * 86400000),
      shopify_current_period_start: null, shopify_current_period_end: null,
      shopify_billing_verified_at: iso(now() - 60000), shopify_cancel_at_end_of_cycle: false,
      shopify_billing_last_error: null, updated_at: iso(now()), created_at: iso(now() - 6 * 86400000) }],
    shopify_billing_migrations: [],
    subscriptions: [],
    clients: [{ id: 'client-1', user_id: USER_ID, name: 'Go Top Test', is_active: true, is_default: true,
      contact_name: null, email: EMAIL, phone: null, notes: null, created_at: iso(now() - 6 * 86400000) }],
    projects: [{ id: PROJECT_ID, user_id: USER_ID, client_id: 'client-1', name: 'Go Top Test',
      target_domain: SHOP, business_name: 'Go Top Test', country: 'US', city: 'New York, NY',
      language: 'en', device_type: 'desktop', is_active: true, scan_frequency: 'manual',
      created_at: iso(now() - 6 * 86400000), updated_at: iso(now()) }],
    tracking_targets: [],
    scan_results: [],
    usage_reservations: [],
    ai_prompts: Array.from({ length: 8 }, (_, i) => ({ id: `prompt-${i + 1}`, project_id: PROJECT_ID,
      user_id: USER_ID, prompt_text: `question ${i + 1}`, is_active: true, created_at: iso(now() - 86400000) })),
    ai_scan_runs: [], ai_scan_results: [], ai_citations: [],
    operation_claims: [],
    // W10: the competitors a project tracks, and where each ranked per check.
    ai_visibility_competitors: [],
    keyword_competitor_positions: [],
    // Search Console: not connected until a journey asks for the connected fixture.
    ...gscTables('disconnected'),
  }
}

let db = freshDb()
// W5 settings: tables a journey can make unreadable, answered the way PostgREST
// answers a table it does not know (a database without that migration), so the
// settings screen can be seen hiding only the sections that need them.
// /__stub/fixture?missing=project_profiles,project_audiences sets them; reset clears them.
let missingTables = new Set()
// Sign-up with the claim (free-check-claim.js): /__stub/fixture?confirm=on makes
// /auth/v1/signup answer a user and NO session, as a project with email
// confirmation on does; reset turns it off again.
let confirmSignup = false

const requests = []   // every REST/auth call, for the request-graph report

function roleOf(req) {
  const auth = (req.headers.authorization || '').replace(/^Bearer\s+/i, '')
  const key = auth || req.headers.apikey || ''
  return key === SERVICE ? 'service_role' : 'authenticated'
}

function send(res, status, body, extra = {}) {
  const payload = body === null ? '' : JSON.stringify(body)
  res.writeHead(status, { 'content-type': 'application/json',
    'access-control-allow-origin': '*', 'access-control-allow-headers': '*',
    'access-control-expose-headers': 'content-range', ...extra })
  res.end(payload)
}

/** `col=eq.value` / `col=is.null` / `col=in.(a,b)` — the operators this app uses. */
function applyFilters(rows, params) {
  let out = rows
  for (const [col, raw] of params) {
    if (['select', 'order', 'limit', 'offset', 'on_conflict', 'columns'].includes(col)) continue
    const [op, ...rest] = String(raw).split('.')
    const val = rest.join('.')
    out = out.filter((r) => {
      const v = r[col]
      if (op === 'eq') return String(v) === val
      if (op === 'neq') return String(v) !== val
      if (op === 'is') return val === 'null' ? v == null : String(v) === val
      if (op === 'not') return rest[0] === 'is' && rest[1] === 'null' ? v != null : true
      if (op === 'in') return val.replace(/^\(|\)$/g, '').split(',').map((s) => s.replace(/^"|"$/g, '')).includes(String(v))
      if (op === 'gt') return v > val
      if (op === 'lt') return v < val
      if (op === 'gte') return v >= val
      if (op === 'lte') return v <= val
      return true
    })
  }
  return out
}

const server = http.createServer(async (req, res) => {
  const url = new URL(req.url, `http://127.0.0.1:${PORT}`)
  const path = url.pathname
  let raw = ''
  for await (const chunk of req) raw += chunk
  const body = raw ? JSON.parse(raw) : null
  const role = roleOf(req)
  requests.push({ method: req.method, path, query: url.search, role })

  if (req.method === 'OPTIONS') return send(res, 204, null)

  // ── auth ────────────────────────────────────────────────────────────────
  const session = {
    access_token: SERVICE === '' ? 'x' : 'stub-access-token', token_type: 'bearer',
    expires_in: 3600, expires_at: Math.floor(now() / 1000) + 3600, refresh_token: 'stub-refresh',
    user: { id: USER_ID, aud: 'authenticated', role: 'authenticated', email: EMAIL,
      email_confirmed_at: iso(now() - 6 * 86400000), phone: '', confirmed_at: iso(now() - 6 * 86400000),
      last_sign_in_at: iso(now()), app_metadata: { provider: 'email', providers: ['email'] },
      user_metadata: { full_name: 'Shopify Reviewer', company_name: 'Go Top Test' },
      identities: [], created_at: iso(now() - 6 * 86400000), updated_at: iso(now()), is_anonymous: false },
  }
  if (path === '/auth/v1/signup' && confirmSignup) return send(res, 200, session.user)
  if (path === '/auth/v1/token') return send(res, 200, session)
  if (path === '/auth/v1/user') return send(res, 200, session.user)
  if (path === '/auth/v1/logout') return send(res, 204, null)
  if (path.startsWith('/auth/v1/')) return send(res, 200, session)

  // ── rest ────────────────────────────────────────────────────────────────
  if (path.startsWith('/rest/v1/')) {
    const table = path.slice('/rest/v1/'.length)
    if (table === 'rpc/reserve_usage') {
      const p = body || {}
      const used = db.usage_reservations
        .filter((r) => r.user_id === p.p_user_id && r.usage_type === p.p_usage_type)
        .reduce((n, r) => n + r.amount, 0)
      if (used + Number(p.p_amount) > Number(p.p_limit)) return send(res, 200, [{ outcome: 'quota_exceeded' }])
      const id = `res-${db.usage_reservations.length + 1}`
      db.usage_reservations.push({ id, user_id: p.p_user_id, usage_type: p.p_usage_type,
        amount: Number(p.p_amount), idempotency_key: p.p_idempotency_key })
      return send(res, 200, [{ outcome: 'reserved', reservation_id: id, reservation_token: 'tok' }])
    }
    // The single-flight claim, mirroring
    // supabase/migrations/20260909000000_operation_claims.sql. Without it the
    // routes correctly FAIL CLOSED, which is right but exercises nothing.
    if (table === 'rpc/claim_operation') {
      const p = body || {}
      const key = `${p.p_user_id}:${p.p_operation}:${p.p_scope}`
      const existing = db.operation_claims.find((c) => c.claim_key === key)
      const live = existing && new Date(existing.expires_at).getTime() > now()
      if (live) {
        return send(res, 200, [{ outcome: 'in_progress', holder_request_id: existing.holder_request_id,
          claimed_at: existing.claimed_at, expires_at: existing.expires_at }])
      }
      const row = { claim_key: key, user_id: p.p_user_id, operation: p.p_operation, scope: p.p_scope,
        holder_request_id: p.p_request_id, claimed_at: iso(now()),
        expires_at: iso(now() + Number(p.p_ttl_seconds) * 1000) }
      if (existing) Object.assign(existing, row); else db.operation_claims.push(row)
      return send(res, 200, [{ outcome: 'claimed', holder_request_id: row.holder_request_id,
        claimed_at: row.claimed_at, expires_at: row.expires_at }])
    }
    if (table === 'rpc/release_operation_claim') {
      const p = body || {}
      const key = `${p.p_user_id}:${p.p_operation}:${p.p_scope}`
      const i = db.operation_claims.findIndex((c) => c.claim_key === key
        && c.user_id === p.p_user_id && c.holder_request_id === p.p_request_id)
      if (i < 0) return send(res, 200, [{ outcome: 'not_holder' }])
      db.operation_claims.splice(i, 1)
      return send(res, 200, [{ outcome: 'released' }])
    }
    if (table.startsWith('rpc/')) return send(res, 200, [])

    // THE PRODUCTION PERMISSION FACT, reproduced.
    if (table === 'billing_governance' && role !== 'service_role') {
      return send(res, 403, { code: '42501', message: 'permission denied for table billing_governance',
        details: null, hint: null })
    }
    // supabase/migrations/20260927000100_keyword_competitor_positions.sql: the
    // owner may read, only the service role may write.
    if (table === 'keyword_competitor_positions' && role !== 'service_role'
      && !['GET', 'HEAD'].includes(req.method)) {
      return send(res, 403, { code: '42501', message: 'permission denied for table keyword_competitor_positions',
        details: null, hint: null })
    }
    // W5 settings: a table the fixture made unreadable.
    if (missingTables.has(table)) {
      return send(res, 404, { code: 'PGRST205', message: `Could not find the table 'public.${table}' in the schema cache`,
        details: null, hint: null })
    }
    if (!db[table]) db[table] = []

    // OPTIONAL LATENCY for one table (STUB_SLOW_TABLE / STUB_SLOW_MS), so a
    // journey can tell "answered before the work" from "answered after it".
    // Off unless both are set; every existing journey is unaffected.
    if (process.env.STUB_SLOW_TABLE === table && Number(process.env.STUB_SLOW_MS) > 0) {
      await new Promise((r) => setTimeout(r, Number(process.env.STUB_SLOW_MS)))
    }

    // THE BILLING FIXTURE IS RELATIVE TO NOW, ON EVERY READ.
    //
    // These two timestamps were materialised once at process start. A stub left
    // running for a few hours therefore drifted into "verification stale, trial
    // still open", the route guard redirected every dashboard page to /billing,
    // and a journey that had passed an hour earlier failed for a reason that had
    // nothing to do with the code under test. A fixture that decays is a fixture
    // that lies about what it is testing.
    if (table === 'shopify_connections') {
      for (const c of db.shopify_connections) {
        c.shopify_billing_verified_at = iso(now() - 60_000)
        c.shopify_trial_ends_at = iso(now() + 4 * 86_400_000)
        c.updated_at = iso(now())
      }
    }

    if (req.method === 'GET' || req.method === 'HEAD') {
      const rows = applyFilters(db[table], url.searchParams)
      const limit = url.searchParams.get('limit')
      const out = limit ? rows.slice(0, Number(limit)) : rows
      const prefer = req.headers.prefer || ''
      const accept = req.headers.accept || ''
      if (/count=exact/.test(prefer) || req.method === 'HEAD') {
        return send(res, 200, req.method === 'HEAD' ? null : out,
          { 'content-range': `0-${Math.max(0, out.length - 1)}/${rows.length}` })
      }
      if (/vnd\.pgrst\.object/.test(accept)) {
        if (out.length !== 1) return send(res, 406, { code: 'PGRST116', message: 'no rows', details: null, hint: null })
        return send(res, 200, out[0])
      }
      return send(res, 200, out, { 'content-range': `0-${Math.max(0, out.length - 1)}/${rows.length}` })
    }
    // `.select().single()` sets Accept: application/vnd.pgrst.object+json on
    // WRITES as well as reads, and supabase-js then expects a bare object. A
    // stub that always answers with an array makes `insert().select().single()`
    // hand back an array whose `.id` is undefined — every later `.eq('id', …)`
    // then matches nothing, which looks exactly like a product bug and is not.
    const wantsObject = /vnd\.pgrst\.object/.test(req.headers.accept || '')
    const one = (rows) => (wantsObject ? (rows[0] ?? null) : rows)
    if (req.method === 'POST') {
      // Projects get a real UUID, as Postgres gives them: the project routes
      // (onboarding start, seed, summary) answer 404 to any other id.
      const newId = (i) => (table === 'projects' ? randomUUID() : `${table}-${db[table].length + i + 1}`)
      const items = (Array.isArray(body) ? body : [body]).map((it, i) => ({
        id: it.id || newId(i), created_at: iso(now()), ...it }))
      db[table].push(...items)
      const representation = /return=representation/.test(req.headers.prefer || '') || wantsObject
      return send(res, 201, representation ? one(items) : null)
    }
    if (req.method === 'PATCH') {
      const rows = applyFilters(db[table], url.searchParams)
      for (const r of rows) Object.assign(r, body)
      return send(res, 200, one(rows))
    }
    if (req.method === 'DELETE') {
      const rows = applyFilters(db[table], url.searchParams)
      db[table] = db[table].filter((r) => !rows.includes(r))
      return send(res, 200, rows)
    }
  }

  if (path === '/__stub/requests') return send(res, 200, requests)
  if (path === '/__stub/db') return send(res, 200, db)
  // A FULL reset, database included.
  //
  // It used to clear only the request log, so journeys run back-to-back in one
  // stub process inherited each other's rows: the second one found two keywords
  // where it expected one and failed for a reason that had nothing to do with
  // the code. A shared fixture that accumulates makes test order significant,
  // which is the opposite of what a fixture is for.
  if (path === '/__stub/reset') {
    requests.length = 0; db = freshDb()
    missingTables = new Set() // W5 settings
    confirmSignup = false
    return send(res, 200, { ok: true })
  }
  // Sign-up with the claim: /__stub/fixture?account=new turns the stub's user into
  // a web merchant who has just signed up (no project, no client, no Shopify
  // store, a fresh trial); ?confirm=on|off switches email confirmation.
  if (path === '/__stub/fixture' && (url.searchParams.has('account') || url.searchParams.has('confirm'))) {
    // ?account=web: the same user as a web merchant who keeps their project
    // (no Shopify store, a trial) — the settings screen's platform switch is
    // offered only to them (wordpress-connect-settings.js).
    if (url.searchParams.get('account') === 'web') {
      Object.assign(db, { billing_governance: [], shopify_connections: [],
        subscriptions: [{ id: 'sub-web', user_id: USER_ID, status: 'trial', plan: null,
          trial_ends_at: iso(now() + 7 * 86_400_000), created_at: iso(now()) }],
        // What the site scan read off the site: it runs on WordPress.
        project_profiles: [{ project_id: PROJECT_ID, user_id: USER_ID, description: null, commerce_type: null,
          niche: null, is_local: null, detected_platform: 'WordPress', field_sources: {}, updated_at: iso(now()) }] })
    }
    if (url.searchParams.get('account') === 'new') {
      // The trial row is what the database's own sign-up trigger (handle_new_user)
      // inserts for every new account, before any page runs.
      Object.assign(db, { projects: [], clients: [], billing_governance: [], shopify_connections: [],
        subscriptions: [{ id: 'sub-new', user_id: USER_ID, status: 'trial', plan: null,
          trial_ends_at: iso(now() + 7 * 86_400_000), created_at: iso(now()) }],
        tracking_targets: [], ai_prompts: [] })
    }
    if (url.searchParams.has('confirm')) confirmSignup = url.searchParams.get('confirm') === 'on'
    return send(res, 200, { ok: true, confirm: confirmSignup })
  }
  // Search Console connected or not, every other table untouched (see gscTables).
  // W5 settings: /__stub/fixture?missing=a,b (empty to restore every table).
  if (path === '/__stub/fixture' && url.searchParams.has('missing')) {
    missingTables = new Set((url.searchParams.get('missing') || '').split(',').map((t) => t.trim()).filter(Boolean))
    return send(res, 200, { ok: true, missing: [...missingTables] })
  }
  if (path === '/__stub/fixture') {
    const gsc = url.searchParams.get('gsc')
    if (gsc !== 'connected' && gsc !== 'disconnected') return send(res, 400, { message: 'stub: gsc=connected|disconnected' })
    Object.assign(db, gscTables(gsc))
    return send(res, 200, { ok: true, gsc })
  }
  send(res, 404, { message: 'stub: not found', path })
})

server.listen(PORT, '127.0.0.1', () => console.log(`supabase stub on ${PORT}`))
