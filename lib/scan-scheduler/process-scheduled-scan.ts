/**
 * Phase 3 (2nd review correction) — the per-project automatic-scan
 * processing logic, extracted from app/api/schedule/route.ts so it is
 * directly behaviorally testable (the route itself only loops over due
 * projects and calls this function — same pattern already used elsewhere in
 * this repo for route bodies that otherwise can't be unit-tested, e.g.
 * lib/content/article-generation.ts, lib/shopify/billing-return-processing.ts).
 *
 * Occurrence vs. attempt identity, remaining-target resume, and the
 * charging contract (consume exactly what was dispatched, never a blanket
 * release when checks were already dispatched) are all implemented HERE —
 * see the module-level comment in app/api/schedule/route.ts for the full
 * design rationale.
 *
 * 2nd correction — atomic claim, proven not merely asserted:
 *  - The claim is ONE conditional UPDATE...WHERE...RETURNING statement
 *    (Supabase JS/PostgREST compiles a single chained `.update()` call into
 *    exactly one SQL statement server-side — there is no separate
 *    read-then-write round trip a second worker could interleave into).
 *    Supabase JS CAN express this safely, so no bespoke RPC was needed here
 *    (contrast with usage_reservations' reserve_usage, which genuinely needs
 *    a multi-row capacity SUM across the whole ledger, not just this single
 *    row's own columns — a different problem that IS an RPC).
 *  - The WHERE clause requires ALL of: this project's id; the EXPECTED
 *    next_scan_at (the occurrence this worker believes is due); the
 *    EXPECTED scan_retry_count (the attempt this worker believes it's
 *    running); AND the staleness/availability condition on
 *    scan_claimed_at. A worker whose in-memory `project` snapshot is stale
 *    relative to the DB (next_scan_at or scan_retry_count already moved on)
 *    can never win the claim, even if scan_claimed_at alone would allow it —
 *    this is what makes it impossible to "accidentally claim the next
 *    monthly occurrence using a stale occurrence value."
 *  - `.select('id').maybeSingle()` after the update lets the code tell
 *    "zero rows matched" (lost the race / stale snapshot) apart from
 *    "matched and updated" — processing continues ONLY when exactly one row
 *    came back.
 *  - EVERY subsequent write to this project's row in this function (release
 *    on error, advance on completion, retry bookkeping, give-up) is ALSO
 *    conditioned on `scan_claimed_at = <this worker's own claim token>` —
 *    so if the 1-hour lease expired WHILE this worker was still (abnormally)
 *    running and a second worker has since re-claimed the row, this worker's
 *    late writes match zero rows and silently no-op rather than clobbering
 *    the newer worker's state.
 *  - A first-ever scan (next_scan_at was NULL) has its occurrence anchor
 *    FROZEN into next_scan_at as part of the SAME atomic claim update — so a
 *    retry of that same occurrence (which re-reads the project row fresh)
 *    sees a real, stable value instead of recomputing a new now() each time.
 *
 * This proves the FakeAdmin-simulated CONTRACT (conditional-update
 * semantics, exactly matching real PostgREST/Postgres UPDATE...WHERE...
 * RETURNING row-matching behavior) and this function's correct wiring of
 * it — it does NOT by itself prove true concurrent-transaction behavior
 * under real parallel Postgres connections/row locks, which requires a live
 * database and is out of reach in this sandbox. See the final report for
 * exactly what still needs a real Postgres/Supabase staging environment.
 */

import { runScan as realRunScan } from '@/lib/scanner'
import { calculateNextScanDate } from '@/lib/utils'
import { getUserEntitlement } from '@/lib/subscription'
import { resolveCurrentUsagePeriod } from '@/lib/billing/usage-period'
import { reserveUsage, finalizeUsageReservation } from '@/lib/billing/usage-reservations'

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Admin = any
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ProjectRow = any

export const MAX_SCAN_RETRIES = 3
const CLAIM_STALE_MS = 60 * 60 * 1000 // 1 hour — a claim older than this is treated as abandoned (crashed run)

