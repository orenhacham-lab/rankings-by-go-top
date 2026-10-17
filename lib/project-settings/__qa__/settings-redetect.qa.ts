/**
 * "Detect again with AI": POST /api/projects/[id]/redetect.
 *
 * The handler (lib/project-settings/redetect.ts) runs over a project the REAL
 * stage A has read, with the real seed store, the real single-flight claims
 * (FakeAdmin mirrors their SQL) and a counting fake model. What is proved:
 *   - who may ask: signed in, their own project, the feature on (or an
 *     administrator), a well-formed request, entitled;
 *   - what it reads: the latest run's stored a1 signals, never the site;
 *   - what it asks: exactly ONE model call per request, a2's own question;
 *   - what it answers: a2's own cleaners' output, equal to what a2 wrote from
 *     the same answer; nothing is written to the settings;
 *   - the daily allowance (SETTINGS_AI_USER_DAILY_CAP, default 10) and the
 *     one-at-a-time rule per project, both without a migration, fail closed;
 *   - nothing a provider or the database said reaches a response or a log.
 *
 * Run: npx tsx lib/project-settings/__qa__/settings-redetect.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { BusinessInsight, InsightResult } from '@/lib/free-check'
import { profileValues, projectValues } from '@/lib/seed-scan/settings'
import { insightFromModel } from '@/lib/seed-scan/steps'
import { REDETECT_ERROR_CODES } from '../types'
import {
  DEFAULT_REDETECT_DAILY_CAP,
  handleRedetect,
  redetectFlightScope,
  redetectSlotScope,
  secondsUntilTomorrow,
  utcDay,
} from '../redetect'
import {
  audienceRows,
  call,
  HE_WP,
  HE_WP_INSIGHT,
  makeChecker,
  NOW,
  OTHER_USER,
  post,
  PROJECT,
  profileRow,
  projectRow,
  redetectDeps,
  scan,
  scannedTables,
  SECRET,
  USER,
  type Tables,
} from './_settings-fixtures'

const { check, finish } = makeChecker()
type Row = Record<string, unknown>

const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** A refusal is exactly { ok: false, code } (+ retryAfterSeconds on a 429) with a known code. */
function refused(r: { status: number; json: Row }, status: number, code: string): boolean {
  const keys = Object.keys(r.json).sort().join(',')
  const shape = status === 429 ? keys === 'code,ok,retryAfterSeconds' : keys === 'code,ok'
  return r.status === status && r.json.ok === false && r.json.code === code && shape && (REDETECT_ERROR_CODES as readonly string[]).includes(code)
}

const slotRows = (t: Tables, userId = USER) =>
  (t.operation_claims ?? []).filter((c) => c.user_id === userId && String(c.scope).startsWith('settings-ai:day:'))
const flightRows = (t: Tables) => (t.operation_claims ?? []).filter((c) => c.scope === redetectFlightScope(PROJECT))
const settingsSnapshot = (t: Tables) =>
  JSON.stringify([t.projects, t.project_profiles, t.project_audiences, t.ai_visibility_competitors])

/** Everything every call logged, for the one "no secret in any log" check. */
let allLogs = ''
let allBodies = ''
async function ask(tables: Tables, body: unknown, o: Parameters<typeof redetectDeps>[1] = {}, raw?: string) {
  const env = redetectDeps(tables, o)
  const r = await call(() => handleRedetect(post(body, raw), PROJECT, env.deps))
  allLogs += `${r.logs}\n`
  allBodies += `${r.text}\n`
  return { ...r, model: env.model, adminLog: env.adminLog, userLog: env.userLog }
}

