/**
 * WAVE-7 REVIEW P0-1: the AI-check allowance the screen shows is the allowance the
 * dispatcher enforces, for every plan.
 *
 * What the reviewer saw: a website-trial account on the AI tab read "החבילה הנוכחית
 * לא כוללת בדיקות AI" and a hero button that led nowhere, while billing, pricing and
 * the trial bar all promised 3 AI checks during the trial. The dispatcher
 * (POST /api/ai-visibility/runs) lets a `trial` plan run `maxAIScansTotal` (3)
 * checks over the account's lifetime; the allowance route read only the PERIOD
 * limit, which is 0 for that plan. Two answers to one question.
 *
 *   A) agreement: for a website trial (fresh and part-used), Basic (website,
 *      PayPal) and Advanced (Shopify), the allowance route's `remaining` is
 *      EXACTLY the number of checks the real runs route then accepts before it
 *      answers 403. Mutation control: the old read (period limit only) disagrees.
 *   B) the route passes the dispatcher's own trial rule; mutation control.
 *   C) the hero's next step: with nothing left it leads to /billing with an
 *      upgrade label, never to "run more checks"; otherwise it stays the run step.
 *   D) the tab's rows enter with the shared motion helper (P2-17, AI part).
 *
 * Nothing here changes a limit, a plan or an entitlement: the runs route is the
 * reference and is only called.
 *
 * Run: npx tsx lib/ops/__qa__/ai-allowance-matches-dispatch.qa.ts
 */

/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://qa.supabase.co'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'qa-anon'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'qa-svc'
process.env.ENABLE_AI_VISIBILITY = 'true'

const REAL_LOG = console.log, REAL_ERR = console.error, REAL_WARN = console.warn
const quiet = () => { console.log = () => {}; console.error = () => {}; console.warn = () => {} }
const loud = () => { console.log = REAL_LOG; console.error = REAL_ERR; console.warn = REAL_WARN }
const say = (...a: unknown[]) => REAL_LOG(...a)

