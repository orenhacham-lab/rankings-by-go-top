/**
 * Content automation — GET /api/content/automation/internal-links/dry-run
 *
 * READ-ONLY internal-link planning DRY RUN (Phase 1). For the selected topics it
 * returns the links the planner WOULD choose (target, anchor, confidence, reason)
 * plus why other candidates were rejected. It writes NOTHING — no article_topics,
 * article_pool_items, generated_articles, brief_notes, anchors_json, or any other
 * field is modified. Purely a relevance-quality evaluation tool.
 *
 * Gated by ENABLE_INTERNAL_LINK_PLANNING (default off) + content automation +
 * project ownership. Query params:
 *   - projectId (required)
 *   - scope = 'queue' (default) | 'approved' | 'all'
 *   - topicIds = comma-separated topic ids (overrides scope when present)
 *   - limit = max topics to plan (default 25, max 100)
 */

import { authContentProject, isInternalLinkPlanningEnabled } from '@/lib/content/api-auth'
import { loadInternalLinkCandidates } from '@/lib/content/internal-link-candidates'
import {
  planInternalLinksForTopic,
  PLANNER_RELEVANCE_MIN,
  PLANNER_SELF_SIMILARITY_MAX,
  PLANNER_MIN_CONFIDENCE,
  PLANNER_MAX_LINKS,
  type TopicForPlanning,
} from '@/lib/content/internal-link-planner'

export const dynamic = 'force-dynamic'

// Pool-item statuses that represent a topic queued/scheduled for automated work.
const PENDING_QUEUE_STATUSES = ['queued', 'scheduled', 'generating', 'generated', 'publishing']

interface TopicRow {
  id: string
  topic: string
  primary_keyword: string | null
  secondary_keywords: string[] | null
  status: string
}

export async function GET(request: Request) {
  if (!isInternalLinkPlanningEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const scope = (url.searchParams.get('scope') || 'queue') as 'queue' | 'approved' | 'all'
  const topicIdsParam = (url.searchParams.get('topicIds') || '').split(',').map((s) => s.trim()).filter(Boolean)
  const limit = Math.min(Math.max(Number(url.searchParams.get('limit')) || 25, 1), 100)

  const auth = await authContentProject(projectId)
  if ('error' in auth) return Response.json({ error: auth.error }, { status: auth.status })
  const { admin, project } = auth

  // ── Resolve the set of topics to plan (READ-ONLY selects) ──
  let topicIds = topicIdsParam
  if (topicIds.length === 0 && scope === 'queue') {
    const { data: items } = await admin
      .from('article_pool_items')
      .select('topic_id, status')
      .eq('project_id', project.id)
      .in('status', PENDING_QUEUE_STATUSES)
    topicIds = Array.from(new Set(((items ?? []) as { topic_id: string | null }[]).map((i) => i.topic_id).filter((x): x is string => !!x)))
  }

  let query = admin
    .from('article_topics')
    .select('id, topic, primary_keyword, secondary_keywords, status')
    .eq('project_id', project.id)
    .limit(limit)
  if (topicIds.length > 0) {
    query = query.in('id', topicIds)
  } else if (scope === 'approved') {
    query = query.eq('status', 'approved')
  }
  // scope === 'all' (with no explicit ids) → any topic for the project (capped).

  const { data: topicData, error: topicError } = await query
  if (topicError) {
    console.error('[internal-link-dry-run] topic load failed', { message: topicError.message })
    return Response.json({ error: 'Failed to load topics' }, { status: 500 })
  }
  const topics = (topicData ?? []) as TopicRow[]

  // ── Load candidate targets ONCE (read-only), then plan each topic ──
  const { candidates, hosts } = await loadInternalLinkCandidates(admin, project.id)

  const plans = topics.map((t) => {
    const input: TopicForPlanning = {
      id: t.id,
      title: t.topic,
      primaryKeyword: t.primary_keyword,
      secondaryKeywords: Array.isArray(t.secondary_keywords) ? t.secondary_keywords : [],
    }
    return planInternalLinksForTopic(input, candidates, hosts)
  })

  const topicsWithLinks = plans.filter((p) => p.selected.length > 0).length

  return Response.json({
    dryRun: true,
    projectId: project.id,
    scope: topicIds.length > 0 ? 'explicit_ids' : scope,
    config: {
      relevanceMin: PLANNER_RELEVANCE_MIN,
      selfSimilarityMax: PLANNER_SELF_SIMILARITY_MAX,
      minConfidence: PLANNER_MIN_CONFIDENCE,
      maxLinksPerTopic: PLANNER_MAX_LINKS,
    },
    candidateCount: candidates.length,
    hosts,
    topicsPlanned: topics.length,
    topicsWithLinks,
    topics: plans,
  })
}
