/**
 * Corrective migration
 * (20260829010000_fix_reserve_usage_ambiguous_column_and_idempotency_lock.sql)
 * — regression coverage for a PRODUCTION-BLOCKING bug reproduced against a
 * real, dedicated staging PostgreSQL database on every reserve_usage call:
 *
 *   ERROR: column reference "reservation_token" is ambiguous
 *   DETAIL: It could refer to either a PL/pgSQL variable or a table column.
 *
 * This is a class of bug that ONLY exists in real PL/pgSQL variable scoping
 * (a RETURNS TABLE column becomes an OUT variable in scope for the whole
 * function body) — lib/__qa__/_fake-admin.ts's JS simulation has no such
 * concept and can NEVER reproduce or disprove it. Per the standing
 * instruction for this fix: do not treat any FakeAdmin-based test as proof
 * this class of bug (or the companion concurrency-ordering bug) is fixed —
 * Section 1 below is the actual proof, via static analysis of the real
 * migration SQL text. Section 2 covers the parts of the required regression
 * list that genuinely are meaningful to prove via the FakeAdmin wrapper
 * contract, each labeled with exactly what it does and does not prove.
 *
 * Run: npx tsx supabase/migrations/__qa__/phase3-reserve-usage-ambiguity-fix.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../../lib/__qa__/_fake-admin'
import { reserveUsage, finalizeUsageReservation } from '../../../lib/billing/usage-reservations'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const MIGRATIONS_DIR = join(__dirname, '..')
const BASE_MIGRATION_NAME = '20260829000000_add_usage_reservations_and_billing_periods.sql'
const FIX_MIGRATION_NAME = '20260829010000_fix_reserve_usage_ambiguous_column_and_idempotency_lock.sql'
const baseSql = readFileSync(join(MIGRATIONS_DIR, BASE_MIGRATION_NAME), 'utf8')
const fixSql = readFileSync(join(MIGRATIONS_DIR, FIX_MIGRATION_NAME), 'utf8')

/** Extracts one `CREATE OR REPLACE FUNCTION public.<name>(...) RETURNS ... AS $$ ... $$;`
 *  block from a migration's full text, split into its signature (everything
 *  up to `AS $$`) and its body (everything between `AS $$` and the final `$$;`). */
function extractFunction(sql: string, name: string): { signature: string; body: string; whole: string } {
  const startIdx = sql.indexOf(`CREATE OR REPLACE FUNCTION public.${name}(`)
  if (startIdx === -1) throw new Error(`function ${name} not found`)
  const asDollarIdx = sql.indexOf('AS $$', startIdx)
  const endIdx = sql.indexOf('$$;', asDollarIdx) + 3
  const whole = sql.slice(startIdx, endIdx)
  const signature = sql.slice(startIdx, asDollarIdx).trim()
  const body = sql.slice(asDollarIdx + 'AS $$'.length, endIdx - 3)
  return { signature, body, whole }
}

