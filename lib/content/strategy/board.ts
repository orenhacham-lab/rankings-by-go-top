/**
 * The content strategy tab's model: what will be written, when, and why this one.
 *
 * The tab merges what used to be two screens ("topics" and "automation") into one
 * month board with four columns (ideas, planned, written, published), a "next
 * article" card, and the seeding scan's plan. Everything here is PURE: the screen
 * hands it rows it already read (GET /api/content/strategy, the publishing queue of
 * GET /api/content/automation/pools, and the seeding scan of GET
 * /api/projects/[id]/seed) and renders what comes back. Nothing here fetches,
 * writes, or asks a model for anything, so opening the tab costs nothing.
 *
 * Where each card comes from:
 *   ideas      pending content_topic_ideas (the recommendation engine, which is what
 *              the scan's step b4 runs); the tracked keywords the site already ranks
 *              4 to 20 for (its last check), which need no scan, so an older project
 *              has ideas too; and, until b4 is ready, the topics the scan's stage A
 *              found (its summary), marked as coming from the scan
 *   planned    article_topics that have no article yet, dated by the queue when queued
 *   written    generated_articles that are not published yet
 *   published  generated_articles that are published
 *
 * Every card carries one date and the kind of date it is. Only a date the plan is
 * built on (a publish slot, a schedule, a publication) puts a card IN a month; an idea
 * or a topic that is not scheduled yet carries the day it was added, which is no
 * month of the plan, so it is shown under every month chip (see "Months" below).
 */

export type StrategyColumn = 'ideas' | 'planned' | 'written' | 'published'
export const STRATEGY_COLUMNS: readonly StrategyColumn[] = ['ideas', 'planned', 'written', 'published']

/** What the date on a card means. The screen names each kind; it never guesses. */
export type StrategyDateKind = 'added' | 'publishTarget' | 'scheduled' | 'written' | 'published' | 'scanned' | 'checked'

/** Where a card's topic came from, shown as a small label on the card. */
export type StrategyOrigin = 'scan' | 'plan' | 'manual' | 'topic' | 'ranking'

/** A tracked keyword the site already ranks for, close to the top: an article can move it up. */
export type StrategyRanking = { keyword: string; position: number; checkedAt: string }

/** A pending idea, as GET /api/content/strategy returns it. */
export type StrategyIdea = {
  id: string
  title: string
  primaryKeyword: string | null
  reason: string | null
  score: number | null
  createdAt: string
  /** The engine's source for it (content_topic_ideas.source), sent back when it is approved. */
  source?: string | null
}

/** A topic (article_topics), with the reason it was suggested when there is one. */
export type StrategyTopic = {
  id: string
  title: string
  primaryKeyword: string | null
  status: string
  source: string
  reason: string | null
  createdAt: string
  /**
   * Set when the monthly top-up prepared it (lib/content/automation/topic-topup.ts):
   * when, and the source of the plan's idea it came from. Absent otherwise.
   */
  autoPrepared?: { at: string; source: string | null }
}

/** An article (generated_articles), without its body. */
export type StrategyArticle = {
  id: string
  topicId: string | null
  title: string
  status: string
  scheduledAt: string | null
  publishedAt: string | null
  createdAt: string
}

export type StrategyData = {
  ideas: StrategyIdea[]
  topics: StrategyTopic[]
  articles: StrategyArticle[]
}

/** One item of the publishing queue, as GET /api/content/automation/pools returns it. */
export type StrategyQueueItem = {
  id: string
  topicId: string | null
  articleId: string | null
  status: string
  position: number
  projectedPublishAt: string | null
  topicTitle?: string | null
  /** Why the item stopped, as stored (read only as a code; never shown). */
  lastError?: string | null
}

/**
 * The seeding scan, reduced to what this tab needs.
 *   none      no scan: the feature is off, or the project is older than it
 *   building  the scan runs, or waits for stage B; b4 has not produced its plan yet
 *   ready     b4 finished: the plan is the ideas the engine stored
 *   failed    the scan failed, or b4 ended without a plan
 */
export type SeedPlanState = 'none' | 'building' | 'ready' | 'failed'

