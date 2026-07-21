/**
 * Stage E1 — one-time OAuth state (CSRF/replay) tied to the initiating user + project.
 * The raw state lives only in the authorization URL / callback query; only its sha256
 * hash is stored. Single-use + 10-minute expiry, both enforced atomically at consume.
 */
import crypto from 'crypto'
import type { createAdminClient } from '@/lib/supabase/admin'

type Admin = ReturnType<typeof createAdminClient>
const STATE_TTL_MS = 10 * 60 * 1000

function hashState(raw: string): string { return crypto.createHash('sha256').update(raw).digest('hex') }

/** Create a state row and return the RAW opaque state to embed in the auth URL. */
export async function createOAuthState(admin: Admin, args: { userId: string; projectId: string }): Promise<string> {
  const raw = crypto.randomBytes(32).toString('hex')
  const expiresAt = new Date(Date.now() + STATE_TTL_MS).toISOString()
  const { error } = await admin.from('gsc_oauth_states').insert({ state_hash: hashState(raw), user_id: args.userId, project_id: args.projectId, expires_at: expiresAt })
  if (error) throw new Error('Failed to create OAuth state.')
  return raw
}

export interface ConsumedState { projectId: string }

/**
 * Atomically consume a state: succeeds ONLY if it exists, is unconsumed, unexpired, AND
 * belongs to `userId`. Returns the bound projectId, or null for missing/expired/reused/
 * user-mismatch. Single-use via the `consumed_at IS NULL` guard in the UPDATE.
 */
export async function consumeOAuthState(admin: Admin, args: { rawState: string; userId: string }): Promise<ConsumedState | null> {
  if (!args.rawState) return null
  const nowIso = new Date().toISOString()
  const { data, error } = await admin
    .from('gsc_oauth_states')
    .update({ consumed_at: nowIso })
    .eq('state_hash', hashState(args.rawState))
    .eq('user_id', args.userId)      // user-mismatch → no row updated
    .is('consumed_at', null)         // single-use
    .gt('expires_at', nowIso)        // expiry
    .select('project_id')
  if (error || !data || data.length === 0) return null
  return { projectId: String((data[0] as { project_id: string }).project_id) }
}
