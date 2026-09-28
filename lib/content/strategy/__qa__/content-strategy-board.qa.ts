/**
 * THE CONTENT STRATEGY BOARD (W6c) — the pure model behind the tab.
 *
 *  S) the scan's plan state from the latest seed run: none, building, ready, failed,
 *     and the stage-A topics shown as ideas until b4 is ready (row 0);
 *  B) the four columns and their dates, from the four tables (row 2);
 *  M) the month chips add up to "all", in the browser's time zone;
 *  N) the next article, in the order the product will actually write them (row 1);
 *  D) what the plan is built on: the scan's business profile, keywords, audiences,
 *     validated competitors and pages, and the keyword a scan topic targets;
 *  E) the "write the first article" error copy never shows text we did not write;
 *  K) the rankings: tracked keywords the site ranks 4 to 20 for become ideas with no
 *     scan at all (part B of the UX review: an older project has ideas too), each by
 *     its newest check, Google search only, closest first, at most five, never a
 *     second card for a keyword the board already names.
 *
 * Every check has a mutation control: the rule broken on purpose (a different
 * implementation, or the fixture changed so the rule is the only thing that decides)
 * and shown to fail.
 *
 * Run: npx tsx lib/content/strategy/__qa__/content-strategy-board.qa.ts
 */
import {
  ALL_MONTHS, buildStrategyBoard, cardsInMonth, keywordForTopic, monthChips, monthKey, NO_SEED_PLAN, rankingIdeas, sameTopicKey, seedPlanFromRun,
  type RankingResultRow, type RankingTargetRow, type SeedPlan, type SeedRunLike, type StrategyBoard, type StrategyData, type StrategyQueueItem,
} from '../board'
import { generationErrorCopy } from '../copy'
import { getDashboardDictionary } from '../../../i18n/dashboard/getDashboardDictionary'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const TOPICS_A = ['Topic one', 'Topic two', 'Topic three', 'Topic four', 'Topic five', 'Topic six']
const step = (s: string, status: string) => ({ step: s, status })
const stageB = (b4: string, status = 'running'): SeedRunLike => ({
  stage: 'b', status,
  steps: [step('a1', 'done'), step('a2', 'done'), step('a3', 'done'), step('a4', 'done'), step('b1', 'done'), step('b2', 'done'), step('b3', 'done'), step('b4', b4)],
  summary: { topics: TOPICS_A, scannedAt: '2026-09-20T10:00:00.000Z' },
})

