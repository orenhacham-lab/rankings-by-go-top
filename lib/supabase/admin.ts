import { createClient, type SupabaseClient } from '@supabase/supabase-js'

/**
 * A Supabase client authenticated with the SERVICE ROLE key.
 *
 * WHY THIS IS A DISTINCT TYPE AND NOT JUST `SupabaseClient`.
 *
 * The service-role client and the request-scoped client that
 * `lib/supabase/server.ts` builds from the anon key are STRUCTURALLY
 * IDENTICAL — same class, same methods — so TypeScript accepted either one
 * anywhere the other was expected. That is not a cosmetic distinction:
 * PostgREST runs the anon client's queries as the `authenticated` role, and
 * `public.billing_governance` is RLS-enabled with no policies and REVOKEd from
 * `PUBLIC, anon, authenticated` (supabase/migrations/20260901000000_billing_
 * governance.sql). Reading it as `authenticated` does not return an empty set;
 * it fails with SQLSTATE 42501, which every governance-aware code path
 * correctly treats as "entitlement not knowable" — zero limits for everybody.
 *
 * That is exactly how a whole class of production incidents happened, twice:
 * once in the route guard (see proxy.ts) and once across every entitlement
 * call site that mutates something. Both times the code was right and the
 * ARGUMENT was wrong, and nothing in the type system objected.
 *
 * The unique-symbol brand makes the two clients incompatible, so handing a
 * request-scoped client to something that reads governance is now a compile
 * error rather than a silent zero-entitlement answer in production.
 */
declare const SERVICE_ROLE_BRAND: unique symbol
export type ServiceRoleClient = SupabaseClient & { readonly [SERVICE_ROLE_BRAND]: true }

export function createAdminClient(): ServiceRoleClient {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    }
  ) as ServiceRoleClient
}
