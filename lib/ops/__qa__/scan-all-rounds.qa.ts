/**
 * "SCAN ALL" CHECKS EVERY KEYWORD, IN ROUNDS.
 *
 * WHAT PRODUCTION SHOWED (2026-10-05, project with 16 keywords): one "Scan all"
 * ran 44 s, checked 13 keywords and was marked completed with 0 failed. The
 * operation budget (45 s) ran out; the last 3 targets threw before their provider
 * call, got no row, and the scan was closed as if it had finished.
 *
 * NOW: when the budget cuts targets off, the scan stays 'running' and the answer
 * says `continue`; the next request resumes exactly the targets left (the
 * existing resume path), and the panel sends it until the scan is done.
 *
 * The real route runs with a short operation budget (the Deadline class is
 * wrapped) and a provider fixture; no live provider, no quota.
 *
 * Run: npx tsx lib/ops/__qa__/scan-all-rounds.qa.ts
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

import { readFileSync } from 'fs'
import { join } from 'path'

const REAL_LOG = console.log, REAL_ERR = console.error
const quiet = () => { console.log = () => {}; console.error = () => {} }
const loud = () => { console.log = REAL_LOG; console.error = REAL_ERR }
const say = (...a: unknown[]) => REAL_LOG(...a)

let BUDGET_MS = 600
const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null, RUN_SCAN: any = null
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  if (r.endsWith('lib/scanner.ts') || r.endsWith('lib/scanner/index.ts')) return { runScan: (...a: any[]) => RUN_SCAN(...a) }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
  const loaded = origLoad.call(this, request, parent, isMain)
  // The route's own operation budget only: a short one, so a round ends after a few targets.
  if (r.endsWith('lib/ops/deadline.ts') && parent && String(parent.filename).endsWith('app/api/scan/route.ts')) {
    const Real = loaded.Deadline
    class ShortDeadline extends Real { constructor(_budget: number, now?: () => number) { super(BUDGET_MS, now) } }
    return { ...loaded, Deadline: ShortDeadline }
  }
  return loaded
}

const { FakeAdmin } = require('../../__qa__/_fake-admin')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; say(`  ✓ ${name}`) } else { fail++; say(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const now = () => Date.now()
const TARGETS = Array.from({ length: 14 }, (_, i) => `b2222222-3333-4444-5555-6666666666${String(i).padStart(2, "0")}`)

function tables(): Record<string, any[]> {
  return {
    profiles: [{ id: USER, role: 'user' }],
    billing_governance: [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: null }],
    subscriptions: [{ id: 's1', user_id: USER, status: 'active', plan_code: 'premium', paypal_subscription_id: 'I-1',
      current_period_start: new Date(now() - 5 * 86_400_000).toISOString(), current_period_end: new Date(now() + 20 * 86_400_000).toISOString(),
      trial_ends_at: null, created_at: '2026-01-01T00:00:00Z' }],
    shopify_connections: [], shopify_billing_migrations: [],
    projects: [{ id: PROJECT, user_id: USER, target_domain: 'shop.example.org', business_name: 'Shop',
      country: 'IL', city: 'Tel Aviv', language: 'he', device_type: 'desktop' }],
    tracking_targets: TARGETS.map((id, i) => ({ id, project_id: PROJECT, user_id: USER, keyword: `keyword ${i}`,
      engine_type: 'google_search', is_active: true, location_mode: 'project', target_domain: 'shop.example.org',
      created_at: new Date(now() - (10 - i) * 1000).toISOString() })),
    scans: [], scan_results: [], usage_reservations: [], operation_claims: [],
  }
}
function clients(t: Record<string, any[]>) {
  ADMIN_CLIENT = new FakeAdmin(t)
  USER_CLIENT = new FakeAdmin(t)
  ;(USER_CLIENT as any).auth = { getUser: async () => ({ data: { user: { id: USER } } }) }
}
const scanAll = () => new Request('http://localhost/api/scan', { method: 'POST', body: JSON.stringify({ projectId: PROJECT }) })

async function main() {
  say('"Scan all" checks every keyword, in rounds\n')
  const { POST } = require('../../../app/api/scan/route.ts')

  // ── R) the rounds ────────────────────────────────────────────────────────
  {
    const t = tables(); clients(t)
    const calls: string[] = []
    RUN_SCAN = async (_engine: string, payload: any) => {
      calls.push(String(payload?.keyword ?? ''))
      await new Promise((r) => setTimeout(r, 80))
      return { found: true, position: 3, resultUrl: 'https://shop.example.org/', resultTitle: 'Shop', resultAddress: null, error: null, audit: null }
    }
    quiet(); const r1 = await POST(scanAll()); const b1 = await r1.json(); loud()
    check('R1: the budget ends before every keyword: the answer says continue, with what is left',
      r1.status === 200 && b1.status === 'partial' && b1.continue === true && b1.remaining > 0 && b1.completed + b1.remaining === TARGETS.length,
      JSON.stringify({ s: r1.status, st: b1.status, c: b1.continue, done: b1.completed, left: b1.remaining }))
    check('R2: and the scan stays running (not closed as completed)', t.scans[0]?.status === 'running' && !t.scans[0]?.completed_at, JSON.stringify(t.scans[0]))
    let rounds = 1, last = b1
    while (last.continue && rounds < 12) {
      quiet(); const r = await POST(scanAll()); last = await r.json(); loud()
      rounds++
    }
    check('R3: the next requests resume the same scan and finish it: every keyword has a result',
      last.status === 'completed' && last.completed === TARGETS.length && t.scans.length === 1, JSON.stringify({ rounds, last: last.status, done: last.completed, scans: t.scans.length }))
    const perTarget = new Map<string, number>()
    for (const row of t.scan_results) perTarget.set(row.tracking_target_id, (perTarget.get(row.tracking_target_id) ?? 0) + 1)
    check('R4: each keyword checked exactly once (none repeated, none skipped)',
      TARGETS.every((id) => perTarget.get(id) === 1) && calls.length === TARGETS.length, JSON.stringify({ calls: calls.length, rows: t.scan_results.length }))
    check('R5: the scan is closed as completed, with its finish time', t.scans[0]?.status === 'completed' && !!t.scans[0]?.completed_at)
  }

  // ── S) what does not change ──────────────────────────────────────────────
  {
    BUDGET_MS = 45_000
    const t = tables(); clients(t)
    RUN_SCAN = async () => ({ found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: null, audit: null })
    quiet(); const r = await POST(scanAll()); const b = await r.json(); loud()
    check('S1: a scan that fits in the budget answers completed in one request, no continue', b.status === 'completed' && !b.continue && b.completed === TARGETS.length)
    const one = tables(); clients(one)
    BUDGET_MS = 10
    RUN_SCAN = async () => { await new Promise((res) => setTimeout(res, 50)); return { found: true, position: 1, error: null, audit: null } }
    quiet(); const r2 = await POST(new Request('http://localhost/api/scan', { method: 'POST', body: JSON.stringify({ projectId: PROJECT, targetId: TARGETS[0] }) })); const b2 = await r2.json(); loud()
    check('S2: a single-keyword scan never answers continue', !b2.continue, JSON.stringify({ s: r2.status, b: b2.status }))
  }

  // ── P) the panel sends the rounds ────────────────────────────────────────
  {
    const src = readFileSync(join(process.cwd(), 'components/keywords/ProjectKeywordsPanel.tsx'), 'utf8')
    const loop = /do \{[\s\S]*?fetch\('\/api\/scan'[\s\S]*?\} while \(response\.ok && data\.continue && rounds < MAX_SCAN_ROUNDS\)/
    check('P1: "Scan all" repeats the request while the answer says continue, bounded', loop.test(src))
    check('MUTATION CONTROL: a panel that sends one request is caught', !loop.test(src.replace('} while (response.ok && data.continue && rounds < MAX_SCAN_ROUNDS)', '} while (false)')))
  }

  // ── M) mutation control on the route ─────────────────────────────────────
  {
    const routePath = join(process.cwd(), 'app/api/scan/route.ts')
    const src = readFileSync(routePath, 'utf8')
    check('MUTATION CONTROL: the route keeps the scan running only when targets are left after a timeout',
      /const continues = !targetId && timedOutTargets > 0 && remainingTargets > 0/.test(src))
  }

  say(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { loud(); say('suite crashed —', e?.stack ?? e); process.exit(1) })
export {}
