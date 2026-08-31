/**
 * Phase 3 — SECURITY DEFINER RPC hardening source-contract proof:
 * fixed search_path, no PUBLIC/anon/authenticated execute, service_role
 * only, ownership check inside, RLS on the ledger table. Run:
 *   npx tsx supabase/migrations/__qa__/phase3-rpc-security.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const migration = readFileSync(join(__dirname, '..', '20260829000000_add_usage_reservations_and_billing_periods.sql'), 'utf8')

const RPCS = ['reserve_usage', 'finalize_usage_reservation', 'finalize_article_generation', 'release_usage_reservation']

async function main() {
  console.log('Phase 3 — usage_reservations RPC security QA\n')

  console.log('1) Every RPC sets a fixed, safe search_path')
  {
    for (const fn of RPCS) {
      const idx = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`)
      check(`${fn}: SET search_path = public`, idx !== -1 && migration.slice(idx, idx + 600).includes('SET search_path = public'))
    }
  }

  console.log('\n2) Every RPC is EXECUTE-revoked from PUBLIC, anon, authenticated')
  {
    for (const fn of RPCS) {
      check(`${fn}: REVOKE ALL ... FROM PUBLIC, anon, authenticated`, new RegExp(`REVOKE ALL ON FUNCTION public\\.${fn}\\([^)]*\\) FROM PUBLIC, anon, authenticated`).test(migration))
    }
  }

  console.log('\n3) Every RPC is granted ONLY to service_role — never directly callable by an authenticated end-user session')
  {
    for (const fn of RPCS) {
      check(`${fn}: GRANT EXECUTE ... TO service_role`, new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO service_role`).test(migration))
      check(`${fn}: no GRANT to authenticated/anon/PUBLIC anywhere`, !new RegExp(`GRANT EXECUTE ON FUNCTION public\\.${fn}\\([^)]*\\) TO (authenticated|anon|PUBLIC)`).test(migration))
    }
  }

  console.log('\n4) reserve_usage validates project ownership BEFORE reserving — never lets a caller reserve against a project it doesn\'t own')
  {
    const idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.reserve_usage')
    const body = migration.slice(idx, migration.indexOf('$$;', idx))
    check('checks projects.user_id = p_user_id', /WHERE id = p_project_id AND user_id = p_user_id/.test(body))
    check('returns a distinct project_not_owned outcome rather than silently proceeding', /project_not_owned/.test(body))
    const ownershipIdx = body.indexOf('project_not_owned')
    const idemLookupIdx = body.indexOf('Idempotent-retry branch')
    check('the ownership check runs BEFORE the idempotency-key lookup / capacity math', ownershipIdx !== -1 && idemLookupIdx !== -1 && ownershipIdx < idemLookupIdx)
  }

  console.log('\n5) p_limit is NEVER read from inside the RPC — it is always a parameter the trusted server resolves before calling (no plan-lookup logic inside the SQL function)')
  {
    const idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.reserve_usage')
    const body = migration.slice(idx, migration.indexOf('$$;', idx))
    check('no PLAN_LIMITS / plan_code / subscriptions table lookup inside reserve_usage — the limit is purely a passed-in parameter', !/subscriptions|plan_code|PLAN_LIMITS/.test(body))
  }

  console.log('\n6) RLS enabled on usage_reservations, with only an owner-scoped SELECT policy (no insert/update/delete policy — all writes go through the service-role RPCs)')
  {
    check('RLS enabled', /ALTER TABLE public\.usage_reservations ENABLE ROW LEVEL SECURITY/.test(migration))
    check('an owner-scoped SELECT policy exists', /CREATE POLICY usage_reservations_select ON public\.usage_reservations\s+FOR SELECT USING \(user_id = auth\.uid\(\)\)/.test(migration))
    check('no INSERT/UPDATE/DELETE policy on usage_reservations (writes are RPC-only)', !/CREATE POLICY usage_reservations_(insert|update|delete)/.test(migration))
  }

  console.log('\n7) finalize_article_generation is atomic — the article INSERT and the reservation UPDATE are in the SAME function body (one transaction)')
  {
    const idx = migration.indexOf('CREATE OR REPLACE FUNCTION public.finalize_article_generation')
    const body = migration.slice(idx, migration.indexOf('$$;', idx) + 3)
    check('contains the generated_articles INSERT', /INSERT INTO public\.generated_articles/.test(body))
    check('contains the usage_reservations UPDATE to consumed', /UPDATE public\.usage_reservations[\s\S]*status = 'consumed'/.test(body))
    check('the whole thing is ONE PL\\/pgSQL function body (LANGUAGE plpgsql ... $$ ... $$), not two separate statements the caller sequences itself', /LANGUAGE plpgsql SECURITY DEFINER/.test(migration.slice(idx, idx + 350)))
    check('a slug unique_violation is caught and rolls back the WHOLE function (EXCEPTION WHEN unique_violation)', /EXCEPTION WHEN unique_violation THEN/.test(body))
  }

  console.log('\n7b) 3rd review correction — the explicit reservation_token guard: reserve_usage returns reservation_token (never a timestamp), and every finalize/release RPC requires the row\'s CURRENT reservation_token to still match before acting')
  {
    const tableIdx = migration.indexOf('CREATE TABLE IF NOT EXISTS public.usage_reservations')
    const tableBody = migration.slice(tableIdx, migration.indexOf('CONSTRAINT usage_reservations_idem_unique', tableIdx))
    check('usage_reservations has an explicit reservation_token uuid column, NOT NULL, defaulting to a fresh uuid', /reservation_token uuid NOT NULL DEFAULT gen_random_uuid\(\)/.test(tableBody))
    check('usage_reservations has a SEPARATE reserved_at column distinct from created_at (both present, both timestamptz NOT NULL)', /created_at\s+timestamptz NOT NULL DEFAULT now\(\)/.test(tableBody) && /reserved_at\s+timestamptz NOT NULL DEFAULT now\(\)/.test(tableBody))

    const reserveIdx = migration.indexOf('CREATE OR REPLACE FUNCTION public.reserve_usage')
    const reserveBody = migration.slice(reserveIdx, migration.indexOf('$$;', reserveIdx) + 3)
    check('reserve_usage RETURNS a reservation_token column (uuid), not a timestamp', /RETURNS TABLE\(outcome text, reservation_id uuid, article_id text, reservation_token uuid\)/.test(reserveBody))
    check("the 'reserved' outcome returns v_token — a FRESH uuid generated via gen_random_uuid() for this specific grant/reuse, not created_at or reserved_at", /v_token := gen_random_uuid\(\)/.test(reserveBody) && /RETURN QUERY SELECT 'reserved', v_id, NULL::text, v_token;/.test(reserveBody))
    check('the already_reserved (still-live) branch returns the CURRENT stored token unchanged, never regenerating it', /RETURN QUERY SELECT 'already_reserved', v_id, NULL::text, v_token; RETURN;/.test(reserveBody))
    check('the reused-row (UPDATE) branch sets BOTH reservation_token = v_token AND reserved_at = v_now on reuse', /SET status = 'reserved'[\s\S]{0,300}reservation_token = v_token, reserved_at = v_now/.test(reserveBody))
    check('created_at is explicitly documented as NOT touched on the reuse (UPDATE) path', /created_at is deliberately NOT touched here/.test(reserveBody))
    check('the fresh-INSERT path also sets reservation_token (and created_at + reserved_at together, only on first creation)', /INSERT INTO public\.usage_reservations[\s\S]{0,120}reservation_token, created_at, reserved_at\)/.test(reserveBody))
    check('the 30-minute TTL check in the idempotent-retry branch is computed from reserved_at, never created_at', /v_status = 'reserved' AND v_reserved_at > now\(\) - interval '30 minutes'/.test(reserveBody) && !/v_created_at/.test(reserveBody))
    check('the capacity-math TTL check (used-amount aggregation) is ALSO computed from reserved_at, never created_at', /status = 'reserved' AND reserved_at > now\(\) - interval '30 minutes' THEN reserved_amount/.test(reserveBody))

    for (const fn of ['finalize_usage_reservation', 'finalize_article_generation', 'release_usage_reservation']) {
      const idx = migration.indexOf(`CREATE OR REPLACE FUNCTION public.${fn}`)
      const body = migration.slice(idx, migration.indexOf('$$;', idx) + 3)
      check(`${fn} accepts p_reservation_token uuid as a parameter (never p_reserved_at/timestamptz)`, /p_reservation_token uuid/.test(body) && !/p_reserved_at/.test(body))
      check(`${fn} requires reservation_token = p_reservation_token before acting (in addition to status='reserved') — never trusts reservation_id alone, and never guards on created_at/reserved_at`, /reservation_token = p_reservation_token/.test(body) && !/created_at = p_res/.test(body))
    }

    // REVOKE/GRANT signatures must match the new uuid-typed 6/4-arg
    // signatures exactly — a stale signature here would mean the REVOKE/GRANT
    // silently applies to a DIFFERENT (non-existent, or old) overload,
    // leaving the real function ungoverned.
    check('finalize_usage_reservation REVOKE/GRANT signature includes the new uuid token param (not timestamptz)', /finalize_usage_reservation\(uuid, uuid, integer, text, text, uuid\)/.test(migration))
    check('finalize_article_generation REVOKE/GRANT signature includes the new uuid token param (not timestamptz)', /finalize_article_generation\(uuid, uuid, jsonb, uuid\)/.test(migration))
    check('release_usage_reservation REVOKE/GRANT signature includes the new uuid token param (not timestamptz)', /release_usage_reservation\(uuid, uuid, text, uuid\)/.test(migration))
    check('no REVOKE/GRANT signature anywhere still references the old timestamptz-typed overload', !/finalize_usage_reservation\(uuid, uuid, integer, text, text, timestamptz\)/.test(migration) && !/finalize_article_generation\(uuid, uuid, jsonb, timestamptz\)/.test(migration) && !/release_usage_reservation\(uuid, uuid, text, timestamptz\)/.test(migration))
  }

  console.log('\n8) 3rd review correction — migration filenames use ONLY a numeric version prefix (Supabase\'s own canonical <timestamp>_<name>.sql convention), each is unique, and neither collides with any existing file')
  {
    const fs = await import('fs')
    const path = await import('path')
    const dir = path.join(__dirname, '..')
    const names = fs.readdirSync(dir).filter((n) => n.endsWith('.sql')).sort()

    check('the usage-reservations migration exists with a purely numeric version prefix', names.includes('20260829000000_add_usage_reservations_and_billing_periods.sql'))
    check('the billing-market claim-gate migration exists with a purely numeric version prefix', names.includes('20260828180000_add_billing_market_claim_gate.sql'))
    check('the old letter-suffixed filenames (20260828a_..., 20260828b_...) no longer exist anywhere', !names.includes('20260828a_add_usage_reservations_and_billing_periods.sql') && !names.includes('20260828b_add_billing_market_claim_gate.sql'))
    check('the old, originally-colliding bare-date filename no longer exists', !names.includes('20260828_add_usage_reservations_and_billing_periods.sql'))

    // Every migration filename's version prefix (the part before the first
    // underscore) is now checked to be PURELY numeric across the WHOLE
    // directory — not just the two files this pass touched. (VERIFY_*.sql /
    // VERIFY_* scripts are manual, read-only inspection helpers; the rest,
    // add_article_fields.sql / insert_google_position_article.sql, are
    // pre-existing, non-timestamped utility scripts that predate the
    // migrations-must-be-numeric convention entirely; they are excluded here
    // exactly as they are excluded from being "applied" migrations by
    // Supabase itself, since a non-numeric-prefixed file is never picked up
    // as a migration in the first place.)
    const nonNumericPrefixed = names.filter((n) => {
      const versionPart = n.split('_')[0].replace(/\.sql$/, '')
      return !/^\d+$/.test(versionPart)
    })
    check('every REAL migration filename (excluding the 3 known pre-existing non-timestamped utility scripts) has a purely numeric version prefix',
      nonNumericPrefixed.every((n) => [
        'VERIFY_cache_state.sql',
        // Read-only verification script for 20260831000000 (expiring offline
        // tokens). Like VERIFY_cache_state.sql it is run BY HAND in the SQL
        // editor, is never applied by the migration runner, and deliberately
        // carries no version prefix so it cannot be mistaken for one.
        'VERIFY_shopify_expiring_offline_tokens.sql',
        'add_article_fields.sql', 'insert_google_position_article.sql',
      ].includes(n)),
      `non-numeric-prefixed files found: ${nonNumericPrefixed.join(', ')}`)

    // Uniqueness: the TWO version numbers this pass introduced must not
    // collide with ANY other migration's version number, old or new.
    // (Pre-existing same-prefix duplicates — 20260412 x3, 20260613 x2,
    // 20260728 x2 — predate this whole correction effort, are already
    // applied, and are explicitly out of scope to rename; a blanket
    // "zero duplicates anywhere in history" assertion would incorrectly
    // demand touching those. This check is scoped to what this pass is
    // actually responsible for: its OWN two new version numbers.)
    const allVersionPrefixes = names.filter((n) => !nonNumericPrefixed.includes(n)).map((n) => n.split('_')[0])
    const usageVersion: string = '20260829000000'
    const claimGateVersion: string = '20260828180000'
    check('the usage-reservations migration\'s version number is UNIQUE across the entire migrations directory', allVersionPrefixes.filter((v) => v === usageVersion).length === 1)
    check('the claim-gate migration\'s version number is UNIQUE across the entire migrations directory', allVersionPrefixes.filter((v) => v === claimGateVersion).length === 1)
    check('the two new version numbers are also distinct from EACH OTHER', usageVersion !== claimGateVersion)

    // Ordering relative to the pre-existing (committed, pushed, untouched)
    // Shopify pricing migration: PROVEN, not assumed. The usage-reservations
    // migration was moved to the NEXT CALENDAR DAY (20260829000000, a
    // 14-digit YYYYMMDDHHMMSS timestamp — Supabase's own canonical
    // generator format) specifically so it genuinely sorts AFTER
    // '20260828_add_shopify_app_pricing.sql' with no dependency-safety
    // workaround needed for THIS pair: '2026082' + '9' simply sorts after
    // '2026082' + '8' at the differing digit, full stop.
    //
    // The claim-gate migration (20260828180000) is untouched this pass — it
    // still shares the SAME calendar day as Shopify, so the same byte-wise
    // lexicographic fact applies to IT: a purely numeric extension of
    // "20260828" sorts BEFORE "20260828_..." (every ASCII digit 0-9 sorts
    // before '_'), so it still sorts before the Shopify migration. That is
    // proven directly below and covered by the dependency-safety check that
    // follows (unchanged from the prior pass — this file's scope this round
    // is only the usage-reservations rename).
    const shopifyIdx = names.indexOf('20260828_add_shopify_app_pricing.sql')
    const usageIdx = names.indexOf('20260829000000_add_usage_reservations_and_billing_periods.sql')
    const claimGateIdx = names.indexOf('20260828180000_add_billing_market_claim_gate.sql')
    check('all three same-day-or-later migrations are present', shopifyIdx !== -1 && usageIdx !== -1 && claimGateIdx !== -1)
    check('PROVEN: the usage-reservations migration (next-calendar-day version) genuinely sorts AFTER the Shopify migration — no compensating dependency-safety argument needed for this pair',
      usageIdx > shopifyIdx)
    check('PROVEN: the claim-gate migration (same-day, untouched this pass) still sorts BEFORE the Shopify migration — a purely-numeric same-day prefix cannot sort after a short-format "date_name" filename',
      claimGateIdx < shopifyIdx)
    check('all three sort in the actual intended sequence: claim-gate, then Shopify, then usage-reservations', claimGateIdx < shopifyIdx && shopifyIdx < usageIdx)

    // Dependency-safety proof — still required ONLY for the claim-gate /
    // Shopify pair (claim-gate sorts before Shopify, see above). The
    // usage-reservations / Shopify pair no longer needs this argument since
    // it now genuinely applies in the correct order, but the disjoint-column
    // check is kept as an extra belt-and-braces guarantee regardless of
    // ordering.
    const shopifyMigrationSql = fs.readFileSync(path.join(dir, '20260828_add_shopify_app_pricing.sql'), 'utf8') as string
    const usageMigrationSql = fs.readFileSync(path.join(dir, '20260829000000_add_usage_reservations_and_billing_periods.sql'), 'utf8') as string
    const claimGateMigrationSql = fs.readFileSync(path.join(dir, '20260828180000_add_billing_market_claim_gate.sql'), 'utf8') as string
    const shopifyConnectionsColsInShopifyMigration = [...shopifyMigrationSql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1])
    const shopifyConnectionsColsInUsageMigration = [...usageMigrationSql.matchAll(/ADD COLUMN IF NOT EXISTS (\w+)/g)].map((m) => m[1])
    const overlap = shopifyConnectionsColsInShopifyMigration.filter((c) => shopifyConnectionsColsInUsageMigration.includes(c))
    check('the Shopify migration and the usage-reservations migration add DISJOINT columns (zero name overlap) — order between them cannot change the final schema either way', overlap.length === 0, `overlapping columns: ${overlap.join(', ')}`)
    check('the usage-reservations migration only creates NEW objects (usage_reservations table, its own RPCs) plus ADD COLUMN IF NOT EXISTS on pre-existing tables — never DROP/ALTER COLUMN TYPE/RENAME, which would be order-sensitive', !/DROP COLUMN|ALTER COLUMN \w+ TYPE|RENAME (COLUMN|TABLE)/i.test(usageMigrationSql))
    check('the claim-gate migration touches ONLY public.profiles — no overlap with anything the Shopify migration creates or alters (still needed: claim-gate sorts before Shopify)', /ALTER TABLE public\.profiles/.test(claimGateMigrationSql) && !/shopify_connections|shopify_billing/i.test(claimGateMigrationSql))

    // Confirm the committed, pushed Shopify migration was NOT modified by
    // this pass — its file content is byte-for-byte identical to what's on
    // origin/feat/shopify-app-pricing-phase2 (verified separately via `git
    // status`/`git diff` returning nothing for this path in the final
    // report; this check just confirms the file text still contains its
    // known, unmistakable header so a corrupting edit would fail loudly).
    check('the Shopify migration file still contains its original Phase-2 header (untouched)', /Phase 2 — Shopify App Pricing support\./.test(shopifyMigrationSql))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
