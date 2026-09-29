/**
 * THE MONTHLY TOPIC TOP-UP: topics never run out.
 *
 * WHY. Topics were created only when the merchant asked: approving ideas, "add a
 * keyword", the brief form. Nothing refilled them. A pool publishing twice a week
 * drains its queue in weeks, and then publishes nothing (the runner's
 * "due_but_no_queued_items"). In Production on 29 Sep 2026, www.matalon.co.il's
 * active pool had 0 queued topics and 4dogsoriginal.co.il 2, while 143 and 117 ideas
 * sat pending in their plans; 10 of 21 automated projects had no new topic in 60 days.
 *
 * WHAT. Once a day, in the automation cron's window, every ACTIVE project of an
 * ENTITLED owner gets enough unused topics for its next month:
 *   target   a project with an active pool: what the pool publishes in 30 days,
 *            never more than the plan's articles a month; without a pool: its share
 *            of the plan's articles a month. At most PER_PROJECT_TARGET_CAP.
 *   supply   an active pool: its items still waiting (queued / scheduled /
 *            generated); without a pool: approved and suggested topics.
 *   refill   first from the ideas ALREADY in its plan (pending content_topic_ideas,
 *            best score first: free, no model); only when those run out, one batch of
 *            the SAME engine the strategy tab uses (generateFromBriefs → the same
 *            finalization guards), for ONE project per run, whose leftovers stay in
 *            the plan as ideas for the next months.
 *   guard    every candidate passes the cannibalization check (lib/content/
 *            cannibalization): a subject already on the site, ranking in Search
 *            Console, or planned, is SKIPPED (an automatic path never warns).
 *   mark     the idea it came from is marked approved with source_context
 *            'auto_topup', which is how the strategy tab shows "new topics we
 *            prepared for you this month".
 *   queue    a new topic joins the project's ACTIVE pool, as the merchant's own
 *            approved topics do; the pool's own schedule publishes it. Without an
 *            active pool the topic is only planned: nothing is generated.
 *
 * WHAT IT NEVER DOES. It generates no article, publishes nothing, reserves or
 * consumes no article quota, and never changes a plan, a quota, billing, a pool's
 * settings or the merchant's own topics. It reads the entitlement with the existing
 * checks (getUserEntitlement, and assertContentGenerationAllowedForUser before a
 * model call) and changes neither. Trial and unpaid owners are skipped.
 *
 * BOUNDED AND IDEMPOTENT.
 *   - Production only (VERCEL_ENV), in the UTC hours WINDOW_HOURS_UTC; outside,
 *     it returns at once without reading anything. CONTENT_TOPUP_DISABLED=1 stops it.
 *   - A project with enough supply is skipped after one count.
 *   - At most MAX_PROJECTS_PER_RUN projects a run, projects with an active pool
 *     first; with more, each quarter hour starts further along the list.
 *   - An idea becomes a topic only through a conditional claim (pending → approved),
 *     so two overlapping runs never make one idea twice; the supply is counted again
 *     before every claim, so they do not overshoot the target either.
 *   - The model: never in the window's first quarter hour (when the Vercel cron and
 *     cron-job.org fire together), one project per run, rotating by the quarter hour
 *     so a project that yields nothing cannot starve the others, and only with
 *     MIN_MS_FOR_MODEL left before the cron's deadline.
 *   - One log line, only when it did something.
 */
import { randomUUID } from 'crypto'
import type { createAdminClient, ServiceRoleClient } from '@/lib/supabase/admin'
import { getUserEntitlement } from '@/lib/subscription'
import { assertContentGenerationAllowedForUser } from '@/lib/content/entitlement-guard'
import { resolveIntervalDays, type Cadence } from '@/lib/content/automation/schedule'
import { encodeBriefSections } from '@/lib/content/brief-notes'
import { insertPendingIdeas } from '@/lib/content/recommendations/topic-idea-store'
import { buildKeywordGuard } from '@/lib/content/recommendations/keyword-guard'
import { finalizeRecommendationAttempt } from '@/lib/content/recommendations/finalize-attempt'
import { generateFromBriefs } from '@/lib/content/recommendations/generate-from-briefs'
import { newRunCostController } from '@/lib/content/recommendations/run-cost-controller'
import type { TopicSuggestion } from '@/lib/content/recommendations/types'
import { isGscReadOnlyEnabled } from '@/lib/gsc/config'
import { loadOverlapIndex } from '@/lib/content/cannibalization/load'
import { checkOverlap, skipOverlapping, SITE_AND_PLAN_KINDS, type OverlapIndex, type OverlapKind } from '@/lib/content/cannibalization/check'
import { mainPhrase, subjectWords } from '@/lib/content/cannibalization/normalize'
import { TOPUP_SOURCE_CONTEXT } from './topup-provenance'

