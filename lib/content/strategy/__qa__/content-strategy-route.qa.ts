/**
 * GET /api/content/strategy (W6c) — the rows of the content strategy board.
 *
 *  G) gated like every content route: the module flag first, then the content auth
 *     (signed in, owns the project), whose refusals pass through as stable codes;
 *  O) every service-role read filters by the project AND its owner;
 *  R) what it returns: pending ideas, non-rejected topics with their "why" (their own
 *     reason, else the reason of the idea they were approved from), articles without
 *     their bodies;
 *  F) failures: a missing table is empty, anything else one code, never its text;
 *  W) it writes nothing and reaches nothing outside the database.
 *
 * The handler is exercised with FakeAdmin (real filter semantics) through injected
 * dependencies; the route file is checked to wire the real ones. Every check has a
 * mutation control.
 *
 * Run: npx tsx lib/content/strategy/__qa__/content-strategy-route.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { handleStrategyGet, type StrategyAuth, type StrategyRouteDeps } from '../http'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const OWNER = 'u-owner', OTHER = 'u-other', P = 'p-1', Q = 'p-2'
const URL_OF = (projectId: string | null) => `https://app.test/api/content/strategy${projectId ? `?projectId=${projectId}` : ''}`

function tables() {
  return {
    content_topic_ideas: [
      { id: 'i1', user_id: OWNER, project_id: P, status: 'pending', title: 'Idea one', primary_keyword: 'kw1', suggestion_reason: 'Because', score: '0.8', created_at: '2026-09-10T00:00:00Z', approved_topic_id: null },
      { id: 'i2', user_id: OWNER, project_id: P, status: 'approved', title: 'Approved idea', primary_keyword: null, suggestion_reason: 'Reason from the idea', score: 1, created_at: '2026-09-01T00:00:00Z', approved_topic_id: 't2' },
      { id: 'i3', user_id: OWNER, project_id: P, status: 'rejected', title: 'Rejected idea', primary_keyword: null, suggestion_reason: null, score: 1, created_at: '2026-09-01T00:00:00Z', approved_topic_id: null },
      { id: 'i4', user_id: OWNER, project_id: Q, status: 'pending', title: 'Other project idea', primary_keyword: null, suggestion_reason: null, score: 1, created_at: '2026-09-01T00:00:00Z', approved_topic_id: null },
      { id: 'i5', user_id: OTHER, project_id: P, status: 'pending', title: 'Other user idea', primary_keyword: null, suggestion_reason: null, score: 1, created_at: '2026-09-01T00:00:00Z', approved_topic_id: null },
    ],
    article_topics: [
      { id: 't1', user_id: OWNER, project_id: P, topic: 'Own reason topic', primary_keyword: 'k', status: 'approved', source: 'keyword', suggestion_reason: 'Own reason', created_at: '2026-09-02T00:00:00Z' },
      { id: 't2', user_id: OWNER, project_id: P, topic: 'From an idea', primary_keyword: null, status: 'approved', source: 'keyword', suggestion_reason: null, created_at: '2026-09-03T00:00:00Z' },
      { id: 't3', user_id: OWNER, project_id: P, topic: 'Rejected', primary_keyword: null, status: 'rejected', source: 'manual', suggestion_reason: null, created_at: '2026-09-03T00:00:00Z' },
      { id: 't4', user_id: OTHER, project_id: P, topic: 'Other user topic', primary_keyword: null, status: 'approved', source: 'manual', suggestion_reason: null, created_at: '2026-09-03T00:00:00Z' },
    ],
    generated_articles: [
      { id: 'a1', user_id: OWNER, project_id: P, topic_id: 't1', title: 'Article', status: 'draft', scheduled_at: null, published_at: null, created_at: '2026-09-05T00:00:00Z', content_html: '<p>SECRET BODY</p>', last_error: 'Gemini said boom', wp_post_url: 'https://x' },
      { id: 'a2', user_id: OWNER, project_id: Q, topic_id: null, title: 'Other project article', status: 'draft', scheduled_at: null, published_at: null, created_at: '2026-09-05T00:00:00Z' },
    ],
  }
}

function deps(admin: FakeAdmin, over: Partial<StrategyRouteDeps> = {}, seen: { auth: number } = { auth: 0 }): StrategyRouteDeps {
  return {
    enabled: () => true,
    auth: async (projectId) => {
      seen.auth++
      if (projectId !== P) return { error: 'Project not found', status: 404 }
      return { user: { id: OWNER }, admin: admin as never, project: { id: P, user_id: OWNER } } satisfies StrategyAuth
    },
    ...over,
  }
}

async function call(admin: FakeAdmin, projectId: string | null = P, over: Partial<StrategyRouteDeps> = {}, seen?: { auth: number }) {
  const res = await handleStrategyGet(new Request(URL_OF(projectId)), deps(admin, over, seen))
  const text = await res.text()
  let body: Record<string, unknown> = {}
  try { body = JSON.parse(text) } catch { /* not json */ }
  return { status: res.status, body, text, cache: res.headers.get('cache-control') }
}

