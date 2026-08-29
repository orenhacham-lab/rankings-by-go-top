/**
 * Phase 3 (2nd review correction) — retry TARGET IDENTITY audit for the
 * automatic scan scheduler (lib/scan-scheduler/process-scheduled-scan.ts).
 * "Diffed against scan_results" is only safe if every completed target is
 * associated with the EXACT scan occurrence — this file proves that
 * directly, along every dimension the review named:
 *   - occurrence/scan-run id (scan_id) — never confuses a previous month's
 *     or a manual scan's results with the current automatic occurrence;
 *   - keyword/query AND Google Organic vs. Maps — proven structurally, via
 *     tracking_targets.id (each keyword+engine combination is its OWN row,
 *     never shared), not just asserted;
 *   - successful result state — a captured provider ERROR still counts as
 *     "done" (dispatched=consumed, per this codebase's established charging
 *     rule — see lib/billing/__qa__/usage-reservations.qa.ts) and is
 *     correctly NOT re-dispatched; only a target with NO scan_results row at
 *     all (a genuine crash before persistence) is retried;
 *   - the scan_results-insert-fails-after-dispatch window — now THROWN
 *     (2nd correction; was previously silently swallowed) — reproduced
 *     directly, with an explicit statement of whether the provider call is
 *     repeated on the follow-up retry.
 *
 * AI visibility (6 engines: chatgpt, perplexity, gemini, copilot, grok,
 * google_ai_mode) is NOT exercised here because it has NO resumable/
 * diff-based batch path anywhere in this codebase — every
 * POST /api/ai-visibility/runs call is a single, self-contained one-prompt
 * ×one-engine unit (a fresh ai_scan_runs row + a fresh, always-unique
 * idempotency key per call — see the SOURCE section below) with no
 * "which targets are still remaining" concept at all, so the specific retry-
 * target-identity risk this file audits does not apply there by
 * construction. That absence is itself verified below, not merely asserted.
 *
 * Run: npx tsx lib/scan-scheduler/__qa__/phase3-retry-target-identity.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { processScheduledScanForProject } from '../process-scheduled-scan'
import type { ScanOutput } from '@/lib/scanner/types'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const NOW = new Date('2026-08-15T06:00:00Z')
const PERIOD_START = '2026-08-01T00:00:00Z'
const PERIOD_END = '2026-09-01T00:00:00Z'

function admin(tables: Record<string, unknown[]>) {
  return new FakeAdmin({
    projects: [{
      id: 'p1', user_id: 'u1', name: 'Test Project', is_active: true, auto_scan_enabled: true,
      scan_frequency: 'monthly', next_scan_at: '2026-08-15T06:00:00Z',
      scan_claimed_at: null, scan_retry_count: 0,
      target_domain: 'example.com', business_name: 'Example', country: 'IL', language: 'he', city: null, device_type: null,
    }],
    subscriptions: [{ id: 's1', user_id: 'u1', status: 'active', plan_code: 'regular', trial_ends_at: null, current_period_start: PERIOD_START, current_period_end: PERIOD_END, created_at: PERIOD_START }],
    shopify_connections: [], usage_reservations: [], scans: [], scan_results: [], tracking_targets: [],
    ...tables,
  }, {}, () => NOW.getTime())
}
type RunScanFn = (engine: string, input: unknown) => Promise<ScanOutput>
const ok = (position = 3): RunScanFn => async () => ({ found: true, position, resultUrl: null, resultTitle: null, resultAddress: null, error: null })

async function main() {
  console.log('Phase 3 — retry target identity audit QA\n')

  console.log('1) Historical results from a PREVIOUS MONTH\'s automatic scan never cause a target to be skipped')
  {
    const a = admin({
      tracking_targets: [{ id: 't1', project_id: 'p1', keyword: 'k1', engine_type: 'google_search', is_active: true }],
      scans: [{ id: 'old-scan', project_id: 'p1', status: 'completed', triggered_by: 'scheduled', created_at: '2026-07-15T06:00:00Z' }],
      // A result for the SAME tracking_target_id, but under a DIFFERENT
      // (previous month's) scan_id.
      scan_results: [{ id: 'r-old', scan_id: 'old-scan', tracking_target_id: 't1', engine_type: 'google_search', keyword: 'k1', found: true, position: 5, error_message: null, checked_at: '2026-07-15T06:00:00Z' }],
    })
    const outcome = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: NOW, runScanFn: ok() })
    check('the current occurrence completes normally (t1 IS dispatched — the July result never suppressed it)', outcome.status === 'completed' && outcome.completed === 1)
    check('a NEW scan_results row was created for t1 under the NEW (current) scan_id, distinct from the July one', a.tables.scan_results.some((r) => r.tracking_target_id === 't1' && r.scan_id !== 'old-scan'))
    check('the July row is untouched (still exactly one row under old-scan)', a.tables.scan_results.filter((r) => r.scan_id === 'old-scan').length === 1)
  }

  console.log('\n2) Historical results from a PREVIOUS MANUAL scan (triggered_by=manual) never cause a target to be skipped')
  {
    const a = admin({
      tracking_targets: [{ id: 't1', project_id: 'p1', keyword: 'k1', engine_type: 'google_search', is_active: true }],
      scans: [{ id: 'manual-scan', project_id: 'p1', status: 'completed', triggered_by: 'manual', created_at: '2026-08-14T06:00:00Z' }],
      scan_results: [{ id: 'r-manual', scan_id: 'manual-scan', tracking_target_id: 't1', engine_type: 'google_search', keyword: 'k1', found: true, position: 5, error_message: null, checked_at: '2026-08-14T06:00:00Z' }],
    })
    const outcome = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: NOW, runScanFn: ok() })
    check('the automatic occurrence completes normally — a manual scan\'s result for the same target never suppresses it', outcome.status === 'completed' && outcome.completed === 1)
    check('the automatic occurrence created its OWN scans row (never reused the manual one — .eq(triggered_by, "scheduled") excludes it)', a.tables.scans.some((s) => s.triggered_by === 'scheduled'))
    check('the manual scan\'s row is untouched', a.tables.scan_results.filter((r) => r.scan_id === 'manual-scan').length === 1)
  }

  console.log('\n3) Mixed Google Organic + Google Maps targets for the SAME keyword — never conflated, never cross-skipped')
  {
    const a = admin({
      tracking_targets: [
        { id: 't-organic', project_id: 'p1', keyword: 'pizza near me', engine_type: 'google_search', is_active: true },
        { id: 't-maps', project_id: 'p1', keyword: 'pizza near me', engine_type: 'google_maps', is_active: true },
      ],
    })
    const calls: string[] = []
    const trackingFn: RunScanFn = async (engine) => { calls.push(engine); return { found: true, position: 2, resultUrl: null, resultTitle: null, resultAddress: null, error: null } }
    const outcome = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: NOW, runScanFn: trackingFn })
    check('both the Organic and Maps targets for the identical keyword are dispatched — neither is skipped as a "duplicate" of the other', outcome.status === 'completed' && outcome.completed === 2)
    check('runScanFn was called once per engine (organic once, maps once) — never merged/deduped by keyword alone', calls.filter((c) => c === 'google_search').length === 1 && calls.filter((c) => c === 'google_maps').length === 1)
    check('TWO distinct scan_results rows exist, correctly tagged by engine_type', a.tables.scan_results.some((r) => r.tracking_target_id === 't-organic' && r.engine_type === 'google_search') && a.tables.scan_results.some((r) => r.tracking_target_id === 't-maps' && r.engine_type === 'google_maps'))
  }
  console.log('\n3b) A retry after Organic dispatched successfully but Maps crashed — resume dispatches ONLY Maps, never re-dispatches Organic')
  {
    let mapsShouldFail = true
    const a = admin({
      tracking_targets: [
        { id: 't-organic', project_id: 'p1', keyword: 'pizza near me', engine_type: 'google_search', is_active: true },
        { id: 't-maps', project_id: 'p1', keyword: 'pizza near me', engine_type: 'google_maps', is_active: true },
      ],
    })
    const flakyFn: RunScanFn = async (engine) => {
      if (engine === 'google_maps' && mapsShouldFail) throw new Error('maps provider crash')
      return { found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null }
    }
    const first = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: NOW, runScanFn: flakyFn })
    check('first attempt: will_retry (Maps crashed)', first.status === 'will_retry')
    check('Organic\'s result WAS persisted despite the later Maps crash in the same attempt', a.tables.scan_results.some((r) => r.tracking_target_id === 't-organic'))
    check('Maps has NO result yet (the crash happened before its insert)', !a.tables.scan_results.some((r) => r.tracking_target_id === 't-maps'))

    mapsShouldFail = false
    const calls: string[] = []
    const trackingFn: RunScanFn = async (engine) => { calls.push(engine); return { found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null } }
    const second = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: new Date(NOW.getTime() + 60_000), runScanFn: trackingFn })
    check('second attempt: completed', second.status === 'completed')
    check('the retry dispatched ONLY Maps — Organic was never re-dispatched', calls.length === 1 && calls[0] === 'google_maps')
  }

  console.log('\n4) "Successful result state" — a target whose PREVIOUS attempt captured a provider-level ERROR (not a crash) is correctly NOT re-dispatched (dispatched = consumed, per this codebase\'s established charging rule)')
  {
    const a = admin({
      tracking_targets: [{ id: 't1', project_id: 'p1', keyword: 'k1', engine_type: 'google_search', is_active: true }],
    })
    const errorFn: RunScanFn = async () => ({ found: false, position: null, resultUrl: null, resultTitle: null, resultAddress: null, error: 'not_found' })
    const first = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: NOW, runScanFn: errorFn })
    check('first attempt completes (a captured provider error is a VALID complete result, not a crash)', first.status === 'completed')
    check('exactly one scan_results row exists, with the error captured', a.tables.scan_results.length === 1 && a.tables.scan_results[0].error_message === 'not_found')
  }
  console.log('\n4b) Directly proves the "already has a scan_results row for THIS occurrence, never re-dispatch" branch — a fresh retry attempt of the SAME occurrence, where the only target already captured an error, must short-circuit WITHOUT ever calling runScanFn again')
  {
    const a = admin({
      tracking_targets: [{ id: 't1', project_id: 'p1', keyword: 'k1', engine_type: 'google_search', is_active: true }],
      // A 'running' scan for THIS occurrence, with t1 already having a
      // captured-error result under it (simulating: a prior attempt fully
      // processed t1, but crashed on SOME OTHER target before the project
      // row's bookkeeping could close out the occurrence — will_retry).
      scans: [{ id: 'scan-1', project_id: 'p1', user_id: 'u1', status: 'running', triggered_by: 'scheduled', total_targets: 1, completed_targets: 0, failed_targets: 0, started_at: NOW.toISOString() }],
      scan_results: [{ id: 'r1', scan_id: 'scan-1', tracking_target_id: 't1', engine_type: 'google_search', keyword: 'k1', found: false, position: null, error_message: 'not_found', checked_at: NOW.toISOString() }],
    })
    const projectSnapshot = { ...a.tables.projects[0] } // attempt 0 — a resumed call for the SAME still-running occurrence
    const spyFn: RunScanFn = async () => { throw new Error('should never be called — t1 already has a scan_results row under THIS scan_id') }
    const outcome = await processScheduledScanForProject(a as unknown as Admin, projectSnapshot, { now: new Date(NOW.getTime() + 60_000), runScanFn: spyFn })
    check('short-circuits to already_completed — the captured-error target is correctly treated as done, runScanFn is NEVER called', outcome.status === 'skipped' && (outcome as { reason: string }).reason === 'already_completed')
  }

  console.log('\n5) The scan_results-insert-fails-after-dispatch window — 2nd correction: now explicitly thrown, not silently swallowed')
  {
    const a = admin({
      tracking_targets: [{ id: 't1', project_id: 'p1', keyword: 'k1', engine_type: 'google_search', is_active: true }],
    })
    ;(a as unknown as { hooks: Record<string, unknown> }).hooks = { scan_results: { insert: () => ({ message: 'db write failed' }) } }
    const outcome = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: NOW, runScanFn: ok() })
    check('the insert failure is no longer silently swallowed — it surfaces as will_retry (bounded), not a fabricated "completed"', outcome.status === 'will_retry')
    check('no scan_results row exists for the target whose insert failed (never a phantom "success" the DB doesn\'t actually have)', a.tables.scan_results.length === 0)
    const res = a.tables.usage_reservations[0] as Record<string, unknown>
    check('the dispatched (but unsaved) check is STILL correctly consumed in the reservation ledger — dispatchedCount=1 was real, the provider WAS called', res.consumed_amount === 1)
    console.log('  EXPLICIT ANSWER (per review requirement): YES, the provider call for this specific target IS intentionally repeated on the next attempt — a target with no scan_results row is indistinguishable from "never attempted" using only this codebase\'s existing records, and there is no provider-side idempotency key available to make that specific retry itself a no-op. This is a deliberate, accepted trade-off (see the file-header comment in lib/scan-scheduler/process-scheduled-scan.ts and the final report) — the alternative (treating an unsaved dispatch as "done anyway") would silently and permanently skip that target for the rest of the billing period, which is worse.')
  }
  console.log('\n5b) After the insert-failure retry, the SAME target genuinely CAN be re-dispatched and successfully persisted (confirms it is not permanently stuck)')
  {
    const a = admin({
      tracking_targets: [{ id: 't1', project_id: 'p1', keyword: 'k1', engine_type: 'google_search', is_active: true }],
    })
    ;(a as unknown as { hooks: Record<string, unknown> }).hooks = { scan_results: { insert: () => ({ message: 'db write failed' }) } }
    const first = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: NOW, runScanFn: ok() })
    check('first attempt: will_retry', first.status === 'will_retry')
    ;(a as unknown as { hooks: Record<string, unknown> }).hooks = {}
    const calls: string[] = []
    const trackingFn: RunScanFn = async (engine) => { calls.push(engine); return { found: true, position: 1, resultUrl: null, resultTitle: null, resultAddress: null, error: null } }
    const second = await processScheduledScanForProject(a as unknown as Admin, a.tables.projects[0], { now: new Date(NOW.getTime() + 60_000), runScanFn: trackingFn })
    check('second attempt: completed, and DID re-dispatch t1 (the previously-lost check)', second.status === 'completed' && calls.length === 1)
    check('exactly one scan_results row now exists', a.tables.scan_results.length === 1)
  }

  console.log('\nSOURCE) AI visibility (/api/ai-visibility/runs) has NO resumable/diff-based batch path — the retry-target-identity risk this file audits does not apply there')
  {
    const src = read('app/api/ai-visibility/runs/route.ts')
    check('every request is scoped to exactly ONE promptId + ONE engine (never a batch/array of targets)', /promptId, engine \} = body/.test(src))
    check('a fresh ai_scan_runs row is created for EVERY call — never reused/resumed across requests', /triggered_by: 'manual'/.test(src) && !/eq\('status', 'running'\)/.test(src))
    check('the idempotency key includes Date.now() — deliberately UNIQUE per call, never stable across retries (no reservation-reuse-across-attempts concept exists here at all)', /idempotencyKey: `manual:\$\{projectId\}:\$\{promptId\}:\$\{engine\}:\$\{Date\.now\(\)\}`/.test(src))
    check('there is no "remaining"/"doneIds"/scan_results-style diff logic anywhere in this route', !/remaining/i.test(src) && !/doneIds/.test(src))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
