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
 *              the scan's step b4 runs), and, until b4 is ready, the topics the scan's
 *              stage A found (its summary), marked as coming from the scan
 *   planned    article_topics that have no article yet, dated by the queue when queued
 *   written    generated_articles that are not published yet
 *   published  generated_articles that are published
 *
 * Every card carries exactly one date, and the kind of date it is, so every card
 * belongs to exactly one month and the month chips always add up to "all".
 */

export type StrategyColumn = 'ideas' | 'planned' | 'written' | 'published'
export const STRATEGY_COLUMNS: readonly StrategyColumn[] = ['ideas', 'planned', 'written', 'published']

/** What the date on a card means. The screen names each kind; it never guesses. */
export type StrategyDateKind = 'added' | 'publishTarget' | 'scheduled' | 'written' | 'published' | 'scanned'

/** Where a card's topic came from, shown as a small label on the card. */
export type StrategyOrigin = 'scan' | 'plan' | 'manual' | 'topic'

/** A pending idea, as GET /api/content/strategy returns it. */
export type StrategyIdea = {
  id: string
  title: string
  primaryKeyword: string | null
  reason: string | null
  score: number | null
  createdAt: string
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

  return { state, topics: state === 'ready' ? [] : topics, keywords, basis, scannedAt, stalled }
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

export type MonthChip = { key: string; count: number }
export const ALL_MONTHS = 'all'

/** "All", then every month that has a card, oldest first, each with its count. Undated cards count only in "all". */
export function monthChips(cards: readonly StrategyCard[], timeZone?: string): MonthChip[] {
  const byMonth = new Map<string, number>()
  for (const c of cards) {
    const k = monthKey(c.date, timeZone)
    if (k) byMonth.set(k, (byMonth.get(k) ?? 0) + 1)
  }
  const months = [...byMonth.entries()].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)).map(([key, count]) => ({ key, count }))
  return [{ key: ALL_MONTHS, count: cards.length }, ...months]
}

export function cardsInMonth(cards: readonly StrategyCard[], month: string, timeZone?: string): StrategyCard[] {
  if (month === ALL_MONTHS) return [...cards]
  return cards.filter((c) => monthKey(c.date, timeZone) === month)
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
    })
  }
  const scanIdeas: StrategyCard[] = []
  if (seed.state !== 'ready' && seed.state !== 'none') {
    seed.topics.forEach((title, n) => {
      const k = sameTopicKey(title)
      if (!k || taken.has(k)) return
      taken.add(k)
      const card: StrategyCard = {
        key: `scan:${n}`, column: 'ideas', title, keyword: keywordForTopic(title, seed.keywords),
        date: seed.scannedAt, dateKind: 'scanned', origin: 'scan', reason: null,
        topicId: null, articleId: null, queued: false,
      }
      scanIdeas.push(card)
      cards.push(card)
    })
  }

  const counts: Record<StrategyColumn, number> = { ideas: 0, planned: 0, written: 0, published: 0 }
  for (const c of cards) counts[c.column]++

  return {
    cards,
    next: pickNextArticle({ data, pending, topicById, articleTopicIds, ideaCards: cards.filter((c) => c.origin === 'plan'), ideas, scanIdeas }),
    hasArticles: data.articles.length > 0,
    counts,
  }
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
  ideas: StrategyIdea[]
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
    }
  }
  const waiting = ctx.data.topics
    .filter((t) => t.status !== 'rejected' && !ctx.articleTopicIds.has(t.id))
    .sort((a, b) => byTime(a.createdAt, b.createdAt))[0]
  if (waiting) {
    return {
      kind: 'topic', title: waiting.title, keyword: waiting.primaryKeyword, date: null,
      reason: waiting.reason, source: waiting.source, topicId: waiting.id, articleId: null,
      ideaId: null, queuePosition: null, queueLength,
    }
  }
  const idea = ctx.ideaCards[0]
  if (idea) {
    const row = ctx.ideas.find((i) => `idea:${i.id}` === idea.key)
    return {
      kind: 'idea', title: idea.title, keyword: idea.keyword, date: null, reason: idea.reason,
      source: null, topicId: null, articleId: null, ideaId: row?.id ?? null, queuePosition: null, queueLength,
    }
  }
  const scan = ctx.scanIdeas[0]
  if (scan) {
    return {
      kind: 'scan', title: scan.title, keyword: scan.keyword, date: null, reason: null,
      source: null, topicId: null, articleId: null, ideaId: null, queuePosition: null, queueLength,
    }
  }
  return null
}
