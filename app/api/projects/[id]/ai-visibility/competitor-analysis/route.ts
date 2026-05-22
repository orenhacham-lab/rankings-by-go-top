/**
 * /api/projects/[id]/ai-visibility/competitor-analysis
 *
 * GET → analyze mentions of competitors in existing AI scan results
 *
 * This endpoint:
 * 1. Loads the latest completed scan run for the project
 * 2. Loads all active competitors from ai_visibility_competitors
 * 3. Scans the response_text of each result for mentions
 * 4. Aggregates mention counts by competitor and engine
 * 5. Returns structured analysis (no new API calls to AI services)
 *
 * Auth: API-level ownership check (project owner only).
 * Gated by ENABLE_AI_VISIBILITY=true.
 */

export const dynamic = 'force-dynamic'

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { NextRequest } from 'next/server'
import { detectBrandNameMention } from '@/lib/ai-visibility/matching/mention-detector'
import { normalizeDomain } from '@/lib/ai-visibility/matching/domain-normalize'

const ERR = {
  unauthorized: 'יש להתחבר מחדש לפני קריאת הנתונים.',
  notFound: 'הפרויקט לא נמצא. נסה לרענן את העמוד.',
  forbidden: 'אין הרשאה לקרוא נתונים לפרויקט זה.',
  columnMissing: 'טבלה חסרה במסד הנתונים.',
  dbError: 'שגיאת בסיס נתונים. נסה שוב.',
} as const

async function authAndProject(projectId: string | null | undefined) {
  if (!projectId || typeof projectId !== 'string') {
    return { error: ERR.notFound, status: 404 as const, stage: 'params' as const }
  }

  let supabase
  try {
    supabase = await createClient()
  } catch (e) {
    console.error('[competitor-analysis] supabase client creation error', { projectId })
    return { error: 'Missing Supabase configuration.', status: 503 as const, stage: 'supabase_config' as const }
  }

  const { data: userData, error: authError } = await supabase.auth.getUser()
  if (authError || !userData?.user) {
    return { error: ERR.unauthorized, status: 401 as const, stage: 'auth' as const }
  }
  const user = userData.user

  let admin
  try {
    admin = createAdminClient()
  } catch (e) {
    console.error('[competitor-analysis] admin client creation error', { projectId })
    return { error: 'Database configuration error.', status: 503 as const, stage: 'db_config' as const }
  }

  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id, name, business_name, target_domain, country, language')
    .eq('id', projectId)
    .maybeSingle()

  if (projectError) {
    console.error('[competitor-analysis] project lookup error', { projectId, message: projectError.message })
    return { error: ERR.notFound, status: 404 as const, stage: 'db_error' as const }
  }
  if (!project) {
    return { error: ERR.notFound, status: 404 as const, stage: 'project_not_found' as const }
  }

  const ownerId = (project as { user_id?: string | null }).user_id
  if (ownerId && ownerId !== user.id) {
    return { error: ERR.forbidden, status: 403 as const, stage: 'permission' as const }
  }

  return { user, admin, projectId, project }
}

interface CompetitorMentionStats {
  mentions: number
  total: number
  rate: number
}

interface EngineStats {
  [engine: string]: CompetitorMentionStats
}