/**
 * What the scan found that the plan is built on, as counts the screen can show without
 * asking anything: the business (a2's understanding of the site), its audiences, the
 * seed keywords, the competitors a4 validated in real search results, and the pages
 * b1 read. The topics themselves come from this data (see seedPlanFromRun).
 */
export type SeedBasis = {
  business: boolean
  niche: string | null
  audiences: number
  keywords: number
  competitors: number
  pages: number | null
}

export type SeedPlan = {
  state: SeedPlanState
  /** Stage A's article topics (a2), shown as ideas until b4 is ready. */
  topics: string[]
  /** The scan's seed keywords, to name the keyword a stage-A topic targets. */
  keywords: string[]
  basis: SeedBasis | null
  /** When the site was read, the date those topics carry. */
  scannedAt: string | null
  /** Still marked running while its worker's lease lapsed; the cron resumes it. */
  stalled: boolean
  /** The audiences the scan understood (the "who is it for" of each topic, until the owner's own list is read). */
  audiences?: string[]
}

export const NO_SEED_PLAN: SeedPlan = { state: 'none', topics: [], keywords: [], basis: null, scannedAt: null, stalled: false }

/** Queue states in which an item still waits for its slot (the pools route's own list). */
export const PENDING_QUEUE_STATUSES: readonly string[] = ['queued', 'scheduled', 'generating', 'generated', 'publishing']

export type StrategyCard = {
  key: string
  column: StrategyColumn
  title: string
  keyword: string | null
  date: string | null
  dateKind: StrategyDateKind
  origin: StrategyOrigin
  reason: string | null
  topicId: string | null
  articleId: string | null
  /** The topic waits in the publishing queue. */
  queued: boolean
  /** For an idea from the rankings: where the site stands on its keyword today. */
  position?: number
  /** For an idea of the content plan: the stored idea, its score and source (what approving it sends). */
  ideaId?: string | null
  score?: number | null
  source?: string | null
}

export type NextArticleKind = 'queued' | 'topic' | 'idea' | 'scan'

export type NextArticle = {
  kind: NextArticleKind
  title: string
  keyword: string | null
  /** The slot it is projected to publish in; null when it is not queued yet. */
  date: string | null
  /** The engine's own reason, or the topic's; null when there is none (the screen says why instead). */
  reason: string | null
  source: string | null
  topicId: string | null
  articleId: string | null
  ideaId: string | null
  /** 1-based place in the publishing queue, and the queue's length; null when not queued. */
  queuePosition: number | null
  queueLength: number
  /** The board card it is, when it is an idea (so the card's own actions apply to it). */
  cardKey: string | null
}

/**
 * The ideas column holds three kinds of card: the ideas the plan stored ('plan': what the dashboard's
 * "N topics waiting for approval" counts), suggestions from the keywords the site already ranks for
 * ('ranking'), and, until the plan is ready, topics from the scan ('scan'). When more than one kind is
 * there the column names each group with its own count, so the dashboard's number is visible on the board.
 */
export type IdeaGroupKind = 'plan' | 'ranking' | 'scan'
export const IDEA_GROUP_ORDER: readonly IdeaGroupKind[] = ['plan', 'ranking', 'scan']
export function ideaGroupOf(card: Pick<StrategyCard, 'origin'>): IdeaGroupKind {
  return card.origin === 'ranking' ? 'ranking' : card.origin === 'scan' ? 'scan' : 'plan'
}
export function ideaGroupCounts(cards: readonly Pick<StrategyCard, 'origin'>[]): Record<IdeaGroupKind, number> {
  const counts: Record<IdeaGroupKind, number> = { plan: 0, ranking: 0, scan: 0 }
  for (const c of cards) counts[ideaGroupOf(c)]++
  return counts
}

export type StrategyBoard = {
  cards: StrategyCard[]
  next: NextArticle | null
  hasArticles: boolean
  counts: Record<StrategyColumn, number>
}

// ── The scan ────────────────────────────────────────────────────────────────

type SeedStepLike = { step: string; status: string; itemCount?: number | null }
/** The fields of GET /api/projects/[id]/seed's `run` this tab reads. */
export type SeedRunLike = {
  stage: string
  status: string
  stalled?: boolean
  steps: SeedStepLike[]
  summary: {
    topics?: unknown; scannedAt?: unknown; seedKeywords?: unknown; audiences?: unknown
    competitors?: unknown; business?: unknown; sitemapUrlCount?: unknown
  } | null
}

