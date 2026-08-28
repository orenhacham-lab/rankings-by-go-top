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
import { getBrandVariants } from '@/lib/ai-visibility/matching/mention-detector'
import { computeDisplayMatches, buildDomainList } from '@/lib/ai-visibility/display-classification'
import { computeGeoInsights, classifyCitationType } from '@/lib/ai-visibility/geo-signals'
import {
  computeGeoOpportunityMapping,
  type OpportunityResultInput,
} from '@/lib/ai-visibility/geo-opportunity-mapping'
import {
  computeGeoCompetitorIntelligence,
  type CompetitorIntelligenceInput,
} from '@/lib/ai-visibility/geo-competitor-intelligence'
import {
  computeBusinessMentionIntelligence,
  type BusinessMentionInput,
} from '@/lib/ai-visibility/geo-business-mentions'
import { getUserEntitlement } from '@/lib/subscription'
import {
  buildQuotaError,
  countAIScansTrialLifetime,
} from '@/lib/quota'
import { resolveCurrentUsagePeriod } from '@/lib/billing/usage-period'
import { reserveUsage, finalizeUsageReservation, releaseUsageReservation } from '@/lib/billing/usage-reservations'

const SCRAPELLM_TIMEOUT_MS = 60_000 // 60s — within Vercel/Next.js limits, avoids user-perceived stuck state

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
    console.error('[AI Visibility Runs] Project lookup failed', {
      projectId,
      projectError: projectError?.message,
    })
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }
  if ((project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  // Enforce AI-check quota BEFORE creating ai_scan_runs or calling AI
  // providers. Trial: lifetime cap across all of the user's projects (3 AI
  // checks total, plain count — no concurrent-job race risk for a single
  // trial user). Paid: an ATOMIC reservation against the user's actual
  // billing-period boundary (never a plain count-then-proceed).
  const entitlement = await getUserEntitlement(user.id, supabase)
  let reservationId: string | null = null
  let reservationToken: string | null = null
  if (!entitlement.isAdmin) {
    const isTrial = entitlement.plan === 'trial'
    if (isTrial) {
      const used = await countAIScansTrialLifetime(user.id, admin)
      if (used + 1 > entitlement.limits.maxAIScansTotal) {
        const payload = buildQuotaError('QUOTA_AI_SCANS', entitlement.plan, entitlement.limits, entitlement.limits.maxAIScansTotal)
        return Response.json(payload, { status: 403 })
      }
    } else {
      const period = await resolveCurrentUsagePeriod(admin, user.id)
      if (!period) return Response.json({ error: 'Unable to resolve billing period' }, { status: 500 })
      const limit = entitlement.limits.maxAIScansPerPeriodPerProject
      const reservation = await reserveUsage(admin, {
        userId: user.id, projectId, usageType: 'ai_check', amount: 1,
        periodStart: period.start, periodEnd: period.end, limit,
        idempotencyKey: `manual:${projectId}:${promptId}:${engine}:${Date.now()}`,
      })
      if (reservation.outcome === 'quota_exceeded') {
        const payload = buildQuotaError('QUOTA_AI_SCANS', entitlement.plan, entitlement.limits, limit)
        return Response.json(payload, { status: 403 })
      }
      if (reservation.outcome !== 'reserved' && reservation.outcome !== 'already_reserved') {
        return Response.json({ error: 'Failed to reserve AI-check allowance' }, { status: 500 })
      }
      reservationId = reservation.reservationId
      reservationToken = reservation.reservationToken
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
    if (reservationId && reservationToken) await releaseUsageReservation(admin, { reservationId, userId: user.id, reservationToken, reason: 'prompt_not_found' })
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
    if (reservationId && reservationToken) await releaseUsageReservation(admin, { reservationId, userId: user.id, reservationToken, reason: 'run_create_failed' })
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

  // Phase 3 — the provider call has now actually been dispatched: this
  // check is consumed regardless of outcome (including a provider-side
  // error result — the check still ran).
  if (reservationId && reservationToken) {
    await finalizeUsageReservation(admin, { reservationId, userId: user.id, reservationToken, consumed: 1, relatedRef: run.id, reason: null })
  }

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

  // Verify ownership and load project fields needed for display classification.
  // target_domain + business_name drive the brand-variant list used to mirror
  // the client's findMatchedLabels on the server. Read-only; no DB writes.
  const { data: project } = await admin
    .from('projects')
    .select('id, user_id, target_domain, business_name, brand_aliases, domain_aliases')
    .eq('id', projectId)
    .single()

  if (!project || (project as { user_id?: string }).user_id !== user.id) {
    return Response.json({ error: 'Forbidden' }, { status: 403 })
  }

  const projectTargetDomain = (project as { target_domain?: string | null }).target_domain ?? null
  const projectBusinessName = (project as { business_name?: string | null }).business_name ?? null
  const projectBrandAliases = (project as { brand_aliases?: string[] | null }).brand_aliases ?? []
  const projectDomainAliases = (project as { domain_aliases?: string[] | null }).domain_aliases ?? []
  const brandVariants = getBrandVariants(
    projectBusinessName,
    projectTargetDomain,
    projectBrandAliases,
    projectDomainAliases
  )
  const projectDomainList = buildDomainList(projectTargetDomain, projectDomainAliases)

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
      .select('id, run_id, engine, prompt_id, mentioned, target_cited, citation_count, credits_used, status, error_message, scanned_at, response_text, excluded_from_score')
      .in('run_id', runIds)
    results = resultRows ?? []
  }

  // Fetch citations grouped by result_id so the server-side classifier can
  // detect target citations even when the DB target_cited flag was set false
  // at scan time. We only need minimal fields. URL is also pulled so the
  // GEO citation-type classifier can read the path.
  const resultIds = results.map((r) => r.id as string)
  const citationsByResult = new Map<
    string,
    Array<{ domain: string | null; url: string | null; is_target_domain: boolean | null }>
  >()
  if (resultIds.length > 0) {
    const { data: citationRows } = await admin
      .from('ai_citations')
      .select('result_id, domain, url, is_target_domain')
      .in('result_id', resultIds)
    for (const c of citationRows ?? []) {
      const rid = c.result_id as string
      const arr = citationsByResult.get(rid) ?? []
      arr.push({
        domain: (c.domain as string | null) ?? null,
        url: (c.url as string | null) ?? null,
        is_target_domain: (c.is_target_domain as boolean | null) ?? null,
      })
      citationsByResult.set(rid, arr)
    }
  }

  // Build prompt text lookup
  const promptIds = Array.from(
    new Set(results.map((r) => r.prompt_id).filter((v): v is string => !!v))
  )
  const promptMap = new Map<string, string>()
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

  // Build per-result enrichment once, then reuse for both the per-run
  // payload AND the project-level opportunity mapping aggregation.
  const opportunityInputs: OpportunityResultInput[] = []
  const competitorIntelligenceInputs: CompetitorIntelligenceInput[] = []
  const businessMentionInputs: BusinessMentionInput[] = []

  const responseRuns = (runs ?? []).map((run) => {
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
        const citationsForResult = citationsByResult.get(r.id as string) ?? null
        const display = computeDisplayMatches({
          responseText: (r.response_text as string | null) ?? null,
          brandVariants,
          targetDomain: projectTargetDomain,
          domainList: projectDomainList,
          mentioned: (r.mentioned as boolean | null) ?? false,
          cited: (r.target_cited as boolean | null) ?? false,
          citations: citationsForResult,
        })
        // GEO Insights — rule-based, read-only enrichment. Degrades to
        // empty arrays / false flags when responseText or citations are
        // unavailable. Never alters scan or DB state.
        const geoInsights = computeGeoInsights({
          prompt: promptText,
          responseText: (r.response_text as string | null) ?? null,
          citations: citationsForResult,
          targetDomain: projectTargetDomain,
        })

        // Collect aggregation input — only "success" status results, so
        // failed/error scans don't pollute the opportunity rates.
        if (r.status === 'success') {
          opportunityInputs.push({
            engine: r.engine as string,
            displayMentioned: display.displayMentioned,
            displayCited: display.displayCited,
            geoInsights,
          })

          // Competitor intelligence — track citations for all results
          // (successful and failed) to understand competitor landscape.
          competitorIntelligenceInputs.push({
            engine: r.engine as string,
            displayMentioned: display.displayMentioned,
            displayCited: display.displayCited,
            targetDomain: projectTargetDomain,
            citations: (citationsForResult ?? []).map((c) => ({
              domain: c.domain || '',
              citationType: classifyCitationType(c.url, c.domain, projectTargetDomain),
            })),
          })

          // Business mention intelligence — track which competitors were
          // mentioned in response text (vs. which sources were cited).
          businessMentionInputs.push({
            engine: r.engine as string,
            responseText: (r.response_text ?? null) as string | null,
            displayMentioned: display.displayMentioned,
            displayCited: display.displayCited,
          })
        }

        return {
          id: r.id,
          engine: r.engine,
          promptId: r.prompt_id ?? null,
          promptText,
          // Raw DB values — preserved as-is, never overwritten.
          mentioned: r.mentioned,
          targetCited: r.target_cited,
          citationCount: r.citation_count,
          creditsUsed: r.credits_used,
          status: r.status,
          errorMessage: r.error_message,
          scannedAt: r.scanned_at,
          excludedFromScore: (r.excluded_from_score as boolean | null) === true,
          // Effective display values — what the UI should use for badges,
          // counts, and labels. Stable across refreshes.
          displayMentioned: display.displayMentioned,
          displayCited: display.displayCited,
          displayBrandLabels: display.displayBrandLabels,
          displayDomainLabel: display.displayDomainLabel,
          // Strict 4-signal model — mention in answer vs citation as source.
          mentionedInAnswer: display.mentionedInAnswer,
          citedAsSource: display.citedAsSource,
          domainMentioned: display.domainMentioned,
          brandMentioned: display.brandMentioned,
          domainInAnswerLabel: display.domainInAnswerLabel,
          domainInSourceLabel: display.domainInSourceLabel,
          geoInsights,
        }
      }),
    }
  })

  // Project-level GEO Opportunity Mapping — deterministic counts over all
  // successful scan results. Read-only; safe to return alongside runs.
  const geoOpportunityMapping = computeGeoOpportunityMapping(opportunityInputs)

  // Project-level GEO Competitor Intelligence — deterministic analysis of
  // competitor domains, categories, and visibility patterns.
  const geoCompetitorIntelligence = computeGeoCompetitorIntelligence(
    competitorIntelligenceInputs
  )

  // Load active competitors for business mention intelligence
  const { data: projectCompetitors } = await admin
    .from('ai_visibility_competitors')
    .select('name, aliases')
    .eq('project_id', projectId)
    .eq('is_active', true)

  // Business mention intelligence — detect which competitors were mentioned
  // in response text (vs. just being cited as sources).
  const businessMentionIntelligence = computeBusinessMentionIntelligence(
    businessMentionInputs,
    (projectCompetitors ?? []).map((c) => ({
      name: (c as any).name,
      aliases: (c as any).aliases,
    }))
  )

  return Response.json({
    runs: responseRuns,
    geoOpportunityMapping,
    geoCompetitorIntelligence,
    businessMentionIntelligence,
  })
}
