import { createAdminClient } from '@/lib/supabase/admin'
import { createClient } from '@/lib/supabase/server'
import { runScan } from '@/lib/scanner'
import { getUserEntitlement } from '@/lib/subscription'
import {
  buildEntitlementUnavailableError,
  isEntitlementUnknown,
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
import {
  Deadline, DeadlineExceededError, withDeadline, logOperation, newRequestId,
} from '@/lib/ops/deadline'
import { claimOperation, releaseOperationClaim, rankingScanScope } from '@/lib/ops/single-flight'

/**
 * The platform ceiling this handler must ALWAYS answer inside.
 *
 * Declared explicitly. Inherited, it is a number nobody in this file knows, and
 * a handler that is KILLED at the ceiling throws nothing, logs nothing and
 * persists nothing — which is what a merchant experienced as "waited about a
 * minute, then nothing happened".
 */
export const maxDuration = 60

/** The whole operation's budget, comfortably inside `maxDuration` so this
 *  handler — not the platform — decides how the request ends. */
const OPERATION_BUDGET_MS = 45_000
/** One target's provider call. The scanner has its own per-request timeouts;
 *  this bounds the STEP, so a batch cannot spend the whole budget on target one. */
const PROVIDER_STEP_MS = 20_000
/** The single-flight claim outlives the operation budget by a margin, so a live
 *  operation is never stolen, and expires soon enough that one abandoned by a
 *  killed function recovers without anyone intervening. */
const CLAIM_TTL_SECONDS = 90

/**
 * A stable, non-secret category for an exception — and NOTHING else.
 *
 * The scan route logged `errorMsg` and full stacks. Those strings come from the
 * provider client, from PostgREST and from this route's own thrown messages,
 * and can carry a query, a URL with a key in it, a database hint or a shop
 * identifier. A platform log is not the place for any of that, and a category
 * is what an operator actually needs.
 */
function classifyFailure(err: unknown): string {
  if (err instanceof DeadlineExceededError) return `deadline_exceeded:${err.stage}`
  const raw = err instanceof Error ? err.message : String(err ?? '')
  if (/^scan_results_insert_failed:/.test(raw)) return 'persist_failed'
  if (/exact_point|קואורדינטות/.test(raw)) return 'invalid_exact_point'
  if (/Radius|ZIP/.test(raw)) return 'invalid_radius_config'
  if (/timed out|timeout|abort/i.test(raw)) return 'provider_timeout'
  if (/fetch failed|ENOTFOUND|ECONNREFUSED|network/i.test(raw)) return 'provider_network'
  if (/Serper API error/i.test(raw)) return 'provider_error'
  return 'unclassified'
}

export async function POST(request: Request) {
  const startedAt = Date.now()
  const requestId = newRequestId()
  const deadline = new Deadline(OPERATION_BUDGET_MS)
  const diag: {
    stage: string; outcome: string; userId?: string; projectId?: string; targetId?: string
    targetCount?: number; reservationOutcome?: string | null; persisted?: number | null
    persistenceOutcome?: string | null; claimOutcome?: string | null; claimRelease?: string | null
  } = { stage: 'start', outcome: 'unknown' }
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
  diag.userId = user.id
  diag.projectId = projectId
  if (targetId) diag.targetId = targetId

  // SINGLE FLIGHT, BEFORE ANY WORK.
  //
  // Taken before the entitlement read, the reservation and the provider call,
  // so a second request for the SAME scope creates no scan, reserves nothing,
  // calls nobody and consumes no check. "Scan all" and a single target are
  // different scopes and never block each other. Applies to trial and paid
  // accounts alike — the trial path's old assumption that a single user cannot
  // race themselves is what this replaces.
  const scope = rankingScanScope(projectId, targetId ?? null)
  const claim = await claimOperation(admin, {
    userId: user.id, operation: 'ranking_scan', scope, requestId, ttlSeconds: CLAIM_TTL_SECONDS,
  })
  diag.claimOutcome = claim.outcome
  if (claim.outcome === 'in_progress') {
    diag.stage = 'claim'
    diag.outcome = 'in_progress'
    logOperation({
      operation: 'ranking_scan', stage: 'claim', outcome: 'in_progress',
      durationMs: Date.now() - startedAt, requestId, userId: user.id, projectId,
      targetId: targetId ?? undefined, claimOutcome: claim.outcome,
    })
    return Response.json({
      errorCode: 'SCAN_IN_PROGRESS',
      error: 'בדיקה כבר רצה עבור הבחירה הזו. המתינו לסיומה.',
      errorEn: 'A check is already running for this selection. Please wait for it to finish.',
      retryable: true,
      // The holder's id, so a merchant report can be matched to the operation
      // that is actually running. Never another tenant's — the claim key is
      // scoped by user id and the function refuses to report across users.
      inProgressRequestId: claim.holderRequestId,
      requestId,
    }, { status: 409 })
  }
  if (claim.outcome === 'unavailable') {
    diag.stage = 'claim'
    diag.outcome = 'claim_unavailable'
    logOperation({
      operation: 'ranking_scan', stage: 'claim', outcome: 'claim_unavailable',
      durationMs: Date.now() - startedAt, requestId, userId: user.id, projectId, claimOutcome: claim.outcome,
    })
    return Response.json({
      errorCode: 'SCAN_FAILED',
      error: 'הבדיקה נכשלה. נסו שוב בעוד רגע.',
      errorEn: 'The check failed. Please try again in a moment.',
      retryable: true, requestId,
    }, { status: 503 })
  }
  // 'claimed', or 'not_deployed' — see lib/ops/single-flight.ts. Either way the
  // work proceeds; only the former is protected, and the diagnostics say which.
  const claimHeld = claim.outcome === 'claimed'
  /** The OPERATION's identity — never this request's id. */
  const operationKey = claim.operationKey ?? `unclaimed:${requestId}`

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
    // SERVICE-ROLE, not the request-scoped client: getUserEntitlement reads
    // billing_governance, which is REVOKEd from `authenticated` and errors
    // (42501) rather than returning an empty set — collapsing the whole
    // entitlement to zero limits. See lib/supabase/admin.ts.
    diag.stage = 'entitlement'
    const entitlement = await getUserEntitlement(user.id, admin)
    // A read failure is not an exhausted quota: answering "you have reached
    // your limit of 0 — upgrade your plan" is what the reviewer saw. This is
    // transient and retryable, and nothing was spent.
    if (isEntitlementUnknown(entitlement.plan)) {
      return Response.json(buildEntitlementUnavailableError(), { status: 503 })
    }
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
          // PER-OPERATION, not per-request.
          //
          // `Date.now()` gave two clicks in the same millisecond one key; a
          // per-request id gave them two. Neither is an idempotency key. This
          // is the single-flight claim's own start instant: identical for every
          // request that joins one operation, different for a later legitimate
          // retry. Concurrent duplicates never reach this line at all — they
          // are refused at the claim above — so this is the second line of
          // defence, not the first.
          idempotencyKey: `manual:${projectId}:${scope}:${operationKey}`,
        })
        diag.reservationOutcome = reservation.outcome
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

    diag.stage = 'load_targets'
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
      const entitlementForResume = await getUserEntitlement(user.id, admin)
      if (!entitlementForResume.isAdmin && entitlementForResume.plan !== 'trial' && targetsToRun.length > 0) {
        const period = await resolveCurrentUsagePeriod(admin, user.id)
        if (period) {
          const resumeReservation = await reserveUsage(admin, {
            userId: user.id, projectId, usageType: 'google_check', amount: targetsToRun.length,
            periodStart: period.start, periodEnd: period.end,
            limit: entitlementForResume.limits.maxKeywordChecksPerPeriodPerProject,
            idempotencyKey: `manual:${projectId}:resume:${scan.id}:${operationKey}`,
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
    // A target whose provider call ran out of the operation's budget is a
    // DIFFERENT outcome from one that failed: it is transient and worth
    // retrying, and it must never be counted as a completed check.
    let timedOutTargets = 0

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

        // BUDGET BEFORE CHARGE. A target the operation can no longer afford to
        // dispatch is not "consumed": the provider call never happens, so the
        // check must not be counted against the reservation.
        deadline.assertNotExpired('provider')
        diag.stage = 'provider'
        dispatchedCount++ // the provider call is about to actually happen — this check is now "consumed" regardless of outcome (including a valid not-found result)
        const scanOutput = await withDeadline(
          runScan(target.engine_type, scanPayload), deadline.sliceFor(PROVIDER_STEP_MS), 'provider')

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
          // The SQLSTATE is actionable; `details` and `hint` quote row values
          // and are not safe to log.
          console.error('[Scan] result persist failed', {
            requestId, targetId: target.id, code: (resultError as { code?: string }).code ?? null,
          })
          // The former payload dump quoted the keyword, the audit request and
          // response, and the provider's own error text. Only the shape is
          // logged now — enough to tell a schema fault from a data fault.
          console.error('[Scan] result payload shape', {
            requestId,
            hasAudit: resultData.audit_request != null,
            locationMode: resultData.audit_location_mode ?? null,
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
          // A CATEGORY in the response, never the provider's own sentence. The
          // full text is still written to scan_results.error_message, which is
          // the operator's audit trail, not something a browser receives.
          error: scanOutput.error ? classifyFailure(new Error(scanOutput.error)) : null,
        })
      } catch (targetError) {
        if (targetError instanceof DeadlineExceededError) timedOutTargets++
        // A CATEGORY, never the message and never the stack.
        console.error('[Scan] target failed', {
          requestId, targetId: target.id, category: classifyFailure(targetError),
        })
        results.push({
          targetId: target.id,
          keyword: target.keyword,
          found: false,
          position: null,
          changeValue: null,
          error: classifyFailure(targetError),
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

    diag.stage = 'complete'
    diag.outcome = finalStatus
    diag.targetCount = targets.length
    diag.persisted = cumulativeCompleted
    diag.persistenceOutcome = cumulativeFailed === 0 ? 'written' : cumulativeCompleted > 0 ? 'partial' : 'none'

    // NO SILENT SUCCESS.
    //
    // A scan in which nothing was successfully checked used to answer 200 with
    // `completed: 0`, which the UI reported as a finished scan. To a merchant
    // that is the button doing nothing, announced as success. This is decided
    // AFTER the bookkeeping above — the scan row is updated and the reservation
    // finalized either way, so a truthful failure never leaks a held reservation.
    if (targetsToRun.length > 0 && cumulativeCompleted === 0) {
      const timedOut = timedOutTargets > 0
      diag.outcome = timedOut ? 'timeout_no_result' : 'failed_no_result'
      return Response.json({
        errorCode: timedOut ? 'SCAN_TIMEOUT' : 'SCAN_FAILED',
        error: timedOut
          ? 'הבדיקה לקחה יותר מדי זמן ולא הושלמה. נסו שוב בעוד רגע.'
          : 'הבדיקה נכשלה. נסו שוב בעוד רגע.',
        errorEn: timedOut
          ? 'The check took too long and did not finish. Please try again in a moment.'
          : 'The check failed. Please try again in a moment.',
        retryable: true,
        requestId,
      }, { status: timedOut ? 504 : 500 })
    }

    return Response.json({
      scanId: scan.id,
      status: finalStatus,
      completed: cumulativeCompleted,
      failed: cumulativeFailed,
      total: targets.length,
      results,
      requestId,
    })
  } catch (err) {
    const failureCategory = classifyFailure(err)
    console.error('[Scan] fatal', { requestId, stage: diag.stage, category: failureCategory })

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
        // The release reason is persisted, so it carries the category rather
        // than the raw message it used to interpolate.
        reason: dispatchedCount > 0 ? `partial_before_fatal_error:${failureCategory}` : 'fatal_error',
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
              error_message: failureCategory,
              completed_at: new Date().toISOString(),
            })
            .eq('id', scan.id)
        } else {
          await admin
            .from('scans')
            .update({ error_message: `resumable_after_error: ${failureCategory}` })
            .eq('id', scan.id)
        }
      } catch {
        console.error('[Scan] could not record the failure on the scan row', { requestId })
      }
    }

    // NO RAW ERROR REACHES THE MERCHANT. `Scan execution failed: ${errorMsg}`
    // forwarded provider and database text — including, on the deadline path,
    // an internal stage name that means nothing to a person.
    const timedOut = err instanceof DeadlineExceededError
    diag.outcome = failureCategory
    diag.persisted = dispatchedCount
    return Response.json(
      {
        errorCode: timedOut ? 'SCAN_TIMEOUT' : 'SCAN_FAILED',
        error: timedOut
          ? 'הבדיקה לקחה יותר מדי זמן ולא הושלמה. נסו שוב בעוד רגע.'
          : 'הבדיקה נכשלה. נסו שוב בעוד רגע.',
        errorEn: timedOut
          ? 'The check took too long and did not finish. Please try again in a moment.'
          : 'The check failed. Please try again in a moment.',
        retryable: true,
        requestId,
      },
      { status: timedOut ? 504 : 500 }
    )
  } finally {
    // RELEASED WHATEVER HAPPENED — success, classified failure, deadline or
    // fatal error — so a legitimate later retry is never blocked by a finished
    // operation. Only this request's own claim is released.
    if (claimHeld) {
      diag.claimRelease = await releaseOperationClaim(admin, {
        userId: user.id, operation: 'ranking_scan', scope, requestId,
      })
    }
    logOperation({
      operation: 'ranking_scan',
      stage: diag.stage,
      outcome: diag.outcome,
      durationMs: Date.now() - startedAt,
      requestId,
      userId: diag.userId,
      projectId: diag.projectId,
      targetId: diag.targetId,
      targetCount: diag.targetCount,
      reservationOutcome: diag.reservationOutcome ?? null,
      persisted: diag.persisted ?? null,
      persistenceOutcome: diag.persistenceOutcome ?? null,
      claimOutcome: diag.claimOutcome ?? null,
      claimRelease: diag.claimRelease ?? null,
    })
  }
}
