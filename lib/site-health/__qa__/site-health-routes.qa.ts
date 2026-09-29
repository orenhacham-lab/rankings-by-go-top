/**
 * Site health — the routes' contract (lib/site-health/api.ts, wordpress-fix.ts).
 *
 *   O) OWNER FILTER on every read and write: the service role bypasses RLS, so a
 *      project, a connection, an index or an entity of another owner — even under
 *      the same project id — must never be read, fetched or written to. Checked at
 *      runtime (FakeAdmin with another owner's rows) AND in the source (every
 *      `.from()` of the site-health modules carries `.eq('user_id', …)`).
 *   P) FIX ONLY ON EXPLICIT APPROVAL: the preview writes nothing; apply writes only
 *      with `approved: true` and the value the preview read; a page changed since
 *      the preview is refused; a second click writes nothing (idempotent); every
 *      applied fix returns its undo. In the app, only the preview modal's approve
 *      and undo buttons send `approved: true`.
 *   R) NO RAW PROVIDER ERROR TEXT: what WordPress (or the network) says never
 *      reaches an answer; the routes answer stable codes.
 *   S) the one-click fixes do exactly what the preview showed: title only, alt
 *      attributes only, one natural link only (and undo removes just that link).
 *
 * Every guard has a MUTATION CONTROL: the same check against a broken copy of the
 * code (written to a temp dir and loaded) or a broken source must fail.
 *
 * Run: npx tsx lib/site-health/__qa__/site-health-routes.qa.ts
 */
