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
    .select('id, user_id, business_name, target_domain, country, language')
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

  // Load latest completed scan run
  const { data: latestRun, error: runError } = await auth.admin
    .from('ai_scan_runs')
    .select('id, project_id, status, completed_at, total_engines')
    .eq('project_id', auth.projectId)
    .eq('status', 'completed')
    .order('completed_at', { ascending: false })
    .limit(1)
    .maybeSingle()

  if (runError) {
    if (runError.code === '42P01') {
      return Response.json({ success: true, project: null, competitors: [], meta: { emptyState: 'table_missing' } })
    }
    console.error('[competitor-analysis] scan run lookup error', { projectId, message: runError.message })
    return Response.json({ error: ERR.dbError }, { status: 500 })
  }

  if (!latestRun) {
    return Response.json({
      success: true,
      project: null,
      competitors: [],
      meta: { emptyState: 'no_completed_scan' },
    })
  }

  // Load active competitors
  const { data: competitors, error: competitorsError } = await auth.admin
    .from('ai_visibility_competitors')
    .select('id, user_id, project_id, name, domain, aliases, is_active, created_at, updated_at')
    .eq('project_id', auth.projectId)
    .eq('is_active', true)
    .order('created_at', { ascending: true })

  if (competitorsError) {
    console.error('[competitor-analysis] competitors lookup error', { projectId })
    return Response.json({ error: ERR.dbError }, { status: 500 })
  }

  const competitorsList = competitors as any[] || []

  if (competitorsList.length === 0) {
    return Response.json({
      success: true,
      project: null,
      competitors: [],
      meta: { emptyState: 'no_competitors', scanRunId: latestRun.id, scanCompletedAt: latestRun.completed_at, enginesCount: latestRun.total_engines || 0, resultsCount: 0 },
    })
  }

  // Load all scan results for this run
  const { data: scanResults, error: resultsError } = await auth.admin
    .from('ai_scan_results')
    .select('id, engine, response_text, source_count, citation_count, mentioned, target_cited')
    .eq('run_id', latestRun.id)
    .order('scanned_at', { ascending: true })

  if (resultsError) {
    console.error('[competitor-analysis] scan results lookup error', { projectId, runId: latestRun.id })
    return Response.json({ error: ERR.dbError }, { status: 500 })
  }

  const resultsList = (scanResults as any[]) || []
  const totalResults = resultsList.length

  if (totalResults === 0) {
    return Response.json({
      success: true,
      project: null,
      competitors: [],
      meta: { emptyState: 'no_results', scanRunId: latestRun.id, scanCompletedAt: latestRun.completed_at, enginesCount: latestRun.total_engines || 0, resultsCount: 0 },
    })
  }

  // Detect project/business mentions
  const projectName = (auth.project as any)?.business_name || null
  const projectDomain = (auth.project as any)?.target_domain || null

  let projectMentions = 0
  const projectByEngine: EngineStats = {}

  // Detect competitor mentions
  const competitorStats = competitorsList.map((comp: any) => {
    const compMentions: EngineStats = {}
    let totalMentions = 0

    for (const result of resultsList) {
      const responseText = result.response_text || ''
      const engine = result.engine || 'unknown'

      // Initialize engine stats
      if (!compMentions[engine]) {
        compMentions[engine] = { mentions: 0, total: 0, rate: 0 }
      }
      compMentions[engine].total += 1

      // Project mention detection
      if (!projectByEngine[engine]) {
        projectByEngine[engine] = { mentions: 0, total: 0, rate: 0 }
      }
      projectByEngine[engine].total += 1

      // Detect project mention if project name or domain exists
      let projectMentioned = false
      if (projectName || projectDomain) {
        const detectionResult = detectBrandNameMention(responseText, projectName, projectDomain)
        if (detectionResult.mentioned) {
          projectMentioned = true
          projectByEngine[engine].mentions += 1
          projectMentions += 1
        }
      }

      // Detect competitor mentions (name, aliases, domain)
      let competitorMentioned = false
      const matchedAliases: string[] = []

      if (comp.name) {
        const nameResult = detectBrandNameMention(responseText, comp.name)
        if (nameResult.mentioned) {
          competitorMentioned = true
          matchedAliases.push(...nameResult.matchedVariants)
        }
      }

      // Check aliases
      if (comp.aliases && Array.isArray(comp.aliases)) {
        for (const alias of comp.aliases) {
          const aliasResult = detectBrandNameMention(responseText, alias)
          if (aliasResult.mentioned) {
            competitorMentioned = true
            matchedAliases.push(...aliasResult.matchedVariants)
          }
        }
      }

      // Check domain
      if (comp.domain) {
        const normalizedCompDomain = normalizeDomain(comp.domain)
        const normalizedResponseDomain = responseText
          .toLowerCase()
          .includes(normalizedCompDomain.toLowerCase())

        if (normalizedResponseDomain) {
          competitorMentioned = true
          matchedAliases.push(normalizedCompDomain)
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
      byEngine: compMentions,
    }
  })

  // Calculate project rates
  for (const engine in projectByEngine) {
    const stats = projectByEngine[engine]
    stats.rate = stats.total > 0 ? Math.round((stats.mentions / stats.total) * 100) : 0
  }

  return Response.json({
    success: true,
    project: {
      name: projectName || 'Your business',
      mentionsCount: projectMentions,
      totalResults,
      mentionRate: totalResults > 0 ? Math.round((projectMentions / totalResults) * 100) : 0,
      byEngine: projectByEngine,
    },
    competitors: competitorStats,
    meta: {
      scanRunId: latestRun.id,
      scanCompletedAt: latestRun.completed_at,
      enginesCount: latestRun.total_engines || 0,
      resultsCount: totalResults,
    },
  })
}
