/**
 * Site health auto-fix, the app side (lib/site-fix): the rules that decide what may be written to a
 * merchant's site, by whom, and how every write is recorded.
 *
 *   W) WHITELIST. `validateFix` is the only way a request becomes a fix: the eleven types, their own
 *      fields only, plain text, addresses on the project's own site, no Product schema. The app's
 *      list, the database CHECK (its latest migration) and the plugin's list are the same eleven names.
 *   S) SIGNING. The TypeScript signer and verifier agree; a tampered body, another route, a stale
 *      time, another key and a replayed nonce are refused.
 *   O) OWNER FILTER. The service role bypasses RLS: every `.from()` in the store and the channel
 *      carries `.eq('user_id', …)` (source), and another owner's rows under the same project id are
 *      never read, changed or used (runtime, FakeAdmin).
 *   Q) THE QUEUE, end to end over FakeAdmin with a fake plugin and a fake webhook receiver:
 *      approval required; approval recorded (who, when, IP, before, after) before anything leaves;
 *      applied through the plugin; connection lost → marked for manual update and the link marked
 *      disconnected; retry once the plugin answers; undo; cancel; webhook → sent (and reverted);
 *      Shopify refused; missing tables → hidden (available: false) and refused.
 *   C) CONTENT (the application-password path): FAQ block escaped and removable exactly, broken
 *      links replaced or unlinked on the site's own host only.
 *   Z) The plugin zip served in the app is built from the PHP in the repo (--check), and the
 *      developer notes' example fix payload has the exact keys the webhook sends.
 *
 * Every guard has a MUTATION CONTROL (a broken copy must fail it).
 * Run: npx tsx lib/site-fix/__qa__/site-fix.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { spawnSync } from 'child_process'
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import * as API from '../api'
import * as STORE from '../store'
import { appendBlock, faqBlockHtml, fixBrokenLink, removeBlock } from '../content'
import { generatePluginKey, signedHeaders, verifyPluginSignature, HEADER_NONCE } from '../plugin-auth'
import { FIX_TYPES } from '../types'
import { buildFixPayload } from '../webhook-fix'
import { EXAMPLE_FIX_PAYLOAD } from '../../../components/content/site-platforms/WebhookDocs'
import * as WL from '../whitelist'

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
  const dir = mkdtempSync(join(tmpdir(), 'site-fix-mutant-'))
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
const OTHER = '22222222-2222-4222-8222-222222222222'
const P = 'a1111111-2222-4333-8444-555555555555'
const SITE = 'https://shop.example.org'
const KEYS = new Set(['shop.example.org'])
let idN = 0
const newId = () => `${String(++idN).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(idN).padStart(12, '0')}`

// ── Fakes ────────────────────────────────────────────────────────────────────

type PluginCall = { route: string; body: Record<string, unknown>; headers: Record<string, string> }
function fakePlugin(mode: { status?: number; body?: Record<string, unknown> } = {}) {
  const calls: PluginCall[] = []
  const post = (async (_site: string, route: string, body: string, opts: { headers?: Record<string, string> }) => {
    calls.push({ route, body: JSON.parse(body) as Record<string, unknown>, headers: opts.headers ?? {} })
    if (mode.status) return { status: mode.status, body: JSON.stringify(mode.body ?? { code: 'gotop_bad_signature' }) }
    if (route === '/fix') return { status: 200, body: JSON.stringify({ ok: true, status: 'applied', fix_id: 'f1', post_id: 11, previous: 'Old title' }) }
    if (route === '/undo') return { status: 200, body: JSON.stringify({ ok: true, status: 'reverted' }) }
    if (route === '/status') return { status: 200, body: JSON.stringify({ ok: true, version: '2.0.0', seo_plugin: 'yoast', fix_types: [...FIX_TYPES] }) }
    return { status: 404, body: '{}' }
  }) as unknown as NonNullable<API.FixesDeps['pluginPost']>
  return { post, calls }
}
function fakeReceiver(status = 200) {
  const sent: { headers: Record<string, string>; body: Record<string, unknown> }[] = []
  return {
    sent,
    deps: {
      resolver: async () => [{ address: '93.184.216.34', family: 4 }],
      transport: async (req: { headers: Record<string, string>; body: string }) => {
        sent.push({ headers: req.headers, body: JSON.parse(req.body) as Record<string, unknown> })
        return { status, location: null, body: '' }
      },
    },
  }
}

const link = (status: 'connected' | 'disconnected' | 'pending', user = U) => ({
  project_id: P, user_id: user, site_url: SITE, key_id: 'gtk_0123456789abcdef', secret_encrypted: 'enc:secret', secret_hint: '••••abcd',
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
const MISSING = { select: () => ({ code: '42P01', message: 'relation "site_fix_jobs" does not exist' }) }
const noWp = {} as API.FixesDeps['wp']

function depsFor(admin: FakeAdmin, over: Partial<API.FixesDeps> = {}): API.FixesDeps {
  return {
    userId: U, ip: '203.0.113.9', admin: admin as never,
    decrypt: (s) => (s === 'enc:secret' ? 'A'.repeat(43) : s === 'enc:hook' ? 'whsec_test' : 'app-pass'),
    encrypt: (s) => `enc:${s.length}`,
    wp: noWp, readLive: async () => null, newId, ...over,
  }
}
const approveTitle = (over: Record<string, unknown> = {}) => ({
  projectId: P, action: 'approve', approved: true, kind: 'title_long', pageUrl: `${SITE}/about/`,
  fix: { type: 'seo_title', value: 'Handmade boots | Boot Shop' }, expected: 'Old title', before: 'Old title', ...over,
})

async function main() {
  console.log('Site health auto-fix — whitelist, signing, owner filter, the queue\n')

  // ── W) the whitelist ──────────────────────────────────────────────────────
  console.log('W) whitelist')
  const page = `${SITE}/about/`
  const good: Record<string, unknown>[] = [
    { type: 'seo_title', value: 'Handmade boots | Boot Shop' },
    { type: 'meta_description', value: 'We make leather boots by hand in Haifa.' },
    { type: 'canonical', value: `${SITE}/about/` },
    { type: 'focus_keyphrase', value: 'leather boots' },
    { type: 'image_alt', images: [{ src: `${SITE}/a.jpg`, alt: 'Red boots' }] },
    { type: 'faq_block', heading: 'Questions', items: [{ q: 'Do you ship abroad?', a: 'Yes, to most countries in Europe.' }] },
    { type: 'schema_jsonld', schema: { '@context': 'https://schema.org', '@type': 'Organization', name: 'Boot Shop' } },
    { type: 'broken_link', href: `${SITE}/old/`, replacement: `${SITE}/new/` },
    { type: 'internal_link', target: `${SITE}/blog/care/`, anchor: 'leather care' },
    { type: 'h1_demote', headings: [{ n: 1, text: 'Our story' }] },
    { type: 'llms_txt', text: '# Boot Shop\n\n> Handmade leather boots from Haifa.\n\n## Pages\n\n- [About](https://www.shop.example.org/about/): who we are\n' },
  ]
  check('W1: each of the eleven fix types is accepted with its own fields', good.length === FIX_TYPES.length && good.every((g) => WL.validateFix(g, page, KEYS).ok))
  const code = (x: unknown, p: unknown = page) => { const r = WL.validateFix(x, p, KEYS); return r.ok ? 'ok' : r.code }
  const refusals: [string, unknown, string][] = [
    ['an unknown type (delete_post)', { type: 'delete_post', value: 'x' }, 'not_allowed'],
    ['a price change', { type: 'product_price', value: '1' }, 'not_allowed'],
    ['an extra field riding along (post_status)', { type: 'seo_title', value: 'Boots', post_status: 'draft' }, 'not_allowed'],
    ['markup in a title', { type: 'seo_title', value: '<script>x</script>' }, 'value_invalid'],
    ['a canonical on another site', { type: 'canonical', value: 'https://evil.example.com/' }, 'off_site'],
    ['a Product schema', { type: 'schema_jsonld', schema: { '@context': 'https://schema.org', '@type': 'Product', name: 'x' } }, 'value_invalid'],
    ['a schema string that closes the script tag', { type: 'schema_jsonld', schema: { '@context': 'https://schema.org', '@type': 'Organization', name: '</script>' } }, 'value_invalid'],
    ['a javascript: image', { type: 'image_alt', images: [{ src: 'javascript:alert(1)', alt: 'x' }] }, 'value_invalid'],
    ['an alt that breaks out of its attribute', { type: 'image_alt', images: [{ src: `${SITE}/a.jpg`, alt: 'a" onerror="x' }] }, 'value_invalid'],
    ['a broken-link replacement off the site', { type: 'broken_link', href: `${SITE}/old/`, replacement: 'https://evil.example.com/' }, 'off_site'],
    ['nine FAQ items', { type: 'faq_block', heading: 'Q', items: Array.from({ length: 9 }, () => ({ q: 'A question?', a: 'An answer long enough.' })) }, 'value_invalid'],
  ]
  for (const [name, fix, want] of refusals) check(`W2: refused — ${name} (${want})`, code(fix) === want, code(fix))
  check('W3: the page written to must be on the project\'s site', code(good[0], 'https://evil.example.com/about/') === 'off_site')
  const dbTypes = (sql: string) => {
    const m = /CONSTRAINT site_fix_jobs_fix_type CHECK \(fix_type IN \(([^)]*)\)\)/.exec(sql)
    return m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]) : []
  }
  const phpTypes = (php: string) => {
    const m = /function gotop_seo_bridge_fix_types\(\)[\s\S]*?array\(([\s\S]*?)\)/.exec(php)
    return m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]) : []
  }
  // The CHECK as the LATEST migration that defines it leaves it (20260929100000 widened it for plugin 2.1.0).
  const MIG = read('supabase/migrations/20260929100000_site_fix_h1_llms.sql')
  const PHP = read('wordpress-plugin/gotop-seo-bridge/includes/fixes.php')
  const same = (a: string[]) => JSON.stringify(a) === JSON.stringify([...FIX_TYPES])
  check('W4: the database CHECK, the plugin and the app hold the same eleven types', same(dbTypes(MIG)) && same(phpTypes(PHP)), `${dbTypes(MIG).join(',')} | ${phpTypes(PHP).join(',')}`)
  check('MUTATION CONTROL: a twelfth type in the database only is caught by W4', !same(dbTypes(MIG.replace("'llms_txt'", "'llms_txt', 'theme_switch'"))))
  check('MUTATION CONTROL: the plugin without h1_demote is caught by W4', !same(phpTypes(PHP.replace("'h1_demote',", ''))))
  {
    const m = mutant<typeof WL>('lib/site-fix/whitelist.ts', 'if (extra.length > 0) return bad(\'not_allowed\')', '')
    const got = m.mod ? m.mod.validateFix({ type: 'seo_title', value: 'Boots', post_status: 'draft' }, page, KEYS) : null
    check('MUTATION CONTROL: a whitelist without the extra-field check lets a field ride along (W2 catches it)', m.found && !!got && got.ok)
    const m2 = mutant<typeof WL>('lib/site-fix/whitelist.ts', "  'ImageObject', 'SearchAction'", "  'Product', 'ImageObject', 'SearchAction'")
    const got2 = m2.mod ? m2.mod.validateFix(refusals[5][1], page, KEYS) : null
    check('MUTATION CONTROL: a schema list that allows Product is caught by W2', m2.found && !!got2 && got2.ok)
  }

  // ── S) signing ────────────────────────────────────────────────────────────
  console.log('\nS) signing')
  const key = generatePluginKey()
  const now = 1_790_000_000_000
  const body = JSON.stringify({ job_id: 'x', type: 'seo_title', value: { value: 'Boots' } })
  const h = signedHeaders(key, '/gotop/v1/fix', body, () => now)
  const keys = (id: string) => (id === key.keyId ? key.secret : null)
  const seen = new Set<string>()
  const v = (over: { body?: string; route?: string; headers?: Record<string, string>; at?: number; keysFn?: typeof keys } = {}, set = seen) =>
    verifyPluginSignature({ method: 'POST', route: over.route ?? '/gotop/v1/fix', headers: over.headers ?? h, body: over.body ?? body }, over.keysFn ?? keys, (over.at ?? now) / 1000, set)
  check('S1: a fresh signed request verifies once', v().ok === true)
  check('S2: the same nonce again is a replay', (v() as { code?: string }).code === 'replay')
  check('S3: a body changed after signing is refused', (v({ body: body.replace('Boots', 'Shoes') }, new Set()) as { code?: string }).code === 'bad_signature')
  check('S4: a signature for /fix does not open /undo', (v({ route: '/gotop/v1/undo' }, new Set()) as { code?: string }).code === 'bad_signature')
  check('S5: a request 20 minutes old is stale', (v({ at: now + 20 * 60_000 }, new Set()) as { code?: string }).code === 'stale')
  check('S6: another key is unknown', (v({ keysFn: () => null }, new Set()) as { code?: string }).code === 'unknown_key')
  const forged = { ...h, [HEADER_NONCE]: 'f'.repeat(32) }
  const set2 = new Set<string>()
  v({ headers: forged }, set2)
  check('S7: a forged request does not burn a nonce (recorded only after the signature verified)', set2.size === 0)
  {
    type Auth = typeof import('../plugin-auth')
    const m = mutant<Auth>('lib/site-fix/plugin-auth.ts', "return ['GOTOP-HMAC-V1', p.method, p.route, p.timestamp, p.nonce, p.keyId, bodyHash].join('\\n')", "return ['GOTOP-HMAC-V1', p.method, p.route, p.timestamp, p.nonce, p.keyId].join('\\n')")
    let caught = false
    if (m.mod) {
      const hh = m.mod.signedHeaders(key, '/gotop/v1/fix', body, () => now)
      caught = m.mod.verifyPluginSignature({ method: 'POST', route: '/gotop/v1/fix', headers: hh, body: body.replace('Boots', 'Shoes') }, keys, now / 1000, new Set()).ok
    }
    check('MUTATION CONTROL: a signature that leaves the body out lets a tampered body in (S3 catches it)', m.found && caught)
    const m2 = mutant<Auth>('lib/site-fix/plugin-auth.ts', "if (seen.has(`${keyId}:${nonce}`)) return { ok: false, code: 'replay' }", '')
    let replayed = false
    if (m2.mod) { const s = new Set<string>(); const req = { method: 'POST', route: '/gotop/v1/fix', headers: h, body }; m2.mod.verifyPluginSignature(req, keys, now / 1000, s); replayed = m2.mod.verifyPluginSignature(req, keys, now / 1000, s).ok }
    check('MUTATION CONTROL: a verifier without the replay check accepts a replay (S2 catches it)', m2.found && replayed)
  }

  // ── O) owner filter ───────────────────────────────────────────────────────
  console.log('\nO) owner filter')
  const ownerFiltered = (src: string) => {
    const s = strip(src)
    const chains = [...s.matchAll(/\.from\('([a-z_]+)'\)([\s\S]*?)(?=\n\s*(?:admin\.from|\]\)|const |if |return |for |\}|export ))/g)]
    // A read, update or delete filters by the owner; an insert writes the owner's id into the row.
    return chains.length > 0 && chains.every((c) => /\.eq\('user_id',/.test(c[2]) || /^\.insert\(\{[\s\S]*user_id: scope\.userId/.test(c[2]))
  }
  const SOURCES = ['lib/site-fix/store.ts', 'lib/site-fix/channel.ts', 'lib/site-fix/api.ts']
  check('O1: every table read or write in the site-fix modules carries the owner filter (source)', SOURCES.every((f) => ownerFiltered(read(f))), SOURCES.filter((f) => !ownerFiltered(read(f))).join(', '))
  check('MUTATION CONTROL: a store read without .eq(\'user_id\') is caught by O1', !ownerFiltered(read('lib/site-fix/store.ts').replace(".eq('project_id', scope.projectId).eq('user_id', scope.userId)\n    .order('created_at'", ".eq('project_id', scope.projectId)\n    .order('created_at'")))
  const otherJob = { id: newId(), project_id: P, user_id: OTHER, fix_type: 'seo_title', finding_kind: 'title_long', page_url: `${SITE}/x/`, payload: { value: 'Theirs' }, before_value: 'x', after_summary: 'Theirs', channel: 'plugin', status: 'applied', error_code: null, undo: { revert: { kind: 'plugin' } }, remote_ref: null, approved_by: OTHER, approved_at: '2026-09-01T00:00:00Z', approved_ip: '198.51.100.1', applied_at: null, reverted_at: null, created_at: '2026-09-01T00:00:00Z', updated_at: '2026-09-01T00:00:00Z' }
  const ownerRuntime = async (S: typeof STORE) => {
    const admin = new FakeAdmin(rows({ site_fix_jobs: [{ ...otherJob }], site_fix_plugin_links: [link('connected', OTHER)] }))
    const scope = { projectId: P, userId: U }
    const listed = await S.listJobs(admin as never, scope)
    const got = await S.getJob(admin as never, scope, otherJob.id)
    await S.updateJob(admin as never, scope, otherJob.id, { status: 'cancelled' })
    const linkRow = await S.readPluginLink(admin as never, scope)
    return listed.length === 0 && got === null && (admin.tables.site_fix_jobs[0] as { status: string }).status === 'applied' && linkRow === null
  }
  check('O2: another owner\'s job and plugin link under the same project id are never listed, read, changed or used', await ownerRuntime(STORE))
  {
    const m = mutant<typeof STORE>('lib/site-fix/store.ts', ".eq('project_id', scope.projectId).eq('user_id', scope.userId)\n    .order('created_at'", ".eq('project_id', scope.projectId)\n    .order('created_at'")
    check('MUTATION CONTROL: a job list without the owner filter is caught by O2', m.found && !!m.mod && !(await ownerRuntime(m.mod)))
  }
  {
    const pl = fakePlugin()
    const admin = new FakeAdmin(rows({ site_fix_jobs: [{ ...otherJob }] }))
    const r = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: otherJob.id }, depsFor(admin, { pluginPost: pl.post }))
    check('O3: undo of another owner\'s job: not_found, the plugin is never called', r.status === 404 && pl.calls.length === 0)
    const notMine = await API.handleFixesGet(P, depsFor(new FakeAdmin(rows({ projects: [{ id: P, user_id: OTHER, target_domain: 'shop.example.org' }] }))))
    check('O4: a project of another owner: not_found', notMine.status === 404)
    const anon = await API.handleFixesPost(approveTitle(), depsFor(new FakeAdmin(rows()), { userId: null }))
    check('O5: not signed in: 401', anon.status === 401)
  }

  // ── Q) the queue ──────────────────────────────────────────────────────────
  console.log('\nQ) the queue')
  {
    const admin = new FakeAdmin(rows(), { site_fix_jobs: MISSING, site_fix_audit: MISSING })
    const g = await API.handleFixesGet(P, depsFor(admin))
    const caps = (g.body as { capabilities?: { available?: boolean } }).capabilities
    const post = await API.handleFixesPost(approveTitle(), depsFor(admin))
    check('Q1: without the tables the feature is hidden (available: false) and every write is refused (queue_unavailable)',
      g.status === 200 && caps?.available === false && post.status === 409 && (post.body as { code?: string }).code === 'queue_unavailable')
  }
  const approvalFlow = async (A: typeof API) => {
    const pl = fakePlugin()
    const admin = new FakeAdmin(rows())
    const deps = depsFor(admin, { pluginPost: pl.post })
    const noFlag = await A.handleFixesPost(approveTitle({ approved: undefined }), deps)
    const stringFlag = await A.handleFixesPost(approveTitle({ approved: 'true' }), deps)
    const refusedCleanly = noFlag.status === 400 && stringFlag.status === 400 && admin.tables.site_fix_jobs.length === 0 && pl.calls.length === 0
    const ok = await A.handleFixesPost(approveTitle(), deps)
    const job = (ok.body as { job?: { status?: string; id?: string; canUndo?: boolean } }).job
    const audit = admin.tables.site_fix_audit as { action: string; actor_id: string; actor_ip: string; previous_value: string | null; new_value: string | null; user_id: string; project_id: string }[]
    return { pl, admin, deps, refusedCleanly, job, audit }
  }
  {
    const r = await approvalFlow(API)
    check('Q2: no write without approved: true (missing, or the string "true"); nothing stored, nothing sent', r.refusedCleanly)
    check('Q3: an approved title goes to the plugin\'s /fix, signed, with exactly the approved value', r.pl.calls.length === 1 && r.pl.calls[0].route === '/fix'
      && /^v1=[0-9a-f]{64}$/.test(r.pl.calls[0].headers['X-GoTop-Signature'] ?? '') && JSON.stringify(r.pl.calls[0].body.value) === JSON.stringify({ value: 'Handmade boots | Boot Shop' })
      && r.pl.calls[0].body.expected === 'Old title', JSON.stringify(r.pl.calls[0]))
    check('Q4: the job is applied and can be undone', r.job?.status === 'applied' && r.job?.canUndo === true, JSON.stringify(r.job))
    check('Q5: the approval is recorded before the write, then the outcome: who, when, IP, previous and new value',
      r.audit.length === 2 && r.audit[0].action === 'approved' && r.audit[1].action === 'applied'
      && r.audit.every((x) => x.actor_id === U && x.actor_ip === '203.0.113.9' && x.user_id === U && x.project_id === P)
      && r.audit[1].previous_value === 'Old title' && r.audit[1].new_value === 'Handmade boots | Boot Shop', JSON.stringify(r.audit))
    const jobRow = r.admin.tables.site_fix_jobs[0] as { approved_by: string; approved_ip: string; approved_at: string }
    check('Q6: the job keeps who approved it, when and from which IP', jobRow.approved_by === U && jobRow.approved_ip === '203.0.113.9' && !!jobRow.approved_at)
    const undo = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: r.job?.id }, r.deps)
    check('Q7: undo goes to the plugin\'s /undo and the job becomes reverted, recorded', undo.status === 200 && r.pl.calls[1]?.route === '/undo'
      && (undo.body as { job?: { status?: string } }).job?.status === 'reverted' && r.audit.at(-1)?.action === 'reverted')
    const again = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: r.job?.id }, r.deps)
    check('Q8: undo of a reverted job is refused (wrong_state)', again.status === 409 && (again.body as { code?: string }).code === 'wrong_state')
    const m = mutant<typeof API>('lib/site-fix/api.ts', "if (b.approved !== true) return refuse('invalid_request')", '')
    const rm = m.mod ? await approvalFlow(m.mod) : null
    check('MUTATION CONTROL: an approve without the approval check is caught by Q2', m.found && !!rm && !rm.refusedCleanly)
    const m2 = mutant<typeof API>('lib/site-fix/api.ts', "  await audit(deps, l, job, 'approved')\n", '')
    const rm2 = m2.mod ? await approvalFlow(m2.mod) : null
    check('MUTATION CONTROL: an approval that is not recorded first is caught by Q5', m2.found && !!rm2 && rm2.audit[0]?.action !== 'approved')
  }
  {
    // The connection drops: the plugin answers 401.
    const pl = fakePlugin({ status: 401 })
    const admin = new FakeAdmin(rows())
    const r = await API.handleFixesPost(approveTitle(), depsFor(admin, { pluginPost: pl.post }))
    const job = (r.body as { job?: { status?: string; errorCode?: string; canRetry?: boolean } }).job
    const linkRow = admin.tables.site_fix_plugin_links[0] as { status: string }
    const audit = admin.tables.site_fix_audit as { action: string }[]
    check('Q9: plugin connection lost: the approval is kept and marked for manual update; the link is marked disconnected',
      job?.status === 'manual' && job.errorCode === 'plugin_not_connected' && linkRow.status === 'disconnected' && audit.map((a) => a.action).join() === 'approved,marked_manual', JSON.stringify({ job, audit }))
    const g = await API.handleFixesGet(P, depsFor(admin, { pluginPost: pl.post }))
    const caps = (g.body as { capabilities?: { plugin?: { state?: string }; channelFor?: Record<string, string> } }).capabilities
    check('Q10: while disconnected every type goes to manual update (nothing is sent)', caps?.plugin?.state === 'disconnected' && FIX_TYPES.every((t) => caps?.channelFor?.[t] === 'manual'))
    const calls = pl.calls.length
    const r2 = await API.handleFixesPost(approveTitle({ fix: { type: 'canonical', value: `${SITE}/about/` } }), depsFor(admin, { pluginPost: pl.post }))
    check('Q11: an approval while disconnected is recorded as manual without calling the site', (r2.body as { job?: { status?: string } }).job?.status === 'manual' && pl.calls.length === calls)
    const back = fakePlugin()
    const chk = await API.handlePlugin({ projectId: P, action: 'check' }, depsFor(admin, { pluginPost: back.post }))
    const firstId = (admin.tables.site_fix_jobs[0] as { id: string }).id
    const retry = await API.handleFixesPost({ projectId: P, action: 'retry', jobId: firstId }, depsFor(admin, { pluginPost: back.post }))
    check('Q12: once the plugin answers again, retry applies the waiting fix', chk.status === 200 && (retry.body as { job?: { status?: string } }).job?.status === 'applied', JSON.stringify(retry.body))
    const secondId = (admin.tables.site_fix_jobs[1] as { id: string }).id
    const cancel = await API.handleFixesPost({ projectId: P, action: 'cancel', jobId: secondId }, depsFor(admin, { pluginPost: back.post }))
    check('Q13: a waiting fix can be removed from the queue (cancelled, recorded)', (cancel.body as { job?: { status?: string } }).job?.status === 'cancelled'
      && (admin.tables.site_fix_audit as { action: string }[]).some((a) => a.action === 'cancelled'))
  }
  {
    // Custom site: the fix is SENT to the developer's endpoint.
    const rc = fakeReceiver()
    const admin = new FakeAdmin(rows({
      site_fix_plugin_links: [], project_profiles: [{ project_id: P, user_id: U, detected_platform: 'custom' }],
      site_platform_connections: [{ project_id: P, user_id: U, platform: 'webhook', endpoint_url: 'https://hooks.example.com/gotop', secret_encrypted: 'enc:hook', connection_status: 'connected' }],
    }))
    const r = await API.handleFixesPost(approveTitle({ fix: { type: 'faq_block', heading: 'Questions', items: [{ q: 'Do you ship abroad?', a: 'Yes, to most of Europe.' }] }, kind: 'faq_missing' }), depsFor(admin, { webhook: rc.deps as never }))
    const job = (r.body as { job?: { status?: string; id?: string; canUndo?: boolean } }).job
    const sent = rc.sent[0]
    check('Q14: webhook site: the approved fix is sent, signed, versioned, and the job is marked sent',
      job?.status === 'sent' && sent?.headers['X-GoTop-Event'] === 'site_fix.approved' && /^sha256=[0-9a-f]{64}$/.test(sent.headers['X-GoTop-Signature'] ?? '')
      && sent.body.fix_payload_version === 1 && (sent.body.fix as { type?: string }).type === 'faq_block', JSON.stringify(sent))
    const u = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: job?.id }, depsFor(admin, { webhook: rc.deps as never }))
    check('Q15: undo of a sent fix sends site_fix.reverted and marks it reverted', (u.body as { job?: { status?: string } }).job?.status === 'reverted' && rc.sent[1]?.headers['X-GoTop-Event'] === 'site_fix.reverted')
  }
  {
    const admin = new FakeAdmin(rows({ shopify_connections: [{ project_id: P, user_id: U, connection_status: 'connected', archived_at: null }] }))
    const pl = fakePlugin()
    const r = await API.handleFixesPost(approveTitle(), depsFor(admin, { pluginPost: pl.post }))
    const g = await API.handleFixesGet(P, depsFor(admin))
    check('Q16: a Shopify store whose connection cannot edit content is read-only: refused (shopify_readonly), nothing stored or sent, no channel offered',
      (r.body as { code?: string }).code === 'shopify_readonly' && admin.tables.site_fix_jobs.length === 0 && pl.calls.length === 0
      && Object.keys((g.body as { capabilities: { channelFor: object } }).capabilities.channelFor).length === 0)
    const m = mutant<typeof import('../channel')>('lib/site-fix/channel.ts', "if (!ctx.shopifyWrite) return { ...base, shopify: true, readOnly: true, channelFor: {} }", '')
    const caps = m.mod ? m.mod.resolveCapabilities({ shopify: true, wordpressDetected: false, creds: null, plugin: null, pluginLink: null, webhook: { endpointUrl: 'https://h.example.com', secret: 's' }, siteUrls: [SITE] }, true) : null
    check('MUTATION CONTROL: a channel resolver that forgets the write scope offers a channel (Q16 catches it)', m.found && !!caps && !caps.readOnly && Object.keys(caps.channelFor).length > 0)
  }
  {
    // WordPress detected, no plugin, no application password: the plugin is the way.
    const admin = new FakeAdmin(rows({ site_fix_plugin_links: [] }))
    const r = await API.handleFixesPost(approveTitle({ fix: { type: 'canonical', value: `${SITE}/about/` } }), depsFor(admin))
    check('Q17: WordPress without a connection: needs_plugin, nothing stored', (r.body as { code?: string }).code === 'needs_plugin' && admin.tables.site_fix_jobs.length === 0)
    const iss = await API.handlePlugin({ projectId: P, action: 'issue' }, depsFor(admin))
    const code = (iss.body as { code?: string }).code ?? ''
    const stored = admin.tables.site_fix_plugin_links[0] as { status: string; secret_encrypted: string; key_id: string } | undefined
    check('Q18: a pairing code is issued once; only its encrypted secret is stored, pending', /^GT1\.gtk_[0-9a-f]{16}\.[A-Za-z0-9_-]{43}$/.test(code)
      && stored?.status === 'pending' && !stored.secret_encrypted.includes(code.split('.')[2]) && stored.key_id === code.split('.')[1])
  }

  // ── C) content (application-password path) ──────────────────────────────
  console.log('\nC) content')
  {
    const id = newId()
    const block = faqBlockHtml(id, 'Q & A', [{ q: 'Is it <safe>?', a: 'Yes & more.' }])
    check('C1: the FAQ block escapes the merchant\'s text and carries this fix\'s marker', block.includes('Is it &lt;safe&gt;?') && block.includes('Q &amp; A') && block.includes(`gotop-fix-${id.replace(/[^0-9a-f]/g, '').slice(0, 12)}`))
    const original = '<p>Hello</p>'
    const withBlock = appendBlock(original, block)
    const edited = `<p>Intro</p>${withBlock}`
    check('C2: undo removes exactly the block, keeping a later edit', removeBlock(edited, block) === '<p>Intro</p><p>Hello</p>', JSON.stringify(removeBlock(edited, block)))
    const html = '<p>See <a href="https://shop.example.org/old/">our old page</a> and <a href="/old/">again</a>, not <a href="https://other.example.com/old/">this</a>.</p>'
    const un = fixBrokenLink(html, `${SITE}/old/`, null, 'shop.example.org')
    check('C3: unlinking a dead link keeps its words, on the site\'s own host only', un.count === 2 && un.html.includes('See our old page and again') && un.html.includes('https://other.example.com/old/'))
    const re = fixBrokenLink(html, `${SITE}/old/`, `${SITE}/new/`, 'shop.example.org')
    check('C4: replacing points both spellings to the new address', re.count === 2 && (re.html.match(/shop\.example\.org\/new\//g) ?? []).length === 2)
  }

  // ── Z) the zip and the developer notes ───────────────────────────────────
  console.log('\nZ) the plugin zip and the developer notes')
  {
    const r = spawnSync('node', [join(ROOT, 'scripts/build-wordpress-plugin.mjs'), '--check'], { encoding: 'utf8', cwd: ROOT })
    check('Z1: the zip served in the app is built from the PHP in the repo (--check)', r.status === 0, (r.stdout + r.stderr).slice(0, 300))
    const route = strip(read('app/api/site-health/plugin-zip/route.ts'))
    const guarded = (src: string) => /if \(!user\) return Response\.json\(\{ ok: false, code: 'unauthorized' \}, \{ status: 401/.test(src) && src.indexOf('if (!user)') < src.indexOf('Buffer.from(PLUGIN_ZIP_BASE64')
    check('Z2: the zip is served to signed-in users only (401 before any byte)', guarded(route))
    check('MUTATION CONTROL: a zip route without the sign-in check is caught by Z2', !guarded(route.replace(/if \(!user\) return [^\n]*\n/, '')))
    const keysOf = (o: unknown, prefix = ''): string[] => (o && typeof o === 'object' && !Array.isArray(o)
      ? Object.entries(o as Record<string, unknown>).flatMap(([k, x]) => [`${prefix}${k}`, ...(k === 'value' ? [] : keysOf(x, `${prefix}${k}.`))]) : [])
    const sample = buildFixPayload({ id: 'j', type: 'meta_description', pageUrl: `${SITE}/about/`, value: { value: 'x' }, previous: 'y', approvedAt: '2026-09-28T00:00:00Z' }, 'site_fix.approved', new Date())
    const example = JSON.parse(EXAMPLE_FIX_PAYLOAD.replace(/…/g, '')) as Record<string, unknown>
    const sameKeys = (a: unknown, b: unknown) => JSON.stringify(keysOf(a).sort()) === JSON.stringify(keysOf(b).sort())
    check('Z3: the developer notes show exactly the keys the fix webhook sends', sameKeys(sample, example), `${keysOf(sample).join(',')} vs ${keysOf(example).join(',')}`)
    check('MUTATION CONTROL: a renamed key in the example is caught by Z3', !sameKeys(sample, JSON.parse(EXAMPLE_FIX_PAYLOAD.replace(/…/g, '').replace('"page_url"', '"url"'))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
