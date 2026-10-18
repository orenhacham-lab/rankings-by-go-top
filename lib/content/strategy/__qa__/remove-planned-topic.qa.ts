/**
 * A PLANNED TOPIC CAN BE TAKEN OUT AGAIN (18 October 2026).
 *
 * The board acted on ideas only. A topic in "planned" had no action at all, and the
 * reject route moves a PENDING idea, so a topic the monthly top-up approved by itself
 * could not be removed — while the top-up's notice told the merchant it could.
 *
 *  A) the card: which planned cards offer the action, and which never do (an
 *     optimistic stand-in, an article already being written);
 *  B) the requests: the queue item FIRST, then the topic, to the routes that already
 *     exist, with the body each one reads;
 *  C) the board while the answer is on its way (optimistic), and when it settles;
 *  D) the surfaces: both views show it, the hook sends PATCH and DELETE, and nothing
 *     a route says ever reaches the screen;
 *  E) the copy, in every locale, no longer promises an action that does not exist.
 *
 * Source guards strip comments first. Every guard has a mutation control.
 *
 * Run: npx tsx lib/content/strategy/__qa__/remove-planned-topic.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import {
  PENDING_TOPIC_PREFIX, PLANNED_ENDPOINTS, REMOVABLE_QUEUE_STATUSES, applyIdeaOverrides, overrideSettled,
  plannedTargetFromCard, readRemovePlannedOutcome, removePlannedRequests, type IdeaOverride,
} from '../ideas'
import { NO_SEED_PLAN, buildStrategyBoard, type StrategyCard, type StrategyData, type StrategyQueueItem } from '../board'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..', '..')
const read = (p: string) => readFileSync(join(ROOT, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1').replace(/\{\/\*[\s\S]*?\*\/\}/g, '')

const P = 'proj-1'
const topic = (id: string, title: string) => ({ id, title, primaryKeyword: title, status: 'approved', source: 'project_data', reason: null, createdAt: '2026-10-01T00:00:00Z' })
const item = (id: string, topicId: string, status: string): StrategyQueueItem =>
  ({ id, topicId, articleId: null, status, position: 0, projectedPublishAt: '2026-11-01T06:00:00Z' })

const DATA: StrategyData = { ideas: [], topics: [topic('t1', 'Dog beds compared'), topic('t2', 'Antler chews')], articles: [] }
const cards = (data: StrategyData, queue: StrategyQueueItem[]) => buildStrategyBoard({ data, queue, seed: NO_SEED_PLAN }).cards
const plannedCard = (data: StrategyData, queue: StrategyQueueItem[], title: string): StrategyCard =>
  cards(data, queue).find((c) => c.column === 'planned' && c.title === title)!

console.log('Removing a planned topic')

// ── A) which cards offer it ───────────────────────────────────────────────
console.log('\nA) the card')
{
  const queued = plannedCard(DATA, [item('q1', 't1', 'queued')], 'Dog beds compared')
  const target = plannedTargetFromCard(queued)
  check('A1: a queued planned topic offers the action, with its queue item', !!target && target.topicId === 't1' && target.queueItemId === 'q1')
  const unqueued = plannedCard(DATA, [], 'Antler chews')
  check('A2: a planned topic with no queue item offers it too, with no item to remove',
    !!plannedTargetFromCard(unqueued) && plannedTargetFromCard(unqueued)!.queueItemId === null)
  const generating = plannedCard(DATA, [item('q2', 't1', 'generating')], 'Dog beds compared')
  check('A3: a topic whose article is being written offers nothing', plannedTargetFromCard(generating) === null)
  const pending: StrategyCard = { ...queued, topicId: `${PENDING_TOPIC_PREFIX}idea:i9` }
  check('A4: an optimistic stand-in (no stored topic yet) offers nothing', plannedTargetFromCard(pending) === null)
  const idea: StrategyCard = { ...queued, column: 'ideas' }
  check('A5: a card in another column offers nothing', plannedTargetFromCard(idea) === null && plannedTargetFromCard({ ...queued, column: 'written', articleId: 'a1' }) === null)
  check('A6: only the waiting states are removable', REMOVABLE_QUEUE_STATUSES.includes('queued') && REMOVABLE_QUEUE_STATUSES.includes('scheduled')
    && !REMOVABLE_QUEUE_STATUSES.includes('generating') && !REMOVABLE_QUEUE_STATUSES.includes('publishing'))
  // MUTATION CONTROL A — a gate that ignored the item's status would let A3 through.
  const mutated = (c: StrategyCard) => (c.column !== 'planned' || c.articleId || !c.topicId ? null : { topicId: c.topicId })
  check('A3-MUT: a gate that ignores the queue status fails A3', mutated(generating) !== null)
}

// ── B) the requests ───────────────────────────────────────────────────────
console.log('\nB) the queue item first, then the topic')
{
  const reqs = removePlannedRequests({ key: 'topic:t1', topicId: 't1', title: 'Dog beds compared', queueItemId: 'q1' }, P)
  check('B1: two requests, the queue item first', reqs.length === 2 && reqs[0].method === 'DELETE' && reqs[0].url === PLANNED_ENDPOINTS.queueItem('q1'))
  check('B2: then the topic is marked rejected, on its own route, with the project',
    reqs[1].method === 'PATCH' && reqs[1].url === PLANNED_ENDPOINTS.topic('t1') && reqs[1].body.status === 'rejected' && reqs[1].body.projectId === P)
  const noItem = removePlannedRequests({ key: 'topic:t2', topicId: 't2', title: 'Antler chews', queueItemId: null }, P)
  check('B3: nothing in the queue means one request only', noItem.length === 1 && noItem[0].method === 'PATCH')
  check('B4: both routes are the ones that already exist and check the owner',
    PLANNED_ENDPOINTS.topic('t1') === '/api/content/topics/t1' && PLANNED_ENDPOINTS.queueItem('q1') === '/api/content/automation/items/q1')
  check('B5: ids are encoded, so no id can shape the path', PLANNED_ENDPOINTS.topic('a/b?c') === '/api/content/topics/a%2Fb%3Fc')
  check('B6: the answer counts only when the topic came back rejected',
    readRemovePlannedOutcome(true, { topic: { id: 't1', status: 'rejected' } })
    && !readRemovePlannedOutcome(true, { topic: { id: 't1', status: 'approved' } })
    && !readRemovePlannedOutcome(false, { topic: { id: 't1', status: 'rejected' } })
    && !readRemovePlannedOutcome(true, { error: 'Failed to update status' }))
  // MUTATION CONTROL B — the topic first would leave a rejected topic in the queue.
  const wrongOrder = [...reqs].reverse()
  check('B1-MUT: the topic before the queue item fails B1', !(wrongOrder[0].method === 'DELETE'))
}

// ── C) the board while the answer is on its way ───────────────────────────
console.log('\nC) optimistic')
{
  const o: IdeaOverride = { kind: 'removeTopic', key: 'topic:t1', topicId: 't1' }
  const after = applyIdeaOverrides(DATA, [o])
  check('C1: the topic leaves the board at once', !after.topics.some((t) => t.id === 't1') && after.topics.some((t) => t.id === 't2'))
  check('C2: no planned card is left for it', !cards(after, [item('q1', 't1', 'queued')]).some((c) => c.title === 'Dog beds compared'))
  check('C3: it settles when a fresh read shows the topic rejected',
    overrideSettled({ ...DATA, topics: [{ ...topic('t1', 'Dog beds compared'), status: 'rejected' }, topic('t2', 'Antler chews')] }, o)
    && overrideSettled({ ...DATA, topics: [topic('t2', 'Antler chews')] }, o))
  check('C4: it does not settle while the topic is still approved', !overrideSettled(DATA, o))
  check('C5: applying it twice changes nothing', JSON.stringify(applyIdeaOverrides(DATA, [o, o])) === JSON.stringify(after))
  check('C6: it touches no idea and no article', after.ideas === DATA.ideas && after.articles === DATA.articles)
}

// ── D) the surfaces ───────────────────────────────────────────────────────
console.log('\nD) the screens and the hook')
{
  const boardSrc = strip(read('components/content-strategy/StrategyBoard.tsx'))
  const listSrc = strip(read('components/content-strategy/StrategyList.tsx'))
  const hook = strip(read('components/content-strategy/useIdeaActions.ts'))
  check('D1: the board shows it on a planned card', /card\.column === 'planned' && act && <RemovePlannedButton/.test(boardSrc))
  check('D2: the list view shows it on a planned row', /card\.column === 'planned' && act \?/.test(listSrc) && /<RemovePlannedButton/.test(listSrc))
  check('D3: the button is the card\'s own action, named for the screen reader', /data-idea-action="remove"/.test(boardSrc) && /a\.removeAria/.test(boardSrc))
  check('D4: the hook sends what the pure module says, in that order', /for \(const req of removePlannedRequests\(t, projectId\)\)/.test(hook))
  check('D5: a failed step stops the sequence', /if \(!ok\) break/.test(hook))
  check('D6: a DELETE carries no body', /method === 'DELETE' \? \{\} : \{ body: JSON\.stringify\(req\.body\) \}/.test(hook))
  check('D7: only our own copy reaches the screen', /say\(a\.removed, 'success'\)/.test(hook) && /say\(a\.removeError, 'error'\)/.test(hook))
  check('D8: a failure puts the topic back on the board', /ops\.drop\(t\.key\)\n\s+say\(a\.removeError/.test(hook))
  // MUTATION CONTROL D — a board that only ever showed the idea buttons fails D1.
  check('D1-MUT: a board without the planned action fails D1',
    !/card\.column === 'planned' && act && <RemovePlannedButton/.test(boardSrc.replace(/card\.column === 'planned' && act && <RemovePlannedButton[^\n]*\n/, '')))
}

// ── E) the copy ───────────────────────────────────────────────────────────
console.log('\nE) the copy, in every locale')
for (const loc of ['he', 'en', 'es', 'pt-BR'] as const) {
  const cs = getDashboardDictionary(loc).contentStrategy
  const a = cs.ideaActions as Record<string, unknown>
  check(`E1 (${loc}): the action, its label for the screen reader, and both answers exist`,
    [a.remove, a.removeAria, a.removed, a.removeError].every((s) => typeof s === 'string' && (s as string).length > 2))
  check(`E2 (${loc}): the label for the screen reader names the topic`, String(a.removeAria).includes('{title}'))
  check(`E3 (${loc}): the top-up's notice no longer sends the merchant to the list view`,
    !/list view|תצוגת הרשימה|vista de lista|visualização em lista/i.test(`${cs.topup.body} ${cs.topup.bodyOne}`))
  check(`E4 (${loc}): it still says a topic that does not fit can be removed`, cs.topup.body.length > 80 && cs.topup.bodyOne.length > 80)
}

console.log(`\n${pass} passed, ${fail} failed`)
if (fail > 0) process.exit(1)

export {}
