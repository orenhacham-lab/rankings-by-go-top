import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scanner'
import { getUserEntitlement } from '@/lib/subscription'

export async function POST(request: Request) {
  // Auth check
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }

  let body: { projectId?: string; targetId?: string; triggeredBy?: string }
  try {
    body = await request.json()
  } catch {
    return Response.json({ error: 'Invalid JSON body' }, { status: 400 })
  }

  const { projectId, targetId, triggeredBy = 'manual' } = body

  if (!projectId) {
    return Response.json({ error: 'projectId is required' }, { status: 400 })
  }

  // Check entitlement and scan limits
  const entitlement = await getUserEntitlement(user.id, supabase)
  if (!entitlement.isAdmin) {
    if (entitlement.plan === 'trial') {
      // Trial users get 1 scan total for the project
      const { count: projectScanCount } = await supabase
        .from('scans')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)

      if ((projectScanCount ?? 0) >= 1) {
        return Response.json(
          { error: 'הגעת למגבלת סריקה אחת בתוכנית הניסיון' },
          { status: 403 }
        )
      }
    } else {
      // Paid users are limited by scans per project per period
      const { count: projectScansThisPeriod } = await supabase
        .from('scans')
        .select('id', { count: 'exact', head: true })
        .eq('project_id', projectId)
        .gte('created_at', new Date(new Date().getFullYear(), new Date().getMonth(), 1).toISOString())

      if ((projectScansThisPeriod ?? 0) >= entitlement.limits.maxScansPerPeriod) {
        return Response.json(
          { error: `הגעת למגבלת ${entitlement.limits.maxScansPerPeriod} סריקות בחודש לפרוייקט זה בתוכנית ${entitlement.limits.label}` },
          { status: 403 }
        )
      }
    }
  }

  const admin = createAdminClient()

  // Load project
  const { data: project, error: projectError } = await admin
    .from('projects')
    .select('*')
    .eq('id', projectId)
    .single()

  if (projectError || !project) {
    return Response.json({ error: 'Project not found' }, { status: 404 })
  }

  // Load targets to scan
  let targetsQuery = admin
    .from('tracking_targets')
    .select('*')
    .eq('project_id', projectId)
    .eq('is_active', true)

  if (targetId) {
    targetsQuery = targetsQuery.eq('id', targetId)
  }

  const { data: targets, error: targetsError } = await targetsQuery

  if (targetsError) {
    return Response.json({ error: `Failed to load targets: ${targetsError.message}` }, { status: 500 })
  }
  if (!targets || targets.length === 0) {
    return Response.json({ error: 'No active targets found' }, { status: 404 })
  }

  // Create scan record
  const { data: scan, error: scanError } = await admin
    .from('scans')
    .insert({
      user_id: user.id,
      project_id: projectId,
      status: 'running',
      triggered_by: triggeredBy,
      total_targets: targets.length,
      completed_targets: 0,
      failed_targets: 0,
      started_at: new Date().toISOString(),
    })
    .select()
    .single()

  if (scanError || !scan) {
    return Response.json({ error: `Failed to create scan record: ${scanError?.message}` }, { status: 500 })
  }

  let completedTargets = 0
  let failedTargets = 0
  const results = []

  for (const target of targets) {
    // Use .maybeSingle() — returns null (not an error) when no previous results exist
    const { data: prevResult } = await admin
      .from('scan_results')
      .select('position, found')
      .eq('tracking_target_id', target.id)
      .order('checked_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    // Use ?? null (not || null) to preserve position=0 if it ever occurred
    const previousPosition = prevResult?.position ?? null

    // Run the actual scan
    console.log('[Scan] Running scan for target:', {
      keyword: target.keyword,
      engine: target.engine_type,
      projectLocation: {
        city: project.city,
        country: project.country,
        language: project.language,
        deviceType: project.device_type,
      },
      businessName: target.target_business_name || project.business_name,
    })

    const locationMode = (target.location_mode || 'project') as 'project' | 'custom' | 'grid' | 'zip' | 'exact_point'

    // DEBUG: log what was actually loaded
    console.log('[Scan] Target loaded from DB:', {
      id: target.id,
      keyword: target.keyword,
      location_mode: target.location_mode,
      exact_address_input: target.exact_address_input,
      exact_resolved_lat: target.exact_resolved_lat,
      exact_resolved_lng: target.exact_resolved_lng,
      exact_resolution_source: target.exact_resolution_source,
      exact_geocoding_provider: target.exact_geocoding_provider,
      custom_city: target.custom_city,
      postal_code: target.postal_code,
    })
    if (locationMode === 'zip' && project.country.toUpperCase() !== 'US') {
      return Response.json(
        { error: 'ZIP code mode is only supported for US projects' },
        { status: 400 }
      )
    }

    // exact_point is the SOURCE OF TRUTH — block scan if coords missing/invalid.
    // Never silently fall back to project city or ZIP.
    let exactPointInput: {
      lat: number
      lng: number
      addressInput?: string | null
      resolutionSource?: string | null
      geocodingProvider?: string | null
    } | null = null
    if (locationMode === 'exact_point') {
      const lat = typeof target.exact_resolved_lat === 'number' ? target.exact_resolved_lat : null
      const lng = typeof target.exact_resolved_lng === 'number' ? target.exact_resolved_lng : null
      if (lat === null || lng === null || lat < -90 || lat > 90 || lng < -180 || lng > 180) {
        return Response.json(
          {
            error: `exact_point מצב: חסרים קואורדינטות תקינים עבור מילת מפתח "${target.keyword}". אין נפילה לעיר/ZIP — יש לעדכן כתובת או lat/lng.`,
          },
          { status: 400 }
        )
      }
      exactPointInput = {
        lat,
        lng,
        addressInput: target.exact_address_input || null,
        resolutionSource: target.exact_resolution_source || null,
        geocodingProvider: target.exact_geocoding_provider || null,
      }
    }

    const effectiveCity =
      (locationMode === 'custom' || locationMode === 'grid') && target.custom_city?.trim()
        ? target.custom_city.trim()
        : project.city

    const scanOutput = await runScan(target.engine_type, {
      engine: target.engine_type,
      keyword: target.keyword,
      targetDomain: target.target_domain || project.target_domain,
      targetBusinessName: target.target_business_name || project.business_name,
      country: project.country,
      language: project.language,
      city: effectiveCity,
      deviceType: project.device_type,
      locationMode,
      customCity: target.custom_city,
      gridSize: (target.grid_size || null) as 'small' | 'medium' | 'large' | null,
      postalCode: (target.postal_code || null) as string | null,
      exactPoint: exactPointInput,
    })

    // change_value: positive = improved (moved up), negative = dropped
    // Only compute when both scans found the keyword at a numeric position
    const changeValue =
      scanOutput.found &&
      scanOutput.position !== null &&
      previousPosition !== null
        ? previousPosition - scanOutput.position
        : null

    const scannerVersion = (scanOutput.audit?.request as Record<string, string> | undefined)?.scanner_version || null

    const resultData: Record<string, unknown> = {
      scan_id: scan.id,
      tracking_target_id: target.id,
      engine_type: target.engine_type,
      keyword: target.keyword,
      found: scanOutput.found,
      position: scanOutput.position,
      previous_position: previousPosition,
      change_value: changeValue,
      result_url: scanOutput.resultUrl,
      result_title: scanOutput.resultTitle,
      result_address: scanOutput.resultAddress,
      checked_at: new Date().toISOString(),
      error_message: scanOutput.error,
    }

    // Store audit data for all outcomes: found, not found, geo rejected, provider error, timeout
    if (scanOutput.audit) {
      resultData.audit_request = scanOutput.audit.request
      resultData.audit_response = scanOutput.audit.response
      resultData.audit_decision = scanOutput.audit.decision
      resultData.audit_scanner_version = scannerVersion
    }

    // Add location mode audit for US projects
    if (project.country.toUpperCase() === 'US') {
      if (locationMode === 'exact_point') {
        resultData.audit_location_mode = 'exact_point'
        resultData.audit_resolved_location = target.exact_address_input || `${exactPointInput?.lat},${exactPointInput?.lng}`
      } else {
        resultData.audit_location_mode = locationMode === 'zip' ? 'zip_centroid' : 'city_state'
        resultData.audit_resolved_location = locationMode === 'zip' ? target.postal_code : effectiveCity
      }
    }

    const { error: resultError } = await admin.from('scan_results').insert(resultData)

    if (resultError) {
      console.error(`[Scan] Failed to save result for target ${target.id}:`, resultError.message)
      failedTargets++
    } else if (scanOutput.error) {
      // Scan attempted but API returned an error — result saved with error_message
      failedTargets++
    } else {
      completedTargets++
    }

    results.push({
      targetId: target.id,
      keyword: target.keyword,
      found: scanOutput.found,
      position: scanOutput.position,
      changeValue,
      error: scanOutput.error,
    })
  }

  const finalStatus = failedTargets === targets.length ? 'failed' : 'completed'

  // Update scan record
  await admin
    .from('scans')
    .update({
      status: finalStatus,
      completed_targets: completedTargets,
      failed_targets: failedTargets,
      completed_at: new Date().toISOString(),
    })
    .eq('id', scan.id)

  // Increment scan counter for paid subscriptions
  if (!entitlement.isAdmin && entitlement.plan !== 'trial' && entitlement.subscriptionId) {
    await admin
      .from('subscriptions')
      .update({
        scans_this_period: entitlement.scansThisPeriod + 1,
      })
      .eq('id', entitlement.subscriptionId)
  }

  // Update project last_scan_at only — manual scans never change the scheduled next_scan_at
  await admin
    .from('projects')
    .update({ last_scan_at: new Date().toISOString() })
    .eq('id', projectId)

  return Response.json({
    scanId: scan.id,
    status: finalStatus,
    completed: completedTargets,
    failed: failedTargets,
    total: targets.length,
    results,
  })
}
