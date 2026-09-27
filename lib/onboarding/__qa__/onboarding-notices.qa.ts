/**
 * Every answer the onboarding calls can get becomes ONE notice: a title and a
 * sentence of our own, in the merchant's language, with at most one action.
 *
 *   - every code the seed API can answer (start, claim, continue), every way
 *     stage A can stop, every tracking outcome and every refusal of the create
 *     and generate routes maps to a notice or an article error with copy in
 *     both languages;
 *   - only the stable code (and status) is read: text a route sends along is
 *     never part of what is shown, whatever it says;
 *   - a wait comes from Retry-After and is said in minutes or hours, or as
 *     "later" when the server gave none; never a time we invented;
 *   - a refusal handed from the new-project screen to the project's screen
 *     travels in the address as a known key and a whole number, nothing else.
 *
 * Run: npx tsx lib/onboarding/__qa__/onboarding-notices.qa.ts
 */
import { dashboardEn } from '@/lib/i18n/dashboard/en'
import { dashboardHe } from '@/lib/i18n/dashboard/he'
import { makeChecker, SECRET } from '@/lib/seed-scan/__qa__/_fixtures'
import { SEED_API_ERROR_CODES, SEED_STEP_ERROR_CODES, SEED_TRACKING_CODES } from '@/lib/seed-scan/types'
import { readHandedOffNotice, START_NOTICE_ACTIONS, summaryAfterStartHref } from '../handoff'
import {
  continueNotice,
  createNotice,
  FIRST_ARTICLE_ERRORS,
  firstArticleError,
  NOTICE_KEYS,
  OFFLINE_NOTICE,
  readRefusal,
  RETRYABLE_ARTICLE_ERRORS,
  stageFailureNotice,
  startNotice,
  trackingNotice,
  WAIT_NOTICES,
  waitParts,
  type Notice,
} from '../notices'

const { check, finish } = makeChecker()
const ACTIONS = ['retry', 'refresh', 'billing', 'signin', 'dashboard', 'settings', 'clients']
const PROJECT = 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'

const valid = (n: Notice) => (NOTICE_KEYS as readonly string[]).includes(n.key) && (n.action === null || ACTIONS.includes(n.action))

/** The copy a notice renders to: the component's own resolution (components/onboarding/SeedNotice.tsx). */
function copyOf(n: Notice, dict: typeof dashboardHe): { title: string; body: string } | null {
  const c = (dict.seedOnboarding.notices as Record<string, { title: string; body: string | ((w: string) => string) }>)[n.key]
  if (!c) return null
  return { title: c.title, body: typeof c.body === 'string' ? c.body : c.body('X') }
}

