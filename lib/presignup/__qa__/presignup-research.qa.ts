/**
 * The research before sign-up (lib/presignup): the whole contract, end to end.
 *
 * The API handlers run with the real gate, the real anonymous stage A (the
 * seed scan's own executors over a fake network, a counting model and a
 * counting search), the free check's real ledger write and claim token, and a
 * FakeAdmin. The claim is then redeemed by the seed route's real handler and
 * replayed by the real stage-A runner, with every way of spending money
 * counted, to prove nothing is fetched, asked or searched a second time.
 *
 * Every guard below has a mutation control: the same check run against a
 * deliberately broken variant, which it must catch.
 *
 * Run: npx tsx lib/presignup/__qa__/presignup-research.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { consumeClaimToken, hashClaimToken } from '@/lib/free-check'
import { issueClaimToken } from '@/lib/free-check/claim'
import { recordRun } from '@/lib/free-check/store'
import { googleRedirectTo, googleSignInEnabled, googleSignInVisible } from '@/lib/auth/google-signin'
import { presignupResearchOn } from '@/lib/onboarding/availability'
import { handleSeedPost, type SeedRouteDeps } from '@/lib/seed-scan/http'
import { runStageA } from '@/lib/seed-scan/runner'
import { MAX_ACTIVE_COMPETITORS } from '@/lib/seed-scan/settings'
import type { SupabaseClient } from '@supabase/supabase-js'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { SeedScope } from '@/lib/seed-scan/types'
import {
  captureConsole,
  clock,
  FakeNetwork,
  fakeModel,
  fakeSearch,
  HE_WP,
  HE_WP_INSIGHT,
  HE_WP_RESULTS,
  heWordPressSite,
  installFakeDns,
  makeChecker,
  NOW,
  PROJECT,
  projectRow,
  SECRET,
  USER,
  world,
} from '@/lib/seed-scan/__qa__/_fixtures'
import { reportConsentText } from '../copy'
import { handleReportRequest, handleResearchPost, REPORT_REQUESTS_TABLE, type ResearchDeps } from '../http'
import { RESEARCH_RUNS_TABLE } from '../gate'
import { runAnonymousStageA } from '../run'
import { PREVIEW_COMPETITORS, PREVIEW_KEYWORDS } from '../view'

const { check, finish } = makeChecker()
type Row = Record<string, unknown>
type AnyFn = (...a: unknown[]) => unknown

installFakeDns()

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
/** Source with comments removed, so a guard matches code and never a comment. */
const code = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\s*\}/g, '{}').replace(/(^|[^:'"])\/\/.*$/gm, '$1')

let allLogs = ''

// ── The world ───────────────────────────────────────────────────────────────

type Opts = { hooks?: Record<string, unknown>; env?: Record<string, string | undefined>; enabled?: boolean; extra?: Record<string, Row[]> }

function setup(o: Opts = {}) {
  const c = clock()
  const w = world(projectRow(), { free_site_checks: [], free_site_check_claims: [], [RESEARCH_RUNS_TABLE]: [], [REPORT_REQUESTS_TABLE]: [], ...o.extra }, o.hooks ?? {}, c.now)
  // Postgres fills free_site_check_claims.created_at (DEFAULT now()); FakeAdmin applies no defaults.
  const from = w.fake.from.bind(w.fake)
  ;(w.fake as unknown as { from: (n: string) => unknown }).from = (name: string) => {
    const q = from(name) as unknown as Record<string, AnyFn>
    if (name === 'free_site_check_claims') {
      const insert = q.insert.bind(q)
      q.insert = (payload: unknown) => insert({ created_at: c.now().toISOString(), consumed_at: null, ...(payload as Row) })
    }
    return q
  }
  const net = new FakeNetwork(heWordPressSite())
  const model = fakeModel({ ok: true, insight: HE_WP_INSIGHT })
  const search = fakeSearch(HE_WP_RESULTS)
  const runner = { calls: 0 }
  const deps: ResearchDeps = {
    enabled: () => o.enabled ?? true,
    admin: () => w.admin,
    clientHash: (req) => req.headers.get('x-client') ?? 'client-a',
    run: ({ url, locale, onStep }) => {
      runner.calls++
      return runAnonymousStageA({ url, locale, onStep, deps: { fetchImpl: net.fetch, insight: model.fn, search: search.fn, now: c.now } })
    },
    record: (admin, row) => recordRun(row, admin),
    issueClaim: (admin, checkId) => issueClaimToken(checkId, admin),
    now: c.now,
    env: { ...o.env },
  }
  return { ...w, c, net, model, search, runner, deps }
}

const researchReq = (body: unknown, client = 'client-a') =>
  new Request('https://app.example/api/free-check/research', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': client }, body: JSON.stringify(body) })
const reportReq = (body: unknown, client = 'client-a') =>
  new Request('https://app.example/api/free-check/report', { method: 'POST', headers: { 'content-type': 'application/json', 'x-client': client }, body: JSON.stringify(body) })

type Answer = { status: number; text: string; json: Row; lines: Row[]; headers: Headers }

async function call(res: Promise<Response>): Promise<Answer> {
  const { value, output } = await captureConsole(async () => {
    const r = await res
    return { r, text: await r.text() }
  })
  allLogs += `${output}\n`
  const { r, text } = value
  let json: Row = {}
  try {
    json = JSON.parse(text)
  } catch {
    json = {}
  }
  const lines = (r.headers.get('content-type') ?? '').includes('ndjson') ? text.split('\n').filter(Boolean).map((l) => JSON.parse(l) as Row) : []
  return { status: r.status, text, json, lines, headers: r.headers }
}

const research = (s: ReturnType<typeof setup>, client = 'client-a', url = HE_WP.target) => call(handleResearchPost(researchReq({ url, locale: 'he' }, client), s.deps))
const resultOf = (a: Answer) => a.lines.find((l) => l.type === 'result') as { view: Row; claimToken: string | null } | undefined

/** Anything in `text` that the gate locks: competitors past the preview, keywords past it, the page's own words, the steps' saved detail. */
function leaks(text: string, locked: { competitors: string[]; keywords: string[] }): string[] {
  const found: string[] = []
  for (const d of locked.competitors) if (text.includes(d)) found.push(d)
  for (const k of locked.keywords) if (text.includes(k)) found.push(k)
  for (const key of ['"internalLinkUrls":', '"insight":', '"results":', '"details":', '"marker":', '"research":', '"robots":', '"robotsTxt":', '"headings":'])
    if (text.includes(key)) found.push(key)
  if (text.includes('שעובד בתל אביב ובכל אזור המרכז')) found.push('page text')
  return found
}

async function main() {
  // ── 1) Flag off ───────────────────────────────────────────────────────────
  console.log('\n1) Off (as in Production)')
  {
    const s = setup({ enabled: false })
    const r = await research(s)
    check('research off → 404 { ok: false, code: not_found }', r.status === 404 && r.text === '{"ok":false,"code":"not_found"}', r.text)
    check('…the runner never ran and no table was touched', s.runner.calls === 0 && s.tables[RESEARCH_RUNS_TABLE].length === 0 && s.tables.free_site_checks.length === 0)
    const rep = await call(handleReportRequest(reportReq({ token: 'a'.repeat(64), email: 'a@b.co', consent: true }), s.deps))
    check('report off → 404 not_found, nothing stored', rep.status === 404 && rep.json.code === 'not_found' && s.tables[REPORT_REQUESTS_TABLE].length === 0)
    check('presignupResearchOn: only both flags exactly "true"',
      presignupResearchOn({ ENABLE_SEED_SCAN: 'true', ENABLE_PRESIGNUP_RESEARCH: 'true' })
      && !presignupResearchOn({ ENABLE_PRESIGNUP_RESEARCH: 'true' })
      && !presignupResearchOn({ ENABLE_SEED_SCAN: 'true' })
      && !presignupResearchOn({ ENABLE_SEED_SCAN: 'true', ENABLE_PRESIGNUP_RESEARCH: '1' })
      && !presignupResearchOn({}))

    // The public pages: the research only behind the flag, the short free check otherwise.
    const pageGuard = (src: string, locale: string) => {
      const c = code(src)
      return /const research = presignupResearchOn\(process\.env\)/.test(c)
        && new RegExp(`\\{research \\? <FreeCheckResearch locale="${locale}" initialUrl=\\{initialUrl\\} /> : <FreeCheckExperience locale="${locale}" initialUrl=\\{initialUrl\\} />\\}`).test(c)
    }
    const he = read('app/(public)/free-check/page.tsx')
    const en = read('app/(public)/en/free-check/page.tsx')
    check('/free-check and /en/free-check render the research only when the flag is on, the free check otherwise', pageGuard(he, 'he') && pageGuard(en, 'en'))
    check('mutation control: a page that always renders the research fails the guard',
      !pageGuard(he.replace('const research = presignupResearchOn(process.env)', 'const research = true'), 'he'))
    const routes = ['app/api/free-check/research/route.ts', 'app/api/free-check/report/route.ts'].map((p) => code(read(p)))
    check('both routes read the flag through presignupResearchOn(process.env)', routes.every((c) => c.includes('enabled: () => presignupResearchOn(process.env)')))
  }

  // ── 2) A research, gated ─────────────────────────────────────────────────
  console.log('\n2) A research: streamed, gated, recorded')
  const s = setup()
  const first = await research(s)
  const firstResult = resultOf(first)
  const ledger = s.tables.free_site_checks[0]
  const stored = ((ledger?.seed as Row)?.research as Row)?.summary as { competitors: { domain: string }[]; seedKeywords: string[] } | undefined
  const locked = {
    competitors: (stored?.competitors ?? []).slice(PREVIEW_COMPETITORS).map((c) => c.domain),
    keywords: (stored?.seedKeywords ?? []).slice(PREVIEW_KEYWORDS),
  }
  {
    check('200 newline-delimited JSON, not cached', first.status === 200 && (first.headers.get('content-type') ?? '').includes('application/x-ndjson') && first.headers.get('cache-control') === 'no-store')
    const stepLines = first.lines.filter((l) => l.type === 'step')
    check('a line as each of a1-a4 starts and ends, then exactly one result',
      stepLines.length === 8 && first.lines.filter((l) => l.type === 'result').length === 1 && first.lines[first.lines.length - 1].type === 'result', `${stepLines.length} step lines`)
    check('spend: one model call and three searches, counted on the run row',
      s.model.calls.length === 1 && s.search.calls.length === 3 && s.tables[RESEARCH_RUNS_TABLE][0]?.model_calls === 1 && s.tables[RESEARCH_RUNS_TABLE][0]?.searches === 3,
      JSON.stringify(s.tables[RESEARCH_RUNS_TABLE][0]))
    check('the run row is done and names its ledger row', s.tables[RESEARCH_RUNS_TABLE][0]?.status === 'done' && s.tables[RESEARCH_RUNS_TABLE][0]?.check_id === ledger?.id)
    check('the fixture has something to lock (else the gating checks would be vacuous)', locked.competitors.length >= 1 && locked.keywords.length >= 1, JSON.stringify(locked))

    const view = (firstResult?.view ?? {}) as { summary: Row; locked: Row; steps: Row[] }
    check('the result line is exactly { type, view, claimToken } and the view { summary, steps, locked }',
      Object.keys(first.lines.at(-1) ?? {}).sort().join(',') === 'claimToken,type,view' && Object.keys(view).sort().join(',') === 'locked,steps,summary')
    check(`at most ${PREVIEW_COMPETITORS} competitors and ${PREVIEW_KEYWORDS} keywords in the payload, the rest only counted`,
      (view.summary.competitors as unknown[]).length === PREVIEW_COMPETITORS && (view.summary.seedKeywords as unknown[]).length === PREVIEW_KEYWORDS
      && view.locked.competitors === locked.competitors.length && view.locked.keywords === locked.keywords.length, JSON.stringify(view.locked))
    check('GATING, READ FROM THE JSON: no locked competitor, keyword, page text or step detail anywhere in the response', leaks(first.text, locked).length === 0, leaks(first.text, locked).join(', '))
    check('mutation control: the ungated snapshot (what the ledger keeps) is caught by the same check', leaks(JSON.stringify(stored), locked).length > 0)
    check('the shown part is really there: business, audiences, findings, AI readiness, articles',
      !!(view.summary.business as Row)?.companyName && (view.summary.audiences as unknown[]).length > 0 && (view.summary.findings as unknown[]).length > 0
      && typeof (view.summary.geo as Row)?.total === 'number' && (view.summary.topics as unknown[]).length > 0)
    check('the public teaser in the ledger (what the free check\'s cache replays) is gated the same way', leaks(JSON.stringify(ledger?.result), locked).length === 0, leaks(JSON.stringify(ledger?.result), locked).join(', '))
    check('…while its seed keeps the whole research for the claim', ((ledger?.seed as Row)?.research as Row)?.version === 1 && locked.competitors.every((d) => JSON.stringify(ledger?.seed).includes(d)))
    check('no provider or page words in any log line', !/אינסטלטור|plumber-tlv|SECRET/.test(allLogs), allLogs.slice(0, 300))
  }

  // ── 3) The claim token ───────────────────────────────────────────────────
  console.log('\n3) The claim token: hash only, single use, 24h')
  const token = firstResult?.claimToken ?? ''
  {
    check('a 64-hex token came with the result', /^[a-f0-9]{64}$/.test(token))
    const claims = s.tables.free_site_check_claims
    check('stored as its SHA-256 only, against this research\'s ledger row', claims.length === 1 && claims[0].token_hash === hashClaimToken(token) && claims[0].check_id === ledger?.id)
    const plaintextIn = (tables: Record<string, Row[]>) => JSON.stringify(tables).includes(token)
    check('the plaintext token is in no table', !plaintextIn(s.tables))
    check('mutation control: a store that kept the token itself is caught', plaintextIn({ ...s.tables, free_site_check_claims: [{ ...claims[0], token }] }))
    const signup = `/signup?claim=${token}`
    check('the sign-up link is the free check\'s own claim handoff', signup.startsWith('/signup?claim='))
  }

  // ── 4) Replay ────────────────────────────────────────────────────────────
  console.log('\n4) The same site again: replayed, not re-run')
  {
    const again = await research(s, 'client-b')
    const r = resultOf(again)
    check('another visitor, same site, same day → one result line, no steps', again.status === 200 && again.lines.length === 1 && !!r)
    check('…nothing ran and nothing was spent', s.runner.calls === 1 && s.model.calls.length === 1 && s.search.calls.length === 3)
    check('…gated exactly as the first', leaks(again.text, locked).length === 0 && JSON.stringify(r?.view) === JSON.stringify(firstResult?.view), `${JSON.stringify(r?.view).slice(0, 400)}\n${JSON.stringify(firstResult?.view).slice(0, 400)}`)
    check('…with a fresh token of its own (the row is shared, the capability is not)', !!r?.claimToken && r.claimToken !== token && s.tables.free_site_check_claims.length === 2)
    check('…and a replayed row that does not count as spend', s.tables[RESEARCH_RUNS_TABLE].some((x) => x.status === 'replayed' && x.client_hash === 'client-b'))
  }

  // ── 5) Caps, failing closed ──────────────────────────────────────────────
  console.log('\n5) Caps: per visitor, in flight, per day; fail closed')
  const hourAgo = (m: number) => new Date(NOW.getTime() - m * 60_000).toISOString()
  const runRow = (over: Row) => ({ id: `r-${Math.random()}`, client_hash: 'client-a', domain: 'other.co.il', locale: 'he', status: 'done', check_id: null, created_at: hourAgo(10), ...over })
  {
    const s1 = setup({ extra: { [RESEARCH_RUNS_TABLE]: [runRow({}), runRow({}), runRow({})] } })
    const r = await research(s1)
    check('three runs this hour (the default cap) → 429 rate_limited with retry-after, runner never called',
      r.status === 429 && r.json.code === 'rate_limited' && !!r.headers.get('retry-after') && s1.runner.calls === 0, r.text)
    const s2 = setup({ extra: { [RESEARCH_RUNS_TABLE]: [runRow({ status: 'refused' }), runRow({ status: 'refused' }), runRow({ status: 'refused' }), runRow({ created_at: hourAgo(61) }), runRow({ created_at: hourAgo(70) }), runRow({ created_at: hourAgo(90) })] } })
    const ok = await research(s2)
    check('…refused rows and runs older than an hour do not count (control: the same visitor is admitted)', ok.status === 200 && s2.runner.calls === 1, ok.text.slice(0, 120))
    const s3 = setup({ env: { PRESIGNUP_RESEARCH_CLIENT_HOURLY_CAP: '1' }, extra: { [RESEARCH_RUNS_TABLE]: [runRow({})] } })
    check('the cap is configurable: PRESIGNUP_RESEARCH_CLIENT_HOURLY_CAP=1 refuses the second', (await research(s3)).status === 429 && s3.runner.calls === 0)

    const s4 = setup({ extra: { [RESEARCH_RUNS_TABLE]: [runRow({ status: 'running', created_at: hourAgo(1) })] } })
    const inflight = await research(s4)
    const mine = s4.tables[RESEARCH_RUNS_TABLE].find((x) => x.domain === HE_WP.key)
    check('one of theirs still in flight → 429, and the reservation is marked refused', inflight.status === 429 && s4.runner.calls === 0 && mine?.status === 'refused', inflight.text)

    const today = runRow({ client_hash: 'someone', created_at: new Date(Date.UTC(2026, 8, 27, 0, 30)).toISOString() })
    const yesterday = runRow({ client_hash: 'someone', created_at: new Date(Date.UTC(2026, 8, 26, 23, 30)).toISOString() })
    const s5 = setup({ env: { PRESIGNUP_RESEARCH_DAILY_CAP: '1' }, extra: { [RESEARCH_RUNS_TABLE]: [today, yesterday] } })
    const daily = await research(s5)
    check('the day\'s cap (PRESIGNUP_RESEARCH_DAILY_CAP=1, one run today) → 429 daily_cap, reservation refused, nothing ran',
      daily.status === 429 && daily.json.code === 'daily_cap' && s5.runner.calls === 0 && s5.tables[RESEARCH_RUNS_TABLE].some((x) => x.domain === HE_WP.key && x.status === 'refused'), daily.text)
    const s6 = setup({ env: { PRESIGNUP_RESEARCH_DAILY_CAP: '1' }, extra: { [RESEARCH_RUNS_TABLE]: [yesterday] } })
    check('…yesterday\'s run does not count (control)', (await research(s6)).status === 200 && s6.runner.calls === 1)

    const s7 = setup({ env: { PRESIGNUP_RESEARCH_DAILY_CAP: '1' } })
    const racing = await Promise.all([research(s7, 'c1', 'site-one.co.il'), research(s7, 'c2', 'site-two.co.il'), research(s7, 'c3', 'site-three.co.il')])
    check('three visitors racing for one daily slot: at most one is admitted (reserve, then count)', racing.filter((r) => r.status === 200).length <= 1 && s7.runner.calls <= 1, racing.map((r) => r.status).join(','))

    // Fail closed: a count that cannot be read refuses; nothing is spent.
    const broken = { select: () => ({ code: 'XX000', message: SECRET }) }
    const s8 = setup({ hooks: { [RESEARCH_RUNS_TABLE]: broken } })
    const r8 = await research(s8)
    check('a count that fails → 503 unavailable, runner never called, no provider text', r8.status === 503 && r8.json.code === 'unavailable' && s8.runner.calls === 0 && !r8.text.includes(SECRET))
    const s9 = setup({ hooks: { [RESEARCH_RUNS_TABLE]: { insert: () => ({ code: 'XX000' }) } } })
    const r9 = await research(s9)
    check('a reservation that cannot be written → 503, runner never called', r9.status === 503 && s9.runner.calls === 0)
    const s10 = setup({ env: { PRESIGNUP_RESEARCH_CLIENT_HOURLY_CAP: 'lots', PRESIGNUP_RESEARCH_DAILY_CAP: '-5' }, extra: { [RESEARCH_RUNS_TABLE]: [runRow({}), runRow({}), runRow({})] } })
    check('a malformed cap falls back to the default, never to "no cap"', (await research(s10)).status === 429 && s10.runner.calls === 0)
    const s11 = setup()
    s11.deps.admin = () => {
      throw new Error(`${SECRET} missing service key`)
    }
    const r11 = await research(s11)
    check('no database client → 503 unavailable, no provider text', r11.status === 503 && r11.json.code === 'unavailable' && !r11.text.includes(SECRET))

    // Mutation controls: break the gate's counting on purpose and the guards above must fail.
    const lying = setup({ extra: { [RESEARCH_RUNS_TABLE]: [runRow({}), runRow({}), runRow({})] } })
    const lieFrom = lying.fake.from.bind(lying.fake)
    ;(lying.fake as unknown as { from: (n: string) => unknown }).from = (name: string) => {
      const q = lieFrom(name) as unknown as Record<string, AnyFn>
      if (name !== RESEARCH_RUNS_TABLE) return q
      const then = q.then.bind(q)
      q.then = (resolve: unknown, reject: unknown) => then((v: unknown) => (resolve as AnyFn)({ ...(v as Row), count: 0 }), reject)
      return q
    }
    check('mutation control: a gate whose counts read 0 lets the capped visitor through (so the cap check is not vacuous)', (await research(lying)).status === 200 && lying.runner.calls === 1)
    const swallow = setup({ hooks: { [RESEARCH_RUNS_TABLE]: broken } })
    const swFrom = swallow.fake.from.bind(swallow.fake)
    ;(swallow.fake as unknown as { from: (n: string) => unknown }).from = (name: string) => {
      const q = swFrom(name) as unknown as Record<string, AnyFn>
      if (name !== RESEARCH_RUNS_TABLE) return q
      const then = q.then.bind(q)
      q.then = (resolve: unknown, reject: unknown) => then((v: unknown) => (resolve as AnyFn)({ ...(v as Row), error: null, data: (v as Row).data ?? [] }), reject)
      return q
    }
    check('mutation control: a gate that ignores read errors would run (so "fails closed" is not vacuous)', (await research(swallow)).status === 200 && swallow.runner.calls === 1)
  }

  // ── 6) Tables missing (Production is not migrated) ───────────────────────
  console.log('\n6) The new tables missing')
  {
    const missing = () => ({ code: '42P01', message: `relation "public.free_check_research_runs" does not exist ${SECRET}` })
    const s1 = setup({ hooks: { [RESEARCH_RUNS_TABLE]: { select: missing, insert: missing, update: missing } } })
    const r = await research(s1)
    check('research → 503 { ok: false, code: unavailable } (the screen falls back to the short check), nothing ran',
      r.status === 503 && r.text === '{"ok":false,"code":"unavailable"}' && s1.runner.calls === 0, r.text)
    const s2 = setup({ hooks: { [REPORT_REQUESTS_TABLE]: { select: missing, insert: missing } } })
    const rep = await call(handleReportRequest(reportReq({ token, email: 'a@b.co', consent: true }), s2.deps))
    check('report → 503 unavailable, no provider text', rep.status === 503 && rep.json.code === 'unavailable' && !rep.text.includes(SECRET))
    const screen = code(read('components/free-check/FreeCheckResearch.tsx'))
    check('the screen turns unavailable / not_found into the short free check for the same address',
      /if \(code === 'unavailable' \|\| code === 'not_found'\) \{\s*setPhase\('fallback'\)/.test(screen) && /<FreeCheckExperience locale=\{locale\} initialUrl=\{url\} \/>/.test(screen))
  }

  // ── 7) "Email me the report": only with consent ──────────────────────────
  console.log('\n7) Email me the report: stored only with explicit consent')
  {
    const rows = () => s.tables[REPORT_REQUESTS_TABLE]
    for (const [label, consent] of [['missing', undefined], ['false', false], ['"true" (a string)', 'true'], ['1', 1], ['"on"', 'on']] as const) {
      const r = await call(handleReportRequest(reportReq({ token, email: 'owner@plumber.example', consent }), s.deps))
      check(`consent ${label} → 400 consent_required, nothing stored`, r.status === 400 && r.json.code === 'consent_required' && rows().length === 0, r.text)
    }
    const ok = await call(handleReportRequest(reportReq({ token, email: '  Owner@Plumber.Example ', consent: true, locale: 'he', consentText: 'I agree to anything' }), s.deps))
    const row = rows()[0] ?? {}
    check('consent true → 200 saved, one row', ok.status === 200 && ok.json.code === 'saved' && rows().length === 1, ok.text)
    check('…the address normalized, consent true with its time, against this research', row.email === 'owner@plumber.example' && row.consent === true && row.consented_at === NOW.toISOString() && row.check_id === ledger?.id)
    check('…the consent words are the server\'s own, in the visitor\'s language, never the request\'s',
      row.consent_text === reportConsentText('he') && !JSON.stringify(row).includes('I agree to anything') && /\[report-email-v1\]$/.test(String(row.consent_text)))
    check('…exactly the documented columns, nothing sent', Object.keys(row).sort().join(',') === 'check_id,client_hash,consent,consent_text,consented_at,created_at,email,id,locale' && row.sent_at === undefined)
    check('…and the token is looked up, never spent', s.tables.free_site_check_claims.find((c) => c.token_hash === hashClaimToken(token))?.consumed_at === null)
    check('no address in any log line', !allLogs.includes('owner@plumber.example'))
    const bad = await call(handleReportRequest(reportReq({ token, email: 'not an address', consent: true }), s.deps))
    check('a malformed address → 400 invalid_email', bad.status === 400 && bad.json.code === 'invalid_email')
    const unknown = await call(handleReportRequest(reportReq({ token: 'b'.repeat(64), email: 'x@y.co', consent: true }), s.deps))
    check('a token that names no research → 400 invalid_claim', unknown.status === 400 && unknown.json.code === 'invalid_claim')
    const s2 = setup({ extra: { [REPORT_REQUESTS_TABLE]: Array.from({ length: 5 }, (_, i) => ({ id: `q${i}`, client_hash: 'client-a', created_at: hourAgo(5) })) } })
    const limited = await call(handleReportRequest(reportReq({ token, email: 'x@y.co', consent: true }), s2.deps))
    check('five requests this hour → 429 rate_limited', limited.status === 429 && limited.json.code === 'rate_limited')

    // ── A Spanish visitor, since /es went live on 3 October 2026 ───────────
    // Before the fix the page's 'es' fell through to 'he': the research was
    // written in HEBREW and the consent was stored as the Hebrew sentence
    // under report-email-v1 — a record of words the visitor never saw.
    const es = setup()
    const esToken = resultOf(await call(handleResearchPost(researchReq({ url: HE_WP.target, locale: 'es' }, 'client-es'), es.deps)))?.claimToken ?? ''
    check('a Spanish research is recorded as English, never Hebrew',
      es.tables[RESEARCH_RUNS_TABLE]?.[0]?.locale === 'en', String(es.tables[RESEARCH_RUNS_TABLE]?.[0]?.locale))
    if (esToken) {
      await call(handleReportRequest(reportReq({ token: esToken, email: 'dueno@sitio.example', consent: true, locale: 'es' }), es.deps))
      const esRow = (es.tables[REPORT_REQUESTS_TABLE] ?? [])[0] ?? {}
      check('…and the consent stored is the SPANISH sentence with its own version id',
        esRow.consent_text === reportConsentText('es') && /\[report-email-es-v1\]$/.test(String(esRow.consent_text)),
        String(esRow.consent_text).slice(0, 60))
      check('…never the Hebrew sentence', esRow.consent_text !== reportConsentText('he'))
      // The column still only admits he|en (the CHECK in
      // 20260928000200_free_check_research.sql), so it carries the bilingual
      // language of the research and of any email, not the page's language.
      check('…stored under a language the ledger\'s CHECK admits', esRow.locale === 'en', String(esRow.locale))
    } else {
      check('a Spanish research hands back a claim token', false, 'no token')
    }

    const httpSrc = code(read('lib/presignup/http.ts'))
    const esGuard = (c: string) => /const readPublicLocale = \(v: unknown\): PublicLocale => \(v === 'en' \|\| v === 'es' \? v : 'he'\)/.test(c)
      && /const readLocale = \(v: unknown\): Locale => toBilingualLocale\(readPublicLocale\(v\)\)/.test(c)
    check('source: the page\'s language is read as a PUBLIC locale and narrowed for the ledger', esGuard(httpSrc))
    check('mutation control: the old two-language read fails the guard',
      !esGuard(httpSrc.replace("v === 'en' || v === 'es' ? v : 'he'", "v === 'en' ? 'en' : 'he'")))

    const src = code(read('lib/presignup/http.ts'))
    const consentGuard = (c: string) => /if \(body\.consent !== true\) return answer\(400, \{ ok: false, code: 'consent_required' \}\)/.test(c) && /consent_text: reportConsentText\(publicLocale\)/.test(c)
    check('source: consent must be exactly true, and the stored words come from reportConsentText', consentGuard(src))
    check('mutation control: a truthiness check fails the guard', !consentGuard(src.replace('body.consent !== true', '!body.consent')))
    check('mutation control: storing the request\'s words fails the guard', !consentGuard(src.replace('consent_text: reportConsentText(publicLocale)', 'consent_text: String(body.consentText)')))
    const screen = code(read('components/free-check/FreeCheckResearch.tsx'))
    const uncheckedGuard = (c: string) => /const \[consent, setConsent\] = useState\(false\)/.test(c) && /checked=\{consent\}/.test(c)
    check('the screen\'s consent box starts unticked', uncheckedGuard(screen))
    check('mutation control: a pre-ticked box fails the guard', !uncheckedGuard(screen.replace('useState(false)\n  const [busy', 'useState(true)\n  const [busy').replace('const [consent, setConsent] = useState(false)', 'const [consent, setConsent] = useState(true)')))
  }

  // ── 8) Sign-up: the claim seeds the project; stage A does NOT run again ───
  console.log('\n8) The claim: the project gets the research, nothing is spent twice')
  {
    // The seed route's real handler over the same database.
    const scheduled: (() => Promise<void>)[] = []
    const jobs: { admin: ServiceRoleClient; scope: SeedScope; runId: string; lease: string }[] = []
    const seedDeps: SeedRouteDeps = {
      session: async () => ({ userId: USER, db: new FakeAdmin(s.tables) as unknown as SupabaseClient }),
      admin: () => s.admin,
      isAdmin: async () => false,
      siteAllowance: async () => 0,
      access: async () => ({ allowed: true, authority: 'website' }),
      consumeClaim: (admin, t, now) => consumeClaimToken(t, admin, now),
      schedule: (task) => void scheduled.push(task),
      runStage: async (args) => void jobs.push(args),
      addKeywords: async (args) => ({ outcome: { requested: args.keywords.length, added: 0, code: 'no_keywords_selected' }, targetIds: [] }),
      locale: async () => 'he',
      now: s.c.now,
      env: { ENABLE_SEED_SCAN: 'true' },
    }
    const seedPost = (body: unknown) =>
      new Request(`https://app.example/api/projects/${PROJECT}/seed`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) })

    const claimed = await call(handleSeedPost(seedPost({ action: 'claim', token }), PROJECT, seedDeps))
    check('the new project claims the research → 202, trigger claim', claimed.status === 202 && claimed.json.trigger === 'claim', claimed.text)
    check('…the token is spent', !!s.tables.free_site_check_claims.find((c) => c.token_hash === hashClaimToken(token))?.consumed_at)
    const twice = await consumeClaimToken(token, s.admin, s.c.now())
    check('SINGLE USE: the same token again is refused as already used', twice.ok === false && twice.reason === 'already_used', JSON.stringify(twice))

    for (const task of scheduled) await task()
    const job = jobs[0]
    const spend = { fetches: 0, hosts: 0, model: 0, searches: 0 }
    const countingNet = new FakeNetwork(heWordPressSite())
    const replayDeps = {
      fetchImpl: ((...a: Parameters<typeof fetch>) => {
        spend.fetches++
        return countingNet.fetch(...a)
      }) as typeof fetch,
      assertHost: async () => {
        spend.hosts++
        throw new Error('host check during a replay')
      },
      insight: (async () => {
        spend.model++
        return { ok: true, insight: HE_WP_INSIGHT }
      }) as never,
      search: async () => {
        spend.searches++
        return { ok: true as const, domains: [] }
      },
      now: s.c.now,
    }
    await captureConsole(() => runStageA({ ...job, deps: replayDeps }))
    const run = s.tables.project_seed_runs.find((r) => r.id === job?.runId) ?? {}
    check('NO RE-RUN: the claimed run fetched nothing, checked no host, asked no model, searched nothing',
      !!job && spend.fetches === 0 && spend.hosts === 0 && spend.model === 0 && spend.searches === 0, JSON.stringify(spend))
    const steps = s.tables.project_seed_steps.filter((x) => x.run_id === job?.runId)
    check('…and still finished stage A: a1-a4 done', run.status === 'done' && ['a1', 'a2', 'a3', 'a4'].every((st) => steps.find((x) => x.step === st)?.status === 'done'),
      `${String(run.status)} ${steps.map((x) => `${String(x.step)}:${String(x.status)}:${String(x.error_code)}`).join(' ')}`)
    const projSummary = run.summary as { business: Row; seedKeywords: string[]; competitors: { domain: string }[]; findings: unknown[] }
    check('…with the research the visitor watched (business, keywords, every competitor, findings)',
      projSummary?.business?.companyName === (stored as unknown as { business: Row })?.business?.companyName
      && JSON.stringify(projSummary?.seedKeywords) === JSON.stringify(stored?.seedKeywords)
      && JSON.stringify(projSummary?.competitors?.map((c) => c.domain)) === JSON.stringify(stored?.competitors.map((c) => c.domain))
      && projSummary?.findings?.length === ((stored as unknown as { findings: unknown[] })?.findings?.length ?? -1))
    const project = s.tables.projects[0]
    check('…the project\'s empty fields are filled from it, the kept ones kept',
      project.business_name === HE_WP_INSIGHT.business.companyName && project.country === 'IL' && project.language === 'he' && project.description === 'kept project description')
    const competitors = s.tables.ai_visibility_competitors.filter((c) => c.project_id === PROJECT)
    const expected = (stored?.competitors ?? []).slice(0, MAX_ACTIVE_COMPETITORS).map((c) => c.domain)
    check(`…and its competitors are the research's (up to the ${MAX_ACTIVE_COMPETITORS} a project tracks), a locked one included`,
      JSON.stringify(competitors.map((c) => c.domain)) === JSON.stringify(expected) && expected.some((d) => locked.competitors.includes(d)), JSON.stringify(competitors.map((c) => c.domain)))
    check('the stage-B continuation is still possible (stage A done, not claimed twice)', s.tables.project_seed_runs.filter((r) => r.project_id === PROJECT).length === 1)

    // Mutation control 1: a ledger row missing its saved answer fails the step, and still asks nothing.
    const s2 = setup()
    const r2 = resultOf(await research(s2))
    const seed2 = s2.tables.free_site_checks[0].seed as { research: { details: { a2: Row } } }
    delete seed2.research.details.a2.insight
    const jobs2: typeof jobs = []
    const sched2: (() => Promise<void>)[] = []
    const deps2: SeedRouteDeps = { ...seedDeps, admin: () => s2.admin, schedule: (t) => void sched2.push(t), runStage: async (a) => void jobs2.push(a), session: async () => ({ userId: USER, db: new FakeAdmin(s2.tables) as unknown as SupabaseClient }), now: s2.c.now }
    await call(handleSeedPost(seedPost({ action: 'claim', token: r2?.claimToken }), PROJECT, deps2))
    for (const t of sched2) await t()
    const spend2 = { ...spend, model: 0, searches: 0, fetches: 0, hosts: 0 }
    await captureConsole(() => runStageA({ ...jobs2[0], deps: { ...replayDeps, insight: (async () => { spend2.model++; return { ok: true, insight: HE_WP_INSIGHT } }) as never } }))
    const a2 = s2.tables.project_seed_steps.find((x) => x.run_id === jobs2[0]?.runId && x.step === 'a2')
    check('mutation control: a claim whose saved answer is gone fails a2 claim_payload_missing, and the model is still not asked',
      a2?.status === 'failed' && a2?.error_code === 'claim_payload_missing' && spend2.model === 0, `${String(a2?.status)} ${String(a2?.error_code)} model=${spend2.model}`)

    // Mutation control 2: the same saved details under a non-claim trigger DO spend: the counters are live.
    const s3 = setup()
    const r3 = resultOf(await research(s3))
    const jobs3: typeof jobs = []
    const sched3: (() => Promise<void>)[] = []
    const deps3: SeedRouteDeps = { ...seedDeps, admin: () => s3.admin, schedule: (t) => void sched3.push(t), runStage: async (a) => void jobs3.push(a), session: async () => ({ userId: USER, db: new FakeAdmin(s3.tables) as unknown as SupabaseClient }), now: s3.c.now }
    await call(handleSeedPost(seedPost({ action: 'claim', token: r3?.claimToken }), PROJECT, deps3))
    for (const t of sched3) await t()
    // Break the replay on purpose: the run is a plain scan and its steps carry no saved answers.
    for (const r of s3.tables.project_seed_runs) r.trigger = 'create'
    for (const st of s3.tables.project_seed_steps) st.detail = {}
    const spend3 = { fetches: 0, model: 0, searches: 0 }
    const search3 = fakeSearch(HE_WP_RESULTS)
    await captureConsole(() =>
      runStageA({
        ...jobs3[0],
        deps: {
          fetchImpl: ((...a: Parameters<typeof fetch>) => {
            spend3.fetches++
            return countingNet.fetch(...a)
          }) as typeof fetch,
          insight: (async () => {
            spend3.model++
            return { ok: true, insight: HE_WP_INSIGHT }
          }) as never,
          search: async (q, m) => {
            spend3.searches++
            return search3.fn(q, m)
          },
          now: s3.c.now,
        },
      }),
    )
    check('mutation control: the same run as a plain scan (trigger create) fetches and asks, so the zero counts above are real', spend3.fetches > 0 && spend3.model > 0 && spend3.searches > 0, JSON.stringify(spend3))
  }

  // ── 9) Expiry ────────────────────────────────────────────────────────────
  console.log('\n9) The token expires with the day')
  {
    const s1 = setup()
    const r = resultOf(await research(s1))
    const t = r?.claimToken ?? ''
    s1.c.advance(25 * 60 * 60 * 1000)
    const outcome = await consumeClaimToken(t, s1.admin, s1.c.now())
    check('a token 25h old is not redeemed (expired), and stays unspent', outcome.ok === false && outcome.reason === 'expired' && s1.tables.free_site_check_claims[0].consumed_at === null, JSON.stringify(outcome))
    const rep = await call(handleReportRequest(reportReq({ token: t, email: 'x@y.co', consent: true }), s1.deps))
    check('…nor accepted by the report request', rep.status === 400 && rep.json.code === 'invalid_claim')
    const fresh = setup()
    const rf = resultOf(await research(fresh))
    fresh.c.advance(23 * 60 * 60 * 1000)
    const ok = await consumeClaimToken(rf?.claimToken ?? '', fresh.admin, fresh.c.now())
    check('mutation control: at 23h the same kind of token IS redeemed (so the expiry check is not vacuous)', ok.ok === true)
  }

  // ── 9b) the consent box points at a policy the visitor can read ─────────
  console.log('\n9b) The consent and its privacy link, per language')
  {
    const src = read('components/free-check/FreeCheckResearch.tsx')
    /*
     * The consent sentence and the policy link beside it are the disclosure.
     * This used to read `locale === 'en' ? '/en/privacy' : '/privacy'`, which
     * sent a Spanish visitor to the HEBREW document: a policy in a language
     * they were never shown is not a disclosure. The check is written against
     * the RULE, not the current list of languages, so the next language is
     * covered without editing this file.
     */
    const href = /const privacyHref = ([^\n]+)/.exec(src)?.[1] ?? ''
    check('the privacy link is Hebrew-unprefixed and every other language its own prefix',
      /locale === 'he' \? '\/privacy' : `\/\$\{locale\}\/privacy`/.test(href), href)
    check('mutation control: pinning the link to one language fails the rule',
      !/locale === 'he' \? '\/privacy' : `\/\$\{locale\}\/privacy`/.test("const privacyHref = locale === 'en' ? '/en/privacy' : '/privacy'"))

    /*
     * The stored proof must be in the words the visitor actually read, which
     * is why reportConsentText is per locale and Spanish has its own version
     * id. Each language's sentence must say all three things: the report, the
     * marketing it is bundled with, and that consent can be withdrawn.
     */
    for (const locale of ['he', 'en', 'es'] as const) {
      const text = reportConsentText(locale)
      check(`${locale}: the stored consent carries its own version id`,
        text.endsWith(locale === 'es' ? '[report-email-es-v1]' : '[report-email-v1]'), text.slice(-30))
      check(`${locale}: it names Go Top as the sender`, /Go Top/.test(text))
    }
    check('the Spanish sentence is its own, not a copy of another language',
      reportConsentText('es') !== reportConsentText('he') && reportConsentText('es') !== reportConsentText('en'))
    check('the Spanish sentence says the report, the marketing and the withdrawal',
      /informe/i.test(reportConsentText('es'))
      && /comercial|marketing/i.test(reportConsentText('es'))
      && /retirar/i.test(reportConsentText('es')))
  }

  // ── 10) Google sign-in ───────────────────────────────────────────────────
  console.log('\n10) Continue with Google')
  {
    check('the flag is exactly "true"', googleSignInEnabled('true') && !googleSignInEnabled(undefined) && !googleSignInEnabled('1') && !googleSignInEnabled('TRUE'))
    const shopifyGuard = (visible: typeof googleSignInVisible) =>
      ['/shopify', '/shopify/app?shop=x.myshopify.com', '/shopify?shop=x', '/en/shopify/billing'].every((n) => !visible({ enabled: true, nextPath: n, framed: false }))
      && !visible({ enabled: true, nextPath: '/dashboard', framed: true })
      && !visible({ enabled: false, nextPath: '/dashboard', framed: false })
      && visible({ enabled: true, nextPath: '/dashboard', framed: false })
    check('hidden for every Shopify destination, inside a frame, and with the flag off; shown otherwise', shopifyGuard(googleSignInVisible))
    check('mutation control: a check that forgets Shopify fails the guard', !shopifyGuard((a) => a.enabled && !a.framed))
    const back = (next: string) => new URL(googleRedirectTo('https://app.example', next, 'he'))
    check('Google returns to this origin\'s auth callback, with the language',
      back('/dashboard').origin === 'https://app.example' && back('/dashboard').pathname === '/api/auth/callback' && back('/dashboard').searchParams.get('lang') === 'he')
    check('an external or protocol-relative next is replaced by the dashboard',
      ['https://evil.example/x', '//evil.example/x', '/\\evil.example', 'javascript:alert(1)'].every((n) => back(n).searchParams.get('next') === '/dashboard'),
      ['https://evil.example/x', '//evil.example/x'].map((n) => back(n).searchParams.get('next')).join(' '))
    check('…a same-origin next is kept', back('/projects/new').searchParams.get('next') === '/projects/new')
    const button = code(read('components/auth/GoogleSignInButton.tsx'))
    const buttonGuard = (c: string) => /if \(!googleSignInVisible\(\{ enabled: googleSignInEnabled\(\), nextPath, framed \}\)\) return null/.test(c) && /provider: 'google'/.test(c) && /redirectTo: googleRedirectTo\(window\.location\.origin, nextPath, lang\)/.test(c)
    check('the button renders nothing unless visible, and redirects through googleRedirectTo', buttonGuard(button))
    check('mutation control: a button that skips the visibility check fails the guard', !buttonGuard(button.replace('if (!googleSignInVisible', 'if (false && !googleSignInVisible')))
    check('the button never shows the provider\'s own message', !/oauthError\.message|error\.message/.test(button))
    const login = code(read('app/(auth)/login/page.tsx'))
    const signup = code(read('app/(auth)/signup/page.tsx'))
    check('on sign-in (with its own next) and sign-up (held while a claim is still in the address)',
      login.includes('<GoogleSignInButton lang={lang} nextPath={nextPath} />') && signup.includes(`<GoogleSignInButton lang={lang} nextPath="/dashboard" disabled={searchParams.has('claim')} />`))
  }

  check(`${SECRET} appears in no log line of the whole suite`, !allLogs.includes(SECRET) && allLogs.includes('[presignup] research ended'))
  finish()
}

main().catch((err) => {
  console.error('suite crashed', err)
  process.exit(1)
})
export {}
