/**
 * The reminder state of one project (table project_reminder_state): the owner's switch and
 * the log of what was sent. Written only by service-role code AFTER an owner check, so every
 * read and write here carries the project AND the owner. An absent row means "reminders on,
 * nothing sent yet". A table that is not installed yet (the migration is not applied) is
 * reported as `unavailable`, never as an error text, and nothing is sent then.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { ReminderState } from './cadence'

export const STATE_TABLE = 'project_reminder_state'
const MISSING = new Set(['42P01', 'PGRST205', 'PGRST204'])

export interface StoredState extends ReminderState {
  /** The row's version: every write sets it, and a claim only wins against the version it read. */
  version: string | null
}
export type StateRead = { status: 'ok'; state: StoredState | null } | { status: 'unavailable' } | { status: 'failed' }

const NEVER: StoredState = { batchKey: null, sentCount: 0, lastSentAt: null, enabled: true, version: null }

export async function readState(admin: ServiceRoleClient, projectId: string, ownerId: string): Promise<StateRead> {
  const { data, error } = await admin.from(STATE_TABLE)
    .select('reminders_enabled, batch_key, sent_count, last_sent_at, updated_at')
    .eq('project_id', projectId).eq('user_id', ownerId).maybeSingle()
  if (error) return MISSING.has(String((error as { code?: unknown }).code ?? '')) ? { status: 'unavailable' } : { status: 'failed' }
  if (!data) return { status: 'ok', state: null }
  const r = data as Record<string, unknown>
  return {
    status: 'ok',
    state: {
      enabled: r.reminders_enabled !== false,
      batchKey: typeof r.batch_key === 'string' ? r.batch_key : null,
      sentCount: typeof r.sent_count === 'number' ? r.sent_count : 0,
      lastSentAt: typeof r.last_sent_at === 'string' ? r.last_sent_at : null,
      version: typeof r.updated_at === 'string' ? r.updated_at : null,
    },
  }
}

/**
 * Take the right to send ONE reminder: record it as sent, but only if nobody wrote the row
 * since it was read (a second cron tick, an unsubscribe in between). Returns false when the
 * claim was lost: the caller then sends nothing. The claim comes BEFORE the send, so a
 * crash can lose a reminder but never doubles one.
 */
export async function claimSend(admin: ServiceRoleClient, projectId: string, ownerId: string, prior: StoredState | null,
  next: { batchKey: string; sentCount: number; at: string }): Promise<boolean> {
  const fields = { batch_key: next.batchKey, sent_count: next.sentCount, last_sent_at: next.at, updated_at: next.at }
  if (!prior || !prior.version) {
    const { error } = await admin.from(STATE_TABLE).insert({ project_id: projectId, user_id: ownerId, reminders_enabled: true, ...fields })
    return !error
  }
  const { data, error } = await admin.from(STATE_TABLE).update(fields)
    .eq('project_id', projectId).eq('user_id', ownerId).eq('updated_at', prior.version).eq('reminders_enabled', true)
    .select('project_id')
  return !error && Array.isArray(data) && data.length === 1
}

/** Undo a claim whose email was not accepted, so the next tick may try again. */
export async function releaseClaim(admin: ServiceRoleClient, projectId: string, ownerId: string, prior: StoredState | null, claimedAt: string): Promise<void> {
  const back = prior ?? NEVER
  await admin.from(STATE_TABLE)
    .update({ batch_key: back.batchKey, sent_count: back.sentCount, last_sent_at: back.lastSentAt, updated_at: back.version ?? claimedAt })
    .eq('project_id', projectId).eq('user_id', ownerId).eq('updated_at', claimedAt)
}

/** The switch. Idempotent: writing the value it already has changes nothing else. */
export async function writeEnabled(admin: ServiceRoleClient, projectId: string, ownerId: string, enabled: boolean, nowIso: string): Promise<'ok' | 'unavailable' | 'failed'> {
  const { error } = await admin.from(STATE_TABLE).upsert(
    { project_id: projectId, user_id: ownerId, reminders_enabled: enabled, unsubscribed_at: enabled ? null : nowIso, updated_at: nowIso },
    { onConflict: 'project_id' },
  )
  if (!error) return 'ok'
  return MISSING.has(String((error as { code?: unknown }).code ?? '')) ? 'unavailable' : 'failed'
}
