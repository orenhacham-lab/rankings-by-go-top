/**
 * Shopify managed-pricing TRIAL → usage period, and the publishing queue on the
 * manual tab. Two confirmed Production defects.
 *
 * A. "quota_exceeded" FOR AN UNTOUCHED ALLOWANCE.
 *
 *    Live evidence: an ACTIVE Shopify `advanced` plan, `trialEndsAt`
 *    2026-09-08T23:28:48Z, `currentBillingCycle: null`, nothing like 20
 *    articles generated — and the UI showed the raw code `quota_exceeded`.
 *    Gemini was never called.
 *
 *    During a managed-pricing free trial Shopify reports a real subscription
 *    with NO billing cycle (no money has moved yet) while `trialEndsAt` is
 *    populated. lib/billing/usage-period.ts required BOTH cycle ends, resolved
 *    no period, and lib/content/article-generation.ts turned "no period" into
 *    `quota_exceeded` — telling a merchant on day one of a paid trial that
 *    their 20-article allowance was spent.
 *
 *    Two independent faults: the trial is not recognised as a period, and an
 *    unresolved period is misreported as exhaustion.
 *
 * B. THE PUBLISHING QUEUE WAS HIDDEN ON THE MANUAL TAB — AutomationSchedule was
 *    rendered inside the `ideasSection === 'auto'` branch, though the queue
 *    serves manually created topics just as much.
 *
 * SCOPE NOTE: sections marked SOURCE assert what the code does, not what React
 * renders; they are not a substitute for a browser test.
 *
 * Run: npx tsx lib/billing/__qa__/shopify-trial-usage-period.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolveCurrentUsagePeriod } from '../usage-period'
import { generateArticleForTopic, type ArticleGenerationDeps } from '@/lib/content/article-generation'
import type { generateValidatedArticle } from '@/lib/content/gemini-article'
import { PLAN_CATALOG } from '@/lib/plans/catalog'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const USER = 'u1'
// Verbatim from the live Partner API response for the incident.
const TRIAL_ENDS_AT = '2026-09-08T23:28:48Z'
const NOW = new Date('2026-09-02T00:00:00Z')
const now = () => NOW
const DAY_MS = 24 * 60 * 60 * 1000
const ADVANCED_LIMIT = PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide

function shopifyConn(over: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', user_id: USER, connection_status: 'connected', archived_at: null,
    updated_at: '2026-09-02T00:00:00Z',
    shopify_subscription_status: 'active',
    shopify_plan_handle: 'advanced',
    shopify_trial_ends_at: TRIAL_ENDS_AT,
    shopify_current_period_start: null,
    shopify_current_period_end: null,
    // Freshness is now compared against the INJECTED clock too, so this is a
    // fixture time relative to NOW — never the wall clock.
    shopify_billing_verified_at: new Date(NOW.getTime() - 60_000).toISOString(),
    shop_domain: 'go-top-seo-test.myshopify.com',
    shop_gid: 'gid://shopify/Shop/77989445789',
    ...over,
  }
}
/** Governance rows — billing authority is a FACT, never inferred from a connection. */
const SHOPIFY_AUTHORITY = { user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify' }
const WEBSITE_AUTHORITY = { user_id: USER, signup_origin: 'website', billing_authority: 'website' }

const adminWith = (over: Record<string, unknown> = {}) =>
  new FakeAdmin({
    shopify_connections: [shopifyConn(over)],
    billing_governance: [SHOPIFY_AUTHORITY],
    shopify_billing_migrations: [],
    subscriptions: [],
  }, {}, () => NOW.getTime())

async function main() {
  console.log('Shopify trial usage period + the manual-tab publishing queue\n')
  const generation = strip(read('lib/content/article-generation.ts'))
  const route = strip(read('app/api/content/articles/generate/route.ts'))
  const item = strip(read('lib/content/automation/generate-item.ts'))
  const appHome = strip(read('app/api/shopify/app-home/route.ts'))
  const hub = strip(read('components/content/ContentHub.tsx'))

  // ───────────────────────────────────────────────────────────────────────
  console.log('A1) THE INCIDENT — an active Advanced trial resolves a real period')
  {
    const r = await resolveCurrentUsagePeriod(adminWith(), USER, now)
    check('A1-a: a period IS resolved (it used to be null)', r !== null)
    check('A1-b: from the Shopify trial', r?.source === 'shopify_trial')
    check('A1-c: ending at Shopify’s own trialEndsAt, exactly',
      r?.end.toISOString() === new Date(TRIAL_ENDS_AT).toISOString())
    check('A1-d: starting trialEndsAt minus the CATALOG trialDays for this handle',
      r?.start.getTime() === new Date(TRIAL_ENDS_AT).getTime() - PLAN_CATALOG.advanced.trialDays * DAY_MS)
    check('A1-e: which is the catalog value, not an unrelated hard-coded duration',
      PLAN_CATALOG.advanced.trialDays === 7
      && /PLAN_CATALOG\[SHOPIFY_HANDLE_TO_PLAN_CODE\[handle\]\]\.trialDays/.test(strip(read('lib/billing/usage-period.ts'))))
    check('A1-f: "now" falls inside the resolved period',
      !!r && r.start.getTime() <= NOW.getTime() && NOW.getTime() < r.end.getTime())
    check('A1-g: the Advanced allowance the reservation is bounded by is 20 articles',
      PLAN_CATALOG.advanced.maxArticlesPerPeriodAccountWide === 20)

    for (const handle of ['regular', 'premium', 'large-agency'] as const) {
      const code = handle === 'large-agency' ? 'large_agency' : handle
      const rr = await resolveCurrentUsagePeriod(adminWith({ shopify_plan_handle: handle }), USER, now)
      check(`A1-h: '${handle}' also resolves, with its own catalog trial length`,
        rr?.source === 'shopify_trial'
        && rr.start.getTime() === new Date(TRIAL_ENDS_AT).getTime() - PLAN_CATALOG[code].trialDays * DAY_MS)
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA1B) BEHAVIOURAL — the REAL generateArticleForTopic path, with a stubbed Gemini')
  {
    // These call the production function. The two provider calls are injected
    // (lib/content/article-generation.ts's ArticleGenerationDeps), because a
    // global fetch stub does NOT intercept @google/generative-ai — the SDK
    // reaches the network regardless — and counting one's own bookkeeping after
    // reserveUsage proves nothing about whether generation was reached.
    const VALID_ARTICLE = {
      article: {
        title: 'כותרת', slug: 'kotert', metaTitle: 'מטא', metaDescription: 'תיאור',
        excerpt: 'תקציר', contentHtml: '<p>גוף</p>', contentMarkdown: 'גוף',
        faq: [], imagePrompt: '', warnings: [],
      },
      safeHtml: '<p>גוף</p>',
      slug: 'kotert',
      usage: { model: 'gemini-stub', inputTokens: 10, outputTokens: 20 },
      audit: { score: 90, warnings: [], blockers: [] },
      model: 'gemini-stub',
    } as unknown as Awaited<ReturnType<typeof generateValidatedArticle>>

    /** A world in which the incident's Shopify trial connection is the only billing state. */
    function world(over: { reservations?: Record<string, unknown>[]; conn?: Record<string, unknown> } = {}) {
      return new FakeAdmin({
        shopify_connections: [shopifyConn(over.conn ?? {})],
        billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
        shopify_billing_migrations: [],
        subscriptions: [],
        projects: [{ id: 'p1', user_id: USER }],
        article_topics: [{ id: 'topic-1', project_id: 'p1', topic: 'נושא', primary_keyword: 'מילה', language: 'he', status: 'approved', anchors_json: [], brief_notes: null, cta_preference: '' }],
        wordpress_connections: [],
        generated_articles: [],
        ai_usage_logs: [],
        usage_reservations: over.reservations ?? [],
        profiles: [{ id: USER, role: 'user' }],
      }, {}, () => NOW.getTime())
    }
    /** Counts REAL invocations of the generation dependency. */
    function stub(impl: () => Awaited<ReturnType<typeof generateValidatedArticle>>) {
      const calls = { generate: 0, image: 0 }
      return {
        calls,
        deps: {
          generate: async () => { calls.generate++; return impl() },
          createFeaturedImage: async () => { calls.image++; return { error: 'stubbed' } },
          // THE FIXED CLOCK, threaded through the gate, getUserEntitlement and
          // the usage-period resolution. Nothing here reads the wall clock, so
          // the suite stays valid after TRIAL_ENDS_AT has passed in real time.
          now: () => NOW,
        } as unknown as ArticleGenerationDeps,
      }
    }
    const ledgerOf = (a: FakeAdmin) => a.tables.usage_reservations as Record<string, unknown>[]

    // 1) THE EXACT INCIDENT STATE reaches the Gemini stub, and succeeds.
    {
      const admin = world()
      const g = stub(() => VALID_ARTICLE)
      const r = await generateArticleForTopic(admin as never, { topicId: 'topic-1', userId: USER }, g.deps)
      check('A1B-1a: the active Advanced trial REACHES the Gemini stub', g.calls.generate === 1)
      check('A1B-1b: and the generation succeeds', r.ok === true, JSON.stringify(r))
      check('A1B-1c: it is NOT quota_exceeded', !(r.ok === false && r.kind === 'quota_exceeded'))
      check('A1B-1d: an article row was written', (admin.tables.generated_articles as unknown[]).length === 1)
      // 2) a successful generation FINALIZES the reservation.
      const row = ledgerOf(admin)[0]
      check('A1B-2a: exactly one ledger row exists', ledgerOf(admin).length === 1)
      check('A1B-2b: the reservation is CONSUMED, not left reserved', row?.status === 'consumed')
      check('A1B-2c: it consumed exactly one article credit', row?.consumed_amount === 1)
      check('A1B-2d: bounded by the resolved trial period',
        row?.period_end === new Date(TRIAL_ENDS_AT).toISOString())
    }

    // 3) a Gemini FAILURE releases the reservation and consumes nothing.
    {
      const admin = world()
      const g = stub(() => ({ error: 'gemini_timeout', reason: 'gemini_timeout', attempts: 2 } as unknown as Awaited<ReturnType<typeof generateValidatedArticle>>))
      const r = await generateArticleForTopic(admin as never, { topicId: 'topic-1', userId: USER }, g.deps)
      check('A1B-3a: the stub WAS reached (the failure is a generation failure)', g.calls.generate === 1)
      check('A1B-3b: the result is a generation failure, not a quota one',
        r.ok === false && r.kind === 'generation' && (r as { reason: string }).reason === 'gemini_timeout')
      const row = ledgerOf(admin)[0]
      check('A1B-3c: the reservation is RELEASED', row?.status === 'released')
      check('A1B-3d: no article credit was consumed', row?.consumed_amount === 0)
      check('A1B-3e: and no article row was written', (admin.tables.generated_articles as unknown[]).length === 0)
    }

    // 4) REAL 20/20 exhaustion never invokes Gemini.
    {
      const period = await resolveCurrentUsagePeriod(adminWith(), USER, now)
      const admin = world({ reservations: [{
        id: 'r-full', user_id: USER, project_id: null, usage_type: 'article',
        reserved_amount: ADVANCED_LIMIT, consumed_amount: ADVANCED_LIMIT, released_amount: 0,
        period_start: period!.start.toISOString(), period_end: period!.end.toISOString(),
        idempotency_key: 'topic:spent', status: 'consumed', created_at: '2026-09-02T00:00:00Z',
      }] })
      const g = stub(() => VALID_ARTICLE)
      const r = await generateArticleForTopic(admin as never, { topicId: 'topic-1', userId: USER }, g.deps)
      check('A1B-4a: a genuinely exhausted 20/20 allowance returns quota_exceeded',
        r.ok === false && r.kind === 'quota_exceeded', JSON.stringify(r))
      check('A1B-4b: and Gemini is NEVER invoked', g.calls.generate === 0)
      check('A1B-4c: no article row was written', (admin.tables.generated_articles as unknown[]).length === 0)
      check('A1B-4d: so the fix did not turn a real limit into an unlimited allowance', ADVANCED_LIMIT === 20)
    }

    // 5) an UNRESOLVED period returns usage_period_unavailable and never invokes Gemini.
    {
      // An expired trial with no billing cycle — the fail-closed case.
      const admin = world({ conn: { shopify_trial_ends_at: '2026-08-01T00:00:00Z' } })
      const g = stub(() => VALID_ARTICLE)
      const r = await generateArticleForTopic(admin as never, { topicId: 'topic-1', userId: USER }, g.deps)
      check('A1B-5a: an unresolved period returns usage_period_unavailable',
        r.ok === false && r.kind === 'usage_period_unavailable', JSON.stringify(r))
      check('A1B-5b: NOT quota_exceeded', !(r.ok === false && r.kind === 'quota_exceeded'))
      check('A1B-5c: Gemini is never invoked', g.calls.generate === 0)
      check('A1B-5d: and NOTHING is reserved', ledgerOf(admin).length === 0)
    }

    // 6) the central entitlement gate runs BEFORE any provider call.
    {
      // Shopify-governed with NO active plan → billing_required, before Gemini.
      const admin = new FakeAdmin({
        shopify_connections: [shopifyConn({ shopify_subscription_status: 'none', shopify_plan_handle: null, shopify_trial_ends_at: null })],
        billing_governance: [{ user_id: USER, signup_origin: 'shopify_app_store', billing_authority: 'shopify' }],
        shopify_billing_migrations: [],
        subscriptions: [], projects: [{ id: 'p1', user_id: USER }],
        article_topics: [{ id: 'topic-1', project_id: 'p1', topic: 'נושא', primary_keyword: 'מילה', language: 'he', status: 'approved', anchors_json: [], brief_notes: null, cta_preference: '' }],
        wordpress_connections: [], generated_articles: [], ai_usage_logs: [], usage_reservations: [],
        profiles: [{ id: USER, role: 'user' }],
      }, {}, () => NOW.getTime())
      const g = stub(() => VALID_ARTICLE)
      const r = await generateArticleForTopic(admin as never, { topicId: 'topic-1', userId: USER }, g.deps)
      check('A1B-6a: an unentitled account is refused with billing_required',
        r.ok === false && r.kind === 'billing_required', JSON.stringify(r))
      check('A1B-6b: the gate ran BEFORE any provider call', g.calls.generate === 0 && g.calls.image === 0)
      check('A1B-6c: and before any reservation', ledgerOf(admin).length === 0)
      const src = strip(read('lib/content/article-generation.ts'))
      check('A1B-6d: SOURCE — the shared gate is the FIRST thing generateArticleForTopic does',
        /const gate = await assertContentGenerationAllowedForUser\(admin, userId, deps\.now\)/.test(src)
        && src.indexOf('assertContentGenerationAllowedForUser(admin, userId, deps.now)') < src.indexOf("from('article_topics')"))
      check('A1B-6e: SOURCE — generatePoolItem (cron/queue/retry) funnels through it',
        /generateArticleForTopic\(admin, \{ topicId: item\.topic_id/.test(strip(read('lib/content/automation/generate-item.ts'))))
      check('A1B-6f: SOURCE — the manual route funnels through it too',
        /generateArticleForTopic\(/.test(strip(read('app/api/content/articles/generate/route.ts'))))
      check('A1B-6g: SOURCE — the featured image is behind the same gate (same function)',
        src.indexOf('assertContentGenerationAllowedForUser(admin, userId, deps.now)') < src.indexOf('deps.createFeaturedImage'))
    }

    // 7) the injectable seam is a TEST seam only — production is unchanged.
    {
      const src = strip(read('lib/content/article-generation.ts'))
      check('A1B-7a: the deps parameter defaults to the REAL implementations',
        /deps: ArticleGenerationDeps = REAL_GENERATION_DEPS/.test(src)
        && /generate: generateValidatedArticle/.test(src)
        && /createFeaturedImage: createFeaturedImageForArticle/.test(src))
      check('A1B-7b: no production call site passes a stub',
        !/generateArticleForTopic\([^)]*,\s*\{[^}]*generate:/.test(strip(read('lib/content/automation/generate-item.ts')))
        && !/generateArticleForTopic\([^)]*,\s*\{[^}]*generate:/.test(strip(read('app/api/content/articles/generate/route.ts'))))
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA2) Fail-closed — only a genuine, current trial resolves')
  {
    const expired = await resolveCurrentUsagePeriod(adminWith({ shopify_trial_ends_at: '2026-08-01T00:00:00Z' }), USER, now)
    check('A2-a: an EXPIRED trial with no billing cycle resolves NO period', expired === null)
    const malformed = await resolveCurrentUsagePeriod(adminWith({ shopify_trial_ends_at: 'not-a-date' }), USER, now)
    check('A2-b: a MALFORMED trial date fails closed', malformed === null)
    const empty = await resolveCurrentUsagePeriod(adminWith({ shopify_trial_ends_at: '' }), USER, now)
    check('A2-c: an empty trial date fails closed', empty === null)
    const missing = await resolveCurrentUsagePeriod(adminWith({ shopify_trial_ends_at: null }), USER, now)
    check('A2-d: a missing trial date fails closed', missing === null)
    const notActive = await resolveCurrentUsagePeriod(adminWith({ shopify_subscription_status: 'none' }), USER, now)
    check('A2-e: a non-active subscription never gets a trial period', notActive === null)
    const unknown = await resolveCurrentUsagePeriod(adminWith({ shopify_subscription_status: 'unknown' }), USER, now)
    check('A2-f: an unverifiable subscription never gets one either', unknown === null)
    const badHandle = await resolveCurrentUsagePeriod(adminWith({ shopify_plan_handle: 'free-plan' }), USER, now)
    check('A2-g: an UNSUPPORTED plan handle fails closed', badHandle === null)
    const noHandle = await resolveCurrentUsagePeriod(adminWith({ shopify_plan_handle: null }), USER, now)
    check('A2-h: a missing plan handle fails closed', noHandle === null)
    const exactlyNow = await resolveCurrentUsagePeriod(adminWith({ shopify_trial_ends_at: NOW.toISOString() }), USER, now)
    check('A2-i: a trial ending exactly now is already over — fails closed', exactlyNow === null)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA3) A normal PAID cycle still wins, with Shopify’s exact dates')
  {
    const paid = await resolveCurrentUsagePeriod(adminWith({
      shopify_current_period_start: '2026-09-01T00:00:00Z',
      shopify_current_period_end: '2026-10-01T00:00:00Z',
    }), USER, now)
    check('A3-a: the billing cycle is used', paid?.source === 'shopify')
    check('A3-b: with Shopify’s exact start', paid?.start.toISOString() === '2026-09-01T00:00:00.000Z')
    check('A3-c: and Shopify’s exact end', paid?.end.toISOString() === '2026-10-01T00:00:00.000Z')
    const bothPresent = await resolveCurrentUsagePeriod(adminWith({
      shopify_current_period_start: '2026-09-01T00:00:00Z',
      shopify_current_period_end: '2026-10-01T00:00:00Z',
      shopify_trial_ends_at: TRIAL_ENDS_AT,
    }), USER, now)
    check('A3-d: a cycle takes precedence over a still-future trial', bothPresent?.source === 'shopify')
    const halfCycle = await resolveCurrentUsagePeriod(adminWith({ shopify_current_period_end: '2026-10-01T00:00:00Z', shopify_trial_ends_at: null }), USER, now)
    check('A3-e: a HALF-written cycle with no trial still fails closed', halfCycle === null)

    check('A3-f: SOURCE — app-home now caches the period START as well',
      /shopify_current_period_start: result\.currentPeriodStart/.test(appHome))
    check('A3-g: SOURCE — and so does the billing-return write-back',
      (strip(read('lib/shopify/billing-return-processing.ts')).match(/shopify_current_period_start: verified\.currentPeriodStart/g) ?? []).length === 2)
    check('A3-h: SOURCE — the lookup reads every field the resolution needs',
      /shopify_subscription_status, shopify_plan_handle, shopify_trial_ends_at, shopify_current_period_start, shopify_current_period_end/
        .test(strip(read('lib/billing/usage-period.ts'))))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA3B) BILLING AUTHORITY decides — a connected store never does')
  {
    // A connected shopify_connections row used to BE the authority: the
    // resolver saw one, took the Shopify branch and failed closed. Almost every
    // customer registers on the website and may connect Shopify purely as a
    // publishing destination — for them the Shopify billing columns are empty
    // by design, so their perfectly valid PayPal or trial period was never
    // consulted and NOTHING resolved. Authority comes from billing_governance.
    const paypalSub = {
      user_id: USER, status: 'active', plan_code: 'advanced', trial_ends_at: null,
      current_period_start: '2026-08-20T00:00:00Z', current_period_end: '2026-09-20T00:00:00Z',
      created_at: '2026-01-01T00:00:00Z', paypal_subscription_id: 'I-PAYPAL-1',
    }
    const websiteWorld = (subs: Record<string, unknown>[], governance = WEBSITE_AUTHORITY) => new FakeAdmin({
      // A CONNECTED Shopify store, with Shopify billing fields empty — exactly
      // the publishing-only integration.
      shopify_connections: [shopifyConn({ shopify_subscription_status: 'none', shopify_plan_handle: null, shopify_trial_ends_at: null })],
      billing_governance: [governance],
      shopify_billing_migrations: [],
      subscriptions: subs,
    }, {}, () => NOW.getTime())

    // A. website authority + connected Shopify + active PayPal.
    {
      const r = await resolveCurrentUsagePeriod(websiteWorld([paypalSub]) as never, USER, now)
      check('A3B-A1: the PayPal period resolves (it used to resolve NOTHING)', r !== null)
      check('A3B-A2: from PayPal, not Shopify', r?.source === 'paypal')
      check('A3B-A3: with PayPal’s exact dates',
        r?.start.toISOString() === '2026-08-20T00:00:00.000Z' && r?.end.toISOString() === '2026-09-20T00:00:00.000Z')
      check('A3B-A4: so generation would NOT report usage_period_unavailable', r !== null)
    }

    // B. website authority + connected Shopify + website trial.
    {
      const trialSub = {
        user_id: USER, status: 'trial', plan_code: null, trial_ends_at: '2026-09-10T00:00:00Z',
        current_period_start: null, current_period_end: null,
        created_at: '2026-09-03T00:00:00Z', paypal_subscription_id: null,
      }
      const r = await resolveCurrentUsagePeriod(websiteWorld([trialSub]) as never, USER, now)
      check('A3B-B1: the WEBSITE trial resolves', r?.source === 'trial')
      check('A3B-B2: ending at its own trial_ends_at', r?.end.toISOString() === '2026-09-10T00:00:00.000Z')
      check('A3B-B3: starting at the stored created_at', r?.start.toISOString() === '2026-09-03T00:00:00.000Z')
    }

    // C. Shopify authority + active Advanced trial.
    {
      const r = await resolveCurrentUsagePeriod(adminWith() as never, USER, now)
      check('A3B-C1: the SHOPIFY trial resolves', r?.source === 'shopify_trial')
      check('A3B-C2: ending at Shopify’s trialEndsAt',
        r?.end.toISOString() === new Date(TRIAL_ENDS_AT).toISOString())
    }

    // D. Shopify authority can never fall back to PayPal.
    {
      const shopifyWithPaypal = new FakeAdmin({
        // Shopify-governed, but the Shopify billing fields are empty.
        shopify_connections: [shopifyConn({ shopify_subscription_status: 'none', shopify_plan_handle: null, shopify_trial_ends_at: null })],
        billing_governance: [SHOPIFY_AUTHORITY],
        shopify_billing_migrations: [],
        // A PayPal row that MUST NOT be consulted.
        subscriptions: [paypalSub],
      }, {}, () => NOW.getTime())
      const r = await resolveCurrentUsagePeriod(shopifyWithPaypal as never, USER, now)
      check('A3B-D1: a Shopify-governed account NEVER falls back to PayPal', r === null)
      // Nor to a website trial, nor when it has no connection row at all.
      const noConn = new FakeAdmin({
        shopify_connections: [], billing_governance: [SHOPIFY_AUTHORITY], shopify_billing_migrations: [],
        subscriptions: [{ user_id: USER, status: 'trial', plan_code: null, trial_ends_at: '2026-09-30T00:00:00Z', current_period_start: null, current_period_end: null, created_at: '2026-09-01T00:00:00Z', paypal_subscription_id: null }],
      }, {}, () => NOW.getTime())
      check('A3B-D2: nor to a website trial, even with NO Shopify connection row',
        await resolveCurrentUsagePeriod(noConn as never, USER, now) === null)
    }

    // E. an authority LOOKUP FAILURE resolves nothing.
    {
      const broken = new FakeAdmin(
        { shopify_connections: [shopifyConn()], billing_governance: [SHOPIFY_AUTHORITY], shopify_billing_migrations: [], subscriptions: [paypalSub] },
        { billing_governance: { select: () => ({ code: '57014', message: 'statement timeout' }) } },
        () => NOW.getTime(),
      )
      const r = await resolveCurrentUsagePeriod(broken as never, USER, now)
      check('A3B-E1: a governance read failure resolves NOTHING — never "website"', r === null)
      check('A3B-E2: so it cannot silently grant a PayPal period on an outage', r === null)
    }

    // A Shopify cycle/trial is accepted only with active + supported plan state.
    {
      const wrongState = await resolveCurrentUsagePeriod(
        adminWith({ shopify_subscription_status: 'none' }) as never, USER, now)
      check('A3B-F1: Shopify authority + non-active subscription resolves nothing', wrongState === null)
      const badHandle = await resolveCurrentUsagePeriod(
        adminWith({ shopify_plan_handle: 'free-plan' }) as never, USER, now)
      check('A3B-F2: Shopify authority + unsupported handle resolves nothing', badHandle === null)
    }

    check('A3B-G1: SOURCE — authority is resolved BEFORE the connection lookup',
      (() => { const src = strip(read('lib/billing/usage-period.ts'))
        return src.indexOf('const authority = await resolveBillingAuthority(admin, userId)') < src.indexOf("from('shopify_connections')") })())
    check('A3B-G2: SOURCE — a failed authority lookup fails closed',
      /if \(!authority\.ok\) return null/.test(strip(read('lib/billing/usage-period.ts'))))
    check('A3B-G3: SOURCE — website authority skips the Shopify fields entirely',
      /if \(authority\.authority !== 'shopify'\) \{[\s\S]{0,200}return resolveWebsitePeriod\(admin, userId, nowFn\)/.test(strip(read('lib/billing/usage-period.ts'))))
    check('A3B-G4: SOURCE — the Shopify branch cannot reach the website resolver',
      (() => { const src = strip(read('lib/billing/usage-period.ts'))
        const websiteFn = src.indexOf('async function resolveWebsitePeriod')
        return src.indexOf("from('subscriptions')") > websiteFn })())
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA3C) The whole suite is CLOCK-INDEPENDENT')
  {
    check('A3C-a: no fixture is built from the wall clock',
      !/new Date\(\)/.test(read('lib/billing/__qa__/shopify-trial-usage-period.qa.ts')))
    check('A3C-b: the injected clock is the only "now" the generator sees',
      /now: \(\) => NOW/.test(read('lib/billing/__qa__/shopify-trial-usage-period.qa.ts')))
    check('A3C-c: SOURCE — the clock reaches the entitlement gate',
      /assertContentGenerationAllowedForUser\(admin, userId, deps\.now\)/.test(strip(read('lib/content/article-generation.ts'))))
    check('A3C-d: SOURCE — and getUserEntitlement',
      /getUserEntitlement\(userId, admin, deps\.now\)/.test(strip(read('lib/content/article-generation.ts'))))
    check('A3C-e: SOURCE — and the usage-period resolution',
      /resolveCurrentUsagePeriod\(admin, userId, deps\.now\)/.test(strip(read('lib/content/article-generation.ts'))))
    check('A3C-f: SOURCE — and the Shopify cache-freshness check no longer reads Date.now()',
      /nowFn\(\)\.getTime\(\) - new Date\(connection\.shopify_billing_verified_at\)\.getTime\(\)/.test(strip(read('lib/shopify/entitlement-resolver.ts')))
      && !/Date\.now\(\) - new Date\(connection\.shopify_billing_verified_at\)/.test(strip(read('lib/shopify/entitlement-resolver.ts'))))
    check('A3C-g: SOURCE — production still defaults to the real clock',
      /now: \(\) => new Date\(\),/.test(strip(read('lib/content/article-generation.ts')))
      && /nowFn: \(\) => Date = \(\) => new Date\(\)/.test(strip(read('lib/shopify/entitlement-resolver.ts'))))
    // The decisive one: a clock LATER than the trial end must change the
    // answer, proving the injected clock — not the wall clock — governs.
    const afterTrial = () => new Date('2027-01-01T00:00:00Z')
    check('A3C-h: with a clock AFTER the trial end the same fixture resolves nothing',
      await resolveCurrentUsagePeriod(adminWith() as never, USER, afterTrial) === null)
    check('A3C-i: and with the fixed NOW it still resolves — the clock is what decides',
      (await resolveCurrentUsagePeriod(adminWith() as never, USER, now))?.source === 'shopify_trial')
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA4) An unresolved period is NOT quota exhaustion')
  {
    check('A4-a: SOURCE — no period yields its own typed result',
      /if \(!period\) return \{ ok: false, kind: 'usage_period_unavailable' \}/.test(generation))
    check('A4-b: SOURCE — and never quota_exceeded',
      !/if \(!period\) return \{ ok: false, kind: 'quota_exceeded' \}/.test(generation))
    check('A4-c: SOURCE — a REAL reserve_usage quota_exceeded stays quota_exceeded',
      /if \(reservation\.outcome === 'quota_exceeded'\) return \{ ok: false, kind: 'quota_exceeded' \}/.test(generation))
    check('A4-d: SOURCE — the period is resolved BEFORE any reservation, so nothing is reserved',
      generation.indexOf('const period = await resolveCurrentUsagePeriod') < generation.indexOf('const reservation = await reserveUsage'))
    check('A4-e: SOURCE — and before any Gemini call',
      generation.indexOf("kind: 'usage_period_unavailable'") < generation.indexOf('const gen = await deps.generate(brief)'))
    check('A4-f: SOURCE — the HTTP route maps it to a retryable 503',
      /case 'usage_period_unavailable':[\s\S]{0,200}reason: 'usage_period_unavailable' \}, \{ status: 503 \}/.test(route))
    check('A4-g: SOURCE — quota_exceeded still returns 429',
      /case 'quota_exceeded':[\s\S]{0,160}reason: 'quota_exceeded' \}, \{ status: 429 \}/.test(route))
    check('A4-h: SOURCE — the automated path propagates it without converting it',
      /gen\.kind === 'usage_period_unavailable'/.test(item)
      && !/usage_period_unavailable[\s\S]{0,80}=> 'quota_exceeded'/.test(item))
    check('A4-i: SOURCE — and treats it as transient, so no retry budget is burned',
      /const transient = [\s\S]{0,400}gen\.kind === 'usage_period_unavailable'/.test(item))
    check('A4-j: SOURCE — the item reason is the kind itself, not a rewrite',
      /let reason: string = gen\.kind/.test(item))
    check('A4-k: SOURCE — a failed generation still releases the reservation',
      /if \(reservationId && reservationToken\) await releaseUsageReservation\(admin, \{ reservationId, userId, reservationToken, reason: `generation_failed:\$\{reason\}` \}\)/.test(generation))
    check('A4-l: SOURCE — and consumes no article credit on that path',
      !/finalizeArticleGeneration[\s\S]{0,120}generation_failed/.test(generation))
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA5) The merchant never sees a raw machine code')
  {
    const en = read('lib/i18n/dashboard/en.ts')
    const he = read('lib/i18n/dashboard/he.ts')
    check('A5-a: English quota_exceeded label',
      /quota_exceeded: 'Your account has used all its articles for the current billing period\.'/.test(en))
    check('A5-b: Hebrew quota_exceeded label',
      /quota_exceeded: 'ניצלתם את כל המאמרים בחשבון לתקופת החיוב הנוכחית\.'/.test(he))
    check('A5-c: English usage_period_unavailable label',
      /usage_period_unavailable: 'We couldn’t verify your billing period just now\. Please try again shortly\.'/.test(en))
    check('A5-d: Hebrew usage_period_unavailable label',
      /usage_period_unavailable: 'לא הצלחנו לאמת כרגע את תקופת החיוב\. נסו שוב בעוד רגע\.'/.test(he))
    check('A5-e: they are distinct from Gemini’s own provider-quota message',
      /gemini_quota_exceeded: 'Gemini quota \/ rate limit exceeded/.test(en))
    check('A5-f: SOURCE — the queue UI resolves codes through the dictionary, not raw',
      /const label = genErrors\[base\] \?\? base/.test(strip(read('components/content/AutomationSchedule.tsx'))))
    // Both codes must actually be IN the dictionary the UI looks them up in,
    // otherwise the lookup falls through to the raw string.
    for (const [lang, src] of [['en', en], ['he', he]] as const) {
      const block = src.slice(src.indexOf('genErrors: {'), src.indexOf('genErrors: {') + 4000)
      check(`A5-g: '${lang}' genErrors contains BOTH codes, so neither falls through raw`,
        /\bquota_exceeded:/.test(block) && /usage_period_unavailable:/.test(block))
    }
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nB) The publishing queue is on BOTH sub-tabs')
  {
    check('B-a: exactly ONE AutomationSchedule instance is rendered',
      (hub.match(/<AutomationSchedule/g) ?? []).length === 1)
    check('B-b: and exactly one import of it', (hub.match(/import AutomationSchedule from/g) ?? []).length === 1)

    // It must sit AFTER the auto/manual conditional closes, and still inside
    // the automationEnabled block.
    const gate = hub.indexOf('{automationEnabled && (')
    const conditional = hub.indexOf("{ideasSection === 'manual' ? (")
    const conditionalEnd = hub.indexOf('</>\n                  )}', conditional)
    const schedule = hub.indexOf('<AutomationSchedule')
    check('B-c: it is rendered OUTSIDE the auto/manual conditional',
      conditionalEnd !== -1 && schedule > conditionalEnd)
    check('B-d: and still INSIDE automationEnabled', gate !== -1 && gate < schedule)
    check('B-e: so section=manual renders the queue', schedule > conditionalEnd && gate < schedule)
    check('B-f: and section=auto renders the same one', (hub.match(/<AutomationSchedule/g) ?? []).length === 1)
    check('B-g: the manual branch still offers manual topic creation',
      /t\.manualTopicTitle/.test(hub) && /t\.newTopicButton/.test(hub))
    check('B-h: the auto branch still renders AutomationIdeas',
      (hub.match(/<AutomationIdeas/g) ?? []).length === 1 && hub.indexOf('<AutomationIdeas') < conditionalEnd)

    check('B-i: scheduleSectionRef still wraps it, so onGoToQueue scrolling works',
      /<div ref=\{scheduleSectionRef\} className="scroll-mt-4">\s*\n\s*<AutomationSchedule/.test(hub))
    check('B-j: exactly one scheduleSectionRef target', (hub.match(/ref=\{scheduleSectionRef\}/g) ?? []).length === 1)
    check('B-k: refreshKey and onChanged are preserved verbatim',
      /refreshKey=\{automationRefresh\}/.test(hub)
      && /onChanged=\{\(\) => \{ loadTopics\(\); setAutomationRefresh\(\(k\) => k \+ 1\) \}\}/.test(hub))
    check('B-l: every onGoToQueue still scrolls to that one ref',
      (hub.match(/onGoToQueue=\{\(\) => scheduleSectionRef\.current\?\.scrollIntoView/g) ?? []).length >= 1)
    check('B-m: ONE component means one state — switching tabs cannot create a second queue',
      (hub.match(/<AutomationSchedule/g) ?? []).length === 1 && !/ideasSection === 'auto'[\s\S]{0,200}<AutomationSchedule/.test(hub))
    check('B-n: nor can it lose the refreshed state — refreshKey lives in the parent',
      /const \[automationRefresh, setAutomationRefresh\] = useState/.test(hub)
      && hub.indexOf('const [automationRefresh') < gate)
    check('B-o: queueing a manual topic still refreshes that queue',
      /const handleScheduled = useCallback/.test(hub) && /setAutomationRefresh/.test(hub))
    check('B-p: SCOPE — a source contract on placement; not a rendered-DOM test', true)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