export async function GET(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const { id: projectId } = await params
  const auth = await authAndProject(projectId)
  if ('error' in auth) {
    return Response.json({ error: auth.error }, { status: auth.status })
  }

  // Load active competitors first — if none, no point loading scan results
  const { data: competitors, error: competitorsError } = await auth.admin
    .from('ai_visibility_competitors')
    .select('id, user_id, project_id, name, domain, aliases, is_active, created_at, updated_at')
    .eq('project_id', auth.projectId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (competitorsError) {
    if ((competitorsError as any).code === '42P01') {
      return Response.json({ success: true, project: null, competitors: [], meta: { emptyState: 'table_missing' } })
    }
    console.error('[competitor-analysis] competitors lookup error', { projectId })
    return Response.json({ error: ERR.dbError }, { status: 500 })
  }

  const competitorsList = competitors as any[] || []

  if (competitorsList.length === 0) {
    return Response.json({
      success: true,
      project: null,
      competitors: [],
      meta: { emptyState: 'no_competitors', resultsCount: 0 },
    })
  }

  // Load ALL successful scan results for this project across ALL runs.
  // Each engine scan creates its own run, so the previous "latest run only"
  // approach saw just one engine. Match what the Results tab shows by
  // pulling every successful result for the project.
  const { data: scanResults, error: resultsError } = await auth.admin
    .from('ai_scan_results')
    .select('id, run_id, prompt_id, engine, response_text, source_count, citation_count, mentioned, target_cited, status, scanned_at')
    .eq('project_id', auth.projectId)
    .eq('status', 'success')
    .order('scanned_at', { ascending: false })

  if (resultsError) {
    if ((resultsError as any).code === '42P01') {
      return Response.json({ success: true, project: null, competitors: [], meta: { emptyState: 'table_missing' } })
    }
    console.error('[competitor-analysis] scan results lookup error', { projectId, message: resultsError.message })
    return Response.json({ error: ERR.dbError }, { status: 500 })
  }

  // Deduplicate by (prompt_id, engine) — keep only the latest result per pair.
  // If a prompt has no id (legacy), key by engine + result id so it's kept.
  const seenKeys = new Set<string>()
  const allResults = (scanResults as any[]) || []
  const resultsList: any[] = []
  for (const r of allResults) {
    const key = `${r.prompt_id || `__noprompt__${r.id}`}:${r.engine || 'unknown'}`
    if (seenKeys.has(key)) continue
    seenKeys.add(key)
    resultsList.push(r)
  }

  const totalResults = resultsList.length

  // Build debug meta: distinct engines, run ids, latest date per engine
  const enginesInRun = Array.from(new Set(resultsList.map((r: any) => r.engine).filter(Boolean)))
  const runIds = Array.from(new Set(resultsList.map((r: any) => r.run_id).filter(Boolean)))
  const latestResultDates: Record<string, string> = {}
  for (const r of resultsList) {
    const engine = r.engine || 'unknown'
    if (!latestResultDates[engine] || (r.scanned_at && r.scanned_at > latestResultDates[engine])) {
      latestResultDates[engine] = r.scanned_at || ''
    }
  }
  const latestScannedAt = resultsList.reduce<string | null>((acc, r) => {
    if (!r.scanned_at) return acc
    if (!acc || r.scanned_at > acc) return r.scanned_at
    return acc
  }, null)

  if (totalResults === 0) {
    return Response.json({
      success: true,
      project: null,
      competitors: [],
      meta: {
        emptyState: 'no_completed_scan',
        resultsSource: 'latest_per_engine',
        resultsCount: 0,
        enginesCount: 0,
        engines: [],
        runIds: [],
        latestResultDates: {},
      },
    })
  }

  // Detect project/business mentions. Prefer business_name (more accurate brand),
  // fallback to project.name for display.
  const projectBusinessName = (auth.project as any)?.business_name || null
  const projectFallbackName = (auth.project as any)?.name || null
  const projectName = projectBusinessName || projectFallbackName
  const projectDomain = (auth.project as any)?.target_domain || null

  // Detect project mentions ONCE across all results (not per-competitor)
  let projectMentions = 0
  const projectByEngine: EngineStats = {}

  for (const result of resultsList) {
    const responseText = result.response_text || ''
    const engine = result.engine || 'unknown'

    if (!projectByEngine[engine]) {
      projectByEngine[engine] = { mentions: 0, total: 0, rate: 0 }
    }
    projectByEngine[engine].total += 1

    if (projectName || projectDomain) {
      const detectionResult = detectBrandNameMention(responseText, projectName, projectDomain)
      if (detectionResult.mentioned) {
        projectByEngine[engine].mentions += 1
        projectMentions += 1
      }
    }
  }

  // Detect competitor mentions per competitor across all results
  const competitorStats = competitorsList.map((comp: any) => {
    const compMentions: EngineStats = {}
    let totalMentions = 0
    const matchedAliasesSet = new Set<string>()

    for (const result of resultsList) {
      const responseText = result.response_text || ''
      const engine = result.engine || 'unknown'

      if (!compMentions[engine]) {
        compMentions[engine] = { mentions: 0, total: 0, rate: 0 }
      }
      compMentions[engine].total += 1

      // Detect competitor mentions (name, aliases, domain)
      let competitorMentioned = false

      if (comp.name) {
        const nameResult = detectBrandNameMention(responseText, comp.name)
        if (nameResult.mentioned) {
          competitorMentioned = true
          for (const v of nameResult.matchedVariants) matchedAliasesSet.add(v)
        }
      }

      if (comp.aliases && Array.isArray(comp.aliases)) {
        for (const alias of comp.aliases) {
          const aliasResult = detectBrandNameMention(responseText, alias)
          if (aliasResult.mentioned) {
            competitorMentioned = true
            for (const v of aliasResult.matchedVariants) matchedAliasesSet.add(v)
          }
        }
      }

      if (comp.domain) {
        const normalizedCompDomain = normalizeDomain(comp.domain)
        if (normalizedCompDomain && responseText.toLowerCase().includes(normalizedCompDomain.toLowerCase())) {
          competitorMentioned = true
          matchedAliasesSet.add(normalizedCompDomain)
        }
      }

      if (competitorMentioned) {
        compMentions[engine].mentions += 1
        totalMentions += 1
      }
    }

    // Calculate rates
    for (const engine in compMentions) {
      const stats = compMentions[engine]
      stats.rate = stats.total > 0 ? Math.round((stats.mentions / stats.total) * 100) : 0
    }

    return {
      id: comp.id,
      name: comp.name,
      domain: comp.domain,
      aliases: comp.aliases || [],
      mentionsCount: totalMentions,
      totalResults,
      mentionRate: totalResults > 0 ? Math.round((totalMentions / totalResults) * 100) : 0,
      matchedAliases: Array.from(matchedAliasesSet),
      byEngine: compMentions,
    }
  })

  // Calculate project rates
  for (const engine in projectByEngine) {
    const stats = projectByEngine[engine]
    stats.rate = stats.total > 0 ? Math.round((stats.mentions / stats.total) * 100) : 0
  }

  // AI Share of Voice — relative share of total mentions across project +
  // all active competitors. Different from Visibility Rate (which is per
  // result), this is per mention across the whole entity set.
  const sovTotal =
    projectMentions + competitorStats.reduce((sum, c) => sum + c.mentionsCount, 0)
  const sovEntities: Array<{
    type: 'project' | 'competitor'
    competitorId?: string
    name: string
    mentionsCount: number
    sharePercent: number
  }> = [
    {
      type: 'project' as const,
      name: projectName || '',
      mentionsCount: projectMentions,
      sharePercent: sovTotal > 0 ? Math.round((projectMentions / sovTotal) * 100) : 0,
    },
    ...competitorStats.map((c) => ({
      type: 'competitor' as const,
      competitorId: c.id,
      name: c.name,
      mentionsCount: c.mentionsCount,
      sharePercent: sovTotal > 0 ? Math.round((c.mentionsCount / sovTotal) * 100) : 0,
    })),
  ].sort((a, b) => b.sharePercent - a.sharePercent || b.mentionsCount - a.mentionsCount)

  return Response.json({
    success: true,
    project: {
      name: projectName,
      mentionsCount: projectMentions,
      totalResults,
      mentionRate: totalResults > 0 ? Math.round((projectMentions / totalResults) * 100) : 0,
      byEngine: projectByEngine,
    },
    competitors: competitorStats,
    shareOfVoice: {
      totalMentions: sovTotal,
      entities: sovEntities,
    },
    meta: {
      resultsSource: 'latest_per_engine',
      scanCompletedAt: latestScannedAt,
      enginesCount: enginesInRun.length,
      resultsCount: totalResults,
      engines: enginesInRun,
      runIds,
      latestResultDates,
    },
  })
}