type Admin = ReturnType<typeof createAdminClient>

export { TOPUP_SOURCE_CONTEXT }
export const WINDOW_HOURS_UTC: readonly number[] = [7, 8]
export const SLOT_MINUTES = 15
export const PER_PROJECT_TARGET_CAP = 12
export const PER_RUN_ADD_CAP = 12
export const MAX_PROJECTS_PER_RUN = 60
/** The active projects listed per run (ids and owners only). */
export const MAX_PROJECT_ROWS = 2000
export const MODEL_PROJECTS_PER_RUN = 1
export const MODEL_TARGET_COUNT = 12
export const MIN_MS_FOR_MODEL = 150_000
export const MIN_MS_FOR_PROJECT = 15_000
/** Pool items that will still publish. */
export const WAITING_ITEM_STATUSES: readonly string[] = ['queued', 'scheduled', 'generated']
/** Topics not written yet. */
export const UNUSED_TOPIC_STATUSES: readonly string[] = ['approved', 'suggested']
/** The idea sources article_topics accepts as they are; any other is 'project_data'. */
const TOPIC_SOURCES = new Set(['keyword', 'project_data', 'keyword_research_url'])
/** What the top-up skips: the site and the planned topics, and, for new model ideas, the plan's other ideas. */
const SKIP_KINDS: readonly OverlapKind[] = SITE_AND_PLAN_KINDS
const SKIP_KINDS_NEW: readonly OverlapKind[] = [...SITE_AND_PLAN_KINDS, 'idea']

export interface PoolLite { id: string; cadence: string | null; interval_days: number | null; publish_days: number[] | null }

/** Articles a pool publishes in 30 days. */
export function poolMonthlyRate(pool: PoolLite): number {
  const days = Array.isArray(pool.publish_days) ? pool.publish_days.filter((d) => Number.isInteger(d)) : []
  if (days.length > 0) return Math.ceil((days.length * 30) / 7)
  return Math.ceil(30 / resolveIntervalDays((pool.cadence ?? 'weekly') as Cadence, pool.interval_days))
}

/**
 * How many unused topics cover the project's next month. The plan's articles a month
 * are account-wide: a project with a pool needs what the pool publishes (the plan caps
 * it anyway); a project without one gets its share of the plan.
 */
export function topUpTarget(input: { monthlyArticles: number; ownerProjects: number; pool: PoolLite | null }): number {
  const monthly = Math.max(0, Math.floor(input.monthlyArticles))
  if (monthly === 0) return 0
  const raw = input.pool
    ? Math.min(poolMonthlyRate(input.pool), monthly)
    : Math.ceil(monthly / Math.max(1, input.ownerProjects))
  return Math.max(1, Math.min(PER_PROJECT_TARGET_CAP, raw))
}

/** The quarter hour of the window this run is in (0 = the window's first). -1 outside. */
export function windowSlot(nowMs: number): number {
  const d = new Date(nowMs)
  const idx = WINDOW_HOURS_UTC.indexOf(d.getUTCHours())
  if (idx < 0) return -1
  return idx * (60 / SLOT_MINUTES) + Math.floor(d.getUTCMinutes() / SLOT_MINUTES)
}

export interface GeneratedIdeas { suggestions: TopicSuggestion[]; modelUsed: string | null }

