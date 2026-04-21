import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scanner'
import { getUserEntitlement } from '@/lib/subscription'
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

  try {
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
    const { data: scanData, error: scanError } = await admin
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

    if (scanError || !scanData) {
      return Response.json({ error: `Failed to create scan record: ${scanError?.message}` }, { status: 500 })
    }

    scan = scanData
    let completedTargets = 0
    let failedTargets = 0
    const results = []

    for (const target of targets) {
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
      } catch (targetError) {
        const errorMsg = targetError instanceof Error ? targetError.message : String(targetError)
        console.error(`[Scan] Exception while scanning target ${target.id}:`, errorMsg)
        console.error((targetError as Error)?.stack)
        failedTargets++
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

    const finalStatus = failedTargets === targets.length ? 'failed' : 'completed'

    // Build error summary if scan failed
    let scanErrorMessage: string | null = null
    if (finalStatus === 'failed') {
      const failedKeywords = results
        .filter(r => r.error)
        .map(r => `"${r.keyword}" (${r.error})`)
        .slice(0, 5)
      scanErrorMessage = failedKeywords.length > 0
        ? `Failed targets: ${failedKeywords.join('; ')}`
        : `All ${failedTargets} targets failed`
    }

    // Update scan record with final status
    const updatePayload: Record<string, unknown> = {
      status: finalStatus,
      completed_targets: completedTargets,
      failed_targets: failedTargets,
      completed_at: new Date().toISOString(),
    }
    if (scanErrorMessage) {
      updatePayload.error_message = scanErrorMessage
    }

    await admin
      .from('scans')
      .update(updatePayload)
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
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err)
    const errorStack = err instanceof Error ? err.stack : ''

    console.error('[Scan] FATAL ERROR:', errorMsg)
    console.error('[Scan] Stack:', errorStack)

    // If scan record was created, update it with error
    if (scan) {
      try {
        await admin
          .from('scans')
          .update({
            status: 'failed',
            error_message: errorMsg,
            completed_at: new Date().toISOString(),
          })
          .eq('id', scan.id)
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
