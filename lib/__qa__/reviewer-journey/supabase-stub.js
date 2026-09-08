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

const db = {
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
}

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
    if (table.startsWith('rpc/')) return send(res, 200, [])

    // THE PRODUCTION PERMISSION FACT, reproduced.
    if (table === 'billing_governance' && role !== 'service_role') {
      return send(res, 403, { code: '42501', message: 'permission denied for table billing_governance',
        details: null, hint: null })
    }
    if (!db[table]) db[table] = []

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
    if (req.method === 'POST') {
      const items = (Array.isArray(body) ? body : [body]).map((it, i) => ({
        id: it.id || `${table}-${db[table].length + i + 1}`, created_at: iso(now()), ...it }))
      db[table].push(...items)
      return send(res, 201, /return=representation/.test(req.headers.prefer || '') ? items : null)
    }
    if (req.method === 'PATCH') {
      const rows = applyFilters(db[table], url.searchParams)
      for (const r of rows) Object.assign(r, body)
      return send(res, 200, rows)
    }
    if (req.method === 'DELETE') {
      const rows = applyFilters(db[table], url.searchParams)
      db[table] = db[table].filter((r) => !rows.includes(r))
      return send(res, 200, rows)
    }
  }

  if (path === '/__stub/requests') return send(res, 200, requests)
  if (path === '/__stub/db') return send(res, 200, db)
  if (path === '/__stub/reset') { requests.length = 0; return send(res, 200, { ok: true }) }
  send(res, 404, { message: 'stub: not found', path })
})

server.listen(PORT, '127.0.0.1', () => console.log(`supabase stub on ${PORT}`))