export interface TopUpDeps {
  now: () => number
  /** The existing entitlement, read only. Entitled = an admin or an active paid plan. */
  entitlement: (userId: string) => Promise<{ entitled: boolean; monthlyArticles: number }>
  /** The existing AI-generation gate, asked before any model call. */
  modelAllowed: (userId: string) => Promise<boolean>
  loadIndex: (scope: { projectId: string; userId: string }) => Promise<OverlapIndex>
  /** One batch of the strategy engine, finalized by its own guards. */
  generate: (scope: { projectId: string; userId: string }) => Promise<GeneratedIdeas>
}

export interface TopUpSummary {
  state: 'disabled' | 'not_production' | 'outside_window' | 'ran' | 'failed'
  projectsChecked: number
  notEntitled: number
  enough: number
  promoted: number
  queued: number
  skippedOverlap: number
  modelProjects: number
  modelIdeas: number
  failures: number
}

const EMPTY = (state: TopUpSummary['state']): TopUpSummary =>
  ({ state, projectsChecked: 0, notEntitled: 0, enough: 0, promoted: 0, queued: 0, skippedOverlap: 0, modelProjects: 0, modelIdeas: 0, failures: 0 })

function defaultDeps(admin: Admin): TopUpDeps {
  return {
    now: () => Date.now(),
    entitlement: async (userId) => {
      const e = await getUserEntitlement(userId, admin as ServiceRoleClient)
      return { entitled: e.isAdmin || e.hasActiveSubscription, monthlyArticles: e.limits.maxArticlesPerPeriodAccountWide }
    },
    modelAllowed: async (userId) => (await assertContentGenerationAllowedForUser(admin, userId)).allowed,
    loadIndex: (scope) => loadOverlapIndex(admin, scope, { gsc: isGscReadOnlyEnabled() }),
    generate: async (scope) => {
      const controller = newRunCostController('standard', randomUUID(), MODEL_TARGET_COUNT)
      const run = await generateFromBriefs(admin, { projectId: scope.projectId, targetCount: MODEL_TARGET_COUNT, qualityMode: 'standard', userId: scope.userId }, controller)
      const guard = await buildKeywordGuard(admin, scope.projectId)
      const existingPages = Array.from(guard.entityOwners).map((n) => ({ name: n, pageType: 'unknown' as const }))
      const finalized = finalizeRecommendationAttempt({ guard, existingPages }, run.suggestions)
      // An article queue takes articles only (the approve-and-queue route's rule).
      const articles = finalized.finalSuggestions.filter((s) => !s.recommendedPageType || s.recommendedPageType === 'article')
      return { suggestions: articles, modelUsed: run.diagnostics.modelPath?.model ?? null }
    },
  }
}

interface ProjectRow { id: string; user_id: string; language: string | null }
interface PoolRow extends PoolLite { project_id: string; user_id: string }
interface IdeaRow {
  id: string; title: string; primary_keyword: string | null; secondary_keywords: unknown; search_intent: string | null
  angle: string | null; recommended_word_count: number | null; suggestion_reason: string | null; score: number | null
  source: string | null; link_plan: unknown
}

type Scope = { projectId: string; userId: string }

async function countSupply(admin: Admin, scope: Scope, pool: PoolRow | null): Promise<number> {
  if (pool) {
    const { count, error } = await admin.from('article_pool_items').select('id', { count: 'exact', head: true })
      .eq('pool_id', pool.id).eq('project_id', scope.projectId).eq('user_id', scope.userId).in('status', [...WAITING_ITEM_STATUSES])
    if (error) throw new Error('supply_read_failed')
    return count ?? 0
  }
  const { count, error } = await admin.from('article_topics').select('id', { count: 'exact', head: true })
    .eq('project_id', scope.projectId).eq('user_id', scope.userId).in('status', [...UNUSED_TOPIC_STATUSES])
  if (error) throw new Error('supply_read_failed')
  return count ?? 0
}