const MAX_SEED_TOPICS = 5

const texts = (v: unknown, max: number): string[] =>
  Array.isArray(v) ? v.filter((t): t is string => typeof t === 'string' && t.trim().length > 0).map((t) => t.trim()).slice(0, max) : []
const count = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) && v >= 0 ? Math.floor(v) : null)

/**
 * The scan's plan, from the latest run (null when there is none, or the route said
 * the feature is off). Stage A's topics are kept in every state but `ready`, where
 * the engine's ideas replace them, and `none`.
 *
 * Where the topics come from, both from the scan's own data:
 *   stage A (a2)  the article topics of the one model call that read the site and
 *                 understood the business, its niche and its audiences, next to the
 *                 seed keywords of the same call;
 *   stage B (b4)  the recommendation engine, over what the scan collected: the pages
 *                 b1 read (the content index when no site is connected), the keyword
 *                 ideas of the site and of the competitors a4 validated (b2, b3), the
 *                 seed keywords the merchant chose to track, and the project's data.
 * This tab only reads what they stored; it never asks for a topic itself.
 */
export function seedPlanFromRun(run: SeedRunLike | null | undefined): SeedPlan {
  if (!run) return NO_SEED_PLAN
  const summary = run.summary && typeof run.summary === 'object' ? run.summary : null
  const topics = texts(summary?.topics, MAX_SEED_TOPICS)
  const keywords = texts(summary?.seedKeywords, 20)
  const business = summary?.business && typeof summary.business === 'object' ? (summary.business as Record<string, unknown>) : null
  const competitors = Array.isArray(summary?.competitors)
    ? (summary!.competitors as unknown[]).filter((c) => !!c && typeof c === 'object' && (c as { validated?: unknown }).validated === true).length
    : 0
  const b1 = Array.isArray(run.steps) ? run.steps.find((s) => s && s.step === 'b1') : undefined
  const pages = (b1?.status === 'done' ? count(b1.itemCount) : null) ?? count(summary?.sitemapUrlCount)
  const basis: SeedBasis | null = summary
    ? {
        business: !!business && typeof business.description === 'string' && business.description.length > 0,
        niche: business && typeof business.niche === 'string' && business.niche.trim() ? business.niche.trim().slice(0, 80) : null,
        audiences: texts(summary.audiences, 20).length,
        keywords: keywords.length,
        competitors,
        pages,
      }
    : null
  const scannedAt = typeof summary?.scannedAt === 'string' ? summary.scannedAt : null
  const stalled = run.stalled === true
  const b4 = Array.isArray(run.steps) ? run.steps.find((s) => s && s.step === 'b4') : undefined

  let state: SeedPlanState
  if (b4?.status === 'done') state = 'ready'
  else if (b4?.status === 'failed' || b4?.status === 'skipped') state = 'failed'
  else if (run.status === 'failed') state = 'failed'
  // A finished stage B whose b4 row is missing produced no plan either.
  else if (run.stage === 'b' && (run.status === 'done' || run.status === 'partial')) state = 'failed'
  else state = 'building'

  const audiences = texts(summary?.audiences, 20)
  return { state, topics: state === 'ready' ? [] : topics, keywords, basis, scannedAt, stalled, audiences }
}

/**
 * The seed keyword a stage-A topic targets, when the topic spells it out: every word of
 * the keyword appears in the topic, and the longest such keyword wins. No keyword is
 * better than a guessed one, so a topic that names none gets none.
 */
export function keywordForTopic(topic: string, keywords: readonly string[]): string | null {
  const words = new Set(sameTopicKey(topic).split(' ').filter(Boolean))
  let best: string | null = null
  let bestLen = 0
  for (const k of keywords) {
    const parts = sameTopicKey(k).split(' ').filter(Boolean)
    if (parts.length === 0 || !parts.every((w) => words.has(w))) continue
    if (parts.length > bestLen) { best = k; bestLen = parts.length }
  }
  return best
}

