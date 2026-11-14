/**
 * 정보통신망법 제50조: WHAT THIS SUITE HOLDS IN PLACE.
 *
 * The decision itself is in lib/compliance/korea-promotional-email.ts: the two
 * setup emails are treated as 광고성 정보 and the approval reminder and the
 * weekly summary as service mail. Three things could undo it in one edit, and
 * none of them would fail any other suite:
 *
 *   A) the classification table changed, so a promotional email stops being one;
 *   B) the gate dropped from the setup-email run, or the opt-in read replaced
 *      by a constant, so a reader in Korea is mailed without a consent;
 *   C) the 제50조 제4항 제1호 subject mark lost on the way to the builder, so a
 *      reader who DID consent gets an unmarked advertisement.
 *
 * Five classes of check, each with a mutation control:
 *   A) the classification table, and the one place each kind is named;
 *   B) placement, including the residual this deliberately does not catch;
 *   C) the gate's five answers, and that it fails closed on an unreadable opt-in;
 *   D) the recorded opt-in: the Korean id is the whole test, a refusal is not a
 *      consent, and a read that errors is null;
 *   E) the run end to end: a Korean project is not mailed, one that consented is
 *      and its subject carries the mark, and a reader elsewhere is untouched.
 *
 * Run: npx tsx lib/compliance/__qa__/korea-promotional-email.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'
import { MARKETING_CONSENT_VERSION_KO, consentRecord } from '@/lib/presignup/copy'
import { runOnboardingEmails, type OnboardingDeps, type OutgoingOnboarding } from '@/lib/onboarding-emails/run'
import { buildOnboardingEmail } from '@/lib/onboarding-emails/email'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import {
  CUSTOMER_EMAIL_KINDS,
  KOREA_AD_SUBJECT_MARK,
  isPromotional,
  koreaAdSubject,
  koreaEmailDecision,
  placedInKorea,
  type CustomerEmailKind,
} from '../korea-promotional-email'
import { KOREA_MARKETING_MARKER, REPORT_REQUESTS_TABLE, readKoreanMarketingOptIn } from '../korea-marketing-opt-in'
import {
  SIGNUP_ATTRIBUTION_TABLE,
  SIGNUP_COUNTRY_HEADER,
  isFreshForCountry,
  normalizeSignupCountry,
  readSignupCountry,
  recordSignupCountry,
} from '../signup-country'
import { COUNTRY_HEADER } from '@/lib/billing/server-market'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Source guards match code, not prose. */
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const OWNER = '11111111-1111-4111-8111-111111111111'
const P1 = 'aaaaaaaa-0000-4000-8000-000000000001'
const D = 86_400_000
// Sunday 27 Sep 2026, 09:10 in Israel = 06:10 UTC, inside the send window.
const now = new Date('2026-09-27T06:10:00.000Z')
const before = (ms: number) => new Date(now.getTime() - ms).toISOString()
const fullEnv = {
  ONBOARDING_EMAILS_ENABLED: 'true',
  RESEND_API_KEY: 're_test',
  RESEND_FROM_EMAIL: 'Go Top <hello@mail.example.com>',
  CRON_SECRET: 'cron-secret-for-tests-only',
  NEXT_PUBLIC_APP_URL: 'https://app.example.com',
}

