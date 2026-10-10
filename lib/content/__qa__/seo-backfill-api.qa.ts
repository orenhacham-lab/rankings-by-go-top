/**
 * THE ADMIN PATH FOR THE SEO-META BACKFILL (POST/GET /api/admin/seo-backfill,
 * lib/content/seo-backfill-api.ts, components/admin/SeoBackfillPanel.tsx).
 *
 *   A) only an administrator: a signed-out caller gets 401, a signed-in non-admin 403, and in
 *      both cases nothing runs (GET and POST);
 *   B) apply runs ONLY with the boolean `apply: true`; anything else is a dry run;
 *   C) bounded: projectId required (a UUID), limit 25 by default and at most 50, a time budget
 *      that stops starting articles, and the next offset to continue;
 *   D) a dry run through the real page runner over the database writes nothing anywhere;
 *   E) the answer carries our own codes only: no secret, no provider sentence;
 *   F) wiring: the route uses requireAdminApi; the screen sends apply only after confirmation.
 *
 * MUTATION CONTROLS for each group. Run: npx tsx lib/content/__qa__/seo-backfill-api.qa.ts
 */
import { readFileSync, unlinkSync, writeFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import { runBackfillPage, type ArticleReport, type BackfillDeps } from '../seo-backfill'
import { BACKFILL_DEFAULT_LIMIT, BACKFILL_MAX_LIMIT, handleSeoBackfill, handleSeoBackfillProjects, type BackfillApiDeps } from '../seo-backfill-api'

let passed = 0
let failed = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { passed++; console.log(`  ✓ ${name}`) } else { failed++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = process.cwd()
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

async function mutant<T>(rel: string, edit: (src: string) => string): Promise<T> {
  const file = join(ROOT, rel)
  const src = readFileSync(file, 'utf8')
  const out = edit(src)
  if (out === src) throw new Error(`mutation of ${rel} changed nothing`)
  const copy = file.replace(/\.ts$/, `.mut-${process.pid}-${Math.random().toString(36).slice(2, 8)}.ts`)
  writeFileSync(copy, out)
  try { return (await import(copy)) as T } finally { unlinkSync(copy) }
}

const PROJECT = '11111111-2222-4333-8444-555555555555'
const OWNER = 'u-owner'
const SITE = 'https://shop.example.org'
const req = (body: unknown) => new Request('http://x/api/admin/seo-backfill', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })
const denied = (status: 401 | 403) => async () => ({ ok: false as const, response: Response.json({ error: status === 401 ? 'Unauthorized' : 'Forbidden' }, { status }) })
const admin = async () => ({ ok: true as const, userId: 'u-admin' })

type RunOpts = Parameters<BackfillApiDeps['run']>[0]
function spyRun(reports: ArticleReport[] = []) {
  const calls: RunOpts[] = []
  const run: BackfillApiDeps['run'] = async (o) => { calls.push(o); return { total: reports.length, offset: o.offset, nextOffset: null, reports } }
  return { calls, run }
}

const report = (over: Partial<ArticleReport> = {}): ArticleReport => ({
  id: 'a', project: 'Shop', url: `${SITE}/p/`, channel: 'app_password', seoPluginHint: 'yoast', skip: null,
  head: { title: 'missing', description: 'missing', pageTitle: 'P', pageDescription: null }, title: 'failed', description: 'failed', writes: {}, ...over,
})

async function main() {
  console.log('\nA) administrators only')
  for (const status of [401, 403] as const) {
    const s = spyRun()
    const res = await handleSeoBackfill(req({ projectId: PROJECT, apply: true }), { gate: denied(status), run: s.run })
    check(`A: POST without an administrator → ${status}, nothing runs`, res.status === status && s.calls.length === 0)
    let listed = 0
    const g = await handleSeoBackfillProjects({ gate: denied(status), listProjects: async () => { listed++; return [] } })
    check(`A: GET without an administrator → ${status}, nothing read`, g.status === status && listed === 0)
  }
  {
    type Api = typeof import('../seo-backfill-api')
    const m = await mutant<Api>('lib/content/seo-backfill-api.ts', (s) => s.replace("export async function handleSeoBackfill(request: Request, deps: Omit<BackfillApiDeps, 'listProjects'>): Promise<Response> {\n  const gate = await deps.gate()\n  if (!gate.ok) return gate.response", "export async function handleSeoBackfill(request: Request, deps: Omit<BackfillApiDeps, 'listProjects'>): Promise<Response> {\n  const gate = await deps.gate()"))
    const s = spyRun()
    await m.handleSeoBackfill(req({ projectId: PROJECT }), { gate: denied(403), run: s.run })
    check('MUTATION CONTROL: dropping the admin check is caught (the run happens)', s.calls.length === 1)
  }

  console.log('\nB) apply only with apply: true')
  const applyFor = async (body: Record<string, unknown>) => { const s = spyRun(); await handleSeoBackfill(req({ projectId: PROJECT, ...body }), { gate: admin, run: s.run }); return s.calls[0]?.apply }
  check('B1: no apply → dry run', (await applyFor({})) === false)
  check('B2: "true" (a string), 1, "yes" → still a dry run', (await applyFor({ apply: 'true' })) === false && (await applyFor({ apply: 1 })) === false && (await applyFor({ apply: 'yes' })) === false)
  check('B3: apply: true → apply', (await applyFor({ apply: true })) === true)
  {
    const m = await mutant<typeof import('../seo-backfill-api')>('lib/content/seo-backfill-api.ts', (s) => s.replace('const apply = body.apply === true', 'const apply = !!body.apply'))
    const s = spyRun()
    await m.handleSeoBackfill(req({ projectId: PROJECT, apply: 'true' }), { gate: admin, run: s.run })
    check('MUTATION CONTROL: a truthy apply is caught by B2', s.calls[0]?.apply === true)
  }

  console.log('\nC) bounded work')
  {
    const s = spyRun()
    const r0 = await handleSeoBackfill(req({}), { gate: admin, run: s.run })
    const r1 = await handleSeoBackfill(req({ projectId: 'not-a-uuid' }), { gate: admin, run: s.run })
    check('C1: projectId is required and must be a UUID (400, nothing runs)', r0.status === 400 && r1.status === 400 && s.calls.length === 0)
    await handleSeoBackfill(req({ projectId: PROJECT }), { gate: admin, run: s.run })
    await handleSeoBackfill(req({ projectId: PROJECT, limit: 500, offset: 25 }), { gate: admin, run: s.run, now: () => 1000 })
    check('C2: limit 25 by default, capped at 50; the offset passes through; a deadline is set',
      s.calls[0]?.limit === BACKFILL_DEFAULT_LIMIT && BACKFILL_DEFAULT_LIMIT === 25 && s.calls[1]?.limit === BACKFILL_MAX_LIMIT && BACKFILL_MAX_LIMIT === 50 &&
      s.calls[1]?.offset === 25 && typeof s.calls[1]?.deadlineAt === 'number' && s.calls[1]!.deadlineAt! > 1000, JSON.stringify(s.calls))
    const bad = await handleSeoBackfill(req({ projectId: PROJECT, limit: -1 }), { gate: admin, run: s.run })
    check('C3: a bad limit is refused', bad.status === 400 && s.calls.length === 2)
    const m = await mutant<typeof import('../seo-backfill-api')>('lib/content/seo-backfill-api.ts', (s2) => s2.replace('limit: Math.min(limitIn, BACKFILL_MAX_LIMIT)', 'limit: limitIn'))
    const ms = spyRun()
    await m.handleSeoBackfill(req({ projectId: PROJECT, limit: 500 }), { gate: admin, run: ms.run })
    check('MUTATION CONTROL: dropping the cap is caught by C2', ms.calls[0]?.limit === 500)
  }

  console.log('\nD) a dry run through the real runner writes nothing')
  const rows = Array.from({ length: 3 }, (_, i) => ({ id: `a-${i}`, project_id: PROJECT, user_id: OWNER, title: `Post ${i}`, meta_title: `Meta ${i}`, meta_description: `Desc ${i}`, wp_post_id: 10 + i, wp_post_url: `${SITE}/p-${i}/`, seo_status: null }))
  const db = () => new FakeAdmin({
    generated_articles: rows.map((r) => ({ ...r })), projects: [{ id: PROJECT, name: 'Shop', user_id: OWNER }],
    site_fix_plugin_links: [], wordpress_connections: [{ project_id: PROJECT, site_url: SITE }],
  })
  const writes = { n: 0 }
  const deps: BackfillDeps = {
    fetchHtml: async (u) => ({ ok: true, url: u.toString(), status: 200, html: `<html><head><title>Post - Shop</title></head><body></body></html>`, truncated: false }),
    writeViaPlugin: (async () => { writes.n++; return { plugin: 'none', status: 'verified' } }) as never,
    writeViaAppPassword: (async () => { writes.n++; return { plugin: 'yoast', status: 'verified' } }) as never,
    loadCreds: async () => { writes.n++; return { error: 'x' } },
    persist: (async () => { writes.n++ }) as never,
  }
  {
    const d = db()
    const res = await handleSeoBackfill(req({ projectId: PROJECT }), { gate: admin, run: (o) => runBackfillPage(d as never, o, deps) })
    const out = await res.json() as { mode: string; total: number; reports: ArticleReport[]; nextOffset: number | null }
    check('D1: dry run: every article reported would_write, nothing sent, no row changed',
      res.status === 200 && out.mode === 'dry_run' && out.total === 3 && out.reports.length === 3 && out.reports.every((r) => r.description === 'would_write') &&
      writes.n === 0 && d.tables.generated_articles.every((r, i) => JSON.stringify(r) === JSON.stringify(rows[i])), JSON.stringify(out).slice(0, 300))
    let t = 0
    const page = await runBackfillPage(db() as never, { apply: false, projectId: PROJECT, limit: 25, offset: 0, deadlineAt: 2, now: () => t++ }, deps)
    check('D2: the time budget stops starting articles and says where to continue', page.reports.length === 2 && page.nextOffset === 2 && page.total === 3, JSON.stringify({ n: page.reports.length, next: page.nextOffset }))
    const p2 = await runBackfillPage(db() as never, { apply: false, projectId: PROJECT, limit: 2, offset: 2 }, deps)
    check('D3: pages continue in a stable order; the last page has no next', p2.reports.length === 1 && p2.reports[0].id === 'a-2' && p2.nextOffset === null)
    const m = await mutant<typeof import('../seo-backfill')>('lib/content/seo-backfill.ts', (s) => s.replace('    if (opts.deadlineAt !== undefined && now() >= opts.deadlineAt) break\n', ''))
    let t2 = 0
    const mp = await m.runBackfillPage(db() as never, { apply: false, projectId: PROJECT, limit: 25, offset: 0, deadlineAt: 2, now: () => t2++ }, deps)
    check('MUTATION CONTROL: dropping the time budget is caught by D2', mp.reports.length === 3)
  }

  console.log('\nE) our own codes only')
  {
    const raw = report({ detail: 'Fatal error: wp-config DB_PASSWORD=hunter2 in /var/www', persisted: { plugin: 'yoast', status: 'exact_failure', detail: 'WordPress said: Sorry, you are not allowed' } })
    const s = spyRun([raw, report({ id: 'b', detail: 'bridge_http_500' })])
    const res = await handleSeoBackfill(req({ projectId: PROJECT }), { gate: admin, run: s.run })
    const text = await res.text()
    const out = JSON.parse(text) as { reports: ArticleReport[] }
    check('E1: a sentence from somebody else\'s server is replaced; our codes stay', out.reports[0].detail === 'error' && out.reports[0].persisted?.detail === 'error' && out.reports[1].detail === 'bridge_http_500' && !/hunter2|Sorry/.test(text))
    const failing = await handleSeoBackfill(req({ projectId: PROJECT }), { gate: admin, run: async () => { throw new Error('connect ECONNREFUSED 10.0.0.1 secret=abc') } })
    check('E2: a crash answers our own code, never its message', failing.status === 500 && !/ECONNREFUSED|secret/.test(await failing.text()))
    const m = await mutant<typeof import('../seo-backfill-api')>('lib/content/seo-backfill-api.ts', (s2) => s2.replace('reports: page.reports.map(sanitizeReport)', 'reports: page.reports'))
    const ms = spyRun([raw])
    check('MUTATION CONTROL: skipping the sanitizer is caught by E1', /hunter2/.test(await (await m.handleSeoBackfill(req({ projectId: PROJECT }), { gate: admin, run: ms.run })).text()))
  }

  console.log('\nF) wiring')
  {
    const route = strip(read('app/api/admin/seo-backfill/route.ts'))
    const wired = (s: string) => /export async function POST[\s\S]*?handleSeoBackfill\(request, \{\s*gate: requireAdminApi,/.test(s) && /export async function GET[\s\S]*?handleSeoBackfillProjects\(\{ gate: requireAdminApi,/.test(s) && !/reviewer|bypass/i.test(s)
    check('F1: both GET and POST go through requireAdminApi', wired(route))
    check('MUTATION CONTROL: a route that skips the gate is caught', !wired(route.replace('gate: requireAdminApi,', 'gate: async () => ({ ok: true, userId: "x" }),')))
    const panel = strip(read('components/admin/SeoBackfillPanel.tsx'))
    const confirmed = (s: string) => {
      const ask = s.indexOf('await confirm(')
      const send = s.indexOf('apply: true')
      return ask > -1 && send > ask && (s.match(/apply: true/g) ?? []).length === 1 && /if \(apply && !\(await confirm\(/.test(s)
    }
    check('F2: the screen sends apply: true only after the confirmation', confirmed(panel))
    check('MUTATION CONTROL: an apply without the confirmation is caught', !confirmed(panel.replace('if (apply && !(await confirm(', 'if (false && !(await confirm(')))
    const logs = strip(read('app/(dashboard)/admin/logs/page.tsx'))
    check('F3: the panel is on the admin logs screen (admin layout checks the role)', /<SeoBackfillPanel \/>/.test(logs) && /profile\?\.role !== 'admin'/.test(strip(read('app/(dashboard)/admin/layout.tsx'))))
  }

  console.log(`\n${passed} passed, ${failed} failed`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })

export {}
