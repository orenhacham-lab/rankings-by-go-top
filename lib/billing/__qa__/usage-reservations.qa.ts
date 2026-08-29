/**
 * Phase 3 — atomic usage-reservation ledger: concurrency, idempotency,
 * atomic article finalization, Google/AI partial consumption. Exercises the
 * FakeAdmin.rpc() simulation of the real SQL RPCs (see
 * lib/__qa__/_fake-admin.ts's header comment for what this does and does
 * NOT prove about true concurrent-transaction safety). Run:
 *   npx tsx lib/billing/__qa__/usage-reservations.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { reserveUsage, finalizeUsageReservation, releaseUsageReservation, finalizeArticleGeneration } from '../usage-reservations'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const PERIOD_START = new Date('2026-08-01T00:00:00Z')
const PERIOD_END = new Date('2026-09-01T00:00:00Z')

function baseAdmin(nowMs: number, extra: Record<string, unknown[]> = {}) {
  return new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }], usage_reservations: [], generated_articles: [], ...extra }, {}, () => nowMs)
}

async function main() {
  console.log('Phase 3 — usage-reservation ledger QA\n')

  console.log('1) Reject before dispatch: quota already exhausted — reserve returns quota_exceeded, no reservation created')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), {
      usage_reservations: [{ id: 'r0', user_id: 'u1', project_id: null, usage_type: 'article', reserved_amount: 4, consumed_amount: 4, released_amount: 0, period_start: PERIOD_START.toISOString(), period_end: PERIOD_END.toISOString(), idempotency_key: 'topic:already-full', status: 'consumed', created_at: '2026-08-01T00:00:00Z' }],
    })
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:new-one' })
    check('quota_exceeded', r.outcome === 'quota_exceeded')
  }

  console.log('\n2) Concurrent reservation attempts for the same account never together exceed the limit')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    // limit=4: simulate 6 "simultaneous" generation attempts for 6 DIFFERENT
    // topics (distinct idempotency keys) racing for the same account-wide pool.
    const attempts = await Promise.all(
      Array.from({ length: 6 }, (_, i) =>
        reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: `topic:race-${i}` })),
    )
    const granted = attempts.filter((a) => a.outcome === 'reserved').length
    const denied = attempts.filter((a) => a.outcome === 'quota_exceeded').length
    check('exactly 4 granted (never exceeds the limit)', granted === 4, `granted=${granted}`)
    check('exactly 2 denied', denied === 2, `denied=${denied}`)
  }

  console.log('\n3) Idempotency key — a retry of the SAME logical request reuses the reservation, never double-reserves')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const first = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:t1' })
    const retry = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:t1' })
    check('first reserved', first.outcome === 'reserved')
    check('retry sees already_reserved (SAME reservation id, not a new one)', retry.outcome === 'already_reserved' && retry.reservationId === (first as { reservationId: string }).reservationId)
    check('only ONE row exists in the ledger for this key', admin.tables.usage_reservations.filter((r) => r.idempotency_key === 'topic:t1').length === 1)
  }

  console.log('\n4) A consumed request retried by the client — returns the EXISTING article outcome, never regenerates, never double-consumes')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:t2' })
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    const finalize = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: { project_id: 'p1', topic_id: 't2', title: 'Hello', meta_title: null, meta_description: null, excerpt: null, content_html: '<p>hi</p>', content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'hello' } })
    check('article created', finalize.outcome === 'consumed')
    const articleId = (finalize as { articleId: string }).articleId

    // Client retries the SAME logical request (e.g. a network timeout after success).
    const retry = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:t2' })
    check('retry sees already_consumed, not a fresh reservation', retry.outcome === 'already_consumed')
    check('the SAME article id is returned', retry.outcome === 'already_consumed' && retry.articleId === articleId)
    check('exactly ONE article row exists (no duplicate)', admin.tables.generated_articles.length === 1)
    check('exactly ONE credit consumed (not two)', admin.tables.usage_reservations.find((r) => r.idempotency_key === 'topic:t2')?.consumed_amount === 1)
  }

  console.log('\n5) Atomic finalization — Gemini/audit/DB failure before persistence releases the reservation, no article, no consumed credit')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:t3' })
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    // Simulate a Gemini/audit failure: the caller never even attempts finalize — it releases directly.
    const released = await releaseUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, reason: 'generation_failed:audit_rejected' })
    check('released', released.outcome === 'released')
    check('no article was created', admin.tables.generated_articles.length === 0)
    check('reservation status is released, not consumed', admin.tables.usage_reservations.find((r) => r.id === reservationId)?.status === 'released')
    check('the slot is available again for a new attempt', admin.tables.usage_reservations.find((r) => r.id === reservationId)?.released_amount === 1)
  }

  console.log('\n6) Atomic finalization — a slug conflict rolls back the WHOLE attempt (no article, reservation stays reserved for retry)')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), {
      generated_articles: [{ id: 'existing', slug: 'taken-slug' }],
    })
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:t4' })
    const { reservationId, reservationToken } = res as { reservationId: string; reservationToken: string }
    const attempt1 = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: { project_id: 'p1', topic_id: 't4', title: 'X', meta_title: null, meta_description: null, excerpt: null, content_html: null, content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'taken-slug' } })
    check('slug_conflict', attempt1.outcome === 'slug_conflict')
    check('reservation is STILL reserved (not consumed, not released) — safe to retry', admin.tables.usage_reservations.find((r) => r.id === reservationId)?.status === 'reserved')
    const attempt2 = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: { project_id: 'p1', topic_id: 't4', title: 'X', meta_title: null, meta_description: null, excerpt: null, content_html: null, content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'taken-slug-2' } })
    check('retry with a new slug succeeds', attempt2.outcome === 'consumed')
    check('exactly one credit consumed total', admin.tables.usage_reservations.find((r) => r.id === reservationId)?.consumed_amount === 1)
  }

  console.log('\n7) Repeated delivery of the same job (e.g. a queue redelivering the same message) — idempotent, never double-consumes')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const idemKey = 'topic:t5'
    const runOnce = async () => {
      const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: idemKey })
      if (r.outcome !== 'reserved') return r
      return finalizeArticleGeneration(admin as unknown as Admin, { reservationId: r.reservationId, userId: 'u1', reservationToken: r.reservationToken, article: { project_id: 'p1', topic_id: 't5', title: 'X', meta_title: null, meta_description: null, excerpt: null, content_html: null, content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'job-slug' } })
    }
    const first = await runOnce()
    const redelivery1 = await runOnce()
    const redelivery2 = await runOnce()
    check('first run consumes', first.outcome === 'consumed')
    check('redelivery 1 is a safe no-op (already_consumed)', redelivery1.outcome === 'already_consumed')
    check('redelivery 2 is a safe no-op (already_consumed)', redelivery2.outcome === 'already_consumed')
    check('exactly one article exists', admin.tables.generated_articles.length === 1)
  }

  console.log('\n8) An abandoned reservation (crashed job, never finalized/released) self-expires after 30 minutes and can be safely retried')
  {
    const t0 = Date.parse('2026-08-15T00:00:00Z')
    const admin = baseAdmin(t0)
    const res = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: 'topic:abandoned' })
    check('reserved (uses the only slot, limit=1)', res.outcome === 'reserved')

    // 10 minutes later — still within the TTL, retry sees already_reserved,
    // and the slot is NOT available for a different attempt.
    const adminAt10 = baseAdmin(t0 + 10 * 60_000, admin.tables)
    const other = await reserveUsage(adminAt10 as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: 'topic:different-attempt' })
    check('10 min later: a DIFFERENT attempt is still blocked (quota_exceeded — the abandoned reservation still holds the only slot)', other.outcome === 'quota_exceeded')

    // 31 minutes later — past the TTL. The SAME key retried is safely
    // reactivated (reuses the row); a NEW key can also now get the slot? No —
    // only ONE slot exists (limit=1) and the abandoned one is what frees it,
    // via ITS OWN retry (not a different key) per the documented recovery path.
    const adminAt31 = baseAdmin(t0 + 31 * 60_000, admin.tables)
    const recovered = await reserveUsage(adminAt31 as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: 'topic:abandoned' })
    check('31 min later: the SAME key can be safely re-reserved (reactivated, not a duplicate insert)', recovered.outcome === 'reserved')
    check('still exactly ONE row for this key (reused, not duplicated)', adminAt31.tables.usage_reservations.filter((r) => r.idempotency_key === 'topic:abandoned').length === 1)
  }

  console.log('\n9) Google/AI charging rule — quota reservation fails before any provider call: consume zero')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), {
      usage_reservations: [{ id: 'g0', user_id: 'u1', project_id: 'p1', usage_type: 'google_check', reserved_amount: 50, consumed_amount: 50, released_amount: 0, period_start: PERIOD_START.toISOString(), period_end: PERIOD_END.toISOString(), idempotency_key: 'manual:p1:full', status: 'consumed', created_at: '2026-08-01T00:00:00Z' }],
    })
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 10, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:next' })
    check('quota_exceeded — no provider call was ever dispatched by the caller (nothing to release)', r.outcome === 'quota_exceeded')
  }

  console.log('\n10) Google/AI charging rule — no provider request dispatched due to an internal error AFTER reserving: release, consume zero')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 5, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:validation-fail' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    // e.g. targets failed to load AFTER the reservation — no Serper call ever made.
    const fin = await finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 0, relatedRef: null, reason: 'targets_load_failed' })
    check('released', fin.outcome === 'released')
    check('zero consumed', admin.tables.usage_reservations.find((row) => row.id === reservationId)?.consumed_amount === 0)
  }

  console.log('\n11) Google/AI charging rule — a valid "not found" result still counts as consumed (the provider call WAS dispatched)')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:one-check' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    // The scan ran (dispatched=1) but the keyword simply wasn't found in results — still consumed.
    const fin = await finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 1, relatedRef: 'scan-1', reason: null })
    check('finalized as fully consumed', fin.outcome === 'finalized')
    check('consumed_amount is 1 (the dispatched check counts, even though found=false)', admin.tables.usage_reservations.find((row) => row.id === reservationId)?.consumed_amount === 1)
    check('status is consumed (not partially_consumed, since 1/1 dispatched)', admin.tables.usage_reservations.find((row) => row.id === reservationId)?.status === 'consumed')
  }

  console.log('\n12) Google/AI charging rule — partial batch: consume only what was dispatched, release the rest')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 10, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:batch-10' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    // A batch of 10 was reserved but only 6 targets were actually scanned before the loop ended.
    const fin = await finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 6, relatedRef: 'scan-batch', reason: 'partial_dispatch' })
    check('finalized', fin.outcome === 'finalized')
    const row = admin.tables.usage_reservations.find((r2) => r2.id === reservationId)
    check('consumed_amount is 6 (exactly what was dispatched)', row?.consumed_amount === 6)
    check('released_amount is 4 (the unused reserved amount)', row?.released_amount === 4)
    check('status is partially_consumed', row?.status === 'partially_consumed')

    // The 4 released units must be immediately available again for the SAME period.
    const next = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 4, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:next-4' })
    check('the released 4 units are available for a new reservation', next.outcome === 'reserved')
    const overBy1 = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:over' })
    check('but no more than that (10 total reserved/consumed matches the limit boundary correctly: 6 consumed + 4 consumed = 10, next 1 exceeds the 50 cap only if limit were 10 — here limit=50 so this should still succeed', overBy1.outcome === 'reserved')
  }

  console.log('\n13) Internal retries must not consume the same logical provider call twice unless a NEW external call is actually made')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const key = 'scan:p1:2026-09-01T06:00:00.000Z' // an automatic-scan occurrence anchor
    const r1 = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 20, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: key })
    check('first attempt reserved', r1.outcome === 'reserved')
    // A transient failure — internal retry of the SAME occurrence, same key, no provider call made yet.
    const r2 = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 20, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: key })
    check('internal retry of the SAME occurrence reuses the SAME reservation (already_reserved)', r2.outcome === 'already_reserved' && r2.reservationId === (r1 as { reservationId: string }).reservationId)
    check('only one reservation row exists — no double reservation from the retry', admin.tables.usage_reservations.filter((row) => row.idempotency_key === key).length === 1)
  }

  console.log('\n14) Trial article usage — exactly 1 lifetime article, enforced by the SAME reservation mechanism as paid plans')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const trialStart = new Date('2026-08-10T00:00:00Z')
    const trialEnd = new Date('2026-08-17T00:00:00Z') // 7-day trial
    const first = await reserveUsage(admin as unknown as Admin, { userId: 'trial-u', projectId: null, usageType: 'article', amount: 1, periodStart: trialStart, periodEnd: trialEnd, limit: 1, idempotencyKey: 'topic:trial-article-1' })
    check('the trial\'s one article is grantable', first.outcome === 'reserved')
    const firstReserved = first as { reservationId: string; reservationToken: string }
    const fin = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId: firstReserved.reservationId, userId: 'trial-u', reservationToken: firstReserved.reservationToken, article: { project_id: 'p1', topic_id: 'trial-article-1', title: 'Trial article', meta_title: null, meta_description: null, excerpt: null, content_html: '<p>hi</p>', content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'trial-article' } })
    check('the trial article is created', fin.outcome === 'consumed')
    // A second, DIFFERENT topic during the same trial period must be denied.
    const second = await reserveUsage(admin as unknown as Admin, { userId: 'trial-u', projectId: null, usageType: 'article', amount: 1, periodStart: trialStart, periodEnd: trialEnd, limit: 1, idempotencyKey: 'topic:trial-article-2' })
    check('a second trial article in the same (one-time) trial period is denied', second.outcome === 'quota_exceeded')
    // Editing/scheduling/publishing the trial article never touches the ledger at all — no reservation call exists for those actions anywhere in the codebase (proven structurally: this ledger is only ever invoked from generateArticleForTopic, never from an edit/schedule/publish route).
  }

  console.log('\n15) 3rd review correction — reused row keeps the same row ID but receives a fresh reservation_token; TTL is computed from reserved_at, never the original row\'s created_at')
  {
    const t0 = Date.parse('2026-08-15T00:00:00Z')
    const admin = baseAdmin(t0)
    const key = 'topic:reused-row'
    const original = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    check('originally reserved', original.outcome === 'reserved')
    const staleReservationId = (original as { reservationId: string }).reservationId
    const staleToken = (original as { reservationToken: string }).reservationToken
    const originalRow = admin.tables.usage_reservations.find((r) => r.id === staleReservationId)
    // Snapshot primitive values now — originalRow is a REFERENCE into the
    // same in-memory table adminAt31 below shares, so its own fields will
    // reflect the post-reuse state too; only these captured copies stay fixed.
    const originalCreatedAt = originalRow?.created_at
    const originalReservedAt = originalRow?.reserved_at

    // 31 minutes later — the SAME idempotency key is retried by a recovering
    // worker (the original caller is presumed abandoned/crashed). This
    // EXPIRES and REUSES the SAME row (same id), granting a fresh token.
    const adminAt31 = baseAdmin(t0 + 31 * 60_000, admin.tables)
    const reused = await reserveUsage(adminAt31 as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    check('#1 the SAME row id is reused for the new reservation', reused.outcome === 'reserved' && (reused as { reservationId: string }).reservationId === staleReservationId)
    const freshToken = (reused as { reservationToken: string }).reservationToken
    check('#1 but reservation_token has CHANGED on reuse — this is the identity guard, not a timestamp', freshToken !== staleToken)
    const reusedRow = adminAt31.tables.usage_reservations.find((r) => r.id === staleReservationId)
    check('created_at is UNCHANGED across reuse (pure row-creation audit trail)', reusedRow?.created_at === originalCreatedAt)
    check('reserved_at WAS updated on reuse (the TTL-relevant timestamp)', reusedRow?.reserved_at !== originalReservedAt)

    // #7 — 10 minutes after the REUSE (so 41 minutes after the ORIGINAL row's
    // created_at, which would already be >30min "expired" if TTL wrongly used
    // created_at) — a further retry of the SAME key must still see
    // already_reserved, proving TTL is computed from reserved_at only.
    const adminAt41 = baseAdmin(t0 + 41 * 60_000, admin.tables)
    const stillLive = await reserveUsage(adminAt41 as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    check('#7 41 min after created_at (but only 10 min after reserved_at) is still NOT expired — TTL uses reserved_at, not created_at', stillLive.outcome === 'already_reserved')
  }

  console.log('\n16) A stale (superseded) token cannot finalize, cannot release, and cannot finalize an article — and does not modify the row')
  {
    const t0 = Date.parse('2026-08-15T00:00:00Z')
    const admin = baseAdmin(t0)
    const articleKey = 'topic:stale-token-article'
    const original = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: articleKey })
    const staleReservationId = (original as { reservationId: string }).reservationId
    const staleToken = (original as { reservationToken: string }).reservationToken

    const adminAt31 = baseAdmin(t0 + 31 * 60_000, admin.tables)
    const reused = await reserveUsage(adminAt31 as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: articleKey })
    const freshToken = (reused as { reservationToken: string }).reservationToken

    // #4 — old token cannot finalize an article.
    const staleArticleFinalize = await finalizeArticleGeneration(adminAt31 as unknown as Admin, {
      reservationId: staleReservationId, userId: 'u1', reservationToken: staleToken,
      article: { project_id: 'p1', topic_id: 'stale', title: 'Stale attempt', meta_title: null, meta_description: null, excerpt: null, content_html: null, content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'stale-attempt' },
    })
    check('#4 old token cannot finalize an article — not_reserved', staleArticleFinalize.outcome === 'not_reserved')
    check('no article was created by the stale-token attempt', adminAt31.tables.generated_articles.length === 0)
    check('the row is untouched by the stale finalize attempt — still reserved under the fresh token', adminAt31.tables.usage_reservations.find((r) => r.id === staleReservationId)?.status === 'reserved')

    // Separate google_check reservation to exercise finalize_usage_reservation / release_usage_reservation.
    const manualKey = 'manual:p1:stale-token'
    const manualOriginal = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: manualKey })
    const { reservationId: manualId, reservationToken: manualStaleToken } = manualOriginal as { reservationId: string; reservationToken: string }
    const manualReused = await reserveUsage(adminAt31 as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: manualKey })
    const { reservationToken: manualFreshToken } = manualReused as { reservationToken: string }

    // #2 — old token cannot finalize.
    const staleFinalize = await finalizeUsageReservation(adminAt31 as unknown as Admin, { reservationId: manualId, userId: 'u1', reservationToken: manualStaleToken, consumed: 1, relatedRef: 'stale-scan', reason: null })
    check('#2 old token cannot finalize — not_reserved', staleFinalize.outcome === 'not_reserved')
    check('the row was NOT touched by the stale finalize — still reserved under the fresh token', adminAt31.tables.usage_reservations.find((r) => r.id === manualId)?.status === 'reserved')

    // #3 — old token cannot release.
    const staleRelease = await releaseUsageReservation(adminAt31 as unknown as Admin, { reservationId: manualId, userId: 'u1', reservationToken: manualStaleToken, reason: 'stale_cleanup_attempt' })
    check('#3 old token cannot release — not_reserved', staleRelease.outcome === 'not_reserved')
    check('the fresh reservation is still completely intact after both stale attempts', adminAt31.tables.usage_reservations.find((r) => r.id === manualId)?.status === 'reserved')

    // The recovering worker, holding the CURRENT token, still succeeds normally.
    const freshFinalize = await finalizeUsageReservation(adminAt31 as unknown as Admin, { reservationId: manualId, userId: 'u1', reservationToken: manualFreshToken, consumed: 1, relatedRef: 'fresh-scan', reason: null })
    check('the recovering worker (current token) finalizes normally', freshFinalize.outcome === 'finalized')
    const freshArticleFinalize = await finalizeArticleGeneration(adminAt31 as unknown as Admin, {
      reservationId: staleReservationId, userId: 'u1', reservationToken: freshToken,
      article: { project_id: 'p1', topic_id: 'stale', title: 'Recovered attempt', meta_title: null, meta_description: null, excerpt: null, content_html: null, content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'recovered-attempt' },
    })
    check('the recovering worker (current token) finalizes the article normally', freshArticleFinalize.outcome === 'consumed')
  }

  console.log('\n17) #5 The current token can finalize exactly once — a second finalize attempt with the SAME (now-consumed) token is rejected')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:finalize-once' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const first = await finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 1, relatedRef: 'scan-once', reason: null })
    check('first finalize with the current token succeeds', first.outcome === 'finalized')
    const second = await finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 1, relatedRef: 'scan-once-again', reason: null })
    check('#5 a SECOND finalize with the SAME token is rejected — status is no longer \'reserved\' (finalizes exactly once)', second.outcome === 'not_reserved')
    check('consumed_amount is still 1 (never double-consumed)', admin.tables.usage_reservations.find((row) => row.id === reservationId)?.consumed_amount === 1)
  }

  console.log('\n18) #6 Two concurrent workers holding the SAME grant cannot both consume it — exactly one wins')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:concurrent-workers' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    // Two workers race to finalize the identical grant (same reservationId +
    // same reservationToken) — e.g. a duplicate job delivery processed by two
    // pool workers at once. Fired concurrently via Promise.all.
    const [workerA, workerB] = await Promise.all([
      finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 1, relatedRef: 'worker-a', reason: null }),
      finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 1, relatedRef: 'worker-b', reason: null }),
    ])
    const finalizedCount = [workerA, workerB].filter((o) => o.outcome === 'finalized').length
    const rejectedCount = [workerA, workerB].filter((o) => o.outcome === 'not_reserved').length
    check('#6 exactly ONE of the two concurrent workers wins (finalized)', finalizedCount === 1, `finalized=${finalizedCount}`)
    check('#6 exactly ONE of the two concurrent workers is rejected (not_reserved)', rejectedCount === 1, `rejected=${rejectedCount}`)
    check('consumed_amount reflects exactly one consumption, never two', admin.tables.usage_reservations.find((row) => row.id === reservationId)?.consumed_amount === 1)
  }

  console.log('\n19) #8 Tokens survive the TypeScript/Supabase wrapper byte-for-byte unchanged — never parsed or transformed')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    // Call the RPC directly (bypassing the wrapper) to capture the RAW token
    // exactly as the "database" would return it.
    const raw = await admin.rpc('reserve_usage', {
      p_user_id: 'u1', p_project_id: null, p_usage_type: 'article', p_amount: 1,
      p_period_start: PERIOD_START.toISOString(), p_period_end: PERIOD_END.toISOString(),
      p_limit: 1, p_idempotency_key: 'topic:wrapper-passthrough',
    })
    const rawRow = Array.isArray(raw.data) ? raw.data[0] : raw.data
    const rawToken = rawRow.reservation_token as string

    // Now go through the actual wrapper for the SAME idempotency key — it
    // must report the identical raw token unchanged (already_reserved echoes
    // the current token verbatim).
    const wrapped = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: 'topic:wrapper-passthrough' })
    check('#8 the wrapper returns the exact same token the raw RPC produced — no reformatting/casing/trim', wrapped.outcome === 'already_reserved' && (wrapped as { reservationToken: string }).reservationToken === rawToken)

    // Thread that exact wrapper-returned token into finalizeUsageReservation
    // and confirm it reaches the RPC call as p_reservation_token unchanged —
    // proven by the finalize actually succeeding (a mutated token would be
    // rejected as stale by the FakeAdmin's exact-equality guard).
    const finalize = await finalizeUsageReservation(admin as unknown as Admin, {
      reservationId: rawRow.reservation_id as string, userId: 'u1',
      reservationToken: (wrapped as { reservationToken: string }).reservationToken,
      consumed: 0, relatedRef: null, reason: 'wrapper_passthrough_check',
    })
    check('#8 the wrapper-returned token, threaded straight back through, is accepted byte-for-byte by the RPC guard', finalize.outcome === 'released')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
