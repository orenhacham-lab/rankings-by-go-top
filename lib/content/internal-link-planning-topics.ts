/**
 * Shared, read-only topic resolver for internal-link planning dry-runs.
 *
 * Resolves the set of topics to plan for a project (queue / approved / all /
 * explicit ids) into TopicForPlanning[]. SELECT-only — never writes.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { TopicForPlanning } from '@/lib/content/internal-link-planner'

type Admin = ReturnType<typeof createAdminClient>

// Pool-item statuses that represent a topic queued/scheduled for automated work.
const PENDING_QUEUE_STATUSES = ['queued', 'scheduled', 'generating', 'generated', 'publishing']

export type PlanningScope = 'queue' | 'approved' | 'all'

interface TopicRow {
  id: string
  topic: string
  primary_keyword: string | null
  secondary_keywords: string[] | null
}

export async function resolveTopicsForPlanning(
  admin: Admin,
  projectId: string,
  opts: { scope: PlanningScope; topicIds: string[]; limit: number },
): Promise<{ topics: TopicForPlanning[]; resolvedScope: string }> {
  let topicIds = opts.topicIds
  if (topicIds.length === 0 && opts.scope === 'queue') {
    const { data: items } = await admin
      .from('article_pool_items')
      .select('topic_id, status')
      .eq('project_id', projectId)
      .in('status', PENDING_QUEUE_STATUSES)
    topicIds = Array.from(new Set(((items ?? []) as { topic_id: string | null }[]).map((i) => i.topic_id).filter((x): x is string => !!x)))
  }

  let query = admin
    .from('article_topics')
    .select('id, topic, primary_keyword, secondary_keywords')
    .eq('project_id', projectId)
    .limit(opts.limit)
  if (topicIds.length > 0) query = query.in('id', topicIds)
  else if (opts.scope === 'approved') query = query.eq('status', 'approved')

  const { data } = await query
  const topics = ((data ?? []) as TopicRow[]).map((t) => ({
    id: t.id,
    title: t.topic,
    primaryKeyword: t.primary_keyword,
    secondaryKeywords: Array.isArray(t.secondary_keywords) ? t.secondary_keywords : [],
  }))
  return { topics, resolvedScope: opts.topicIds.length > 0 ? 'explicit_ids' : opts.scope }
}