/* eslint-disable @typescript-eslint/no-require-imports */
import { mkdtempSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'fs'
import { tmpdir } from 'os'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import * as API from '../api'
import * as FIX from '../wordpress-fix'
import { WordPressClientError } from '../../wordpress/client'
import type { ScanDeps } from '../scan'
import type { ScanStreamLine } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

function mutant<T>(rel: string, from: string, to: string): { mod: T | null; found: boolean } {
  const src = read(rel)
  const found = src.includes(from)
  if (!found) return { mod: null, found }
  const dir = mkdtempSync(join(tmpdir(), 'site-health-routes-mutant-'))
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

// ── A fake WordPress site ────────────────────────────────────────────────────

type Item = { endpoint: '/posts' | '/pages'; id: number; link: string; title: string; content: string }
function fakeWp(opts: { plugin?: 'yoast' | 'none'; bridge?: boolean; throwWith?: unknown } = {}) {
  const items: Item[] = [
    { endpoint: '/pages', id: 11, link: `${SITE}/about/`, title: 'About us – the whole long story of how the shop began and grew', content: '<!-- wp:paragraph --><p>We make boots.</p><!-- /wp:paragraph --><!-- wp:image --><figure><img src="https://shop.example.org/wp-content/uploads/red-boots-1024x768.jpg" class="wp-image-5"/></figure><!-- /wp:image --><p><img src="https://shop.example.org/wp-content/uploads/IMG_1234.jpg" alt=""></p><p><img src="/ok.jpg" alt="fine"></p>' },
    { endpoint: '/posts', id: 21, link: `${SITE}/blog/care/`, title: 'Caring for leather', content: '<h2>Intro</h2><p>Leather is a living material, and like skin it dries out, cracks and stains when it is left alone for a season. A few minutes of care every month keeps a good pair looking new for years, and it costs far less than replacing them after one hard winter outdoors.</p><p>Leather needs care. Our guide to waterproof boots explains how to keep them dry through winter.</p>' },
    { endpoint: '/posts', id: 22, link: `${SITE}/blog/waterproof-boots/`, title: 'Waterproof boots', content: '<p>Orphan page.</p>' },
  ]
  const writes: { kind: 'fields' | 'seo'; id: number; payload: unknown }[] = []
  const live: Record<string, { title: string | null; description: string | null; h1: string | null }> = {
    [`${SITE}/about/`]: { title: 'About us – the whole long story of how the shop began and grew', description: null, h1: 'About us' },
  }
  const guard = () => { if (opts.throwWith) throw opts.throwWith }
  const deps: FIX.WpFixDeps = {
    findItemByUrl: async (_c, url) => { guard(); const i = items.find((x) => x.link.replace(/\/$/, '') === url.replace(/\/$/, '')); return i ? { endpoint: i.endpoint, id: i.id, link: i.link } : null },
    getItemForEdit: async (_c, endpoint, id) => { guard(); const i = items.find((x) => x.id === id && x.endpoint === endpoint)!; return { ...i } },
    updateItemFields: async (_c, _e, id, fields) => {
      guard()
      writes.push({ kind: 'fields', id, payload: fields })
      const i = items.find((x) => x.id === id)!
      if (typeof fields.title === 'string') i.title = fields.title
      if (typeof fields.content === 'string') i.content = fields.content
    },
    searchItems: async (_c, _e, term) => { guard(); return items.filter((i) => i.content.toLowerCase().includes(term.toLowerCase())).map((i) => ({ id: i.id, link: i.link, title: i.title })) },
    detectSeoCapabilities: async () => ({ plugin: opts.plugin ?? 'none', hasBridge: !!opts.bridge }),
    writeVerifiedSeoMeta: async (_c, id, seo) => { writes.push({ kind: 'seo', id, payload: seo }); return { plugin: 'yoast', status: 'verified' } },
    readLivePage: async (url) => live[url] ?? null,
  }
  return { deps, items, writes, live }
}

const baseRows = () => ({
  projects: [
    { id: P, user_id: U, target_domain: 'shop.example.org', business_name: 'Boot Shop', name: 'Boots' },
  ],
  wordpress_connections: [
    { project_id: P, user_id: U, site_url: SITE, wp_username: 'owner', wp_application_password_encrypted: 'enc:owner', connection_status: 'connected' },
  ],
})

async function main() {
  console.log('Site health — routes: owner filter, approval, no raw errors\n')
  type Api = typeof API
  type Fix = typeof FIX

  console.log('O) owner filter on every read and write')
  // SCAN: another owner's rows under the SAME project id must be invisible.
  const scanRun = async (A: Api, rows: Record<string, Record<string, unknown>[]>, userId: string | null = U) => {
    const requested: string[] = []
    const scanDeps: ScanDeps = {
      fetchImpl: (async () => new Response('', { status: 200 })) as typeof fetch,
      assertHost: async () => ({ ok: true }),
      now: () => Date.now(),
      fetchText: (async (url: URL) => { requested.push(url.toString()); return { ok: true, url: url.toString(), status: 404, text: '' } }) as ScanDeps['fetchText'],
      fetchHtml: (async (url: URL) => {
        requested.push(url.toString())
        return { ok: true, url: url.toString(), status: 200, truncated: false, html: '<html><head><title>A page title of a perfectly good length</title><meta name="viewport" content="x"></head><body><h1>x</h1></body></html>' }
      }) as ScanDeps['fetchHtml'],
    }
    const lines: ScanStreamLine[] = []
    const status = await A.handleScan({ projectId: P }, { userId, admin: new FakeAdmin(rows) as never, scan: scanDeps }, (l) => lines.push(l))
    const report = lines.find((l) => l.type === 'report')
    return { status, lines, requested, report: report && report.type === 'report' ? report.report : null }
  }
  const leakyRows = () => ({
    ...baseRows(),
    wordpress_connections: [{ project_id: P, user_id: OTHER, site_url: SITE, wp_username: 'x', wp_application_password_encrypted: 'enc:other', connection_status: 'connected' }],
    shopify_entities: [
      { project_id: P, user_id: U, entity_type: 'product', canonical_url: `${SITE}/products/own`, shopify_gid: 'gid://shopify/Product/1', is_active: true, shopify_updated_at: '2026-01-01' },
      { project_id: P, user_id: OTHER, entity_type: 'product', canonical_url: `${SITE}/products/LEAKED`, shopify_gid: 'gid://shopify/Product/2', is_active: true, shopify_updated_at: '2026-01-02' },
    ],
    shopify_connections: [{ project_id: P, user_id: OTHER, connection_status: 'connected', archived_at: null, shop_domain: 'other.myshopify.com' }],
  })
  const ownerScanChecks = async (A: Api) => {
    const r = await scanRun(A, leakyRows())
    return {
      O1: r.status === 200 && !!r.report,
      O2: !r.requested.some((u) => u.includes('LEAKED')) && r.requested.some((u) => u.includes('/products/own')),
      O3: !!r.report && r.report.connections.wordpress === false && r.report.connections.shopify === false,
    }
  }
  {
    const r = await ownerScanChecks(API)
    check('O1: the owner\'s own scan runs', r.O1)
    check('O2: another owner\'s entity under the same project id is never fetched', r.O2)
    check('O3: another owner\'s WordPress / Shopify connection does not count as this project\'s', r.O3)
    const notMine = await scanRun(API, { projects: [{ id: P, user_id: OTHER, target_domain: 'shop.example.org', business_name: 'Boot Shop', name: 'Boots' }] })
    check('O4: a project of another owner: not_found, and nothing is fetched', notMine.status === 404 && notMine.requested.length === 0 && notMine.lines.some((l) => l.type === 'error' && l.code === 'not_found'))
    const anon = await scanRun(API, baseRows(), null)
    check('O5: not signed in: 401, nothing read or fetched', anon.status === 401 && anon.requested.length === 0)
    const m = mutant<Api>('lib/site-health/sources.ts', ".eq('project_id', projectId).eq('user_id', userId).eq('is_active', true)", ".eq('project_id', projectId).eq('is_active', true)")
    check('MUTATION CONTROL: the entities owner filter the control removes is where it expects it', m.found)
    // The mutated sources module has to be the one api.ts loads: load api.ts with its ./sources import pointed at the mutant.
    let caught = false
    if (m.found) {
      const dir = mkdtempSync(join(tmpdir(), 'site-health-routes-mutant-'))
      try {
        const rewrite = (src: string) => src.replace(/from '@\/([^']+)'/g, (_x, p) => `from '${join(ROOT, p)}'`).replace(/from '\.\/([^']+)'/g, (_x, p) => (p === 'sources' ? `from './sources'` : `from '${join(ROOT, 'lib/site-health', p)}'`))
        writeFileSync(join(dir, 'sources.ts'), rewrite(read('lib/site-health/sources.ts').replace(".eq('project_id', projectId).eq('user_id', userId).eq('is_active', true)", ".eq('project_id', projectId).eq('is_active', true)")))
        writeFileSync(join(dir, 'api.ts'), rewrite(read('lib/site-health/api.ts')))
        const mod = require(join(dir, 'api.ts')) as Api
        caught = !(await ownerScanChecks(mod)).O2
      } finally { rmSync(dir, { recursive: true, force: true }) }
    }
    check('MUTATION CONTROL: sources without the owner filter are caught by O2 (another owner\'s page is fetched)', caught)
  }

  // FIX: the connection must be the owner's, and the project too.
  // The fix-queue tables (lib/site-fix) are absent unless `queue` is set: the older path is what these checks cover.
  const MISSING = { select: () => ({ code: '42P01', message: 'relation does not exist' }) }
  const fixRun = async (A: Api, body: Record<string, unknown>, rows = baseRows(), wp = fakeWp(), userId: string | null = U, queue = false) => {
    const decrypted: string[] = []
    const hooks = queue ? {} : { site_fix_jobs: MISSING, site_fix_audit: MISSING }
    const answer = await A.handleFix(body, { userId, admin: new FakeAdmin(rows, hooks) as never, decrypt: (s) => { decrypted.push(s); return 'app-pass' }, wp: wp.deps })
    return { answer, decrypted, wp }
  }
  const preview = { projectId: P, action: 'preview', field: 'title', url: `${SITE}/about/`, kind: 'title_long' }
  {
    const other = await fixRun(API, preview, { ...baseRows(), wordpress_connections: [{ project_id: P, user_id: OTHER, site_url: SITE, wp_username: 'x', wp_application_password_encrypted: 'enc:other', connection_status: 'connected' }] })
    check('O6: another owner\'s WordPress connection on the same project is never decrypted or used', other.answer.body.ok === false && (other.answer.body as { code: string }).code === 'no_connection' && other.decrypted.length === 0)
    const notMine = await fixRun(API, preview, { ...baseRows(), projects: [{ id: P, user_id: OTHER, target_domain: 'shop.example.org', business_name: 'Boot Shop', name: 'Boots' }] })
    check('O7: a project of another owner: not_found, WordPress untouched', notMine.answer.status === 404 && notMine.decrypted.length === 0)
    const anon = await fixRun(API, preview, baseRows(), fakeWp(), null)
    check('O8: not signed in: 401', anon.answer.status === 401 && anon.decrypted.length === 0)
    const off = await fixRun(API, { ...preview, url: 'https://evil.example.com/about/' })
    check('O9: an address outside the project\'s site is refused (off_site) before WordPress is asked', off.answer.status === 400 && (off.answer.body as { code: string }).code === 'off_site')
    const m = mutant<Api>('lib/site-health/api.ts', ".eq('project_id', scope.projectId)\n    .eq('user_id', scope.userId)", ".eq('project_id', scope.projectId)")
    const r = m.mod ? await fixRun(m.mod, preview, { ...baseRows(), wordpress_connections: [{ project_id: P, user_id: OTHER, site_url: SITE, wp_username: 'x', wp_application_password_encrypted: 'enc:other', connection_status: 'connected' }] }) : null
    check('MUTATION CONTROL: a connection read without the owner filter is caught by O6', m.found && !!r && r.decrypted.length > 0)
    const m2 = mutant<Api>('lib/site-health/api.ts', ".eq('id', projectId)\n    .eq('user_id', deps.userId)", ".eq('id', projectId)")
    const r2 = m2.mod ? await fixRun(m2.mod, preview, { ...baseRows(), projects: [{ id: P, user_id: OTHER, target_domain: 'shop.example.org', business_name: 'Boot Shop', name: 'Boots' }] }) : null
    check('MUTATION CONTROL: a project read by id alone is caught by O7', m2.found && !!r2 && r2.answer.status !== 404)
  }

  // SOURCE: every .from(<table>) chain in the site-health modules carries the owner filter.
  const ownerFiltered = (src: string) => {
    const s = strip(src)
    const chains = [...s.matchAll(/\.from\('([a-z_]+)'\)([\s\S]*?)(?=\n\s*(?:admin\.from|\]\)|const |if |return |for ))/g)]
    return chains.length > 0 && chains.every((c) => /\.eq\('user_id',/.test(c[2]))
  }
  const SOURCES = ['lib/site-health/sources.ts', 'lib/site-health/api.ts']
  check('O10: every table read in the site-health modules is filtered by the owner (source)', SOURCES.every((f) => ownerFiltered(read(f))))
  check('MUTATION CONTROL: a read without .eq(\'user_id\') is caught by O10', !ownerFiltered(read('lib/site-health/sources.ts').replace(".eq('project_id', projectId).eq('user_id', userId).maybeSingle(),\n    admin.from('project_profiles')", ".eq('project_id', projectId).maybeSingle(),\n    admin.from('project_profiles')")))

  console.log('\nP) fix only on explicit approval')
  const applyTitle = (over: Record<string, unknown> = {}) => ({ projectId: P, action: 'apply', field: 'title', url: `${SITE}/about/`, via: 'wp_title', after: 'About us – how the shop began', expected: 'About us – the whole long story of how the shop began and grew', approved: true, ...over })
  const approvalChecks = async (A: Api) => {
    const wp = fakeWp()
    const pv = await fixRun(A, preview, baseRows(), wp)
    const writesAfterPreview = wp.writes.length
    const noApproval = await fixRun(A, applyTitle({ approved: undefined }), baseRows(), wp)
    const stringApproval = await fixRun(A, applyTitle({ approved: 'true' }), baseRows(), wp)
    const noExpected = await fixRun(A, applyTitle({ expected: undefined }), baseRows(), wp)
    const writesBefore = wp.writes.length
    const ok = await fixRun(A, applyTitle(), baseRows(), wp)
    const titleAfterApply = wp.items[0].title
    const again = await fixRun(A, applyTitle(), baseRows(), wp)
    const writesAfterAgain = wp.writes.length
    const wp2 = fakeWp()
    wp2.items[0].title = 'Edited by the merchant in the meantime'
    const changed = await fixRun(A, applyTitle(), baseRows(), wp2)
    const body = ok.answer.body as { ok: boolean; status?: string; undo?: Record<string, unknown> | null }
    const undo = body.undo ? await fixRun(A, { ...body.undo, projectId: P, action: 'apply', approved: true }, baseRows(), wp) : null
    return {
      P1: pv.answer.body.ok === true && writesAfterPreview === 0,
      P2: [noApproval, stringApproval, noExpected].every((r) => (r.answer.body as { code?: string }).code === 'approval_required') && writesBefore === 0,
      P3: body.ok && body.status === 'applied' && titleAfterApply === 'About us – how the shop began',
      P4: (again.answer.body as { status?: string }).status === 'already' && writesAfterAgain === 1,
      P5: (changed.answer.body as { code?: string }).code === 'changed_since_preview' && wp2.writes.length === 0 && wp2.items[0].title === 'Edited by the merchant in the meantime',
      P6: !!undo && undo.answer.body.ok === true && wp.items[0].title === 'About us – the whole long story of how the shop began and grew',
      P7: JSON.stringify(wp.writes[0]?.payload) === JSON.stringify({ title: 'About us – how the shop began' }),
    }
  }
  {
    const r = await approvalChecks(API)
    check('P1: the preview reads and proposes, and writes nothing', r.P1)
    check('P2: apply without approved: true (missing, or the string "true"), or without the previewed value, is refused and writes nothing', r.P2)
    check('P3: the approved value is written', r.P3)
    check('P4: a second click writes nothing more (idempotent: "already")', r.P4)
    check('P5: a page changed since the preview is refused (compare-and-set) and left alone', r.P5)
    check('P6: the returned undo restores the previous value', r.P6)
    check('P7: a title fix sends the title ONLY (never status, content, slug)', r.P7)
    const m = mutant<Api>('lib/site-health/api.ts', "if (b.approved !== true) return refuse('approval_required')", '')
    check('MUTATION CONTROL: the approval check the control removes is where it expects it', m.found)
    const rm = m.mod ? await approvalChecks(m.mod) : null
    check('MUTATION CONTROL: an apply without the approval check is caught by P2', !!rm && !rm.P2)
    const mf = mutant<Fix>('lib/site-health/wordpress-fix.ts', "if (full.title !== req.expected) return fail('changed_since_preview')", '')
    let caughtCas = false
    if (mf.found) {
      const wp2 = fakeWp()
      wp2.items[0].title = 'Edited by the merchant in the meantime'
      const res = await mf.mod!.applyFix({ siteUrl: SITE, username: 'u', applicationPassword: 'p' }, { field: 'title', url: `${SITE}/about/`, via: 'wp_title', after: 'X title', expected: 'About us – the whole long story of how the shop began and grew' }, wp2.deps)
      caughtCas = res.ok === true
    }
    check('MUTATION CONTROL: an apply without compare-and-set is caught by P5', caughtCas)
  }
  {
    // Once the fix queue exists every write goes through it (approved, audited, undoable): this path refuses to write.
    const queueChecks = async (A: Api) => {
      const wp = fakeWp()
      const pv = await fixRun(A, preview, baseRows(), wp, U, true)
      const ap = await fixRun(A, applyTitle(), baseRows(), wp, U, true)
      return { Q1: pv.answer.body.ok === true && (ap.answer.body as { code?: string }).code === 'use_fix_queue' && ap.answer.status === 409 && wp.writes.length === 0 }
    }
    check('P11: with the fix queue in place, the older apply refuses (use_fix_queue) and writes nothing; its preview still reads', (await queueChecks(API)).Q1)
    const m = mutant<Api>('lib/site-health/api.ts', "if (await queueAvailable(deps.admin, { projectId, userId: deps.userId })) return refuse('use_fix_queue')", '')
    const r = m.mod ? await queueChecks(m.mod) : null
    check('MUTATION CONTROL: an apply that ignores the fix queue is caught by P11', m.found && !!r && !r.Q1)
  }
  {
    const senders = (dir: string): string[] => readdirSync(join(ROOT, dir)).flatMap((n) => {
      const rel = `${dir}/${n}`
      if (n === 'node_modules' || n === '__qa__') return []
      if (statSync(join(ROOT, rel)).isDirectory()) return senders(rel)
      return /\.tsx?$/.test(n) && /approved:\s*true/.test(strip(read(rel))) ? [rel] : []
    })
    const found = [...senders('components'), ...senders('app')]
    const SENDERS = ['components/site-health/ApproveFixModal.tsx', 'components/site-health/FixPreviewModal.tsx']
    check('P8: only the two approval modals (their approve and undo buttons) send approved: true', JSON.stringify([...found].sort()) === JSON.stringify(SENDERS), found.join(', '))
    const modal = strip(read('components/site-health/FixPreviewModal.tsx'))
    const count = (modal.match(/approved:\s*true/g) ?? []).length
    const inApprove = modal.slice(modal.indexOf('const approve = useCallback'), modal.indexOf('const undo = useCallback'))
    const inUndo = modal.slice(modal.indexOf('const undo = useCallback'), modal.indexOf('const title ='))
    check('P9: …once in approve, once in undo, and nowhere on load', count === 2 && /approved:\s*true/.test(inApprove) && /approved:\s*true/.test(inUndo))
    const autoApply = modal.replace("void post<PreviewBody>({\n      projectId, action: 'preview'", "void post<PreviewBody>({\n      approved: true, projectId, action: 'preview'")
    check('MUTATION CONTROL: a modal that sends approval on load is caught by P9', (autoApply.match(/approved:\s*true/g) ?? []).length !== 2)
    // The queue's approval modal: approved: true only inside its approve callback (undo, cancel and retry need no approval flag).
    const queueModal = strip(read('components/site-health/ApproveFixModal.tsx'))
    const onlyInApprove = (src: string) => {
      const at = src.indexOf('const approve = useCallback')
      const end = src.indexOf('const undo = useCallback')
      return (src.match(/approved:\s*true/g) ?? []).length === 1 && at >= 0 && end > at && /approved:\s*true/.test(src.slice(at, end))
    }
    check('P10: the fix-queue modal sends approved: true once, from its "Approve fix" callback only', onlyInApprove(queueModal))
    const eager = queueModal.replace("projectId, action: 'preview', type,", "projectId, action: 'preview', approved: true, type,")
    check('MUTATION CONTROL: a queue modal that sends approval with its preview is caught by P10', eager !== queueModal && !onlyInApprove(eager))
  }

  console.log('\nR) no raw provider error text')
  const SECRET = 'Sorry, you are not allowed to edit this post. token=abc123 at 10.0.0.7'
  const rawChecks = async (A: Api) => {
    const e1 = await fixRun(A, preview, baseRows(), fakeWp({ throwWith: new WordPressClientError(SECRET, { status: 403, sanitizedMessage: SECRET }) }))
    const e2 = await fixRun(A, applyTitle(), baseRows(), fakeWp({ throwWith: new Error(`connect ECONNREFUSED ${SECRET}`) }))
    const leaks = (x: unknown) => /not allowed|token=|ECONNREFUSED|10\.0\.0\.7/.test(JSON.stringify(x))
    return {
      R1: (e1.answer.body as { code?: string }).code === 'wordpress_permission' && !leaks(e1.answer.body),
      R2: (e2.answer.body as { code?: string }).code === 'wordpress_unreachable' && !leaks(e2.answer.body),
    }
  }
  {
    const r = await rawChecks(API)
    check('R1: a WordPress refusal is the code wordpress_permission, without WordPress\'s words', r.R1)
    check('R2: a network failure is the code wordpress_unreachable, without its text', r.R2)
    const m = mutant<Api>('lib/site-health/wordpress-fix.ts', "  return 'wordpress_unreachable'\n}", "  return (err as Error).message as SiteHealthErrorCode\n}")
    let caught = false
    if (m.found) {
      const dir = mkdtempSync(join(tmpdir(), 'site-health-routes-mutant-'))
      try {
        const rewrite = (src: string) => src.replace(/from '@\/([^']+)'/g, (_x, p) => `from '${join(ROOT, p)}'`).replace(/from '\.\/([^']+)'/g, (_x, p) => (p === 'wordpress-fix' ? `from './wordpress-fix'` : `from '${join(ROOT, 'lib/site-health', p)}'`))
        writeFileSync(join(dir, 'wordpress-fix.ts'), rewrite(read('lib/site-health/wordpress-fix.ts').replace("  return 'wordpress_unreachable'\n}", "  return (err as Error).message as SiteHealthErrorCode\n}")))
        writeFileSync(join(dir, 'api.ts'), rewrite(read('lib/site-health/api.ts')))
        caught = !(await rawChecks(require(join(dir, 'api.ts')) as Api)).R2
      } finally { rmSync(dir, { recursive: true, force: true }) }
    }
    check('MUTATION CONTROL: a fix engine that passes the error text on is caught by R2', m.found && caught)
    const routes = ['app/api/site-health/scan/route.ts', 'app/api/site-health/fix/route.ts'].map((f) => strip(read(f)))
    const noRaw = (s: string) => !/\.message\b/.test(s) && !/String\((?:e|err|error)\)/.test(s)
    check('R3: the routes never put an error\'s text in an answer or a log', routes.every(noRaw))
    check('MUTATION CONTROL: a route answering with the error message is caught by R3', !noRaw(routes[1].replace("code: 'wordpress_unreachable'", 'code: (e as Error).message')))
    const screen = ['components/site-health/SiteHealthScreen.tsx', 'components/site-health/FixPreviewModal.tsx'].map((f) => strip(read(f))).join('\n')
    check('R4: the screen shows only dictionary sentences for errors (copy.errors[code])', /copy\.errors\[/.test(screen) && !/\.message\b/.test(screen))
  }

  console.log('\nS) the fixes do exactly what the preview showed')
  {
    const wp = fakeWp()
    const pv = await fixRun(API, { projectId: P, action: 'preview', field: 'alt', url: `${SITE}/about/`, kind: 'images_alt' }, baseRows(), wp)
    const body = pv.answer.body as { ok: boolean; images?: { src: string; after: string }[]; expected?: string }
    check('S1: the alt preview lists only the content images without alt', !!body.images && body.images.length === 2 && !body.images.some((i) => i.src.endsWith('/ok.jpg')), JSON.stringify(body.images))
    check('S2: suggestions: file words, or the page title for a camera name', body.images?.[0]?.after === 'red boots' && (body.images?.[1]?.after ?? '').startsWith('About us'))
    const before = wp.items[0].content
    const ap = await fixRun(API, { projectId: P, action: 'apply', approved: true, field: 'alt', url: `${SITE}/about/`, expected: body.expected, images: [{ src: body.images![0].src, after: 'Red leather boots' }, { src: body.images![1].src, after: 'Our workshop' }] }, baseRows(), wp)
    const after = wp.items[0].content
    const onlyAlts = after.replace(/ alt="[^"]*"/g, '') === before.replace(/ alt="[^"]*"/g, '')
    check('S3: only alt attributes change; every other character of the content is kept', ap.answer.body.ok === true && onlyAlts && after.includes('alt="Red leather boots"') && after.includes('alt="Our workshop"') && after.includes('alt="fine"'))
    const undo = (ap.answer.body as { undo?: Record<string, unknown> }).undo
    await fixRun(API, { ...undo, projectId: P, action: 'apply', approved: true }, baseRows(), wp)
    check('S4: undo empties exactly those alts again', !wp.items[0].content.includes('Red leather boots') && wp.items[0].content.includes('alt="fine"'))

    const lp = await fixRun(API, { projectId: P, action: 'preview', field: 'link', url: `${SITE}/blog/waterproof-boots/`, kind: 'orphan_page', keyword: 'waterproof boots' }, baseRows(), wp)
    const link = lp.answer.body as { ok: boolean; sourceUrl?: string; anchor?: string; expected?: string; sentenceBefore?: string }
    check('S5: the link preview finds an existing sentence in another post', link.ok && link.sourceUrl === `${SITE}/blog/care/` && /waterproof boots/i.test(link.sentenceBefore ?? ''), JSON.stringify(link))
    const beforeLink = wp.items[1].content
    const la = await fixRun(API, { projectId: P, action: 'apply', approved: true, field: 'link', url: `${SITE}/blog/waterproof-boots/`, sourceUrl: link.sourceUrl, anchor: link.anchor, expected: link.expected }, baseRows(), wp)
    const textOf = (h: string) => h.replace(/<[^>]+>/g, '')
    check('S6: one link is added and not a word of text changes', la.answer.body.ok === true && (wp.items[1].content.match(/<a /g) ?? []).length === 1 && textOf(wp.items[1].content) === textOf(beforeLink))
    const lu = (la.answer.body as { undo?: Record<string, unknown> }).undo
    await fixRun(API, { ...lu, projectId: P, action: 'apply', approved: true }, baseRows(), wp)
    check('S7: undo removes exactly that link', wp.items[1].content === beforeLink)

    const noPlugin = await fixRun(API, { projectId: P, action: 'preview', field: 'description', url: `${SITE}/about/`, kind: 'description_missing' }, baseRows(), fakeWp({ plugin: 'none' }))
    check('S8: a description without an SEO plugin is a card (needs_seo_plugin), not a write', (noPlugin.answer.body as { code?: string }).code === 'needs_seo_plugin' && noPlugin.wp.writes.length === 0)
    const noBridge = await fixRun(API, { projectId: P, action: 'preview', field: 'description', url: `${SITE}/about/`, kind: 'description_missing' }, baseRows(), fakeWp({ plugin: 'yoast', bridge: false }))
    check('S9: with Yoast but no bridge: needs_bridge', (noBridge.answer.body as { code?: string }).code === 'needs_bridge')
    const seo = fakeWp({ plugin: 'yoast', bridge: true })
    const dp = await fixRun(API, { projectId: P, action: 'preview', field: 'description', url: `${SITE}/about/`, kind: 'description_missing' }, baseRows(), seo)
    const d = dp.answer.body as { ok: boolean; via?: string; expected?: string; after?: string }
    const da = await fixRun(API, { projectId: P, action: 'apply', approved: true, field: 'description', url: `${SITE}/about/`, via: d.via, after: 'Handmade leather boots from Tel Aviv, resoled free for two years, shipped in two days.', expected: d.expected }, baseRows(), seo)
    check('S10: with Yoast and the bridge, the description goes to the SEO plugin only', da.answer.body.ok === true && seo.writes.length === 1 && seo.writes[0].kind === 'seo' && JSON.stringify(seo.writes[0].payload).includes('metaDescription'))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
export {}
