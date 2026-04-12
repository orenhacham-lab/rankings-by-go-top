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
      // Paid users are limited by scans_this_period
      if (entitlement.scansThisPeriod >= entitlement.limits.maxScansPerPeriod) {
        return Response.json(
          { error: `הגעת למגבלת ${entitlement.limits.maxScansPerPeriod} סריקות בחודש בתוכנית ${entitlement.limits.label}` },
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
    const scanOutput = await runScan(target.engine_type, {
      engine: target.engine_type,
      keyword: target.keyword,
      targetDomain: target.target_domain || project.target_domain,
      targetBusinessName: target.target_business_name || project.business_name,
      country: project.country,
      language: project.language,
      city: project.city,
      deviceType: project.device_type,
    })

    // change_value: positive = improved (moved up), negative = dropped
    // Only compute when both scans found the keyword at a numeric position
    const changeValue =
      scanOutput.found &&
      scanOutput.position !== null &&
      previousPosition !== null
        ? previousPosition - scanOutput.position
        : null

    const resultData = {
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
