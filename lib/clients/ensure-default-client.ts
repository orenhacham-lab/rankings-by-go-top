/**
 * Area C — auto-create the account's DEFAULT client from signup data.
 *
 * Server-authoritative, idempotent, quota-aware. Every field is derived ONLY from
 * auth.getUser() + the signup metadata (never client-supplied input), so the caller
 * cannot influence what is written. No project is created. RLS is preserved: this runs
 * as the authenticated user (never the service role), so the row is inserted under the
 * user's own INSERT policy. No PII is logged.
 *
 * Idempotency / race-safety: the migration adds `is_default boolean NOT NULL DEFAULT
 * false` plus a PARTIAL unique index `unique(user_id) WHERE is_default = true`. That
 * index is the single source of truth for "one default per user". We rely on it exactly
 * like ON CONFLICT DO NOTHING: a plain insert of a second `is_default` row for the same
 * user is rejected with a unique_violation (23505), which we swallow as "already exists".
 * (PostgREST's upsert `onConflict` cannot target a partial unique index — it can't emit
 * the required `WHERE is_default` predicate — so the app-level 23505 swallow IS the
 * ON CONFLICT DO NOTHING for a partial index.) Until the migration is applied the column
 * does not exist, so only the zero-client pre-check guards this path — NOT race-safe yet.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { getUserEntitlement } from '@/lib/subscription'

export type EnsureDefaultClientResult =
  | { status: 'created'; clientId: string | null }
  | { status: 'exists' }
  | { status: 'skipped'; reason: 'no_user' | 'quota' | 'error' | 'migration_pending' }

const str = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')
const digitsOnly = (v: unknown): string => (typeof v === 'string' ? v.replace(/\D/g, '') : '')

const UNIQUE_VIOLATION = '23505'
/** PostgREST/Postgres codes meaning the is_default column isn't there yet (pre-migration). */
const MISSING_COLUMN = new Set(['42703', 'PGRST204'])

/**
 * Ensure the authenticated user has exactly one default client. Never throws
 * (best-effort; a failure never blocks signup / navigation).
 */
export async function ensureDefaultClient(supabase: SupabaseClient): Promise<EnsureDefaultClientResult> {
  try {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return { status: 'skipped', reason: 'no_user' }

    // Idempotency + "zero-client users only": if the user already has ANY client, do nothing.
    // (This is also the only guard before the migration is applied — see the note above.)
    const { count, error: countErr } = await supabase
      .from('clients').select('id', { count: 'exact', head: true }).eq('user_id', user.id)
    if (countErr) {
      console.warn('[ensure-default-client] count failed', { code: (countErr as { code?: string }).code })
      return { status: 'skipped', reason: 'error' }
    }
    if ((count ?? 0) >= 1) return { status: 'exists' }

    // Quota-aware: the auto client counts toward maxClients (never overshoot the plan).
    const entitlement = await getUserEntitlement(user.id, supabase)
    if ((count ?? 0) >= entitlement.limits.maxClients) return { status: 'skipped', reason: 'quota' }

    // Fields derived ONLY from the authenticated user + signup metadata.
    const md = (user.user_metadata ?? {}) as Record<string, unknown>
    const emailLocal = (user.email ?? '').split('@')[0] ?? ''
    const base = {
      user_id: user.id,
      // name is NOT NULL — company_name, else full_name, else the email local part.
      name: str(md.company_name) || str(md.full_name) || emailLocal || 'Default',
      contact_name: str(md.full_name) || null,
      email: user.email ?? null,
      phone: digitsOnly(md.phone) || null,
      notes: null,
      is_active: true,
    }

    // Race-safe (post-migration) insert: the partial unique index rejects a second
    // is_default row for this user with 23505, which we treat as "already exists".
    const { data, error } = await supabase
      .from('clients').insert({ ...base, is_default: true }).select('id').maybeSingle()
    if (!error) return { status: 'created', clientId: (data as { id?: string } | null)?.id ?? null }

    const code = (error as { code?: string }).code ?? ''
    if (code === UNIQUE_VIOLATION) return { status: 'exists' } // concurrent default won the race

    // Pre-migration: the is_default column doesn't exist yet. Best-effort create WITHOUT it
    // so signup still yields a client. NOT race-safe until the migration adds the partial
    // unique index; the backfill later flags one row is_default. Guarded by count === 0 above.
    if (MISSING_COLUMN.has(code)) {
      const { data: d2, error: e2 } = await supabase.from('clients').insert(base).select('id').maybeSingle()
      if (!e2) return { status: 'created', clientId: (d2 as { id?: string } | null)?.id ?? null }
      console.warn('[ensure-default-client] pre-migration insert failed', { code: (e2 as { code?: string }).code })
      return { status: 'skipped', reason: 'migration_pending' }
    }

    console.warn('[ensure-default-client] insert failed', { code })
    return { status: 'skipped', reason: 'error' }
  } catch (e) {
    console.warn('[ensure-default-client] unexpected', { message: e instanceof Error ? e.message : 'error' })
    return { status: 'skipped', reason: 'error' }
  }
}
