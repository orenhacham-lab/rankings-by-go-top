/**
 * Scheduled scan trigger endpoint.
 * Call this via Vercel Cron, Supabase scheduled function, or any external cron.
 *
 * Vercel cron — vercel.json:
 * {
 *   "crons": [{ "path": "/api/schedule", "schedule": "0 6 * * *" }]
 * }
 *
 * Protect with CRON_SECRET env var.
 * Vercel cron requests arrive with Authorization: Bearer <CRON_SECRET>
 */

import { createAdminClient } from '@/lib/supabase/admin'
import { runScan } from '@/lib/scanner'
import { calculateNextScanDate } from '@/lib/utils'

export async function GET(request: Request) {
  // Verify cron secret when configured
  const cronSecret = process.env.CRON_SECRET
  if (cronSecret) {
    const authHeader = request.headers.get('authorization')
    if (authHeader !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const admin = createAdminClient()
  const now = new Date()

  // Find projects due for scanning:
  // - active
  // - auto scan enabled
  // - not manual frequency
  // - next_scan_at is in the past (or null — treat null as overdue)
  const { data: projects, error } = await admin
    .from('projects')
    .select('*')
    .eq('is_active', true)
    .eq('auto_scan_enabled', true)
    .neq('scan_frequency', 'manual')
    .or(`next_scan_at.is.null,next_scan_at.lte.${now.toISOString()}`)

  if (error) {
    console.error('[Schedule] Error loading projects:', error.message)
    return Response.json({ error: error.message }, { status: 500 })
  }

  if (!projects || projects.length === 0) {
    return Response.json({ message: 'No projects due for scanning', processed: 0 })
  }

  console.log(`[Schedule] Processing ${projects.length} project(s) at ${now.toISOString()}`)

  const results: Array<{
    projectId: string
    projectName: string
    completed?: number
    failed?: number
    skipped?: boolean
    error?: string
  }> = []

  for (const project of projects) {
    try {
      // Immediately advance next_scan_at to prevent double-processing if cron overlaps
      const nextScanAt = calculateNextScanDate(project.scan_frequency, now)
      await admin
        .from('projects')
        .update({ next_scan_at: nextScanAt?.toISOString() ?? null })
        .eq('id', project.id)

      // Load active targets
      const { data: targets, error: targetsError } = await admin
        .from('tracking_targets')
        .select('*')
        .eq('project_id', project.id)
        .eq('is_active', true)

      if (targetsError) {
        console.error(`[Schedule] Failed to load targets for project ${project.id}:`, targetsError.message)
        results.push({ projectId: project.id, projectName: project.name, error: targetsError.message })
        continue
      }

      if (!targets || targets.length === 0) {
        console.log(`[Schedule] Project "${project.name}" has no active targets, skipping.`)
        results.push({ projectId: project.id, projectName: project.name, skipped: true })
        continue
      }

      // Create scan record
      const { data: scan, error: scanCreateError } = await admin
        .from('scans')
        .insert({
          user_id: project.user_id,
          project_id: project.id,
          status: 'running',
          triggered_by: 'scheduled',
          total_targets: targets.length,
          completed_targets: 0,
          failed_targets: 0,
          started_at: now.toISOString(),
        })
        .select()
        .single()

      if (scanCreateError || !scan) {
        console.error(`[Schedule] Failed to create scan for project ${project.id}:`, scanCreateError?.message)
        results.push({ projectId: project.id, projectName: project.name, error: scanCreateError?.message || 'scan creation failed' })
        continue
      }

      let completed = 0
      let failed = 0

      for (const target of targets) {
        // .maybeSingle() returns null data (not an error) when no previous results exist
        const { data: prevResult } = await admin
          .from('scan_results')
          .select('position, found')
          .eq('tracking_target_id', target.id)
          .order('checked_at', { ascending: false })
          .limit(1)
          .maybeSingle()

        const previousPosition = prevResult?.position ?? null

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

        const changeValue =
          scanOutput.found && scanOutput.position !== null && previousPosition !== null
            ? previousPosition - scanOutput.position
            : null

        const { error: resultError } = await admin.from('scan_results').insert({
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
          checked_at: now.toISOString(),
          error_message: scanOutput.error,
        })

        if (resultError) {
          console.error(`[Schedule] Failed to save result for target ${target.id}:`, resultError.message)
          failed++
        } else if (scanOutput.error) {
          failed++
        } else {
          completed++
        }
      }

      const finalStatus = failed === targets.length ? 'failed' : 'completed'

      await admin
        .from('scans')
        .update({
          status: finalStatus,
          completed_targets: completed,
          failed_targets: failed,
          completed_at: new Date().toISOString(),
        })
        .eq('id', scan.id)

      // Update last_scan_at (next_scan_at was already advanced at the top)
      await admin
        .from('projects')
        .update({ last_scan_at: now.toISOString() })
        .eq('id', project.id)

      results.push({ projectId: project.id, projectName: project.name, completed, failed })
      console.log(`[Schedule] "${project.name}": ${completed} OK, ${failed} failed`)
    } catch (err) {
      const msg = (err as Error).message
      console.error(`[Schedule] Unexpected error for project ${project.id}:`, msg)
      results.push({ projectId: project.id, projectName: project.name, error: msg })
    }
  }

  return Response.json({ processed: results.length, timestamp: now.toISOString(), results })
}