async function main() {
  console.log('Corrective migration — reserve_usage ambiguity + idempotency-lock-ordering QA\n')

  console.log('1) SECTION 1 — source-contract SQL proof (the ONLY genuine proof for a PL/pgSQL-scoping bug)')
  {
    console.log('\n  1a) Migration file identity, ordering, and versioning')
    const fs = await import('fs')
    const names = fs.readdirSync(MIGRATIONS_DIR).filter((n) => n.endsWith('.sql')).sort()
    check('the corrective migration exists with a purely numeric version prefix', names.includes(FIX_MIGRATION_NAME))
    check('the corrective migration version is unique across the whole migrations directory',
      names.filter((n) => n.startsWith('20260829010000_')).length === 1)
    const baseIdx = names.indexOf(BASE_MIGRATION_NAME)
    const fixIdx = names.indexOf(FIX_MIGRATION_NAME)
    check('the corrective migration sorts AFTER the base usage-reservations migration', baseIdx !== -1 && fixIdx !== -1 && fixIdx > baseIdx)
    check('the base migration was NOT renamed, rewritten, or removed — it is untouched and still present under its original name', names.includes(BASE_MIGRATION_NAME))
    check('the corrective migration does not touch supabase/migrations/20260828_add_shopify_app_pricing.sql (no reference to it anywhere in the file)', !/20260828_add_shopify_app_pricing/.test(fixSql))

    console.log('\n  1b) The corrective migration makes NO schema/table/constraint/index/RLS-policy changes — RPC bodies only')
    check('no CREATE TABLE in the corrective migration', !/CREATE TABLE/i.test(fixSql))
    check('no ALTER TABLE in the corrective migration', !/ALTER TABLE/i.test(fixSql))
    check('no CREATE INDEX in the corrective migration', !/CREATE INDEX/i.test(fixSql))
    check('no CREATE POLICY / RLS change in the corrective migration', !/CREATE POLICY|ENABLE ROW LEVEL SECURITY/i.test(fixSql))
    check('no REVOKE/GRANT in the corrective migration (unnecessary — same-signature CREATE OR REPLACE preserves existing ACLs)', !/REVOKE ALL|GRANT EXECUTE/.test(fixSql))
    check('exactly the 4 usage_reservations RPCs are replaced, nothing else', (fixSql.match(/CREATE OR REPLACE FUNCTION public\./g) ?? []).length === 4)

    const RPCS = ['reserve_usage', 'finalize_usage_reservation', 'finalize_article_generation', 'release_usage_reservation'] as const
    console.log('\n  1c) Every RPC signature (params + RETURNS TABLE) is BYTE-IDENTICAL between the base and corrective migrations')
    console.log('      — this is what proves service_role-only execution, fixed search_path, and SECURITY DEFINER survive unmodified')
    console.log('      (Postgres preserves a function\'s ACL/grants across CREATE OR REPLACE ONLY when its argument-type signature is unchanged).')
    for (const fn of RPCS) {
      const baseFn = extractFunction(baseSql, fn)
      const fixFn = extractFunction(fixSql, fn)
      check(`${fn}: signature (params + RETURNS TABLE) is identical in both migrations`, baseFn.signature === fixFn.signature)
      check(`${fn}: still LANGUAGE plpgsql SECURITY DEFINER SET search_path = public`, /LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/.test(fixFn.signature))
    }

    console.log('\n  1d) reserve_usage — the EXACT statement that raised the ambiguity error is now fully qualified')
    const reserveFix = extractFunction(fixSql, 'reserve_usage')
    check('the previously-broken bare SELECT no longer exists ANYWHERE in the corrective file (negative check)',
      !/SELECT id, status, reserved_at, related_ref, reservation_token\s*\n\s*INTO/.test(fixSql))
    check('the idempotency-lookup SELECT now selects ur.id, ur.status, ur.reserved_at, ur.related_ref, ur.reservation_token — the exact column that was ambiguous is now qualified',
      /SELECT ur\.id, ur\.status, ur\.reserved_at, ur\.related_ref, ur\.reservation_token\s*\n\s*INTO v_id, v_status, v_reserved_at, v_ref, v_token\s*\n\s*FROM public\.usage_reservations AS ur\s*\n\s*WHERE ur\.user_id = p_user_id AND ur\.idempotency_key = p_idempotency_key/.test(reserveFix.body))
    check('the expired-row reuse-marking UPDATE is qualified (ur.reserved_amount on the RHS, ur.id in WHERE)',
      /UPDATE public\.usage_reservations AS ur SET status = 'released', released_at = now\(\),\s*\n\s*released_amount = ur\.reserved_amount, release_reason = 'expired'\s*\n\s*WHERE ur\.id = v_id/.test(reserveFix.body))
    check('the capacity-aggregate SELECT is fully qualified (ur.status/ur.consumed_amount/ur.reserved_at/ur.reserved_amount in the CASE, ur.user_id/ur.usage_type/ur.period_start/ur.id in WHERE)',
      /WHEN ur\.status IN \('consumed', 'partially_consumed'\) THEN ur\.consumed_amount/.test(reserveFix.body)
      && /WHEN ur\.status = 'reserved' AND ur\.reserved_at > now\(\) - interval '30 minutes' THEN ur\.reserved_amount/.test(reserveFix.body)
      && /FROM public\.usage_reservations AS ur\s*\n\s*WHERE ur\.user_id = p_user_id AND ur\.usage_type = p_usage_type AND ur\.period_start = p_period_start\s*\n\s*AND ur\.id IS DISTINCT FROM v_id/.test(reserveFix.body))
    check('the grant/reuse UPDATE (on v_id IS NOT NULL) is qualified (UPDATE ... AS ur, WHERE ur.id = v_id)',
      /UPDATE public\.usage_reservations AS ur\s*\n\s*SET status = 'reserved'[\s\S]{0,400}WHERE ur\.id = v_id;/.test(reserveFix.body))

    console.log('\n  1e) reserve_usage — the idempotency lock is acquired FIRST, before the idempotency SELECT, with a DIFFERENT salt than the capacity lock')
    const idemLockPattern = /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text \|\| p_idempotency_key, 1\)\)/
    const capacityLockPattern = /pg_advisory_xact_lock\(hashtextextended\(p_user_id::text \|\| p_usage_type \|\| p_period_start::text, 0\)\)/
    check('the NEW idempotency-scoped advisory lock is present, salted `1`', idemLockPattern.test(reserveFix.body))
    check('the pre-existing capacity advisory lock is still present, unchanged, salted `0`', capacityLockPattern.test(reserveFix.body))
    const idemLockIdx = reserveFix.body.search(idemLockPattern)
    const capacityLockIdx = reserveFix.body.search(capacityLockPattern)
    const idemSelectIdx = reserveFix.body.indexOf('INTO v_id, v_status, v_reserved_at, v_ref, v_token')
    check('the idempotency lock is acquired BEFORE the idempotency-key lookup SELECT', idemLockIdx !== -1 && idemSelectIdx !== -1 && idemLockIdx < idemSelectIdx)
    check('the idempotency lock is acquired BEFORE the capacity lock (idempotency lock first, capacity lock second, on every call)', idemLockIdx !== -1 && capacityLockIdx !== -1 && idemLockIdx < capacityLockIdx)
    check('the two locks use DIFFERENT salts, so their advisory-lock namespaces can never collide with each other',
      /p_idempotency_key, 1\)\)/.test(reserveFix.body) && /p_period_start::text, 0\)\)/.test(reserveFix.body))

    console.log('\n  1f) The other three RPCs are hardened with the SAME qualification pattern (defensive — none were actually ambiguous today)')
    const finalizeUsage = extractFunction(fixSql, 'finalize_usage_reservation')
    check('finalize_usage_reservation: the guard SELECT is qualified (ur.reserved_amount, ur.id, ur.user_id, ur.status, ur.reservation_token)',
      /SELECT ur\.reserved_amount INTO v_reserved FROM public\.usage_reservations AS ur\s*\n\s*WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token/.test(finalizeUsage.body))
    check('finalize_usage_reservation: both UPDATE statements use the AS ur alias with a qualified WHERE ur.id', (finalizeUsage.body.match(/UPDATE public\.usage_reservations AS ur/g) ?? []).length === 2)

    const finalizeArticle = extractFunction(fixSql, 'finalize_article_generation')
    check('finalize_article_generation: the guard EXISTS subquery is qualified (ur.id, ur.user_id, ur.usage_type, ur.status, ur.reservation_token)',
      /SELECT 1 FROM public\.usage_reservations AS ur\s*\n\s*WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.usage_type = 'article' AND ur\.status = 'reserved'\s*\n\s*AND ur\.reservation_token = p_reservation_token/.test(finalizeArticle.body))
    check('finalize_article_generation: the consume UPDATE uses the AS ur alias with a qualified WHERE ur.id', /UPDATE public\.usage_reservations AS ur\s*\n\s*SET status = 'consumed'[\s\S]{0,200}WHERE ur\.id = p_reservation_id;/.test(finalizeArticle.body))
    check('finalize_article_generation: the generated_articles INSERT is untouched (different table, out of scope for this fix)', /INSERT INTO public\.generated_articles/.test(finalizeArticle.body))

    const release = extractFunction(fixSql, 'release_usage_reservation')
    check('release_usage_reservation: the UPDATE is qualified (AS ur, ur.reserved_amount on the RHS, ur.id/ur.user_id/ur.status/ur.reservation_token in WHERE)',
      /UPDATE public\.usage_reservations AS ur\s*\n\s*SET status = 'released', released_amount = ur\.reserved_amount, released_at = now\(\),\s*\n\s*release_reason = p_reason\s*\n\s*WHERE ur\.id = p_reservation_id AND ur\.user_id = p_user_id AND ur\.status = 'reserved' AND ur\.reservation_token = p_reservation_token/.test(release.body))

    console.log('\n  1g) Regression #7g — every one of the 4 RPC bodies is checked for ambiguous unqualified usage_reservations column references')
    // Every usage_reservations column, checked as a whole-word token that is
    // NOT already known-safe: either qualified (`ur.<col>`), a SET-target
    // (left of `=` in an UPDATE...SET clause — Postgres REQUIRES this to be
    // bare), or a p_-/v_-prefixed identifier (already excluded by \b, since
    // '_' is a word character with no boundary before the risky token).
    const usageReservationsColumns = [
      'id', 'usage_type', 'user_id', 'project_id', 'reserved_amount', 'consumed_amount', 'released_amount',
      'period_start', 'period_end', 'idempotency_key', 'status', 'reservation_token', 'dispatched_at',
      'related_ref', 'release_reason', 'created_at', 'reserved_at', 'consumed_at', 'released_at',
    ]
    const bareColRe = (col: string) => new RegExp(`(?<!ur\\.)\\b${col}\\b`, 'g')
    /** Strips `-- ...` line comments — comment PROSE routinely mentions
     *  column names bare in plain English (e.g. "never created_at"), which
     *  is not SQL and must not be flagged. */
    const stripLineComments = (sql: string) => sql.replace(/--[^\n]*/g, '')
    for (const fn of RPCS) {
      const { body } = extractFunction(fixSql, fn)
      const bodyNoComments = stripLineComments(body)
      // Statement-scoped, not whole-body: split on `;` and only inspect
      // statements that actually reference usage_reservations (an INSERT
      // into a DIFFERENT table — generated_articles — legitimately uses bare
      // column names like user_id/project_id/status in its own column list,
      // which is a completely different, never-ambiguous grammar position;
      // scoping by statement is what correctly excludes it here).
      const statements = bodyNoComments.split(';').map((s) => s.trim()).filter(Boolean)
      const bareFound: string[] = []
      for (const stmt of statements) {
        if (!/\busage_reservations\b/.test(stmt)) continue
        const isUpdateOnUsageReservations = /\bUPDATE\s+public\.usage_reservations\b/i.test(stmt)
        const isInsertIntoUsageReservations = /\bINSERT\s+INTO\s+public\.usage_reservations\b/i.test(stmt)
        if (isInsertIntoUsageReservations) continue // column list / VALUES are inherently unambiguous — different grammar position entirely
        let toCheck = stmt
        if (isUpdateOnUsageReservations) {
          // UPDATE ... SET col1 = expr1, col2 = expr2 [WHERE ...] — the SET
          // clause's TARGET column names (left of each `=`) are REQUIRED by
          // Postgres to be bare; only mask those specific tokens, leaving
          // the WHERE clause and every RHS expression (which CAN be
          // ambiguous) subject to the full check below.
          const setIdx = stmt.search(/\bSET\b/i)
          const whereIdx = stmt.search(/\bWHERE\b/i)
          const setClause = whereIdx > setIdx ? stmt.slice(setIdx, whereIdx) : stmt.slice(setIdx)
          const rest = whereIdx > setIdx ? stmt.slice(whereIdx) : ''
          const setClauseMasked = setClause.replace(/(SET\s+|,\s*)([a-z_]+)(\s*=)/gi, (_m, sep, col, eq) => `${sep}__TARGET_${col}__${eq}`)
          toCheck = setClauseMasked + '\n' + rest
        }
        for (const col of usageReservationsColumns) {
          const matches = toCheck.match(bareColRe(col)) ?? []
          if (matches.length > 0) bareFound.push(`${col}(${matches.length})`)
        }
      }
      check(`${fn}: zero ambiguity-risk bare usage_reservations column references outside SET-target position`, bareFound.length === 0, `found: ${bareFound.join(', ')}`)
    }
  }

  console.log('\n2) SECTION 2 — FakeAdmin behavioral coverage (wrapper-contract level ONLY — see the caveat on each item)')
  const PERIOD_START = new Date('2026-08-01T00:00:00Z')
  const PERIOD_END = new Date('2026-09-01T00:00:00Z')
  function baseAdmin(nowMs: number, extra: Record<string, unknown[]> = {}) {
    return new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }], usage_reservations: [], generated_articles: [], ...extra }, {}, () => nowMs)
  }

  console.log("\n  2a) #7a — a first reserve_usage call on an empty ledger returns 'reserved' (the wrapper/RPC CONTRACT works end-to-end; the real-Postgres 'no ambiguity error' claim is proven in Section 1, NOT here — a JS mock cannot raise or fail to raise a PL/pgSQL ambiguity error)")
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: 'topic:ambiguity-fix-a' })
    check("#7a first call on an empty ledger returns 'reserved'", r.outcome === 'reserved')
    check('#7a exactly one ledger row now exists', admin.tables.usage_reservations.length === 1)
  }

  console.log('\n  2b) #7b — two concurrent DIFFERENT idempotency keys racing for the final unit of quota (limit=1): exactly one reserved, one quota_exceeded, one ledger row')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const [r1, r2] = await Promise.all([
      reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: 'topic:ambiguity-fix-b1' }),
      reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: 'topic:ambiguity-fix-b2' }),
    ])
    const outcomes = [r1.outcome, r2.outcome].sort()
    check('#7b exactly one call is reserved and the other quota_exceeded', outcomes[0] === 'quota_exceeded' && outcomes[1] === 'reserved', `outcomes=${outcomes.join(',')}`)
    check('#7b exactly ONE ledger row exists (the denied caller never inserted anything)', admin.tables.usage_reservations.length === 1)
  }

  console.log('\n  2c) #7c — two concurrent calls with the SAME idempotency key: one reserved, one already_reserved, both succeed, one ledger row, no error')
  console.log('      CAVEAT: this mock\'s reserve_usage branch has NO `await` inside it, so Promise.all() here can never truly interleave — JS run-to-completion')
  console.log('      semantics make this scenario trivially safe REGARDLESS of the SQL fix. This does NOT prove the real Postgres race is fixed — Section 1\'s')
  console.log('      lock-ordering checks (1e) are the actual proof. This test only proves the WRAPPER correctly handles both possible outcomes cleanly.')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const key = 'topic:ambiguity-fix-c'
    const [r1, r2] = await Promise.all([
      reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: key }),
      reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 4, idempotencyKey: key }),
    ])
    const outcomes = [r1.outcome, r2.outcome].sort()
    check('#7c one call is reserved, the other already_reserved — no error outcome from either', outcomes[0] === 'already_reserved' && outcomes[1] === 'reserved', `outcomes=${outcomes.join(',')}`)
    check('#7c exactly ONE ledger row exists for this key (never a unique-constraint double-insert)', admin.tables.usage_reservations.filter((r) => r.idempotency_key === key).length === 1)
    const reservationId = (r1.outcome === 'reserved' ? r1 : r2) as { reservationId: string }
    const alreadyReserved = (r1.outcome === 'already_reserved' ? r1 : r2) as { reservationId: string }
    check('#7c both calls resolved to the SAME row id', reservationId.reservationId === alreadyReserved.reservationId)
  }

  console.log('\n  2d) #7d — reusing an expired/released row generates a NEW token (same row id)')
  {
    const t0 = Date.parse('2026-08-15T00:00:00Z')
    const admin = baseAdmin(t0)
    const key = 'topic:ambiguity-fix-d'
    const original = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    const originalId = (original as { reservationId: string }).reservationId
    const originalToken = (original as { reservationToken: string }).reservationToken
    const adminAt31 = baseAdmin(t0 + 31 * 60_000, admin.tables)
    const reused = await reserveUsage(adminAt31 as unknown as Admin, { userId: 'u1', projectId: null, usageType: 'article', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    check('#7d the reused row keeps the SAME id', reused.outcome === 'reserved' && (reused as { reservationId: string }).reservationId === originalId)
    check('#7d but receives a DIFFERENT token', (reused as { reservationToken: string }).reservationToken !== originalToken)
  }

  console.log('\n  2e) #7e — the stale (superseded) token receives not_reserved from finalize')
  {
    const t0 = Date.parse('2026-08-15T00:00:00Z')
    const admin = baseAdmin(t0)
    const key = 'manual:p1:ambiguity-fix-e'
    const original = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    const { reservationId, reservationToken: staleToken } = original as { reservationId: string; reservationToken: string }
    const adminAt31 = baseAdmin(t0 + 31 * 60_000, admin.tables)
    await reserveUsage(adminAt31 as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 1, idempotencyKey: key })
    const staleFinalize = await finalizeUsageReservation(adminAt31 as unknown as Admin, { reservationId, userId: 'u1', reservationToken: staleToken, consumed: 1, relatedRef: null, reason: null })
    check('#7e the stale token gets not_reserved', staleFinalize.outcome === 'not_reserved')
  }

  console.log('\n  2f) #7f — the current token can finalize exactly once')
  {
    const admin = baseAdmin(Date.parse('2026-08-15T00:00:00Z'))
    const r = await reserveUsage(admin as unknown as Admin, { userId: 'u1', projectId: 'p1', usageType: 'google_check', amount: 1, periodStart: PERIOD_START, periodEnd: PERIOD_END, limit: 50, idempotencyKey: 'manual:p1:ambiguity-fix-f' })
    const { reservationId, reservationToken } = r as { reservationId: string; reservationToken: string }
    const first = await finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 1, relatedRef: null, reason: null })
    check('#7f first finalize with the current token succeeds', first.outcome === 'finalized')
    const second = await finalizeUsageReservation(admin as unknown as Admin, { reservationId, userId: 'u1', reservationToken, consumed: 1, relatedRef: null, reason: null })
    check('#7f a second finalize with the SAME (now-consumed) token is rejected', second.outcome === 'not_reserved')
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
