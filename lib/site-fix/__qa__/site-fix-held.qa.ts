/**
 * Site health, one fix per place (review P1-5, P1-6):
 *
 *   M) MAPPING. A job in the queue maps back to its finding row (./job-match.ts): applied or sent
 *      reads "fixed", pending or waiting for a manual update reads "in the queue", failed,
 *      cancelled or undone offers the fix again. Broken links match on the page AND the dead link,
 *      an orphan on the forgotten page, the rest on the page.
 *   R) THE ROW. FindingCard, rendered with the queue live: a fixed row shows "תוקן", a queued row
 *      "בתור לתיקון", and neither offers "תקנו לי"; this browser's memory does not override the server.
 *   D) THE SERVER. Approving a fix that is already applied, sent, pending or waiting for a manual
 *      update is refused (409 already_fixed): no second job, nothing sent to the plugin twice.
 *      Retrying a failed job while another job holds the same place is refused too.
 *   K) THE KEY. A plugin pairing whose key cannot be read is never "connected": the screen gets one
 *      state ("connect again"), every type waits for a manual update, and no row offers
 *      "install the plugin".
 *   L) LEGACY REPORTS. A report kept from before the fix queue (no `fixType` on its findings) still
 *      gets its fix buttons: the screen takes the type from the scan's own rules.
 *
 * Every guard has a MUTATION CONTROL (a broken copy must fail it).
 * Run: npx tsx lib/site-fix/__qa__/site-fix-held.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { createElement } from 'react'
import { renderToStaticMarkup } from 'react-dom/server'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import * as API from '../api'
import * as CHANNEL from '../channel'
import * as MATCH from '../job-match'
import { FIX_TYPES, type FixJobView } from '../types'
import { FIX_TYPE } from '../../site-health/rules'
import { stripView } from '../../../components/site-health/AutoFixStrip'
import FindingCard from '../../../components/site-health/FindingCard'
import { getDashboardDictionary } from '../../i18n/dashboard/getDashboardDictionary'
import type { Finding } from '../../site-health/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

/** A copy of one module with one change, its imports pointed back at the repo. */
function mutant<T>(rel: string, from: string, to: string): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-held-'))
  try {
    const here = join(ROOT, rel, '..')
    const body = src.split(from).join(to)
      .replace(/from '@\/([^']+)'/g, (_m, p) => `from '${join(ROOT, p)}'`)
      .replace(/from '\.\/([^']+)'/g, (_m, p) => `from '${join(here, p)}'`)
    const file = join(dir, rel.split('/').pop()!)
    writeFileSync(file, body)
    return { mod: require(file) as T, found }
  } finally {
    rmSync(dir, { recursive: true, force: true })
  }
}

const U = '11111111-1111-4111-8111-111111111111'
const P = 'a1111111-2222-4333-8444-555555555555'
const SITE = 'https://shop.example.org'
let idN = 0
const newId = () => `${String(++idN).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(idN).padStart(12, '0')}`

const link = (status: 'connected' | 'disconnected' | 'pending') => ({
  project_id: P, user_id: U, site_url: SITE, key_id: 'gtk_0123456789abcdef', secret_encrypted: 'enc:secret', secret_hint: '••••abcd',
  status, plugin_version: '2.0.0', seo_plugin: 'yoast', last_seen_at: null, last_error_code: null,
})
type Row = Record<string, unknown>
const rows = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [{ id: P, user_id: U, target_domain: 'shop.example.org', business_name: 'Boot Shop', name: 'Boots' }],
  project_profiles: [{ project_id: P, user_id: U, detected_platform: 'wordpress' }],
  site_fix_plugin_links: [link('connected')],
  site_fix_jobs: [] as Row[],
  site_fix_audit: [] as Row[],
  ...over,
})
function fakePlugin() {
  const calls: string[] = []
  const post = (async (_site: string, route: string) => {
    calls.push(route)
    if (route === '/fix') return { status: 200, body: JSON.stringify({ ok: true, status: 'applied', fix_id: 'f1', post_id: 11, previous: 'Old title' }) }
    if (route === '/status') return { status: 200, body: JSON.stringify({ ok: true, version: '2.0.0', seo_plugin: 'yoast', fix_types: [...FIX_TYPES] }) }
    return { status: 404, body: '{}' }
  }) as unknown as NonNullable<API.FixesDeps['pluginPost']>
  return { post, calls }
}
function depsFor(admin: FakeAdmin, over: Partial<API.FixesDeps> = {}): API.FixesDeps {
  return {
    userId: U, ip: '203.0.113.9', admin: admin as never,
    decrypt: (s) => (s === 'enc:secret' ? 'A'.repeat(43) : 'app-pass'),
    encrypt: (s) => `enc:${s.length}`,
    wp: {} as API.FixesDeps['wp'], readLive: async () => null, newId, ...over,
  }
}
const approveTitle = (page = `${SITE}/about/`) => ({
  projectId: P, action: 'approve', approved: true, kind: 'title_long', pageUrl: page,
  fix: { type: 'seo_title', value: 'Handmade boots | Boot Shop' }, expected: 'Old title', before: 'Old title',
})
const approveBroken = (href: string) => ({
  projectId: P, action: 'approve', approved: true, kind: 'broken_links', pageUrl: `${SITE}/blog/`,
  fix: { type: 'broken_link', href, replacement: null }, expected: null, before: null,
})