async function main() {
  console.log('Content strategy — GET /api/content/strategy')

  // ── G) gate and auth ──────────────────────────────────────────────────────
  console.log('\nG) gated, then authenticated and owned')
  {
    const seen = { auth: 0 }
    const off = await call(new FakeAdmin(tables()), P, { enabled: () => false }, seen)
    check('G1: with the content module off the route does not exist, and asks nobody who you are',
      off.status === 404 && off.body.code === 'not_found' && seen.auth === 0)
    for (const [status, code] of [[400, 'invalid_request'], [401, 'unauthorized'], [403, 'forbidden'], [404, 'not_found']] as const) {
      const r = await call(new FakeAdmin(tables()), P, { auth: async () => ({ error: 'Some internal words', status }) })
      check(`G2: an auth refusal ${status} passes through as "${code}", not as its text`, r.status === status && r.body.code === code && !/internal words/.test(r.text))
    }
    const notOwned = await call(new FakeAdmin(tables()), Q)
    check('G3: a project the caller does not own is not found, and nothing of it is read', notOwned.status === 404 && !/Other project/.test(notOwned.text))
    const thrown = await call(new FakeAdmin(tables()), P, { auth: async () => { throw new Error('session store down: secret') } })
    check('G4: an auth failure is one code, never its text', thrown.status === 500 && thrown.body.code === 'internal' && !/secret/.test(thrown.text))
    const ok = await call(new FakeAdmin(tables()))
    check('G5: the answer is never cached', ok.cache === 'no-store' && off.cache === 'no-store')
    const src = strip(read('app/api/content/strategy/route.ts'))
    const wired = (s: string) => /enabled: \(\) => isContentModuleEnabled\(\)/.test(s) && /auth: \(projectId\) => authContentProject\(projectId\)/.test(s)
      && /export async function GET\(request: Request\)/.test(s) && !/export async function (POST|PUT|PATCH|DELETE)/.test(s)
    check('G6: the route wires the content module flag and the content auth, and answers GET only', wired(src))
    check('G-MUT: a route that skips the content auth fails G6', !wired(src.replace('authContentProject(projectId)', "({ user: { id: 'x' } } as never)")))
    check('G-MUT2: a route that also answers POST fails G6', !wired(src + '\nexport async function POST() {}'))
  }

  // ── O) owner filters ──────────────────────────────────────────────────────
  console.log('\nO) every read filters by the project and its owner')
  {
    const r = await call(new FakeAdmin(tables()))
    const text = r.text
    check('O1: nothing of another project', !/Other project/.test(text))
    check('O2: nothing of another user, even in the same project', !/Other user/.test(text))
    const src = strip(read('lib/content/strategy/http.ts'))
    const ownedOnly = (s: string) => (s.match(/admin\.from\(/g) ?? []).length === 1
      && /const owned = \(table: string, cols: string\) => admin\.from\(table\)\.select\(cols\)\.eq\('project_id', project\.id\)\.eq\('user_id', user\.id\)/.test(s)
      && (s.match(/owned\('/g) ?? []).length === 4
    check('O3: every table is read through the one helper that applies both filters', ownedOnly(src))
    check('O-MUT: a helper without the owner filter fails O3', !ownedOnly(src.replace(".eq('user_id', user.id)", '')))
    check('O-MUT2: a second, unfiltered read fails O3', !ownedOnly(src.replace('rows(owned(\'generated_articles\'', "rows(admin.from('generated_articles').select('*') as never), rows(owned('generated_articles'")))
  }

  // ── R) what it returns ────────────────────────────────────────────────────
  console.log('\nR) pending ideas, topics with their why, articles without bodies')
  {
    const r = await call(new FakeAdmin(tables()))
    const ideas = r.body.ideas as { id: string; score: number | null; reason: string | null }[]
    const topics = r.body.topics as { id: string; reason: string | null; title: string }[]
    const articles = r.body.articles as Record<string, unknown>[]
    check('R1: 200 with ok', r.status === 200 && r.body.ok === true)
    check('R2: only pending ideas, with their reason and a numeric score', ideas.map((i) => i.id).join() === 'i1' && ideas[0].reason === 'Because' && ideas[0].score === 0.8)
    check('R3: topics except rejected ones', topics.map((t) => t.id).sort().join() === 't1,t2')
    check('R4: a topic keeps its own reason', topics.find((t) => t.id === 't1')?.reason === 'Own reason')
    check('R5: a topic approved from an idea takes the idea\'s reason', topics.find((t) => t.id === 't2')?.reason === 'Reason from the idea')
    check('R6: an article is its fields, never its body, its last error or its urls',
      articles.length === 1 && articles[0].id === 'a1' && articles[0].topicId === 't1'
      && !/SECRET BODY|Gemini said boom|content_html|last_error|wp_post_url/.test(r.text))
    const shape = Object.keys(articles[0]).sort().join()
    check('R7: exactly the article fields the board reads', shape === 'createdAt,id,publishedAt,scheduledAt,status,title,topicId', shape)
    // MUT: without the approved-idea lookup, t2 would have no reason, so R5 is decided by it.
    const noFold = tables(); noFold.content_topic_ideas = noFold.content_topic_ideas.filter((i) => i.status !== 'approved')
    const r2 = await call(new FakeAdmin(noFold))
    check('R5-MUT: without its approved idea the same topic has no reason',
      (r2.body.topics as { id: string; reason: string | null }[]).find((t) => t.id === 't2')?.reason === null)
  }

  // ── F) failures ───────────────────────────────────────────────────────────
  console.log('\nF) failures')
  {
    const missing = await call(new FakeAdmin(tables(), { content_topic_ideas: { select: () => ({ code: '42P01', message: 'relation "content_topic_ideas" does not exist' }) } }))
    check('F1: a missing table reads as empty, the rest still answers',
      missing.status === 200 && (missing.body.ideas as unknown[]).length === 0 && (missing.body.topics as unknown[]).length === 2)
    const broken = await call(new FakeAdmin(tables(), { generated_articles: { select: () => ({ code: 'XX000', message: 'connection reset by peer at db-host-7' }) } }))
    check('F2: any other database failure is one code, never its text',
      broken.status === 500 && broken.body.code === 'internal' && !/connection reset|db-host/.test(broken.text) && !('articles' in broken.body))
    const src = strip(read('lib/content/strategy/http.ts'))
    const onlyMissingIsEmpty = (s: string) =>
      /if \(error\) \{\s*if \(error\.code && MISSING_TABLE\.has\(error\.code\)\) return \[\]\s*throw new ReadFailed\(\)/.test(s)
      && /const MISSING_TABLE = new Set\(\['42P01', 'PGRST205'\]\)/.test(s)
    check('F3: only "relation does not exist" reads as empty; every other failure stops the answer', onlyMissingIsEmpty(src))
    check('F-MUT: a reader that treats every failure as a missing table fails F3',
      !onlyMissingIsEmpty(src.replace('throw new ReadFailed()', 'return []')))
  }

  // ── W) no writes, nothing outside ─────────────────────────────────────────
  console.log('\nW) read-only, and nothing outside the database')
  {
    const t = tables()
    const before = JSON.stringify(t)
    await call(new FakeAdmin(t))
    check('W1: a read leaves every table exactly as it was', JSON.stringify(t) === before)
    const src = strip(read('lib/content/strategy/http.ts')) + strip(read('app/api/content/strategy/route.ts'))
    const readOnly = (s: string) => !/\.(insert|update|upsert|delete|rpc)\(/.test(s) && !/fetch\(|gemini|openai|serper|google-ads|recommendations|after\(/i.test(s)
    check('W2: no write, no model, no third party, no background work in the route or its handler', readOnly(src))
    check('W-MUT: a handler that marks ideas as seen fails W2', !readOnly(src + "\nadmin.from('content_topic_ideas').update({ seen: true })"))
    check('W-MUT2: a handler that asks the engine fails W2', !readOnly(src + "\nawait fetch('/api/content/automation/recommendations')"))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })

export {}
