/**
 * "Waiting for you": the dashboard card and the sidebar's count pills (lib/nudges).
 *
 *   A) GET /api/projects/[id]/waiting: session, well-formed id and ownership first; every
 *      read filtered by project AND owner; the right rows are counted; a failed read is
 *      0, never an error text; the content switch off reads nothing of the content
 *   B) the card's rows: fixed priority, at most three, hidden at 0, one internal link each,
 *      "the queue runs dry" only with fewer than 2 approved topics and a known date
 *   C) the rail's pills: the same numbers, hidden at 0, 99+
 *   D) safe fixes: counted from the last scan kept in the browser, only the safe kinds,
 *      never the home page or a fixed page, at most 25
 *   E) the words: exact Hebrew and English copy from the UX decisions (E)
 *   F) the screens: the card sits under the hero and renders nothing when empty; the rail draws
 *      a labelled pill only above 0; the articles screen opens filtered only on "ready";
 *      the route reads and writes nothing else
 *
 * Every guard runs against the real code and again against a deliberately broken copy (-MUT).
 * Run: npx tsx lib/nudges/__qa__/waiting-nudges.qa.ts
 */
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import type { SupabaseClient } from '@supabase/supabase-js'
import { FakeAdmin } from '@/lib/__qa__/_fake-admin'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { dashboardHe } from '@/lib/i18n/dashboard/he'
import { dashboardEn } from '@/lib/i18n/dashboard/en'
import { handleWaitingGet, type WaitingAnswer, type WaitingDeps } from '../waiting'
import { pillText, railCounts, safeFixCountFromScan, waitingRows } from '../rows'
import { withMutant } from '@/lib/reminders/__qa__/_mutant'

let pass = 0
let fail = 0
function check(name: string, cond: boolean, detail?: unknown) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail !== undefined ? ` — ${JSON.stringify(detail)}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const code = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:'"`])\/\/.*$/gm, '$1')

const OWNER = '11111111-1111-4111-8111-111111111111'
const OTHER = '22222222-2222-4222-8222-222222222222'
const P = 'aaaaaaaa-0000-4000-8000-000000000001'
const FOREIGN = 'aaaaaaaa-0000-4000-8000-000000000003'

function world(): Record<string, Record<string, unknown>[]> {
  const art = (id: string, user: string, project: string, status: string, scheduled: string | null = null) => ({ id, project_id: project, user_id: user, status, scheduled_at: scheduled })
  return {
    projects: [{ id: P, user_id: OWNER }, { id: FOREIGN, user_id: OTHER }],
    generated_articles: [
      art('a1', OWNER, P, 'ready'), art('a2', OWNER, P, 'ready'),
      art('a3', OWNER, P, 'ready', '2026-10-01T08:00:00Z'), // planned: not waiting
      art('a4', OWNER, P, 'draft'), art('a5', OWNER, P, 'published'),
      art('f1', OTHER, FOREIGN, 'ready'), art('f2', OTHER, FOREIGN, 'ready'), art('f3', OTHER, FOREIGN, 'ready'),
    ],
    content_topic_ideas: [
      { id: 'i1', project_id: P, user_id: OWNER, status: 'pending' }, { id: 'i2', project_id: P, user_id: OWNER, status: 'pending' },
      { id: 'i3', project_id: P, user_id: OWNER, status: 'approved' }, { id: 'i4', project_id: P, user_id: OWNER, status: 'rejected' },
      { id: 'fi', project_id: FOREIGN, user_id: OTHER, status: 'pending' },
    ],
    article_pool_items: [
      { id: 'q1', project_id: P, user_id: OWNER, status: 'queued', scheduled_at: '2026-10-05T08:00:00Z' },
      { id: 'q2', project_id: P, user_id: OWNER, status: 'published', scheduled_at: '2026-10-09T08:00:00Z' },
      { id: 'fq', project_id: FOREIGN, user_id: OTHER, status: 'queued', scheduled_at: '2026-12-01T08:00:00Z' },
    ],
    wordpress_connections: [{ project_id: P, user_id: OWNER, connection_status: 'connected' }, { project_id: FOREIGN, user_id: OTHER, connection_status: 'failed' }],
    site_platform_connections: [],
    site_fix_plugin_links: [{ project_id: P, user_id: OWNER, status: 'connected' }, { project_id: FOREIGN, user_id: OTHER, status: 'disconnected' }],
  }
}