export interface ProcessScheduledScanDeps {
  /** Injectable so tests never hit the real Serper-backed scanner. */
  runScanFn?: typeof realRunScan
  now?: Date
}

export type ProcessScheduledScanOutcome =
  | { status: 'skipped'; reason: 'already_claimed' | 'in_progress_elsewhere' | 'already_completed' | 'no_active_targets' | 'superseded' }
  | { status: 'quota_exceeded' }
  | { status: 'completed'; completed: number; failed: number }
  | { status: 'will_retry'; error: string }
  | { status: 'failed_max_retries'; error: string }
  | { status: 'error'; error: string }

/**
 * Processes ONE project's due automatic scan occurrence (claim, resume-or-
 * create the scans row, reserve only the remaining targets, dispatch,
 * finalize/retry). Never throws for an expected failure mode — every error
 * path is caught and returns a typed outcome, matching the route's own
 * per-project try/catch (a throw here would only happen for a genuinely
 * unexpected bug, and is deliberately allowed to propagate so the route's
 * own catch — inlined here as this function's internal catch — records it).
 */
export async function processScheduledScanForProject(
  admin: Admin,
  project: ProjectRow,
  deps: ProcessScheduledScanDeps = {},
): Promise<ProcessScheduledScanOutcome> {
  const runScanFn = deps.runScanFn ?? realRunScan
  const now = deps.now ?? new Date()
  const staleClaimBefore = new Date(now.getTime() - CLAIM_STALE_MS).toISOString()

  // The occurrence identity for THIS monthly slot — captured before any
  // mutation. Stable across every retry attempt of the same occurrence. When
  // next_scan_at is null (a project that has never been scanned), the
  // occurrence anchor is frozen into next_scan_at atomically as part of the
  // claim below, so it becomes a REAL stored value a retry can compare
  // against — never recomputed fresh on each retry.
  const occurrenceAnchor = project.next_scan_at ?? now.toISOString()
  // The ATTEMPT identity — distinct per retry, so a retry NEVER reuses an
  // idempotency key whose reservation has already been finalized.
  const attemptNumber = project.scan_retry_count ?? 0
  const idempotencyKey = `scan:${project.id}:${occurrenceAnchor}:attempt${attemptNumber}`
  // This worker's own claim token — every subsequent write to this
  // project's row is conditioned on scan_claimed_at STILL equalling this
  // exact value, so a stale (post-lease-expiry) worker can never clobber a
  // newer worker's state.
  const claimToken = now.toISOString()
  let reservationId: string | null = null
  let reservationToken: string | null = null
  let dispatchedCount = 0
  let scanId: string | null = null

  /** Every project-row write in this function is guarded by `scan_claimed_at
   *  = claimToken` — if a newer worker has since re-claimed, this resolves
   *  to zero affected rows (a safe no-op), never overwriting newer state. */
  const guardedProjectUpdate = (payload: Record<string, unknown>) =>
    admin.from('projects').update(payload).eq('id', project.id).eq('scan_claimed_at', claimToken)

  try {
    // ATOMIC claim — ONE conditional UPDATE...WHERE...RETURNING (see file
    // header). The WHERE clause requires: this project id; the EXPECTED
    // next_scan_at (or IS NULL, freezing the anchor into next_scan_at in the
    // SAME write); the EXPECTED scan_retry_count; AND the staleness
    // condition on scan_claimed_at. Any mismatch on ANY of these — not just
    // scan_claimed_at — means this worker's snapshot is stale and it must
    // not proceed.
    let claimQuery = admin
      .from('projects')
      .update({
        scan_claimed_at: claimToken,
        ...(project.next_scan_at == null ? { next_scan_at: occurrenceAnchor } : {}),
      })
      .eq('id', project.id)
      .or(`scan_claimed_at.is.null,scan_claimed_at.lt.${staleClaimBefore}`)
      .eq('scan_retry_count', attemptNumber)
    claimQuery = project.next_scan_at == null
      ? claimQuery.is('next_scan_at', null)
      : claimQuery.eq('next_scan_at', project.next_scan_at)
    const { data: claimed } = await claimQuery.select('id').maybeSingle()
    if (!claimed) {
      return { status: 'skipped', reason: 'already_claimed' }
    }

    // Load active targets
    const { data: targets, error: targetsError } = await admin
      .from('tracking_targets')
      .select('*')
      .eq('project_id', project.id)
      .eq('is_active', true)

    if (targetsError) {
      await guardedProjectUpdate({ scan_claimed_at: null })
      return { status: 'error', error: targetsError.message }
    }

    if (!targets || targets.length === 0) {
      const nextScanAt = calculateNextScanDate(project.scan_frequency, now)
      await guardedProjectUpdate({
        next_scan_at: nextScanAt?.toISOString() ?? null, scan_claimed_at: null, scan_retry_count: 0,
      })
      return { status: 'skipped', reason: 'no_active_targets' }
    }

    // Reuse the SAME underlying scans row across every attempt of this
    // occurrence (never create a second one) — this is what lets a retry
    // know exactly which targets already consumed a check. Scoped to THIS
    // occurrence (matched via idempotency_key on the reservation ledger
    // below, not here) — see "retry target identity" in the file header of
    // the QA suite for why scan_results itself is scoped by scan_id, which
    // is unique per occurrence by construction (a fresh scans row per
    // occurrence, never reused across months).
    const { data: existingScan } = await admin
      .from('scans')
      .select('*')
      .eq('project_id', project.id)
      .eq('status', 'running')
      .eq('triggered_by', 'scheduled')
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    let scanRow = existingScan as { id: string } | null
    if (!scanRow) {
      const { data: newScan, error: scanCreateError } = await admin
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
      if (scanCreateError || !newScan) {
        await guardedProjectUpdate({ scan_claimed_at: null })
        return { status: 'error', error: scanCreateError?.message || 'scan creation failed' }
      }
      scanRow = newScan as { id: string }
    }
    const scan: { id: string } = scanRow
    scanId = scan.id

    // Only targets with NO scan_results row under THIS scan_id yet are
    // "remaining" — scan_id is the occurrence-scoping key: a fresh scans row
    // is created per occurrence (never reused across months — the
    // `.eq('status','running')` lookup above only ever finds an
    // in-progress attempt of the CURRENT occurrence, since a completed
    // occurrence's scans row is 'completed'/'failed', not 'running'), so a
    // target that already has a scan_results row from a PREVIOUS month's
    // scan, or from an unrelated manual scan (a different scan_id entirely),
    // is NEVER treated as "done" here — only a row under this exact scan.id
    // counts. A target that already has one under THIS scan.id already
    // consumed its check and is NEVER re-dispatched.
    const { data: doneRows } = await admin.from('scan_results').select('tracking_target_id').eq('scan_id', scan.id)
    const doneIds = new Set((doneRows ?? []).map((r: { tracking_target_id: string }) => r.tracking_target_id))
    const remainingTargets = targets.filter((t: { id: string }) => !doneIds.has(t.id))

    if (remainingTargets.length === 0) {
      const finalCompleted = doneRows ? doneRows.length : 0
      await admin.from('scans').update({ status: 'completed', completed_targets: finalCompleted, failed_targets: 0, completed_at: now.toISOString() }).eq('id', scan.id)
      const nextScanAt = calculateNextScanDate(project.scan_frequency, now)
      const { data: releasedRows } = await guardedProjectUpdate({
        last_scan_at: now.toISOString(), next_scan_at: nextScanAt?.toISOString() ?? null, scan_claimed_at: null, scan_retry_count: 0,
      }).select('id')
      if (!releasedRows || releasedRows.length === 0) return { status: 'skipped', reason: 'superseded' }
      return { status: 'skipped', reason: 'already_completed' }
    }

    // Reserve BEFORE any provider call, for exactly the REMAINING targets
    // (never the original full batch size on a retry). Admins bypass the
    // ledger entirely but still use the remaining-targets resume logic.
    const entitlement = await getUserEntitlement(project.user_id, admin)
    if (!entitlement.isAdmin) {
      const period = await resolveCurrentUsagePeriod(admin, project.user_id)
      if (!period) {
        await guardedProjectUpdate({ scan_claimed_at: null })
        return { status: 'error', error: 'period_unresolved' }
      }
      const reservation = await reserveUsage(admin, {
        userId: project.user_id, projectId: project.id, usageType: 'google_check', amount: remainingTargets.length,
        periodStart: period.start, periodEnd: period.end,
        limit: entitlement.limits.maxKeywordChecksPerPeriodPerProject,
        idempotencyKey,
      })

      if (reservation.outcome === 'quota_exceeded') {
        const nextScanAt = calculateNextScanDate(project.scan_frequency, now)
        await admin.from('scans').update({
          status: 'quota_exceeded', completed_at: now.toISOString(),
          error_message: 'Monthly Google-check allowance exhausted for this billing period.',
        }).eq('id', scan.id)
        await guardedProjectUpdate({
          next_scan_at: nextScanAt?.toISOString() ?? null, scan_claimed_at: null, scan_retry_count: 0,
        })
        return { status: 'quota_exceeded' }
      }
      if (reservation.outcome === 'already_reserved') {
        await guardedProjectUpdate({ scan_claimed_at: null })
        return { status: 'skipped', reason: 'in_progress_elsewhere' }
      }
      if (reservation.outcome === 'already_consumed') {
        await guardedProjectUpdate({ scan_claimed_at: null })
        return { status: 'skipped', reason: 'already_completed' }
      }
      if (reservation.outcome !== 'reserved') {
        await guardedProjectUpdate({ scan_claimed_at: null })
        return { status: 'error', error: `reservation_failed:${reservation.outcome}` }
      }
      reservationId = reservation.reservationId
      reservationToken = reservation.reservationToken
    }

    for (const target of remainingTargets) {
      const { data: prevResult } = await admin
        .from('scan_results')
        .select('position, found')
        .eq('tracking_target_id', target.id)
        .order('checked_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      const previousPosition = prevResult?.position ?? null

      // dispatchedCount increments IMMEDIATELY before the provider call — a
      // check is "dispatched" (and therefore chargeable, per the reservation
      // contract) the instant the request is made, regardless of what
      // happens afterward. The scan_results row (written next) IS the only
      // durable per-target dispatch record this codebase has — there is no
      // separate ledger of "which targets were sent to the provider" and no
      // provider-side idempotency key Google/Serper accepts, so a target's
      // completeness is judged ENTIRELY by whether its scan_results row
      // exists under this scan_id. That is why the insert's error is now
      // explicitly checked and THROWN on failure (previously silently
      // ignored — see the 2nd review correction note below) rather than
      // silently continuing the loop: a silently-dropped insert would leave
      // this target's dispatch UNRECORDED even though its reservation credit
      // was already consumed via dispatchedCount above, so a LATER retry —
      // finding no scan_results row for it — would treat it as still
      // "remaining" and re-dispatch (and re-consume a credit for) it a
      // second time, a genuine double-charge for a single piece of
      // information. Throwing here instead routes through the SAME
      // catch-block accounting already proven correct elsewhere in this
      // file (finalizes the reservation with the real dispatchedCount,
      // schedules a bounded retry) — it does NOT eliminate the possibility
      // of the provider call being repeated across attempts (a target whose
      // scan_results insert fails is, by construction, indistinguishable
      // from a target whose provider call was never attempted at all — see
      // lib/scan-scheduler/__qa__/process-scheduled-scan.qa.ts's dedicated
      // scenario for this exact window), but it DOES stop that specific
      // failure from being invisible, and correctly bounds it via
      // MAX_SCAN_RETRIES rather than looping forever. This is a deliberate,
      // documented trade-off (occasionally repeating one provider call is
      // preferable to silently losing track of a target for the rest of the
      // billing period) — see the final report for the full rationale.
      dispatchedCount++
      const scanOutput = await runScanFn(target.engine_type, {
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

      const { error: resultInsertError } = await admin.from('scan_results').insert({
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
      // 2nd review correction — this was previously unchecked, silently
      // swallowing a persistence failure (see the comment above this loop).
      if (resultInsertError) {
        throw new Error(`scan_results_insert_failed:${target.id}:${resultInsertError.message}`)
      }
    }

    const { data: allResults } = await admin.from('scan_results').select('error_message').eq('scan_id', scan.id)
    const finalCompleted = (allResults ?? []).filter((r: { error_message: string | null }) => !r.error_message).length
    const finalFailed = (allResults ?? []).filter((r: { error_message: string | null }) => !!r.error_message).length
    const finalStatus = finalFailed > 0 && finalCompleted === 0 ? 'failed' : 'completed'

    await admin.from('scans').update({
      status: finalStatus, completed_targets: finalCompleted, failed_targets: finalFailed, completed_at: new Date().toISOString(),
    }).eq('id', scan.id)

    if (reservationId && reservationToken) {
      await finalizeUsageReservation(admin, { reservationId, userId: project.user_id, reservationToken, consumed: dispatchedCount, relatedRef: scan.id, reason: null })
    }

    const nextScanAt = calculateNextScanDate(project.scan_frequency, now)
    const { data: advancedRows } = await guardedProjectUpdate({
      last_scan_at: now.toISOString(), next_scan_at: nextScanAt?.toISOString() ?? null, scan_claimed_at: null, scan_retry_count: 0,
    }).select('id')
    if (!advancedRows || advancedRows.length === 0) {
      // A newer worker already superseded this claim (lease expired mid-run)
      // — the scan itself is genuinely complete and correctly charged above;
      // only the project-row bookkeeping write was skipped to avoid
      // clobbering whatever the newer worker has since done.
      return { status: 'skipped', reason: 'superseded' }
    }

    return { status: 'completed', completed: finalCompleted, failed: finalFailed }
  } catch (err) {
    const msg = (err as Error).message

    // Review correction — consume exactly what THIS attempt actually
    // dispatched before the exception; NEVER a blanket release when
    // dispatchedCount > 0. Already-consumed usage from this or any earlier
    // attempt is never touched by this call.
    if (reservationId && reservationToken) {
      await finalizeUsageReservation(admin, {
        reservationId, userId: project.user_id, reservationToken, consumed: dispatchedCount,
        relatedRef: scanId, reason: dispatchedCount > 0 ? `partial_before_error:${msg}` : `transient_error:${msg}`,
      })
    }

    const retryCount = attemptNumber + 1
    if (retryCount >= MAX_SCAN_RETRIES) {
      if (scanId) {
        const { data: allResults } = await admin.from('scan_results').select('error_message').eq('scan_id', scanId)
        const finalCompleted = (allResults ?? []).filter((r: { error_message: string | null }) => !r.error_message).length
        const finalFailed = (allResults ?? []).filter((r: { error_message: string | null }) => !!r.error_message).length
        await admin.from('scans').update({
          status: 'failed', completed_targets: finalCompleted, failed_targets: finalFailed,
          completed_at: now.toISOString(), error_message: `Gave up after ${MAX_SCAN_RETRIES} attempts: ${msg}`,
        }).eq('id', scanId)
      }
      const nextScanAt = calculateNextScanDate(project.scan_frequency, now)
      await guardedProjectUpdate({
        next_scan_at: nextScanAt?.toISOString() ?? null, scan_claimed_at: null, scan_retry_count: 0,
      })
      return { status: 'failed_max_retries', error: msg }
    }
    await guardedProjectUpdate({ scan_claimed_at: null, scan_retry_count: retryCount })
    return { status: 'will_retry', error: msg }
  }
}
