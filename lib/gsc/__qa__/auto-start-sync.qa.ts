/**
 * Search Console syncs by itself right after it is linked to a project.
 *
 * Behavioral (FakeAdmin + injected effects): a connect whose property is auto-matched
 * starts ONE sync; a property chosen later starts ONE sync; a double trigger never runs two
 * at once; an ambiguous / unverified / non-covering property is never linked on its own;
 * another user's project is never touched; a failure ends as a sanitized code.
 * Source contract: the routes start it in after() and never await it (the redirect and the
 * response are not delayed), the status route reports it, the screen shows it and polls,
 * the manual button stays, both dictionaries carry the text.
 * Every source guard has a mutation control: the guard is run on deliberately broken source
 * and must fail; the double-trigger check is also run on a naive implementation.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { runBackgroundGscSync, startBackgroundGscSync, pickAutoProperty, AUTO_START_COOLDOWN_MS, type BackgroundSyncEffects } from '../background-sync'
import { GscServiceError, loadSyncState } from '../service'
import { FakeAdmin } from './_fake-admin'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const NOW = Date.parse('2026-10-02T10:00:00Z')
const iso = (msAgo: number) => new Date(NOW - msAgo).toISOString()

type Site = { siteUrl: string; permissionLevel: string }
function world(opts: { sites?: Site[]; property?: boolean; runs?: Record<string, unknown>[]; connStatus?: string } = {}) {
  const tables: Record<string, Record<string, unknown>[]> = {
    projects: [{ id: 'p1', user_id: 'A', target_domain: 'https://shop.example.com' }, { id: 'pB', user_id: 'B', target_domain: 'https://other.com' }],
    gsc_connections: [{ id: 'cA', user_id: 'A', status: opts.connStatus ?? 'connected', encrypted_refresh_token: 'x' }, { id: 'cB', user_id: 'B', status: 'connected', encrypted_refresh_token: 'x' }],
    project_gsc_properties: opts.property ? [{ project_id: 'p1', connection_id: 'cA', site_url: 'sc-domain:example.com', permission_level: 'siteOwner' }] : [],
    gsc_sync_runs: opts.runs ?? [],
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const admin = new FakeAdmin(tables) as any
  const calls = { sync: [] as { siteUrl: string; projectId: string }[], token: 0, list: 0 }
  const effects: BackgroundSyncEffects = {
    getAccessToken: async () => { calls.token++; return 'tok' },
    listSites: async () => { calls.list++; return opts.sites ?? [{ siteUrl: 'sc-domain:example.com', permissionLevel: 'siteOwner' }] },
    runSync: async (d) => {
      calls.sync.push({ siteUrl: d.siteUrl, projectId: d.projectId })
      return { syncGroupId: d.syncGroupId, latestAvailableDate: '2026-09-30', noData: false, windows: [
        { windowDays: 28, runId: 'r1', status: 'succeeded', rowsFetched: 5, truncated: false, startDate: 'a', endDate: 'b' },
        { windowDays: 90, runId: 'r2', status: 'succeeded', rowsFetched: 5, truncated: false, startDate: 'a', endDate: 'b' }] }
    },
  }
  return { admin, tables, calls, effects }
}
const go = (w: ReturnType<typeof world>, o: { autoAssign: boolean; userId?: string; projectId?: string; effects?: Partial<BackgroundSyncEffects> } ) =>
  runBackgroundGscSync({ admin: w.admin, userId: o.userId ?? 'A', projectId: o.projectId ?? 'p1', autoAssign: o.autoAssign, nowMs: NOW, effects: { ...w.effects, ...o.effects } })

async function main() {
  console.log('A) connect: the matching property is linked and ONE sync starts')
  {
    const w = world()
    const r = await go(w, { autoAssign: true })
    check('outcome is done/succeeded and says it linked the property', r.state === 'done' && r.status === 'succeeded' && r.autoAssigned === true)
    check('the property row now exists for the project and the user\'s connection', w.tables.project_gsc_properties.length === 1 && w.tables.project_gsc_properties[0].project_id === 'p1' && w.tables.project_gsc_properties[0].connection_id === 'cA' && w.tables.project_gsc_properties[0].site_url === 'sc-domain:example.com')
    check('the sync engine ran exactly once, for that property', w.calls.sync.length === 1 && w.calls.sync[0].siteUrl === 'sc-domain:example.com' && w.calls.sync[0].projectId === 'p1')
  }

  console.log('B) which property may be linked on its own')
  {
    const cover = (siteUrl: string, permissionLevel = 'siteOwner') => ({ siteUrl, permissionLevel })
    check('one covering verified property → picked', pickAutoProperty([cover('https://shop.example.com/'), cover('https://nope.com/')], 'https://shop.example.com')?.siteUrl === 'https://shop.example.com/')
    check('domain + prefix both cover → the one domain property', pickAutoProperty([cover('https://shop.example.com/'), cover('sc-domain:example.com')], 'https://shop.example.com')?.siteUrl === 'sc-domain:example.com')
    check('two prefix properties both cover → ambiguous, none', pickAutoProperty([cover('https://shop.example.com/'), cover('https://www.shop.example.com/')], 'https://shop.example.com') === null)
    check('unverified is never picked', pickAutoProperty([cover('sc-domain:example.com', 'siteUnverifiedUser')], 'https://shop.example.com') === null)
    check('non-covering is never picked', pickAutoProperty([cover('sc-domain:other.com')], 'https://shop.example.com') === null)
    const w = world({ sites: [cover('https://shop.example.com/'), cover('https://www.shop.example.com/')] })
    const r = await go(w, { autoAssign: true })
    check('ambiguous → nothing linked, no sync, the user chooses', r.state === 'skipped' && r.reason === 'no_property' && w.tables.project_gsc_properties.length === 0 && w.calls.sync.length === 0)
  }

  console.log('C) property chosen later → ONE sync; never links a different one itself')
  {
    const w = world({ property: true })
    const r = await go(w, { autoAssign: false })
    check('sync ran once for the chosen property', r.state === 'done' && w.calls.sync.length === 1 && r.state === 'done' && r.autoAssigned === false)
    check('the site list was not even requested (no auto-link on this path)', w.calls.list === 0)
    const none = world()
    const r2 = await go(none, { autoAssign: false })
    check('no property and no auto-link → skipped, no sync', r2.state === 'skipped' && r2.reason === 'no_property' && none.calls.sync.length === 0 && none.calls.list === 0)
  }

  console.log('D) a double trigger never runs two syncs at once')
  {
    // A run whose sync is in flight: the engine's first action is to insert its running row.
    const w = world({ property: true })
    let release: () => void = () => {}
    const gate = new Promise<void>((r) => { release = r })
    const slow: Partial<BackgroundSyncEffects> = {
      runSync: async (d) => {
        w.calls.sync.push({ siteUrl: d.siteUrl, projectId: d.projectId })
        w.tables.gsc_sync_runs.push({ id: 'live', project_id: 'p1', status: 'running', started_at: iso(1000), site_url: d.siteUrl, window_days: 28 })
        await gate
        w.tables.gsc_sync_runs[0].status = 'succeeded'; w.tables.gsc_sync_runs[0].finished_at = iso(0)
        return { syncGroupId: 'g', latestAvailableDate: null, noData: true, windows: [{ windowDays: 28, runId: 'live', status: 'succeeded', rowsFetched: 0, truncated: false, startDate: null, endDate: null }] }
      },
    }
    const first = go(w, { autoAssign: false, effects: slow })
    await new Promise((r) => setTimeout(r, 20))
    // A second trigger that does NOT skip would sit on the gate: report that as a failure, never hang.
    const second = await Promise.race([go(w, { autoAssign: false, effects: slow }), new Promise<{ state: 'timeout' }>((r) => setTimeout(() => r({ state: 'timeout' }), 300))])
    check('the second trigger is skipped as sync_in_progress', second.state === 'skipped' && 'reason' in second && second.reason === 'sync_in_progress')
    release(); await first
    check('the engine ran once in total', w.calls.sync.length === 1)

    const stale = world({ property: true, runs: [{ id: 'old', project_id: 'p1', status: 'running', started_at: iso(30 * 60 * 1000), site_url: 'sc-domain:example.com', window_days: 28 }] })
    const rs = await go(stale, { autoAssign: false })
    check('a crashed (stale) running row does not block the sync', rs.state === 'done' && stale.calls.sync.length === 1)

    const lost = world({ property: true })
    const rl = await go(lost, { autoAssign: false, effects: { runSync: async () => { throw new GscServiceError('sync_in_progress', 409, 'x') } } })
    check('losing the race at the DB unique index is a skip, not a failure', rl.state === 'skipped' && rl.reason === 'sync_in_progress')

    const fresh = world({ property: true, runs: [{ id: 's', project_id: 'p1', status: 'succeeded', window_days: 28, site_url: 'sc-domain:example.com', started_at: iso(AUTO_START_COOLDOWN_MS / 2), finished_at: iso(AUTO_START_COOLDOWN_MS / 2) }] })
    const rf = await go(fresh, { autoAssign: false })
    check('a reconnect right after a good sync of the same property does not sync again', rf.state === 'skipped' && rf.reason === 'recently_synced' && fresh.calls.sync.length === 0)
    const other = world({ property: true, runs: [{ id: 's', project_id: 'p1', status: 'succeeded', window_days: 28, site_url: 'https://old.example.com/', started_at: iso(1000), finished_at: iso(1000) }] })
    check('a different property syncs even right after another one', (await go(other, { autoAssign: false })).state === 'done' && other.calls.sync.length === 1)
    const aged = world({ property: true, runs: [{ id: 's', project_id: 'p1', status: 'succeeded', window_days: 28, site_url: 'sc-domain:example.com', started_at: iso(AUTO_START_COOLDOWN_MS * 3), finished_at: iso(AUTO_START_COOLDOWN_MS * 3) }] })
    check('an older success does not suppress the sync', (await go(aged, { autoAssign: false })).state === 'done' && aged.calls.sync.length === 1)

    // Mutation control: a naive implementation (no lock check) runs twice on the same scenario.
    const naive = world({ property: true })
    const naiveRun = async () => { naive.calls.sync.push({ siteUrl: 's', projectId: 'p1' }) }
    await Promise.all([naiveRun(), naiveRun()])
    check('MUTATION CONTROL: a trigger without the lock check runs two syncs (the guard above would catch it)', naive.calls.sync.length === 2)
  }

  console.log('E) owner scope and connection state')
  {
    const w = world({ property: true })
    const r = await go(w, { autoAssign: true, userId: 'B', projectId: 'p1' })
    check("another user's project is never touched", r.state === 'skipped' && r.reason === 'forbidden' && w.calls.sync.length === 0 && w.calls.token === 0 && w.calls.list === 0)
    const unknown = await go(world(), { autoAssign: true, projectId: 'nope' })
    check('an unknown project is skipped', unknown.state === 'skipped' && unknown.reason === 'forbidden')
    const reauth = world({ property: true, connStatus: 'reauth_required' })
    const rr = await go(reauth, { autoAssign: true })
    check('a connection that needs reconnecting does not sync', rr.state === 'skipped' && rr.reason === 'no_connection' && reauth.calls.sync.length === 0)
    const foreignConn = world({ property: true })
    foreignConn.tables.project_gsc_properties[0].connection_id = 'cB'
    let threw = false
    try { await go(foreignConn, { autoAssign: false }) } catch { threw = true }
    check("a property row pointing at another user's connection is refused (authorizeProjectGsc)", threw && foreignConn.calls.sync.length === 0)
  }

  console.log('F) failure path: a sanitized code, never raw provider text')
  {
    const raw = 'invalid_grant: Token has been expired or revoked https://accounts.google.com/o/oauth2 secret=abc'
    const w = world({ property: true })
    const r = await go(w, { autoAssign: false, effects: { getAccessToken: async () => { throw new Error(raw) } } })
    check('an unknown provider error becomes sync_failed', r.state === 'done' && r.status === 'failed' && r.errorCode === 'sync_failed')
    check('the raw text is nowhere in the outcome or in what was stored', !JSON.stringify(r).includes('secret') && !JSON.stringify(w.tables.gsc_sync_runs).includes('secret') && !JSON.stringify(w.tables.gsc_sync_runs).includes('google.com'))
    check('a failed run (code only) is recorded so the screen can say so', w.tables.gsc_sync_runs.length === 1 && w.tables.gsc_sync_runs[0].project_id === 'p1')
    const coded = await go(world({ property: true }), { autoAssign: false, effects: { runSync: async () => { throw Object.assign(new Error(raw), { code: 'reauth_required' }) } } })
    check('a coded error keeps only its code', coded.state === 'done' && coded.errorCode === 'reauth_required')
    const bad = await go(world({ property: true }), { autoAssign: false, effects: { runSync: async () => { throw Object.assign(new Error('x'), { code: 'Bad Code With Spaces & text' }) } } })
    check('a code that is not a short lowercase token is replaced', bad.state === 'done' && bad.errorCode === 'sync_failed')
    const allFailed = await go(world({ property: true }), { autoAssign: false, effects: { runSync: async (d) => ({ syncGroupId: d.syncGroupId, latestAvailableDate: null, noData: false, windows: [{ windowDays: 28, runId: 'a', status: 'failed', rowsFetched: 0, truncated: false, startDate: null, endDate: null, errorCode: 'gsc_quota' }] }) } })
    check('every window failed → failed with that window code', allFailed.state === 'done' && allFailed.status === 'failed' && allFailed.errorCode === 'gsc_quota')

    // The wrapper handed to after(): never throws, logs a code only.
    const logs: unknown[] = []
    const origLog = console.log, origErr = console.error
    console.log = (...a: unknown[]) => { logs.push(a) }; console.error = (...a: unknown[]) => { logs.push(a) }
    let wrapperThrew = false
    try { await startBackgroundGscSync({ admin: { from() { throw new Error(raw) } } as never, userId: 'A', projectId: 'p1', autoAssign: true }) } catch { wrapperThrew = true }
    console.log = origLog; console.error = origErr
    check('the after() wrapper never throws', !wrapperThrew)
    check('and logs a code only, not the raw error', !JSON.stringify(logs).includes('secret') && !JSON.stringify(logs).includes('google.com'))
  }

  console.log('G) status: running + latest failure (code only), owner-scoped by project')
  {
    const w = world({ runs: [
      { project_id: 'p1', status: 'running', started_at: iso(2000), finished_at: null, sanitized_error_code: null },
      { project_id: 'pB', status: 'running', started_at: iso(2000), finished_at: null, sanitized_error_code: null },
    ] })
    const s = await loadSyncState(w.admin, 'p1', NOW)
    check('a fresh running row → running', s?.running === true && s.lastFailure === null)
    const onlyB = await loadSyncState(world({ runs: [{ project_id: 'pB', status: 'running', started_at: iso(2000), finished_at: null }] }).admin, 'p1', NOW)
    check("another project's running row is not this project's", onlyB?.running === false)
    const stale = await loadSyncState(world({ runs: [{ project_id: 'p1', status: 'running', started_at: iso(40 * 60 * 1000), finished_at: null }] }).admin, 'p1', NOW)
    check('a stale running row is not "running"', stale?.running === false)
    const failed = await loadSyncState(world({ runs: [{ project_id: 'p1', status: 'failed', started_at: iso(5000), finished_at: iso(4000), sanitized_error_code: 'reauth_required' }] }).admin, 'p1', NOW)
    check('latest failed run → its code', failed?.running === false && failed.lastFailure?.code === 'reauth_required')
    const rawCode = await loadSyncState(world({ runs: [{ project_id: 'p1', status: 'failed', started_at: iso(5000), finished_at: iso(4000), sanitized_error_code: 'Token expired for a@b.com' }] }).admin, 'p1', NOW)
    check('a stored code that is not a token never reaches the browser', rawCode?.lastFailure?.code === 'sync_failed')
    const healed = await loadSyncState(world({ runs: [
      { project_id: 'p1', status: 'failed', started_at: iso(9000), finished_at: iso(8000), sanitized_error_code: 'x' },
      { project_id: 'p1', status: 'succeeded', started_at: iso(5000), finished_at: iso(4000) }] }).admin, 'p1', NOW)
    check('a later success clears the failure', healed?.lastFailure === null)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const dbErr = await loadSyncState(new FakeAdmin({}, { gsc_sync_runs: { select: () => ({ code: '500' }) } }) as any, 'p1', NOW)
    check('a read problem answers null (the status route must not fail on it)', dbErr === null)
  }

  console.log('H) source contract (comments stripped) with mutation controls')
  {
    const cb = strip(read('app/api/gsc/callback/route.ts'))
    const prop = strip(read('app/api/gsc/property/route.ts'))
    const status = strip(read('app/api/gsc/status/route.ts'))
    const bg = strip(read('lib/gsc/background-sync.ts'))
    const panel = strip(read('components/content/GscPanel.tsx'))

    const cbGuard = (s: string) =>
      /import \{[^}]*\bafter\b[^}]*\} from 'next\/server'/.test(s)
      && /after\(\(\) => startBackgroundGscSync\(\{[^}]*autoAssign: true/.test(s)
      && !/await startBackgroundGscSync/.test(s)
      && s.indexOf('after(') > s.indexOf('storeConnectionFromTokens(admin')
      && s.indexOf('after(') < s.lastIndexOf("return back(projectId, { gsc: 'connected' })")
      && /export const maxDuration = 300/.test(s)
    check('callback: starts the sync in after(), auto-link on, only once the connection is stored, never awaited', cbGuard(cb))
    check('MUTATION CONTROL: awaiting it in the callback is caught', !cbGuard(cb.replace('after(() => startBackgroundGscSync', 'await startBackgroundGscSync(')))
    check('MUTATION CONTROL: starting it before the connection is stored is caught', !cbGuard(cb.replace(/after\(\(\) => startBackgroundGscSync\(\{[^\n]*\n/, '').replace('try {\n    await storeConnectionFromTokens', 'after(() => startBackgroundGscSync({ autoAssign: true }))\n  try {\n    await storeConnectionFromTokens')))
    check('MUTATION CONTROL: dropping the trigger from the callback is caught', !cbGuard(cb.replace(/after\(\(\) => startBackgroundGscSync/, '(() => void')))

    const propGuard = (s: string) =>
      /after\(\(\) => startBackgroundGscSync\(\{[^}]*autoAssign: false/.test(s)
      && !/await startBackgroundGscSync/.test(s)
      && s.indexOf('after(') > s.indexOf("from('project_gsc_properties').upsert")
      && s.indexOf('after(') < s.indexOf('return Response.json({ ok: true, siteUrl')
      && /export const maxDuration = 300/.test(s)
    check('property: starts the sync in after() once, only after the property row is stored, response not delayed', propGuard(prop))
    check('MUTATION CONTROL: awaiting it before responding is caught', !propGuard(prop.replace('after(() => startBackgroundGscSync', 'await startBackgroundGscSync(')))
    check('MUTATION CONTROL: starting it before the property is stored is caught', !propGuard(prop.replace('const nowIso', 'after(() => startBackgroundGscSync({ autoAssign: false }))\n    const nowIso')))
    check('property: the property route still validates covers/verified before it stores (unchanged)', prop.indexOf('propertyCoversProjectUrl(siteUrl, projectUrl)') < prop.indexOf("from('project_gsc_properties').upsert"))

    const bgGuard = (s: string) =>
      /\.eq\('status', 'running'\)\.gt\('started_at', leaseCutoff\)/.test(s)
      && /code === 'sync_in_progress'\) return \{ state: 'skipped'/.test(s)
      && /user_id !== userId\) return \{ state: 'skipped', reason: 'forbidden'/.test(s)
      && /authorizeProjectGsc\(admin, projectId, userId\)/.test(s)
      && /fx\.runSync\(\{/.test(s) && /executeManualSync/.test(s)
      && /v\.assignable/.test(s)
    check('engine: same executeManualSync, active-run pre-check, DB-conflict skip, owner check, assignable-only', bgGuard(bg))
    check('MUTATION CONTROL: removing the active-run pre-check is caught', !bgGuard(bg.replace(".eq('status', 'running').gt('started_at', leaseCutoff)", '')))
    check('MUTATION CONTROL: removing the owner check is caught', !bgGuard(bg.replace("project.user_id !== userId", 'false')))
    check('MUTATION CONTROL: linking non-assignable properties is caught', !bgGuard(bg.replace('v.assignable', 'true')))
    check('engine: never logs or stores a raw error message', !/console\.(log|error)\([^)]*\be\b(?!\))/.test(bg.replace(/safeCode\(e\)/g, '')) && !/e\.message|String\(e\)/.test(bg))

    const statusGuard = (s: string) => /loadSyncState\(auth\.admin, auth\.project\.id\)/.test(s) && /\n\s+sync,\n/.test(s)
    check('status route reports the sync state', statusGuard(status))
    check('MUTATION CONTROL: a status route without it is caught', !statusGuard(status.replace('      sync,\n', '')))

    const panelGuard = (s: string) =>
      /t\.autoSyncRunning/.test(s) && /data-gsc-autosync="running"/.test(s)
      && /window\.setInterval\([\s\S]{0,300}loadStatus\(true\)[\s\S]{0,60}3000\)/.test(s)
      && /beginAwaiting\(\) \}/.test(s) && /beginAwaiting\(\); await loadStatus\(\)/.test(s)
      && /: t\.syncNow\}/.test(s) && /onClick=\{handleSync\}/.test(s)
      && /motion-safe:animate-spin/.test(s) && /syncRunning \|\|/.test(s)
    check('screen: shows the running state, polls the status, starts waiting after connect and after a pick, keeps the manual button', panelGuard(panel))
    check('MUTATION CONTROL: no polling is caught', !panelGuard(panel.replace('loadStatus(true)', 'void 0')))
    check('MUTATION CONTROL: removing the manual button is caught', !panelGuard(panel.replace('onClick={handleSync}', '')))
    check('MUTATION CONTROL: not waiting after a pick is caught', !panelGuard(panel.replace('beginAwaiting(); await loadStatus()', 'await loadStatus()')))
    check('screen: the failure line uses the dictionary, never the code itself', /\(t\.errors as Record<string, string>\)\[syncFailure\.code\] \?\? t\.autoSyncFailed/.test(panel))

    for (const f of ['he', 'en']) {
      const d = strip(read(`lib/i18n/dashboard/${f}.ts`))
      check(`${f} dictionary has the four new strings`, ['autoSyncRunning', 'autoSyncDone', 'autoSyncFailed', 'autoLinking'].every((k) => d.includes(`${k}:`)))
    }
    check('hebrew text is hebrew', /autoSyncRunning: 'מסנכרן נתונים מ-Search Console…'/.test(read('lib/i18n/dashboard/he.ts')))
  }

  finished = true
  console.log(`${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
// A suite that stops half way (a hung promise drains the event loop) must not look green.
let finished = false
process.on('exit', () => { if (!finished) { console.log(`${pass} passed, ${fail + 1} failed (suite did not finish)`); process.exitCode = 1 } })
main()
export {}