type ApiMod = typeof API

async function dedupeRun(api: ApiMod) {
  const admin = new FakeAdmin(rows())
  const plugin = fakePlugin()
  const deps = depsFor(admin, { pluginPost: plugin.post })
  const first = await api.handleFixesPost(approveTitle(), deps)
  const again = await api.handleFixesPost(approveTitle(`${SITE}/about`), deps)
  const jobs = admin.tables.site_fix_jobs ?? []
  const fixCalls = plugin.calls.filter((c) => c === '/fix').length
  return { first, again, jobs: jobs.length, fixCalls }
}

async function main() {
  console.log('Site health — one fix per place, the plugin key, legacy reports\n')

  // ── M) mapping ────────────────────────────────────────────────────────────
  console.log('M) a job maps back to its finding row')
  const job = (over: Partial<FixJobView>): FixJobView => ({
    id: 'j', type: 'seo_title', findingKind: 'title_long', pageUrl: `${SITE}/about/`, status: 'applied', channel: 'plugin',
    before: null, after: null, errorCode: null, approvedAt: '2026-09-01T00:00:00Z', appliedAt: null, revertedAt: null, subject: null,
    canUndo: false, canCancel: false, canRetry: false, ...over,
  })
  const titleRow = MATCH.rowTarget('seo_title', { url: 'https://www.shop.example.org/about' })
  check('M1: applied reads "fixed" (www., trailing slash ignored)', MATCH.rowStateFrom([job({})], titleRow) === 'applied')
  check('M2: sent (webhook) reads "fixed"', MATCH.rowStateFrom([job({ status: 'sent' })], titleRow) === 'applied')
  check('M3: pending reads "in the queue"', MATCH.rowStateFrom([job({ status: 'pending' })], titleRow) === 'queued')
  check('M4: waiting for a manual update reads "in the queue"', MATCH.rowStateFrom([job({ status: 'manual' })], titleRow) === 'queued')
  check('M5: failed, cancelled and undone offer the fix again',
    (['failed', 'cancelled', 'reverted'] as const).every((s) => MATCH.rowStateFrom([job({ status: s })], titleRow) === null))
  check('M6: the newest job decides (undone after applied → offered again)',
    MATCH.rowStateFrom([job({ status: 'reverted' }), job({ status: 'applied' })], titleRow) === null)
  check('M7: another fix type on the same page does not count',
    MATCH.rowStateFrom([job({ type: 'meta_description' })], titleRow) === null)
  check('M8: another page does not count', MATCH.rowStateFrom([job({ pageUrl: `${SITE}/contact/` })], titleRow) === null)
  const deadA = MATCH.rowTarget('broken_link', { url: `${SITE}/old-a`, from: `${SITE}/blog/` })
  const deadB = MATCH.rowTarget('broken_link', { url: `${SITE}/old-b`, from: `${SITE}/blog/` })
  const brokenJob = job({ type: 'broken_link', findingKind: 'broken_links', pageUrl: `${SITE}/blog/`, subject: `${SITE}/old-a` })
  check('M9: a broken-link fix covers that dead link on that page only',
    MATCH.rowStateFrom([brokenJob], deadA) === 'applied' && MATCH.rowStateFrom([brokenJob], deadB) === null)
  const orphan = MATCH.rowTarget('internal_link', { url: `${SITE}/services/boots/` })
  const linkJob = job({ type: 'internal_link', findingKind: 'orphan_page', pageUrl: `${SITE}/`, subject: `${SITE}/services/boots` })
  check('M10: an internal link covers the forgotten page, whichever page gives it', MATCH.rowStateFrom([linkJob], orphan) === 'applied')
  check('M11: the job view carries the subject from the stored payload',
    API.jobView({ id: 'x', user_id: U, project_id: P, fix_type: 'broken_link', finding_kind: 'broken_links', page_url: `${SITE}/blog/`,
      payload: { href: `${SITE}/old-a`, replacement: null }, before_value: null, after_summary: null, channel: 'plugin', status: 'applied',
      error_code: null, undo: null, remote_ref: null, approved_by: U, approved_at: 'x', approved_ip: null, applied_at: null, reverted_at: null,
      created_at: 'x', updated_at: 'x' }, { available: true, readOnly: false, channelFor: {}, plugin: { state: 'none' }, appPassword: false, webhook: false, wordpress: true })
      .subject === `${SITE}/old-a`)
  {
    const m = mutant<typeof MATCH>('lib/site-fix/job-match.ts', "if (j.status === 'pending' || j.status === 'manual') return 'queued'", "if (j.status === 'pending') return 'queued'")
    check('MUTATION (manual update not held): M4 sees it', m.found && m.mod!.rowStateFrom([job({ status: 'manual' })], titleRow) !== 'queued')
    const m2 = mutant<typeof MATCH>('lib/site-fix/job-match.ts', "if (a.type === 'broken_link') return urlKey(a.subject) === urlKey(b.subject)", '')
    check('MUTATION (broken link matched on the page only): M9 sees it', m2.found && m2.mod!.rowStateFrom([brokenJob], deadB) !== null)
  }

  // ── R) the row ────────────────────────────────────────────────────────────
  console.log('\nR) the finding row, rendered with the queue live')
  const he = getDashboardDictionary('he').siteHealth
  const finding: Finding = {
    id: 'title_long', severity: 'important', total: 3, field: 'title', guide: 'title', fixable: true, fixType: 'seo_title',
    pages: [
      { url: `${SITE}/about/`, path: '/about/', kind: 'other', value: null, measure: 72, fixable: true, adminUrl: null },
      { url: `${SITE}/boots/`, path: '/boots/', kind: 'other', value: null, measure: 70, fixable: true, adminUrl: null },
      { url: `${SITE}/contact/`, path: '/contact/', kind: 'other', value: null, measure: 71, fixable: true, adminUrl: null },
    ],
  } as unknown as Finding
  const jobs = [job({}), job({ pageUrl: `${SITE}/boots/`, status: 'pending' })]
  const stateFor = (f: Finding, p: Finding['pages'][number]) => MATCH.rowStateFrom(jobs, MATCH.rowTarget(f.fixType!, p))
  const render = (Card: typeof FindingCard, fixed: Set<string>) => renderToStaticMarkup(createElement(Card, {
    finding, copy: he, platform: 'wordpress', fixed, onFix: () => {}, fixModeFor: () => 'fix' as const, jobStateFor: stateFor, onInstall: () => {},
  }))
  const html = render(FindingCard, new Set())
  const rowsOf = (h: string) => [...h.matchAll(/data-page-row="([a-z]+)"/g)].map((m) => m[1])
  check('R1: applied → "תוקן", queued → "בתור לתיקון", untouched → "תקנו לי"',
    JSON.stringify(rowsOf(html)) === JSON.stringify(['fixed', 'queued', 'fixable']) && html.includes(he.fixedBadge) && html.includes(he.queuedBadge),
    rowsOf(html).join(','))
  check('R2: exactly one "תקנו לי" button (the untouched page)', (html.match(/data-fix-button=/g) ?? []).length === 1)
  const stale = render(FindingCard, new Set([`title_long|${SITE}/contact/`]))
  check('R3: with the queue live, this browser\'s memory does not mark a page fixed', rowsOf(stale)[2] === 'fixable', rowsOf(stale).join(','))
  check('R4: the new badge is in both dictionaries', !!getDashboardDictionary('en').siteHealth.queuedBadge && he.queuedBadge === 'בתור לתיקון')
  {
    const src = strip(read('components/site-health/FindingCard.tsx'))
    check('R5 (source): the row reads the server state when the queue is live', /jobStateFor \? held === 'applied'/.test(src))
    const cut = src.replace(/jobStateFor \? held === 'applied' : /, '')
    check('MUTATION (row ignores the server state): R5 sees it', !/jobStateFor \? held === 'applied'/.test(cut))
    const scr = strip(read('components/site-health/SiteHealthScreen.tsx'))
    check('R6 (source): the screen passes the queue state to every finding card, and a held page is not counted as fixable',
      /jobStateFor=\{queueLive \? jobStateFor : null\}/.test(scr) && /fixModeFor\(f, p\) === 'fix' && !jobStateFor\(f, p\)/.test(scr))
  }

  // ── D) the server ─────────────────────────────────────────────────────────
  console.log('\nD) the server never writes the same fix twice')
  const d = await dedupeRun(API)
  check('D1: the first approval is applied', d.first.status === 200 && (d.first.body.job as FixJobView)?.status === 'applied')
  check('D2: approving it again (same page, other spelling) → 409 already_fixed', d.again.status === 409 && d.again.body.code === 'already_fixed', JSON.stringify(d.again.body))
  check('D3: one job on record, the plugin written once', d.jobs === 1 && d.fixCalls === 1, `jobs=${d.jobs} fix=${d.fixCalls}`)
  {
    const admin = new FakeAdmin(rows())
    const deps = depsFor(admin, { pluginPost: fakePlugin().post })
    await API.handleFixesPost(approveTitle(), deps)
    const other = await API.handleFixesPost(approveTitle(`${SITE}/contact/`), deps)
    check('D4: the same fix on another page is accepted', other.status === 200)
    const a = await API.handleFixesPost(approveBroken(`${SITE}/old-a`), deps)
    const b = await API.handleFixesPost(approveBroken(`${SITE}/old-b`), deps)
    const a2 = await API.handleFixesPost(approveBroken(`${SITE}/old-a`), deps)
    check('D5: two dead links on one page are two fixes; the first again is refused',
      a.status === 200 && b.status === 200 && a2.status === 409 && a2.body.code === 'already_fixed')
  }
  {
    // A pending job (another tab) and a manual-update job hold their place too.
    for (const status of ['pending', 'manual', 'sent'] as const) {
      const admin = new FakeAdmin(rows({ site_fix_jobs: [{ id: 'c0000000-0000-4000-8000-000000000001', user_id: U, project_id: P, fix_type: 'seo_title', finding_kind: 'title_long', page_url: `${SITE}/about/`, payload: { value: 'x' }, before_value: null, after_summary: 'x', channel: 'plugin', status, error_code: null, undo: null, remote_ref: null, approved_by: U, approved_at: '2026-09-01T00:00:00Z', approved_ip: null, applied_at: null, reverted_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }] }))
      const r = await API.handleFixesPost(approveTitle(), depsFor(admin, { pluginPost: fakePlugin().post }))
      check(`D6: a ${status} job holds its place`, r.status === 409 && r.body.code === 'already_fixed')
    }
    // Another owner's job under the same project id never blocks (owner filter).
    const theirs = new FakeAdmin(rows({ site_fix_jobs: [{ id: 'c0000000-0000-4000-8000-000000000002', user_id: '22222222-2222-4222-8222-222222222222', project_id: P, fix_type: 'seo_title', finding_kind: 'title_long', page_url: `${SITE}/about/`, payload: { value: 'x' }, before_value: null, after_summary: 'x', channel: 'plugin', status: 'applied', error_code: null, undo: null, remote_ref: null, approved_by: U, approved_at: '2026-09-01T00:00:00Z', approved_ip: null, applied_at: null, reverted_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }] }))
    const r = await API.handleFixesPost(approveTitle(), depsFor(theirs, { pluginPost: fakePlugin().post }))
    check('D7: another owner\'s job never blocks (the read is filtered by owner)', r.status === 200)
    // A failed job does not block a new approval, but retrying it while the new one holds the place is refused.
    const failedId = 'c0000000-0000-4000-8000-000000000003'
    const admin = new FakeAdmin(rows({ site_fix_jobs: [{ id: failedId, user_id: U, project_id: P, fix_type: 'seo_title', finding_kind: 'title_long', page_url: `${SITE}/about/`, payload: { value: 'x' }, before_value: null, after_summary: 'x', channel: 'plugin', status: 'failed', error_code: 'plugin_rejected', undo: null, remote_ref: null, approved_by: U, approved_at: '2026-09-01T00:00:00Z', approved_ip: null, applied_at: null, reverted_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }] }))
    const deps = depsFor(admin, { pluginPost: fakePlugin().post })
    const fresh = await API.handleFixesPost(approveTitle(), deps)
    const retry = await API.handleFixesPost({ projectId: P, action: 'retry', jobId: failedId }, deps)
    check('D8: a failed job does not block a new approval; retrying it then is refused', fresh.status === 200 && retry.status === 409 && retry.body.code === 'already_fixed', `${fresh.status} ${retry.status}`)
    check('D9: the refusal is in plain words in both dictionaries',
      !!getDashboardDictionary('he').siteHealth.autofix.errors.already_fixed && !!getDashboardDictionary('en').siteHealth.autofix.errors.already_fixed)
  }
  {
    const m = mutant<ApiMod>('lib/site-fix/api.ts', "return held.some((r) => r.id !== self && sameTarget(", "return false && held.some((r) => r.id !== self && sameTarget(")
    const md = m.found && m.mod ? await dedupeRun(m.mod) : null
    check('MUTATION (no server check): D2/D3 see the double write', !!md && md.again.status === 200 && md.jobs === 2 && md.fixCalls === 2, md ? `${md.again.status} jobs=${md.jobs}` : 'not found')
  }

  // ── K) the plugin key ─────────────────────────────────────────────────────
  console.log('\nK) a pairing whose key cannot be read')
  const unreadable = (s: string) => { if (s === 'enc:secret') throw new Error('bad key'); return 'app-pass' }
  const capsOf = async (api: ApiMod, status: 'connected' | 'disconnected') => {
    const admin = new FakeAdmin(rows({ site_fix_plugin_links: [link(status)] }))
    const r = await api.handleFixesGet(P, depsFor(admin, { decrypt: unreadable }))
    return r.body.capabilities as import('../types').FixCapabilities
  }
  const caps = await capsOf(API, 'connected')
  check('K1: never "connected": one state, connect again', caps.plugin.state === 'disconnected' && caps.plugin.rekey === true, JSON.stringify(caps.plugin))
  check('K2: no row offers "install the plugin"; every type waits for a manual update',
    FIX_TYPES.every((t) => caps.channelFor[t] === 'manual'), JSON.stringify(caps.channelFor))
  check('K3: the strip shows "connect again" (not "connected", not "check")', stripView(caps) === 'rekey')
  const dropped = await capsOf(API, 'disconnected')
  check('K4: a dropped pairing with an unreadable key reads the same', dropped.plugin.state === 'disconnected' && dropped.plugin.rekey === true)
  {
    const okAdmin = new FakeAdmin(rows())
    const ok = (await API.handleFixesGet(P, depsFor(okAdmin))).body.capabilities as import('../types').FixCapabilities
    check('K5: a readable key stays connected, through the plugin', ok.plugin.state === 'connected' && ok.channelFor.seo_title === 'plugin' && stripView(ok) === 'connected')
  }
  check('K6: the new words are in both dictionaries',
    !!getDashboardDictionary('he').siteHealth.autofix.connection.rekey.title && !!getDashboardDictionary('en').siteHealth.autofix.connection.reconnect
    && !!getDashboardDictionary('he').siteHealth.autofix.plugin.rekeyNotice)
  {
    const src = strip(read('components/site-health/PluginInstallModal.tsx'))
    check('K7 (source): the modal offers "check" for a rekey only after a new code was made', /\(!rekey \|\| !!code\)/.test(src))
  }
  {
    const m = mutant<typeof CHANNEL>('lib/site-fix/channel.ts', 'pluginStateOf(ctx.plugin, !ctx.plugin || !!ctx.pluginLink)', 'pluginStateOf(ctx.plugin, true)')
    const ctx = { shopify: false, wordpressDetected: true, creds: null, plugin: link('connected') as never, pluginLink: null, webhook: null, siteUrls: [SITE] }
    const mc = m.found && m.mod ? m.mod.resolveCapabilities(ctx, true) : null
    check('MUTATION (unreadable key reads connected): K1/K2 see "connected" + "install"',
      !!mc && mc.plugin.state === 'connected' && mc.channelFor.seo_title === 'needs_plugin')
    const real = CHANNEL.resolveCapabilities(ctx, true)
    check('K8: the same context, unmutated, is one clear state', real.plugin.state === 'disconnected' && real.channelFor.seo_title === 'manual')
  }

  // ── L) legacy reports ─────────────────────────────────────────────────────
  console.log('\nL) a report saved before the fix queue')
  const KINDS = ['title_missing', 'title_long', 'title_short', 'title_duplicate', 'description_missing', 'description_length',
    'description_duplicate', 'images_alt', 'orphan_page', 'broken_links', 'canonical_missing', 'schema_missing', 'faq_missing'] as const
  check('L1: every kind the server accepts has a fix type in the scan rules', KINDS.every((k) => !!FIX_TYPE[k]))
  const scr = strip(read('components/site-health/SiteHealthScreen.tsx'))
  const derive = /\(f\.fixType \? f : \{ \.\.\.f, fixType: FIX_TYPE\[f\.id\] \?\? null \}\)/
  check('L2 (source): findings without a fix type take it from the rules (no rescan needed)', derive.test(scr))
  check('L3 (source): every later use reads the derived list, not report.findings', /visible\.map\(\(f, i\)/.test(scr) && /const visible = useMemo\(\(\) => \{\s*const list = findings/.test(scr))
  check('MUTATION (derivation removed): L2 sees it', !derive.test(scr.replace(derive, 'f')))

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })
export {}