// ── The rankings ────────────────────────────────────────────────────────────

/** Close enough to the top that one article can move it: below the first three, still in the first two pages. */
export const RANKING_IDEA_MIN = 4
export const RANKING_IDEA_MAX = 20
export const RANKING_IDEAS_SHOWN = 5

/** The rows the tab reads for it (tracking_targets and scan_results, through the owner's own session). */
export type RankingTargetRow = { id: string; keyword: string; is_active: boolean | null; engine_type: string | null }
export type RankingResultRow = { tracking_target_id: string; position: number | null; found: boolean | null; checked_at: string }

/**
 * The tracked keywords whose last Google check puts the site at 4 to 20, closest to
 * the top first, at most five. Only active Google search keywords (a Maps position
 * is not an article's to move), each by its newest check whatever order the rows
 * came in; a keyword not found, or with no check, is not one.
 */
export function rankingIdeas(targets: readonly RankingTargetRow[], results: readonly RankingResultRow[]): StrategyRanking[] {
  const active = new Map(targets.filter((t) => t.is_active !== false && (t.engine_type ?? 'google_search') === 'google_search' && t.keyword?.trim()).map((t) => [t.id, t.keyword.trim()]))
  const latest = new Map<string, RankingResultRow>()
  for (const r of [...results].sort((a, b) => byTime(b.checked_at, a.checked_at))) {
    if (active.has(r.tracking_target_id) && !latest.has(r.tracking_target_id)) latest.set(r.tracking_target_id, r)
  }
  const out: StrategyRanking[] = []
  for (const [id, r] of latest) {
    const p = r.position
    if (r.found === false || typeof p !== 'number' || !Number.isInteger(p) || p < RANKING_IDEA_MIN || p > RANKING_IDEA_MAX) continue
    out.push({ keyword: active.get(id)!, position: p, checkedAt: r.checked_at })
  }
  return out
    .sort((a, b) => a.position - b.position || (a.keyword < b.keyword ? -1 : a.keyword > b.keyword ? 1 : 0))
    .slice(0, RANKING_IDEAS_SHOWN)
}

// ── Months ──────────────────────────────────────────────────────────────────

/** 'YYYY-MM' of an ISO time in a time zone (the browser's when omitted); null when unreadable. */
export function monthKey(iso: string | null, timeZone?: string): string | null {
  if (!iso) return null
  const ms = Date.parse(iso)
  if (!Number.isFinite(ms)) return null
  const parts = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit' }).formatToParts(new Date(ms))
  const y = parts.find((p) => p.type === 'year')?.value
  const m = parts.find((p) => p.type === 'month')?.value
  return y && m ? `${y}-${m}` : null
}

/**
 * The dates the plan is built on: when it is projected to go live, when it is scheduled,
 * when it went live. The others (the day an idea or a topic was added, the day an
 * article was written with no slot, the day the scan ran or a ranking was checked) say
 * when something happened, not when it belongs in the plan.
 */
export const PLAN_DATE_KINDS: readonly StrategyDateKind[] = ['publishTarget', 'scheduled', 'published']

/** The month a card belongs to in the plan, or null: not scheduled (or its date is unreadable). */
export function planMonth(card: Pick<StrategyCard, 'date' | 'dateKind'>, timeZone?: string): string | null {
  return PLAN_DATE_KINDS.includes(card.dateKind) ? monthKey(card.date, timeZone) : null
}

export type MonthChip = { key: string; count: number }
export const ALL_MONTHS = 'all'

/**
 * The month chips, and THE CONTRACT the screen keeps: the number on a chip is exactly
 * the number of cards that chip shows.
 *
 *   all       every card.
 *   a month   the cards the plan puts in that month, and every card it does not
 *             schedule yet (ideas, topics waiting for a slot): those belong to no
 *             month, so no month hides them. Filtering an idea by the day it was added
 *             made a month show fewer ideas than "all" (the owner's 5 under "all",
 *             4 under September) and took the swap button with them.
 * A scheduled card is in exactly one month; months are listed oldest first, and only
 * those with at least one scheduled card.
 */
