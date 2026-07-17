/**
 * Browser-E2E mock backend (offline QA infrastructure — never deployed).
 *
 * One process serving BOTH surfaces the app needs:
 *   - Supabase: GoTrue (/auth/v1/*) + PostgREST (/rest/v1/:table) over an
 *     in-memory table store (eq/in filters, single-object Accept, upsert with
 *     ignore-duplicates + return=representation — the exact contract
 *     insertPendingIdeas relies on).
 *   - Gemini (via RECO_GENAI_BASE_URL): models.list + generateContent with a
 *     brief-aware fixture responder.
 * Unknown tables return [] so unrelated dashboard queries never 500.
 */
import { createServer } from 'http'
import { randomUUID } from 'crypto'

export const E2E_USER = {
  id: '00000000-0000-4000-8000-000000000001',
  aud: 'authenticated',
  role: 'authenticated',
  email: 'e2e@test.local',
  email_confirmed_at: '2026-01-01T00:00:00Z',
  app_metadata: { provider: 'email' },
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
  updated_at: '2026-01-01T00:00:00Z',
}

const SESSION = () => ({
  access_token: 'e2e-access-token',
  token_type: 'bearer',
  expires_in: 3600,
  expires_at: Math.floor(Date.now() / 1000) + 3600,
  refresh_token: 'e2e-refresh-token',
  user: E2E_USER,
})

function parseFilters(url) {
  const skip = new Set(['select', 'order', 'limit', 'offset', 'on_conflict', 'columns', 'apikey'])
  const filters = []
  for (const [k, v] of url.searchParams.entries()) {
    if (skip.has(k)) continue
    if (v.startsWith('eq.')) filters.push({ col: k, op: 'eq', val: v.slice(3) })
    else if (v.startsWith('in.(')) filters.push({ col: k, op: 'in', vals: v.slice(4, -1).split(',').map((s) => s.replace(/^"|"$/g, '')) })
    else if (v.startsWith('is.')) filters.push({ col: k, op: 'is', val: v.slice(3) })
  }
  return filters
}
function applyFilters(rows, filters) {
  return rows.filter((r) => filters.every((f) => {
    const cell = r[f.col]
    if (f.op === 'eq') return String(cell) === f.val
    if (f.op === 'in') return f.vals.includes(String(cell))
    if (f.op === 'is') return f.val === 'null' ? (cell === null || cell === undefined) : String(cell) === f.val
    return true
  }))
}

export function startMockSupabase(tables, opts = {}) {
  const log = opts.verbose ? console.log : () => {}
  const CORS = {
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET,POST,PATCH,DELETE,OPTIONS,HEAD',
    'access-control-allow-headers': '*',
    'access-control-expose-headers': '*',
  }
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      const url = new URL(req.url, 'http://x')
      const path = url.pathname
      const send = (code, obj, headers = {}) => {
        res.writeHead(code, { 'content-type': 'application/json', ...CORS, ...headers })
        res.end(JSON.stringify(obj))
      }
      if (req.method === 'OPTIONS') { res.writeHead(204, CORS); res.end(); return }
      // ── GoTrue ──
      if (path.startsWith('/auth/v1/')) {
        if (path === '/auth/v1/token') { send(200, SESSION()); return }
        if (path === '/auth/v1/user') { send(200, E2E_USER); return }
        if (path === '/auth/v1/logout') { send(204, {}); return }
        send(200, {})
        return
      }
      // ── PostgREST ──
      if (path.startsWith('/rest/v1/')) {
        const table = path.slice('/rest/v1/'.length).split('/')[0]
        if (table === 'rpc') { send(200, []); return } // no RPCs needed in this flow
        const store = tables[table] ?? (tables[table] = [])
        const filters = parseFilters(url)
        const wantsSingle = (req.headers.accept ?? '').includes('vnd.pgrst.object')
        const prefer = String(req.headers.prefer ?? '')
        log(`[pgrst] ${req.method} ${table}`, JSON.stringify(filters))

        if (req.method === 'GET' || req.method === 'HEAD') {
          const rows = applyFilters(store, filters)
          if (wantsSingle) {
            if (rows.length === 0) { send(406, { message: 'JSON object requested, multiple (or no) rows returned', code: 'PGRST116' }); return }
            send(200, rows[0]); return
          }
          send(200, rows, { 'content-range': `0-${Math.max(0, rows.length - 1)}/${rows.length}` })
          return
        }
        if (req.method === 'POST') {
          let payload = []
          try { payload = JSON.parse(body || '[]') } catch { payload = [] }
          if (!Array.isArray(payload)) payload = [payload]
          const onConflict = (url.searchParams.get('on_conflict') ?? '').split(',').filter(Boolean)
          const ignoreDup = prefer.includes('resolution=ignore-duplicates')
          const inserted = []
          for (const row of payload) {
            if (onConflict.length && ignoreDup && store.some((r) => onConflict.every((c) => String(r[c]) === String(row[c])))) continue
            const full = { id: randomUUID(), created_at: new Date().toISOString(), ...row }
            store.push(full)
            inserted.push(full)
          }
          if (prefer.includes('return=representation')) { send(201, wantsSingle ? (inserted[0] ?? null) : inserted); return }
          send(201, [])
          return
        }
        if (req.method === 'PATCH') {
          let updates = {}
          try { updates = JSON.parse(body || '{}') } catch { updates = {} }
          const rows = applyFilters(store, filters)
          for (const r of rows) Object.assign(r, updates)
          if (prefer.includes('return=representation')) { send(200, rows); return }
          send(204, {})
          return
        }
        if (req.method === 'DELETE') {
          const rows = applyFilters(store, filters)
          for (const r of rows) store.splice(store.indexOf(r), 1)
          send(204, {})
          return
        }
        send(200, [])
        return
      }
      send(404, { message: 'not found' })
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, tables })))
}