type Reads = { table: string; filters: string[] }[]
/** A FakeAdmin whose every query is recorded with the filters it carried. */
function recording(tables: Record<string, Record<string, unknown>[]>, hooks: ConstructorParameters<typeof FakeAdmin>[1] = {}) {
  const reads: Reads = []
  const fake = new FakeAdmin(tables, hooks)
  const wrap = {
    from(table: string) {
      const q = fake.from(table) as unknown as Record<string, (...a: unknown[]) => unknown>
      const rec = { table, filters: [] as string[] }
      reads.push(rec)
      return new Proxy(q, { get(t, p, r) {
        const v = Reflect.get(t, p, r)
        if (typeof v !== 'function') return v
        return (...args: unknown[]) => {
          if (p === 'eq' || p === 'is' || p === 'in') rec.filters.push(`${String(p)}:${String(args[0])}`)
          if (p === 'insert' || p === 'update' || p === 'upsert' || p === 'delete') rec.filters.push(`WRITE:${String(p)}`)
          const out = (v as (...a: unknown[]) => unknown).apply(t, args)
          return out === t ? new Proxy(t, this as ProxyHandler<typeof t>) : out
        }
      } })
    },
  }
  return { client: wrap as unknown as SupabaseClient & ServiceRoleClient, reads }
}

const env = { ENABLE_CONTENT: 'true' }
const deps = (client: SupabaseClient & ServiceRoleClient, userId: string | null, e: Record<string, string | undefined> = env): WaitingDeps => ({
  session: async () => ({ userId, db: client }),
  admin: () => client,
  env: e,
})
const ask = async (client: SupabaseClient & ServiceRoleClient, id: string, userId: string | null = OWNER, e?: Record<string, string | undefined>) => {
  const res = await handleWaitingGet(id, deps(client, userId, e))
  return { status: res.status, body: await res.json() as Record<string, unknown> }
}

