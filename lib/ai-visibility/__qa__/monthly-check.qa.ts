/**
 * THE AUTOMATIC MONTHLY AI CHECK (owner approval 2026-09-29, UX review section B).
 *
 *   A) the one config: questions per plan, the share cap, the engines per country
 *   B) the runner over FakeAdmin with the REAL entitlement, period and reserve_usage
 *      simulation: what runs, and that nothing runs twice (a second cron, two at
 *      once, a crash left `reserved`), with mutation controls
 *   C) every skip rule, each with the case that does run beside it
 *   D) the allowance: counted like a manual check, never the last two
 *   E) isolation from the rank schedule, and the cron auth that stays first
 *   F) the tab's route: session + owner, and what the status says
 *
 * Nothing here calls a provider: the provider is a counter.
 * Run: npx tsx lib/ai-visibility/__qa__/monthly-check.qa.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.ENABLE_AI_VISIBILITY = 'true'

const REAL_LOG = console.log, REAL_ERR = console.error
const logs: string[] = []
const quiet = () => { console.log = (...a: unknown[]) => { logs.push(a.map(String).join(' ') + JSON.stringify(a.slice(1))) }; console.error = console.log }
const loud = () => { console.log = REAL_LOG; console.error = REAL_ERR }
const say = (...a: unknown[]) => REAL_LOG(...a)

const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null
let ROUTE_SCANS = 0
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  if (r.endsWith('lib/ai-visibility/index.ts')) {
    return { runAIVisibilityScan: async (i: any) => { ROUTE_SCANS++; return okResult(i.engine) } }
  }
  const real = origLoad.call(this, request, parent, isMain)
  if (request !== 'next/navigation') return real
  return new Proxy(real, {
    get: (t, k) => (k === 'usePathname' ? () => '/ai-visibility'
      : k === 'useSearchParams' ? () => new URLSearchParams()
      : k === 'useRouter' ? () => ({ push() {}, replace() {}, refresh() {}, back() {}, prefetch() {} })
      : (t as any)[k]),
  })
}

const { FakeAdmin } = require('../../__qa__/_fake-admin')
const { readFileSync } = require('fs')
const { join } = require('path')
const C = require('../monthly-check/config.ts')
const R = require('../monthly-check/runner.ts')
const { PLAN_CATALOG } = require('../../plans/catalog.ts')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; say(`  ✓ ${name}`) } else { fail++; say(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const show = (v: unknown) => JSON.stringify(v)

const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const OTHER = '9b1c0000-0000-4000-8000-000000000009'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const DAY = 86_400_000
// "Now" is fixed: 07:00 UTC, the day after the 06:00 cron made the check due.
const NOW = Date.parse('2026-10-08T07:00:00.000Z')
const iso = (msv: number) => new Date(msv).toISOString()

function okResult(engine: string) {
  return { provider: 'scrapellm', engine, responseText: 'answer', rawResponse: {}, citations: [], mentionedInText: false,
    targetCitedInSources: false, citationCount: 0, sourceCount: 0, creditsUsed: 3 }
}

type World = { tables: Record<string, any[]>; admin: any; calls: string[] }
function world(opts: {
  plan?: string; status?: string; periodStartDaysAgo?: number; admin?: boolean; prompts?: number; country?: string
  setting?: boolean | 'missing'; periodStartNull?: boolean; paypal?: boolean
} = {}): World {
  const start = NOW - (opts.periodStartDaysAgo ?? 5) * DAY
  const tables: Record<string, any[]> = {
    profiles: [{ id: USER, role: opts.admin ? 'admin' : 'user' }, { id: OTHER, role: 'user' }],
    billing_governance: [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: 'website_signup' }],
    shopify_connections: [], shopify_billing_migrations: [],
    subscriptions: [{
      id: 'sub-1', user_id: USER, status: opts.status ?? 'active', plan_code: opts.status === 'trial' ? null : (opts.plan ?? 'regular'),
      trial_ends_at: opts.status === 'trial' ? iso(NOW + 5 * DAY) : null,
      current_period_start: opts.periodStartNull ? null : iso(start), current_period_end: opts.periodStartNull && !opts.paypal ? null : iso(start + 30 * DAY),
      paypal_subscription_id: opts.paypal === false ? null : 'I-QA', created_at: iso(NOW - 90 * DAY),
    }],
    projects: [{ id: PROJECT, user_id: USER, name: 'Plumber', target_domain: 'plumber.co.il', business_name: 'אינסטלטור השרון',
      country: opts.country ?? 'IL', language: 'he', is_active: true, created_at: iso(NOW - 60 * DAY),
      ...(opts.setting === 'missing' ? {} : { ai_auto_check_enabled: opts.setting ?? true }) }],
    ai_prompts: Array.from({ length: opts.prompts ?? 3 }, (_, i) => ({ id: `p${i + 1}`, project_id: PROJECT, prompt: [
      'איך לבחור אינסטלטור בשרון', 'כמה עולה אינסטלטור לתיקון נזילה', 'מה זה צנרת'][i] ?? `שאלה ${i}`, is_active: true,
      created_at: iso(NOW - (30 - i) * DAY) })),
    ai_scan_runs: [], ai_scan_results: [], ai_citations: [], usage_reservations: [], operation_claims: [],
    tracking_targets: [{ project_id: PROJECT, keyword: 'אינסטלטור בשרון' }], project_profiles: [], article_topics: [],
  }
  const admin = new FakeAdmin(tables, {}, () => NOW)
  return { tables, admin, calls: [] }
}
function deps(w: World, extra: Record<string, any> = {}) {
  return {
    now: () => new Date(NOW),
    scan: async (i: any) => { w.calls.push(`${i.prompt}|${i.engine}`); return okResult(i.engine) },
    lastSignInAt: async () => iso(NOW - 3 * DAY),
    ...extra,
  }
}
const OTHER_PROJECT = 'b0000000-0000-4000-8000-000000000002'
const otherProjectRun = () => ({ id: 'other-auto', user_id: USER, project_id: OTHER_PROJECT, usage_type: 'ai_check', reserved_amount: 1, consumed_amount: 1,
  period_start: iso(NOW - 20 * DAY), period_end: iso(NOW + 10 * DAY), idempotency_key: C.scheduledKey(OTHER_PROJECT, new Date(NOW - 20 * DAY), 'px', 'chatgpt'),
  status: 'consumed', reserved_at: iso(NOW - 16 * DAY), consumed_at: iso(NOW - 16 * DAY), created_at: iso(NOW - 16 * DAY) })
const cron = (w: World, extra: Record<string, any> = {}) => R.runMonthlyAiChecks(w.admin, { deadlineAt: Date.now() + 10 * 60_000, deps: deps(w, extra) })
const ledger = (w: World) => w.tables.usage_reservations
const consumed = (w: World) => ledger(w).filter((r: any) => r.status === 'consumed').reduce((s: number, r: any) => s + r.consumed_amount, 0)

async function main() {
  say('Automatic monthly AI check\n')

  // ── A) the one config ─────────────────────────────────────────────────────
  say('A) questions per plan, the cap, the engines')
  {
    check('A1: questions per plan are the approved numbers (regular 1, advanced 2, premium 2, agency 3)',
      show(C.MONTHLY_AI_CHECK.questionsPerPlan) === show({ regular: 1, advanced: 2, premium: 2, large_agency: 3 }))
    const within = (q: Record<string, number>) => Object.entries(q).every(([plan, n]) => {
      const x = PLAN_CATALOG[plan].maxAIChecksPerPeriodPerProject
      return n * 3 <= Math.floor(x * C.MONTHLY_AI_CHECK.maxShareOfAllowance) && n * 3 <= x - C.MONTHLY_AI_CHECK.keepLastChecks
    })
    check('A2: every plan\'s questions × 3 engines stays within its share of X and leaves the last two', within(C.MONTHLY_AI_CHECK.questionsPerPlan))
    check('A3: MUT agency at 10 questions (30 checks of 50) fails A2', !within({ ...C.MONTHLY_AI_CHECK.questionsPerPlan, large_agency: 10 }))
    check('A4: the allowances are the catalog\'s, untouched (10/20/20/50)',
      show(['regular', 'advanced', 'premium', 'large_agency'].map((p) => PLAN_CATALOG[p].maxAIChecksPerPeriodPerProject)) === show([10, 20, 20, 50]))
    check('A5: the runtime cap shrinks questions when an allowance would not hold them (regular at X=5 → 0)',
      C.monthlyQuestionCount('regular', 10, 3) === 1 && C.monthlyQuestionCount('regular', 5, 3) === 0 && C.monthlyQuestionCount('large_agency', 50, 3) === 3)
    check('A6: trial and unknown plans get no automatic check', C.monthlyQuestionCount('trial', 3, 3) === 0 && C.monthlyQuestionCount('x', 50, 3) === 0)
    check('A7: engines for Israel are ChatGPT, Gemini, Google AI Mode', show(C.monthlyEngines('IL')) === show(['chatgpt', 'gemini', 'google_ai_mode']))
    check('A8: Japan and Taiwan get Perplexity in place of the unsupported ones', show(C.monthlyEngines('jp')) === show(['chatgpt', 'perplexity']) && show(C.monthlyEngines('TW')) === show(['chatgpt', 'perplexity']))
    const key = C.scheduledKey(PROJECT, new Date(NOW), 'p1', 'gemini')
    check('A9: the key names project, period, question and engine, and reads back', show(C.parseScheduledKey(key)) === show({ projectId: PROJECT, periodStartMs: NOW, promptId: 'p1', engine: 'gemini' }))
    check('A10: the check is due 3 days after the period starts, at the 06:00 cron', C.cronTickAtOrAfter(C.monthlyDueAt(new Date('2026-10-01T10:00:00Z'))).toISOString() === '2026-10-05T06:00:00.000Z')
    const cfg = code('lib/ai-visibility/monthly-check/config.ts')
    check('A11: the numbers live only in MONTHLY_AI_CHECK (the runner reads no plan number of its own)',
      !/questionsPerPlan|large_agency:\s*\d/.test(code('lib/ai-visibility/monthly-check/runner.ts')) && /questionsPerPlan: \{ regular: 1, advanced: 2, premium: 2, large_agency: 3 \}/.test(cfg))
  }

  // ── B) what runs, and never twice ─────────────────────────────────────────
  say('\nB) the run, and no double spend')
  {
    const w = world()
    quiet(); const s = await cron(w); loud()
    check('B1: a regular project runs 1 question × 3 engines = 3 checks', w.calls.length === 3 && s.dispatched === 3, show({ calls: w.calls, s }))
    check('B2: the checks are the top question on ChatGPT, Gemini and Google AI Mode',
      show(w.calls.map((c) => c.split('|')[1]).sort()) === show(['chatgpt', 'gemini', 'google_ai_mode']) && new Set(w.calls.map((c) => c.split('|')[0])).size === 1)
    check('B3: each check is an ai_scan_runs row with triggered_by "scheduled"',
      w.tables.ai_scan_runs.length === 3 && w.tables.ai_scan_runs.every((r: any) => r.triggered_by === 'scheduled' && r.status === 'completed'))
    check('B4: each one consumed exactly 1 AI check in the ledger, under a scheduled key',
      consumed(w) === 3 && ledger(w).every((r: any) => r.usage_type === 'ai_check' && r.consumed_amount === 1 && String(r.idempotency_key).startsWith('scheduled:')))
    check('B5: the answers are stored like a manual check\'s', w.tables.ai_scan_results.length === 3 && w.tables.ai_scan_results.every((r: any) => r.status === 'success' && r.credits_used === 3))

    w.tables.ai_scan_results.length = 0 // not even the 21-day rule: only the keys
    quiet(); const again = await cron(w); loud()
    check('B6: the cron running again the same period dispatches nothing', w.calls.length === 3 && again.dispatched === 0 && consumed(w) === 3, show(again))

    // MUTATION CONTROL: without the scheduled keys, the same second run spends again.
    // (The answers are removed too, as when a check reached the provider but its
    // answer was never stored: then the key is the only thing that remembers it.)
    const m = world()
    quiet(); await cron(m); for (const r of ledger(m)) r.idempotency_key = `manual:${r.id}`; m.tables.ai_scan_results.length = 0; await cron(m); loud()
    check('B7: MUT a run that cannot see its own keys dispatches the same checks again', m.calls.length > 3, show(m.calls.length))

    // Two invocations at once (a retried cron): the reservation lock lets one through per check.
    const c2 = world()
    quiet(); const [x, y] = await Promise.all([cron(c2), cron(c2)]); loud()
    check('B8: two runs at once dispatch each check once (the other gets already_reserved)',
      c2.calls.length === 3 && x.dispatched + y.dispatched === 3 && x.duplicate + y.duplicate === 3, show({ calls: c2.calls.length, x, y }))

    // A crash after the reservation: it may have reached the provider, so it is never redone.
    const cr = world()
    const k = C.scheduledKey(PROJECT, new Date(NOW - 5 * DAY), 'p2', 'chatgpt')
    quiet(); const plan0 = await R.planMonthlyCheck(cr.admin, cr.tables.projects[0], { now: new Date(NOW) }); loud()
    const top = plan0.ok ? plan0.pairs[0].promptId : 'none'
    const crashKey = C.scheduledKey(PROJECT, new Date(NOW - 5 * DAY), top, 'chatgpt')
    cr.tables.usage_reservations.push({ id: 'crashed', user_id: USER, project_id: PROJECT, usage_type: 'ai_check', reserved_amount: 1, consumed_amount: 0,
      period_start: iso(NOW - 5 * DAY), period_end: iso(NOW + 25 * DAY), idempotency_key: crashKey, status: 'reserved', reserved_at: iso(NOW - 2 * 3600_000), reservation_token: 't', created_at: iso(NOW - 2 * 3600_000) })
    quiet(); await cron(cr); loud()
    check('B9: a check left "reserved" by a crash is not redone (2 of 3 run)', cr.calls.length === 2 && !cr.calls.some((c) => c.endsWith('|chatgpt')), show(cr.calls))
    void k
    // …while one released before dispatch is.
    const rel = world()
    rel.tables.usage_reservations.push({ id: 'rel', user_id: USER, project_id: PROJECT, usage_type: 'ai_check', reserved_amount: 1, consumed_amount: 0,
      period_start: iso(NOW - 5 * DAY), period_end: iso(NOW + 25 * DAY), idempotency_key: crashKey, status: 'released', release_reason: R.NOT_DISPATCHED_REASON,
      reserved_at: iso(NOW - DAY), reservation_token: 't', created_at: iso(NOW - DAY) })
    quiet(); await cron(rel); loud()
    check('B10: a check released before it reached the provider runs on the next day', rel.calls.length === 3 && rel.calls.some((c) => c.endsWith('|chatgpt')), show(rel.calls))

    // A provider error is consumed (the call ran) and stored; its text reaches no log.
    const er = world()
    logs.length = 0
    quiet(); await cron(er, { scan: async (i: any) => ({ ...okResult(i.engine), error: 'SECRET-PROVIDER-TEXT 500 upstream' }) }); loud()
    check('B11: an answered error counts as a check and is stored as an error', consumed(er) === 3 && er.tables.ai_scan_results.every((r: any) => r.status === 'error'))
    check('B12: no provider text is logged', !logs.some((l) => l.includes('SECRET-PROVIDER-TEXT')))
    // A throw: released with a reason that is never retried.
    const th = world()
    quiet(); await cron(th, { scan: async () => { throw new Error('boom') } }); const thCalls = th.calls.length; await cron(th); loud()
    check('B13: a throw releases the check and it is not dispatched again', consumed(th) === 0 && ledger(th).every((r: any) => r.status === 'released' && r.release_reason === 'provider_threw') && th.calls.length === thCalls, show(ledger(th).map((r: any) => r.status)))
    // Advanced: 2 questions; agency: 3.
    const adv = world({ plan: 'advanced' }); quiet(); await cron(adv); loud()
    check('B14: advanced runs 2 questions × 3 = 6', adv.calls.length === 6)
    const ag = world({ plan: 'large_agency' }); quiet(); await cron(ag); loud()
    check('B15: agency runs 3 questions × 3 = 9 per project', ag.calls.length === 9)
    const jp = world({ country: 'JP' }); quiet(); await cron(jp); loud()
    check('B16: a Japanese project runs ChatGPT and Perplexity only', show(jp.calls.map((c) => c.split('|')[1]).sort()) === show(['chatgpt', 'perplexity']))
    // Sticky questions: an earlier period's question keeps its place.
    const st = world()
    st.tables.usage_reservations.push({ id: 'old', user_id: USER, project_id: PROJECT, usage_type: 'ai_check', reserved_amount: 1, consumed_amount: 1,
      period_start: iso(NOW - 35 * DAY), period_end: iso(NOW - 5 * DAY), idempotency_key: C.scheduledKey(PROJECT, new Date(NOW - 35 * DAY), 'p3', 'chatgpt'),
      status: 'consumed', reserved_at: iso(NOW - 32 * DAY), consumed_at: iso(NOW - 32 * DAY), created_at: iso(NOW - 32 * DAY) })
    quiet(); await cron(st); loud()
    check('B17: the question checked last period is the one checked again (the trend stays real)', st.calls.every((c) => c.startsWith('מה זה צנרת')), show(st.calls))
    const sel = R.selectMonthlyQuestions([{ id: 'a', prompt: 'x' }, { id: 'b', prompt: 'y' }], [], 1, (t: string) => (t === 'y' ? 80 : 10))
    check('B18: with nothing earlier, the top-worth question is chosen', sel[0]?.id === 'b')
  }

  // ── C) skip rules ─────────────────────────────────────────────────────────
  say('\nC) skip rules')
  {
    const run = async (w: World, extra: Record<string, any> = {}) => { quiet(); const s = await cron(w, extra); loud(); return s }
    let w = world({ status: 'trial' }); let s = await run(w)
    check('C1: a trial runs nothing (no_active_subscription)', w.calls.length === 0 && s.skipped.no_active_subscription === 1, show(s))
    w = world({ status: 'past_due' }); s = await run(w)
    check('C2: past_due runs nothing (the existing entitlement logic reads it as no subscription)', w.calls.length === 0 && s.skipped.no_active_subscription === 1, show(s))
    w = world({ admin: true }); s = await run(w)
    check('C3: an admin account (not metered) runs nothing', w.calls.length === 0 && s.skipped.admin === 1)
    w = world({ prompts: 0 }); s = await run(w)
    check('C4: a project with no questions runs nothing', w.calls.length === 0 && s.skipped.no_questions === 1)
    w = world(); s = await run(w, { lastSignInAt: async () => iso(NOW - 31 * DAY) })
    check('C5: no sign-in for 31 days: skipped (inactive)', w.calls.length === 0 && s.skipped.inactive === 1)
    w = world(); s = await run(w, { lastSignInAt: async () => iso(NOW - 29 * DAY) })
    check('C6: a sign-in 29 days ago runs', w.calls.length === 3)
    w = world(); s = await run(w, { lastSignInAt: async () => 'unreadable' })
    check('C7: an unreadable sign-in is not spent on (retried the next day)', w.calls.length === 0 && s.skipped.login_unreadable === 1)
    w = world({ setting: false }); s = await run(w)
    check('C8: the project setting OFF runs nothing', w.calls.length === 0 && s.skipped.setting_off === 1)
    w = world({ setting: 'missing' }); s = await run(w)
    check('C9: a database without the setting column reads ON (the default)', w.calls.length === 3)
    w = world({ periodStartDaysAgo: 2 }); s = await run(w)
    check('C10: before day 3 of the period nothing runs', w.calls.length === 0 && s.skipped.not_due === 1)
    w = world({ periodStartDaysAgo: 20 }); s = await run(w)
    check('C11: after the window the cron leaves it (the tab offers "run now")', w.calls.length === 0 && s.skipped.window_closed === 1)
    w = world()
    w.tables.ai_scan_results.push({ id: 'r0', project_id: PROJECT, prompt_id: 'p2', engine: 'chatgpt', status: 'success', scanned_at: iso(NOW - 5 * DAY) })
    quiet(); const plan = await R.planMonthlyCheck(w.admin, w.tables.projects[0], { now: new Date(NOW) }); loud()
    const topId = plan.ok ? plan.pairs[0]?.promptId : null
    w.tables.ai_scan_results[0].prompt_id = topId
    s = await run(w)
    check('C12: a question checked on an engine in the last 21 days is not checked there again', w.calls.length === 2 && !w.calls.some((c) => c.endsWith('|chatgpt')), show(w.calls))
    w = world()
    w.tables.ai_scan_results.push({ id: 'r0', project_id: PROJECT, prompt_id: topId, engine: 'chatgpt', status: 'success', scanned_at: iso(NOW - 22 * DAY) })
    s = await run(w)
    check('C13: …and one checked 22 days ago is', w.calls.length === 3)
    // Missing period start (the one live paid subscription): the shared resolver's fallback.
    w = world({ periodStartNull: true, paypal: false, plan: 'large_agency' })
    s = await run(w)
    check('C14: an active manual subscription with no period start runs on its calendar-month period (Oct 1 + 3 days)', w.calls.length === 9 && ledger(w).every((r: any) => r.period_start === '2026-10-01T00:00:00.000Z'), show({ n: w.calls.length, s }))
    w = world({ periodStartNull: true, paypal: true })
    w.tables.subscriptions[0].current_period_end = null
    s = await run(w)
    check('C15: a PayPal subscription with no period at all is skipped, never guessed', w.calls.length === 0 && s.skipped.no_period === 1, show(s))
  }

  // ── D) the allowance ──────────────────────────────────────────────────────
  say('\nD) the allowance')
  {
    const used = (w: World, n: number) => { for (let i = 0; i < n; i++) w.tables.usage_reservations.push({ id: `m${i}`, user_id: USER, project_id: PROJECT, usage_type: 'ai_check', reserved_amount: 1, consumed_amount: 1, period_start: iso(NOW - 5 * DAY), period_end: iso(NOW + 25 * DAY), idempotency_key: `manual:${i}`, status: 'consumed', reserved_at: iso(NOW - DAY), consumed_at: iso(NOW - DAY), created_at: iso(NOW - DAY) }) }
    let w = world(); used(w, 6); quiet(); let s = await cron(w); loud()
    check('D1: 6 of 10 used: only 2 fit before the last two, so 2 run', w.calls.length === 2 && consumed(w) === 8, show({ calls: w.calls.length, s }))
    w = world(); used(w, 8); quiet(); s = await cron(w); loud()
    check('D2: 8 of 10 used: nothing runs (allowance_low), the last two stay the customer\'s', w.calls.length === 0 && s.skipped.allowance_low === 1 && consumed(w) === 8)
    // The ledger itself refuses: even a plan that ignored the budget cannot take the last two.
    w = world(); used(w, 8)
    quiet(); const p = await R.planMonthlyCheck(w.admin, w.tables.projects[0], { now: new Date(NOW) }); loud()
    const forced = { ...(p as any), pairs: (p as any).pairsDue ? (await R.planMonthlyCheck(world().admin, world().tables.projects[0], { now: new Date(NOW) }) as any).pairs : [] }
    quiet(); const out = await R.executeMonthlyPlan(w.admin, w.tables.projects[0], forced, { deadlineAt: Date.now() + 600_000, scan: deps(w).scan, now: () => new Date(NOW) }); loud()
    check('D3: reserve_usage refuses the 9th and 10th check (limit X − 2 at the ledger)', w.calls.length === 0 && out.stoppedBy === 'allowance' && consumed(w) === 8, show(out))
    const src = code('lib/ai-visibility/monthly-check/runner.ts')
    const sameGate = (s2: string) => /reserveUsage\(admin, \{[\s\S]{0,200}usageType: 'ai_check', amount: 1,[\s\S]{0,120}periodStart: period\.start, periodEnd: period\.end,[\s\S]{0,40}limit: Math\.max\(0, args\.limit - MONTHLY_AI_CHECK\.keepLastChecks\)/.test(s2)
    check('D4: the check is reserved through reserveUsage(\'ai_check\', 1) on the resolved period, limit X − 2', sameGate(src))
    check('D5: MUT the plain X as the limit fails D4', !sameGate(src.replace('limit: Math.max(0, args.limit - MONTHLY_AI_CHECK.keepLastChecks)', 'limit: args.limit')))
    check('D6: X is the manual route\'s own (maxAIScansPerPeriodPerProject)', /const limit = entitlement\.limits\.maxAIScansPerPeriodPerProject/.test(src)
      && /const limit = entitlement\.limits\.maxAIScansPerPeriodPerProject/.test(code('app/api/ai-visibility/runs/route.ts')))
    const { readUsageAllowance } = require('../../billing/usage-allowance.ts')
    w = world(); used(w, 4); quiet(); await cron(w); const a = await readUsageAllowance(w.admin, { userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject, nowMs: NOW }); loud()
    check('D7: the allowance the tab reads counts the automatic checks exactly like manual ones (4 + 3 = 7 of 10)', a.state === 'known' && a.used === 7 && a.remaining === 3, show(a))
    check('D8: the runner\'s count and the allowance reader\'s agree', R.ledgerUsed(w.tables.usage_reservations, NOW) === a.used)
  }

  // ── E) isolation and auth ─────────────────────────────────────────────────
  say('\nE) isolated from the rank schedule; the cron still authenticates first')
  {
    let ran = 0
    const env = { ENABLE_AI_VISIBILITY: 'true' }
    await R.startIsolatedMonthlyAiChecks(async () => { ran++; throw new Error('x') }, { startedAtMs: Date.now(), maxDurationMs: 300_000, env })
    check('E1: a task that throws resolves (never rejects into the cron)', ran === 1)
    let r2 = 0
    await R.startIsolatedMonthlyAiChecks(async () => { r2++ }, { startedAtMs: Date.now(), maxDurationMs: 300_000, env: { ENABLE_AI_VISIBILITY: 'false' } })
    await R.startIsolatedMonthlyAiChecks(async () => { r2++ }, { startedAtMs: Date.now(), maxDurationMs: 300_000, env: { ENABLE_AI_VISIBILITY: 'true', DISABLE_AI_MONTHLY_CHECK: 'true' } })
    await R.startIsolatedMonthlyAiChecks(async () => { r2++ }, { startedAtMs: Date.now() - 290_000, maxDurationMs: 300_000, env })
    check('E2: nothing runs with AI visibility off, the kill switch on, or no time left', r2 === 0)
    let deadlineSeen = 0
    await R.startIsolatedMonthlyAiChecks(async (d: number) => { deadlineSeen = d }, { startedAtMs: 1_000_000, maxDurationMs: 300_000, env, nowMs: () => 1_000_000 })
    check('E3: its deadline is what is left of maxDuration less the margin', deadlineSeen === 1_000_000 + 300_000 - R.MONTHLY_MARGIN_MS)
    const w = world()
    quiet(); const s = await R.runMonthlyAiChecks(w.admin, { deadlineAt: Date.now() + R.MONTHLY_CALL_TIMEOUT_MS, deps: deps(w) }); loud()
    check('E4: with too little time for one more call, the batch stops and resumes the next day', w.calls.length === 0 && s.stoppedBy === 'deadline', show(s))
    const broken = world(); broken.admin.from = () => { throw new Error('db down') }
    quiet(); let threw = false; try { await cron(broken) } catch { threw = true } loud()
    check('E5: an unreadable database is a logged outcome, never a throw', !threw)

    const route = code('app/api/schedule/route.ts')
    const order = (src: string) => {
      const auth = src.indexOf("authorizeCronRequest(request, 'Schedule')")
      const deny = src.indexOf('if (denied) return denied')
      const sched = src.indexOf('after(() => startIsolatedMonthlyAiChecks(')
      const rank = src.indexOf("from('projects')")
      return auth > 0 && deny > auth && sched > deny && rank > sched
    }
    check('E6: the cron authenticates first (fails closed), then schedules the AI check, then the rank work as before', order(route))
    check('E7: MUT scheduling before the auth check fails E6', !order(route.replace("const denied = authorizeCronRequest(request, 'Schedule')\n  if (denied) return denied", '') + "\nconst denied = authorizeCronRequest(request, 'Schedule')\n  if (denied) return denied"))
    const isolated = (src: string) => /try \{\s*after\(\(\) => startIsolatedMonthlyAiChecks\([\s\S]{0,200}\)\s*\} catch \{/.test(src)
      && /for \(const project of projects\) \{\s*const outcome = await processScheduledScanForProject\(admin, project, \{ now \}\)/.test(src)
    check('E8: the AI check runs in after(), inside a try, and the rank loop is unchanged', isolated(route))
    check('E9: MUT awaiting the AI check inline fails E8', !isolated(route.replace('after(() => startIsolatedMonthlyAiChecks(', 'await (() => startIsolatedMonthlyAiChecks(')))
    // The route itself, with no request scope for after(): the rank answer is unchanged.
    process.env.CRON_SECRET = 'qa-cron'
    ADMIN_CLIENT = world().admin
    const { GET } = require('../../../app/api/schedule/route.ts')
    quiet(); const noAuth = await GET(new Request('http://localhost/api/schedule')); const okRes = await GET(new Request('http://localhost/api/schedule', { headers: { authorization: 'Bearer qa-cron' } })); loud()
    const body = await okRes.json()
    check('E10: without the secret the cron refuses; with it the rank answer is as before', noAuth.status === 401 && okRes.status === 200 && body.message === 'No projects due for scanning', show({ s: noAuth.status, body }))
  }

  // ── F) the tab's route ────────────────────────────────────────────────────
  say('\nF) GET/POST/PUT /api/ai-visibility/monthly')
  {
    const M = require('../../../app/api/ai-visibility/monthly/route.ts')
    const w = world()
    ADMIN_CLIENT = w.admin
    USER_CLIENT = { auth: { getUser: async () => ({ data: { user: null } }) } }
    let res = await M.GET(new Request(`http://localhost/api/ai-visibility/monthly?projectId=${PROJECT}`))
    check('F1: no session → 401', res.status === 401)
    USER_CLIENT = { auth: { getUser: async () => ({ data: { user: { id: OTHER } } }) } }
    res = await M.GET(new Request(`http://localhost/api/ai-visibility/monthly?projectId=${PROJECT}`))
    const before = ROUTE_SCANS
    const post = await M.POST(new Request('http://localhost/api/ai-visibility/monthly', { method: 'POST', body: JSON.stringify({ projectId: PROJECT }) }))
    const put = await M.PUT(new Request('http://localhost/api/ai-visibility/monthly', { method: 'PUT', body: JSON.stringify({ projectId: PROJECT, enabled: false }) }))
    check('F2: another user\'s project → 403 on read, run and setting, and nothing runs', res.status === 403 && post.status === 403 && put.status === 403 && ROUTE_SCANS === before && w.tables.projects[0].ai_auto_check_enabled === true)
    USER_CLIENT = { auth: { getUser: async () => ({ data: { user: { id: USER } } }) } }
    quiet(); res = await M.GET(new Request(`http://localhost/api/ai-visibility/monthly?projectId=${PROJECT}`)); loud()
    const st = await res.json()
    check('F3: the owner reads the meter (used of X, by the automatic check, left) and the engines', res.status === 200 && st.limit === 10 && st.used === 0 && st.left === 10 && show(st.engines) === show(['chatgpt', 'gemini', 'google_ai_mode']), show(st))
    const putOk = await M.PUT(new Request('http://localhost/api/ai-visibility/monthly', { method: 'PUT', body: JSON.stringify({ projectId: PROJECT, enabled: false }) }))
    check('F4: the owner turns the setting off', putOk.status === 200 && w.tables.projects[0].ai_auto_check_enabled === false)
    quiet(); const off = await (await M.GET(new Request(`http://localhost/api/ai-visibility/monthly?projectId=${PROJECT}`))).json(); loud()
    check('F5: …and the tab says it is off', off.state === 'off')
    w.tables.projects[0].ai_auto_check_enabled = true
    const s = world({ periodStartDaysAgo: 20 }); ADMIN_CLIENT = s.admin
    quiet(); const sk = await R.readMonthlyCheckStatus(s.admin, s.tables.projects[0], deps(s, { lastSignInAt: async () => iso(NOW - 45 * DAY) })); loud()
    check('F6: a month the cron skipped for inactivity says so, with its number of checks', sk.state === 'skipped' && sk.skippedBecause === 'inactive' && sk.checks === 3, show(sk))
    // Another project of the same account ran its check this period: this project's month is still its own.
    s.tables.usage_reservations.push(otherProjectRun())
    quiet(); const sk2 = await R.readMonthlyCheckStatus(s.admin, s.tables.projects[0], deps(s, { lastSignInAt: async () => iso(NOW - 45 * DAY) })); loud()
    check('F6b: another project\'s automatic check does not make this project\'s month "ran" (still inactive, no last date)', sk2.state === 'skipped' && sk2.skippedBecause === 'inactive' && sk2.lastAt === null && sk2.autoUsed === 1, show(sk2))
    s.tables.usage_reservations.pop()
    const n0 = ROUTE_SCANS
    quiet(); const now1 = await M.POST(new Request('http://localhost/api/ai-visibility/monthly', { method: 'POST', body: JSON.stringify({ projectId: PROJECT }) })); const now2 = await M.POST(new Request('http://localhost/api/ai-visibility/monthly', { method: 'POST', body: JSON.stringify({ projectId: PROJECT }) })); loud()
    check('F7: "run now" runs the skipped checks once; pressing it again runs nothing', now1.status === 200 && ROUTE_SCANS - n0 === 3 && now2.status === 409, show({ a: now1.status, b: now2.status, n: ROUTE_SCANS - n0 }))
    const b2 = await now2.json()
    check('F8: its refusal is our own sentence in both languages, no provider text', typeof b2.error === 'string' && typeof b2.errorEn === 'string' && !/scrapellm|upstream/i.test(JSON.stringify(b2)))
    const sc = world({ periodStartDaysAgo: 1 })
    quiet(); const up = await R.readMonthlyCheckStatus(sc.admin, sc.tables.projects[0], deps(sc)); loud()
    check('F9: before it is due the tab shows the date (period start + 3 days, 06:00 UTC) and 3 checks', up.state === 'scheduled' && up.checks === 3 && up.nextAt === C.cronTickAtOrAfter(C.monthlyDueAt(new Date(NOW - DAY))).toISOString(), show(up))
    const dn = world(); quiet(); await cron(dn); const done = await R.readMonthlyCheckStatus(dn.admin, dn.tables.projects[0], deps(dn)); loud()
    check('F10: after the run the tab counts 3 by the automatic check and names the next period', done.state === 'done' && done.autoUsed === 3 && done.used === 3 && done.left === 7 && done.nextAt > iso(NOW + 20 * DAY), show(done))
    const tr = world({ status: 'trial' }); quiet(); const trs = await R.readMonthlyCheckStatus(tr.admin, tr.tables.projects[0], deps(tr)); loud()
    check('F11: a trial is not included (its 3 checks stay manual)', trs.state === 'not_included')
  }

  // ── C/D MUTATION CONTROLS: the real runner with one rule removed, run on the same world.
  say('\nM) mutation controls: each rule removed from a copy of the runner, the same case now spends')
  {
    const { writeFileSync, unlinkSync, mkdirSync, rmdirSync, readdirSync } = require('fs')
    const src = read('lib/ai-visibility/monthly-check/runner.ts')
    const mutate = async (name: string, from: string, to: string, scenario: (RM: any) => Promise<boolean>) => {
      if (!src.includes(from)) { check(`${name}: (rule text not found)`, false, from); return }
      // Written under a __qa__ folder (every source walker skips those) and removed after.
      const dir = join(ROOT, 'lib/ai-visibility/monthly-check/__qa__')
      mkdirSync(dir, { recursive: true })
      const file = join(dir, `runner.mut-${process.pid}-${pass + fail}.ts`)
      writeFileSync(file, src.replace(from, to).replace("from './config'", "from '../config'"))
      try {
        const RM = require(file)
        quiet(); const spentMore = await scenario(RM); loud()
        check(name, spentMore)
      } finally {
        loud(); unlinkSync(file)
        try { if (readdirSync(dir).length === 0) rmdirSync(dir) } catch { /* another run's file */ }
      }
    }
    const cronWith = (RM: any, w: World, extra: Record<string, any> = {}) => RM.runMonthlyAiChecks(w.admin, { deadlineAt: Date.now() + 600_000, deps: deps(w, extra) })
    await mutate('M1: without the inactivity rule, the 31-days-away account spends (C5 catches it)',
      "if (!isRecentlyActive(login, at)) { skip('inactive'); continue }", '',
      async (RM) => { const w = world(); await cronWith(RM, w, { lastSignInAt: async () => iso(NOW - 31 * DAY) }); return w.calls.length > 0 })
    // (A trial would still spend nothing without this rule: its X is 0, so its
    // question count is 0. The rule is the first line; the count is the second.)
    await mutate('M2: without the subscription rule a trial is no longer refused as such (C1 catches it)',
      "if (!entitlement.hasActiveSubscription || !isPlanCode(entitlement.plan)) return { ok: false, reason: 'no_active_subscription' }", '',
      async (RM) => { const w = world({ status: 'trial' }); const s2 = await cronWith(RM, w); return !s2.skipped.no_active_subscription })
    await mutate('M3: without the budget cut, a project at 8 of 10 still tries (D2 catches it; the ledger refuses)',
      'pairs: due.slice(0, budget)', 'pairs: due',
      async (RM) => { const w = world(); for (let i = 0; i < 8; i++) w.tables.usage_reservations.push({ id: `m${i}`, user_id: USER, project_id: PROJECT, usage_type: 'ai_check', reserved_amount: 1, consumed_amount: 1, period_start: iso(NOW - 5 * DAY), period_end: iso(NOW + 25 * DAY), idempotency_key: `manual:${i}`, status: 'consumed', reserved_at: iso(NOW - DAY), created_at: iso(NOW - DAY) })
        const s2 = await cronWith(RM, w); return !s2.skipped.allowance_low && consumed(w) === 8 })
    await mutate('M4: without the 21-day rule, a pair checked 5 days ago is checked again (C12 catches it)',
      "if (recent.has(`${q.id}:${engine}`)) continue", '',
      async (RM) => { const w = world(); const p0 = await RM.planMonthlyCheck(w.admin, w.tables.projects[0], { now: new Date(NOW) })
        w.tables.ai_scan_results.push({ id: 'r0', project_id: PROJECT, prompt_id: p0.pairs[0].promptId, engine: 'chatgpt', status: 'success', scanned_at: iso(NOW - 5 * DAY) })
        await cronWith(RM, w); return w.calls.some((c) => c.endsWith('|chatgpt')) })
    await mutate('M5: without the existing-key rule, a crash-left check is dispatched again (B9 catches it)',
      "if (existing && !(existing.status === 'released' && existing.releaseReason === NOT_DISPATCHED_REASON)) continue", '',
      async (RM) => { const w = world(); const p0 = await RM.planMonthlyCheck(w.admin, w.tables.projects[0], { now: new Date(NOW) })
        const key = C.scheduledKey(PROJECT, new Date(NOW - 5 * DAY), p0.pairs[0].promptId, 'chatgpt')
        w.tables.usage_reservations.push({ id: 'crashed', user_id: USER, project_id: PROJECT, usage_type: 'ai_check', reserved_amount: 1, consumed_amount: 0, period_start: iso(NOW - 5 * DAY), period_end: iso(NOW + 25 * DAY), idempotency_key: key, status: 'reserved', reserved_at: iso(NOW - 2 * 3600_000), reservation_token: 't', created_at: iso(NOW - 2 * 3600_000) })
        await cronWith(RM, w); return w.calls.some((c) => c.endsWith('|chatgpt')) })
    await mutate('M6: without the setting, an OFF project spends (C8 catches it)',
      "if (!(await readAutoCheckSetting(admin, project.id, userId))) return { ok: false, reason: 'setting_off' }", '',
      async (RM) => { const w = world({ setting: false }); await cronWith(RM, w); return w.calls.length > 0 })
    await mutate('M7: without the no-questions rule the run is not skipped as such (C4 catches it)',
      "if (prompts.length === 0) return { ok: false, reason: 'no_questions' }", '',
      async (RM) => { const w = world({ prompts: 0 }); const s2 = await cronWith(RM, w); return !s2.skipped.no_questions })
    await mutate('M8: with "ran this period" read account-wide, another project\'s run hides this one\'s inactivity (F6b catches it)',
      "    if (!parsed || parsed.projectId !== project.id) continue\n    // \"Ran this period\" is this project's own check only.\n    if (status === 'consumed' || status === 'partially_consumed') {",
      "    if (status === 'consumed' || status === 'partially_consumed') {",
      async (RM) => { const w = world({ periodStartDaysAgo: 20 }); w.tables.usage_reservations.push(otherProjectRun())
        const st = await RM.readMonthlyCheckStatus(w.admin, w.tables.projects[0], deps(w, { lastSignInAt: async () => iso(NOW - 45 * DAY) })); return st.skippedBecause !== 'inactive' })
  }

  // ── G) what the customer sees ─────────────────────────────────────────────
  say('\nG) the AI tab: hero meter and next date, skipped month, setting, recheck, tag')
  {
    const { createElement } = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const { DashboardLanguageProvider } = require('../../i18n/dashboard/useDashboardLanguage')
    const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary')
    const Mo = require('../../../components/ai-visibility/overview-model')
    const { OverviewOpeningCard, OverviewStatusBar, RecentActivity, formatWhen } = require('../../../components/ai-visibility/OverviewRows')
    const text = (h: string) => h.replace(/<[^>]+>/g, ' ').replace(/&#x27;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&').replace(/\s+/g, ' ')
    const meter = { engines: ['chatgpt', 'gemini', 'google_ai_mode'], limit: 10, used: 5, autoUsed: 3, left: 5, checks: 3, lastAt: null, skippedBecause: null }
    const next = '2026-11-04T06:00:00.000Z'
    for (const locale of ['he', 'en'] as const) {
      const c = getDashboardDictionary(locale).aiVisibilityOverview
      const card = (monthly: unknown, extra: Record<string, unknown> = {}) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale },
        createElement(OverviewOpeningCard, { overview: Mo.buildOverview([]), questionsPending: false, questionsSuggested: null, questionsCount: 2, onChooseQuestions: () => {}, monthly, onRunMonthlyNow: () => {}, onToggleMonthly: () => {}, ...extra })))
      const sched = card({ state: 'scheduled', ...meter, nextAt: next })
      const names = locale === 'he' ? 'ChatGPT, Gemini, Google AI' : 'ChatGPT, Gemini, Google AI'
      check(`G1 ${locale}: the hero shows "${c.autoMeter(5, 10, 3, 5)}"`, text(sched).includes(c.autoMeter(5, 10, 3, 5)))
      check(`G2 ${locale}: …and the next automatic check with its engines`, text(sched).includes(c.autoNext(formatWhen(next, locale, true), names)))
      check(`G3 ${locale}: …and the setting, ON`, /role="switch"[^>]*aria-checked="true"/.test(sched) && text(sched).includes(c.autoSettingLabel) && text(sched).includes(c.autoSettingBody(10)))
      check(`G4 ${locale}: MUT no status → no panel (a trial or admin sees none of it)`, !card(null).includes('data-ai-auto-check') && !card({ state: 'not_included' }).includes('data-ai-auto-check'))
      const sk = card({ state: 'skipped', ...meter, nextAt: next, skippedBecause: 'inactive' })
      check(`G5 ${locale}: a month skipped for inactivity says why and offers "${c.autoRunNow}"`, text(sk).includes(c.autoSkippedInactive(3)) && sk.includes('data-ai-auto-run-now') && text(sk).includes(c.autoRunNow))
      const off = card({ state: 'off', ...meter, nextAt: null })
      check(`G6 ${locale}: OFF says every check is manual, and the switch reads off`, text(off).includes(c.autoOff) && /aria-checked="false"/.test(off) && !off.includes('data-ai-auto-next'))
      const bar = (monthly: unknown) => text(renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale }, createElement(OverviewStatusBar, { overview: Mo.buildOverview([]), questionsPending: false, monthly }))))
      check(`G7 ${locale}: the status bar\'s next check is the date; manual without the automatic check`, bar({ state: 'scheduled', ...meter, nextAt: next }).includes(formatWhen(next, locale, true)) && bar(null).includes(c.nextCheckManual))
      const act = text(renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale }, createElement(RecentActivity, { overview: Mo.buildOverview(Mo.readRuns([
        { id: 'a', status: 'completed', triggeredBy: 'scheduled', createdAt: iso(NOW), completedAt: iso(NOW), results: [{ engine: 'gemini', status: 'success', displayMentioned: false, displayCited: false, promptId: 'p1', promptText: 'q' }] },
        { id: 'b', status: 'completed', triggeredBy: 'manual', createdAt: iso(NOW - DAY), completedAt: iso(NOW - DAY), results: [{ engine: 'chatgpt', status: 'success', displayMentioned: false, displayCited: false, promptId: 'p1', promptText: 'q' }] },
      ])) }))))
      check(`G8 ${locale}: automatic results carry the "${c.autoTag}" tag, manual ones do not`, act.split(c.autoTag).length === 2)
      if (locale === 'he') {
        const heb = [c.autoMeter(1, 2, 3, 4), c.autoSkippedInactive(3), c.autoSkippedMissed(3), c.autoRunNow, c.autoOff, c.autoNoQuestions, c.autoSettingLabel, c.autoTag, c.nextCheckManualHint]
        check('G9 he: every new line is Hebrew (Latin only in engine names)', heb.every((l) => !/[A-Za-z]/.test(l.replace(/ChatGPT|Gemini|Google AI|AI/g, ''))))
      }
    }
    const I = require('../i18n.ts')
    const he = I.createI18n('he'), en = I.createI18n('en')
    check('G10: the recheck and menu words exist in both languages', he('recheck_question_all') === 'בדיקה חוזרת ({n} בדיקות)' && en('recheck_question_all') === 'Recheck ({n} checks)'
      && he('recheck_not_enough') === 'אין מספיק בדיקות החודש' && he('check_on_engine_menu') === 'בדיקה ב-{engine} (בדיקה אחת)' && !!en('check_on_engine_menu'))
    const sec = code('components/ai-visibility/AIVisibilitySection.tsx')
    const noChooser = (s2: string) => !/onClick=\{\(\) => !scanning && scanEngine\(p\.id, engine\)\}/.test(s2) && /data-chip-outcome=/.test(s2) && /<span\s+role="img"\s+title=\{statusLabel\}/.test(s2)
    check('G11: the engine chooser is off the main surface: the chips are status, not buttons', noChooser(sec))
    check('G12: MUT a chip that dispatches again fails G11', !noChooser(sec + '\n<button onClick={() => !scanning && scanEngine(p.id, engine)} />'))
    const guard = (s2: string) => /const notEnough = knownLeft !== null && knownLeft < n/.test(s2) && /disabled=\{busy \|\| notEnough\}/.test(s2) && /\{notEnough && \([\s\S]{0,200}t\('recheck_not_enough'\)/.test(s2)
    check('G13: the recheck is disabled with "not enough checks this month" below its cost', guard(sec))
    check('G14: MUT a recheck that ignores the allowance fails G13', !guard(sec.replace('const notEnough = knownLeft !== null && knownLeft < n', 'const notEnough = false')))
    check('G15: the recheck runs the monthly engines for the project\'s country', /const recheckEngines = useMemo\(\(\) => monthlyEngines\(projectCountry\), \[projectCountry\]\)/.test(sec))
  }

  // ── H) the promise text, and nothing else moved ─────────────────────────────
  say('\nH) copy that had become false, and the files that must not change')
  {
    const heD = read('lib/i18n/dashboard/he.ts'), enD = read('lib/i18n/dashboard/en.ts')
    check('H1: "AI checks do not run automatically" is gone (he/en)', !heD.includes('בדיקות AI לא רצות אוטומטית') && !enD.includes('AI checks do not run on their own'))
    check('H2: the replacement line says both kinds count toward the same allowance', heD.includes('חוץ מהבדיקה החודשית האוטומטית, בדיקות AI רצות רק כשאתם מפעילים אותן. כל בדיקה, אוטומטית או ידנית, נספרת מאותה מכסה.')
      && enD.includes('Apart from the automatic monthly check, AI checks run only when you start them. Every check, automatic or manual, counts toward the same allowance.'))
    const { execSync } = require('child_process')
    // "Up to X" is a ceiling, not a promise to spend it. The billing note and the pricing definitions were rewritten in
    // plain words (w16-plancopy), so they are no longer byte-identical to 8b468a8; what must survive is the ceiling
    // wording: every plan line says "up to", the note still says unused allowance does not roll over, and neither
    // says a check runs on its own.
    const note = (src: string) => (src.match(/keywordCheckNote:[^\n]*/g) ?? []).join('\n')
    const featuresSrc = read('lib/plans/features.ts')
    check('H3: the billing note keeps "unused allowance does not roll over" (he/en)',
      /לא עוברת הלאה/.test(note(heD)) && /do not roll over/.test(note(enD)), note(heD))
    check('H3a: the plan lines keep the "up to" ceiling for the three allowances (he/en)',
      (featuresSrc.match(/`עד \$\{c\.max(Google|AI)Checks/g) ?? []).length === 4 && (featuresSrc.match(/`Up to \$\{c\.max(Google|AI)Checks/g) ?? []).length === 4)
    check('H3b: MUT dropping the rollover sentence from the billing note fails H3',
      !/לא עוברת הלאה/.test(note(heD.replace(' יתרה שלא נוצלה לא עוברת הלאה.', ''))))
    let pricingFiles = ''
    try { pricingFiles = execSync('git diff --name-only 8b468a8 -- lib/plans/catalog.ts', { cwd: ROOT }).toString().trim() } catch { pricingFiles = 'git unavailable' }
    check('H3c: the catalog (every number the lines print) is untouched', pricingFiles === '', pricingFiles)
    let untouched = ''
    try { untouched = execSync('git diff --name-only 8b468a8 -- lib/plans/catalog.ts lib/shopify lib/billing lib/quota.ts supabase/migrations/20260829000000_add_usage_reservations_and_billing_periods.sql', { cwd: ROOT }).toString().trim() } catch { untouched = 'git unavailable' }
    // w17 (owner decision 2026-10-02, currency by country) deliberately changed the billing MARKET files only;
    // every other plan/price/quota/billing/entitlement/Shopify file must still be untouched.
    const W17 = /^(lib\/billing\/(market\.ts|server-market\.ts|billing-market-selection\.ts|__qa__\/(w17-billing-market|billing-market-selection|billing-market-select-route)\.qa\.ts)|lib\/plans\/__qa__\/pricing-copy-and-layout\.qa\.ts)$/
    untouched = untouched.split('\n').filter((f) => f && !W17.test(f)).join('\n')
    // Oren 2026-10-06: a Shopify store gets the project's article design and call to action. The
    // Shopify publisher may differ from 8b468a8 ONLY by that one design step (no billing, plan or quota line).
    const designOnly = (file: string) => {
      let d = ''
      try { d = execSync(`git diff -U0 8b468a8 -- ${file}`, { cwd: ROOT }).toString() } catch { return false }
      const added = d.split('\n').filter((l) => l.startsWith('+') && !l.startsWith('+++')).map((l) => l.slice(1).trim())
        .filter((l) => l && !l.startsWith('//') && !l.startsWith('*') && !l.startsWith('/*'))
      return added.length > 0 && added.every((l) => /applyArticleDesign/.test(l))
    }
    untouched = untouched.split('\n').filter((f) => f && !(f === 'lib/shopify/publish-article.ts' && designOnly(f))).join('\n')
    // Owner 2026-10-05: the Shopify App Store connect deliberately finishes a
    // PayPal→Shopify migration on app load (lib/shopify/app-load-billing-sync.ts).
    // It changes no plan, price or quota; only these files, and none of the
    // catalog/quota files above, may differ for it.
    const APP_STORE_CONNECT = new Set([
      'lib/shopify/app-load-billing-sync.ts', 'lib/shopify/client.ts',
      'lib/shopify/billing-return-processing.ts', 'lib/shopify/paypal-migration.ts',
      'lib/shopify/__qa__/app-store-connect.qa.ts', 'lib/shopify/__qa__/billing-reconciliation-incident.qa.ts',
    ])
    untouched = untouched.split('\n').filter((f) => f && !APP_STORE_CONNECT.has(f)).join('\n')
    // Owner 2026-10-09: no double billing (PayPal + Shopify). A connected store
    // blocks a NEW PayPal subscription, a migrating PayPal subscriber keeps the
    // paid period, and failed PayPal cancels are retried and alerted. No plan,
    // price or quota file changes; only these billing-flow files may differ.
    const NO_DOUBLE_BILLING = new Set([
      'lib/shopify/paypal-block.ts', 'lib/shopify/paypal-paid-period.ts', 'lib/shopify/paypal-migration-retry.ts',
      'lib/shopify/__qa__/no-double-billing.qa.ts', 'lib/shopify/__qa__/phase2-billing.qa.ts',
      'lib/shopify/__qa__/phase2-billing-intent.qa.ts', 'lib/shopify/__qa__/phase2-blockers.qa.ts',
      'lib/billing/__qa__/provider-matrix.qa.ts', 'lib/shopify/__qa__/phase3-reconnect-after-uninstall.qa.ts',
    ])
    untouched = untouched.split('\n').filter((f) => f && !NO_DOUBLE_BILLING.has(f)).join('\n')
    check('H4: plans, prices, quotas, billing, entitlement and Shopify files are untouched', untouched === '', untouched)
    // lib/subscription.ts may differ from 8b468a8 ONLY on the display-only trial line (PLAN_FEATURES.trial); nothing of entitlement moved.
    let subDiff = ''
    try { subDiff = execSync('git diff -U0 8b468a8 -- lib/subscription.ts', { cwd: ROOT }).toString() } catch { subDiff = 'git unavailable' }
    const changed = subDiff.split('\n').filter((l: string) => /^[+-]/.test(l) && !/^(\+\+\+|---)/.test(l))
    check('H4b: lib/subscription.ts changed only the display-only trial lines and their import', changed.every((l: string) => /trial:|trialLimitLines|planLimitLines/.test(l)), changed.join(' ;; ').slice(0, 300))
  }

  say(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { loud(); say(e); process.exit(1) })
export {}
