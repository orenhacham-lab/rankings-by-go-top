import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scanner'
import { getUserEntitlement } from '@/lib/subscription'
import {
  buildQuotaError,
  buildTrialTargetAlreadyScannedError,
  countActiveTargets,
  countKeywordChecksTrialLifetime,
  hasTrialTargetAlreadyBeenScanned,
  areAnyTrialTargetsAlreadyScanned,
} from '@/lib/quota'
import { resolveCurrentUsagePeriod } from '@/lib/billing/usage-period'
import { reserveUsage, finalizeUsageReservation, releaseUsageReservation } from '@/lib/billing/usage-reservations'
import { resolveUSZipCodeToCoordinates } from '@/lib/scanner/us-zip-codes'

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

  const admin = createAdminClient()
  let scan: any = null
  // Phase 3 — set once a reservation is granted; the outer catch and every
  // early-return path below MUST finalize/release it so a request that
  // never dispatches a single provider call never leaves checks consumed.
  // Hoisted to function scope (not just the try block) so the catch handler
  // can see how many checks were actually dispatched before a fatal error.
  let reservationId: string | null = null
  let reservationToken: string | null = null
  let dispatchedCount = 0

  try {
    // Check entitlement and keyword-check limits.
    //
    // One Google check = one tracking_target scan (one keyword × one Google
    // destination — Organic or Maps). For "Scan All" we pre-count active
    // targets in the project; for a single target scan it's always 1. The
    // check is an ATOMIC RESERVATION (lib/billing/usage-reservations.ts) —
    // never a plain count-then-proceed — so no external provider call is
    // ever made unless the reservation actually succeeded, and concurrent
    // scan requests can never together exceed the plan's allowance.
    const entitlement = await getUserEntitlement(user.id, supabase)
    const checksThisScan = targetId
      ? 1
      : await countActiveTargets(projectId, admin)

    if (checksThisScan === 0) {
      return Response.json({ error: 'No active targets found' }, { status: 404 })
    }

    if (!entitlement.isAdmin) {
      const isTrial = entitlement.plan === 'trial'
      const limit = isTrial
        ? entitlement.limits.maxKeywordChecksTotal
        : entitlement.limits.maxKeywordChecksPerPeriodPerProject

      if (isTrial) {
        // Trial: lifetime cap, no real "billing period" resolver needed — a
        // plain count is sufficient here (no concurrent-job race risk for a
        // single trial user clicking "scan" from one browser session), same
        // as before this change.
        const used = await countKeywordChecksTrialLifetime(user.id, admin)
        if (used + checksThisScan > limit) {
          const payload = buildQuotaError('QUOTA_KEYWORD_CHECKS', entitlement.plan, entitlement.limits, limit)
          return Response.json(payload, { status: 403 })
        }
      } else {
        const period = await resolveCurrentUsagePeriod(admin, user.id)
        if (!period) {
          return Response.json({ error: 'Unable to resolve billing period' }, { status: 500 })
        }
        const reservation = await reserveUsage(admin, {
          userId: user.id, projectId, usageType: 'google_check', amount: checksThisScan,
          periodStart: period.start, periodEnd: period.end, limit,
          idempotencyKey: `manual:${projectId}:${targetId ?? 'all'}:${Date.now()}`,
        })
        if (reservation.outcome === 'quota_exceeded') {
          const payload = buildQuotaError('QUOTA_KEYWORD_CHECKS', entitlement.plan, entitlement.limits, limit)
          return Response.json(payload, { status: 403 })
        }
        if (reservation.outcome !== 'reserved' && reservation.outcome !== 'already_reserved') {
          return Response.json({ error: 'Failed to reserve keyword-check allowance' }, { status: 500 })
        }
        reservationId = reservation.reservationId
        reservationToken = reservation.reservationToken
      }

      // Trial plan: prevent rescanning the same tracking_target.
      if (entitlement.plan === 'trial') {
        if (targetId) {
          // Single target scan: check if this specific target has been scanned
          const alreadyScanned = await hasTrialTargetAlreadyBeenScanned(targetId, admin)
          if (alreadyScanned) {
            const payload = buildTrialTargetAlreadyScannedError(false, entitlement.plan, entitlement.limits)
            return Response.json(payload, { status: 403 })
          }
        } else {
          // Scan All: check if any active target has been scanned
          const { data: activeTargets, error: targetIdsErr } = await admin
            .from('tracking_targets')
            .select('id')
            .eq('project_id', projectId)
            .eq('is_active', true)

          if (!targetIdsErr && activeTargets && activeTargets.length > 0) {
            const targetIds = activeTargets.map((t: { id: string }) => t.id)
            const anyScanned = await areAnyTrialTargetsAlreadyScanned(targetIds, admin)
            if (anyScanned) {
              const payload = buildTrialTargetAlreadyScannedError(true, entitlement.plan, entitlement.limits)
              return Response.json(payload, { status: 403 })
            }
          }
        }
      }
    }

    // Phase 3 — no external provider call has happened yet on any path below
    // that returns before the scan loop; a reservation held at that point
    // must be released (nothing was dispatched).
    const releaseIfReserved = async (reason: string) => {
      if (reservationId && reservationToken) await releaseUsageReservation(admin, { reservationId, userId: user.id, reservationToken, reason })
    }

    // Load project
    const { data: project, error: projectError } = await admin
      .from('projects')
      .select('*')
      .eq('id', projectId)
      .single()

    if (projectError || !project) {
      await releaseIfReserved('project_not_found')
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
      await releaseIfReserved('targets_load_failed')
      return Response.json({ error: `Failed to load targets: ${targetsError.message}` }, { status: 500 })
    }
    if (!targets || targets.length === 0) {
      await releaseIfReserved('no_active_targets')
      return Response.json({ error: 'No active targets found' }, { status: 404 })
    }

    // Correction (review blocker 1, applied consistently to manual scans) —
    // a "Scan All" that crashed mid-batch must be RESUMABLE without
    // re-dispatching (and so re-charging) targets already checked. A
    // single-target scan has no batch to partially fail, so it always gets
    // a fresh scan row (unchanged behavior).
    let scanForResume: { id: string } | null = null
    if (!targetId) {
      const { data: existingScan } = await admin
        .from('scans')
        .select('*')
        .eq('project_id', projectId)
        .eq('status', 'running')
        .eq('triggered_by', triggeredBy)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      scanForResume = existingScan as { id: string } | null
    }

    let scanData: { id: string } | null = scanForResume
    if (!scanData) {
      const { data: newScan, error: scanError } = await admin
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

      if (scanError || !newScan) {
        await releaseIfReserved('scan_record_create_failed')
        return Response.json({ error: `Failed to create scan record: ${scanError?.message}` }, { status: 500 })
      }
      scanData = newScan
    }

    scan = scanData

    // Only targets with NO scan_results row under this scan yet are
    // "remaining" — a target that already has one (from an earlier, crashed
    // attempt resuming the SAME scan row) already consumed its check and is
    // NEVER re-dispatched or re-charged.
    const { data: doneRows } = await admin.from('scan_results').select('tracking_target_id').eq('scan_id', scan.id)
    const doneIds = new Set((doneRows ?? []).map((r: { tracking_target_id: string }) => r.tracking_target_id))
    const targetsToRun = scanForResume ? targets.filter((t: { id: string }) => !doneIds.has(t.id)) : targets

    // Correction — the reservation must cover only the REMAINING targets on
    // a resumed scan, never the original full batch size again. The
    // reservation above (before targets/scan were loaded) already used
    // `checksThisScan` (the pre-resume full count) for the FIRST attempt;
    // when resuming, release that over-broad reservation and take a fresh
    // one sized to what's actually left.
    if (scanForResume && reservationId && reservationToken && targetsToRun.length !== checksThisScan) {
      await releaseUsageReservation(admin, { reservationId, userId: user.id, reservationToken, reason: 'resized_for_resume' })
      reservationId = null
      reservationToken = null
      const entitlementForResume = await getUserEntitlement(user.id, supabase)
      if (!entitlementForResume.isAdmin && entitlementForResume.plan !== 'trial' && targetsToRun.length > 0) {
        const period = await resolveCurrentUsagePeriod(admin, user.id)
        if (period) {
          const resumeReservation = await reserveUsage(admin, {
            userId: user.id, projectId, usageType: 'google_check', amount: targetsToRun.length,
            periodStart: period.start, periodEnd: period.end,
            limit: entitlementForResume.limits.maxKeywordChecksPerPeriodPerProject,
            idempotencyKey: `manual:${projectId}:resume:${scan.id}:${Date.now()}`,
          })
          if (resumeReservation.outcome === 'quota_exceeded') {
            const payload = buildQuotaError('QUOTA_KEYWORD_CHECKS', entitlementForResume.plan, entitlementForResume.limits, entitlementForResume.limits.maxKeywordChecksPerPeriodPerProject)
            return Response.json(payload, { status: 403 })
          }
          if (resumeReservation.outcome === 'reserved' || resumeReservation.outcome === 'already_reserved') {
            reservationId = resumeReservation.reservationId
            reservationToken = resumeReservation.reservationToken
          }
        }
      }
    }

    // Phase 3 — only incremented right before an actual provider call is
    // made (runScan). A target that throws during pre-flight validation
    // (e.g. missing exact_point coordinates) BEFORE runScan is reached never
    // increments this — that check was never dispatched, so it must not be
    // consumed from the reservation (released back at finalize time below).
    const results = []

    for (const target of targetsToRun) {
      try {
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

        let locationMode: 'project' | 'custom' | 'zip' | 'exact_point' | 'radius' = target.location_mode || 'project'

        // Backward compatibility: convert removed 'grid' mode to custom or project
        if (locationMode === 'grid' as any) {
          locationMode = target.custom_city?.trim() ? 'custom' : 'project'
        }

        // DEBUG: log what was actually loaded
        console.log('[Scan] === TARGET LOADED FROM DB ===')
        console.log('[Scan] Target ID:', target.id)
        console.log('[Scan] Keyword:', target.keyword)
        console.log('[Scan] location_mode from DB:', target.location_mode)
        console.log('[Scan] effective_location_mode:', locationMode)
        if (target.location_mode === 'radius') {
          console.log('[Scan] RADIUS TARGET DETAILS:')
          console.log('  - radius_center_zip from DB:', target.radius_center_zip, `(type: ${typeof target.radius_center_zip})`)
          console.log('  - radius_miles from DB:', target.radius_miles, `(type: ${typeof target.radius_miles})`)
        }
        console.log('[Scan] exact_address_input:', target.exact_address_input)
        console.log('[Scan] exact_resolved_lat:', target.exact_resolved_lat)
        console.log('[Scan] exact_resolved_lng:', target.exact_resolved_lng)
        console.log('[Scan] custom_city:', target.custom_city)
        console.log('[Scan] postal_code:', target.postal_code)
        console.log('[Scan] === END TARGET LOAD ===')

        if (locationMode === 'zip' && project.country.toUpperCase() !== 'US') {
          throw new Error('ZIP code mode is only supported for US projects')
        }
        if (locationMode === 'radius' && project.country.toUpperCase() !== 'US') {
          throw new Error('Radius mode is only supported for US projects')
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
            throw new Error(`exact_point מצב: חסרים קואורדינטות תקינים עבור מילת מפתח "${target.keyword}". אין נפילה לעיר/ZIP — יש לעדכן כתובת או lat/lng.`)
          }
          exactPointInput = {
            lat,
            lng,
            addressInput: target.exact_address_input || null,
            resolutionSource: target.exact_resolution_source || null,
            geocodingProvider: target.exact_geocoding_provider || null,
          }
        }

        // radius mode — resolve ZIP to coordinates
        let radiusCenterInput: {
          lat: number
          lng: number
          centerZip?: string | null
          radiusMiles?: number | null
        } | null = null
        if (locationMode === 'radius') {
          const rawZip = target.radius_center_zip
          const centerZip = target.radius_center_zip?.trim() || null
          const radiusMiles = typeof target.radius_miles === 'number' ? target.radius_miles : null

          console.log('[Scan] RADIUS MODE INITIATED', {
            keyword: target.keyword,
            rawZipFromDB: rawZip,
            centerZipAfterTrim: centerZip,
            radiusMilesFromDB: radiusMiles,
            radiusMilesType: typeof radiusMiles,
          })

          if (!centerZip) {
            throw new Error(`Radius mode requires a center ZIP code for keyword "${target.keyword}"`)
          }
          if (radiusMiles === null || radiusMiles <= 0) {
            throw new Error(`Radius mode requires a valid radius distance (must be > 0) for keyword "${target.keyword}". Got: ${radiusMiles}`)
          }

          console.log('[Scan] Radius mode: attempting to resolve ZIP', {
            centerZip,
            keyword: target.keyword,
          })
          const resolved = resolveUSZipCodeToCoordinates(centerZip)

          console.log('[Scan] Radius mode: ZIP resolution result', {
            inputZip: centerZip,
            resolved: resolved ? `lat=${resolved.lat}, lng=${resolved.lng}` : 'null/undefined',
          })

          if (!resolved) {
            throw new Error(`Could not resolve ZIP code "${centerZip}" for keyword "${target.keyword}". Check if the ZIP is valid and exists in US database.`)
          }

          console.log('[Scan] ✓ RADIUS ZIP SUCCESSFULLY RESOLVED', {
            enteredZIP: centerZip,
            resolvedLat: resolved.lat,
            resolvedLng: resolved.lng,
            radiusMiles: radiusMiles,
            keyword: target.keyword,
          })
          console.log(`[Scan] PROOF: ZIP "${centerZip}" → LAT=${resolved.lat}, LNG=${resolved.lng} (should be Bakersfield-area for 93313)`)

          radiusCenterInput = {
            lat: resolved.lat,
            lng: resolved.lng,
            centerZip,
            radiusMiles,
          }

          console.log('[Scan] radiusCenterInput object created:', {
            lat: radiusCenterInput.lat,
            lng: radiusCenterInput.lng,
            centerZip: radiusCenterInput.centerZip,
            radiusMiles: radiusCenterInput.radiusMiles,
          })
        }

        const effectiveCity =
          locationMode === 'custom' && target.custom_city?.trim()
            ? target.custom_city.trim()
            : locationMode === 'radius' || locationMode === 'exact_point'
            ? null
            : project.city

        const scanPayload = {
          engine: target.engine_type,
          keyword: target.keyword,
          targetDomain: target.target_domain || project.target_domain,
          targetBusinessName: target.target_business_name || project.business_name,
          country: project.country,
          language: project.language,
          city: effectiveCity,
          deviceType: project.device_type,
          locationMode,
          customCity: locationMode === 'radius' ? null : target.custom_city,
          postalCode: locationMode === 'zip'
            ? ((target.postal_code || null) as string | null)
            : null,
          exactPoint: exactPointInput,
          radiusCenter: radiusCenterInput,
        }

        if (locationMode === 'radius') {
          console.log('[Scan:route] === RADIUS MODE: FINAL PAYLOAD VERIFICATION ===')
          console.log('[Scan:route] locationMode:', scanPayload.locationMode)
          console.log('[Scan:route] city:', scanPayload.city, '← MUST BE null for radius')
          console.log('[Scan:route] customCity:', scanPayload.customCity, '← MUST BE null for radius')
          console.log('[Scan:route] radiusCenter is null?', scanPayload.radiusCenter === null, '← MUST BE false')
          if (scanPayload.radiusCenter) {
            console.log('[Scan:route] ✓ radiusCenter OBJECT EXISTS:')
            console.log('[Scan:route]   - centerZip:', scanPayload.radiusCenter.centerZip, '← should be 93313 for test')
            console.log('[Scan:route]   - lat:', scanPayload.radiusCenter.lat, '← should be 35.32 for Bakersfield')
            console.log('[Scan:route]   - lng:', scanPayload.radiusCenter.lng, '← should be -119.08 for Bakersfield')
            console.log('[Scan:route]   - radiusMiles:', scanPayload.radiusCenter.radiusMiles, '← should be 5')
          } else {
            console.log('[Scan:route] ✗ CRITICAL ERROR: radiusCenter is NULL but locationMode is radius!')
          }
          console.log('[Scan:route] postalCode:', scanPayload.postalCode, '← MUST BE null for radius')
          console.log('[Scan:route] === END RADIUS MODE PAYLOAD VERIFICATION ===')
        }

        console.log('[Scan:route] === ABOUT TO CALL runScan ===')
        console.log('[Scan:route] Payload summary:', {
          keyword: scanPayload.keyword,
          locationMode: scanPayload.locationMode,
          city: scanPayload.city,
          postalCode: scanPayload.postalCode,
          exactPointNull: scanPayload.exactPoint === null,
          exactPointLat: scanPayload.exactPoint?.lat,
          exactPointLng: scanPayload.exactPoint?.lng,
          radiusCenterNull: scanPayload.radiusCenter === null,
          radiusCenterZip: scanPayload.radiusCenter?.centerZip,
          radiusCenterLat: scanPayload.radiusCenter?.lat,
          radiusCenterLng: scanPayload.radiusCenter?.lng,
          radiusMiles: scanPayload.radiusCenter?.radiusMiles,
        })
        console.log('[Scan:route] === END PAYLOAD SUMMARY ===')

        dispatchedCount++ // the provider call is about to actually happen — this check is now "consumed" regardless of outcome (including a valid not-found result)
        const scanOutput = await runScan(target.engine_type, scanPayload)

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
          } else if (locationMode === 'radius') {
            resultData.audit_location_mode = 'radius'
            resultData.audit_resolved_location = `${target.radius_center_zip} (center: ${radiusCenterInput?.lat},${radiusCenterInput?.lng}, radius: ${target.radius_miles}mi)`
          } else {
            resultData.audit_location_mode = locationMode === 'zip' ? 'zip_centroid' : 'city_state'
            resultData.audit_resolved_location = locationMode === 'zip' ? target.postal_code : effectiveCity
          }
        }

        const { error: resultError } = await admin.from('scan_results').insert(resultData)

        if (resultError) {
          console.error(`[Scan] Failed to save result for target ${target.id}:`, {
            message: resultError.message,
            code: (resultError as any).code,
            details: (resultError as any).details,
            hint: (resultError as any).hint,
          })
          console.error(`[Scan] scan_results insert payload:`, {
            scan_id: resultData.scan_id,
            tracking_target_id: resultData.tracking_target_id,
            engine_type: resultData.engine_type,
            keyword: resultData.keyword,
            found: resultData.found,
            position: resultData.position,
            error_message: resultData.error_message,
            audit_request_keys: resultData.audit_request ? Object.keys(resultData.audit_request) : null,
            audit_response_keys: resultData.audit_response ? Object.keys(resultData.audit_response) : null,
            audit_decision_keys: resultData.audit_decision ? Object.keys(resultData.audit_decision) : null,
            audit_location_mode: resultData.audit_location_mode,
            audit_resolved_location: resultData.audit_resolved_location,
          })
          // 2nd review correction — a scan_results insert failure is now
          // THROWN (caught by this SAME target's catch block below) rather
          // than silently continuing to `results.push` as if the row had
          // been persisted. This target has NO durable dispatch record when
          // this happens (the row that would prove "this target was already
          // checked" never landed), so it is correctly left eligible for a
          // future resume/retry to re-attempt — the SAME documented
          // trade-off as the automatic scheduler
          // (lib/scan-scheduler/process-scheduled-scan.ts): the provider
          // call CAN be intentionally repeated in this narrow window, since
          // there is no cheaper way to guarantee this target is never
          // silently skipped for the rest of the billing period.
          throw new Error(`scan_results_insert_failed:${target.id}:${resultError.message}`)
        } else if (scanOutput.error) {
          // Scan attempted but API returned an error — result saved with error_message
        }

        results.push({
          targetId: target.id,
          keyword: target.keyword,
          found: scanOutput.found,
          position: scanOutput.position,
          changeValue,
          error: scanOutput.error,
        })
      } catch (targetError) {
        const errorMsg = targetError instanceof Error ? targetError.message : String(targetError)
        console.error(`[Scan] Exception while scanning target ${target.id}:`, errorMsg)
        console.error((targetError as Error)?.stack)
        results.push({
          targetId: target.id,
          keyword: target.keyword,
          found: false,
          position: null,
          changeValue: null,
          error: errorMsg,
        })
      }
    }

    // Cumulative tally across ALL attempts of this scan row (not just this
    // attempt's targetsToRun) — correct even when this request resumed a
    // previously-crashed "Scan All".
    const { data: allScanResultRows } = await admin.from('scan_results').select('error_message').eq('scan_id', scan.id)
    const cumulativeCompleted = (allScanResultRows ?? []).filter((r: { error_message: string | null }) => !r.error_message).length
    const cumulativeFailed = (allScanResultRows ?? []).filter((r: { error_message: string | null }) => !!r.error_message).length
    const finalStatus = cumulativeFailed === targets.length ? 'failed' : 'completed'

    // Build error summary if scan failed
    let scanErrorMessage: string | null = null
    if (finalStatus === 'failed') {
      const failedKeywords = results
        .filter(r => r.error)
        .map(r => `"${r.keyword}" (${r.error})`)
        .slice(0, 5)
      scanErrorMessage = failedKeywords.length > 0
        ? `Failed targets: ${failedKeywords.join('; ')}`
        : `All ${cumulativeFailed} targets failed`
    }

    // Update scan record with final status
    const updatePayload: Record<string, unknown> = {
      status: finalStatus,
      completed_targets: cumulativeCompleted,
      failed_targets: cumulativeFailed,
      completed_at: new Date().toISOString(),
    }
    if (scanErrorMessage) {
      updatePayload.error_message = scanErrorMessage
    }

    await admin
      .from('scans')
      .update(updatePayload)
      .eq('id', scan.id)

    // Phase 3 — consume exactly what was actually dispatched to the
    // provider; any reserved-but-undispatched checks (pre-flight validation
    // throws before runScan) are released automatically by the RPC.
    if (reservationId && reservationToken) {
      await finalizeUsageReservation(admin, {
        reservationId, userId: user.id, reservationToken, consumed: dispatchedCount, relatedRef: scan.id,
        reason: dispatchedCount < checksThisScan ? 'partial_dispatch' : null,
      })
    }

    // Update project last_scan_at only — manual scans never change the scheduled next_scan_at
    await admin
      .from('projects')
      .update({ last_scan_at: new Date().toISOString() })
      .eq('id', projectId)

    return Response.json({
      scanId: scan.id,
      status: finalStatus,
      completed: cumulativeCompleted,
      failed: cumulativeFailed,
      total: targets.length,
      results,
    })
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : ''

    console.error('[Scan] FATAL ERROR:', errorMsg)
    console.error('[Scan] Stack:', errorStack)

    // Correction (review blocker 1) — a fatal error must never leave a
    // reservation permanently held, AND must never blanket-release checks
    // that were genuinely already dispatched. `consumed: dispatchedCount`
    // resolves correctly either way inside finalizeUsageReservation: 0 →
    // full release, >0 → exactly that many consumed, the rest released.
    // Already-consumed usage from any earlier attempt on this same scan row
    // is untouched by this call.
    if (reservationId && reservationToken) {
      await finalizeUsageReservation(admin, {
        reservationId, userId: user.id, reservationToken, consumed: dispatchedCount, relatedRef: scan?.id ?? null,
        reason: dispatchedCount > 0 ? `partial_before_fatal_error:${errorMsg}` : 'fatal_error',
      })
    }

    // If scan record was created, update it with error. A "Scan All" batch
    // is left 'running' (NOT 'failed') so the user's next "Scan All" click
    // can RESUME it (only dispatching remaining targets, never re-charging
    // ones already consumed above) — matches the automatic scheduler's
    // retry-resume design. A single-target scan has no batch to resume, so
    // it's still marked 'failed' outright, unchanged from before.
    if (scan) {
      try {
        if (targetId) {
          await admin
            .from('scans')
            .update({
              status: 'failed',
              error_message: errorMsg,
              completed_at: new Date().toISOString(),
            })
            .eq('id', scan.id)
        } else {
          await admin
            .from('scans')
            .update({ error_message: `resumable_after_error: ${errorMsg}` })
            .eq('id', scan.id)
        }
      } catch (updateErr) {
        console.error('[Scan] Failed to update scan with error:', updateErr)
      }
    }

    return Response.json(
      { error: `Scan execution failed: ${errorMsg}` },
      { status: 500 }
    )
  }
}
