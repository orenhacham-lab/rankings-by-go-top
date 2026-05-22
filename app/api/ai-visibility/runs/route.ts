/**
 * AI Visibility — POST /api/ai-visibility/runs
 *
 * Phase 2-C minimal vertical slice.
 * Synchronous execution: one prompt × one engine via ScrapeLLM.
 * Persists ai_scan_runs, ai_scan_results, ai_citations using existing schema.
 *
 * Gated by ENABLE_AI_VISIBILITY=true. Returns 404 when disabled.
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runAIVisibilityScan } from '@/lib/ai-visibility'
import { isDomainMatch } from '@/lib/ai-visibility/matching/domain-normalize'
import { getUserEntitlement } from '@/lib/subscription'
import {
  buildQuotaError,
  countAIScansThisPeriodForProject,
  countAIScansTrialLifetime,
} from '@/lib/quota'

const SCRAPELLM_TIMEOUT_MS = 300_000

export async function POST(request: Request) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { projectId?: string; promptId?: string; engine?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId, promptId, engine } = body
  if (!projectId || !promptId || !engine) {
    return Response.json(
      { error: 'projectId, promptId, and engine are required' },
      { status: 400 }
    )
  }

  const admin = createAdminClient()

  // Verify user owns the project
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('id, user_id, target_domain, business_name, country, language')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }
  if ((project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Enforce AI-scan quota BEFORE creating ai_scan_runs or calling AI providers.
  // Trial: lifetime cap across all of the user's projects (3 AI scans total).
  // Paid:  per-project per-calendar-month cap.
  const entitlement = await getUserEntitlement(user.id, supabase)
  if (!entitlement.isAdmin) {
    const isTrial = entitlement.plan === 'trial'
    const limit = isTrial
      ? entitlement.limits.maxAIScansTotal
      : entitlement.limits.maxAIScansPerPeriodPerProject
    const used = isTrial
      ? await countAIScansTrialLifetime(user.id, admin)
      : await countAIScansThisPeriodForProject(projectId, admin)

    if (used + 1 > limit) {
      const payload = buildQuotaError(
        'QUOTA_AI_SCANS',
        entitlement.plan,
        entitlement.limits,
        limit
      )
      return Response.json(payload, { status: 403 })
    }
  }

  // Load prompt and verify it belongs to the same project
  const { data: prompt, error: promptError } = await admin
    .from('ai_prompts')
    .select('*')
    .eq('id', promptId)
    .eq('project_id', projectId)
    .single()

  if (promptError || !prompt) {
    return Response.json({ error: 'Prompt not found' }, { status: 404 })
  }

  // Create scan run row (status=running)
  const startedAt = new Date().toISOString()
  const { data: run, error: runError } = await admin
    .from('ai_scan_runs')
    .insert({
      project_id: projectId,
      user_id: user.id,
      provider: 'scrapellm',
      status: 'running',
      triggered_by: 'manual',
      total_prompts: 1,
      total_engines: 1,
      total_tasks: 1,
      completed_tasks: 0,
      failed_tasks: 0,
      total_credits_used: 0,
      started_at: startedAt,
    })
    .select()
    .single()

  if (runError || !run) {
    return Response.json(
      { error: `Failed to create scan run: ${runError?.message}` },
      { status: 500 }
    )
  }

  const targetDomain = prompt.target_domain || project.target_domain || null
  const targetBrand = prompt.target_brand_name || project.business_name || null
  const country = prompt.country || project.country || null

  // Execute ScrapeLLM synchronously (provider catches errors and returns error result)
  const scanResult = await runAIVisibilityScan({
    engine,
    prompt: prompt.prompt,
    country: country || undefined,
    targetDomain: targetDomain,
    targetBrandName: targetBrand,
    timeout: SCRAPELLM_TIMEOUT_MS,
  })

  const scannedAt = new Date().toISOString()

  if (scanResult.error) {
    // Persist error result
    const { data: errorResult } = await admin
      .from('ai_scan_results')
      .insert({
        run_id: run.id,
        project_id: projectId,
        prompt_id: promptId,
        engine,
        provider: 'scrapellm',
        mentioned: false,
        target_cited: false,
        citation_count: 0,
        source_count: 0,
        credits_used: 0,
        status: 'error',
        error_message: scanResult.error,
        scanned_at: scannedAt,
      })
      .select('id')
      .single()

    await admin
      .from('ai_scan_runs')
      .update({
        status: 'failed',
        completed_tasks: 0,
        failed_tasks: 1,
        completed_at: new Date().toISOString(),
        error_message: scanResult.error,
      })
      .eq('id', run.id)

    return Response.json({
      runId: run.id,
      status: 'failed',
      resultId: errorResult?.id ?? null,
      mentioned: false,
      targetCited: false,
      citationCount: 0,
      creditsUsed: 0,
      error: scanResult.error,
    })
  }

  // Persist successful scan result
  const creditsUsed = typeof scanResult.creditsUsed === 'number' ? scanResult.creditsUsed : 0
  const { data: resultRow, error: resultError } = await admin
    .from('ai_scan_results')
    .insert({
      run_id: run.id,
      project_id: projectId,
      prompt_id: promptId,
      engine,
      provider: 'scrapellm',
      mentioned: scanResult.mentionedInText,
      target_cited: scanResult.targetCitedInSources,
      mention_positions: scanResult.mentionedPositions ?? null,
      citation_count: scanResult.citationCount,
      source_count: scanResult.sourceCount,
      response_text: scanResult.responseText || null,
      response_summary: scanResult.responseSummary || null,
      raw_response: (scanResult.rawResponse as Record<string, unknown>) ?? null,
      credits_used: creditsUsed,
      status: 'success',
      scanned_at: scannedAt,
    })
    .select('id')
    .single()

  if (resultError || !resultRow) {
    await admin
      .from('ai_scan_runs')
      .update({
        status: 'failed',
        failed_tasks: 1,
        completed_at: new Date().toISOString(),
        error_message: `Failed to persist result: ${resultError?.message}`,
      })
      .eq('id', run.id)

    return Response.json(
      { error: `Failed to persist result: ${resultError?.message}` },
      { status: 500 }
    )
  }

  // Persist citations (best-effort batch insert)
  if (scanResult.citations.length > 0) {
    const citationRows = scanResult.citations.map((c) => ({
      result_id: resultRow.id,
      project_id: projectId,
      prompt_id: promptId,
      engine,
      provider: 'scrapellm' as const,
      url: c.url,
      domain: c.domain,
      title: c.title ?? null,
      snippet: c.snippet ?? null,
      citation_position: c.position ?? null,
      is_target_domain: targetDomain ? isDomainMatch(c.url, targetDomain) : false,
    }))

    const { error: citationsError } = await admin
      .from('ai_citations')
      .insert(citationRows)

    if (citationsError) {
      console.error('[AIVisibility] Failed to insert citations:', citationsError.message)
    }
  }

  // Mark run completed
  await admin
    .from('ai_scan_runs')
    .update({
      status: 'completed',
      completed_tasks: 1,
      failed_tasks: 0,
      total_credits_used: creditsUsed,
      completed_at: new Date().toISOString(),
    })
    .eq('id', run.id)

  return Response.json({
    runId: run.id,
    status: 'completed',
    resultId: resultRow.id,
    mentioned: scanResult.mentionedInText,
    targetCited: scanResult.targetCitedInSources,
    citationCount: scanResult.citationCount,
    creditsUsed,
  })
}

/**
 * GET /api/ai-visibility/runs?projectId=...&limit=20
 *
 * Returns scan run history for a project, including a joined summary
 * of the single result per run (engine, mentioned, target_cited,
 * citation_count, credits_used) and the prompt text.
 *
 * Gated by ENABLE_AI_VISIBILITY=true. Auth + project ownership required.
 */
