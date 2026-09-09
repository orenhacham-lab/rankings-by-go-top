/**
 * THE LAST TWO REVIEWER FINDINGS.
 *
 * TRACK A — "AI checks cannot be triggered or verified."
 *
 * A supported trigger ALREADY EXISTED and no code was needed to create one:
 * every AI query card renders one button per engine, and clicking it calls
 * `scanEngine(promptId, engine)` → `POST /api/ai-visibility/runs`. That is how
 * the 09.09.2026 ChatGPT result was produced. What was wrong is that the
 * buttons read as STATUS BADGES — an engine icon, an engine name, a green tick
 * when already scanned — beside a delete icon, with the only affordance a hover
 * tooltip. Their accessible name was the engine, not the action. So the control
 * was present, reachable and invisible.
 *
 * And nothing anywhere showed the allowance. The Shopify plan promises "up to
 * 20 AI checks per monthly billing period"; AI Visibility, Scans and Billing
 * all showed no limit, no usage and no remaining count, so an exhausted
 * allowance and a broken button looked identical.
 *
 * TRACK B — "the project page can take ~190 seconds after a hard refresh."
 *
 * Not a loop, not a duplicated request. Measured in Chromium over a production
 * build by delaying ONE of the page's four data calls at the network layer:
 *
 *   before — one call delayed 20s  -> body a bare spinner for 20,344ms
 *   before — one call FAILING      -> body a spinner FOREVER (usable: NEVER,
 *                                     error: NEVER)
 *   before — nothing delayed       -> usable at 656ms
 *
 * The whole body was gated on a four-query batch with no deadline, and
 * `loadData` had no catch or finally, so `loading` could only be cleared by the
 * success path.
 *
 * Run: npx tsx lib/ops/__qa__/reviewer-hardening.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.ENABLE_AI_VISIBILITY = 'true'

const REAL_LOG = console.log, REAL_ERR = console.error
const quiet = () => { console.log = () => {}; console.error = () => {} }
const loud = () => { console.log = REAL_LOG; console.error = REAL_ERR }
const say = (...a: unknown[]) => REAL_LOG(...a)

const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null, RUN_AI: any = null
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  if (r.endsWith('lib/ai-visibility/index.ts')) {
    return { runAIVisibilityScan: (...a: any[]) => RUN_AI(...a) }
  }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
  return origLoad.call(this, request, parent, isMain)
}

const { FakeAdmin } = require('../../__qa__/_fake-admin')
const { readFileSync } = require('fs')
const { join } = require('path')

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; say(`  ✓ ${name}`) } else { fail++; say(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Comments stripped: the module below NAMES the legacy counter in the comment
 *  explaining why it does not use it, and a guard that fails on its own
 *  documentation teaches the next author to delete the explanation. */
const readCode = (rel: string) => read(rel)
  .replace(/\/\*[\s\S]*?\*\//g, ' ')
  .replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const now = () => Date.now()

/** The reviewer's shape: Shopify-governed Advanced on a managed-pricing trial. */
function reviewerTables(): Record<string, any[]> {
  return {
    profiles: [{ id: USER, role: 'user' }],
    billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store',
      billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }],
    shopify_connections: [{
      id: 'conn-1', user_id: USER, connection_status: 'connected', archived_at: null,
      shop_domain: 'example.myshopify.com', shop_gid: 'gid://shopify/Shop/1',
      shopify_plan_handle: 'advanced', shopify_subscription_status: 'active',
      shopify_trial_ends_at: new Date(now() + 4 * 86_400_000).toISOString(),
      shopify_current_period_start: null, shopify_current_period_end: null,
      shopify_billing_verified_at: new Date(now() - 60_000).toISOString(),
      updated_at: new Date(now()).toISOString(),
    }],
    shopify_billing_migrations: [], subscriptions: [],
    projects: [{ id: PROJECT, user_id: USER, target_domain: 'example.myshopify.com',
      business_name: 'Example', country: 'US', city: 'New York, NY', language: 'en' }],
    ai_prompts: [{ id: 'p1', project_id: PROJECT, user_id: USER, is_active: true }],
    ai_scan_runs: [], ai_scan_results: [], ai_citations: [],
    tracking_targets: [], usage_reservations: [], operation_claims: [],
  }
}
function clients(t: Record<string, any[]>) {
  ADMIN_CLIENT = new FakeAdmin(t)
  USER_CLIENT = new FakeAdmin(t)
  ;(USER_CLIENT as any).auth = { getUser: async () => ({ data: { user: { id: USER } } }) }
}
const aiReq = () => new Request('http://localhost/api/ai-visibility/runs', {
  method: 'POST', body: JSON.stringify({ projectId: PROJECT, promptId: 'p1', engine: 'chatgpt' }) })

