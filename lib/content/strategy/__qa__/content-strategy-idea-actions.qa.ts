/**
 * THE CONTENT STRATEGY BOARD ACTS ON ITS IDEAS (C0 + C2 of the content review).
 *
 * The owner pressed "approve the ideas" on the next-article card and landed in the old
 * list view (`/content/strategy?view=list#ideas`), because the card was a link and the
 * board's idea cards had no action at all. The ideas are now approved, rejected and
 * swapped right where they are shown, and "+ add a keyword" adds an approved topic.
 *
 *  R) the requests: each action goes to the route that already does it, with the body
 *     that route reads (lib/content/strategy/ideas.ts);
 *  O) what an answer means: a few outcomes, never a route's or a provider's text;
 *  B) the board while an answer is on its way (optimistic), and "swap";
 *  E) the routes it calls check the session and the owner before the service-role client
 *     reads or writes, and every service-role query stays inside that project;
 *  U) the screens: no path in the new screens leads to the list view to approve an idea,
 *     every request runs from a click, and every failure is our own copy;
 *  N) "new topic" and the dashboard's content calendar land on the board, not the list.
 *
 * Source guards strip comments first. Every guard has a mutation control.
 *
 * Run: npx tsx lib/content/strategy/__qa__/content-strategy-idea-actions.qa.ts
 */