async function loadPendingIdeas(admin: Admin, scope: Scope): Promise<IdeaRow[]> {
  const { data, error } = await admin.from('content_topic_ideas')
    .select('id, title, primary_keyword, secondary_keywords, search_intent, angle, recommended_word_count, suggestion_reason, score, source, link_plan')
    .eq('project_id', scope.projectId).eq('user_id', scope.userId).eq('status', 'pending')
    .order('score', { ascending: false }).order('created_at', { ascending: false }).limit(80)
  if (error) return []
  return (data ?? []) as IdeaRow[]
}

const isArticleIdea = (r: IdeaRow) => {
  const pt = r.link_plan && typeof r.link_plan === 'object' ? (r.link_plan as { recommendedPageType?: unknown }).recommendedPageType : undefined
  return typeof pt !== 'string' || pt === 'article'
}

/** Claim one pending idea and turn it into an approved topic (queued when the pool is active). */
async function promoteIdea(admin: Admin, scope: Scope, project: ProjectRow, pool: PoolRow | null, idea: IdeaRow, position: { next: number }): Promise<'promoted' | 'queued' | 'lost' | 'failed'> {
  const nowIso = new Date().toISOString()
  const { data: claimed, error: claimErr } = await admin.from('content_topic_ideas')
    .update({ status: 'approved', approved_at: nowIso, source_context: TOPUP_SOURCE_CONTEXT, updated_at: nowIso })
    .eq('id', idea.id).eq('project_id', scope.projectId).eq('user_id', scope.userId).eq('status', 'pending')
    .select('id')
  if (claimErr) return 'failed'
  if (!Array.isArray(claimed) || claimed.length === 0) return 'lost'

  const secondary = Array.isArray(idea.secondary_keywords) ? (idea.secondary_keywords as unknown[]).map((s) => String(s).trim()).filter(Boolean).slice(0, 10) : []
  const angle = (idea.angle ?? '').trim()
  const { data: topic, error: topicErr } = await admin.from('article_topics').insert({
    user_id: scope.userId,
    project_id: scope.projectId,
    source: TOPIC_SOURCES.has(idea.source ?? '') ? idea.source : 'project_data',
    status: 'approved',
    topic: idea.title,
    primary_keyword: (idea.primary_keyword ?? '').trim() || idea.title,
    secondary_keywords: secondary,
    search_intent: idea.search_intent || null,
    target_audience: null,
    language: project.language,
    desired_word_count: typeof idea.recommended_word_count === 'number' && idea.recommended_word_count > 0 ? idea.recommended_word_count : null,
    brief_notes: angle ? encodeBriefSections({ articleAngle: angle, mustInclude: '', mustAvoid: '' }) : null,
    anchors_json: [],
    suggestion_reason: idea.suggestion_reason || null,
    suggestion_score: typeof idea.score === 'number' && Number.isFinite(idea.score) ? idea.score : null,
    updated_at: nowIso,
  }).select('id').single()
  const topicId = (topic as { id?: string } | null)?.id
  if (topicErr || !topicId) {
    // Give the idea back to the plan, exactly as it was.
    await admin.from('content_topic_ideas')
      .update({ status: 'pending', approved_at: null, source_context: null, updated_at: nowIso })
      .eq('id', idea.id).eq('project_id', scope.projectId).eq('user_id', scope.userId).eq('status', 'approved').is('approved_topic_id', null)
    return 'failed'
  }
  await admin.from('content_topic_ideas').update({ approved_topic_id: topicId, updated_at: nowIso })
    .eq('id', idea.id).eq('project_id', scope.projectId).eq('user_id', scope.userId)

  if (!pool) return 'promoted'
  position.next += 1
  const { error: queueErr } = await admin.from('article_pool_items').insert({
    user_id: scope.userId, project_id: scope.projectId, pool_id: pool.id, topic_id: topicId, article_id: null,
    position: position.next, status: 'queued', updated_at: nowIso,
  })
  return queueErr ? 'promoted' : 'queued'
}