export function monthChips(cards: readonly StrategyCard[], timeZone?: string): MonthChip[] {
  const byMonth = new Map<string, number>()
  let unscheduled = 0
  for (const c of cards) {
    const k = planMonth(c, timeZone)
    if (k) byMonth.set(k, (byMonth.get(k) ?? 0) + 1)
    else unscheduled++
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, count]) => ({ key, count: count + unscheduled }))
  return [{ key: ALL_MONTHS, count: cards.length }, ...months]
}

export function cardsInMonth(cards: readonly StrategyCard[], month: string, timeZone?: string): StrategyCard[] {
  if (month === ALL_MONTHS) return [...cards]
  return cards.filter((c) => {
    const k = planMonth(c, timeZone)
    return k === null || k === month
  })
}

/** How many cards no month schedules (shown under every month). */
export function unscheduledCount(cards: readonly StrategyCard[], timeZone?: string): number {
  return cards.filter((c) => planMonth(c, timeZone) === null).length
}

/** The plan month by month: what is scheduled to go live and what already went live, oldest month first. */
export type MonthPlanRow = { key: string; published: number; scheduled: number }
export function monthPlan(cards: readonly StrategyCard[], timeZone?: string): MonthPlanRow[] {
  const by = new Map<string, MonthPlanRow>()
  for (const c of cards) {
    const k = planMonth(c, timeZone)
    if (!k) continue
    const row = by.get(k) ?? { key: k, published: 0, scheduled: 0 }
    if (c.column === 'published') row.published++
    else row.scheduled++
    by.set(k, row)
  }
  return [...by.values()].sort((a, b) => (a.key < b.key ? -1 : a.key > b.key ? 1 : 0))
}

// ── The board ───────────────────────────────────────────────────────────────

/** Case, spacing and punctuation do not make two topics different. */
export function sameTopicKey(s: string | null | undefined): string {
  return (s ?? '').toLowerCase().normalize('NFKC').replace(/[\p{P}\p{S}]+/gu, ' ').replace(/\s+/g, ' ').trim()
}

const byTime = (a: string | null, b: string | null) => (Date.parse(a ?? '') || 0) - (Date.parse(b ?? '') || 0)

function originOfTopic(source: string): StrategyOrigin {
  return source === 'manual' ? 'manual' : 'topic'
}

