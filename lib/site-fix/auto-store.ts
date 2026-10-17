/**
 * Reading and writing the automatic-fix switch (site_fix_auto_grants). Server-side only.
 *
 * The service-role client BYPASSES RLS. Every query below carries BOTH `.eq('project_id', …)` and
 * `.eq('user_id', …)`, like ./store.ts, with ONE exception: `listDueGrants`, the scheduler's list
 * of the switches that are on and due, across projects. Only ./auto-run.ts may call it, and it
 * proves each project's owner again (lib/site-fix/api.ts `load`) before anything is read or
 * written for it. A QA guard (lib/site-fix/__qa__/site-fix.qa.ts, O1) holds both rules.
 *
 * The table arrives with supabase/migrations/20261006140000_site_fix_auto_grants.sql. Until it is
 * applied every read answers "unavailable": the settings card is hidden and the scheduler skips.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FixStoreError, isMissingTable, type Scope } from './store'
import type { FixType } from './types'

type Admin = ReturnType<typeof createAdminClient>

export interface AutoGrantRow {
  id: string
  user_id: string
  project_id: string
  fix_types: FixType[]
  enabled_by: string
  enabled_at: string
  enabled_ip: string | null
  disabled_at: string | null
  disabled_by: string | null
  last_run_at: string | null
  run_claimed_until: string | null
}

const GRANT_COLUMNS = 'id, user_id, project_id, fix_types, enabled_by, enabled_at, enabled_ip, disabled_at, disabled_by, last_run_at, run_claimed_until'

/** The switch that is on for this project now, or null; `available` false while the table is missing. */
export async function readActiveGrant(admin: Admin, scope: Scope): Promise<{ available: boolean; grant: AutoGrantRow | null }> {
  const { data, error } = await admin.from('site_fix_auto_grants').select(GRANT_COLUMNS)
    .eq('project_id', scope.projectId).eq('user_id', scope.userId).is('disabled_at', null).maybeSingle()
  if (error) {
    if (isMissingTable(error)) return { available: false, grant: null }
    throw new FixStoreError()
  }
  return { available: true, grant: (data as AutoGrantRow | null) ?? null }
}

/** The project's last run, from its newest grant (on or off), for the screens. */
export async function readLastRun(admin: Admin, scope: Scope): Promise<string | null> {
  const { data, error } = await admin.from('site_fix_auto_grants').select('last_run_at')
    .eq('project_id', scope.projectId).eq('user_id', scope.userId).order('enabled_at', { ascending: false }).limit(1)
  if (error) return null
  return ((data ?? [])[0] as { last_run_at?: string | null } | undefined)?.last_run_at ?? null
}

/**
 * Turn the switch on: who (the owner), when (now) and from which IP, for the covered types. A
 * second active row is refused by the database (one per project); the caller reads it back.
 */
export async function insertGrant(admin: Admin, scope: Scope, grant: { types: readonly FixType[]; ip: string | null }): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin.from('site_fix_auto_grants').insert({
    user_id: scope.userId, project_id: scope.projectId, fix_types: [...grant.types], enabled_by: scope.userId, enabled_at: now,
    enabled_ip: grant.ip ? grant.ip.slice(0, 64) : null, created_at: now, updated_at: now,
  })
  if (error && (error as { code?: string }).code === '23505') return
  if (error) throw new FixStoreError()
}

/** Turn the switch off, at once: the next automatic fix re-reads it before it is written. */
export async function disableGrant(admin: Admin, scope: Scope): Promise<void> {
  const now = new Date().toISOString()
  const { error } = await admin.from('site_fix_auto_grants').update({ disabled_at: now, disabled_by: scope.userId, updated_at: now })
    .eq('project_id', scope.projectId).eq('user_id', scope.userId).is('disabled_at', null)
  if (error) throw new FixStoreError()
}

/**
 * Hold one project for one run: only when no other run holds it (its claim is empty or past) and
 * the switch is still on. True when this run won it.
 */
export async function claimGrant(admin: Admin, scope: Scope, grantId: string, nowIso: string, untilIso: string): Promise<boolean> {
  const { data, error } = await admin.from('site_fix_auto_grants').update({ run_claimed_until: untilIso, updated_at: nowIso })
    .eq('id', grantId).eq('project_id', scope.projectId).eq('user_id', scope.userId).is('disabled_at', null)
    .or(`run_claimed_until.is.null,run_claimed_until.lt.${nowIso}`).select('id')
  if (error) return false
  return Array.isArray(data) && data.length === 1
}

/** The run is over: its time is recorded (the next one is due in a week) and the claim let go. */
export async function finishGrantRun(admin: Admin, scope: Scope, grantId: string, nowIso: string): Promise<void> {
  const { error } = await admin.from('site_fix_auto_grants').update({ last_run_at: nowIso, run_claimed_until: null, updated_at: nowIso })
    .eq('id', grantId).eq('project_id', scope.projectId).eq('user_id', scope.userId)
  if (error && !isMissingTable(error)) throw new FixStoreError()
}

/**
 * THE ONE CROSS-PROJECT READ: the switches that are on and whose last run is older than
 * `beforeIso` (or that never ran), oldest first. For ./auto-run.ts only; every row it returns is
 * proven again against its project's owner before anything happens.
 */
export async function listDueGrants(admin: Admin, beforeIso: string, limit = 50): Promise<{ available: boolean; grants: AutoGrantRow[] }> {
  const { data, error } = await admin.from('site_fix_auto_grants').select(GRANT_COLUMNS)
    .is('disabled_at', null).or(`last_run_at.is.null,last_run_at.lt.${beforeIso}`)
    .order('last_run_at', { ascending: true, nullsFirst: true }).limit(limit)
  if (error) {
    if (isMissingTable(error)) return { available: false, grants: [] }
    throw new FixStoreError()
  }
  const at = (g: AutoGrantRow) => (g.last_run_at ? Date.parse(g.last_run_at) : -Infinity)
  return { available: true, grants: ((data ?? []) as AutoGrantRow[]).slice().sort((a, b) => at(a) - at(b)) }
}