function main() {
  console.log('Content strategy — the board model')

  // ── S) the scan's plan ────────────────────────────────────────────────────
  console.log('\nS) the scan\'s plan state')
  {
    check('S1: no run is no scan', seedPlanFromRun(null).state === 'none' && seedPlanFromRun(undefined).topics.length === 0)
    const building = seedPlanFromRun(stageB('running'))
    check('S2: b4 still running is building, with stage A\'s topics (at most 5)',
      building.state === 'building' && building.topics.length === 5 && building.topics[0] === 'Topic one' && building.scannedAt === '2026-09-20T10:00:00.000Z',
      JSON.stringify(building))
    const awaiting = seedPlanFromRun({ stage: 'a', status: 'done', steps: [step('a1', 'done'), step('a2', 'done')], summary: { topics: ['X'] } })
    check('S3: a finished stage A waiting for stage B is building too', awaiting.state === 'building' && awaiting.topics.join() === 'X')
    const ready = seedPlanFromRun(stageB('done', 'done'))
    check('S4: b4 done is ready, and the engine\'s ideas replace stage A\'s topics', ready.state === 'ready' && ready.topics.length === 0)
    const failedB4 = seedPlanFromRun(stageB('failed', 'partial'))
    const skippedB4 = seedPlanFromRun(stageB('skipped', 'partial'))
    const failedRun = seedPlanFromRun({ stage: 'a', status: 'failed', steps: [step('a1', 'failed')], summary: null })
    const noB4Row = seedPlanFromRun({ stage: 'b', status: 'done', steps: [], summary: { topics: ['Y'] } })
    check('S5: a failed or skipped b4, a failed run, and a finished stage B without b4 are all failed',
      [failedB4, skippedB4, failedRun, noB4Row].every((p) => p.state === 'failed'))
    check('S6: a failed plan keeps stage A\'s topics to show as ideas', failedB4.topics.length === 5 && noB4Row.topics.join() === 'Y')
    const junk = seedPlanFromRun({ stage: 'b', status: 'running', steps: [], summary: { topics: [1, '', '  ', 'ok', null] } })
    check('S7: only real, non-empty strings of the summary become topics', junk.topics.join('|') === 'ok')
    // MUT: a reading that trusts the run status alone calls a running b4 "ready" once
    // the run's status is done, and never reports the failure of b4 itself.
    const statusOnly = (run: SeedRunLike): SeedPlan['state'] => (run.status === 'done' ? 'ready' : run.status === 'failed' ? 'failed' : 'building')
    check('S-MUT: reading the run status instead of b4 gets S4/S5 wrong',
      statusOnly(stageB('failed', 'partial')) !== failedB4.state && statusOnly(stageB('skipped', 'done')) !== seedPlanFromRun(stageB('skipped', 'done')).state)
  }

  // ── B) the columns ────────────────────────────────────────────────────────
  console.log('\nB) four columns, from four tables')
  const data: StrategyData = {
    ideas: [
      { id: 'i1', title: 'Best trail shoes for winter', primaryKeyword: 'winter trail shoes', reason: 'High demand, no page yet', score: 0.4, createdAt: '2026-09-10T08:00:00.000Z' },
      { id: 'i2', title: 'How to clean running shoes', primaryKeyword: 'clean running shoes', reason: 'Asked a lot', score: 0.9, createdAt: '2026-09-11T08:00:00.000Z' },
      // Already a topic, spelled differently: never shown twice.
      { id: 'i3', title: 'SOCKS for marathon runners!', primaryKeyword: null, reason: null, score: 1, createdAt: '2026-09-12T08:00:00.000Z' },
    ],
    topics: [
      { id: 't1', title: 'Socks for marathon runners', primaryKeyword: 'marathon socks', status: 'approved', source: 'keyword', reason: 'Seasonal peak', createdAt: '2026-09-01T08:00:00.000Z' },
      { id: 't2', title: 'Trail running for beginners', primaryKeyword: 'trail running', status: 'approved', source: 'manual', reason: null, createdAt: '2026-08-20T08:00:00.000Z' },
      { id: 't3', title: 'Written already', primaryKeyword: 'done kw', status: 'used', source: 'keyword', reason: 'Old reason', createdAt: '2026-07-01T08:00:00.000Z' },
      { id: 't4', title: 'Rejected topic', primaryKeyword: null, status: 'rejected', source: 'keyword', reason: null, createdAt: '2026-09-02T08:00:00.000Z' },
      { id: 't5', title: 'Published topic', primaryKeyword: 'pub kw', status: 'used', source: 'keyword', reason: null, createdAt: '2026-06-01T08:00:00.000Z' },
    ],
    articles: [
      { id: 'a1', topicId: 't3', title: 'Written already', status: 'draft', scheduledAt: null, publishedAt: null, createdAt: '2026-09-05T08:00:00.000Z' },
      { id: 'a2', topicId: 't5', title: 'Published topic', status: 'published', scheduledAt: null, publishedAt: '2026-08-15T08:00:00.000Z', createdAt: '2026-08-01T08:00:00.000Z' },
      { id: 'a3', topicId: null, title: 'Scheduled piece', status: 'scheduled', scheduledAt: '2026-11-03T08:00:00.000Z', publishedAt: null, createdAt: '2026-09-06T08:00:00.000Z' },
    ],
  }
  // Listed out of position order on purpose: the queue is ordered by position.
  const queue: StrategyQueueItem[] = [
    { id: 'q2', topicId: 't3', articleId: 'a1', status: 'generated', position: 2, projectedPublishAt: '2026-10-21T07:00:00.000Z' },
    { id: 'q1', topicId: 't1', articleId: null, status: 'queued', position: 1, projectedPublishAt: '2026-10-14T07:00:00.000Z' },
    { id: 'q0', topicId: 't5', articleId: 'a2', status: 'published', position: 0, projectedPublishAt: '2026-08-15T08:00:00.000Z' },
  ]
  const board = buildStrategyBoard({ data, queue, seed: NO_SEED_PLAN })
  const col = (b: StrategyBoard, c: string) => b.cards.filter((x) => x.column === c)
  const card = (b: StrategyBoard, key: string) => b.cards.find((x) => x.key === key)
  {
    check('B1: ideas are the pending ideas, best score first, minus one a topic already covers',
      col(board, 'ideas').map((c) => c.key).join() === 'idea:i2,idea:i1', col(board, 'ideas').map((c) => c.key).join())
    check('B2: planned are topics without an article; a rejected topic is nowhere',
      col(board, 'planned').map((c) => c.key).sort().join() === 'topic:t1,topic:t2' && !board.cards.some((c) => c.key === 'topic:t4'))
    const t1 = card(board, 'topic:t1')!, t2 = card(board, 'topic:t2')!
    check('B3: a queued topic is dated by its projected slot; one not queued, by when it was added',
      t1.date === '2026-10-14T07:00:00.000Z' && t1.dateKind === 'publishTarget' && t1.queued
      && t2.date === '2026-08-20T08:00:00.000Z' && t2.dateKind === 'added' && !t2.queued)
    const a1 = card(board, 'article:a1')!, a3 = card(board, 'article:a3')!, a2 = card(board, 'article:a2')!
    check('B4: written are unpublished articles: scheduled by its schedule, queued by its slot',
      col(board, 'written').length === 2 && a3.dateKind === 'scheduled' && a3.date === '2026-11-03T08:00:00.000Z'
      && a1.dateKind === 'publishTarget' && a1.date === '2026-10-21T07:00:00.000Z' && a1.queued)
    check('B5: published are published articles, dated when they went live, and open the article',
      col(board, 'published').length === 1 && a2.date === '2026-08-15T08:00:00.000Z' && a2.dateKind === 'published' && a2.articleId === 'a2')
    check('B6: an article carries its topic\'s keyword and reason', a1.keyword === 'done kw' && a1.reason === 'Old reason')
    check('B7: the column counts are the cards, and every card is in one column',
      board.counts.ideas + board.counts.planned + board.counts.written + board.counts.published === board.cards.length
      && board.counts.planned === 2 && board.counts.written === 2)
    check('B8: the project has articles', board.hasArticles && !buildStrategyBoard({ data: { ...data, articles: [] }, queue: null, seed: NO_SEED_PLAN }).hasArticles)
    check('B9: case, spacing and punctuation do not make two topics different',
      sameTopicKey('SOCKS for  marathon runners!') === sameTopicKey('socks for marathon runners'))
    // MUT: a board that takes every pending idea as it comes shows the covered one twice.
    const noDedupe = [...data.ideas].length
    check('B-MUT: without de-duplication the fixture would show three ideas, not two', noDedupe === 3 && col(board, 'ideas').length === 2)
    // MUT: without the queue the same topic loses its slot, so B3 is decided by the queue alone.
    const noQueue = buildStrategyBoard({ data, queue: null, seed: NO_SEED_PLAN })
    check('B3-MUT: the same topic without the queue is dated by when it was added, not its slot',
      card(noQueue, 'topic:t1')!.dateKind === 'added' && card(noQueue, 'topic:t1')!.date !== t1.date)
  }

  // ── Seed ideas ────────────────────────────────────────────────────────────
  console.log('\nS/B) the scan\'s topics on the board')
  {
    const building: SeedPlan = { state: 'building', topics: ['Brand new idea', 'socks for marathon runners', 'Written already.'], keywords: [], basis: null, scannedAt: '2026-09-20T10:00:00.000Z', stalled: false }
    const withSeed = buildStrategyBoard({ data, queue, seed: building })
    const scan = withSeed.cards.filter((c) => c.origin === 'scan')
    check('S8: while b4 builds, the scan\'s topics are ideas marked as from the scan, dated by the scan',
      scan.length === 1 && scan[0].title === 'Brand new idea' && scan[0].column === 'ideas' && scan[0].dateKind === 'scanned' && scan[0].date === '2026-09-20T10:00:00.000Z',
      JSON.stringify(scan))
    check('S9: …minus the ones a topic or an article already covers', !scan.some((c) => /socks|written/i.test(c.title)))
    const failed = buildStrategyBoard({ data, queue, seed: { ...building, state: 'failed' } })
    check('S10: a failed plan still shows them', failed.cards.some((c) => c.origin === 'scan'))
    const ready = buildStrategyBoard({ data, queue, seed: { ...building, state: 'ready' } })
    const none = buildStrategyBoard({ data, queue, seed: { ...building, state: 'none' } })
    check('S11: a ready plan and no scan show none of them', !ready.cards.some((c) => c.origin === 'scan') && !none.cards.some((c) => c.origin === 'scan'))
    const empty = buildStrategyBoard({ data: { ideas: [], topics: [], articles: [] }, queue: null, seed: { ...building, topics: ['A', 'B', 'C', 'D', 'E'] } })
    check('S12: a seeded project with nothing else opens with the scan\'s five topics as ideas, and the first is next',
      empty.counts.ideas === 5 && empty.next?.kind === 'scan' && empty.next.title === 'A' && !empty.hasArticles)
  }

  // ── M) months ─────────────────────────────────────────────────────────────
  console.log('\nM) month chips')
  {
    const chips = monthChips(board.cards, 'UTC')
    const all = chips[0]
    check('M1: "all" first, counting every card', all.key === ALL_MONTHS && all.count === board.cards.length)
    const months = chips.slice(1)
    check('M2: then each month that has a card, oldest first',
      months.map((c) => c.key).join() === '2026-08,2026-09,2026-10,2026-11', months.map((c) => `${c.key}:${c.count}`).join())
    check('M3: the months add up to "all" when every card is dated', months.reduce((n, c) => n + c.count, 0) === all.count)
    check('M4: a month shows exactly its cards', cardsInMonth(board.cards, '2026-10', 'UTC').map((c) => c.key).sort().join() === 'article:a1,topic:t1'
      && cardsInMonth(board.cards, ALL_MONTHS, 'UTC').length === board.cards.length)
    check('M5: the month is the one in the time zone asked for',
      monthKey('2026-09-30T22:30:00.000Z', 'Asia/Jerusalem') === '2026-10' && monthKey('2026-09-30T22:30:00.000Z', 'UTC') === '2026-09')
    check('M6: an unreadable date has no month', monthKey('not a date', 'UTC') === null && monthKey(null) === null)
    const naive = (iso: string) => iso.slice(0, 7)
    check('M-MUT: slicing the UTC string gets M5 wrong in Israel', naive('2026-09-30T22:30:00.000Z') !== monthKey('2026-09-30T22:30:00.000Z', 'Asia/Jerusalem'))
  }

  // ── N) the next article ───────────────────────────────────────────────────
  console.log('\nN) the next article')
  {
    const n = board.next!
    check('N1: the first item still waiting in the queue, by position, on its slot, with its topic\'s reason',
      n.kind === 'queued' && n.topicId === 't1' && n.date === '2026-10-14T07:00:00.000Z' && n.reason === 'Seasonal peak'
      && n.queuePosition === 1 && n.queueLength === 2 && n.keyword === 'marathon socks', JSON.stringify(n))
    // MUT: taking the queue's first element as listed picks the generated article instead.
    check('N1-MUT: picking by array order instead of position chooses a different item', queue[0].topicId !== n.topicId)
    check('N2: a published queue item never counts as waiting', n.queueLength === 2)
    const noQueue = buildStrategyBoard({ data, queue: null, seed: NO_SEED_PLAN }).next!
    check('N3: no queue: the topic that has waited longest for an article, not queued, no date',
      noQueue.kind === 'topic' && noQueue.topicId === 't2' && noQueue.date === null && noQueue.source === 'manual')
    const onlyIdeas = buildStrategyBoard({ data: { ideas: data.ideas, topics: [], articles: [] }, queue: null, seed: NO_SEED_PLAN }).next!
    check('N4: no topic either: the engine\'s best idea, with its reason', onlyIdeas.kind === 'idea' && onlyIdeas.ideaId === 'i3' && onlyIdeas.topicId === null)
    const nothing = buildStrategyBoard({ data: { ideas: [], topics: [], articles: [] }, queue: [], seed: NO_SEED_PLAN })
    check('N5: nothing at all: no next article', nothing.next === null && nothing.cards.length === 0)
    const latestFirst = [...data.topics].filter((t) => t.status !== 'rejected' && !['t3', 't5'].includes(t.id)).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0]
    check('N3-MUT: newest-first would choose a different topic', latestFirst.id !== noQueue.topicId)
  }

  // ── D) the plan's basis ───────────────────────────────────────────────────
  console.log('\nD) what the plan is built on')
  {
    const run: SeedRunLike = {
      stage: 'b', status: 'running',
      steps: [step('a2', 'done'), { step: 'b1', status: 'done', itemCount: 12 }, step('b4', 'running')],
      summary: {
        topics: ['How to choose trail running shoes', 'Caring for merino socks'],
        seedKeywords: ['running shoes', 'trail running shoes', 'merino socks', 'insoles'],
        audiences: ['Trail runners', 'Marathoners', 'Beginners'],
        competitors: [{ domain: 'a.test', validated: true }, { domain: 'b.test', validated: true }, { domain: 'c.test', validated: false }],
        business: { description: 'A running store.', niche: 'Running gear' },
        sitemapUrlCount: 300,
      },
    }
    const plan = seedPlanFromRun(run)
    const b = plan.basis!
    check('D1: the basis counts the scan\'s business, keywords, audiences and pages',
      b.business && b.niche === 'Running gear' && b.keywords === 4 && b.audiences === 3 && b.pages === 12, JSON.stringify(b))
    check('D2: only competitors validated in real search results count', b.competitors === 2)
    check('D2-MUT: counting every suggested competitor would say 3', (run.summary!.competitors as unknown[]).length === 3)
    const noB1 = seedPlanFromRun({ ...run, steps: [step('b4', 'running')] })
    check('D3: before b1 has read the pages, the sitemap\'s count stands in', noB1.basis!.pages === 300)
    check('D4: a run without a snapshot has no basis', seedPlanFromRun({ ...run, summary: null }).basis === null && NO_SEED_PLAN.basis === null)
    check('D5: a topic targets the longest seed keyword it spells out in full',
      keywordForTopic('How to choose trail running shoes', plan.keywords) === 'trail running shoes'
      && keywordForTopic('Caring for merino socks', plan.keywords) === 'merino socks')
    check('D6: a topic that names no keyword gets none, never a guess',
      keywordForTopic('Running tips', ['run', 'shoes']) === null && keywordForTopic('Anything', []) === null)
    const substring = (t: string, ks: string[]) => ks.find((k) => t.toLowerCase().includes(k)) ?? null
    check('D6-MUT: matching by substring would claim "run" for "Running tips"', substring('Running tips', ['run']) === 'run')
    const withKw = buildStrategyBoard({ data: { ideas: [], topics: [], articles: [] }, queue: null, seed: plan })
    check('D7: a scan topic on the board carries its keyword, and so does the next article',
      withKw.cards[0]?.keyword === 'trail running shoes' && withKw.next?.keyword === 'trail running shoes')
  }

  // ── E) error copy ─────────────────────────────────────────────────────────
  console.log('\nE) "write the first article" errors are our copy')
  {
    for (const loc of ['he', 'en'] as const) {
      const errs = getDashboardDictionary(loc).contentHub.genErrors as Record<string, string>
      check(`E1 (${loc}): an allowance refusal reads as the allowance line`, generationErrorCopy({ reason: 'quota_exceeded' }, errs) === errs.quota_exceeded)
      const leaked = generationErrorCopy({ error: 'Gemini 500: internal stack at /srv', reason: 'Gemini 500: upstream said no' }, errs)
      check(`E2 (${loc}): provider text in the body becomes the generic line`, leaked === errs.unknown && !/Gemini|stack|upstream/.test(leaked))
      check(`E3 (${loc}): an inherited key is not a code`, generationErrorCopy({ reason: 'constructor' }, errs) === errs.unknown && generationErrorCopy(null, errs) === errs.unknown)
      const echo = (body: unknown) => { const r = (body as { reason?: string }).reason; return typeof r === 'string' ? (errs[r] ?? r) : errs.unknown }
      check(`E-MUT (${loc}): echoing an unknown reason would show the provider text`, /Gemini/.test(echo({ reason: 'Gemini 500: upstream said no' })))
    }
  }

  // ── K) ideas from the rankings ────────────────────────────────────────────
  console.log('\nK) the tracked keywords close to the top are ideas, with no scan')
  {
    const t = (id: string, keyword: string, engine = 'google_search', active = true): RankingTargetRow => ({ id, keyword, engine_type: engine, is_active: active })
    const r = (id: string, position: number | null, at: string, found = true): RankingResultRow => ({ tracking_target_id: id, position, found, checked_at: at })
    const targets = [t('a', 'dentist haifa'), t('b', 'teeth whitening'), t('c', 'dental implants'), t('d', 'root canal price'), t('e', 'maps listing', 'google_maps'),
      t('f', 'paused keyword', 'google_search', false), t('g', 'kids dentist'), t('h', 'clear aligners'), t('i', 'crown'), t('j', 'veneers'), t('k', 'not found')]
    const results = [
      r('a', 7, '2026-09-20T05:00:00Z'), r('a', 14, '2026-08-20T05:00:00Z'),
      r('b', 28, '2026-09-20T05:00:00Z'), r('b', 12, '2026-07-20T05:00:00Z'),
      r('c', 12, '2026-09-20T05:00:00Z'), r('d', 3, '2026-09-20T05:00:00Z'), r('e', 5, '2026-09-20T05:00:00Z'), r('f', 6, '2026-09-20T05:00:00Z'),
      r('g', 4, '2026-09-20T05:00:00Z'), r('h', 20, '2026-09-20T05:00:00Z'), r('i', 19, '2026-09-20T05:00:00Z'), r('j', 9, '2026-09-20T05:00:00Z'),
      r('k', 8, '2026-09-20T05:00:00Z', false),
    ]
    const ideas = rankingIdeas(targets, results)
    const edge = (p: number) => rankingIdeas([t('x', 'edge')], [r('x', p, '2026-09-20T05:00:00Z')]).length
    check('K1: 4 to 20 by the newest check, Google search and active only, never "not found", closest first, at most five',
      JSON.stringify(ideas.map((i) => [i.keyword, i.position])) === JSON.stringify([['kids dentist', 4], ['dentist haifa', 7], ['veneers', 9], ['dental implants', 12], ['crown', 19]])
      && [3, 4, 20, 21].map(edge).join() === '0,1,1,0',
      JSON.stringify(ideas))
    // The rows in another order give the same answer: the newest check decides, not the read's order.
    check('K1-MUT: the oldest check of "teeth whitening" (12) would make it one; its newest (28) does not',
      !rankingIdeas(targets, [...results].reverse()).some((i) => i.keyword === 'teeth whitening') && rankingIdeas([t('b', 'teeth whitening')], [r('b', 12, '2026-07-20T05:00:00Z')]).length === 1)
    const data: StrategyData = {
      ideas: [], articles: [],
      topics: [{ id: 't1', title: 'Best dental implants in Haifa', primaryKeyword: 'dental implants', status: 'approved', source: 'manual', reason: null, createdAt: '2026-09-01T00:00:00Z' }],
    }
    const board = buildStrategyBoard({ data, queue: null, seed: NO_SEED_PLAN, ranking: ideas })
    const rankingCards = board.cards.filter((c) => c.origin === 'ranking')
    check('K2: with no scan, the ideas column holds the rankings (each dated by its check), minus a keyword a topic already targets',
      JSON.stringify(rankingCards.map((c) => [c.title, c.position, c.column, c.dateKind])) === JSON.stringify([
        ['kids dentist', 4, 'ideas', 'checked'], ['dentist haifa', 7, 'ideas', 'checked'], ['veneers', 9, 'ideas', 'checked'], ['crown', 19, 'ideas', 'checked'],
      ]) && rankingCards.every((c) => c.date === '2026-09-20T05:00:00Z' && c.keyword === null && c.reason === null) && board.counts.ideas === 4,
      JSON.stringify(rankingCards.map((c) => [c.title, c.position])))
    const noDedup = buildStrategyBoard({ data: { ...data, topics: [{ ...data.topics[0], primaryKeyword: null }] }, queue: null, seed: NO_SEED_PLAN, ranking: ideas })
    check('K2-MUT: the same topic without its keyword leaves "dental implants" free, and it is an idea again', noDedup.cards.some((c) => c.origin === 'ranking' && c.title === 'dental implants'))
    check('K3: a ranking idea is never "the next article" (the next article is what the product will write)',
      buildStrategyBoard({ data: { ideas: [], topics: [], articles: [] }, queue: null, seed: NO_SEED_PLAN, ranking: ideas }).next === null)
    for (const loc of ['he', 'en'] as const) {
      const cs = getDashboardDictionary(loc).contentStrategy
      check(`K4 (${loc}): the card's copy exists for its origin, its date and its why`,
        !!cs.origins.ranking && !!cs.dateKinds.checked && cs.rankingReason.includes('{n}') && cs.rankingReasonTop.includes('{n}') && !!cs.factSource.ranking)
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()

export {}