export function buildStrategyBoard(input: {
  data: StrategyData
  queue: readonly StrategyQueueItem[] | null
  seed: SeedPlan
  /** Tracked keywords close to the top (rankingIdeas); none when they could not be read. */
  ranking?: readonly StrategyRanking[]
}): StrategyBoard {
  const { data, seed } = input
  const queue = [...(input.queue ?? [])].sort((a, b) => a.position - b.position)
  const pending = queue.filter((q) => PENDING_QUEUE_STATUSES.includes(q.status))
  const pendingByTopic = new Map<string, StrategyQueueItem>()
  const pendingByArticle = new Map<string, StrategyQueueItem>()
  for (const q of pending) {
    if (q.topicId && !pendingByTopic.has(q.topicId)) pendingByTopic.set(q.topicId, q)
    if (q.articleId && !pendingByArticle.has(q.articleId)) pendingByArticle.set(q.articleId, q)
  }

  const topicById = new Map(data.topics.map((t) => [t.id, t]))
  const articleTopicIds = new Set(data.articles.map((a) => a.topicId).filter((x): x is string => !!x))
  const cards: StrategyCard[] = []

  // Articles: published, or written and waiting.
  for (const a of data.articles) {
    const topic = a.topicId ? topicById.get(a.topicId) : undefined
    const base = {
      key: `article:${a.id}`,
      title: a.title,
      keyword: topic?.primaryKeyword ?? null,
      origin: topic ? originOfTopic(topic.source) : ('manual' as StrategyOrigin),
      reason: topic?.reason ?? null,
      topicId: a.topicId,
      articleId: a.id,
    }
    if (a.status === 'published') {
      cards.push({ ...base, column: 'published', date: a.publishedAt ?? a.scheduledAt ?? a.createdAt, dateKind: 'published', queued: false })
      continue
    }
    const slot = pendingByArticle.get(a.id) ?? (a.topicId ? pendingByTopic.get(a.topicId) : undefined)
    if (a.scheduledAt) cards.push({ ...base, column: 'written', date: a.scheduledAt, dateKind: 'scheduled', queued: !!slot })
    else if (slot?.projectedPublishAt) cards.push({ ...base, column: 'written', date: slot.projectedPublishAt, dateKind: 'publishTarget', queued: true })
    else cards.push({ ...base, column: 'written', date: a.createdAt, dateKind: 'written', queued: !!slot })
  }

  // Topics without an article: planned.
  for (const t of data.topics) {
    if (t.status === 'rejected' || articleTopicIds.has(t.id)) continue
    const slot = pendingByTopic.get(t.id)
    cards.push({
      key: `topic:${t.id}`,
      column: 'planned',
      title: t.title,
      keyword: t.primaryKeyword,
      date: slot?.projectedPublishAt ?? t.createdAt,
      dateKind: slot?.projectedPublishAt ? 'publishTarget' : 'added',
      origin: originOfTopic(t.source),
      reason: t.reason,
      topicId: t.id,
      articleId: null,
      queued: !!slot,
    })
  }

  // Ideas: the engine's plan, then the scan's topics that nothing above already covers.
  const taken = new Set<string>()
  for (const c of cards) taken.add(sameTopicKey(c.title))
  const ideas = [...data.ideas].sort((a, b) => (b.score ?? -Infinity) - (a.score ?? -Infinity) || byTime(b.createdAt, a.createdAt))
  for (const i of ideas) {
    const k = sameTopicKey(i.title)
    if (taken.has(k)) continue
    taken.add(k)
    cards.push({
      key: `idea:${i.id}`, column: 'ideas', title: i.title, keyword: i.primaryKeyword,
      date: i.createdAt, dateKind: 'added', origin: 'plan', reason: i.reason,
      topicId: null, articleId: null, queued: false,
      ideaId: i.id, score: i.score, source: i.source ?? null,
    })
  }
  // The rankings: a keyword a card above already names (as its title or its keyword) is covered.
  const keywordsTaken = new Set(cards.map((c) => sameTopicKey(c.keyword)).filter(Boolean))
  for (const r of input.ranking ?? []) {
    const k = sameTopicKey(r.keyword)
    if (!k || taken.has(k) || keywordsTaken.has(k)) continue
    taken.add(k)
    cards.push({
      key: `ranking:${k}`, column: 'ideas', title: r.keyword, keyword: null,
      date: r.checkedAt, dateKind: 'checked', origin: 'ranking', reason: null,
      topicId: null, articleId: null, queued: false, position: r.position,
    })
  }
  if (seed.state !== 'ready' && seed.state !== 'none') {
    seed.topics.forEach((title, n) => {
      const k = sameTopicKey(title)
      if (!k || taken.has(k)) return
      taken.add(k)
      cards.push({
        key: `scan:${n}`, column: 'ideas', title, keyword: keywordForTopic(title, seed.keywords),
        date: seed.scannedAt, dateKind: 'scanned', origin: 'scan', reason: null,
        topicId: null, articleId: null, queued: false,
      })
    })
  }

  // The ideas keep their own order (score first); the other three columns are put in
  // the order of the date each card shows.
  const ordered = [
    ...byColumnDate(cards.filter((c) => c.column === 'planned')),
    ...byColumnDate(cards.filter((c) => c.column === 'written')),
    ...[...cards.filter((c) => c.column === 'published')].sort(newestFirst),
    ...cards.filter((c) => c.column === 'ideas'),
  ]

  const counts: Record<StrategyColumn, number> = { ideas: 0, planned: 0, written: 0, published: 0 }
  for (const c of ordered) counts[c.column]++

  return {
    cards: ordered,
    next: pickNextArticle({
      data, pending, topicById, articleTopicIds,
      ideaCards: ordered.filter((c) => c.column === 'ideas' && c.origin === 'plan'),
      scanIdeas: ordered.filter((c) => c.column === 'ideas' && c.origin === 'scan'),
    }),
    hasArticles: data.articles.length > 0,
    counts,
  }
}

