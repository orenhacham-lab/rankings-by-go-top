/**
 * Corrective migration (20260829020000_fix_finalize_lost_update_race.sql) —
 * regression coverage for a SECOND production-blocking bug reproduced
 * against a real, dedicated staging PostgreSQL database: a genuine
 * check-then-act lost-update race in finalize_article_generation (and the
 * same flawed pattern audited and fixed in finalize_usage_reservation).
 *
 * This is a class of bug that ONLY a live, multi-connection PostgreSQL
 * server can genuinely prove or disprove (row-level locking, WHERE-clause
 * re-evaluation on lock release, MVCC visibility) — lib/__qa__/_fake-admin.ts
 * runs every RPC branch synchronously with no `await` inside it, so
 * Promise.all() there can never truly interleave two calls. Per the standing
 * instruction for this fix: do not treat any FakeAdmin-based concurrency
 * test as proof this class of bug is fixed. Section 1 below is the actual
 * proof, via static analysis of the real migration SQL text (FOR UPDATE
 * presence and position, guarded final UPDATE predicates, ROW_COUNT
 * verification, the project-id guard). Section 2 covers the parts of the
 * required regression list that ARE genuinely meaningful to prove via the
 * FakeAdmin wrapper contract — sequential (non-racing) outcome behavior,
 * and the one truly new LOGICAL guard (project-id binding), each labeled
 * with exactly what it does and does not prove.
 *
 * Run: npx tsx supabase/migrations/__qa__/phase3-finalize-lost-update-fix.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../../lib/__qa__/_fake-admin'
import { reserveUsage, finalizeUsageReservation, finalizeArticleGeneration, releaseUsageReservation } from '../../../lib/billing/usage-reservations'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const MIGRATIONS_DIR = join(__dirname, '..')
const BASE_MIGRATION_NAME = '20260829000000_add_usage_reservations_and_billing_periods.sql'
const AMBIGUITY_FIX_NAME = '20260829010000_fix_reserve_usage_ambiguous_column_and_idempotency_lock.sql'
const RACE_FIX_NAME = '20260829020000_fix_finalize_lost_update_race.sql'
const baseSql = readFileSync(join(MIGRATIONS_DIR, BASE_MIGRATION_NAME), 'utf8')
const ambiguityFixSql = readFileSync(join(MIGRATIONS_DIR, AMBIGUITY_FIX_NAME), 'utf8')
const raceFixSql = readFileSync(join(MIGRATIONS_DIR, RACE_FIX_NAME), 'utf8')

function extractFunction(sql: string, name: string): { signature: string; body: string } {
  const startIdx = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  if (startIdx === -1) throw new Error(`function ${name} not found`)
  const asDollarIdx = sql.indexOf('AS $$', startIdx)
  const endIdx = sql.indexOf('$$;', asDollarIdx) + 3
  const signature = sql.slice(startIdx, asDollarIdx).trim()
  const body = sql.slice(asDollarIdx + 'AS $$'.length, endIdx - 3)
  return { signature, body }
}

async function main() {
  console.log('Corrective migration — finalize lost-update race QA\n')

  console.log('1) SECTION 1 — source-contract SQL proof (the ONLY genuine proof for a real-Postgres locking race)')
  {
    console.log('\n  1a) Migration file identity, ordering, and versioning')
    const fs = await import('fs')
    const names = fs.readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()
    check('the race-fix migration exists with a purely numeric version prefix', names.includes(RACE_FIX_NAME))
    check('the race-fix migration version is unique across the whole migrations directory', names.filter((n) => n.startsWith('20260829020000_')).length === 1)
    const ambigIdx = names.indexOf(AMBIGUITY_FIX_NAME)
    const raceIdx = names.indexOf(RACE_FIX_NAME)
    check('the race-fix migration sorts AFTER the ambiguity-fix migration', ambigIdx !== -1 && raceIdx !== -1 && raceIdx > ambigIdx)
    check('none of the three already-staging-applied migrations were renamed, rewritten, or removed', names.includes('20260828180000_add_billing_market_claim_gate.sql') && names.includes(BASE_MIGRATION_NAME) && names.includes(AMBIGUITY_FIX_NAME))
    check('the race-fix migration does not touch supabase/migrations/20260828_add_shopify_app_pricing.sql', !/20260828_add_shopify_app_pricing/.test(raceFixSql))

    console.log('\n  1b) The race-fix migration makes NO schema/table/constraint/index/RLS-policy changes — RPC bodies only')
    check('no CREATE TABLE in the race-fix migration', !/CREATE TABLE/i.test(raceFixSql))
    check('no ALTER TABLE in the race-fix migration', !/ALTER TABLE/i.test(raceFixSql))
    check('no CREATE POLICY / RLS change in the race-fix migration', !/CREATE POLICY|ENABLE ROW LEVEL SECURITY/i.test(raceFixSql))
    check('no REVOKE/GRANT in the race-fix migration (unnecessary — same-signature CREATE OR REPLACE preserves existing ACLs)', !/REVOKE ALL|GRANT EXECUTE/.test(raceFixSql))

    console.log('\n  1c) EXACTLY the two functions that had the flawed pattern are replaced — release_usage_reservation is audited-but-untouched')
    check('finalize_usage_reservation is replaced', /CREATE OR REPLACE FUNCTION public\.finalize_usage_reservation\(/.test(raceFixSql))
    check('finalize_article_generation is replaced', /CREATE OR REPLACE FUNCTION public\.finalize_article_generation\(/.test(raceFixSql))
    check('release_usage_reservation is NOT touched by this migration at all (audited, found already race-free — a single atomic guarded UPDATE)', !/CREATE OR REPLACE FUNCTION public\.release_usage_reservation\(/.test(raceFixSql))
    check('reserve_usage is NOT touched by this migration (out of scope — its own race was fixed in the prior migration)', !/CREATE OR REPLACE FUNCTION public\.reserve_usage\(/.test(raceFixSql))
    check('exactly 2 functions are replaced, nothing else', (raceFixSql.match(/CREATE OR REPLACE FUNCTION public\./g) ?? []).length === 2)

    console.log('\n  1d) Signatures are BYTE-IDENTICAL to the base migration — proves grants/SECURITY DEFINER/search_path survive unmodified')
    for (const fn of ['finalize_usage_reservation', 'finalize_article_generation'] as const) {
      const baseFn = extractFunction(baseSql, fn)
      const fixFn = extractFunction(raceFixSql, fn)
      check(`${fn}: signature (params + RETURNS TABLE) is identical to the base migration`, baseFn.signature === fixFn.signature)
      check(`${fn}: still LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, /LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/.test(fixFn.signature))
    }

    console.log("\n  1e) finalize_article_generation — FOR UPDATE acquired BEFORE the article INSERT, re-validating the FULL identity predicate")
    const articleFix = extractFunction(raceFixSql, 'finalize_article_generation')
    const forUpdatePattern = /SELECT ur\.project_id INTO v_project_id\s*\n\s*FROM public\.usage_reservations AS ur\s*\n\s*WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.usage_type = 'article'\s*\n\s*AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token\s*\n\s*FOR UPDATE;/
    check('the locking SELECT ... FOR UPDATE is present with the full identity predicate (id, user_id, usage_type, status, reservation_token)', forUpdatePattern.test(articleFix.body))
    const forUpdateIdx = articleFix.body.search(/FOR UPDATE;/)
    const insertIdx = articleFix.body.indexOf('INSERT INTO public.generated_articles')
    check('the FOR UPDATE lock is acquired BEFORE the generated_articles INSERT', forUpdateIdx !== -1 && insertIdx !== -1 && forUpdateIdx < insertIdx)
    check("on NOT FOUND (lock predicate doesn't match), the function returns not_reserved and never reaches the INSERT", /IF NOT FOUND THEN\s*\n\s*RETURN QUERY SELECT 'not_reserved', NULL::uuid; RETURN;\s*\n\s*END IF;/.test(articleFix.body))

    console.log('\n  1f) finalize_article_generation — project-integrity guard, checked BEFORE the INSERT')
    const projectGuardPattern = /IF v_project_id IS NOT NULL AND v_project_id IS DISTINCT FROM \(p_article->>'project_id'\)::uuid THEN\s*\n\s*RETURN QUERY SELECT 'not_reserved', NULL::uuid; RETURN;\s*\n\s*END IF;/
    check('the project-id guard is present, rejecting a mismatched project BEFORE any insert', projectGuardPattern.test(articleFix.body))
    const projectGuardIdx = articleFix.body.search(projectGuardPattern)
    check('the project-id guard runs BEFORE the generated_articles INSERT', projectGuardIdx !== -1 && projectGuardIdx < insertIdx)
    check('the guard is NULL-safe (IS DISTINCT FROM, never a plain != that would mishandle NULL)', /IS DISTINCT FROM/.test(articleFix.body))

    console.log('\n  1g) finalize_article_generation — the final UPDATE is re-guarded by the FULL identity predicate (never id alone) with a ROW_COUNT check')
    const finalUpdatePattern = /UPDATE public\.usage_reservations AS ur\s*\n\s*SET status = 'consumed', consumed_amount = 1, related_ref = v_article_id::text,\s*\n\s*dispatched_at = now\(\), consumed_at = now\(\)\s*\n\s*WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.usage_type = 'article'\s*\n\s*AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token;/
    check('the final UPDATE is guarded by id + user_id + usage_type + status + reservation_token (not id alone)', finalUpdatePattern.test(articleFix.body))
    check('ROW_COUNT is captured via GET DIAGNOSTICS immediately after the final UPDATE', /GET DIAGNOSTICS v_updated = ROW_COUNT;/.test(articleFix.body))
    check('a ROW_COUNT mismatch RAISES AN EXCEPTION (rolls back the whole transaction, including the just-inserted article)', /IF v_updated <> 1 THEN\s*\n\s*RAISE EXCEPTION/.test(articleFix.body))
    check('the RAISE EXCEPTION is a plain PL\\/pgSQL raise (SQLSTATE P0001), NOT the same code path as the unique_violation handler (23505) — the two can never be confused', /EXCEPTION WHEN unique_violation THEN\s*\n\s*RETURN QUERY SELECT 'slug_conflict', NULL::uuid;/.test(articleFix.body))

    console.log("\n  1h) finalize_usage_reservation — the SAME row-lock-and-recheck strategy, on BOTH the release-path and finalize-path UPDATEs")
    const usageFix = extractFunction(raceFixSql, 'finalize_usage_reservation')
    check('the locking SELECT ... FOR UPDATE is present (id, user_id, status, reservation_token)', /SELECT ur\.reserved_amount INTO v_reserved FROM public\.usage_reservations AS ur\s*\n\s*WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token\s*\n\s*FOR UPDATE;/.test(usageFix.body))
    check('the release-path UPDATE (p_consumed<=0) is re-guarded by the full identity predicate', /UPDATE public\.usage_reservations AS ur SET status = 'released'[\s\S]{0,200}WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token;/.test(usageFix.body))
    check('the finalize-path UPDATE is re-guarded by the full identity predicate', /UPDATE public\.usage_reservations AS ur\s*\n\s*SET status = CASE[\s\S]{0,600}WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token;/.test(usageFix.body))
    check('BOTH UPDATE paths verify ROW_COUNT via GET DIAGNOSTICS', (usageFix.body.match(/GET DIAGNOSTICS v_updated = ROW_COUNT;/g) ?? []).length === 2)
    check('BOTH ROW_COUNT checks RAISE EXCEPTION on mismatch', (usageFix.body.match(/RAISE EXCEPTION 'finalize_usage_reservation:/g) ?? []).length === 2)

    console.log("\n  1i) release_usage_reservation — confirmed to ALREADY be a single atomic guarded UPDATE (audited, no change needed)")
    // Its CURRENTLY-in-effect definition comes from the ambiguity-fix
    // migration (20260829010000...), which qualified its columns but did
    // NOT change its locking strategy — the base migration's original
    // (unqualified) body is a stale snapshot for this specific function by
    // now, so it must NOT be read here.
    const releaseCurrent = extractFunction(ambiguityFixSql, 'release_usage_reservation')
    check('release_usage_reservation has exactly ONE UPDATE statement (no separate initial check-then-act)', (releaseCurrent.body.match(/UPDATE public\.usage_reservations/g) ?? []).length === 1)
    check("that ONE UPDATE is already guarded by the full identity predicate (id, user_id, status='reserved', reservation_token) in a single statement", /WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token;/.test(releaseCurrent.body))
  }

  console.log('\n2) SECTION 2 — FakeAdmin behavioral coverage (wrapper-contract level ONLY — see the caveat on each item)')
  const PERIOD_START = new Date('2026-08-01T00:00:00Z')
  const PERIOD_END = new Date('2026-09-01T00:00:00Z')
  function baseAdmin(nowMs: number, extra: Record<string, unknown[]> = {}) {
    return new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }], usage_reservations: [], generated_articles: [], ...extra }, {}, () => nowMs)
  }
  function art(overrides: Record<string, unknown>) {
    return { project_id: 'p1', topic_id: 't1', title: 'X', meta_title: null, meta_description: null, excerpt: null, content_html: null, content_markdown: null, faq_json: null, image_prompt: null, wp_connection_id: null, slug: 'x', ...overrides }
  }

  console.log('\n  2a) #A — two concurrent finalize_article_generation calls, same reservation/token, different slugs')
  console.log("      CAVEAT: FakeAdmin's branches run synchronously (no `await`), so Promise.all() here can never truly interleave — this does NOT prove")
  console.log('      the real Postgres lost-update race is fixed (Section 1\'s FOR UPDATE / guarded-UPDATE / ROW_COUNT checks are that proof). This only')
  console.log('      proves the wrapper correctly resolves to exactly one consumed + one not_reserved when calls are sequenced, with no raw JS error.')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:race-a' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const [c1, c2] = await Promise.all([
      finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'race-a-slug-1' }) }),
      finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'race-a-slug-2' }) }),
    ])
    const outcomes = [c1.outcome, c2.outcome].sort()
    check('#A exactly one consumed, one not_reserved — no raw error outcome from either', outcomes[0] === 'consumed' && outcomes[1] === 'not_reserved', `outcomes=${outcomes.join(',')}`)
    check('#A exactly ONE generated article exists', admin.tables.generated_articles.length === 1)
    const row = admin.tables.usage_reservations.find((row) => row.id === reservationId)
    check('#A ledger consumed_amount is exactly 1', row?.consumed_amount === 1)
    check('#A ledger status is consumed', row?.status === 'consumed')
  }

  console.log('\n  2b) #B — existing-slug conflict')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), { generated_articles: [{ id: 'existing', project_id: 'p1', slug: 'taken-b' }] })
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:race-b' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const result = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'taken-b' }) })
    check('#B outcome is slug_conflict', result.outcome === 'slug_conflict')
    check('#B zero new articles (only the pre-existing one)', admin.tables.generated_articles.length === 1)
    const row = admin.tables.usage_reservations.find((row) => row.id === reservationId)
    check('#B reservation remains reserved', row?.status === 'reserved')
    check('#B consumed_amount remains 0', row?.consumed_amount === 0)
  }

  console.log('\n  2c) #C — retry after slug conflict with a new slug')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), { generated_articles: [{ id: 'existing', project_id: 'p1', slug: 'taken-c' }] })
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:race-c' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const conflict = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'taken-c' }) })
    check('#C first attempt is slug_conflict', conflict.outcome === 'slug_conflict')
    const retry = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'taken-c-2' }) })
    check('#C retry with a new slug succeeds', retry.outcome === 'consumed')
    check('#C exactly one NEW article was created', admin.tables.generated_articles.length === 2)
    const row = admin.tables.usage_reservations.find((row) => row.id === reservationId)
    check('#C reservation becomes consumed', row?.status === 'consumed')
    check('#C related_ref equals the inserted article id', retry.outcome === 'consumed' && row?.related_ref === retry.articleId)
  }

  console.log('\n  2d) #D — a second retry after successful consumption')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:race-d' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const first = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'race-d-slug' }) })
    check('#D first finalize succeeds', first.outcome === 'consumed')
    const second = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ slug: 'race-d-slug-2' }) })
    check('#D second retry gets not_reserved', second.outcome === 'not_reserved')
    check('#D no second article was created', admin.tables.generated_articles.length === 1)
  }

  console.log('\n  2e) #E — concurrent finalize_usage_reservation calls (same caveat as #A)')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 5, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:race-e' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const [f1, f2] = await Promise.all([
      finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 5, relatedRef: 'scan-winner', reason: null }),
      finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 3, relatedRef: 'scan-loser', reason: null }),
    ])
    const outcomes = [f1.outcome, f2.outcome].sort()
    check('#E exactly one finalized, one not_reserved', outcomes[0] === 'finalized' && outcomes[1] === 'not_reserved', `outcomes=${outcomes.join(',')}`)
    const row = admin.tables.usage_reservations.find((row) => row.id === reservationId)
    check('#E final consumed_amount reflects the WINNER only (5), never the loser\'s 3', row?.consumed_amount === 5)
    check("#E related_ref reflects the WINNER's ref ('scan-winner') — the loser could NOT overwrite it", row?.related_ref === 'scan-winner')
  }

  console.log('\n  2f) #F — concurrent finalize versus release (same caveat as #A)')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 5, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:race-f' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const [finalizeResult, releaseResult] = await Promise.all([
      finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 5, relatedRef: 'scan-f', reason: null }),
      releaseUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, reason: 'race-f-release' }),
    ])
    const outcomes = [finalizeResult.outcome, releaseResult.outcome].sort()
    check('#F exactly one state transition wins (finalized or released), the other is not_reserved', (outcomes.includes('finalized') || outcomes.includes('released')) && outcomes.includes('not_reserved'), `outcomes=${outcomes.join(',')}`)
    const row = admin.tables.usage_reservations.find((row) => row.id === reservationId)
    check('#F final ledger arithmetic is internally consistent (consumed_amount + released_amount === reserved_amount)', (row?.consumed_amount as number) + (row?.released_amount as number) === row?.reserved_amount)
  }

  console.log('\n  2g) #G — project mismatch (a reservation that DOES carry a project scope, consumed by an article for a DIFFERENT project)')
  console.log("      Real 'article' reservations always have project_id=null at the ledger level (account-wide), so this scenario is synthesized")
  console.log('      directly to exercise the RPC\'s own defense-in-depth guard, independent of whether any current caller could trigger it today.')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'), { projects: [{ id: 'p1', user_id: 'u1' }, { id: 'p2', user_id: 'u1' }] })
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: 'topic:race-g' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    // Synthesize a project-scoped reservation (not how real article
    // reservations are created today — see the caveat above).
    const row = admin.tables.usage_reservations.find((row) => row.id === reservationId)
    if (row) row.project_id = 'p1'
    const result = await finalizeArticleGeneration(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, article: art({ project_id: 'p2', slug: 'race-g-slug' }) })
    check('#G no article inserted — outcome is not_reserved (project mismatch)', result.outcome === 'not_reserved')
    check('#G no credit consumed — zero articles, reservation still reserved', admin.tables.generated_articles.length === 0)
    check('#G the reservation itself is untouched (still reserved, still holding its original token)', row?.status === 'reserved' && row?.reservation_token === reservationToken)
  }

  console.log('\n  2h) #H — preserved behaviors (stale-token rejection, partial-consumption arithmetic)')
  {
    const t0 = Date.parse('2026-08-15T00:00:00Z')
    const admin = baseAdmin(t0)
    const key = 'manual:p1:race-h-stale'
    const original = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    const { reservationId, reservationToken: staleToken } = original as { reservationId: string; reservationToken: string }
    const adminAt31 = baseAdmin(t0 + 31 * 60_000, admin.tables)
    await reserveUsage(adminAt31 as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    const staleFinalize = await finalizeUsageReservation(adminAt31 as unknown as Admin, { reservationId, userId: 'u1', reservationToken: staleToken, consumed: 1, relatedRef: null, reason: null })
    check('#H a stale (superseded) token still gets not_reserved', staleFinalize.outcome === 'not_reserved')

    const admin2 = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r2 = await reserveUsage(admin2 as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 10, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:race-h-partial' })
    const { reservationId: r2Id, reservationToken: r2Token } = r2 as { reservationId: string; reservationToken: string }
    const partial = await finalizeUsageReservation(admin2 as unknown as Admin, { reservationId: r2Id, userId: 'u1', reservationToken: r2Token, consumed: 6, relatedRef: 'partial-scan', reason: 'partial_dispatch' })
    check('#H partial-consumption arithmetic is unchanged (finalized outcome for consumed < reserved is partially_consumed status internally, but outcome is still finalized)', partial.outcome === 'finalized')
    const row2 = admin2.tables.usage_reservations.find((row) => row.id === r2Id)
    check('#H consumed_amount is exactly what was dispatched (6)', row2?.consumed_amount === 6)
    check('#H released_amount is the unused remainder (4)', row2?.released_amount === 4)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