async function main() {
  const base = await scannedTables()
  const stored = base.project_seed_steps.find((s) => s.step === 'a1')?.detail as { signals?: { finalUrl?: string } } | undefined
  const storedUrl = stored?.signals?.finalUrl
  check('fixture: the real stage A stored the page it read (a1 signals)', typeof storedUrl === 'string' && storedUrl.startsWith('https://'), String(storedUrl))

  // ── 1. Who may ask ─────────────────────────────────────────────────────────
  console.log('\n1) signed in, their own project, the feature on, a well-formed request, entitled')
  {
    const out = await ask(structuredClone(base), { section: 'business' }, { userId: null })
    check('signed out: 401 unauthorized, no model call, the service role never used', refused(out, 401, 'unauthorized') && out.model.calls.length === 0 && out.adminLog.length === 0)
  }
  {
    const out = await ask(structuredClone(base), { section: 'business' }, { sessionThrows: true })
    check('no session at all: 503 unavailable, nothing of the failure in the answer', refused(out, 503, 'unavailable') && !out.text.includes(SECRET))
  }
  {
    const t = structuredClone(base)
    t.projects[0].user_id = OTHER_USER
    const out = await ask(t, { section: 'business' })
    check("someone else's project: 404 not_found, no model call, the service role never used",
      refused(out, 404, 'not_found') && out.model.calls.length === 0 && out.adminLog.length === 0)
  }
  {
    const env = redetectDeps(structuredClone(base))
    const out = await call(() => handleRedetect(post({ section: 'business' }), 'not-a-uuid', env.deps))
    check('a malformed project id: 404 not_found', refused(out, 404, 'not_found') && env.model.calls.length === 0)
  }
  {
    const out = await ask(structuredClone(base), { section: 'business' })
    check('the project is read through the OWNER\'s client, never the service role',
      out.userLog.includes('projects') && !out.adminLog.includes('projects'), `${out.userLog} | ${out.adminLog}`)
  }
  {
    const off = await ask(structuredClone(base), { section: 'business' }, { env: { ENABLE_SEED_SCAN: undefined } })
    const offFalse = await ask(structuredClone(base), { section: 'business' }, { env: { ENABLE_SEED_SCAN: 'false' } })
    check('the feature off: 404 not_found, no model call', refused(off, 404, 'not_found') && refused(offFalse, 404, 'not_found') && off.model.calls.length === 0)
    const admin = await ask(structuredClone(base), { section: 'business' }, { env: { ENABLE_SEED_SCAN: undefined }, admins: [USER] })
    check('…while an administrator gets it with the feature off', admin.status === 200 && admin.model.calls.length === 1)
  }
  {
    const bad: [string, unknown, string?][] = [
      ['a section with no model fields (competitors)', { section: 'competitors' }],
      ['an unknown section', { section: 'everything' }],
      ['an extra key', { section: 'business', write: true }],
      ['a locale the app does not have', { section: 'business', locale: 'fr' }],
      ['an array', [{ section: 'business' }]],
      ['not JSON', null, 'section=business'],
      ['a body over 1 KB', { section: 'business', locale: 'he', pad: 'x'.repeat(2_000) }],
    ]
    let all = true
    let calls = 0
    for (const [, body, raw] of bad) {
      const out = await ask(structuredClone(base), body, {}, raw)
      all &&= refused(out, 400, 'invalid_request')
      calls += out.model.calls.length
    }
    check(`malformed requests (${bad.map((b) => b[0]).join('; ')}): 400 invalid_request, no model call`, all && calls === 0)
  }
  {
    const no = await ask(structuredClone(base), { section: 'business' }, { access: { allowed: false, authority: 'website' } })
    const unreadable = await ask(structuredClone(base), { section: 'business' }, { access: { allowed: false, authority: 'unreadable' } })
    check('not entitled: 403 entitlement_required; entitlement unreadable: 503 entitlement_unavailable; no model call',
      refused(no, 403, 'entitlement_required') && refused(unreadable, 503, 'entitlement_unavailable') && no.model.calls.length + unreadable.model.calls.length === 0)
  }

  // ── 2. What it reads ───────────────────────────────────────────────────────
  console.log('\n2) the latest run\'s stored a1 signals, and only them')
  {
    const t = structuredClone(base)
    t.project_seed_runs.push({ id: 'run-live', project_id: PROJECT, user_id: USER, trigger: 'rescan', stage: 'a', status: 'running',
      summary: t.project_seed_runs[0].summary, lease_expires_at: new Date(NOW.getTime() + 60_000).toISOString(), started_at: NOW.toISOString(),
      finished_at: null, created_at: new Date(NOW.getTime() + 1).toISOString() })
    const out = await ask(t, { section: 'profile' })
    check('a scan of the project running: 409 run_in_progress, no model call, no slot spent',
      refused(out, 409, 'run_in_progress') && out.model.calls.length === 0 && slotRows(t).length === 0)
  }
  {
    const t = structuredClone(base)
    t.project_seed_runs = []
    t.project_seed_steps = []
    const out = await ask(t, { section: 'profile' })
    check('never scanned: 409 scan_required, no model call', refused(out, 409, 'scan_required') && out.model.calls.length === 0)
  }
  {
    // A newer run whose a1 stored no page: a claimed free check, and a password-locked store.
    for (const [name, detail] of [
      ['a claim (a1 kept the claimed result, not a page)', { claim: { version: 1 } }],
      ['a password-locked store', { mode: 'live', storefrontLocked: true, signals: null }],
      ['a1 still pending', {}],
    ] as const) {
      const t = structuredClone(base)
      t.project_seed_runs.push({ ...t.project_seed_runs[0], id: 'run-2', created_at: new Date(NOW.getTime() + 3_600_000).toISOString() })
      t.project_seed_steps.push({ id: 'step-2', run_id: 'run-2', project_id: PROJECT, user_id: USER, step: 'a1', status: 'done', detail })
      const out = await ask(t, { section: 'audience' })
      check(`the latest run is ${name}: 409 scan_required, no model call`, refused(out, 409, 'scan_required') && out.model.calls.length === 0)
    }
  }
  {
    const t = structuredClone(base)
    const before = settingsSnapshot(t)
    const realFetch = globalThis.fetch
    let fetches = 0
    globalThis.fetch = (async (...args: Parameters<typeof fetch>) => {
      fetches++
      return realFetch(...args)
    }) as typeof fetch
    const env = redetectDeps(t)
    const answers = []
    try {
      for (const [section, locale] of [['business', undefined], ['profile', 'en'], ['audience', 'he']] as const) {
        answers.push(await call(() => handleRedetect(post(locale ? { section, locale } : { section }), PROJECT, env.deps)))
      }
    } finally {
      globalThis.fetch = realFetch
    }
    check('three sections, three answers of 200', answers.every((a) => a.status === 200), answers.map((a) => a.status).join(','))
    check('exactly ONE model call per request', env.model.calls.length === 3, String(env.model.calls.length))
    check('the model is given the page a1 stored, never a new read of the site', env.model.calls.every((c) => c.finalUrl === storedUrl) && fetches === 0,
      `fetches ${fetches}, ${env.model.calls.map((c) => c.finalUrl)}`)
    check('asked in the requested language, else the run\'s; told the site itself',
      env.model.calls.map((c) => c.locale).join(',') === 'he,en,he' && env.model.calls.every((c) => c.selfDomain === HE_WP.key))
    check('nothing is written to the project, the profile, the audiences or the competitors', settingsSnapshot(t) === before)
    check('answers are never cached', answers.every((a) => a.headers.get('cache-control') === 'no-store'))

    // What a2 wrote from the same answer, in the scanned world.
    const project = base.projects[0]
    const profile = profileRow(base) as Row
    const [biz, prof, aud] = answers.map((a) => a.json.suggestions as Row)
    check('business: what a2 wrote to the project (name, country, language)',
      biz.business_name === project.business_name && biz.country === project.country && biz.language === project.language && Object.keys(biz).length === 3,
      JSON.stringify(biz))
    check('profile: what a2 wrote to the profile (description, commerce type)',
      prof.description === profile.description && prof.commerce_type === profile.commerce_type && Object.keys(prof).length === 2, JSON.stringify(prof))
    check('audience: what a2 wrote (niche, local, the audiences in order)',
      aud.niche === profile.niche && aud.is_local === profile.is_local &&
      JSON.stringify(aud.audiences) === JSON.stringify(audienceRows(base).map((r) => r.label)), JSON.stringify(aud))
    check('the answer names its section and carries nothing else', answers.every((a, i) => a.json.ok === true && a.json.section === ['business', 'profile', 'audience'][i] && Object.keys(a.json).length === 3))
  }

  // ── 3. a2's own cleaners ───────────────────────────────────────────────────
  console.log('\n3) a messy answer is cleaned exactly as a2 cleans it')
  {
    const messy: BusinessInsight = {
      ...HE_WP_INSIGHT,
      business: {
        ...HE_WP_INSIGHT.business,
        companyName: '   Plumbing   Pros Ltd   ',
        summary: `   ${'Leak detection and drain cleaning. '.repeat(60)}   `,
        niche: `  ${'n'.repeat(200)}  `,
        country: ' il ',
        language: 'he-IL',
        commerceType: 'services' as never,
        isLocal: 'yes' as never,
        audiences: ['  Home   owners ', 'home owners', '', 'Landlords', 'A'.repeat(400), 'Property managers', 'Builders', 'Cafés'],
      },
    }
    // What a2 writes from it: a real first scan of a project with nothing set.
    const scanned = (await import('@/lib/seed-scan/__qa__/_fixtures')).world(projectRow()).tables
    await scan(scanned, { insight: messy })
    const written = { project: scanned.projects[0], profile: profileRow(scanned) as Row, audiences: audienceRows(scanned).map((r) => r.label) }
    const env = redetectDeps(structuredClone(scanned), { answer: { ok: true, insight: messy } })
    // One after another: the project's one-at-a-time rule would refuse them together.
    const got: Row[] = []
    for (const section of ['business', 'profile', 'audience'] as const) {
      got.push(((await call(() => handleRedetect(post({ section }), PROJECT, env.deps))).json.suggestions ?? {}) as Row)
    }
    const [biz, prof, aud] = got
    check('business suggestions = what a2 wrote to the project',
      biz?.business_name === written.project.business_name && biz?.country === written.project.country && biz?.language === written.project.language,
      `${JSON.stringify(biz)} vs ${JSON.stringify([written.project.business_name, written.project.country, written.project.language])}`)
    check('profile suggestions = what a2 wrote to the profile',
      prof?.description === written.profile.description && prof?.commerce_type === written.profile.commerce_type, JSON.stringify(prof).slice(0, 200))
    check('audience suggestions = what a2 wrote (niche, local, audiences)',
      aud?.niche === written.profile.niche && aud?.is_local === written.profile.is_local &&
      JSON.stringify(aud?.audiences) === JSON.stringify(written.audiences), `${JSON.stringify(aud)} vs ${JSON.stringify(written.audiences)}`)
    const cleaned = insightFromModel(messy)!
    check('…which are the exported cleaners\' own values (projectValues / profileValues)',
      biz?.business_name === projectValues(cleaned.business).business_name && prof?.description === profileValues(cleaned.business).description)
  }

  // ── 4. One at a time, and the daily allowance ──────────────────────────────
  console.log('\n4) one request at a time per project; a daily allowance per user')
  {
    const t = structuredClone(base)
    const env = redetectDeps(t, { delayMs: 60 })
    const [a, b] = await Promise.all([
      call(() => handleRedetect(post({ section: 'business' }), PROJECT, env.deps)),
      call(() => handleRedetect(post({ section: 'business' }), PROJECT, env.deps)),
    ])
    const statuses = [a.status, b.status].sort().join(',')
    const loser = a.status === 409 ? a : b
    check('a double click: one 200 and one 409 redetect_in_progress', statuses === '200,409' && refused(loser, 409, 'redetect_in_progress'), statuses)
    check('…and ONE model call between them', env.model.calls.length === 1, String(env.model.calls.length))
    check('…and one slot of the allowance spent', slotRows(t).length === 1)
    check('the flight is released when the call ends', flightRows(t).length === 0)
  }
  {
    const t = structuredClone(base)
    const env = redetectDeps(t, { env: { SETTINGS_AI_USER_DAILY_CAP: '2' } })
    const results = []
    for (let i = 0; i < 3; i++) results.push(await call(() => handleRedetect(post({ section: 'profile' }), PROJECT, env.deps)))
    const last = results[2]
    const wait = secondsUntilTomorrow(NOW)
    check('SETTINGS_AI_USER_DAILY_CAP=2: two answers, then 429 redetect_daily_cap', results[0].status === 200 && results[1].status === 200 && refused(last, 429, 'redetect_daily_cap'))
    check('…with Retry-After (header and body) until the next UTC day', last.headers.get('retry-after') === String(wait) && last.json.retryAfterSeconds === wait && wait === 14 * 3600,
      `${last.headers.get('retry-after')} / ${wait}`)
    check('…and no third model call', env.model.calls.length === 2)
    check("each answer spent one slot of today's allowance", JSON.stringify(slotRows(t).map((r) => r.scope).sort()) === JSON.stringify([redetectSlotScope(utcDay(NOW), 1), redetectSlotScope(utcDay(NOW), 2)]))
  }
  {
    const t = structuredClone(base)
    const env = redetectDeps(t)
    const statuses: number[] = []
    for (let i = 0; i < DEFAULT_REDETECT_DAILY_CAP + 1; i++) statuses.push((await call(() => handleRedetect(post({ section: 'audience' }), PROJECT, env.deps))).status)
    check(`the default allowance is ${DEFAULT_REDETECT_DAILY_CAP} a day`, DEFAULT_REDETECT_DAILY_CAP === 10 && statuses.slice(0, 10).every((s) => s === 200) && statuses[10] === 429 && env.model.calls.length === 10,
      statuses.join(','))
    const junk = redetectDeps(structuredClone(base), { env: { SETTINGS_AI_USER_DAILY_CAP: 'lots' } })
    check('a malformed SETTINGS_AI_USER_DAILY_CAP means the default', (await call(() => handleRedetect(post({ section: 'audience' }), PROJECT, junk.deps))).status === 200)
    const zero = await ask(structuredClone(base), { section: 'audience' }, { env: { SETTINGS_AI_USER_DAILY_CAP: '0' } })
    check('SETTINGS_AI_USER_DAILY_CAP=0 turns it off: 429 and no model call', refused(zero, 429, 'redetect_daily_cap') && zero.model.calls.length === 0)
  }
  {
    const day = utcDay(NOW)
    const yesterday = utcDay(new Date(NOW.getTime() - 86_400_000))
    const slot = (userId: string, d: string, n: number) => ({
      claim_key: `${userId}:ranking_scan:${redetectSlotScope(d, n)}`, user_id: userId, operation: 'ranking_scan', scope: redetectSlotScope(d, n),
      holder_request_id: 'old', claimed_at: NOW.toISOString(), expires_at: new Date(NOW.getTime() + 60_000).toISOString(),
    })
    const t = structuredClone(base)
    t.operation_claims = [
      ...Array.from({ length: 10 }, (_, i) => slot(OTHER_USER, day, i + 1)),
      ...Array.from({ length: 10 }, (_, i) => slot(USER, yesterday, i + 1)),
      ...Array.from({ length: 3 }, (_, i) => slot(OTHER_USER, yesterday, i + 1)),
    ]
    const out = await ask(t, { section: 'business' })
    check("another user's slots do not count against this user", out.status === 200)
    check("this user's earlier days are removed as they are found; nobody else's rows are touched",
      slotRows(t).every((r) => String(r.scope).includes(day)) && slotRows(t, OTHER_USER).length === 13, `${slotRows(t).length} / ${slotRows(t, OTHER_USER).length}`)
  }
  {
    const t = structuredClone(base)
    await ask(t, { section: 'business' }, { userId: null })
    await ask(t, { section: 'business' }, { access: { allowed: false, authority: 'website' } })
    await ask(t, { section: 'nope' })
    t.project_seed_steps = t.project_seed_steps.filter((s) => s.step !== 'a1')
    await ask(t, { section: 'business' })
    check('refusals never spend the allowance', slotRows(t).length === 0, String(slotRows(t).length))
  }

  // ── 5. Failing closed, and failing quietly ─────────────────────────────────
  console.log('\n5) the claims unreadable fail closed; a model failure is a code')
  {
    const rpc = await ask(structuredClone(base), { section: 'business' }, { rpcHooks: { claim_operation: () => ({ message: SECRET }) } })
    check('the claim mechanism failing: 503 unavailable, no model call', refused(rpc, 503, 'unavailable') && rpc.model.calls.length === 0)
    const slots = await ask(structuredClone(base), { section: 'business' }, { hooks: { operation_claims: { select: () => ({ message: SECRET }) } } })
    check('the allowance unreadable: 503 unavailable, no model call', refused(slots, 503, 'unavailable') && slots.model.calls.length === 0)
    const admin = await ask(structuredClone(base), { section: 'business' }, { adminThrows: true })
    check('no service role at all: 503 unavailable', refused(admin, 503, 'unavailable') && admin.model.calls.length === 0)
  }
  {
    const cases: [string, InsightResult | (() => Promise<InsightResult>), number, string][] = [
      ['the model has no key', { ok: false, reason: 'missing_gemini_api_key' } as InsightResult, 503, 'model_unavailable'],
      ['the model refuses with its own words', { ok: false, reason: SECRET } as unknown as InsightResult, 502, 'model_failed'],
      ['the model throws', async () => { throw new Error(SECRET) }, 502, 'model_failed'],
      ['the model answers nothing usable', { ok: true, insight: { ...HE_WP_INSIGHT, business: null } } as unknown as InsightResult, 502, 'model_failed'],
    ]
    for (const [name, answer, status, code] of cases) {
      const t = structuredClone(base)
      const out = await ask(t, { section: 'profile' }, { answer })
      check(`${name}: ${status} ${code}, the flight released`, refused(out, status, code) && flightRows(t).length === 0, `${out.status} ${out.text}`)
    }
    const t = structuredClone(base)
    const started = Date.now()
    const slow = await ask(t, { section: 'profile' }, { delayMs: 400, modelMs: 40 })
    check('the model past its budget: 502 model_failed, answered on the budget', refused(slow, 502, 'model_failed') && Date.now() - started < 300, `${Date.now() - started}ms`)
    check('a call that was made spends its slot, answered or not', slotRows(t).length === 1)
  }
  check('SECRET_PROVIDER_TEXT never reached a response', !allBodies.includes(SECRET))
  check('SECRET_PROVIDER_TEXT never reached a log line', !allLogs.includes(SECRET))

  // ── 6. The route, and the handler's own promises (source) ──────────────────
  console.log('\n6) the route wires the real dependencies; the handler fetches nothing and writes no settings')
  {
    const route = strip(read('app/api/projects/[id]/redetect/route.ts'))
    const wired = (src: string) =>
      /export async function POST\(/.test(src) && !/export async function (GET|PUT|DELETE|PATCH)\(/.test(src) &&
      /handleRedetect\(request, id, liveDeps\(\)\)/.test(src) &&
      /\.auth\.getUser\(\)/.test(src) && /explainAccess\(/.test(src) && /isAdminUser\(/.test(src) &&
      /insight: fetchBusinessInsight/.test(src) && /createAdminClient\(\)/.test(src)
    check('the route answers POST only, through handleRedetect, with the session, the entitlement, the admin check and a2\'s model call', wired(route))
    check('MUT: a route that skips the session fails it', !wired(route.replace('.auth.getUser()', '.auth.getSession()')))
    check('MUT: a route with its own GET fails it', !wired(`${route}\nexport async function GET() {}`))

    const handler = strip(read('lib/project-settings/redetect.ts'))
    const readsNoSite = (src: string) => !/\bfetch\(/.test(src) && !/fetchSiteHtml|extractSiteSignals|fetchImpl/.test(src)
    check('the handler never fetches anything itself (no site read)', readsNoSite(handler))
    check('MUT: a handler that fetches the site fails it', !readsNoSite(`${handler}\nawait fetch(project.target_domain)`) && !readsNoSite(`${handler}\nconst html = await fetchSiteHtml(url)`))
    const writesNoSettings = (src: string) =>
      !/from\('project_profiles'\)|from\('project_audiences'\)|from\('ai_visibility_competitors'\)/.test(src) &&
      !/from\('projects'\)\s*\.(update|insert|upsert|delete)/.test(src)
    check('the handler writes nothing to the settings tables', writesNoSettings(handler))
    check("MUT: a handler that saves the suggestion fails it", !writesNoSettings(`${handler}\nawait admin.from('project_profiles').update(x)`))
    // Each `.from('operation_claims')` chain on its own: from that call to the
    // end of its statement (the next `await`/`const`/`return`, or 400 chars).
    const claimChains = (src: string) =>
      [...src.matchAll(/\.from\('operation_claims'\)/g)].map((m) => {
        const rest = src.slice(m.index! + m[0].length, m.index! + m[0].length + 400)
        const end = rest.search(/\n\s*(const|let|if|return|await|\})\b/)
        return end === -1 ? rest : rest.slice(0, end)
      })
    const ownerFiltered = (src: string) => {
      const chains = claimChains(src)
      return chains.length >= 2 && chains.every((c) => /\.eq\('user_id', userId\)/.test(c))
    }
    check('every service-role read and delete of operation_claims names the owner', ownerFiltered(handler), JSON.stringify(claimChains(handler)))
    check('MUT: an unfiltered slot read fails it', !ownerFiltered(handler.replace(/(\.select\('claim_key, scope'\))\s*\.eq\('user_id', userId\)/, '$1')))
    check('MUT: an unfiltered stale-slot delete fails it', !ownerFiltered(handler.replace(".delete().eq('user_id', userId)", '.delete()')))
  }

  finish()
}

main().catch((err) => {
  console.error(err)
  process.exit(1)
})

export {}
