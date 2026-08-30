/**
 * Source-contract proof for migration
 * 20260830000000_shopify_reconnect_after_uninstall.sql.
 *
 * lib/shopify/__qa__/phase3-reconnect-after-uninstall.qa.ts proves the
 * DECISION TABLE behaviourally against FakeAdmin. It explicitly CANNOT prove
 * the properties that only exist in real Postgres — the advisory lock, the
 * SELECT ... FOR UPDATE re-read, single-transaction atomicity, rollback, and
 * the partial unique indexes. Every FakeAdmin branch runs synchronously, so
 * nothing can interleave there regardless of whether the SQL locks at all.
 * This suite asserts those properties against the migration TEXT, following
 * the same split already established by
 * phase3-reserve-usage-ambiguity-fix.qa.ts and
 * phase3-finalize-lost-update-fix.qa.ts.
 *
 * Run: npx tsx supabase/migrations/__qa__/phase3-shopify-reconnect-ownership.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const MIG = readFileSync(join(ROOT, 'supabase/migrations/20260830000000_shopify_reconnect_after_uninstall.sql'), 'utf8')
const FN_START = MIG.indexOf('CREATE OR REPLACE FUNCTION public.claim_shopify_shop_ownership')
const BODY = MIG.slice(FN_START)

async function main() {
  console.log('Migration source contract — Shopify reconnect ownership\n')

  console.log('1) RPC security conventions (same rules the other RPCs are held to)')
  {
    check('1a: SECURITY DEFINER with a fixed search_path',
      /LANGUAGE plpgsql SECURITY DEFINER SET search_path = public/.test(BODY))
    check('1b: EXECUTE revoked from PUBLIC, anon, authenticated',
      /REVOKE ALL ON FUNCTION public\.claim_shopify_shop_ownership\([^)]*\) FROM PUBLIC, anon, authenticated;/.test(MIG))
    check('1c: EXECUTE granted ONLY to service_role',
      /GRANT EXECUTE ON FUNCTION public\.claim_shopify_shop_ownership\([^)]*\) TO service_role;/.test(MIG))
    check('1d: no grant to authenticated/anon/PUBLIC anywhere',
      !/GRANT EXECUTE ON FUNCTION public\.claim_shopify_shop_ownership\([^)]*\) TO (authenticated|anon|PUBLIC)/.test(MIG))
  }

  console.log('\n2) Serialization and locking (NOT provable in FakeAdmin)')
  {
    check('2a: a transaction-scoped advisory lock is taken on the shop domain',
      /PERFORM pg_advisory_xact_lock\(hashtextextended\(p_shop_domain, 0\)\)/.test(BODY))
    const lockIdx = BODY.indexOf('pg_advisory_xact_lock')
    const selectIdx = BODY.indexOf('FROM public.shopify_connections')
    check('2b: the lock is acquired BEFORE the row is read', lockIdx !== -1 && selectIdx !== -1 && lockIdx < selectIdx)
    check('2c: the existing row is re-read FOR UPDATE inside the lock', /FOR UPDATE;/.test(BODY))
    check('2d: the shop_gid conflict probe is also FOR UPDATE',
      (BODY.match(/FOR UPDATE;/g) || []).length >= 2)
    check('2e: the whole transition is ONE function body, not statements the caller sequences',
      /RETURNS TABLE\(outcome text, connection_id uuid\)/.test(BODY) && /\$\$;/.test(BODY))
    check('2f: a residual unique_violation rolls the WHOLE function back rather than leaving an archived row with no replacement',
      /EXCEPTION WHEN unique_violation THEN/.test(BODY))
  }

  console.log('\n3) Eligibility predicate is narrow and fails closed')
  {
    check('3a: requires connection_status = failed', /v_existing\.connection_status = 'failed'/.test(BODY))
    check('3b: requires last_error = app_uninstalled', /v_existing\.last_error = 'app_uninstalled'/.test(BODY))
    check('3c: requires granted_scopes to be empty',
      /COALESCE\(array_length\(v_existing\.granted_scopes, 1\), 0\) = 0/.test(BODY))
    check('3d: requires no ACTIVE Shopify subscription',
      /v_existing\.shopify_subscription_status IS DISTINCT FROM 'active'/.test(BODY))
    check('3e: it is a negated conjunction — anything else falls through to a blocked outcome',
      /IF NOT \(\s*\n\s*v_existing\.connection_status = 'failed'/.test(BODY))
    check('3f: a live connected row returns shop_already_connected',
      /RETURN QUERY SELECT 'shop_already_connected', NULL::uuid;/.test(BODY))
    check('3g: any other non-eligible state returns blocked_not_eligible',
      /RETURN QUERY SELECT 'blocked_not_eligible', NULL::uuid;/.test(BODY))
    check('3h: it does NOT compare the encrypted revocation sentinel (random IV would never match)',
      !/access_token_encrypted = p_revocation_sentinel/.test(BODY))
    check('3i: the guard is NOT the broad "status != connected" the requirements forbid',
      !/connection_status <> 'connected'/.test(BODY) && !/connection_status != 'connected'/.test(BODY))
  }

  console.log('\n4) Archive, never delete')
  {
    check('4a: no DELETE statement anywhere in the migration', !/\bDELETE FROM\b/i.test(MIG))
    check('4b: supersession sets archived_at + a stable reason',
      /SET archived_at = v_now,\s*\n\s*archived_reason = 'superseded_after_uninstall'/.test(BODY))
    check('4c: the archived row keeps its shop_domain (no placeholder domain is written)',
      !/shop_domain = '[^']*placeholder/i.test(BODY) && !/shop_domain = NULL/.test(BODY))
    check('4d: the archived row\'s billing cache is cleared so no stale entitlement can be read',
      /shopify_plan_handle = NULL,/.test(BODY) && /shopify_subscription_status = NULL,/.test(BODY)
      && /shopify_billing_verified_at = NULL,/.test(BODY))
    check('4e: archived_reason is constrained to a known vocabulary',
      /CHECK \(archived_reason IN \('superseded_after_uninstall'\) OR archived_reason IS NULL\)/.test(MIG))
  }

  console.log('\n5) Uniqueness becomes live-only so an archived row releases its claim')
  {
    check('5a: shop_domain unique index is partial on archived_at IS NULL',
      /CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_shop_domain_unique\s*\n\s*ON public\.shopify_connections \(shop_domain\)\s*\n\s*WHERE archived_at IS NULL;/.test(MIG))
    check('5b: shop_gid unique index is partial on archived_at IS NULL',
      /shopify_connections_shop_gid_unique[\s\S]{0,160}WHERE shop_gid IS NOT NULL AND archived_at IS NULL;/.test(MIG))
    check('5c: the project_id uniqueness CONSTRAINT is replaced by a live-only partial index',
      /DROP CONSTRAINT IF EXISTS shopify_connections_project_unique;/.test(MIG)
      && /CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_project_unique[\s\S]{0,140}WHERE archived_at IS NULL;/.test(MIG))
    check('5d: the old unconditional indexes are dropped first (otherwise they would still block)',
      /DROP INDEX IF EXISTS public\.shopify_connections_shop_domain_unique;/.test(MIG)
      && /DROP INDEX IF EXISTS public\.shopify_connections_shop_gid_unique;/.test(MIG))
  }

  console.log('\n6) The new owner\'s row is CLEAN — nothing carried across accounts')
  {
    const insertIdx = BODY.indexOf('INSERT INTO public.shopify_connections')
    const insert = BODY.slice(insertIdx, BODY.indexOf('RETURNING id INTO v_id;', insertIdx))
    check('6a: the INSERT exists', insertIdx !== -1)
    for (const col of ['shopify_plan_handle', 'shopify_subscription_status', 'shopify_billing_verified_at',
                       'shopify_current_period_end', 'shopify_trial_ends_at', 'shopify_cancel_at_end_of_cycle']) {
      check(`6b: the new row does not carry ${col}`, !new RegExp(col).test(insert))
    }
    check('6c: no column is copied from the archived row (no v_existing reference in the INSERT)',
      !/v_existing\./.test(insert))
    check('6d: the new row takes the caller\'s user_id/project_id, not the old owner\'s',
      /p_user_id, p_project_id, p_shop_domain/.test(insert))
  }

  console.log('\n7) Same-project reconnect reactivates in place')
  {
    check('7a: the same-project branch UPDATEs the existing row by id',
      /IF v_existing\.project_id = p_project_id THEN[\s\S]{0,900}WHERE id = v_existing\.id/.test(BODY))
    check('7b: it returns the reactivated outcome', /RETURN QUERY SELECT 'reactivated', v_id;/.test(BODY))
    check('7c: it refreshes the token and clears the uninstall error state',
      /access_token_encrypted = p_access_token_encrypted,/.test(BODY) && /last_error = p_last_error,/.test(BODY))
    check('7d: it does NOT archive anything in that branch',
      !/IF v_existing\.project_id = p_project_id THEN[\s\S]{0,900}archived_at = v_now/.test(BODY))
  }

  console.log('\n8) The migration is additive and does not touch unrelated data')
  {
    check('8a: no UPDATE outside the function body (no data backfill/rewrite at apply time)',
      !/^\s*UPDATE public\./m.test(MIG.slice(0, FN_START)))
    check('8b: columns are added with IF NOT EXISTS (idempotent re-apply)',
      /ADD COLUMN IF NOT EXISTS archived_at timestamptz/.test(MIG)
      && /ADD COLUMN IF NOT EXISTS archived_reason text/.test(MIG))
    check('8c: it touches only shopify_connections',
      !/ALTER TABLE public\.(?!shopify_connections)/.test(MIG))
    check('8d: it states it is not applied by this task', /NOT APPLIED BY THIS TASK/.test(MIG))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