/**
 * THE ORDER OF A COLUMN, which is the order of the dates its cards show.
 *
 * The cards used to arrive in whatever order the topics and articles were read
 * in, so "planned" put a topic added in July next to an article due tomorrow and
 * the dates ran up and down the column. The owner reported it on 5 October 2026,
 * on the projects of an admin account, which carry the most rows.
 *
 * "Planned" and "written" answer what happens next, so a card with a real publish
 * date comes first, soonest first. The rest have no date of their own but the day
 * they were added or written, so they follow, newest first. "Published" is a log,
 * newest first. A card whose date cannot be read goes last, which is the opposite
 * of where Date.parse of nothing would put it.
 */
const DATED_KINDS: readonly StrategyDateKind[] = ['publishTarget', 'scheduled']

function timeOf(iso: string | null | undefined): number | null {
  const t = Date.parse(iso ?? '')
  return Number.isFinite(t) ? t : null
}

function compareBy(a: StrategyCard, b: StrategyCard, direction: 1 | -1): number {
  const x = timeOf(a.date)
  const y = timeOf(b.date)
  if (x === null && y === null) return 0
  if (x === null) return 1
  if (y === null) return -1
  return x === y ? 0 : (x < y ? -1 : 1) * direction
}

export function soonestFirst(a: StrategyCard, b: StrategyCard): number { return compareBy(a, b, 1) }
export function newestFirst(a: StrategyCard, b: StrategyCard): number { return compareBy(a, b, -1) }

/** A date of its own first, soonest first; then the undated ones, newest first. */
export function byColumnDate(cards: StrategyCard[]): StrategyCard[] {
  const dated = cards.filter((c) => DATED_KINDS.includes(c.dateKind) && timeOf(c.date) !== null)
  const keys = new Set(dated.map((c) => c.key))
  const rest = cards.filter((c) => !keys.has(c.key))
  return [...dated.sort(soonestFirst), ...rest.sort(newestFirst)]
}

/**
 * The next article, in the order the product will actually write them:
 *   1. the first item still waiting in the publishing queue, on its projected slot;
 *   2. else the oldest topic that has no article yet (it waits for the queue);
 *   3. else the engine's best idea;
 *   4. else the first topic the scan found.
 */
function pickNextArticle(ctx: {
  data: StrategyData
  pending: StrategyQueueItem[]
  topicById: Map<string, StrategyTopic>
  articleTopicIds: Set<string>
  ideaCards: StrategyCard[]
  scanIdeas: StrategyCard[]
}): NextArticle | null {
  const { pending, topicById } = ctx
  const queueLength = pending.length
  const first = pending[0]
  if (first) {
    const topic = first.topicId ? topicById.get(first.topicId) : undefined
    return {
      kind: 'queued',
      title: topic?.title ?? first.topicTitle ?? '',
      keyword: topic?.primaryKeyword ?? null,
      date: first.projectedPublishAt,
      reason: topic?.reason ?? null,
      source: topic?.source ?? null,
      topicId: first.topicId,
      articleId: first.articleId,
      ideaId: null,
      queuePosition: 1,
      queueLength,
      cardKey: null,
    }
  }
  const waiting = ctx.data.topics
    .filter((t) => t.status !== 'rejected' && !ctx.articleTopicIds.has(t.id))
    .sort((a, b) => byTime(a.createdAt, b.createdAt))[0]
  if (waiting) {
    return {
      kind: 'topic', title: waiting.title, keyword: waiting.primaryKeyword, date: null,
      reason: waiting.reason, source: waiting.source, topicId: waiting.id, articleId: null,
      ideaId: null, queuePosition: null, queueLength, cardKey: null,
    }
  }
  const idea = ctx.ideaCards[0]
  if (idea) {
    return {
      kind: 'idea', title: idea.title, keyword: idea.keyword, date: null, reason: idea.reason,
      source: null, topicId: null, articleId: null, ideaId: idea.ideaId ?? null, queuePosition: null, queueLength,
      cardKey: idea.key,
    }
  }
  const scan = ctx.scanIdeas[0]
  if (scan) {
    return {
      kind: 'scan', title: scan.title, keyword: scan.keyword, date: null, reason: null,
      source: null, topicId: null, articleId: null, ideaId: null, queuePosition: null, queueLength,
      cardKey: scan.key,
    }
  }
  return null
}
