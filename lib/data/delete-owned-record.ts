/**
 * Area I — ownership-enforced hard delete for a top-level owned record.
 *
 * Deletes exactly ONE row from `clients` or `projects`, scoped to the calling user.
 * All dependents are removed by the database's existing ON DELETE CASCADE foreign
 * keys (deleting a client cascades to its projects and their dependents; deleting a
 * project cascades to its keywords/scans/articles/etc). This function issues NO
 * delete against child tables and NEVER touches the per-user gsc_connections (which
 * is not FK'd to projects and must survive a project delete).
 *
 * Ownership is enforced two ways: the `user_id = auth.uid()` RLS policy (FOR ALL) AND
 * the explicit `.eq('user_id', userId)` predicate here — belt-and-suspenders, and it
 * lets us distinguish "not yours / not found" (zero rows) from a real DB error. Runs
 * as the authenticated user (never the service role), so a cross-user delete removes
 * zero rows. No external/remote destructive action is ever taken.
 */
import type { SupabaseClient } from '@supabase/supabase-js'

export type DeleteOwnedResult =
  | { ok: true }
  | { ok: false; error: 'not_found_or_not_owned' | 'delete_failed' }

export async function deleteOwnedRecord(
  supabase: SupabaseClient,
  table: 'clients' | 'projects',
  id: string,
  userId: string,
): Promise<DeleteOwnedResult> {
  const { data, error } = await supabase
    .from(table)
    .delete()
    .eq('id', id)
    .eq('user_id', userId)
    .select('id')
  if (error) {
    console.error(`[delete-${table}] failed`, { code: (error as { code?: string }).code })
    return { ok: false, error: 'delete_failed' }
  }
  // RLS or the user_id predicate filtered every row out → the row is not the caller's
  // (or already gone). Never a silent success.
  if (!data || (data as unknown[]).length === 0) return { ok: false, error: 'not_found_or_not_owned' }
  return { ok: true }
}