export async function GET(request: Request) {
  if (process.env.ENABLE_AI_VISIBILITY !== 'true') {
    return Response.json({ error: 'Not found' }, { status: 404 })
  }

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const url = new URL(request.url)
  const projectId = url.searchParams.get('projectId')
  const limit = Math.max(1, Math.min(100, Number(url.searchParams.get('limit') || 20)))

  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 })
  }

  const admin = createAdminClient()

  // Verify ownership
  const { data: project } = await admin
    .from('projects')
    .select('id, user_id')
    .eq('id', projectId)
    .single()

  if (!project || (project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Fetch recent runs
  const { data: runs, error: runsError } = await admin
    .from('ai_scan_runs')
    .select('*')
    .eq('project_id', projectId)
    .order('created_at', { ascending: false })
    .limit(limit)

  if (runsError) {
    return Response.json({ error: `Failed to load runs: ${runsError.message}` }, { status: 500 })
  }

  const runIds = (runs ?? []).map((r) => r.id)
  let results: Array<Record<string, unknown>> = []
  if (runIds.length > 0) {
    const { data: resultRows } = await admin
      .from('ai_scan_results')
      .select('id, run_id, engine, prompt_id, mentioned, target_cited, citation_count, credits_used, status, error_message, scanned_at')
      .in('run_id', runIds)
    results = resultRows ?? []
  }

  // Build prompt text lookup
  const promptIds = Array.from(
    new Set(results.map((r) => r.prompt_id).filter((v): v is string => !!v))
  )
  let promptMap = new Map<string, string>()
  if (promptIds.length > 0) {
    const { data: promptRows } = await admin
      .from('ai_prompts')
      .select('id, prompt')
      .in('id', promptIds)
    for (const p of promptRows ?? []) {
      promptMap.set(p.id as string, p.prompt as string)
    }
  }

  const resultsByRun = new Map<string, (typeof results)[number][]>()
  for (const r of results) {
    if (!resultsByRun.has(r.run_id as string)) {
      resultsByRun.set(r.run_id as string, [])
    }
    resultsByRun.get(r.run_id as string)?.push(r)
  }

  return Response.json({
    runs: (runs ?? []).map((run) => {
      const runResults = resultsByRun.get(run.id) || []
      return {
        id: run.id,
        createdAt: run.created_at,
        startedAt: run.started_at,
        completedAt: run.completed_at,
        status: run.status,
        provider: run.provider,
        totalCreditsUsed: run.total_credits_used,
        errorMessage: run.error_message,
        results: runResults.map((r) => {
          const promptText = r.prompt_id ? promptMap.get(r.prompt_id as string) || null : null
          return {
            id: r.id,
            engine: r.engine,
            promptId: r.prompt_id ?? null,
            promptText,
            mentioned: r.mentioned,
            targetCited: r.target_cited,
            citationCount: r.citation_count,
            creditsUsed: r.credits_used,
            status: r.status,
            errorMessage: r.error_message,
            scannedAt: r.scanned_at,
          }
        }),
      }
    }),
  })
}