export function startFakeGemini(cfg) {
  const calls = []
  const server = createServer((req, res) => {
    let body = ''
    req.on('data', (c) => { body += c })
    req.on('end', () => {
      if (req.method === 'GET' && (req.url ?? '').includes('/models')) {
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({ models: (cfg.models ?? ['gemini-2.5-flash', 'gemini-2.5-pro']).map((m) => ({ name: `models/${m}`, supportedGenerationMethods: ['generateContent'] })) }))
        return
      }
      if ((req.url ?? '').includes(':generateContent')) {
        const model = ((req.url ?? '').match(/models\/([^:]+):generateContent/) ?? [])[1] ?? 'unknown'
        const m = body.match(/BRIEFS:\\n(\[.*?\])\\n\\nOUTPUT/) ?? body.match(/BRIEFS:\s*\n(\[[\s\S]*?\])\s*\n\s*\nOUTPUT/)
        let briefs = []
        if (m) { try { briefs = JSON.parse(m[1].replace(/\\"/g, '"').replace(/\\n/g, '\n')) } catch { briefs = [] } }
        calls.push({ model, briefCount: briefs.length })
        const topics = briefs.map((b) => ({
          briefId: b.id,
          title: `המדריך המלא: ${b.subject}`,
          primaryKeyword: b.aligned_query ?? b.subject,
          secondaryKeywords: [],
          intent: 'informational',
        }))
        res.writeHead(200, { 'content-type': 'application/json' })
        res.end(JSON.stringify({
          candidates: [{ content: { role: 'model', parts: [{ text: JSON.stringify({ topics }) }] }, finishReason: 'STOP' }],
          usageMetadata: { promptTokenCount: 1200, candidatesTokenCount: 500, totalTokenCount: 1700 },
        }))
        return
      }
      res.writeHead(404); res.end('{}')
    })
  })
  return new Promise((resolve) => server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port, calls })))
}

/** Natural-Shop-like seeded tables (Hebrew health/ecommerce project). */
export function e2eSeedTables() {
  const P = 'e2e00000-0000-4000-8000-0000000000p1'
  return {
    profiles: [{ id: E2E_USER.id, role: 'admin' }],
    subscriptions: [{ id: 'sub1', user_id: E2E_USER.id, status: 'active', plan: 'premium', current_period_end: '2030-01-01T00:00:00Z' }],
    projects: [{ id: P, user_id: E2E_USER.id, is_active: true, business_name: 'הצמחייה - חנות הטבע', name: 'הצמחייה', target_domain: 'https://natural-shop.co.il', language: 'he', country: 'IL', created_at: '2026-01-01T00:00:00Z' }],
    tracking_targets: [{ project_id: P, keyword: 'תוספי תזונה טבעיים' }],
    keyword_research_cache: [{
      project_id: P, created_at: '2026-07-01T00:00:00Z', results_json: [
        { keyword: 'מגנזיום לילדים מינון', avgMonthlySearches: 320 },
        { keyword: 'איך לבחור אבקת חלבון', avgMonthlySearches: 210 },
        { keyword: 'אנזימי עיכול טבעיים', avgMonthlySearches: 140 },
        { keyword: 'יתרונות אומגה 3', avgMonthlySearches: 90 },
        { keyword: 'ויטמין C לילדים', avgMonthlySearches: 500 },
        { keyword: 'חיזוק מערכת החיסון בחורף', avgMonthlySearches: 170 },
      ],
    }],
    shopify_entities: [
      { project_id: P, is_active: true, title: 'מגנזיום ביסגליצינט 120 כמוסות', handle: 'mag', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/mag' },
      { project_id: P, is_active: true, title: 'אנזימי עיכול פורטה', handle: 'enz', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/enz' },
      { project_id: P, is_active: true, title: 'ויטמין C 500 טבעי', handle: 'vitc', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/vitc' },
      { project_id: P, is_active: true, title: 'אבקת חלבון צמחית', handle: 'prot', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/prot' },
      { project_id: P, is_active: true, title: 'אומגה 3 טבעי', handle: 'omega', entity_type: 'product', canonical_url: 'https://natural-shop.co.il/p/omega' },
      { project_id: P, is_active: true, title: 'מדיניות פרטיות', handle: 'privacy', entity_type: 'page', canonical_url: 'https://natural-shop.co.il/pages/privacy-policy' },
    ],
    generated_articles: [{ project_id: P, title: 'מגנזיום לשינה - המדריך המלא' }],
    article_topics: [],
    content_topic_ideas: [],
    wordpress_content_index: [],
    projectId: undefined, // convenience below
  }
}
export const E2E_PROJECT_ID = 'e2e00000-0000-4000-8000-0000000000p1'