const Module: any = require('module')
const origLoad = Module._load
let USER_CLIENT: any = null, ADMIN_CLIENT: any = null
Module._load = function (request: string, parent: any, isMain: boolean) {
  let r = request
  try { r = String(Module._resolveFilename(request, parent, isMain)) } catch { /* virtual */ }
  if (r.endsWith('lib/supabase/server.ts')) return { createClient: async () => USER_CLIENT }
  if (r.endsWith('lib/supabase/admin.ts')) return { createAdminClient: () => ADMIN_CLIENT }
  if (r.endsWith('lib/ai-visibility/index.ts')) {
    return { runAIVisibilityScan: async () => ({ answerText: 'qa', citations: [], raw: {} }) }
  }
  if (request === 'next/cache') return { revalidatePath: () => {}, revalidateTag: () => {} }
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

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; say(`  ✓ ${name}`) } else { fail++; say(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const code = (rel: string) => read(rel).replace(/\/\*[\s\S]*?\*\//g, ' ').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const USER = '674fc7c3-2048-48f4-ba25-6e2a6dff4a06'
const PROJECT = 'a1111111-2222-3333-4444-555555555555'
const DAY = 86_400_000
const iso = (ms: number) => new Date(ms).toISOString()

function base(): Record<string, any[]> {
  return {
    profiles: [{ id: USER, role: 'user' }],
    billing_governance: [], shopify_connections: [], shopify_billing_migrations: [], subscriptions: [],
    projects: [{ id: PROJECT, user_id: USER, target_domain: 'plumber.co.il', business_name: 'Plumber',
      country: 'IL', city: 'Tel Aviv', language: 'he' }],
    ai_prompts: [{ id: 'p1', project_id: PROJECT, user_id: USER, is_active: true }],
    ai_scan_runs: [], ai_scan_results: [], ai_citations: [],
    tracking_targets: [], usage_reservations: [], operation_claims: [],
  }
}

/** A website trial, 7 days left, as da-seed.js and the reviewer's account have it. */
function websiteTrial(priorRuns = 0) {
  const t = base()
  t.subscriptions = [{ id: 'sub-1', user_id: USER, status: 'trial', trial_ends_at: iso(Date.now() + 7 * DAY),
    current_period_end: null, plan_code: null, created_at: iso(Date.now() - 7 * DAY) }]
  for (let i = 0; i < priorRuns; i++) {
    t.ai_scan_runs.push({ id: `old-${i}`, project_id: PROJECT, user_id: USER, status: 'completed', created_at: iso(Date.now() - DAY) })
  }
  return t
}
/** Basic, billed on the website (PayPal), mid-period. */
function websiteBasic() {
  const t = base()
  t.billing_governance = [{ user_id: USER, signup_origin: 'website', billing_authority: 'website', authority_reason: 'website_signup' }]
  t.subscriptions = [{ id: 'sub-2', user_id: USER, status: 'active', plan_code: 'regular', trial_ends_at: null,
    current_period_start: iso(Date.now() - 10 * DAY), current_period_end: iso(Date.now() + 20 * DAY), created_at: iso(Date.now() - 40 * DAY) }]
  return t
}
/** Advanced, billed by Shopify, on its managed-pricing trial window. */
function shopifyAdvanced() {
  const t = base()
  t.billing_governance = [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify', authority_reason: 'shopify_app_store_install' }]
  t.shopify_connections = [{
    id: 'conn-1', user_id: USER, connection_status: 'connected', archived_at: null,
    shop_domain: 'example.myshopify.com', shop_gid: 'gid://shopify/Shop/1',
    shopify_plan_handle: 'advanced', shopify_subscription_status: 'active',
    shopify_trial_ends_at: iso(Date.now() + 4 * DAY), shopify_current_period_start: null, shopify_current_period_end: null,
    shopify_billing_verified_at: iso(Date.now() - 60_000), updated_at: iso(Date.now()),
  }]
  return t
}

function clients(t: Record<string, any[]>) {
  ADMIN_CLIENT = new FakeAdmin(t)
  USER_CLIENT = new FakeAdmin(t)
  ;(USER_CLIENT as any).auth = { getUser: async () => ({ data: { user: { id: USER } } }) }
}
const aiReq = () => new Request('http://localhost/api/ai-visibility/runs', {
  method: 'POST', body: JSON.stringify({ projectId: PROJECT, promptId: 'p1', engine: 'chatgpt' }) })

/** How many checks the REAL dispatcher accepts in a row before it refuses (capped). */
async function runnable(cap: number): Promise<{ accepted: number; refusedWith: number | null }> {
  const { POST } = require('../../../app/api/ai-visibility/runs/route.ts')
  let accepted = 0
  for (let i = 0; i < cap; i++) {
    // Each dispatch is its own operation, keyed by its claim's start instant (ms):
    // two in the same millisecond would be one operation, which no merchant can click.
    await new Promise((r) => setTimeout(r, 3))
    quiet(); const res = await POST(aiReq()); loud()
    if (res.status === 200) { accepted++; continue }
    return { accepted, refusedWith: res.status }
  }
  return { accepted, refusedWith: null }
}

async function main() {
  say('The AI-check allowance the screen shows is the one the dispatcher enforces\n')
  const { GET } = require('../../../app/api/ai-visibility/allowance/route.ts')
  const allowance = async () => { quiet(); const r = await GET(); const b = await r.json(); loud(); return b }

  say('A) the allowance route and the runs route agree')
  const cases: [string, () => Record<string, any[]>, number][] = [
    ['website trial, nothing used', () => websiteTrial(0), 3],
    ['website trial, 2 of 3 used', () => websiteTrial(2), 1],
    ['website trial, all 3 used', () => websiteTrial(3), 0],
    ['Basic on the website (PayPal)', websiteBasic, -1],
    ['Advanced on Shopify', shopifyAdvanced, -1],
  ]
  for (const [name, tables, expectRemaining] of cases) {
    const t = tables(); clients(t)
    const a = await allowance()
    const remaining = a.state === 'known' ? a.remaining : null
    const r = await runnable((remaining ?? 0) + 2)
    check(`A-${name}: the allowance is known${expectRemaining >= 0 ? ` with ${expectRemaining} left` : ''}`,
      a.state === 'known' && (expectRemaining < 0 || a.remaining === expectRemaining), JSON.stringify(a))
    check(`A-${name}: and the dispatcher runs exactly that many, then refuses with 403`,
      remaining !== null && r.accepted === remaining && r.refusedWith === 403, JSON.stringify({ a, r }))
  }
  {
    // THE MUTATION CONTROL: the read the route used to make (the period limit only).
    const { readUsageAllowance } = require('../../billing/usage-allowance.ts')
    const t = websiteTrial(0); clients(t)
    quiet()
    const old = await readUsageAllowance(ADMIN_CLIENT, { userId: USER, usageType: 'ai_check', limitFor: (l: any) => l.maxAIScansPerPeriodPerProject })
    loud()
    const r = await runnable(5)
    const agrees = old.state === 'known' && old.remaining === r.accepted
    check('A-MUT: the old period-only read disagrees with the dispatcher on a trial (it is what the reviewer saw)', !agrees,
      JSON.stringify({ old: old.state === 'known' ? { limit: old.limit, remaining: old.remaining } : old.state, runnable: r.accepted }))
  }

  say('\nB) the route passes the dispatcher\'s own trial rule')
  {
    const route = code('app/api/ai-visibility/allowance/route.ts')
    const runs = code('app/api/ai-visibility/runs/route.ts')
    const same = (src: string) => /trialLifetime: \{\s*limitFor: \(limits\) => limits\.maxAIScansTotal,\s*countUsed: \(admin, userId\) => countAIScansTrialLifetime\(userId, admin\),/.test(src)
    check('B1: the trial allowance is maxAIScansTotal, counted by countAIScansTrialLifetime (the runs route\'s own pair)',
      same(route) && /countAIScansTrialLifetime\(user\.id, admin\)/.test(runs) && /entitlement\.limits\.maxAIScansTotal/.test(runs))
    check('B1-MUT: the period limit for the trial fails B1', !same(route.replace('limits.maxAIScansTotal', 'limits.maxAIScansPerPeriodPerProject')))
    const lib = code('lib/billing/usage-allowance.ts')
    const keyed = (src: string) => /if \(entitlement\.plan === 'trial' && args\.trialLifetime\)/.test(src)
    check('B2: the lifetime rule applies to the `trial` plan exactly (the runs route\'s `isTrial`)', keyed(lib) && /const isTrial = entitlement\.plan === 'trial'/.test(runs))
    check('B2-MUT: applying it to every plan fails B2', !keyed(lib.replace("entitlement.plan === 'trial' && args.trialLifetime", 'args.trialLifetime')))
  }

  say('\nC) the hero\'s next step follows the allowance')
  {
    const { createElement } = require('react')
    const { renderToStaticMarkup } = require('react-dom/server')
    const { DashboardLanguageProvider } = require('../../i18n/dashboard/useDashboardLanguage')
    const { getDashboardDictionary } = require('../../i18n/dashboard/getDashboardDictionary')
    const M = require('../../../components/ai-visibility/overview-model')
    const { OverviewOpeningCard } = require('../../../components/ai-visibility/OverviewRows')
    // One engine checked of several: the "partial" step, whose button is "run more checks".
    const partial = M.buildOverview(M.readRuns([{ id: 'r1', status: 'completed', createdAt: iso(Date.now() - 3600_000), completedAt: iso(Date.now() - 3500_000),
      results: [{ engine: 'chatgpt', status: 'success', displayMentioned: true, displayCited: false, promptId: 'p1' }] }]))
    const empty = M.buildOverview([])
    for (const locale of ['he', 'en'] as const) {
      const c = getDashboardDictionary(locale).aiVisibilityOverview
      const render = (overview: unknown, allowanceOut: boolean, questionsCount: number | null = 3) => renderToStaticMarkup(createElement(DashboardLanguageProvider, { initialLocale: locale },
        createElement(OverviewOpeningCard, { overview, questionsPending: false, questionsSuggested: null, questionsCount, allowanceOut, onChooseQuestions: () => {} })))
      const out = render(partial, true)
      const left = render(partial, false)
      check(`C1-${locale}: nothing left → the step leads to /billing, labelled "${c.upgradeForChecks}", and says why`,
        /<a(?=[^>]*href="\/billing")(?=[^>]*data-ai-upgrade-cta="")[^>]*>/.test(out) && out.includes(c.upgradeForChecks) && out.includes(c.checksUsedUp) && !out.includes(c.runMoreChecks),
        out.slice(out.indexOf('data-ai-next-step'), out.indexOf('data-ai-next-step') + 600))
      check(`C2-${locale}: checks left → the step stays "${c.runMoreChecks}" and no upgrade`,
        left.includes('data-ai-run-more=""') && left.includes(c.runMoreChecks) && !left.includes('data-ai-upgrade-cta'))
      const emptyOut = render(empty, true)
      check(`C3-${locale}: before the first check, with nothing left, the first step is the upgrade too`,
        emptyOut.includes('data-ai-upgrade-cta=""') && !emptyOut.includes('data-ai-choose-questions'))
    }
    const rows = code('components/ai-visibility/OverviewRows.tsx')
    check('C-MUT: an upgrade link that ignores the allowance would fail C2',
      /allowanceOut \? \(/.test(rows) && !/allowanceOut \? \(/.test(rows.replace('allowanceOut ? (', 'true ? (')))
    const section = code('components/ai-visibility/AIVisibilitySection.tsx')
    const page = code('app/(dashboard)/ai-visibility/page.tsx')
    const wired = (s: string, p: string) => /const allowanceOut = allowance != null && allowance\.state === 'known' && allowance\.remaining === 0/.test(s)
      && /onAllowanceOutRef\.current\?\.\(allowanceOut\)/.test(s)
      && /onAllowanceOut: setAllowanceOut/.test(p) && /allowanceOut=\{allowanceOut\}/.test(p)
    check('C4: the hero reads the SAME allowance the tool shows (the tool reports it; no second read)',
      wired(section, page) && (page.match(/\/api\/ai-visibility\/allowance/g) ?? []).length === 0)
    check('C4-MUT: a hero that is never told fails C4', !wired(section, page.replace('onAllowanceOut: setAllowanceOut', '')))
    const i18n = read('lib/ai-visibility/i18n.ts')
    check('C5: the allowance line no longer says "this billing period" (a trial has no period)',
      /ai_allowance: \{ he: 'בדיקות AI שנוצלו', en: 'AI checks used'[^}]*\}/.test(i18n) && !/במחזור החיוב הזה/.test(i18n))
  }

  say('\nD) the tab enters like every other app screen (P2-17)')
  {
    const page = code('app/(dashboard)/ai-visibility/page.tsx')
    const moves = (p: string) => /import \{ Reveal \} from '@\/components\/ui\/motion'/.test(p)
      && (p.match(/<Reveal index=\{\d\}/g) ?? []).length === 4
    check('D1: the four rows each enter through the shared <Reveal> (which does nothing under reduced motion)', moves(page))
    check('D1-MUT: rows drawn without it fail D1', !moves(page.replace(/<Reveal index=\{\d\}/g, '<div')))
    const css = read('app/globals.css')
    check('D2: the entrance is defined only for prefers-reduced-motion: no-preference',
      /@media \(prefers-reduced-motion: no-preference\) \{\s*\.reveal\[data-reveal='wait'\]/.test(css))
  }

  say(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { loud(); console.error(e); say(`\n${pass} passed, ${fail + 1} failed`); process.exit(1) })

export {}
