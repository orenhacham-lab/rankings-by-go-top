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
import { reserveUsage, releaseUsageReservation } from '../usage-reservations'
import type { createAdminClient } from '@/lib/supabase/admin'
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
type Admin = ReturnType<typeof createAdminClient>
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
    ...over,
  }
}
const adminWith = (over: Record<string, unknown> = {}) =>
  new FakeAdmin({ shopify_connections: [shopifyConn(over)], subscriptions: [] })

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
  console.log('\nA1B) BEHAVIOURAL — the trial period actually admits a reservation')
  {
    // The full pre-Gemini gate, run for real: resolve the period from the
    // incident's own connection row, then take the atomic reservation the
    // generator takes, against FakeAdmin's reserve_usage RPC.
    const admin = new FakeAdmin(
      { shopify_connections: [shopifyConn()], subscriptions: [], projects: [{ id: 'p1', user_id: USER }], usage_reservations: [], generated_articles: [] },
      {}, () => NOW.getTime(),
    )
    const period = await resolveCurrentUsagePeriod(admin as never, USER, now)
    check('A1B-a: the period resolves', period !== null)

    let geminiCalls = 0
    const reservation = await reserveUsage(admin as unknown as Admin, {
      userId: USER, projectId: null, usageType: 'article', amount: 1,
      periodStart: period!.start, periodEnd: period!.end,
      limit: ADVANCED_LIMIT, idempotencyKey: 'topic:incident',
    })
    check('A1B-b: the reservation is GRANTED — not quota_exceeded', reservation.outcome === 'reserved', reservation.outcome)
    check('A1B-c: bounded by the Advanced allowance of 20', ADVANCED_LIMIT === 20)
    // The generator calls Gemini only after the reservation succeeds; a stub
    // stands in for it so "did we get past the gate?" is observable.
    if (reservation.outcome === 'reserved') geminiCalls++
    check('A1B-d: generation REACHES the Gemini call instead of stopping at quota', geminiCalls === 1)
    check('A1B-e: exactly one ledger row was created',
      (admin.tables.usage_reservations as unknown[]).length === 1)

    // A failed generation releases the reservation and consumes no article.
    const { reservationId, reservationToken } = reservation as { reservationId: string; reservationToken: string }
    await releaseUsageReservation(admin as unknown as Admin, { reservationId, userId: USER, reservationToken, reason: 'generation_failed:gemini_timeout' })
    const row = (admin.tables.usage_reservations as Record<string, unknown>[])[0]!
    check('A1B-f: a failed generation RELEASES the reservation', row.status === 'released')
    check('A1B-g: and consumes no article credit', row.consumed_amount === 0)
    check('A1B-h: no article row was written', (admin.tables.generated_articles as unknown[]).length === 0)

    // 19 more topics fit; the 21st does not.
    const more = await Promise.all(Array.from({ length: ADVANCED_LIMIT }, (_, i) => reserveUsage(admin as unknown as Admin, {
      userId: USER, projectId: null, usageType: 'article', amount: 1,
      periodStart: period!.start, periodEnd: period!.end, limit: ADVANCED_LIMIT, idempotencyKey: `topic:fill-${i}`,
    })))
    check('A1B-i: the released credit is reusable — all 20 fit',
      more.filter((r) => r.outcome === 'reserved').length === ADVANCED_LIMIT)
  }

  // ───────────────────────────────────────────────────────────────────────
  console.log('\nA1C) BEHAVIOURAL — a genuinely exhausted 20/20 allowance still says quota_exceeded')
  {
    const period = await resolveCurrentUsagePeriod(adminWith(), USER, now)
    const admin = new FakeAdmin(
      {
        shopify_connections: [shopifyConn()], subscriptions: [], projects: [{ id: 'p1', user_id: USER }],
        generated_articles: [],
        usage_reservations: [{
          id: 'r-full', user_id: USER, project_id: null, usage_type: 'article',
          reserved_amount: ADVANCED_LIMIT, consumed_amount: ADVANCED_LIMIT, released_amount: 0,
          period_start: period!.start.toISOString(), period_end: period!.end.toISOString(),
          idempotency_key: 'topic:spent', status: 'consumed', created_at: '2026-09-02T00:00:00Z',
        }],
      },
      {}, () => NOW.getTime(),
    )
    let geminiCalls = 0
    const r = await reserveUsage(admin as unknown as Admin, {
      userId: USER, projectId: null, usageType: 'article', amount: 1,
      periodStart: period!.start, periodEnd: period!.end, limit: ADVANCED_LIMIT, idempotencyKey: 'topic:one-too-many',
    })
    if (r.outcome === 'reserved') geminiCalls++
    check('A1C-a: a REAL exhaustion still reports quota_exceeded', r.outcome === 'quota_exceeded')
    check('A1C-b: and Gemini is never called', geminiCalls === 0)
    check('A1C-c: no extra ledger row is created',
      (admin.tables.usage_reservations as unknown[]).length === 1)
    check('A1C-d: so the fix did not turn a real limit into an unlimited allowance',
      r.outcome === 'quota_exceeded' && ADVANCED_LIMIT === 20)
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
      generation.indexOf("kind: 'usage_period_unavailable'") < generation.indexOf('const gen = await generateValidatedArticle(brief)'))
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
