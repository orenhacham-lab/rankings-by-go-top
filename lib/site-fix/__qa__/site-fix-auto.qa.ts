/**
 * Automatic site-health fixes: the project's own switch, OFF by default, WordPress with the Go Top
 * plugin only, never Shopify; three types; every fix recorded with the person and the IP of the
 * switch-on, and undoable. Over FakeAdmin with a fake plugin, a fake scan and a fake link check.
 *
 *   A) THE TYPE LIST. AUTO_SAFE_TYPES is exactly image_alt, broken_link, meta_description; the
 *      migration's CHECK holds the same three; nothing is on both lists; BULK_SAFE_TYPES unchanged.
 *   B) MAPPING. description_length / description_duplicate never; the home page never; a dead link
 *      without the page it is on never.
 *   C) STRICT ALT. alt="", alt=" " and a src with one empty alt are left alone; three junk file
 *      names get ONE alt (the page title), not three.
 *   D) META DESCRIPTION. A stored one, a live one, or a suggestion outside 120–155 skips.
 *   E) BROKEN LINK. replacement is always null (unlink, keep the words); a link that answers 200
 *      again is left alone; 404 and 410 proceed; a link no longer in the content skips.
 *   F) THE RUN. No grant / a grant turned off writes nothing; turned off between two fixes stops
 *      the second; Shopify and a dropped plugin write nothing (no manual rows); approved_by /
 *      approved_ip and the audit actor are the grant's, whatever the deps carry; a reverted or
 *      cancelled place is never fixed again; a recent fix of the same type skips; another owner's
 *      grant is not_found; the caps and the deadline; one claim wins; an inactive owner is skipped.
 *   G) UNDO. undo and undo_batch work on automatic fixes; retry keeps `auto`.
 *   H) SOURCE GUARDS. The cron route authorizes before after(), answers 202, has the kill switch;
 *      handleFixesPost cannot reach an automatic fix; the switch route reads the IP only through
 *      clientIpFrom; vercel.json schedules the path; the settings card hides while the table is
 *      missing; the one cross-project listing is called from auto-run.ts only.
 *
 * Every guard has a MUTATION CONTROL (a broken copy must fail it).
 * Run: npx tsx lib/site-fix/__qa__/site-fix-auto.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { createHash } from 'crypto'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { withMutant } from '../../reminders/__qa__/_mutant'
import * as API from '../api'
import * as AUTO from '../auto'
import * as ASTORE from '../auto-store'
import * as RUN from '../auto-run'
import { AUTO_NEVER_TYPES, AUTO_SAFE_TYPES, BULK_SAFE_TYPES, FIX_TYPES, type FixType } from '../types'
import { suggestAlt, altFromFileName } from '../../site-health/rules'
import type { Finding, FindingKind, FindingPage, SiteHealthReport } from '../../site-health/types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')
const stripSql = (s: string) => s.replace(/--.*$/gm, '')
;(globalThis as { fetch?: unknown }).fetch = async () => { throw new Error('no network in this suite') }

// ── Fixtures ────────────────────────────────────────────────────────────────

const U = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const P = 'a1111111-2222-4333-8444-555555555555'
const G = 'c1111111-2222-4333-8444-555555555555'
const RUN_ID = 'b0000000-0000-4000-8000-000000000001'
const SITE = 'https://shop.example.org'
const GRANT_IP = '203.0.113.9'
const DECOY_IP = '192.0.2.200'
let idN = 0
const newId = () => `${String(++idN).padStart(8, '0')}-aaaa-4bbb-8ccc-${String(idN).padStart(12, '0')}`
const DAY = 86_400_000
const NOW = Date.now()
const ago = (days: number) => new Date(NOW - days * DAY).toISOString()
const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

type Row = Record<string, unknown>
const grantRow = (over: Partial<ASTORE.AutoGrantRow> = {}): ASTORE.AutoGrantRow => ({
  id: G, user_id: U, project_id: P, fix_types: ['image_alt', 'broken_link', 'meta_description'], enabled_by: U, enabled_at: ago(10),
  enabled_ip: GRANT_IP, disabled_at: null, disabled_by: null, last_run_at: null, run_claimed_until: null, ...over,
})
const link = (status: 'connected' | 'disconnected' = 'connected') => ({
  project_id: P, user_id: U, site_url: SITE, key_id: 'gtk_0123456789abcdef', secret_encrypted: 'enc:secret', secret_hint: '••••abcd',
  status, plugin_version: '2.1.0', seo_plugin: 'yoast', last_seen_at: null, last_error_code: null,
})
const rows = (over: Record<string, Row[]> = {}): Record<string, Row[]> => ({
  projects: [{ id: P, user_id: U, target_domain: 'shop.example.org', business_name: 'Boot Shop', name: 'Boots' }],
  project_profiles: [{ project_id: P, user_id: U, detected_platform: 'wordpress' }],
  site_fix_plugin_links: [link()],
  site_fix_jobs: [],
  site_fix_audit: [],
  site_fix_auto_grants: [grantRow() as unknown as Row],
  ...over,
})

const LONG_TEXT = 'We make leather boots by hand in our small workshop in Haifa, from hides we choose ourselves at the market every season. '
  + 'Every pair is stitched, soled and finished by the same two people, and we keep the measurements of every customer on file. '
  + 'We ship to most of Europe within a week, and repairs are free for the first two years.'
const ABOUT = `${SITE}/about/`
const CARE = `${SITE}/blog/care/`
const DEAD = `${SITE}/old-page/`
const img = (name: string, extra = '') => `<img src="${SITE}/wp-content/uploads/${name}"${extra}>`
const ABOUT_HTML = `<p>${LONG_TEXT}</p>${img('red-leather-boots.jpg')}${img('IMG_1234.jpg')}${img('DSC_0001.jpg')}${img('logo.png', ' alt=""')}`
const CARE_HTML = `<p>${LONG_TEXT}</p><p>Read our <a href="${DEAD}">old care guide</a> first.</p>`

type Item = { title: string; content: string; description?: string }
function item(url: string, it: Item) {
  return {
    post_id: 11, post_type: 'page', link: url, title: it.title, content: it.content, content_sha: sha(it.content), seo_plugin: 'yoast',
    seo: { title: '', description: it.description ?? '', canonical: '', focus: '', schema: '' },
  }
}
const PAGES: Record<string, Item> = {
  [ABOUT]: { title: 'About Boot Shop', content: ABOUT_HTML },
  [CARE]: { title: 'Caring for leather', content: CARE_HTML },
}

type PluginCall = { route: string; body: Record<string, unknown> }
function fakePlugin(pages: Record<string, Item> = PAGES, mode: { status?: number; fixStatus?: number; onFix?: (n: number) => void } = {}) {
  const calls: PluginCall[] = []
  let fixes = 0
  const post = (async (_site: string, route: string, body: string) => {
    const b = JSON.parse(body) as Record<string, unknown>
    calls.push({ route, body: b })
    if (route === '/status') {
      if (mode.status) return { status: mode.status, body: '{"code":"gotop_bad_signature"}' }
      return { status: 200, body: JSON.stringify({ ok: true, version: '2.1.0', seo_plugin: 'yoast', fix_types: [...FIX_TYPES] }) }
    }
    if (route === '/inspect') {
      const it = pages[String(b.url)]
      return it ? { status: 200, body: JSON.stringify({ ok: true, item: item(String(b.url), it) }) } : { status: 404, body: '{"code":"not_in_wordpress"}' }
    }
    if (route === '/fix') {
      fixes++
      mode.onFix?.(fixes)
      if (mode.fixStatus) return { status: mode.fixStatus, body: '{"code":"gotop_bad_signature"}' }
      return { status: 200, body: JSON.stringify({ ok: true, status: 'applied', fix_id: `f${fixes}`, post_id: 11, previous: '' }) }
    }
    if (route === '/undo') return { status: 200, body: JSON.stringify({ ok: true, status: 'reverted' }) }
    return { status: 404, body: '{}' }
  }) as unknown as NonNullable<API.FixesDeps['pluginPost']>
  return { post, calls }
}

const fp = (url: string, kind: FindingPage['kind'] = 'page', from?: string): FindingPage => ({
  url, path: new URL(url).pathname, kind, value: null, measure: null, fixable: true, adminUrl: null, ...(from !== undefined ? { from } : {}),
})
const finding = (id: FindingKind, pages: FindingPage[]): Finding => ({
  id, severity: 'important', pages, total: pages.length, field: null, guide: 'alt', fixable: true,
})
const report = (findings: Finding[]): SiteHealthReport => ({
  siteUrl: `${SITE}/`, scannedAt: new Date(NOW).toISOString(), platform: 'wordpress', connections: { wordpress: true, shopify: false, wix: false },
  pagesChecked: 3, partial: false, score: 70, findings,
})
const FULL_REPORT = report([
  finding('description_missing', [fp(ABOUT), fp(`${SITE}/`, 'home')]),
  finding('broken_links', [fp(DEAD, 'other', CARE)]),
  finding('images_alt', [fp(ABOUT), fp(`${SITE}/`, 'home')]),
])

const live = (description: string | null = null) => ({ title: 'About Boot Shop', description, h1: 'About', canonical: null, schemaTypes: [], html: '' })

function depsFor(admin: FakeAdmin, over: Partial<API.AutoFixDeps> & { plugin?: ReturnType<typeof fakePlugin>; links?: Record<string, number> } = {}): API.AutoFixDeps & { linkCalls: string[] } {
  const plugin = over.plugin ?? fakePlugin()
  const linkCalls: string[] = []
  return {
    // A decoy identity: an automatic fix must never take the deps' own user or IP.
    userId: OTHER, ip: DECOY_IP, admin: admin as never,
    decrypt: (s) => (s === 'enc:secret' ? 'A'.repeat(43) : 'x'), encrypt: (s) => `enc:${s.length}`,
    wp: {} as API.FixesDeps['wp'], readLive: async () => live(null), newId, now: () => NOW, pluginPost: plugin.post,
    scanReport: async () => FULL_REPORT,
    checkLink: async (url) => { linkCalls.push(url); return over.links?.[url] ?? 404 },
    runId: RUN_ID,
    ...over,
    linkCalls,
  }
}
const jobsOf = (admin: FakeAdmin) => (admin.tables.site_fix_jobs ?? []) as Row[]
const auditOf = (admin: FakeAdmin) => (admin.tables.site_fix_audit ?? []) as Row[]
const ofType = (admin: FakeAdmin, t: FixType) => jobsOf(admin).filter((j) => j.fix_type === t)
const seedJob = (over: Row): Row => ({
  id: newId(), project_id: P, user_id: U, fix_type: 'image_alt', finding_kind: 'images_alt', page_url: ABOUT, payload: { images: [] },
  before_value: null, after_summary: 'x', channel: 'plugin', status: 'applied', error_code: null, undo: { revert: { kind: 'plugin' } }, remote_ref: null,
  approved_by: U, approved_at: ago(3), approved_ip: '198.51.100.1', applied_at: ago(3), reverted_at: null, created_at: ago(3), updated_at: ago(3), ...over,
})

async function runOne(opts: { tables?: Record<string, Row[]>; grant?: ASTORE.AutoGrantRow; deps?: Parameters<typeof depsFor>[1]; api?: typeof API } = {}) {
  const admin = new FakeAdmin(rows(opts.tables))
  const deps = depsFor(admin, opts.deps)
  const out = await (opts.api ?? API).autoFixProject(P, opts.grant ?? grantRow(), deps)
  return { admin, deps, out }
}

async function main() {
  console.log('Automatic site-health fixes — the switch, the run, the record\n')

  // ── A) the type list ──────────────────────────────────────────────────────
  console.log('A) the type list')
  const MIG = read('supabase/migrations/20261006140000_site_fix_auto_grants.sql')
  const migTypes = (sql: string) => {
    const m = /fix_types <@ ARRAY\[([^\]]*)\]/.exec(stripSql(sql))
    return m ? [...m[1].matchAll(/'([a-z0-9_]+)'/g)].map((x) => x[1]).sort() : []
  }
  const THREE = ['broken_link', 'image_alt', 'meta_description']
  const same = (a: readonly string[], b: readonly string[]) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort())
  check('A1: AUTO_SAFE_TYPES is exactly image_alt, broken_link, meta_description', same(AUTO_SAFE_TYPES, THREE), AUTO_SAFE_TYPES)
  check('A2: the migration\'s CHECK holds the same three', same(migTypes(MIG), AUTO_SAFE_TYPES), migTypes(MIG))
  check('MUTATION CONTROL: a fourth type in the migration only is caught by A2', !same(migTypes(MIG.replace("'meta_description']", "'meta_description', 'seo_title']")), AUTO_SAFE_TYPES))
  const disjoint = (safe: readonly string[], never: readonly string[]) => safe.every((t) => !never.includes(t)) && same([...safe, ...never], FIX_TYPES)
  check('A3: nothing is on both the automatic and the never list, and together they are all eleven types', disjoint(AUTO_SAFE_TYPES, AUTO_NEVER_TYPES))
  check('MUTATION CONTROL: canonical on both lists is caught by A3', !disjoint([...AUTO_SAFE_TYPES, 'canonical'], AUTO_NEVER_TYPES))
  check('A4: BULK_SAFE_TYPES ("apply all safe fixes") is unchanged', same(BULK_SAFE_TYPES, ['seo_title', 'meta_description', 'image_alt']))
  check('A5: turning it on accepts exactly the covered list, nothing more or less',
    AUTO.sameAutoTypes(['meta_description', 'image_alt', 'broken_link']) && !AUTO.sameAutoTypes(['image_alt', 'broken_link'])
    && !AUTO.sameAutoTypes([...AUTO_SAFE_TYPES, 'seo_title']) && !AUTO.sameAutoTypes(['image_alt', 'image_alt', 'broken_link']) && !AUTO.sameAutoTypes(null))

  // ── B) mapping ────────────────────────────────────────────────────────────
  console.log('\nB) mapping findings to candidates')
  const mixed = report([
    finding('description_length', [fp(`${SITE}/long/`)]),
    finding('description_duplicate', [fp(`${SITE}/dup/`)]),
    finding('description_missing', [fp(ABOUT), fp(`${SITE}/`, 'home'), fp(`${SITE}/landing/`, 'home')]),
    finding('images_alt', [fp(`${SITE}/`, 'page'), fp(ABOUT)]),
    finding('broken_links', [fp(DEAD, 'other', CARE), fp(`${SITE}/gone/`, 'other'), fp(`${SITE}/x/`, 'other', `${SITE}/`)]),
    finding('title_missing', [fp(`${SITE}/t/`)]),
  ])
  const cands = (A: typeof AUTO) => A.autoCandidates(mixed, AUTO_SAFE_TYPES)
  const c0 = cands(AUTO)
  check('B1: description_length and description_duplicate are never candidates', !c0.some((c) => c.pageUrl.includes('/long/') || c.pageUrl.includes('/dup/')))
  const noHome = (list: AUTO.AutoCandidate[]) => !list.some((c) => new URL(c.pageUrl).pathname === '/' || c.pageUrl.includes('/landing/'))
  check('B2: the home page is never a candidate (by its kind or by its address)', noHome(c0), c0)
  check('B3: a dead link without the page it was found on is not a candidate', !c0.some((c) => c.href?.includes('/gone/')))
  check('B4: a dead link is fixed on the page it is on, the dead address as its subject', c0.some((c) => c.type === 'broken_link' && c.pageUrl === CARE && c.href === DEAD))
  check('B5: the run\'s order is descriptions, then dead links, then alt text; only the three types',
    JSON.stringify(c0.map((c) => c.type)) === JSON.stringify(['meta_description', 'broken_link', 'image_alt']), c0.map((c) => c.type))
  await withMutant<typeof AUTO, void>('lib/site-fix/auto.ts', [["if (!pageUrl || isHomeUrl(pageUrl) || (type !== 'broken_link' && p.kind === 'home')) continue", 'if (!pageUrl) continue']], (M) => {
    check('MUTATION CONTROL: candidates without the home-page rule are caught by B2', !noHome(cands(M)))
  })

  // ── C) strict alt ─────────────────────────────────────────────────────────
  console.log('\nC) strict alt text')
  const strictCase = [
    img('a.jpg', ' alt=""'), img('b.jpg', ' alt=" "'), img('c.jpg', ' alt'), img('d.jpg'), img('d.jpg', ' alt=""'), img('e.jpg'), img('f.jpg', ' data-alt="x"'),
  ].join('')
  const strictOk = (A: typeof AUTO) => JSON.stringify(A.strictMissingAlt(strictCase).map((s) => s.split('/').pop())) === JSON.stringify(['e.jpg', 'f.jpg'])
  check('C1: alt="", alt=" ", a bare alt, and a src with one empty alt are all left alone; data-alt is not an alt', strictOk(AUTO), AUTO.strictMissingAlt(strictCase))
  await withMutant<typeof AUTO, void>('lib/site-fix/auto.ts', [['&& !hasAltAttribute(tag))', '&& !/\\salt\\s*=\\s*"[^"\\s]/i.test(tag))']], (M) => {
    check('MUTATION CONTROL: counting an empty alt as missing (the click\'s rule) is caught by C1', !strictOk(M))
  })
  const junk = `${img('IMG_1234.jpg')}${img('DSC_0001.jpg')}${img('20240101_120000.jpg')}`
  const junkOk = (A: typeof AUTO) => { const r = A.autoAltImages(junk, 'About Boot Shop'); return r.length === 1 && r[0].alt === 'About Boot Shop' }
  check('C2: three junk file names get exactly one alt, the page title', junkOk(AUTO), AUTO.autoAltImages(junk, 'About Boot Shop'))
  await withMutant<typeof AUTO, void>('lib/site-fix/auto.ts', [['if (titleUsed >= 1) continue', 'if (titleUsed >= 2) continue']], (M) => {
    check('MUTATION CONTROL: allowing the title on two images is caught by C2', !junkOk(M), M.autoAltImages(junk, 'About Boot Shop'))
  })
  const named = AUTO.autoAltImages(ABOUT_HTML, 'About Boot Shop')
  check('C3: a named file gets its own words; the junk ones share one title; the decorative logo stays',
    named.length === 2 && named[0].alt === 'red leather boots' && named[1].alt === 'About Boot Shop' && !named.some((i) => i.src.includes('logo')), named)
  check('C4: no title and only junk names: nothing at all', AUTO.autoAltImages(junk, '').length === 0)
  const samples = ['red-running-shoes-1024x768.jpg', 'IMG_1234.jpg', 'a1b2c3d4e5f6.png', '%D7%A0%D7%A2%D7%9C.jpg']
  check('C5: altFromFileName is null exactly when suggestAlt falls back to the title (suggestAlt unchanged)',
    samples.every((s) => (altFromFileName(`${SITE}/${s}`, 'Boot Shop') === null) === (suggestAlt(`${SITE}/${s}`, 'Boot Shop') === 'Boot Shop'))
    && suggestAlt(`${SITE}/red-running-shoes-1024x768.jpg`, 'x') === 'red running shoes' && suggestAlt(`${SITE}/IMG_1234.jpg`, 'Boot Shop') === 'Boot Shop')

  // ── D) meta description ───────────────────────────────────────────────────
  console.log('\nD) meta description')
  const metaOnly = report([finding('description_missing', [fp(ABOUT)])])
  {
    const r = await runOne({ deps: { scanReport: async () => metaOnly } })
    const job = ofType(r.admin, 'meta_description')[0]
    const v = String((job?.payload as { value?: string } | undefined)?.value ?? '')
    check('D0: both empty: one description, 120–155 characters, compare-and-set on the empty value',
      ofType(r.admin, 'meta_description').length === 1 && v.length >= 120 && v.length <= 155 && (job.undo as { expected?: string }).expected === '', { v, out: r.out })
  }
  {
    const r = await runOne({ deps: { scanReport: async () => metaOnly, plugin: fakePlugin({ ...PAGES, [ABOUT]: { ...PAGES[ABOUT], description: 'Stored by Yoast.' } }) } })
    check('D1: a description stored in the SEO plugin: skipped', ofType(r.admin, 'meta_description').length === 0 && r.out.ok)
  }
  {
    const r = await runOne({ deps: { scanReport: async () => metaOnly, readLive: async () => live('The theme writes one.') } })
    check('D2: a description the live page shows: skipped', ofType(r.admin, 'meta_description').length === 0)
    const n = await runOne({ deps: { scanReport: async () => metaOnly, readLive: async () => null } })
    check('D2b: the live page cannot be read: skipped (not assumed empty)', ofType(n.admin, 'meta_description').length === 0)
  }
  {
    const gate = (A: typeof AUTO) => !A.autoDescriptionOk('x'.repeat(119)) && A.autoDescriptionOk('x'.repeat(120)) && A.autoDescriptionOk('x'.repeat(155)) && !A.autoDescriptionOk('x'.repeat(156)) && !A.autoDescriptionOk(null)
    check('D3: a 119-character suggestion is refused (120–155 pass)', gate(AUTO))
    check('D3b: the run uses that gate for the suggestion (source)', /if \(!autoDescriptionOk\(value\)\) return null/.test(strip(read('lib/site-fix/api.ts'))))
    await withMutant<typeof AUTO, void>('lib/site-fix/auto.ts', [["!!value && !bulkValueProblem({ type: 'meta_description', value }, '')", '!!value']], (M) => {
      check('MUTATION CONTROL: a gate that takes any text is caught by D3', !gate(M))
    })
    const short = await runOne({ deps: { scanReport: async () => metaOnly, plugin: fakePlugin({ ...PAGES, [ABOUT]: { title: 'About', content: '<p>Short page.</p>' } }) } })
    check('D4: a page too short for a description that fits: skipped', ofType(short.admin, 'meta_description').length === 0)
  }

  // ── E) broken link ────────────────────────────────────────────────────────
  console.log('\nE) broken links')
  const linkOnly = report([finding('broken_links', [fp(DEAD, 'other', CARE)])])
  {
    const plugin = fakePlugin()
    const r = await runOne({ deps: { scanReport: async () => linkOnly, plugin } })
    const job = ofType(r.admin, 'broken_link')[0]
    const sent = plugin.calls.find((c) => c.route === '/fix')
    check('E1: the dead link is removed and its words kept: replacement null, in the job and in what the plugin got',
      !!job && (job.payload as { replacement?: unknown }).replacement === null && (sent?.body.value as { replacement?: unknown })?.replacement === null
      && sent?.body.expected === sha(CARE_HTML), { job, sent })
    check('E1b: the link was checked again right before the write', r.deps.linkCalls.length === 1 && r.deps.linkCalls[0] === DEAD)
  }
  const deadOk = async (A: typeof AUTO | null, api: typeof API = API) => {
    const ok = await runOne({ api, deps: { scanReport: async () => linkOnly, links: { [DEAD]: 200 } } })
    return ofType(ok.admin, 'broken_link').length === 0 && (A ? !A.stillDead(200) : true)
  }
  check('E2: a link that answers 200 again is left alone', await deadOk(AUTO))
  await withMutant<typeof AUTO, void>('lib/site-fix/auto.ts', [['[404, 410]', '[404, 410, 200]']], (M) => {
    check('MUTATION CONTROL: treating a 200 as dead is caught by E2', M.stillDead(200))
  })
  for (const status of [404, 410]) {
    const r = await runOne({ deps: { scanReport: async () => linkOnly, links: { [DEAD]: status } } })
    check(`E3: a link that answers ${status} proceeds`, ofType(r.admin, 'broken_link').length === 1)
  }
  {
    const r = await runOne({ deps: { scanReport: async () => linkOnly, links: { [DEAD]: 500 } } })
    check('E3b: a 500 (or no answer) is not dead enough', ofType(r.admin, 'broken_link').length === 0)
    const gone = await runOne({ deps: { scanReport: async () => linkOnly, plugin: fakePlugin({ [CARE]: { title: 'Care', content: `<p>${LONG_TEXT}</p>` } }) } })
    check('E4: a link no longer in the content: skipped', ofType(gone.admin, 'broken_link').length === 0)
  }

  // ── F) the run ────────────────────────────────────────────────────────────
  console.log('\nF) the run')
  {
    const none = await runOne({ tables: { site_fix_auto_grants: [] } })
    check('F1: no grant on record: nothing written, reason off', !none.out.ok && none.out.reason === 'off' && jobsOf(none.admin).length === 0 && auditOf(none.admin).length === 0)
    const off = await runOne({ tables: { site_fix_auto_grants: [grantRow({ disabled_at: ago(1), disabled_by: U }) as unknown as Row] } })
    check('F1b: a grant turned off: nothing written', !off.out.ok && jobsOf(off.admin).length === 0 && auditOf(off.admin).length === 0)
  }
  const offMidway = async (api: typeof API) => {
    const admin = new FakeAdmin(rows())
    const plugin = fakePlugin(PAGES, { onFix: (n) => { if (n === 1) Object.assign(admin.tables.site_fix_auto_grants[0], { disabled_at: new Date().toISOString(), disabled_by: U }) } })
    const out = await api.autoFixProject(P, grantRow(), depsFor(admin, { plugin }))
    return { n: jobsOf(admin).length, out }
  }
  {
    const r = await offMidway(API)
    check('F2: turned off after the first fix: the second is never inserted', r.n === 1 && r.out.ok && r.out.stopped === 'off', r)
    await withMutant<typeof API, void>('lib/site-fix/api.ts', [["      if (!(await stillGranted(as, l, grant, c.type))) return { ok: true, ...counts, stopped: 'off' }\n", '']], async (M) => {
      const m = await offMidway(M)
      check('MUTATION CONTROL: without the re-read before each write, F2 catches the second fix', m.n > 1, m)
    })
  }
  {
    const shop = await runOne({ tables: { shopify_connections: [{ project_id: P, user_id: U, connection_status: 'connected', archived_at: null, granted_scopes: 'read_content,write_content' }] } })
    check('F3: Shopify: zero jobs, no manual rows, nothing sent', !shop.out.ok && shop.out.reason === 'not_plugin' && jobsOf(shop.admin).length === 0)
    const ro = await runOne({ tables: { shopify_connections: [{ project_id: P, user_id: U, connection_status: 'connected', archived_at: null, granted_scopes: 'read_content' }] } })
    check('F3b: a read-only Shopify store: zero jobs', !ro.out.ok && jobsOf(ro.admin).length === 0)
    const dropped = await runOne({ tables: { site_fix_plugin_links: [link('disconnected')] } })
    check('F3c: the plugin dropped: zero jobs and no manual rows', !dropped.out.ok && jobsOf(dropped.admin).length === 0)
    const none = await runOne({ tables: { site_fix_plugin_links: [] } })
    check('F3d: no plugin at all: zero jobs', !none.out.ok && jobsOf(none.admin).length === 0)
    const plugin = fakePlugin(PAGES, { status: 401 })
    const silent = await runOne({ deps: { plugin } })
    check('F3e: the plugin\'s /status does not answer: zero jobs, the site is never scanned or written', !silent.out.ok && silent.out.reason === 'plugin_unreachable'
      && jobsOf(silent.admin).length === 0 && !plugin.calls.some((c) => c.route === '/fix'))
  }
  const identity = async (api: typeof API) => {
    const r = await runOne({ api })
    const jobs = jobsOf(r.admin)
    const approved = auditOf(r.admin).filter((a) => a.action === 'approved')
    return {
      jobs: jobs.length,
      jobsOk: jobs.length > 0 && jobs.every((j) => j.approved_by === U && j.approved_ip === GRANT_IP && (j.undo as { auto?: string }).auto === G && (j.undo as { batch?: string }).batch === RUN_ID),
      auditOk: approved.length === jobs.length && approved.every((a) => a.result_code === 'auto_approved' && a.actor_id === U && a.actor_ip === GRANT_IP),
      noDecoy: !auditOf(r.admin).some((a) => a.actor_ip === DECOY_IP || a.actor_id === OTHER),
      manual: jobs.filter((j) => j.status === 'manual').length,
    }
  }
  {
    const r = await identity(API)
    check('F4: every job: approved_by and approved_ip are the grant\'s, undo carries the grant and the run', r.jobsOk, r)
    check('F4b: every approval in the audit: auto_approved, actor and IP of the switch-on, even with another IP in the deps', r.auditOk && r.noDecoy, r)
    check('F4c: the full report is fixed on a healthy plugin site, and no row waits for a manual update', r.jobs === 3 && r.manual === 0, r)
    await withMutant<typeof API, void>('lib/site-fix/api.ts', [['const as: AutoFixDeps = { ...deps, userId: grant.user_id, ip: grant.enabled_ip }', 'const as: AutoFixDeps = { ...deps, userId: grant.user_id, ip: deps.ip }']], async (M) => {
      const m = await identity(M)
      check('MUTATION CONTROL: taking the deps\' IP is caught by F4b', !(m.auditOk && m.noDecoy), m)
    })
  }
  const reverted = async (api: typeof API, status: string) => {
    const r = await runOne({ api, tables: { site_fix_jobs: [seedJob({ status, reverted_at: status === 'reverted' ? ago(2) : null, approved_at: ago(60), applied_at: ago(60) })] } })
    return ofType(r.admin, 'image_alt').filter((j) => j.status !== status).length
  }
  check('F5: a place the owner reverted is never fixed automatically again', (await reverted(API, 'reverted')) === 0)
  check('F5b: a place the owner removed from the queue (cancelled) is never fixed automatically again', (await reverted(API, 'cancelled')) === 0)
  await withMutant<typeof API, void>('lib/site-fix/api.ts', [["(r.status === 'reverted' || r.status === 'cancelled' || ", "(r.status === 'cancelled' || "]], async (M) => {
    check('MUTATION CONTROL: without the reverted rule the place is fixed again (F5 catches it)', (await reverted(M, 'reverted')) === 1)
  })
  {
    const failedAuto = await runOne({ tables: { site_fix_jobs: [seedJob({ status: 'failed', applied_at: null, approved_at: ago(5), undo: { auto: G, batch: RUN_ID } })] } })
    check('F5c: an automatic fix of the place that failed in the last 30 days is not tried again', ofType(failedAuto.admin, 'image_alt').length === 1)
    const failedClick = await runOne({ tables: { site_fix_jobs: [seedJob({ status: 'failed', applied_at: null, approved_at: ago(5), undo: {} })] } })
    check('F5d: a failed click does not block it', ofType(failedClick.admin, 'image_alt').length === 2)
    const recent = await runOne({ tables: { site_fix_jobs: [seedJob({ fix_type: 'meta_description', finding_kind: 'description_missing', payload: { value: 'x' }, approved_at: ago(5) })] } })
    check('F6: a fix of the same type on the page in the last 30 days: skipped', ofType(recent.admin, 'meta_description').length === 1 && ofType(recent.admin, 'image_alt').length === 1)
  }
  {
    const theirs = grantRow({ user_id: OTHER, enabled_by: OTHER })
    const admin = new FakeAdmin(rows({ site_fix_auto_grants: [theirs as unknown as Row] }))
    const out = await API.autoFixProject(P, theirs, depsFor(admin))
    check('F7: a grant whose user is not the project\'s owner: not_found, nothing written', !out.ok && out.reason === 'not_found' && jobsOf(admin).length === 0 && auditOf(admin).length === 0)
    const other = await API.autoFixProject('a9999999-2222-4333-8444-555555555555', grantRow(), depsFor(new FakeAdmin(rows())))
    check('F7b: a grant used for another project id: not_found', !other.ok && other.reason === 'not_found')
  }
  {
    const many = (n: number, path: string) => Array.from({ length: n }, (_, i) => `${SITE}/${path}-${i}/`)
    const metaPages = many(6, 'm')
    const linkPages = many(7, 'l')
    const altPages = many(6, 'a')
    const pages: Record<string, Item> = {}
    for (const u of metaPages) pages[u] = { title: 'A page', content: `<p>${LONG_TEXT}</p>` }
    for (const u of linkPages) pages[u] = { title: 'A page', content: CARE_HTML }
    for (const u of altPages) pages[u] = { title: 'A page', content: img('red-leather-boots.jpg') }
    const big = report([
      finding('description_missing', metaPages.map((u) => fp(u))),
      finding('broken_links', linkPages.map((u) => fp(DEAD, 'other', u))),
      finding('images_alt', altPages.map((u) => fp(u))),
    ])
    const r = await runOne({ deps: { scanReport: async () => big, plugin: fakePlugin(pages) } })
    const n = (t: FixType) => ofType(r.admin, t).length
    check('F8: the caps hold: at most 3 descriptions, 5 dead links, 10 fixes in all', n('meta_description') === 3 && n('broken_link') === 5 && jobsOf(r.admin).length === 10, { m: n('meta_description'), l: n('broken_link'), a: n('image_alt') })
    const late = await runOne({ deps: { deadlineAt: NOW + 10_000 } })
    check('F8b: the deadline holds: with too little time left no fix starts', late.out.ok && late.out.stopped === 'deadline' && jobsOf(late.admin).length === 0, late.out)
  }
  {
    const plugin = fakePlugin(PAGES, { fixStatus: 401 })
    const r = await runOne({ deps: { plugin } })
    const jobs = jobsOf(r.admin)
    check('F9: the plugin is lost mid-run: the fix is failed (never a manual row) and the run stops',
      jobs.length === 1 && jobs[0].status === 'failed' && r.out.ok && r.out.stopped === 'plugin', { jobs: jobs.map((j) => j.status), out: r.out })
  }
  {
    const admin = new FakeAdmin(rows())
    const scope = { projectId: P, userId: U }
    const at = new Date(NOW).toISOString()
    const until = new Date(NOW + AUTO.CLAIM_MS).toISOString()
    const both = await Promise.all([ASTORE.claimGrant(admin as never, scope, G, at, until), ASTORE.claimGrant(admin as never, scope, G, at, until)])
    check('F10: two claims at once: exactly one wins', both.filter(Boolean).length === 1, both)
    const later = new Date(NOW + AUTO.CLAIM_MS + 1000).toISOString()
    check('F10b: a claim left by a run that died is taken over once it has passed', await ASTORE.claimGrant(admin as never, scope, G, later, new Date(NOW + 2 * AUTO.CLAIM_MS).toISOString()))
    const foreign = await ASTORE.claimGrant(admin as never, { projectId: P, userId: OTHER }, G, later, later)
    check('F10c: another owner cannot claim it', !foreign)
  }
  {
    const grants = [0, 1, 2, 3, 4].map((i) => grantRow({ id: `c111111${i}-2222-4333-8444-555555555555`, project_id: `a111111${i}-2222-4333-8444-555555555555`, last_run_at: i === 4 ? null : ago(20 - i) }))
    grants.push(grantRow({ id: 'c1111119-2222-4333-8444-555555555555', project_id: 'a1111119-2222-4333-8444-555555555555', last_run_at: ago(2) }))
    const admin = new FakeAdmin({ site_fix_auto_grants: grants as unknown as Row[] })
    const seen: string[] = []
    const fixProject: typeof API.autoFixProject = async (projectId) => { seen.push(projectId); return { ok: true, applied: 1, failed: 0, skipped: 0, stopped: null } }
    const base = { depsFor: (u: string, ip: string | null) => ({ ...depsFor(admin), userId: u, ip }), fixProject, now: () => NOW, lastSignInAt: async () => ago(2) }
    const s = await RUN.runAutoFixes(admin as never, { ...base, deadlineAt: NOW + 280_000 })
    check('F11: at most 3 projects per run, never-run first then oldest, never one that ran this week',
      s.projects === 3 && seen.length === 3 && seen[0].startsWith('a1111114') && seen[1].startsWith('a1111110') && seen[2].startsWith('a1111111') && !seen.some((p) => p.startsWith('a1111119')), { s, seen })
    check('F11b: a project that ran has last_run_at set and its claim let go',
      grants.filter((g) => seen.includes(g.project_id)).every((g) => !!(admin.tables.site_fix_auto_grants.find((r) => r.id === g.id) as Row).last_run_at
        && (admin.tables.site_fix_auto_grants.find((r) => r.id === g.id) as Row).run_claimed_until === null))
    seen.length = 0
    const tight = await RUN.runAutoFixes(admin as never, { ...base, deadlineAt: NOW + 60_000 })
    check('F11c: less than 120 s left: no project starts', tight.projects === 0 && seen.length === 0, tight)
    const admin2 = new FakeAdmin({ site_fix_auto_grants: [grantRow() as unknown as Row] })
    seen.length = 0
    const away = await RUN.runAutoFixes(admin2 as never, { ...base, depsFor: () => depsFor(admin2), lastSignInAt: async () => ago(40), deadlineAt: NOW + 280_000 })
    check('F12: an owner who has not signed in for 30 days is skipped (no claim, no work)', away.projects === 0 && seen.length === 0 && away.skipped.inactive === 1
      && (admin2.tables.site_fix_auto_grants[0] as Row).run_claimed_until === null, away)
    const unreadable = await RUN.runAutoFixes(admin2 as never, { ...base, depsFor: () => depsFor(admin2), lastSignInAt: async () => 'unreadable', deadlineAt: NOW + 280_000 })
    check('F12b: a sign-in that cannot be read is not activity', unreadable.projects === 0 && seen.length === 0)
    const missing = new FakeAdmin({}, { site_fix_auto_grants: { select: () => ({ code: '42P01', message: 'relation "site_fix_auto_grants" does not exist' }) } })
    const m = await RUN.runAutoFixes(missing as never, { ...base, deadlineAt: NOW + 280_000 })
    check('F13: before the migration is applied the scheduler skips', !m.available && m.projects === 0)
    let threw = false
    await RUN.startIsolatedAutoFix(async () => { throw new Error('boom') }, { startedAtMs: NOW, maxDurationMs: 300_000, nowMs: () => NOW }).catch(() => { threw = true })
    check('F14: the isolated start never throws', !threw)
  }
  {
    // The switch itself.
    const admin = new FakeAdmin(rows({ site_fix_auto_grants: [] }))
    const sw = (body: Record<string, unknown>, over: Partial<API.FixesDeps> = {}) => API.handleAutoSetting({ projectId: P, ...body }, { ...depsFor(admin), userId: U, ip: '198.51.100.23', ...over })
    const noAck = await sw({ enabled: true, types: [...AUTO_SAFE_TYPES] })
    const wrongTypes = await sw({ enabled: true, acknowledged: true, types: ['image_alt'] })
    check('F15: turning it on needs the dialog\'s acknowledgement and exactly the covered types', noAck.status === 400 && wrongTypes.status === 400 && (admin.tables.site_fix_auto_grants ?? []).length === 0)
    const on = await sw({ enabled: true, acknowledged: true, types: ['meta_description', 'broken_link', 'image_alt'] })
    const row = (admin.tables.site_fix_auto_grants ?? [])[0] as Row | undefined
    check('F15b: on records the owner, the time and the request\'s IP', on.status === 200 && on.body.state === 'on' && !!row && row.enabled_by === U && row.user_id === U && row.enabled_ip === '198.51.100.23' && !!row.enabled_at, { on, row })
    const off = await sw({ enabled: false })
    check('F15c: off at once: disabled_at and disabled_by set', off.status === 200 && off.body.state === 'off' && !!row?.disabled_at && row?.disabled_by === U)
    const shopAdmin = new FakeAdmin(rows({ site_fix_auto_grants: [], shopify_connections: [{ project_id: P, user_id: U, connection_status: 'connected', archived_at: null, granted_scopes: 'write_content' }] }))
    const shop = await API.handleAutoSetting({ projectId: P, enabled: true, acknowledged: true, types: [...AUTO_SAFE_TYPES] }, { ...depsFor(shopAdmin), userId: U })
    check('F15d: Shopify is refused', shop.status === 400 && shop.body.code === 'not_allowed' && (shopAdmin.tables.site_fix_auto_grants ?? []).length === 0)
    const noPlugin = new FakeAdmin(rows({ site_fix_auto_grants: [], site_fix_plugin_links: [] }))
    const np = await API.handleAutoSetting({ projectId: P, enabled: true, acknowledged: true, types: [...AUTO_SAFE_TYPES] }, { ...depsFor(noPlugin), userId: U })
    check('F15e: without the plugin: needs_plugin', np.status === 409 && np.body.code === 'needs_plugin')
    const other = await API.handleAutoSetting({ projectId: P, enabled: true, acknowledged: true, types: [...AUTO_SAFE_TYPES] }, { ...depsFor(new FakeAdmin(rows({ site_fix_auto_grants: [] }))), userId: OTHER })
    check('F15f: another user\'s project: not_found', other.status === 404)
    const anon = await API.handleAutoSetting({ projectId: P, enabled: false }, { ...depsFor(admin), userId: null })
    check('F15g: not signed in: 401', anon.status === 401)
    const missing = new FakeAdmin(rows(), { site_fix_auto_grants: { select: () => ({ code: '42P01', message: 'relation "site_fix_auto_grants" does not exist' }) } })
    const g = await API.handleAutoGet(P, { ...depsFor(missing), userId: U })
    check('F16: GET while the table is missing: available false (the card hides)', g.status === 200 && g.body.available === false)
    const q = await API.handleFixesGet(P, { ...depsFor(missing), userId: U })
    check('F16b: the queue answer says unavailable too (the panel hides)', q.status === 200 && (q.body.auto as { state?: string })?.state === 'unavailable')
    const ready = await API.handleAutoGet(P, { ...depsFor(new FakeAdmin(rows({ site_fix_auto_grants: [] }))), userId: U })
    check('F16c: GET on a plugin site: available, off, can be turned on, lists what it covers and never covers',
      ready.body.available === true && ready.body.state === 'off' && ready.body.canEnable === true && same(ready.body.types as string[], AUTO_SAFE_TYPES) && (ready.body.never as string[]).length === 8, ready.body)
  }

  // ── G) undo and retry ─────────────────────────────────────────────────────
  console.log('\nG) undo and retry')
  {
    const r = await runOne()
    const user = { ...r.deps, userId: U, ip: '198.51.100.30' }
    const views = await API.handleFixesGet(P, user)
    const list = views.body.jobs as { id: string; auto?: boolean; batchId?: string | null; canUndo: boolean }[]
    check('G0: the queue shows automatic fixes as automatic, grouped by the run', list.length === 3 && list.every((j) => j.auto === true && j.batchId === RUN_ID && j.canUndo))
    const one = await API.handleFixesPost({ projectId: P, action: 'undo', jobId: list[0].id }, user)
    check('G1: undo works on an automatic fix', one.status === 200 && (jobsOf(r.admin).find((j) => j.id === list[0].id) as Row).status === 'reverted')
    const all = await API.handleFixesPost({ projectId: P, action: 'undo_batch', batch: RUN_ID }, user)
    check('G2: undo_batch works on an automatic run', all.status === 200 && all.body.undone === 2 && jobsOf(r.admin).every((j) => j.status === 'reverted'), all.body)
    const again = await API.autoFixProject(P, grantRow(), { ...depsFor(r.admin), runId: 'b0000000-0000-4000-8000-000000000002' })
    check('G2b: what the owner undid is never re-applied by the next run', jobsOf(r.admin).length === 3 && again.ok, again)
  }
  {
    const failedJob = () => seedJob({ id: 'd0000000-0000-4000-8000-000000000001', status: 'failed', applied_at: null, error_code: 'plugin_rejected', undo: { expected: sha(ABOUT_HTML), via: 'content', batch: RUN_ID, auto: G }, payload: { images: [{ src: `${SITE}/a.jpg`, alt: 'Red boots' }] } })
    const failed = failedJob()
    const admin = new FakeAdmin(rows({ site_fix_jobs: [failed] }))
    const r = await API.handleFixesPost({ projectId: P, action: 'retry', jobId: failed.id }, { ...depsFor(admin), userId: U })
    const after = jobsOf(admin)[0]
    check('G3: retry keeps auto (and the batch)', r.status === 200 && after.status === 'applied' && (after.undo as { auto?: string }).auto === G && (after.undo as { batch?: string }).batch === RUN_ID, { r: r.body, undo: after.undo })
    await withMutant<typeof API, void>('lib/site-fix/api.ts', [['  if (auto) Object.assign(ctx, { auto })\n', '']], async (M) => {
      const a2 = new FakeAdmin(rows({ site_fix_jobs: [failedJob()] }))
      const m = await M.handleFixesPost({ projectId: P, action: 'retry', jobId: failed.id }, { ...depsFor(a2), userId: U })
      check('MUTATION CONTROL: a retry that drops auto is caught by G3', m.status === 200 && !(jobsOf(a2)[0].undo as { auto?: string }).auto, jobsOf(a2)[0].undo)
    })
  }

  // ── H) source guards ──────────────────────────────────────────────────────
  console.log('\nH) source guards')
  const CRON = strip(read('app/api/site-health/auto-fix/cron/route.ts'))
  const cronOk = (s: string) => {
    const auth = s.indexOf("authorizeCronRequest(request, 'site-fix-auto')")
    const kill = s.indexOf("process.env.SITE_FIX_AUTO_ENABLED !== 'true'")
    const aft = s.indexOf('after(')
    return auth > 0 && kill > auth && aft > kill && /if \(denied\) return denied/.test(s) && /status: 202/.test(s)
      && /export const maxDuration = 300/.test(s) && /export const dynamic = 'force-dynamic'/.test(s) && /startIsolatedAutoFix\(/.test(s)
  }
  check('H1: the cron route authorizes first, then the kill switch, then after(), and answers 202', cronOk(CRON))
  check('MUTATION CONTROL: a cron route without the kill switch is caught by H1', !cronOk(CRON.replace(/if \(process\.env\.SITE_FIX_AUTO_ENABLED !== 'true'\)[^\n]*\n/, '')))
  check('MUTATION CONTROL: work scheduled before the secret is checked is caught by H1', !cronOk(CRON.replace("const denied = authorizeCronRequest(request, 'site-fix-auto')", "after(() => undefined)\n  const denied = authorizeCronRequest(request, 'site-fix-auto')")))
  {
    const admin = new FakeAdmin(rows())
    const body = { projectId: P, action: 'approve', approved: true, kind: 'images_alt', pageUrl: ABOUT, fix: { type: 'image_alt', images: [{ src: `${SITE}/a.jpg`, alt: 'Red boots' }] }, expected: 'x', auto: G, bulk: undefined }
    await API.handleFixesPost(body, { ...depsFor(admin), userId: U })
    const job = jobsOf(admin)[0]
    check('H2: handleFixesPost ignores an `auto` field: the job is a click, approved by the signed-in user', !!job && !(job.undo as { auto?: unknown }).auto && job.approved_by === U)
    const viaAction = await API.handleFixesPost({ projectId: P, action: 'auto' }, { ...depsFor(admin), userId: U })
    check('H2b: there is no automatic action in handleFixesPost', viaAction.status === 400)
    const post = strip(read('lib/site-fix/api.ts'))
    const switchBody = (s: string) => /export async function handleFixesPost[\s\S]*?\n\}\n/.exec(s)?.[0] ?? ''
    const sealed = (s: string) => { const b = switchBody(s); return b.length > 0 && !/autoFixProject|auto:/.test(b) }
    check('H2c: handleFixesPost never reaches autoFixProject (source)', sealed(post))
    check('MUTATION CONTROL: an automatic case in the switch is caught by H2c', !sealed(post.replace("case 'undo_batch': return await undoBatch(b, l, deps)", "case 'undo_batch': return await undoBatch(b, l, deps)\n      case 'auto': return { status: 200, body: { ok: true, r: await autoFixProject(String(b.projectId), b.grant as never, deps as never) } }")))
  }
  {
    const ROUTE = strip(read('app/api/site-health/auto-fix/route.ts'))
    const DEPS = strip(read('lib/site-fix/route-deps.ts'))
    const ipOk = (route: string, deps: string) => !/x-forwarded-for|x-real-ip|headers\.get|request\.ip/i.test(route) && /routeDeps\(user\?\.id \?\? null, request\.headers\)/.test(route)
      && /export function routeDeps[\s\S]*?clientIpFrom\(headers\)/.test(deps)
      && !/headers/i.test(/export function cronDeps[\s\S]*?\n\}\n/.exec(deps)?.[0] ?? 'headers')
    check('H3: the switch route reads the IP only through clientIpFrom; the scheduler reads no header at all', ipOk(ROUTE, DEPS))
    check('MUTATION CONTROL: a route reading x-forwarded-for itself is caught by H3', !ipOk(ROUTE.replace('const body =', "const fwd = request.headers.get('x-forwarded-for')\n  const body ="), DEPS))
    check('MUTATION CONTROL: a scheduler that takes the IP from headers is caught by H3', !ipOk(ROUTE, DEPS.replace('const deps = baseDeps(userId, ip ? ip.slice(0, 64) : null)', 'const deps = baseDeps(userId, clientIpFrom(new Headers()))')))
  }
  {
    const vercel = (raw: string) => (JSON.parse(raw) as { crons?: { path: string; schedule: string }[] }).crons?.some((c) => c.path === '/api/site-health/auto-fix/cron' && /^\d+ \d+ \* \* \*$/.test(c.schedule)) ?? false
    const V = read('vercel.json')
    check('H4: vercel.json schedules the automatic-fix cron once a day', vercel(V))
    check('MUTATION CONTROL: a vercel.json without it is caught by H4', !vercel(V.replace('/api/site-health/auto-fix/cron', '/api/site-health/auto-fix/cron-off')))
  }
  {
    const CARD = strip(read('components/settings/SiteAutoFixCard.tsx'))
    const hides = (s: string) => /body\?\.ok && body\.available === true/.test(s) && /if \(load\.status !== 'ready'\) return null/.test(s)
    check('H5: the settings card renders nothing until the switch is installed and readable', hides(CARD))
    check('MUTATION CONTROL: a card that renders while the table is missing is caught by H5', !hides(CARD.replace("if (load.status !== 'ready') return null", '')))
  }
  {
    const files: string[] = []
    const walk = (dir: string) => {
      for (const name of readdirSync(join(ROOT, dir))) {
        if (name === 'node_modules' || name.startsWith('.')) continue
        const rel = `${dir}/${name}`
        if (statSync(join(ROOT, rel)).isDirectory()) walk(rel)
        else if (/\.(ts|tsx)$/.test(name) && !/__qa__/.test(rel)) files.push(rel)
      }
    }
    for (const d of ['lib', 'app', 'components']) walk(d)
    const callers = (list: string[], src: (f: string) => string) => list.filter((f) => f !== 'lib/site-fix/auto-store.ts' && /\blistDueGrants\b/.test(strip(src(f))))
    const found = callers(files, read)
    check('H6: the one cross-project listing of grants is used by auto-run.ts only', JSON.stringify(found) === JSON.stringify(['lib/site-fix/auto-run.ts']), found)
    const planted = callers(files, (f) => (f === 'lib/site-fix/api.ts' ? `${read(f)}\nlistDueGrants()` : read(f)))
    check('MUTATION CONTROL: a second caller is caught by H6', planted.length === 2)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