/** Promote pending ideas until the supply meets the target. Returns how many are still missing. */
async function refillFromIdeas(
  admin: Admin, deps: TopUpDeps, scope: Scope, project: ProjectRow, pool: PoolRow | null, target: number,
  index: OverlapIndex, summary: TopUpSummary, opts: { deadlineAt: number; onlyIds?: Set<string> },
): Promise<number> {
  const ideas = (await loadPendingIdeas(admin, scope)).filter((r) => isArticleIdea(r) && (!opts.onlyIds || opts.onlyIds.has(r.id)))
  const position = { next: -1 }
  if (pool) {
    const { data } = await admin.from('article_pool_items').select('position').eq('pool_id', pool.id).eq('project_id', scope.projectId).eq('user_id', scope.userId)
      .order('position', { ascending: false }).limit(1)
    position.next = Number((data as { position?: number }[] | null)?.[0]?.position ?? -1)
  }
  // What this run already planned counts as planned for the next idea.
  const planned: OverlapIndex = { entries: [], counts: index.counts }
  let added = 0
  for (const idea of ideas) {
    if (added >= PER_RUN_ADD_CAP || deps.now() > opts.deadlineAt) break
    const supply = await countSupply(admin, scope, pool)
    if (supply >= target) return 0
    const candidate = { title: idea.title, keyword: idea.primary_keyword }
    if (checkOverlap(index, candidate, { kinds: SKIP_KINDS, excludeIdeaIds: [idea.id] }) || checkOverlap(planned, candidate)) { summary.skippedOverlap++; continue }
    const outcome = await promoteIdea(admin, scope, project, pool, idea, position)
    if (outcome === 'failed') { summary.failures++; continue }
    if (outcome === 'lost') continue
    added++
    summary.promoted++
    if (outcome === 'queued') summary.queued++
    for (const phrase of [idea.primary_keyword ?? '', mainPhrase(idea.title)]) {
      const words = subjectWords(phrase)
      if (words.length) planned.entries.push({ kind: 'topic', label: idea.title, url: null, articleId: null, topicId: null, ideaId: idea.id, words } as OverlapIndex['entries'][number])
    }
  }
  return Math.max(0, target - (await countSupply(admin, scope, pool)))
}

