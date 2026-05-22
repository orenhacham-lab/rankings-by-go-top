/**
 * /api/projects/[id]/ai-visibility/timeline-summary
 *
 * GET → compute "change since previous scan" deltas from existing scan results.
 *
 * Strategy:
 *   - Load all successful ai_scan_results for the project, ordered by scanned_at desc.
 *   - Group by (prompt_id, engine).
 *   - Per group: index 0 = current snapshot, index 1 = previous snapshot.
 *   - Aggregate metrics on each snapshot and compute deltas.
 *
 * No new AI calls. No DB writes. Read-only over existing data.
 *
 * Auth: API-level ownership check (project owner only).
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'

const ERR = {
  unauthorized: 'יש להתחבר מחדש לפני קריאת הנתונים.',
  notFound: 'הפרויקט לא נמצא.',
  forbidden: 'אין הרשאה לקרוא נתונים לפרויקט זה.',
  dbError: 'שגיאת בסיס נתונים. נסה שוב.',
} as const

interface SnapshotMetrics {
  visibilityScore: number
  mentionRate: number
  totalMentions: number
  successfulResults: number
  enginesWithMentions: number
  enginesCovered: number
  citedDomains: number
}

function emptyMetrics(): SnapshotMetrics {
  return {
    visibilityScore: 0,
    mentionRate: 0,
    totalMentions: 0,
    successfulResults: 0,
    enginesWithMentions: 0,
    enginesCovered: 0,
    citedDomains: 0,
  }
}

function aggregateSnapshot(results: Array<{ engine: string | null; mentioned: boolean | null; target_cited: boolean | null }>): SnapshotMetrics {
  const engineSet = new Set<string>()
  const engineMentions = new Map<string, boolean>()
  let totalMentions = 0
  let citedDomains = 0

  for (const r of results) {
    const engine = r.engine || 'unknown'
    engineSet.add(engine)
    if (r.mentioned) {
      totalMentions++
      engineMentions.set(engine, true)
    } else if (!engineMentions.has(engine)) {
      engineMentions.set(engine, false)
    }
    if (r.target_cited) citedDomains++
  }

  let enginesWithMentions = 0
  for (const v of engineMentions.values()) {
    if (v) enginesWithMentions++
  }

  const successfulResults = results.length
  const mentionRate = successfulResults > 0 ? Math.round((totalMentions / successfulResults) * 100) : 0

  return {
    visibilityScore: mentionRate,
    mentionRate,
    totalMentions,
    successfulResults,
    enginesWithMentions,
    enginesCovered: engineSet.size,
    citedDomains,
  }
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { id: projectId } = await params

  let supabase
  try {
    supabase = await createClient()
  } catch {
    return Response.json({ error: 'Missing Supabase configuration.' }, { status: 503 })
  }

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return Response.json({ error: ERR.unauthorized }, { status: 401 })
  }
  const user = userData.user

  let admin
  try {
    admin = createAdminClient()
  } catch {
    return Response.json({ error: 'Database configuration error.' }, { status: 503 })
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError || !project) {
    return Response.json({ error: ERR.notFound }, { status: 404 })
  }
  const ownerId = (project as { user_id?: string | null }).user_id
  if (ownerId && ownerId !== user.id) {
    return Response.json({ error: ERR.forbidden }, { status: 403 })
  }

  const { data: scanResults, error: resultsError } = await admin
    .from('ai_scan_results')
    .select('id, prompt_id, engine, mentioned, target_cited, status, scanned_at')
    .eq('project_id', projectId)
    .eq('status', 'success')
    .order('scanned_at', { ascending: false })

  if (resultsError) {
    if ((resultsError as { code?: string }).code === '42P01') {
      return Response.json({
        success: true,
        hasPrevious: false,
        current: null,
        previous: null,
        change: null,
        meta: { reason: 'table_missing' },
      })
    }
    return Response.json({ error: ERR.dbError }, { status: 500 })
  }

  const all = (scanResults as Array<{
    id: string
    prompt_id: string | null
    engine: string | null
    mentioned: boolean | null
    target_cited: boolean | null
    status: string | null
    scanned_at: string | null
  }>) || []

  if (all.length === 0) {
    return Response.json({
      success: true,
      hasPrevious: false,
      current: null,
      previous: null,
      change: null,
      meta: { reason: 'no_results' },
    })
  }

  // Group by (prompt_id, engine). Results are already ordered by scanned_at desc,
  // so per key: index 0 = latest (current), index 1 = previous.
  const grouped = new Map<string, typeof all>()
  for (const r of all) {
    const key = `${r.prompt_id || `__noprompt__${r.id}`}:${r.engine || 'unknown'}`
    if (!grouped.has(key)) grouped.set(key, [])
    grouped.get(key)!.push(r)
  }

  const currentList: typeof all = []
  const previousList: typeof all = []
  let currentLatestDate: string | null = null
  let previousLatestDate: string | null = null

  for (const group of grouped.values()) {
    if (group[0]) {
      currentList.push(group[0])
      const d = group[0].scanned_at
      if (d && (!currentLatestDate || d > currentLatestDate)) currentLatestDate = d
    }
    if (group[1]) {
      previousList.push(group[1])
      const d = group[1].scanned_at
      if (d && (!previousLatestDate || d > previousLatestDate)) previousLatestDate = d
    }
  }

  const current = aggregateSnapshot(currentList)

  if (previousList.length === 0) {
    return Response.json({
      success: true,
      hasPrevious: false,
      current,
      previous: null,
      change: null,
      meta: {
        reason: 'not_enough_history',
        currentResultsCount: currentList.length,
        previousResultsCount: 0,
        currentLatestDate,
        previousLatestDate: null,
        strategy: 'latest_and_previous_per_prompt_engine',
      },
    })
  }

  const previous = aggregateSnapshot(previousList)

  const change = {
    visibilityScore: current.visibilityScore - previous.visibilityScore,
    mentionRate: current.mentionRate - previous.mentionRate,
    totalMentions: current.totalMentions - previous.totalMentions,
    enginesWithMentions: current.enginesWithMentions - previous.enginesWithMentions,
    citedDomains: current.citedDomains - previous.citedDomains,
  }

  return Response.json({
    success: true,
    hasPrevious: true,
    current,
    previous,
    change,
    meta: {
      currentResultsCount: currentList.length,
      previousResultsCount: previousList.length,
      currentLatestDate,
      previousLatestDate,
      strategy: 'latest_and_previous_per_prompt_engine',
    },
  })
}