import { existsSync, readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../../__qa__/_fake-admin'
import { rejectIdeas, markIdeasApprovedForTopics } from '../../recommendations/topic-idea-store'
import {
  IDEA_ENDPOINTS, applyIdeaOverrides, approveRequest, canRejectIdea, deferIdea, ideaTargetFromCard, keywordRequest,
  normalizeKeyword, overrideSettled, readApproveOutcome, readRejectOutcome, rejectRequest,
  type IdeaOverride, type IdeaTarget,
} from '../ideas'
import { NO_SEED_PLAN, buildStrategyBoard, type SeedPlan, type StrategyData } from '../board'
import { strategyAddKeywordHref, strategyHref, wantsAddKeyword } from '../view'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const P = 'proj-1'
const plan: IdeaTarget = { key: 'idea:i1', origin: 'plan', title: 'How to choose running shoes', keyword: 'running shoes', reason: 'Buyers search it', ideaId: 'i1', score: 0.9, source: 'hybrid' }
const scan: IdeaTarget = { key: 'scan:0', origin: 'scan', title: 'Trail running for beginners', keyword: null, reason: null, ideaId: null, score: null, source: null }
const ranking: IdeaTarget = { key: 'ranking:merino socks', origin: 'ranking', title: 'merino socks', keyword: null, reason: null, ideaId: null, score: null, source: null }

const DATA: StrategyData = {
  ideas: [
    { id: 'i1', title: 'How to choose running shoes', primaryKeyword: 'running shoes', reason: 'Buyers search it', score: 0.9, createdAt: '2026-09-20T00:00:00Z', source: 'hybrid' },
    { id: 'i2', title: 'Trail shoes guide', primaryKeyword: 'trail shoes', reason: 'Competitors rank', score: 0.8, createdAt: '2026-09-20T00:00:00Z', source: 'hybrid' },
    { id: 'i3', title: 'Merino socks explained', primaryKeyword: 'merino socks', reason: null, score: 0.7, createdAt: '2026-09-20T00:00:00Z', source: 'site_scan' },
  ],
  topics: [],
  articles: [],
}
const board = (data: StrategyData, deferred: string[] = [], seed: SeedPlan = NO_SEED_PLAN) => buildStrategyBoard({ data, queue: [], seed, deferred })
const column = (data: StrategyData, col: string, deferred: string[] = []) => board(data, deferred).cards.filter((c) => c.column === col).map((c) => c.title)

async function main() {
  console.log('Content strategy — acting on ideas from the board')

  // ── R) the requests ─────────────────────────────────────────────────────
  console.log('\nR) each action goes to the route that already does it')
  {
    const viaIdeas = (r: ReturnType<typeof approveRequest>, t: IdeaTarget) => {
      const topic = (r.body.topics as Record<string, unknown>[] | undefined)?.[0]
      return r.url === '/api/content/automation/topics/bulk' && r.body.projectId === P && r.body.status === 'approved'
        && !!topic && topic.ideaId === t.ideaId && topic.title === t.title && topic.primaryKeyword === (t.keyword ?? t.title)
        && topic.source === t.source && topic.suggestionReason === (t.reason ?? '')
    }
    check('R1: approving a stored idea sends it, with its id, to the bulk topics route as approved', viaIdeas(approveRequest(plan, P, true), plan))
    check('R1-MUT: a request without the idea id fails R1 (the idea would stay pending)',
      !viaIdeas({ url: IDEA_ENDPOINTS.approve, body: { ...approveRequest(plan, P, true).body, topics: [{ title: plan.title, primaryKeyword: plan.keyword }] } }, plan))
    check('R1b: an idea with no keyword sends its title as the keyword (the route refuses an empty one)',
      viaIdeas(approveRequest({ ...plan, keyword: null }, P, true), { ...plan, keyword: null }))
    const viaTopics = (r: ReturnType<typeof approveRequest>, topic: string, kw: string | undefined) =>
      r.url === '/api/content/topics' && r.body.projectId === P && r.body.topic === topic && r.body.primary_keyword === kw && !('status' in r.body)
    check('R2: a scan topic (no idea id) goes through the topics route, like the dashboard\'s "create topic"', viaTopics(approveRequest(scan, P, true), scan.title, undefined))
    check('R2b: a ranking keyword is its own keyword', viaTopics(approveRequest(ranking, P, true), 'merino socks', 'merino socks'))
    check('R2c: with automation off even a stored idea goes through the topics route (the bulk route is not there)',
      viaTopics(approveRequest(plan, P, false), plan.title, 'running shoes'))
    check('R2-MUT: sending a scan topic to the bulk route fails R2', !viaTopics({ url: IDEA_ENDPOINTS.approve, body: { projectId: P, topic: scan.title } }, scan.title, undefined))
    const rej = rejectRequest('i1', P)
    check('R3: "not a fit" sends the one idea to the reject route', rej.url === '/api/content/automation/topic-ideas/reject' && JSON.stringify(rej.body) === JSON.stringify({ projectId: P, ideaIds: ['i1'] }))
    check('R3b: only a stored idea, with automation on, can be rejected', canRejectIdea(plan, true) && !canRejectIdea(plan, false) && !canRejectIdea(scan, true) && !canRejectIdea(ranking, true))
    const kw = keywordRequest('trail shoes', P)
    const keywordOk = (r: typeof kw) => {
      const t = (r.body.topics as Record<string, unknown>[])[0]
      return r.url === IDEA_ENDPOINTS.approve && r.body.status === 'approved' && t.source === 'keyword' && t.title === 'trail shoes' && t.primaryKeyword === 'trail shoes' && !('ideaId' in t)
    }
    check('R4: a keyword becomes an approved topic through the route\'s own source "keyword" (no model call)', keywordOk(kw))
    check('R4-MUT: a keyword sent as a suggestion fails R4', !keywordOk({ ...kw, body: { ...kw.body, status: 'suggested' } }))
    check('R4-MUT2: a keyword sent to the recommendation engine (a model call) fails R4', !keywordOk({ ...kw, url: '/api/content/automation/recommendations' }))
    check('R5: a keyword is tidied, and 2 to 80 characters',
      normalizeKeyword('  trail   shoes ') === 'trail shoes' && normalizeKeyword(' a ') === null && normalizeKeyword('x'.repeat(81)) === null && normalizeKeyword('נעלי ריצה') === 'נעלי ריצה')
    // Every endpoint is a route that exists, with a POST.
    const route = (url: string) => join(ROOT, 'app', url.replace(/^\//, ''), 'route.ts')
    const exists = (urls: string[]) => urls.every((u) => existsSync(route(u)) && /export async function POST\(/.test(readFileSync(route(u), 'utf8')))
    check('R6: every endpoint is an existing route with a POST (nothing new on the server)', exists(Object.values(IDEA_ENDPOINTS)))
    check('R6-MUT: an endpoint that does not exist fails R6', !exists([...Object.values(IDEA_ENDPOINTS), '/api/content/strategy/approve']))
  }

  // ── O) what an answer means ─────────────────────────────────────────────
  console.log('\nO) an answer is an outcome, never its text')
  {
    const bulk = (first: unknown) => ({ created: 1, resolvedTopics: [first] })
    check('O1: a created topic', readApproveOutcome(IDEA_ENDPOINTS.approve, true, bulk({ topicId: 't1', source: 'created' })) === 'created')
    check('O2: an existing topic', readApproveOutcome(IDEA_ENDPOINTS.approve, true, bulk({ topicId: 't0', source: 'existing' })) === 'existing')
    check('O3: covered by the site\'s content', readApproveOutcome(IDEA_ENDPOINTS.approve, true, bulk({ topicId: null, unresolvedReason: 'covered_by_existing_content' })) === 'covered')
    check('O4: anything else is a failure', readApproveOutcome(IDEA_ENDPOINTS.approve, false, { error: 'Failed to create topics: duplicate key value violates unique constraint "x"' }) === 'failed'
      && readApproveOutcome(IDEA_ENDPOINTS.approve, true, bulk({ topicId: null, unresolvedReason: 'missing_title_or_keyword' })) === 'failed'
      && readApproveOutcome(IDEA_ENDPOINTS.approve, true, null) === 'failed')
    check('O4-MUT: a 200 with no resolved topic is not a success', readApproveOutcome(IDEA_ENDPOINTS.approve, true, { created: 0, resolvedTopics: [] }) !== 'created')
    check('O5: the topics route: created only with the topic back', readApproveOutcome(IDEA_ENDPOINTS.topic, true, { topic: { id: 't' } }) === 'created'
      && readApproveOutcome(IDEA_ENDPOINTS.topic, false, { error: 'Content module not fully migrated on the server.' }) === 'failed')
    check('O6: rejected only on the route\'s ok', readRejectOutcome(true, { ok: true, rejected: 1 }) && !readRejectOutcome(false, { error: 'Forbidden' }) && !readRejectOutcome(true, {}))
    // The outcomes are words of our own, in both languages.
    for (const lang of ['he', 'en'] as const) {
      const a = getDashboardDictionary(lang).contentStrategy.ideaActions
      check(`O7 (${lang}): every outcome and failure has its line`, [a.approved, a.existing, a.covered, a.rejected, a.approveError, a.rejectError, a.keywordAdded, a.keywordError, a.keywordInvalid].every((v) => typeof v === 'string' && v.length > 5))
    }
  }

  // ── B) the board ────────────────────────────────────────────────────────
  console.log('\nB) the board shows what was just done, and swaps without asking anything')
  {
    const approve: IdeaOverride = { kind: 'approve', key: 'idea:i2', ideaId: 'i2', title: 'Trail shoes guide', keyword: 'trail shoes', reason: 'Competitors rank', at: '2026-09-28T10:00:00Z' }
    const after = applyIdeaOverrides(DATA, [approve])
    const moved = (d: StrategyData) => !column(d, 'ideas').includes('Trail shoes guide') && column(d, 'planned').includes('Trail shoes guide')
    check('B1: an approved idea leaves the ideas and is planned at once', moved(after))
    check('B1-MUT: without the override it is still an idea', !moved(DATA))
    const fresh: StrategyData = { ...DATA, ideas: DATA.ideas.filter((i) => i.id !== 'i2'), topics: [{ id: 't9', title: 'Trail shoes guide', primaryKeyword: 'trail shoes', status: 'approved', source: 'project_data', reason: null, createdAt: '2026-09-28T10:00:01Z' }] }
    const twice = applyIdeaOverrides(fresh, [approve, approve])
    check('B2: applied to rows that already show it, nothing is doubled', twice.topics.length === 1 && column(twice, 'planned').length === 1)
    check('B3: a fresh read that shows it retires it; one that does not, keeps it', overrideSettled(fresh, approve) && !overrideSettled(DATA, approve))
    const rejectO: IdeaOverride = { kind: 'reject', key: 'idea:i1', ideaId: 'i1' }
    check('B4: a rejected idea leaves the column', !column(applyIdeaOverrides(DATA, [rejectO]), 'ideas').includes('How to choose running shoes'))
    const kwO: IdeaOverride = { kind: 'keyword', key: 'keyword:trail runners', title: 'trail runners', at: '2026-09-28T10:00:00Z' }
    check('B5: an added keyword is planned at once', column(applyIdeaOverrides(DATA, [kwO]), 'planned').includes('trail runners'))
    // Swap: the next pending idea takes the place, and nothing is sent or rejected.
    const first = board(DATA).next
    const swapped = board(DATA, deferIdea([], first!.cardKey!)).next
    check('B6: "swap" on the next article brings the next pending idea', first?.ideaId === 'i1' && swapped?.ideaId === 'i2' && swapped.alternatives === 2)
    check('B6-MUT: without the swap the next article stays', board(DATA, []).next?.ideaId === 'i1')
    check('B7: a swapped idea is still on the board, last', JSON.stringify(column(DATA, 'ideas', ['idea:i1'])) === JSON.stringify(['Trail shoes guide', 'Merino socks explained', 'How to choose running shoes']))
    check('B8: swapping every idea cycles through them', board(DATA, deferIdea(deferIdea(deferIdea([], 'idea:i1'), 'idea:i2'), 'idea:i3')).next?.ideaId === 'i1'
      && board(DATA, deferIdea(['idea:i1', 'idea:i2', 'idea:i3'], 'idea:i1')).next?.ideaId === 'i2')
    const card = board(DATA).cards.find((c) => c.key === 'idea:i3')!
    const t = ideaTargetFromCard(card)
    check('B9: a plan card carries what approving it sends (its id, score and source)', !!t && t.ideaId === 'i3' && t.score === 0.7 && t.source === 'site_scan')
    check('B9-MUT: a planned card is not an idea to act on', ideaTargetFromCard({ ...card, column: 'planned' }) === null)
    const seed: SeedPlan = { ...NO_SEED_PLAN, state: 'building', topics: ['Trail running for beginners', 'Road shoes'], scannedAt: '2026-09-27T00:00:00Z' }
    const scanNext = buildStrategyBoard({ data: { ideas: [], topics: [], articles: [] }, queue: [], seed }).next
    check('B10: a scan topic as the next article is a card the actions apply to', scanNext?.kind === 'scan' && scanNext.cardKey === 'scan:0' && scanNext.alternatives === 1)
  }

  // ── E) the routes it calls ──────────────────────────────────────────────
  console.log('\nE) every route called checks the owner, and stays inside the project')
  {
    const routes = {
      bulk: strip(read('app/api/content/automation/topics/bulk/route.ts')),
      reject: strip(read('app/api/content/automation/topic-ideas/reject/route.ts')),
      topics: strip(read('app/api/content/topics/route.ts')),
    }
    const authFirst = (s: string) => {
      const post = s.slice(s.indexOf('export async function POST('))
      const auth = post.indexOf('await authContentProject(')
      const refuse = post.indexOf("if ('error' in auth) return")
      const firstAdmin = post.indexOf('auth.admin')
      return auth > 0 && refuse > auth && firstAdmin > refuse
    }
    for (const [name, s] of Object.entries(routes)) check(`E1 (${name}): the session and the owner are checked before the service role is used`, authFirst(s))
    check('E1-MUT: a route that reads before it checks fails E1',
      !authFirst(routes.reject.replace("const auth = await authContentProject(projectId)", "void auth.admin.from('content_topic_ideas')\n  const auth = await authContentProject(projectId)")))
    const auth = strip(read('lib/content/api-auth.ts'))
    const ownerCheck = (s: string) => /if \(\(project as \{ user_id\?: string \}\)\.user_id !== user\.id\) \{\s*return \{ error: 'Forbidden', status: 403 \}/.test(s) && /if \(!user\) return \{ error: 'Unauthorized', status: 401 \}/.test(s)
    check('E2: authContentProject refuses a signed-out caller and a project someone else owns', ownerCheck(auth))
    check('E2-MUT: without the owner comparison it fails E2', !ownerCheck(auth.replace('.user_id !== user.id)', '.user_id === undefined)')))
    // Every service-role query of the bulk route is scoped to the owned project.
    const scoped = (s: string) => {
      const post = s.slice(s.indexOf('export async function POST('))
      const chains = [...post.matchAll(/auth\.admin\s*\.from\('([a-z_]+)'\)([\s\S]*?)(?:\n\s*\n|;\s*\n|\)\s*\n\s*const|$)/g)]
      return chains.length >= 4 && chains.every((m) => /\.eq\('(project_id|id)', auth\.project\.id\b/.test(m[2]) || (/\.insert\(rows\)/.test(m[2])))
        && /project_id: auth\.project\.id/.test(post) && /user_id: auth\.user\.id/.test(post)
    }
    check('E3: every service-role read of the bulk route filters by the owned project; its insert carries the project and the owner', scoped(routes.bulk))
    check('E3-MUT: an unfiltered read fails E3', !scoped(routes.bulk.replace(".from('generated_articles').select('title, slug').eq('project_id', auth.project.id)", ".from('generated_articles').select('title, slug')")))
    // The idea store: behaviour, over an in-memory database with another project's idea in it.
    const tables = () => ({ content_topic_ideas: [
      { id: 'i1', project_id: 'P1', user_id: 'u1', status: 'pending', title: 'Mine', primary_keyword: 'mine' },
      { id: 'x1', project_id: 'P2', user_id: 'u2', status: 'pending', title: 'Theirs', primary_keyword: 'theirs' },
    ] })
    const db = new FakeAdmin(tables())
    const n = await rejectIdeas(db as never, 'P1', ['i1', 'x1'])
    const rows = db.tables.content_topic_ideas
    check('E4: rejecting touches only the owned project\'s idea, even when another project\'s id is sent',
      n === 1 && rows.find((r) => r.id === 'i1')?.status === 'rejected' && rows.find((r) => r.id === 'x1')?.status === 'pending')
    const db2 = new FakeAdmin(tables())
    await markIdeasApprovedForTopics(db2 as never, 'P1', [{ title: 'Theirs', primaryKeyword: 'theirs', ideaId: 'x1' }, { title: 'Mine', primaryKeyword: 'mine', ideaId: 'i1' }], [{ id: 't1', topic: 'Mine', primary_keyword: 'mine' }])
    check('E5: approving marks only the owned project\'s idea',
      db2.tables.content_topic_ideas.find((r) => r.id === 'x1')?.status === 'pending' && db2.tables.content_topic_ideas.find((r) => r.id === 'i1')?.status === 'approved')
    const store = strip(read('lib/content/recommendations/topic-idea-store.ts'))
    const storeScoped = (s: string) => ['rejectIdeas', 'markIdeasApprovedForTopics', 'markIdeasDuplicate'].every((fn) => {
      const body = s.slice(s.indexOf(`export async function ${fn}(`), s.indexOf('\n}\n', s.indexOf(`export async function ${fn}(`)))
      const chains = body.split('.from(TABLE)').slice(1)
      return chains.length > 0 && chains.every((c) => /\.eq\('project_id', projectId\)/.test(c.slice(0, 400)))
    })
    check('E6: every idea-store write the routes use filters by the project', storeScoped(store))
    check('E6-MUT: an unscoped reject fails E6', !storeScoped(store.replace(".update({ status: 'rejected', rejected_at: nowIso, updated_at: nowIso })\n    .eq('project_id', projectId)", ".update({ status: 'rejected', rejected_at: nowIso, updated_at: nowIso })")))
  }

  // ── U) the screens ──────────────────────────────────────────────────────
  console.log('\nU) the new screens approve in place, from a click, in our own words')
  {
    const card = strip(read('components/content-strategy/NextArticleCard.tsx'))
    const boardSrc = strip(read('components/content-strategy/StrategyBoard.tsx'))
    const hook = strip(read('components/content-strategy/useIdeaActions.ts'))
    const screen = strip(read('components/content-strategy/ContentStrategyScreen.tsx'))
    const noIdeasLink = (s: string) => !/STRATEGY_ANCHORS\.ideas/.test(s) && !/view=list/.test(s) && !/strategyHref\('list'(?!, STRATEGY_ANCHORS\.(queue|topics)\))/.test(s)
    check('U1: the next-article card never leads to the list view\'s ideas', noIdeasLink(card))
    check('U1-MUT: the old "review the ideas" link fails U1', !noIdeasLink(card.replace("? { href: strategyHref('list', STRATEGY_ANCHORS.topics), label: s.queueIt }", "? { href: strategyHref('list', STRATEGY_ANCHORS.ideas), label: s.queueIt }")))
    check('U1b: nor does the board, the add-keyword form, or the hook',
      [boardSrc, hook, strip(read('components/content-strategy/AddKeywordForm.tsx'))].every((s) => noIdeasLink(s) && !/strategyHref\(/.test(s)))
    const approvesInPlace = (s: string) => /data-idea-action="approve"/.test(s) && /onClick=\{\(\) => void act\.actions\.approve\(target\)\}/.test(s)
      && /\{card\.column === 'ideas' && act && <IdeaButtons /.test(s)
    check('U2: every idea card on the board has its approve button, which calls the action in place', approvesInPlace(boardSrc))
    check('U2-MUT: a board whose idea cards have no actions fails U2', !approvesInPlace(boardSrc.replace("{card.column === 'ideas' && act && <IdeaButtons ", '{false && <IdeaButtons ')))
    const nextActs = (s: string) => /ideaActs\.act\.actions\.approve\(ideaActs\.idea\)/.test(s) && /ideaActs\.act\.actions\.swap\(ideaActs\.idea\)/.test(s)
      && /ideaActs\.act\.actions\.reject\(ideaActs\.idea\)/.test(s) && /next\.kind === 'idea' \|\| next\.kind === 'scan'/.test(s)
    check('U3: the next-article card approves, swaps and rejects its idea in place', nextActs(card))
    check('U3-MUT: a card without "swap" fails U3', !nextActs(card.replace('ideaActs.act.actions.swap(ideaActs.idea)', 'void 0')))
    const wired = (s: string) => /idea=\{nextIdea\}/.test(s) && /act=\{act\}/.test(s) && /<StrategyBoard [^>]*act=\{act\}/.test(s)
    check('U4: the screen hands the actions to the card and to the board', wired(screen))
    check('U4-MUT: a board without actions fails U4', !wired(screen.replace(/<StrategyBoard ([^>]*) act=\{act\}/, '<StrategyBoard $1')))
    // Requests only from a click: the hook sends through one helper, called by the three actions, never from an effect.
    // w13: approving also schedules (one more send, to the schedule route), and only
    // from inside the approve and add-keyword handlers (scheduleApproved).
    const clickOnly = (s: string) => !/useEffect/.test(s) && (s.match(/await send\(/g) ?? []).length === 4
      && (s.match(/fetch\(/g) ?? []).length === 1 && /fetch\(req\.url/.test(s)
      && /send\(req\)[\s\S]*send\(rejectRequest\(/.test(s)
      && /await send\(\{ url: STRATEGY_SCHEDULE_ENDPOINTS\.schedule/.test(s)
      && (s.match(/await scheduleApproved\(/g) ?? []).length === 2
    check('U5: every request is one of the three actions, never on its own', clickOnly(hook))
    check('U5-MUT: a hook that approves on mount fails U5', !clickOnly(hook.replace("import { useCallback, useMemo, useRef, useState } from 'react'", "import { useCallback, useEffect, useMemo, useRef, useState } from 'react'") + '\nuseEffect(() => { void send(approveRequest(x, p, true)) }, [])'))
    const ownWords = (s: string) => {
      const says = [...s.matchAll(/say\(([^\n]*)\)/g)].map((m) => m[1])
      return says.length >= 3 && says.every((arg) => /^(text, kind|a\.[a-zA-Z]+|outcomeCopy\(a, )/.test(arg)) && !/(body as [^)]*\)\.(error|message)|e\.message|String\(e\))/.test(s)
    }
    check('U6: every message is our own copy, never a response or an exception', ownWords(hook))
    check('U6-MUT: showing the route\'s error fails U6', !ownWords(hook.replace("say(a.rejectError, 'error')", "say((body as { error: string }).error, 'error')")))
    const optimistic = (s: string) => /ops\.hold\(\{ kind: 'approve'/.test(s) && /ops\.drop\(t\.key\)/.test(s) && /applyIdeaOverrides\(data, overrides\)/.test(s)
    check('U7: approving shows at once, and a failure puts the idea back', optimistic(hook))
    check('U7-MUT: a failure that leaves the idea approved fails U7', !optimistic(hook.replace(/ops\.drop\(t\.key\)/g, 'void 0')))
    const fresh = (s: string) => /if \(outcome !== 'failed'\) onChanged\(\)/.test(s) && /const onChanged = useCallback\(\(\) => \{ reloadStrategy\(\); void loadTopics\(\) \}/.test(screen)
    check('U8: after a change the board reads its rows again, in place (no navigation)', fresh(hook) && !/router\.(push|replace)/.test(hook))
    check('U8-MUT: no refresh after approving fails U8', !fresh(hook.replace("if (outcome !== 'failed') onChanged()", '')))
  }

  // ── N) "new topic" and the dashboard ────────────────────────────────────
  console.log('\nN) "new topic" and the content calendar land on the board')
  {
    const provider = strip(read('components/content/workspace/ContentWorkspaceProvider.tsx'))
    const toBoard = (s: string) => /handleCreateTopic = useCallback\(\(\) => \{\s*if \(automationEnabled\) router\.push\(strategyAddKeywordHref\(\)\)\s*else \{ setEditingTopic\(null\); setBriefOpen\(true\) \}/.test(s)
    check('N1: "new topic" opens the board\'s keyword field (automation), else the manual brief', toBoard(provider))
    check('N1-MUT: "new topic" to the list view fails N1', !toBoard(provider.replace('router.push(strategyAddKeywordHref())', 'goToIdeas()')))
    check('N2: that address is the board, with a fixed parameter', strategyAddKeywordHref() === '/content/strategy?add=keyword' && wantsAddKeyword('keyword') && !wantsAddKeyword('https://evil.example') && !/view=list/.test(strategyAddKeywordHref()))
    const shortcuts = strip(read('components/dashboard/Shortcuts.tsx'))
    const calendar = (s: string) => /export function scheduleHref\(\): string \{\s*return strategyHref\('board'\)/.test(s) && !/strategyHref\('list'/.test(s)
    check('N3: the dashboard\'s content calendar shortcut opens the board', calendar(shortcuts))
    check('N3-MUT: the shortcut to the list view fails N3', !calendar(shortcuts.replace("return strategyHref('board')", "return strategyHref('list', STRATEGY_ANCHORS.queue)")))
    check('N3b: …and that is the bare tab address', strategyHref('board') === '/content/strategy')
    const screen = strip(read('components/content-strategy/ContentStrategyScreen.tsx'))
    const opens = (s: string) => /const addAsked = wantsAddKeyword\(searchParams\.get\(STRATEGY_ADD_PARAM\)\)/.test(s) && /if \(addAsked && automationEnabled && !adding\) setAdding\(true\)/.test(s)
      && /params\.delete\(STRATEGY_ADD_PARAM\)/.test(s) && /onAdd=\{actions\.addKeyword\}/.test(s)
    check('N4: the board opens its keyword field when asked, then drops the parameter', opens(screen))
    check('N4-MUT: a board that ignores the parameter fails N4', !opens(screen.replace('if (addAsked && automationEnabled && !adding) setAdding(true)', '')))
    // The same handler now also feeds the empty-plan state (final review R28), so it is
    // named once and passed to both; the behaviour pinned here is unchanged.
    const emptyCard = (s: string) => /const createTopic = automationEnabled \? \(\) => \{ setView\('board'\); setAdding\(true\) \} : handleCreateTopic\b/.test(s)
      && /onCreateTopic=\{createTopic\}/.test(s)
    check('N5: the next-article card\'s "new topic" opens the same field, in place', emptyCard(screen))
    check('N5-MUT: navigating to the list from it fails N5', !emptyCard(screen.replace("() => { setView('board'); setAdding(true) }", "() => { setView('list') }")))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