export async function runTopicTopUp(
  admin: Admin,
  options: { env: Record<string, string | undefined>; deadlineAt: number; deps?: Partial<TopUpDeps> },
): Promise<TopUpSummary> {
  if (options.env.CONTENT_TOPUP_DISABLED === '1') return EMPTY('disabled')
  if (options.env.VERCEL_ENV !== 'production') return EMPTY('not_production')
  const deps: TopUpDeps = { ...defaultDeps(admin), ...options.deps }
  const slot = windowSlot(deps.now())
  if (slot < 0) return EMPTY('outside_window')

  const summary = EMPTY('ran')
  // The keys of the active projects and pools: the only owner-less reads, ids only.
  const { data: projectRows, error: projErr } = await admin.from('projects').select('id, user_id, language, is_active')
    .eq('is_active', true).order('created_at', { ascending: true }).limit(MAX_PROJECT_ROWS)
  if (projErr) return { ...summary, state: 'failed' }
  const projects = ((projectRows ?? []) as (ProjectRow & { is_active?: boolean | null })[]).filter((p) => p.id && p.user_id)
  const { data: poolRows } = await admin.from('article_pools').select('id, project_id, user_id, cadence, interval_days, publish_days').eq('is_active', true)
  const poolByProject = new Map<string, PoolRow>()
  for (const p of (poolRows ?? []) as PoolRow[]) if (!poolByProject.has(p.project_id)) poolByProject.set(p.project_id, p)

  const ownerProjects = new Map<string, number>()
  for (const p of projects) ownerProjects.set(p.user_id, (ownerProjects.get(p.user_id) ?? 0) + 1)
  const entitlement = new Map<string, { entitled: boolean; monthlyArticles: number }>()
  const stillShort: { project: ProjectRow; pool: PoolRow | null; target: number; index: OverlapIndex }[] = []

  // Projects with an active pool first: an empty queue stops publishing.
  // More than a run's share: each quarter hour starts further along, so all are reached in the day.
  const ordered = [...projects].sort((a, b) => Number(poolByProject.has(b.id)) - Number(poolByProject.has(a.id)))
  const start = ordered.length > MAX_PROJECTS_PER_RUN ? (slot * MAX_PROJECTS_PER_RUN) % ordered.length : 0
  const share = [...ordered.slice(start), ...ordered.slice(0, start)].slice(0, MAX_PROJECTS_PER_RUN)
  for (const project of share) {
    if (deps.now() > options.deadlineAt - MIN_MS_FOR_PROJECT) break
    const scope = { projectId: project.id, userId: project.user_id }
    try {
      summary.projectsChecked++
      let ent = entitlement.get(project.user_id)
      if (!ent) { ent = await deps.entitlement(project.user_id).catch(() => ({ entitled: false, monthlyArticles: 0 })); entitlement.set(project.user_id, ent) }
      if (!ent.entitled) { summary.notEntitled++; continue }
      const pool = poolByProject.get(project.id) ?? null
      if (pool && pool.user_id !== project.user_id) continue // a pool must be its project owner's
      const target = topUpTarget({ monthlyArticles: ent.monthlyArticles, ownerProjects: ownerProjects.get(project.user_id) ?? 1, pool })
      if (target === 0 || (await countSupply(admin, scope, pool)) >= target) { summary.enough++; continue }
      const index = await deps.loadIndex(scope)
      const missing = await refillFromIdeas(admin, deps, scope, project, pool, target, index, summary, { deadlineAt: options.deadlineAt - MIN_MS_FOR_PROJECT })
      if (missing > 0) stillShort.push({ project, pool, target, index: await deps.loadIndex(scope) })
    } catch {
      summary.failures++
    }
  }

  // The model, for one project whose plan has run dry. Never in the first quarter hour.
  if (slot > 0 && stillShort.length > 0) {
    const pick = stillShort[slot % stillShort.length]
    const scope = { projectId: pick.project.id, userId: pick.project.user_id }
    const timeLeft = options.deadlineAt - deps.now()
    if (timeLeft >= MIN_MS_FOR_MODEL && summary.modelProjects < MODEL_PROJECTS_PER_RUN) {
      try {
        if (await deps.modelAllowed(scope.userId)) {
          summary.modelProjects++
          const generated = await deps.generate(scope)
          const fresh = skipOverlapping(pick.index, generated.suggestions, SKIP_KINDS_NEW)
          summary.skippedOverlap += generated.suggestions.length - fresh.length
          if (fresh.length > 0) {
            const persisted = await insertPendingIdeas(admin, { projectId: scope.projectId, userId: scope.userId, batchId: randomUUID(), source: 'hybrid', suggestions: fresh, requestedTier: 'standard', modelUsed: generated.modelUsed })
            summary.modelIdeas += persisted?.inserted ?? 0
            await refillFromIdeas(admin, deps, scope, pick.project, pick.pool, pick.target, pick.index, summary, { deadlineAt: options.deadlineAt })
          }
        }
      } catch {
        summary.failures++
      }
    }
  }

  if (summary.promoted > 0 || summary.modelProjects > 0 || summary.failures > 0) {
    const { projectsChecked, notEntitled, enough, promoted, queued, skippedOverlap, modelProjects, modelIdeas, failures } = summary
    console.log('[topic-topup] run', { slot, projectsChecked, notEntitled, enough, promoted, queued, skippedOverlap, modelProjects, modelIdeas, failures })
  }
  return summary
}

/**
 * The cron's way in: after the runner and the seed resume, never before or around
 * them, within what is left of the cron's maxDuration less a margin. It never throws
 * and never rejects: whatever the top-up does, the cron's own work is already done
 * and logged.
 */
export const TOPUP_MARGIN_MS = 10_000
export async function startIsolatedTopUp(
  task: (deadlineAt: number) => Promise<unknown>,
  window: { startedAtMs: number; maxDurationMs: number },
): Promise<void> {
  const deadlineAt = window.startedAtMs + window.maxDurationMs - TOPUP_MARGIN_MS
  if (Date.now() >= deadlineAt) return
  try {
    await task(deadlineAt)
  } catch (e) {
    console.error('[topic-topup] failed', { error: e instanceof Error ? e.name : 'unknown' })
  }
}