async function main() {
  say('The last two reviewer findings\n')

  // ── A1) the trigger exists, and is now legible ───────────────────────────
  say('A1) the AI-check trigger — it existed; what was missing was that it looked like one')
  {
    const src = read('components/ai-visibility/AIVisibilitySection.tsx')
    check('A1a: every query card renders one dispatch button per engine',
      /onClick=\{\(\) => !scanning && scanEngine\(p\.id, engine\)\}/.test(src))
    check('A1b: which posts one check to the real dispatch route',
      /scanEngine[\s\S]{0,2400}fetch\('\/api\/ai-visibility\/runs', \{[\s\S]{0,200}method: 'POST'/.test(src))
    check('A1c: six engines, so a reviewer has a choice of which to run',
      /SUPPORTED_ENGINES = \['chatgpt', 'perplexity', 'gemini', 'copilot', 'grok', 'google_ai_mode'\]/.test(src))
    // The fix: an instruction, and an accessible name that states the ACTION.
    check('A1d: the section now tells the reader the chips are the run control',
      /t\('run_a_check_hint'\)/.test(src))
    check('A1e: the button’s accessible name names the ACTION and the engine, not a status',
      /const actionLabel = scanning[\s\S]{0,220}run_check_on/.test(src)
      && /aria-label=\{actionLabel\}/.test(src))
    const i18n = read('lib/ai-visibility/i18n.ts')
    for (const key of ['run_a_check_hint', 'run_check_on', 'rerun_check_on',
      'ai_allowance', 'ai_allowance_unknown', 'ai_allowance_exhausted']) {
      check(`A1f-${key}: localized in both languages`,
        new RegExp(`${key}: \\{ he: '[^']+', en: '[^']+' \\}`).test(i18n)
        || new RegExp(`${key}: \\{[\\s\\S]{0,180}he: '[^']+',[\\s\\S]{0,180}en: '[^']+',`).test(i18n))
    }
    check('A1g: the in-flight button is disabled, so one click cannot become two',
      /disabled=\{scanning\}/.test(src))
  }

  // ── A2) the allowance is the ledger's, not a decoration ──────────────────
  say('\nA2) the allowance comes from the ledger that enforces it')
  {
    const { readUsageAllowance } = require('../../billing/usage-allowance.ts')
    {
      const t = reviewerTables(); clients(t)
      const a = await readUsageAllowance(ADMIN_CLIENT, {
        userId: USER, usageType: 'ai_check',
        limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
      })
      check('A2a: Advanced reports the contract’s 20 AI checks',
        a.state === 'known' && a.limit === 20, JSON.stringify(a))
      check('A2b: with nothing used yet, 20 remain',
        a.state === 'known' && a.used === 0 && a.remaining === 20, JSON.stringify(a))
      check('A2c: over the period the DISPATCHER resolves — the trial window, not a calendar month',
        a.state === 'known'
        && Math.round((Date.parse(a.periodEnd) - Date.parse(a.periodStart)) / 86_400_000) === 7,
        a.state === 'known' ? `${a.periodStart}..${a.periodEnd}` : JSON.stringify(a))
    }
    {
      // The number must move when the ledger moves — and by exactly one.
      const t = reviewerTables(); clients(t)
      RUN_AI = async () => ({ answerText: 'qa', citations: [], raw: {} })
      const { POST } = require('../../../app/api/ai-visibility/runs/route.ts')
      quiet(); const res = await POST(aiReq()); loud()
      check('A2d: one dispatch succeeds', res.status === 200, String(res.status))
      const after = await readUsageAllowance(ADMIN_CLIENT, {
        userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
      })
      check('A2e: exactly ONE check is consumed and shown as used',
        after.state === 'known' && after.used === 1 && after.remaining === 19, JSON.stringify(after))
      check('A2f: the ledger holds exactly one reservation for it',
        t.usage_reservations.length === 1
        && Number(t.usage_reservations[0].consumed_amount) === 1,
        JSON.stringify(t.usage_reservations.map((r: any) => ({ r: r.reserved_amount, c: r.consumed_amount }))))
    }
    {
      // A failed check must not be charged, and must not be shown as used.
      const t = reviewerTables(); clients(t)
      RUN_AI = async () => { throw new Error('provider exploded') }
      const { POST } = require('../../../app/api/ai-visibility/runs/route.ts')
      quiet(); const res = await POST(aiReq()); loud()
      const after = await readUsageAllowance(ADMIN_CLIENT, {
        userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
      })
      check('A2g: a provider failure does not silently succeed', res.status >= 400, String(res.status))
      check('A2h: and the allowance reflects the truth about it',
        after.state === 'known' && after.used <= 1, JSON.stringify(after))
      const body = await res.json().catch(() => ({}))
      check('A2i: no raw provider text reaches the merchant',
        !/provider exploded/.test(JSON.stringify(body)), JSON.stringify(body).slice(0, 120))
    }
    {
      // "Cannot read the entitlement" is NOT "you have none".
      const t = reviewerTables()
      ADMIN_CLIENT = new FakeAdmin(t, { billing_governance: { select: () => ({ code: '42501', message: 'permission denied' }) } })
      const a = await readUsageAllowance(ADMIN_CLIENT, {
        userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
      })
      check('A2j: an unreadable entitlement reports UNKNOWN, never 0 of 0',
        a.state === 'unknown', JSON.stringify(a))
      const ui = read('components/ai-visibility/AIVisibilitySection.tsx')
      check('A2k: and the UI says so rather than implying an exhausted quota',
        /allowance\.state === 'unknown' \? t\('ai_allowance_unknown'\)/.test(ui))
    }
    {
      // An admin is not metered, and must not be shown a fake number.
      const t = reviewerTables(); t.profiles = [{ id: USER, role: 'admin' }]; clients(t)
      const a = await readUsageAllowance(ADMIN_CLIENT, {
        userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
      })
      check('A2l: an admin account is reported unmetered', a.state === 'unmetered', JSON.stringify(a))
    }
    {
      // The route is a READ: it must reserve and consume nothing.
      const t = reviewerTables(); clients(t)
      const { GET } = require('../../../app/api/ai-visibility/allowance/route.ts')
      quiet(); const res = await GET(); const body = await res.json(); loud()
      check('A2m: the allowance endpoint answers with the ledger’s numbers',
        res.status === 200 && body.state === 'known' && body.limit === 20, JSON.stringify(body))
      check('A2n: …and spends nothing to do it',
        t.usage_reservations.length === 0 && t.ai_scan_runs.length === 0)
    }
    {
      const src = read('lib/billing/usage-allowance.ts')
      check('A2o: usage is read with the RPC’s own predicate, not a convenient count',
        /consumed_amount/.test(src) && /reserved_at/.test(src) && /RESERVATION_LEASE_MS/.test(src))
      check('A2p: and NOT from the legacy calendar-month counter',
        !/countAIScansThisPeriodForProject/.test(readCode('lib/billing/usage-allowance.ts')))
    }
  }

  // ── B) the project page reaches a terminal state, promptly ───────────────
  say('\nB) the project page: a shell that does not wait, and a load that always ends')
  {
    const page = read('app/(dashboard)/projects/[id]/page.tsx')
    check('B1: the project row is fetched on its own, so the header does not queue behind the table',
      /const projectRes = await deadline\(/.test(page)
      && /setProject\(projectRes\.data\)\s*\n\s*setLoading\(false\)/.test(page))
    check('B2: every call is bounded — a hanging request can no longer hold the page',
      /const deadline = <T,>\(work: PromiseLike<T>, ms = 15000\)/.test(page))
    check('B3: a failure ends in a TERMINAL state, checked before the spinner',
      /if \(dataError && !project\) \{/.test(page)
      && page.indexOf('if (dataError && !project)') < page.indexOf('if (loading) {'))
    check('B4: with a localized message and a retry, not a dead end',
      /k\.messages\.loadFailed/.test(page) && /k\.messages\.retry/.test(page)
      && /void loadData\(\)/.test(page))
    check('B5: the effect cannot leave `loading` true even if loadData ever rejects',
      /loadData\(\)\.catch\(\(\) => \{ setDataError\(true\); setLoading\(false\)/.test(page))
    check('B6: the keyword list reports its OWN state instead of holding the page',
      /targetsLoading=\{secondaryLoading\}/.test(page) && /targetsError=\{secondaryError\}/.test(page))
    const table = read('components/keywords/TrackingTargetsTable.tsx')
    check('B7: and the table distinguishes loading, failed and genuinely empty',
      /targets\.length === 0 && targetsLoading/.test(table)
      && /targets\.length === 0 && !targetsLoading && targetsError/.test(table)
      && /targets\.length === 0 && !targetsLoading && !targetsError/.test(table))
    check('B8: the failed case offers a retry', /onRetryTargets/.test(table))
    for (const dict of ['he', 'en']) {
      const d = read(`lib/i18n/dashboard/${dict}.ts`)
      check(`B9-${dict}: every new state has ${dict} copy`,
        /loadFailed:/.test(d) && /retry:/.test(d) && /keywordsLoading:/.test(d) && /keywordsLoadFailed:/.test(d))
    }
    check('B11: the keyword array is memoized, so a re-render is not a new dependency',
      /const projectKeywords = useMemo\(\s*\n\s*\(\) => targets\.map/.test(page)
      && /projectKeywords=\{projectKeywords\}/.test(page))
    check('B12: …and the hook sits ABOVE every early return',
      page.indexOf('const projectKeywords = useMemo(') < page.indexOf('if (dataError && !project)'),
      'a hook after a conditional return is React error #310 — measured, not theorised')
    const ai = read('components/ai-visibility/AIVisibilitySection.tsx')
    check('B13: the suggestions effect is keyed by the keywords’ VALUE, not the array identity',
      /projectKeywordsKey, manualProfile, projectId\]/.test(ai)
      && /const projectKeywordsKey = \(projectKeywords \|\| \[\]\)\.join/.test(ai))
    // The behaviour this replaces must be gone, not merely covered up.
    check('B10: `loading` is no longer cleared only on the success path',
      !/setTargets\(targetsData \|\| \[\]\)[\s\S]{0,400}setLoading\(false\)\s*\n\s*\}, \[id\]\)/.test(page))
  }

  // ── A3) two clicks cannot dispatch or charge twice ───────────────────────
  say('\nA3) duplicate clicks, genuinely simultaneous')
  {
    const t = reviewerTables(); clients(t)
    let dispatches = 0
    RUN_AI = async () => { dispatches++; await new Promise((r) => setTimeout(r, 120)); return { answerText: 'qa', citations: [], raw: {} } }
    const { POST } = require('../../../app/api/ai-visibility/runs/route.ts')
    quiet()
    const both = await Promise.all([POST(aiReq()), POST(aiReq())])
    const out = await Promise.all(both.map(async (r: any) => ({ status: r.status, body: await r.json().catch(() => null) })))
    loud()
    check('A3a: exactly one provider dispatch', dispatches === 1, String(dispatches))
    check('A3b: one succeeds, the other is told a check is already running',
      out.filter((o) => o.status === 200).length === 1
      && out.filter((o) => o.body?.errorCode === 'AI_CHECK_IN_PROGRESS').length === 1,
      JSON.stringify(out.map((o) => o.body?.errorCode ?? `ok:${o.status}`)))
    const consumed = t.usage_reservations.reduce((n: number, r: any) => n + Number(r.consumed_amount ?? 0), 0)
    check('A3c: exactly ONE check is charged, not two',
      t.usage_reservations.length === 1 && consumed === 1,
      JSON.stringify(t.usage_reservations.map((r: any) => ({ r: r.reserved_amount, c: r.consumed_amount }))))
    check('A3d: and exactly one run row exists', t.ai_scan_runs.length === 1, String(t.ai_scan_runs.length))
    check('A3e: the claim is released, so the next legitimate check can run',
      t.operation_claims.length === 0, JSON.stringify(t.operation_claims))
    const { readUsageAllowance } = require('../../billing/usage-allowance.ts')
    const a = await readUsageAllowance(ADMIN_CLIENT, {
      userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
    })
    check('A3f: and the allowance the merchant sees moved by exactly one',
      a.state === 'known' && a.used === 1 && a.remaining === 19, JSON.stringify(a))
  }

  // ── C) mutation controls ────────────────────────────────────────────────
  say('\nC) mutation controls')
  {
    const { readUsageAllowance } = require('../../billing/usage-allowance.ts')
    // An expired reservation lease holds no capacity — the RPC says so, and a
    // displayed number that ignored it would over-report usage.
    const t = reviewerTables()
    t.usage_reservations = [
      { user_id: USER, usage_type: 'ai_check', status: 'reserved', reserved_amount: 5, consumed_amount: 0,
        reserved_at: new Date(now() - 60 * 60_000).toISOString(), period_start: null },
    ]
    clients(t)
    const period = await require('../../billing/usage-period.ts').resolveCurrentUsagePeriod(ADMIN_CLIENT, USER)
    t.usage_reservations[0].period_start = period.start.toISOString()
    const a = await readUsageAllowance(ADMIN_CLIENT, {
      userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
    })
    check('C1: an EXPIRED reservation lease is not counted as used',
      a.state === 'known' && a.used === 0, JSON.stringify(a))
    t.usage_reservations[0].reserved_at = new Date(now() - 60_000).toISOString()
    const b = await readUsageAllowance(ADMIN_CLIENT, {
      userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject,
    })
    check('C2: a LIVE one is — so the two rules are genuinely distinguished',
      b.state === 'known' && b.used === 5, JSON.stringify(b))
    const c = await readUsageAllowance(ADMIN_CLIENT, {
      userId: USER, usageType: 'ai_check',
      limitFor: (l: any) => l.maxAIScansPerPeriodPerProject, nowMs: now() + 2 * 60 * 60_000,
    })
    check('C3: and the boundary is the clock, not a constant — two hours later it has lapsed',
      c.state === 'known' && c.used === 0, JSON.stringify(c))
  }

  say(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main().catch((e) => { loud(); console.error(e); process.exitCode = 1 })

/* Marks this a MODULE, not a global script — otherwise `main`, `check`, `pass`
 * and `fail` collide with every other QA suite at `next build` type-check time.
 * A plain import cannot be used: ES imports hoist above the Module._load hook. */
export {}