async function main() {
  // ── A) the route ──────────────────────────────────────────────────────────
  console.log('\nA) GET /api/projects/[id]/waiting')
  {
    const { client, reads } = recording(world())
    const r = await ask(client, P)
    const b = r.body as unknown as WaitingAnswer
    check('A1: the owner gets counts: 2 articles waiting (not planned, drafted or published)', r.status === 200 && b.articles === 2, b)
    check('A2: 2 topics await approval (not approved or rejected)', b.topics === 2)
    check('A3: 1 topic already queued, and the last dated one is known', b.queued === 1 && b.queueEndsAt === '2026-10-05T08:00:00.000Z')
    check('A4: a connected site and plugin: nothing down, fixes possible', b.connectionDown === null && b.pluginConnected === true)
    check('A5: the answer carries numbers and one date, no ids or titles', JSON.stringify(Object.keys(b).sort()) === JSON.stringify(['articles', 'connectionDown', 'ok', 'pluginConnected', 'queueEndsAt', 'queued', 'topics']))
    const scoped = (x: { table: string; filters: string[] }) => x.table === 'projects'
      ? x.filters.includes('eq:id') && x.filters.includes('eq:user_id')
      : x.filters.includes('eq:project_id') && x.filters.includes('eq:user_id')
    check('A6: every read filters by project AND owner (the project by id AND owner)', reads.length >= 7 && reads.every(scoped), reads.filter((x) => !scoped(x)).map((x) => x.table))
    check('A7: nothing is written', reads.every((x) => !x.filters.some((f) => f.startsWith('WRITE'))))
  }
  {
    const { client, reads } = recording(world())
    const noSession = await ask(client, P, null)
    check('A8: no session: 401 and nothing read', noSession.status === 401 && reads.length === 0)
    const bad = await ask(client, 'not-a-uuid')
    check('A9: a malformed id: 404 and nothing read', bad.status === 404 && reads.length === 0)
    const foreign = await ask(client, FOREIGN)
    check('A10: another owner’s project: 404 (not 403), and only the ownership read happened', foreign.status === 404 && reads.length === 1 && reads[0].table === 'projects')
    const missing = await ask(client, 'aaaaaaaa-0000-4000-8000-0000000000ff')
    check('A11: an unknown project answers exactly like a foreign one', missing.status === 404 && JSON.stringify(missing.body) === JSON.stringify(foreign.body))
  }
  {
    const w = world()
    const foreignCounts = (await ask(recording(w).client, FOREIGN, OTHER)).body as unknown as WaitingAnswer
    check('A12: the other owner sees only their own rows (3 articles, 1 topic, connection lost, plugin dropped)', foreignCounts.articles === 3 && foreignCounts.topics === 1 && foreignCounts.connectionDown === 'platform')
    const w2 = world(); w2.wordpress_connections = [{ project_id: P, user_id: OWNER, connection_status: 'untested' }]; w2.site_fix_plugin_links = [{ project_id: P, user_id: OWNER, status: 'disconnected' }]
    const r2 = (await ask(recording(w2).client, P)).body as unknown as WaitingAnswer
    check('A13: an untested connection is not "lost"; a dropped plugin is, and points at site health', r2.connectionDown === 'plugin' && r2.pluginConnected === false)
    const w3 = world(); w3.site_platform_connections = [{ project_id: P, user_id: OWNER, connection_status: 'failed' }]
    check('A14: a failed Wix / custom-site connection is lost too', ((await ask(recording(w3).client, P)).body as unknown as WaitingAnswer).connectionDown === 'platform')
    const off = (await ask(recording(world()).client, P, OWNER, { ENABLE_CONTENT: undefined })).body as unknown as WaitingAnswer
    check('A15: with the content switch off, no article, topic or queue is read or counted', off.articles === 0 && off.topics === 0 && off.queued === 0)
    const leak = 'relation "generated_articles" leaked-provider-text-9917'
    const broken = recording(world(), { generated_articles: { select: () => ({ message: leak }) }, content_topic_ideas: { select: () => ({ message: leak }) }, wordpress_connections: { select: () => ({ message: leak }) } })
    const rb = await ask(broken.client, P)
    check('A16: unreadable sources count as 0 and no database text reaches the answer', rb.status === 200 && (rb.body as unknown as WaitingAnswer).articles === 0 && !JSON.stringify(rb.body).includes('leaked'))
    const dropOwner = await withMutant<{ handleWaitingGet: typeof handleWaitingGet }, number>(
      'lib/nudges/waiting.ts', [[".eq('project_id', projectId).eq('user_id', userId)\n      .eq('status', 'ready').is('scheduled_at', null))", ".eq('project_id', projectId)\n      .eq('status', 'ready').is('scheduled_at', null))"]],
      async (m) => {
        const w4 = world(); w4.generated_articles.push({ id: 'x', project_id: P, user_id: OTHER, status: 'ready', scheduled_at: null })
        const res = await m.handleWaitingGet(P, deps(recording(w4).client, OWNER))
        return ((await res.json()) as WaitingAnswer).articles
      },
    )
    check('A-MUT: dropping the owner filter counts another owner’s article (A1 would fail)', dropOwner === 3, dropOwner)
    const noScheduleMut = await withMutant<{ handleWaitingGet: typeof handleWaitingGet }, number>(
      'lib/nudges/waiting.ts', [[".eq('status', 'ready').is('scheduled_at', null)", ".eq('status', 'ready')"]],
      async (m) => ((await (await m.handleWaitingGet(P, deps(recording(world()).client, OWNER))).json()) as WaitingAnswer).articles,
    )
    check('A-MUT2: counting planned articles as waiting gives 3 (A1 would fail)', noScheduleMut === 3, noScheduleMut)
  }

  // ── B) the card's rows ────────────────────────────────────────────────────
  console.log('\nB) The card’s rows')
  const base: WaitingAnswer = { ok: true, connectionDown: null, articles: 0, topics: 0, queued: 5, queueEndsAt: null, pluginConnected: false }
  const rowKinds = (w: WaitingAnswer | null, fixes = 0) => waitingRows(P, w, fixes).map((r) => r.kind).join(',')
  const rules = (rowsFn: typeof waitingRows) => {
    const kinds = (w: WaitingAnswer, f = 0) => rowsFn(P, w, f).map((r) => r.kind).join(',')
    const all: WaitingAnswer = { ...base, connectionDown: 'platform', articles: 3, topics: 4, pluginConnected: true }
    return {
      'B1: nothing waits: no rows (the card is hidden)': kinds(base) === '' && rowsFn(P, null, 0).length === 0,
      'B2: priority connection, articles, topics, fixes': kinds({ ...all, connectionDown: 'platform' }, 5) === 'connection,articles,topics',
      'B3: at most three rows': rowsFn(P, all, 7).length === 3,
      'B4: without the connection problem, the fourth (fixes) appears': kinds({ ...all, connectionDown: null }, 7) === 'articles,topics,fixes',
      'B5: safe fixes need the plugin connected': kinds({ ...base, pluginConnected: false }, 9) === '' && kinds({ ...base, pluginConnected: true }, 9) === 'fixes',
      'B6: a zero count adds no row': kinds({ ...base, articles: 0, topics: 2 }) === 'topics',
      'B7: every link is an internal path': rowsFn(P, all, 3).every((r) => r.href.startsWith('/') && !r.href.startsWith('//') && !/^\/\\/.test(r.href)),
      'B8: exact destinations': rowsFn(P, { ...all, connectionDown: null }, 3).map((r) => r.href).join('|') === '/content?status=ready|/content/strategy?view=list#ideas|/site-health#fixes',
      'B9: a dropped plugin sends the owner to site health; a failed platform to the project settings': rowsFn(P, { ...base, connectionDown: 'plugin' }, 0)[0].href === '/site-health' && rowsFn(P, { ...base, connectionDown: 'platform' }, 0)[0].href.startsWith('/settings?projectId='),
      'B10: fewer than 2 approved topics queued and a date known: the queue-dry date is on the topics row': rowsFn(P, { ...base, topics: 2, queued: 1, queueEndsAt: '2026-10-05T08:00:00.000Z' }, 0)[0].dryOn === '2026-10-05T08:00:00.000Z',
      'B11: 2 or more queued, or no date: no queue-dry line': rowsFn(P, { ...base, topics: 2, queued: 2, queueEndsAt: '2026-10-05T08:00:00.000Z' }, 0)[0].dryOn === null && rowsFn(P, { ...base, topics: 2, queued: 0, queueEndsAt: null }, 0)[0].dryOn === null,
      'B12: junk counts are treated as 0': kinds({ ...base, articles: -4 as number, topics: Number.NaN }) === '',
    } as Record<string, boolean>
  }
  for (const [k, v] of Object.entries(rules(waitingRows))) check(k, v)
  const rowsMut = await withMutant<{ waitingRows: typeof waitingRows }, boolean>(
    'lib/nudges/rows.ts',
    [['return rows.slice(0, MAX_WAITING_ROWS)', 'return rows'], [/if \(pos\(w\.articles\) > 0\)/, 'if (true)']],
    (m) => Object.values(rules(m.waitingRows)).some((v) => !v),
  )
  check('B-MUT: a card with no cap that shows a row at 0 fails B1/B3', rowsMut)
  void rowKinds

  // ── C) the rail ───────────────────────────────────────────────────────────
  console.log('\nC) The rail’s pills')
  {
    const w: WaitingAnswer = { ...base, articles: 3, topics: 12, pluginConnected: true, connectionDown: 'plugin' }
    const c = railCounts(w, 4)
    check('C1: articles and topics as counted; site health = fixes + a dropped plugin', c.articles === 3 && c.strategy === 12 && c.siteHealth === 5)
    check('C2: nothing waits: all zero (no pill)', JSON.stringify(railCounts(base, 0)) === JSON.stringify({ articles: 0, strategy: 0, siteHealth: 0 }) && JSON.stringify(railCounts(null, 3)) === JSON.stringify({ articles: 0, strategy: 0, siteHealth: 0 }))
    check('C3: fixes are not counted without the plugin', railCounts({ ...base, pluginConnected: false }, 6).siteHealth === 0)
    check('C4: a pill never shows more than 99', pillText(7) === '7' && pillText(99) === '99' && pillText(100) === '99+')
    const mut = await withMutant<{ railCounts: typeof railCounts }, boolean>('lib/nudges/rows.ts', [['const fixes = w.pluginConnected ? pos(safeFixes) : 0', 'const fixes = pos(safeFixes)']], (m) => m.railCounts({ ...base, pluginConnected: false }, 6).siteHealth !== 0)
    check('C-MUT: counting fixes without the plugin fails C3', mut)
  }

  // ── D) safe fixes from the kept scan ──────────────────────────────────────
  console.log('\nD) Safe fixes from the last scan')
  {
    const page = (url: string, over: Record<string, unknown> = {}) => ({ url, kind: 'page', fixable: true, ...over })
    const scan = (findings: unknown[], fixed: string[] = []) => JSON.stringify({ v: 1, report: { findings }, fixed })
    const one = scan([
      { id: 'title_long', pages: [page('https://s.co/a'), page('https://s.co/', { kind: 'home' }), page('https://s.co/c', { fixable: false })] },
      { id: 'description_missing', pages: [page('https://s.co/a'), page('https://s.co/b')] },
      { id: 'images_alt', pages: [page('https://s.co/b')] },
      { id: 'canonical_missing', pages: [page('https://s.co/a'), page('https://s.co/b')] },
      { id: 'h1_multiple', pages: [page('https://s.co/a')] },
      { id: 'broken_links', pages: [page('https://s.co/a')] },
    ], ['description_missing|https://s.co/b'])
    check('D1: title, description and image-alt pages only; not home, not unfixable, not fixed, not canonical / h1 / links', safeFixCountFromScan(one) === 3, safeFixCountFromScan(one))
    check('D2: no scan, junk or another version: 0', safeFixCountFromScan(null) === 0 && safeFixCountFromScan('{') === 0 && safeFixCountFromScan(JSON.stringify({ v: 2, report: { findings: [] } })) === 0)
    const many = scan([{ id: 'title_long', pages: Array.from({ length: 40 }, (_, i) => page(`https://s.co/p${i}`)) }])
    check('D3: a batch never exceeds 25 pages', safeFixCountFromScan(many) === 25)
    const mut = await withMutant<{ safeFixCountFromScan: typeof safeFixCountFromScan }, boolean>('lib/nudges/rows.ts', [["'images_alt',\n])", "'images_alt', 'canonical_missing', 'h1_multiple',\n])"], ["p.kind === 'home'", 'false']], (m) => m.safeFixCountFromScan(one) !== 3)
    check('D-MUT: counting canonical / h1 findings and the home page fails D1', mut)
  }

  // ── E) the words ──────────────────────────────────────────────────────────
  console.log('\nE) The copy (UX decisions, E)')
  {
    const h = dashboardHe.waitingCard, e = dashboardEn.waitingCard
    check('E1: Hebrew card title and rows', h.title === 'מחכה לכם' && h.connection === 'החיבור לאתר נותק, ולכן מאמרים ותיקונים לא עולים' && h.connectionAction === 'חיבור מחדש' && h.articles(1) === 'מאמר אחד כתוב ומחכה לאישור שלכם' && h.articles(4) === '4 מאמרים כתובים ומחכים לאישור שלכם' && h.articlesAction === 'לאישור המאמרים' && h.topics(3) === '3 נושאים חדשים מחכים לאישור' && h.topicsAction === 'לאישור הנושאים' && h.queueDry('05.10.2026') === 'בלי אישור, התור יתרוקן ב-05.10.2026' && h.fixes(6) === '6 תיקונים בטוחים מוכנים לאתר' && h.fixesAction === 'לתיקונים')
    check('E2: English card title and rows', e.title === 'Waiting for you' && e.connection === "The site connection dropped, so articles and fixes can't go live" && e.connectionAction === 'Reconnect' && e.articles(1) === '1 article is written and waiting for your OK' && e.articles(4) === '4 articles are written and waiting for your OK' && e.articlesAction === 'Review articles' && e.topics(3) === '3 new topics await approval' && e.topicsAction === 'Review topics' && e.queueDry('Oct 5, 2026') === 'Without approval the queue runs dry on Oct 5, 2026' && e.fixes(6) === '6 safe fixes are ready for your site' && e.fixesAction === 'See fixes')
    check('E3: the rail’s aria-label', dashboardHe.railWaiting.aria(3) === '3 ממתינים' && dashboardEn.railWaiting.aria(3) === '3 waiting')
    const hs = dashboardHe.reminders, es = dashboardEn.reminders
    check('E4: the settings switch label', hs.settingsLabel === 'תזכורות במייל כשמשהו מחכה לכם' && es.settingsLabel === 'Email me when something is waiting for me')
    check('E5: the articles hero says "for your OK"', dashboardHe.contentHub.articlesHero.waiting(2, '2') === '2 מאמרים מוכנים ומחכים לאישור שלכם' && dashboardEn.contentHub.articlesHero.waiting(2, '2') === '2 articles ready and waiting for your OK')
    const emailKeys = Object.keys(hs.email).sort().join()
    check('E6: both languages have the same email keys', emailKeys === Object.keys(es.email).sort().join() && Object.keys(hs.unsubscribePage).sort().join() === Object.keys(es.unsubscribePage).sort().join())
    check('E7: no Hebrew in the English copy', !/[א-ת]/.test(JSON.stringify(e) + JSON.stringify(es.email) + JSON.stringify(es.settingsLabel) + JSON.stringify(es.unsubscribePage) + JSON.stringify(dashboardEn.railWaiting.aria(1))))
  }

  // ── F) the screens ────────────────────────────────────────────────────────
  console.log('\nF) The screens')
  {
    const page = strip(code('app/(dashboard)/dashboard/page.tsx'))
    const underHero = (src: string) => src.indexOf('<HeroCard') > 0 && src.indexOf('<WaitingCard') > src.indexOf('<HeroCard') && src.indexOf('<WaitingCard') < src.indexOf('<StatTile')
    check('F1: the card sits directly under the hero, before the figures', underHero(page))
    check('F1-MUT: a card moved below the figures fails F1', !underHero(page.replace(/<WaitingCard[^>]*\/>/, '').replace('<Reveal index={1}', '<Reveal index={1}').concat('<WaitingCard />')))
    const card = strip(code('components/dashboard/WaitingCard.tsx'))
    const cardOk = (src: string) => /if \(rows\.length === 0\) return null/.test(src) && (src.match(/<LinkButton/g) ?? []).length === 1
    check('F2: the card renders nothing without rows, and each row has one link button', cardOk(card))
    check('F2-MUT: a card that renders when empty fails F2', !cardOk(card.replace('if (rows.length === 0) return null', '')))
    check('F3: the card is not a modal or a toast', !/role="dialog"|useToasts|Toast/.test(card))
    const rail = strip(code('components/layout/Sidebar.tsx'))
    const railOk = (src: string) => /count > 0 && \(/.test(src) && /aria-label=\{countLabel\}/.test(src) && /useWaiting\(activeProjectId, pathname\)/.test(src) && /\[CONTENT_ROOT_PATH\]: rail\.articles/.test(src) && /\[CONTENT_STRATEGY_PATH\]: rail\.strategy/.test(src) && /'\/site-health': rail\.siteHealth/.test(src)
    check('F4: the rail draws the pill only above 0, labelled, from the shared read', railOk(rail))
    check('F4-MUT: a pill drawn at 0, or without its label, fails F4', !railOk(rail.replace('count > 0 && (', 'count >= 0 && (')) && !railOk(rail.replace('aria-label={countLabel}', '')))
    const screen = strip(code('components/content/workspace/ArticlesScreen.tsx'))
    check('F5: the articles screen opens filtered only on the fixed value "ready"', /urlParams\?\.get\('status'\) === ARTICLES_WAITING_STATUS \? ARTICLES_WAITING_STATUS : ''/.test(screen))
    check('F6: the route reads only: no write verbs, no provider, no model', (() => { const s = strip(code('lib/nudges/waiting.ts')); return !/\.(insert|update|upsert|delete)\(|fetch\(|openai|resend|gemini/i.test(s) })())
    check('F7: the route is a GET only, behind its own auth', (() => { const s = strip(code('app/api/projects/[id]/waiting/route.ts')); return /export async function GET/.test(s) && !/export async function (POST|PUT|PATCH|DELETE)/.test(s) })())
    const hook = strip(code('components/nudges/useWaiting.ts'))
    check('F8: the client read never surfaces an error (no toast, no throw)', !/toast|throw /i.test(hook) && /return null/.test(hook))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main().catch((e) => { console.error(e); process.exit(1) })
export {}