function main() {
  console.log('\n1) Starting a scan')
  const statusFor = (code: string) =>
    ({ unauthorized: 401, not_found: 404, invalid_request: 400, claim_invalid: 400, entitlement_required: 403, entitlement_unavailable: 503, unavailable: 503, run_in_progress: 409, not_continuable: 409, stage_b_started: 409, rescan_too_soon: 429, user_daily_cap: 429, global_daily_cap: 429, internal: 500 })[code] ?? 500
  for (const code of SEED_API_ERROR_CODES) {
    const n = startNotice(statusFor(code), { ok: false, code, retryAfterSeconds: 7200, error: SECRET })
    check(`start "${code}" → ${n.key}${n.action ? ` + ${n.action}` : ''}`, valid(n) && !JSON.stringify(n).includes(SECRET))
  }
  check('the key refusals say the right thing', startNotice(401, { code: 'unauthorized' }).key === 'signedOut'
    && startNotice(403, { code: 'entitlement_required' }).action === 'billing'
    && startNotice(409, { code: 'run_in_progress' }).key === 'runInProgress'
    && startNotice(400, { code: 'claim_invalid' }).key === 'claimExpired'
    && startNotice(503, { code: 'unavailable' }).key === 'busy')
  check('a daily cap carries its wait (from retryAfterSeconds) and leads to the dashboard, not to a retry',
    JSON.stringify(startNotice(429, { code: 'user_daily_cap', retryAfterSeconds: 3600 })) === JSON.stringify({ key: 'userDailyCap', action: 'dashboard', retryAfterSeconds: 3600 }))
  check('a code we do not know, or no body at all → "something went wrong" with a retry',
    startNotice(500, { code: 'db_exploded', message: SECRET }).key === 'failed' && startNotice(502, null).key === 'failed' && startNotice(500, 'text').key === 'failed')
  check('…a bare 401 / 404 without a code still reads as signed out / not available',
    startNotice(401, null).key === 'signedOut' && startNotice(404, {}).key === 'notAvailable')
  check('only the code and the wait are read from a body', JSON.stringify(readRefusal({ code: 'rescan_too_soon', retryAfterSeconds: 12.2, error: SECRET, message: SECRET }))
    === JSON.stringify({ code: 'rescan_too_soon', retryAfterSeconds: 13 }))
  check('…and a wait that is not a positive number is dropped', readRefusal({ code: 'user_daily_cap', retryAfterSeconds: -5 }).retryAfterSeconds === undefined
    && readRefusal({ code: 'user_daily_cap', retryAfterSeconds: 'soon' }).retryAfterSeconds === undefined)
  check('offline → its own notice, with a retry', OFFLINE_NOTICE.key === 'offline' && OFFLINE_NOTICE.action === 'retry')

  console.log('\n2) "Start" on the summary (continue), and what tracking came to')
  for (const code of SEED_API_ERROR_CODES) {
    const n = continueNotice(statusFor(code), { ok: false, code, error: SECRET })
    check(`continue "${code}" → ${n === 'open_dashboard' ? 'open the dashboard' : `${n.key}${n.action ? ` + ${n.action}` : ''}`}`, n === 'open_dashboard' || valid(n))
  }
  check('stage B already begun is not an error: the dashboard is where to go', continueNotice(409, { code: 'stage_b_started' }) === 'open_dashboard')
  check('a keyword list the run does not know (400) → "the list changed", refresh', (() => {
    const n = continueNotice(400, { code: 'invalid_request' })
    return n !== 'open_dashboard' && n.key === 'keywordsChanged' && n.action === 'refresh'
  })())
  for (const code of SEED_TRACKING_CODES) {
    const n = trackingNotice({ requested: 5, added: 0, code })
    const expected = code === 'keyword_quota_exceeded' ? 'keywordQuota' : code === 'keyword_entitlement_unavailable' || code === 'keywords_add_failed' ? 'keywordsNotAdded' : null
    check(`tracking "${code}" → ${expected ?? 'no notice'}`, expected === null ? n === null : n?.key === expected && n.action === 'dashboard')
  }
  check('a tracking outcome we do not know → no notice', trackingNotice({ code: 'weird' }) === null && trackingNotice(null) === null)

  console.log('\n3) Creating the project, and a stage A that stopped')
  check('create 401 → signed out; 403 QUOTA_PROJECTS → the plan\'s project limit, to plans; 503 → plan unavailable, retry',
    createNotice(401, {}).key === 'signedOut' && createNotice(403, { code: 'QUOTA_PROJECTS', error: SECRET }).key === 'projectQuota'
    && createNotice(403, { code: 'QUOTA_PROJECTS' }).action === 'billing' && createNotice(503, {}).key === 'planUnavailable')
  check('…anything else, including a 500 with the database\'s message, → "we could not create the project", retry',
    createNotice(500, { error: SECRET }).key === 'createFailed' && createNotice(400, { error: 'Missing required fields' }).key === 'createFailed'
    && createNotice(403, { code: 'SOMETHING_ELSE' }).key === 'createFailed')
  for (const code of [...SEED_STEP_ERROR_CODES, null, 'made_up']) {
    const n = stageFailureNotice(code as string | null)
    check(`stage A stopped with ${JSON.stringify(code)} → ${n.key} + ${n.action}`, valid(n) && n.action !== null)
  }
  check('an address that is not a readable site sends the merchant to the project settings',
    ['invalid_site_url', 'site_not_html', 'site_offsite_redirect'].every((c) => stageFailureNotice(c).action === 'settings'))

  console.log('\n4) Copy for every notice, in both languages')
  for (const key of NOTICE_KEYS) {
    const he = copyOf({ key, action: null }, dashboardHe)
    const en = copyOf({ key, action: null }, dashboardEn as unknown as typeof dashboardHe)
    check(`"${key}" has a title and a sentence in Hebrew and English`, !!he && !!en && he.title.length > 0 && he.body.length > 0 && en.title.length > 0 && en.body.length > 0)
  }
  check('the wait notices, and only they, take the wait as a sentence part',
    NOTICE_KEYS.every((k) => (typeof (dashboardHe.seedOnboarding.notices as Record<string, { body: unknown }>)[k].body === 'function') === WAIT_NOTICES.includes(k)))
  check('waits: under an hour in minutes (rounded up), then hours (rounded up), never zero',
    JSON.stringify([30, 60, 61, 3599, 3600, 3601, 86400, 0].map(waitParts)) === JSON.stringify([
      { unit: 'minutes', value: 1 }, { unit: 'minutes', value: 1 }, { unit: 'minutes', value: 2 }, { unit: 'minutes', value: 60 },
      { unit: 'hours', value: 1 }, { unit: 'hours', value: 2 }, { unit: 'hours', value: 24 }, { unit: 'minutes', value: 1 },
    ]))
  check('the actions all have a label in both languages', ACTIONS.every((a) => !!(dashboardHe.seedOnboarding.actions as Record<string, string>)[a] && !!(dashboardEn.seedOnboarding.actions as Record<string, string>)[a]))

  console.log('\n5) The first article')
  const cases: [number, unknown, string][] = [
    [429, { reason: 'quota_exceeded', error: SECRET }, 'quota'],
    [403, { reason: 'shopify_billing_required' }, 'billing'],
    [503, { reason: 'entitlement_unavailable' }, 'unavailable'],
    [503, { reason: 'usage_period_unavailable' }, 'unavailable'],
    [409, { reason: 'generation_in_progress' }, 'inProgress'],
    [400, { reason: 'cta_details_missing' }, 'details'],
    [400, { reason: 'required_anchor_missing_url' }, 'details'],
    [422, { error: 'article_quality_gate_failed', reason: 'article_quality_gate_failed', audit: { blockers: ['x'] } }, 'quality'],
    [502, { error: 'article_quality_gate_failed', reason: 'gemini_request_failed' }, 'generic'],
    [500, { error: SECRET }, 'generic'],
    [404, { error: 'Not found' }, 'generic'],
    [500, null, 'generic'],
  ]
  for (const [status, body, expected] of cases) check(`generate ${status} ${JSON.stringify((body as { reason?: string } | null)?.reason ?? null)} → ${expected}`, firstArticleError(status, body) === expected)
  check('every article error has a sentence in both languages', FIRST_ARTICLE_ERRORS.every((e) => !!dashboardHe.seedOnboarding.firstArticle.errors[e] && !!dashboardEn.seedOnboarding.firstArticle.errors[e]))
  check('a retry is offered only where a second try can help', RETRYABLE_ARTICLE_ERRORS.join(',') === 'unavailable,quality,generic')

  console.log('\n6) A refusal handed from the new-project screen to the project\'s')
  for (const code of SEED_API_ERROR_CODES) {
    const n = startNotice(statusFor(code), { code, retryAfterSeconds: 5400 })
    const href = summaryAfterStartHref(PROJECT, n)
    const url = new URL(href, 'https://app.example')
    const back = readHandedOffNotice(Object.fromEntries(url.searchParams.entries()))
    check(`"${code}" survives the trip: ${n.key}`, JSON.stringify(back) === JSON.stringify(n), `${href} → ${JSON.stringify(back)}`)
  }
  {
    const n = OFFLINE_NOTICE
    const url = new URL(summaryAfterStartHref(PROJECT, n), 'https://app.example')
    check('offline survives it too', JSON.stringify(readHandedOffNotice(Object.fromEntries(url.searchParams.entries()))) === JSON.stringify(n))
  }
  check('every start notice\'s action is the one the table hands over',
    SEED_API_ERROR_CODES.every((code) => {
      const n = startNotice(statusFor(code), { code })
      return START_NOTICE_ACTIONS[n.key] === n.action
    }) && START_NOTICE_ACTIONS.offline === OFFLINE_NOTICE.action)
  check('no refusal → the plain research address', summaryAfterStartHref(PROJECT, null) === `/projects/${PROJECT}/summary?projectId=${PROJECT}`)
  check('the address stays on this site and names this project', summaryAfterStartHref(PROJECT, OFFLINE_NOTICE).startsWith(`/projects/${PROJECT}/summary?projectId=${PROJECT}&`))
  const forged: [string, Record<string, string | string[]>][] = [
    ['a key we do not have', { notice: 'hacked' }],
    ['a key that is not a start notice', { notice: 'keywordQuota' }],
    ['a prototype name', { notice: '__proto__' }],
    ['a sentence', { notice: 'Your account is suspended, call 555' }],
  ]
  for (const [label, params] of forged) check(`${label} → nothing shown`, readHandedOffNotice(params) === null)
  check('a wait that is not a whole positive number is dropped', readHandedOffNotice({ notice: 'userDailyCap', wait: '-3' })?.retryAfterSeconds === undefined
    && readHandedOffNotice({ notice: 'userDailyCap', wait: '1e9' })?.retryAfterSeconds === undefined
    && readHandedOffNotice({ notice: 'userDailyCap', wait: '12abc' })?.retryAfterSeconds === undefined)
  check('…and an absurd one is capped at two days', readHandedOffNotice({ notice: 'userDailyCap', wait: '9999999' })?.retryAfterSeconds === 172800)
  check('a repeated parameter takes the first', readHandedOffNotice({ notice: ['busy', 'hacked'] })?.key === 'busy')

  finish()
}

main()

export {}