async function main() {
  // ── A) the classification ────────────────────────────────────────────────
  console.log('A) the classification table')
  check('A1: the four recurring customer emails are all classified',
    Object.keys(CUSTOMER_EMAIL_KINDS).sort().join(',') === 'approval_reminder,setup_connect,setup_publish,weekly_summary')
  check('A2: the two setup emails are promotional', isPromotional('setup_connect') && isPromotional('setup_publish'))
  check('A3: the approval reminder is service mail', !isPromotional('approval_reminder'))
  check('A4: the weekly summary is service mail', !isPromotional('weekly_summary'))
  check('A5: the table is frozen', Object.isFrozen(CUSTOMER_EMAIL_KINDS))

  // The two promotional kinds are named in exactly one place, and it is the run
  // that sends them. A new sender that forgets the gate shows up as a kind used
  // nowhere, which is what A6 is for.
  const runSrc = strip(code('lib/onboarding-emails/run.ts'))
  check('A6: the setup run names both promotional kinds',
    runSrc.includes("'setup_connect'") && runSrc.includes("'setup_publish'"))
  check('A7: the setup run calls the gate and honours a refusal',
    /koreaEmailDecision\(\{/.test(runSrc) && /if \(!korea\.send\)/.test(runSrc))
  check('A8: the service senders are NOT gated (the classification is in one place only)',
    !strip(code('lib/reminders/run.ts')).includes('koreaEmailDecision')
    && !strip(code('lib/reports/weekly/run.ts')).includes('koreaEmailDecision'))

  // ── B) placement ─────────────────────────────────────────────────────────
  console.log('\nB) who counts as placed in Korea')
  check('B1: the project country', placedInKorea({ projectCountry: 'KR' }))
  check('B2: a lower-case country too', placedInKorea({ projectCountry: 'kr' }))
  check('B3: the account language', placedInKorea({ accountLocale: 'ko' }))
  check('B4: a tagged locale', placedInKorea({ accountLocale: 'ko-KR' }) && placedInKorea({ accountLocale: 'ko_KR' }))
  check('B5: the project content language', placedInKorea({ projectLanguage: 'ko' }))
  check('B5b: the country the account was opened from', placedInKorea({ signupCountry: 'KR' }))
  check('B5c: the signup country alone, with everything else foreign — the residual this closed',
    placedInKorea({ signupCountry: 'KR', accountLocale: 'en', projectCountry: 'US', projectLanguage: 'en' }))
  check('B5d: a signup country elsewhere does not place a Korean-language account outside Korea',
    placedInKorea({ signupCountry: 'US', accountLocale: 'ko' }))
  check('B6: an Israeli Hebrew project is not placed there',
    !placedInKorea({ accountLocale: 'he', projectCountry: 'IL', projectLanguage: 'he' }))
  check('B7: nothing recorded is not Korea', !placedInKorea({}) && !placedInKorea({ signupCountry: null, accountLocale: null, projectCountry: null, projectLanguage: null }))
  check('B8: "korean" as a free-text language is not read as the locale', !placedInKorea({ projectLanguage: 'korean' }))
  // The residual the module states: an account with NO country recorded — one
  // opened before 2026-11-13, or a request the CDN could not place — is placed
  // in Korea only by its language or its project.
  check('B9: the stated residual still exists (no country recorded, English everywhere)',
    !placedInKorea({ signupCountry: null, accountLocale: 'en', projectCountry: 'US', projectLanguage: 'en' }))

  // ── C) the gate ──────────────────────────────────────────────────────────
  console.log('\nC) the gate')
  const kr = { projectCountry: 'KR' }
  const il = { projectCountry: 'IL', accountLocale: 'he' }
  for (const kind of ['approval_reminder', 'weekly_summary'] as CustomerEmailKind[]) {
    const d = koreaEmailDecision({ kind, facts: kr, optIn: false })
    check(`C1: ${kind} reaches Korea without a marketing consent`, d.send === true && d.markAsAd === false)
  }
  check('C2: a promotional email reaches a reader outside Korea unmarked',
    koreaEmailDecision({ kind: 'setup_connect', facts: il, optIn: false }).send === true)
  const blocked = koreaEmailDecision({ kind: 'setup_connect', facts: kr, optIn: false })
  check('C3: a promotional email is blocked in Korea with no consent',
    blocked.send === false && blocked.reason === 'no_korean_opt_in')
  const unreadable = koreaEmailDecision({ kind: 'setup_publish', facts: kr, optIn: null })
  check('C4: an unreadable consent is not a consent (fails closed)',
    unreadable.send === false && unreadable.reason === 'opt_in_unreadable')
  const consented = koreaEmailDecision({ kind: 'setup_connect', facts: kr, optIn: true })
  check('C5: a recorded consent sends, and owes the subject mark',
    consented.send === true && consented.markAsAd === true)

  console.log('\nC) the subject mark')
  check('C6: the mark is the two syllables of 광고 in brackets',
    [...KOREA_AD_SUBJECT_MARK].map((c) => c.codePointAt(0)).join(',') === [0x28, 0xad11, 0xace0, 0x29].join(','),
    KOREA_AD_SUBJECT_MARK)
  check('C7: the mark goes at the front', koreaAdSubject('shop.example.com is not connected yet').startsWith(`${KOREA_AD_SUBJECT_MARK} `))
  check('C8: it is added once, not stacked', koreaAdSubject(koreaAdSubject('x')) === `${KOREA_AD_SUBJECT_MARK} x`)

  // ── D) the recorded opt-in ───────────────────────────────────────────────
  console.log('\nD) the recorded opt-in')
  check('D1: the table is the one the pre-signup screen writes',
    REPORT_REQUESTS_TABLE === 'free_check_report_requests'
    && code('lib/presignup/http.ts').includes(`REPORT_REQUESTS_TABLE = '${REPORT_REQUESTS_TABLE}'`))
  check('D2: the marker is the Korean marketing version id', KOREA_MARKETING_MARKER === `[${MARKETING_CONSENT_VERSION_KO}]`)

  const row = (email: string, marketing: boolean, locale: 'ko' | 'en' = 'ko') =>
    ({ check_id: 'c1', email, consent: true, consent_text: consentRecord(locale, marketing) })
  const optIn = async (rows: Record<string, unknown>[], hooks = {}) =>
    readKoreanMarketingOptIn(new FakeAdmin({ [REPORT_REQUESTS_TABLE]: rows }, hooks) as unknown as ServiceRoleClient, 'owner@example.com')

  check('D3: a Korean consent row is a consent', (await optIn([row('owner@example.com', true)])) === true)
  check('D4: a Korean REFUSAL row is not a consent', (await optIn([row('owner@example.com', false)])) === false)
  check('D5: no row at all is not a consent', (await optIn([])) === false)
  check('D6: another language\'s consent is not the Korean one',
    (await optIn([row('owner@example.com', true, 'en')])) === false)
  check('D7: somebody else\'s consent is not this reader\'s',
    (await optIn([row('someone@else.example', true)])) === false)
  check('D8: the address is matched as it is stored, trimmed and lower-cased',
    (await readKoreanMarketingOptIn(
      new FakeAdmin({ [REPORT_REQUESTS_TABLE]: [row('owner@example.com', true)] }) as unknown as ServiceRoleClient,
      '  Owner@Example.COM ')) === true)
  check('D9: a read that errors is null, never false',
    (await optIn([row('owner@example.com', true)], { [REPORT_REQUESTS_TABLE]: { select: () => ({ code: '42P01', message: 'missing' }) } })) === null)

  // ── E) the run ───────────────────────────────────────────────────────────
  console.log('\nE) the run')
  const project = (over: Record<string, unknown> = {}) =>
    ({ id: P1, user_id: OWNER, created_at: before(10 * D), target_domain: 'shop.example.com', business_name: null, is_active: true, country: 'IL', language: 'he', ...over })
  const owner = (locale: 'he' | 'ko') => async () =>
    ({ email: 'owner@example.com', locale, firstName: null, shopifyAppStoreOrigin: false as const, staff: false })
  const deps = (admin: FakeAdmin, over: Partial<OnboardingDeps> = {}): OnboardingDeps => ({
    admin: admin as unknown as ServiceRoleClient, env: fullEnv, now: () => now, owner: owner('he'), send: async () => ({ ok: true }), ...over,
  })

  const outside: OutgoingOnboarding[] = []
  const e1 = new FakeAdmin({ projects: [project()] })
  const r1 = await runOnboardingEmails(deps(e1, { send: async (m) => { outside.push(m); return { ok: true } } }))
  check('E1: an Israeli project still gets its setup email, unmarked',
    r1.status === 'done' && r1.sent === 1 && outside.length === 1 && !outside[0].email.subject.includes(KOREA_AD_SUBJECT_MARK))

  const e2 = new FakeAdmin({ projects: [project({ country: 'KR', language: 'ko' })] })
  let krSends = 0
  const r2 = await runOnboardingEmails(deps(e2, { owner: owner('ko'), send: async () => { krSends++; return { ok: true } } }))
  check('E2: a Korean project with no recorded consent is not mailed',
    r2.status === 'done' && r2.sent === 0 && krSends === 0)
  check('E3: and no send was claimed, so it can be mailed the day a consent exists',
    (e2.tables.project_reminder_state ?? []).every((s) => !s.onboarding_last_sent_at && !s.last_sent_at))

  const e3 = new FakeAdmin({
    projects: [project({ country: 'KR', language: 'ko' })],
    [REPORT_REQUESTS_TABLE]: [row('owner@example.com', true)],
  })
  const marked: OutgoingOnboarding[] = []
  const r3 = await runOnboardingEmails(deps(e3, { owner: owner('ko'), send: async (m) => { marked.push(m); return { ok: true } } }))
  check('E4: a Korean reader who consented IS mailed',
    r3.status === 'done' && r3.sent === 1 && marked.length === 1)
  check('E5: and the subject line carries the 제50조 제4항 mark',
    marked.length === 1 && marked[0].email.subject.startsWith(KOREA_AD_SUBJECT_MARK))

  const e4 = new FakeAdmin(
    { projects: [project({ country: 'KR', language: 'ko' })], [REPORT_REQUESTS_TABLE]: [row('owner@example.com', true)] },
    { [REPORT_REQUESTS_TABLE]: { select: () => ({ code: '08006', message: 'connection reset' }) } },
  )
  let unreadableSends = 0
  const r4 = await runOnboardingEmails(deps(e4, { owner: owner('ko'), send: async () => { unreadableSends++; return { ok: true } } }))
  check('E6: an unreadable consent table sends nothing to Korea',
    r4.status === 'done' && r4.sent === 0 && unreadableSends === 0)

  // The builder never decides this for itself.
  const built = buildOnboardingEmail({
    stage: 'connect', locale: 'ko', firstName: null, domain: 'shop.example.com',
    projectId: P1, origin: 'https://app.example.com', token: 't',
  })
  check('E7: without the flag the builder marks nothing', !built.subject.includes(KOREA_AD_SUBJECT_MARK))

  // ── F) the recorded signup country ───────────────────────────────────────
  console.log('\nF) the signup country, written once at sign-up')
  check('F1: the header is the one the CDN sets, byte for byte', SIGNUP_COUNTRY_HEADER === COUNTRY_HEADER)
  check('F2: a code is upper-cased and trimmed', normalizeSignupCountry(' kr ') === 'KR')
  for (const bad of ['KOR', 'K', '82', 'K R', '<b', '', null, undefined, 7, {}]) {
    check(`F3: ${JSON.stringify(bad)} is not a country`, normalizeSignupCountry(bad) === null)
  }
  check('F4: the CDN\'s own "cannot place" values are not countries',
    normalizeSignupCountry('XX') === null && normalizeSignupCountry('T1') === null)

  const nowD = new Date('2026-11-13T02:00:00.000Z')
  const ago = (ms: number) => new Date(nowD.getTime() - ms).toISOString()
  check('F5: a sign-up a minute old is fresh', isFreshForCountry(ago(60_000), nowD))
  check('F6: an account a day old is not', !isFreshForCountry(ago(86_400_000), nowD))
  check('F7: an unreadable creation date is not fresh', !isFreshForCountry('not a date', nowD) && !isFreshForCountry(null, nowD))

  const recorder = (rows: Record<string, unknown>[], hooks = {}) => new FakeAdmin({ [SIGNUP_ATTRIBUTION_TABLE]: rows }, hooks)
  const write = (admin: FakeAdmin, country: unknown, createdAt: string = ago(60_000)) =>
    recordSignupCountry({ admin: admin as unknown as ServiceRoleClient, userId: OWNER, country, accountCreatedAt: createdAt, now: nowD })

  const f1 = recorder([])
  check('F8: with no row at all, one is inserted carrying only the country',
    (await write(f1, 'KR')) === 'written'
    && f1.tables[SIGNUP_ATTRIBUTION_TABLE].length === 1
    && f1.tables[SIGNUP_ATTRIBUTION_TABLE][0].signup_country === 'KR'
    && f1.tables[SIGNUP_ATTRIBUTION_TABLE][0].user_id === OWNER)

  const f2 = recorder([{ user_id: OWNER, source: 'community', signup_country: null }])
  check('F9: an attribution row written first has its country filled in, keeping the attribution',
    (await write(f2, 'kr')) === 'written'
    && f2.tables[SIGNUP_ATTRIBUTION_TABLE][0].signup_country === 'KR'
    && f2.tables[SIGNUP_ATTRIBUTION_TABLE][0].source === 'community')

  const f3 = recorder([{ user_id: OWNER, signup_country: 'IL' }])
  check('F10: a country already recorded is provenance and is never rewritten',
    (await write(f3, 'KR')) === 'already_recorded' && f3.tables[SIGNUP_ATTRIBUTION_TABLE][0].signup_country === 'IL')

  const f4 = recorder([])
  check('F11: an account that is not fresh is not written (nobody labels an old account)',
    (await write(f4, 'KR', ago(86_400_000))) === 'not_fresh' && f4.tables[SIGNUP_ATTRIBUTION_TABLE].length === 0)

  const f5 = recorder([])
  check('F12: no usable header writes nothing at all',
    (await write(f5, null)) === 'no_country' && (await write(f5, 'XX')) === 'no_country'
    && f5.tables[SIGNUP_ATTRIBUTION_TABLE].length === 0)

  const f6 = recorder([], { [SIGNUP_ATTRIBUTION_TABLE]: { select: () => ({ code: '08006' }) } })
  check('F13: a read that fails writes nothing and says so', (await write(f6, 'KR')) === 'failed')

  const f7 = recorder([])
  check('F14: the country reads back, and an unreadable read is null, never a country',
    (await write(f7, 'KR')) === 'written'
    && (await readSignupCountry(f7 as unknown as ServiceRoleClient, OWNER)) === 'KR'
    && (await readSignupCountry(recorder([], { [SIGNUP_ATTRIBUTION_TABLE]: { select: () => ({ code: '42P01' }) } }) as unknown as ServiceRoleClient, OWNER)) === null
    && (await readSignupCountry(recorder([]) as unknown as ServiceRoleClient, OWNER)) === null)

  // The sender reads it: a Korean sign-up with an English account and a US
  // project is now blocked, which is exactly what could not be caught before.
  const e5 = new FakeAdmin({ projects: [project({ country: 'US', language: 'en' })], [SIGNUP_ATTRIBUTION_TABLE]: [{ user_id: OWNER, signup_country: 'KR' }] })
  let englishKoreanSends = 0
  const r5 = await runOnboardingEmails(deps(e5, {
    owner: async () => ({ email: 'owner@example.com', locale: 'en' as const, firstName: null, shopifyAppStoreOrigin: false as const, staff: false, signupCountry: 'KR' }),
    send: async () => { englishKoreanSends++; return { ok: true } },
  }))
  check('F15: an English account that signed up in Korea is blocked',
    r5.status === 'done' && r5.sent === 0 && englishKoreanSends === 0)

  // ── MUTATION CONTROLS ────────────────────────────────────────────────────
  console.log('\nMutation controls')
  await withMutant<{ koreaEmailDecision: typeof koreaEmailDecision }, void>(
    'lib/compliance/korea-promotional-email.ts', [["  if (!isPromotional(input.kind)) return { send: true, markAsAd: false }", "  if (true) return { send: true, markAsAd: false }"]],
    async (mod) => check('M1: a gate that lets everything through fails C3',
      mod.koreaEmailDecision({ kind: 'setup_connect', facts: kr, optIn: false }).send === true),
  )
  await withMutant<{ koreaEmailDecision: typeof koreaEmailDecision }, void>(
    'lib/compliance/korea-promotional-email.ts', [["  if (input.optIn === null) return { send: false, reason: 'opt_in_unreadable' }", '']],
    async (mod) => {
      const d = mod.koreaEmailDecision({ kind: 'setup_connect', facts: kr, optIn: null })
      check('M2: treating an unreadable consent as a refusal-only case fails C4', d.send === false && d.reason === 'no_korean_opt_in')
    },
  )
  await withMutant<{ placedInKorea: typeof placedInKorea }, void>(
    'lib/compliance/korea-promotional-email.ts', [['if (country === KOREA_COUNTRY_CODE) return true', '']],
    async (mod) => check('M3: dropping the country signal fails B1', mod.placedInKorea({ projectCountry: 'KR' }) === false),
  )
  await withMutant<{ readKoreanMarketingOptIn: typeof readKoreanMarketingOptIn }, void>(
    'lib/compliance/korea-marketing-opt-in.ts', [['    if (error) return null', '']],
    async (mod) => check('M4: an opt-in reader that swallows its error fails D9',
      (await mod.readKoreanMarketingOptIn(
        new FakeAdmin({ [REPORT_REQUESTS_TABLE]: [] }, { [REPORT_REQUESTS_TABLE]: { select: () => ({ code: '42P01' }) } }) as unknown as ServiceRoleClient,
        'owner@example.com')) === false),
  )
  await withMutant<{ readKoreanMarketingOptIn: typeof readKoreanMarketingOptIn }, void>(
    'lib/compliance/korea-marketing-opt-in.ts', [['r.consent_text.includes(KOREA_MARKETING_MARKER)', 'true']],
    async (mod) => check('M5: reading a refusal row as a consent fails D4',
      (await mod.readKoreanMarketingOptIn(
        new FakeAdmin({ [REPORT_REQUESTS_TABLE]: [row('owner@example.com', false)] }) as unknown as ServiceRoleClient,
        'owner@example.com')) === true),
  )
  await withMutant<{ koreaAdSubject: typeof koreaAdSubject }, void>(
    'lib/compliance/korea-promotional-email.ts', [['return trimmed.startsWith(KOREA_AD_SUBJECT_MARK) ? trimmed : `${KOREA_AD_SUBJECT_MARK} ${trimmed}`', 'return trimmed']],
    async (mod) => check('M6: a builder that drops the mark fails C7', !mod.koreaAdSubject('x').includes(KOREA_AD_SUBJECT_MARK)),
  )
  await withMutant<{ placedInKorea: typeof placedInKorea }, void>(
    'lib/compliance/korea-promotional-email.ts', [['if (signup === KOREA_COUNTRY_CODE) return true', '']],
    async (mod) => check('M3b: dropping the signup-country signal fails B5c',
      mod.placedInKorea({ signupCountry: 'KR', accountLocale: 'en', projectCountry: 'US', projectLanguage: 'en' }) === false),
  )
  // "Written once" is guarded TWICE on purpose — an early return, and the
  // update's own `is(signup_country, null)` filter, which is what also holds
  // when two sign-up writes race. Either alone prevents the overwrite, so a
  // mutation control that drops one proves nothing; this drops both.
  await withMutant<{ recordSignupCountry: typeof recordSignupCountry }, void>(
    'lib/compliance/signup-country.ts', [
      ["if (row && typeof row.signup_country === 'string' && row.signup_country.trim() !== '') return 'already_recorded'", ''],
      [".update({ signup_country: country }).eq('user_id', input.userId).is('signup_country', null)", ".update({ signup_country: country }).eq('user_id', input.userId)"],
    ],
    async (mod) => {
      const m = recorder([{ user_id: OWNER, signup_country: 'IL' }])
      await mod.recordSignupCountry({ admin: m as unknown as ServiceRoleClient, userId: OWNER, country: 'KR', accountCreatedAt: ago(60_000), now: nowD })
      check('M3c: with BOTH write-once guards gone, a recorded country is overwritten, which fails F10',
        m.tables[SIGNUP_ATTRIBUTION_TABLE][0].signup_country === 'KR')
    },
  )
  await withMutant<{ recordSignupCountry: typeof recordSignupCountry }, void>(
    'lib/compliance/signup-country.ts', [["if (row && typeof row.signup_country === 'string' && row.signup_country.trim() !== '') return 'already_recorded'", '']],
    async (mod) => {
      const m = recorder([{ user_id: OWNER, signup_country: 'IL' }])
      await mod.recordSignupCountry({ admin: m as unknown as ServiceRoleClient, userId: OWNER, country: 'KR', accountCreatedAt: ago(60_000), now: nowD })
      check('M3c2: with the early return alone gone, the update filter still refuses the overwrite',
        m.tables[SIGNUP_ATTRIBUTION_TABLE][0].signup_country === 'IL')
    },
  )
  await withMutant<{ recordSignupCountry: typeof recordSignupCountry }, void>(
    'lib/compliance/signup-country.ts', [["if (!isFreshForCountry(input.accountCreatedAt, now)) return 'not_fresh'", '']],
    async (mod) => check('M3d: a recorder without the freshness window fails F11',
      (await mod.recordSignupCountry({ admin: recorder([]) as unknown as ServiceRoleClient, userId: OWNER, country: 'KR', accountCreatedAt: ago(86_400_000), now: nowD })) === 'written'),
  )
  // The callback is where the country is written: every sign-in door reaches it.
  const callback = strip(code('app/api/auth/callback/route.ts'))
  check('M3e: the auth callback records the signup country from the CDN header',
    /recordSignupCountry\(\{/.test(callback) && callback.includes('SIGNUP_COUNTRY_HEADER'))
  check('M3f: and the sender reads it', strip(code('lib/onboarding-emails/live.ts')).includes('readSignupCountry')
    && strip(code('lib/onboarding-emails/run.ts')).includes('signupCountry: who.signupCountry'))

  // The gate removed from the run: the source guard A7 is what catches it.
  const gutted = strip(code('lib/onboarding-emails/run.ts')).replace(/if \(!korea\.send\) \{ koreaBlocked\+\+; continue \}/, '')
  check('M7: the run without its refusal branch is caught', !/if \(!korea\.send\)/.test(gutted))
  // The mark dropped on the way to the builder.
  const unmarked = strip(code('lib/onboarding-emails/run.ts')).replace(/markAsKoreanAd: korea\.markAsAd/, '')
  check('M8: the run that stops passing the mark is caught', !/markAsKoreanAd: korea\.markAsAd/.test(unmarked))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

void main()

export {}
