/**
 * The setup-email state of one project: the same row and the same owner switch the approval
 * reminder uses (table project_reminder_state), in the three columns
 * 20261009170000_project_reminder_state_onboarding.sql adds. One row per project means one
 * switch and one unsubscribe link for every email we send about that project.
 *
 * WHY ITS OWN READ. lib/reminders/state.ts selects only the approval columns and must keep
 * doing so: a database without the new columns answers 42703, and that must mean "setup
 * emails are not installed yet" (nothing sent), never an error for the reminder that was
 * already live.
 *
 * WHY A CLAIM WRITES `last_sent_at` TOO. It is the one date the approval reminder reads for
 * its 72-hour gap. Writing it here is what stops the two features emailing the same owner
 * twice in one morning; it never touches `batch_key` or `sent_count`, so the approval
 * cadence keeps its own count.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { STATE_TABLE } from '@/lib/reminders/state'
import type { OnboardingState, Stage } from './cadence'

/** A table that is not there, and a column that is not there: both are "not installed yet". */
const MISSING = new Set(['42P01', '42703', 'PGRST202', 'PGRST204', 'PGRST205'])

export interface StoredOnboardingState extends OnboardingState {
  /** The row's version: a claim only wins against the version it read. */
  version: string | null
  /** `last_sent_at` exactly as it was read, so releasing a claim puts it back as it was. */
  sharedLastSentAt: string | null
}
export type OnboardingRead =
  | { status: 'ok'; state: StoredOnboardingState | null }
  | { status: 'unavailable' }
  | { status: 'failed' }

const isStage = (v: unknown): v is Stage => v === 'connect' || v === 'publish'
const iso = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const later = (a: string | null, b: string | null): string | null => {
  if (!a) return b
  if (!b) return a
  return Date.parse(a) >= Date.parse(b) ? a : b
}

export async function readOnboardingState(admin: ServiceRoleClient, projectId: string, ownerId: string): Promise<OnboardingRead> {
  const { data, error } = await admin.from(STATE_TABLE)
    .select('reminders_enabled, last_sent_at, onboarding_stage, onboarding_sent_count, onboarding_last_sent_at, updated_at')
    .eq('project_id', projectId).eq('user_id', ownerId).maybeSingle()
  if (error) return MISSING.has(String((error as { code?: unknown }).code ?? '')) ? { status: 'unavailable' } : { status: 'failed' }
  if (!data) return { status: 'ok', state: null }
  const r = data as Record<string, unknown>
  const setupAt = iso(r.onboarding_last_sent_at)
  return {
    status: 'ok',
    state: {
      enabled: r.reminders_enabled !== false,
      stage: isStage(r.onboarding_stage) ? r.onboarding_stage : null,
      sentCount: typeof r.onboarding_sent_count === 'number' ? r.onboarding_sent_count : 0,
      lastSentAt: setupAt,
      lastAnyAt: later(setupAt, iso(r.last_sent_at)),
      version: iso(r.updated_at),
      sharedLastSentAt: iso(r.last_sent_at),
    },
  }
}

/**
 * Take the right to send ONE setup email: record it as sent, but only if nobody wrote the row
 * since it was read (a second cron tick, an unsubscribe in between). The claim comes BEFORE
 * the send, so a crash can lose an email but never doubles one.
 */
export async function claimOnboardingSend(
  admin: ServiceRoleClient, projectId: string, ownerId: string, prior: StoredOnboardingState | null,
  next: { stage: Stage; sentCount: number; at: string },
): Promise<boolean> {
  const fields = {
    onboarding_stage: next.stage,
    onboarding_sent_count: next.sentCount,
    onboarding_last_sent_at: next.at,
    last_sent_at: next.at,
    updated_at: next.at,
  }
  if (!prior || !prior.version) {
    const { error } = await admin.from(STATE_TABLE).insert({ project_id: projectId, user_id: ownerId, reminders_enabled: true, ...fields })
    return !error
  }
  const { data, error } = await admin.from(STATE_TABLE).update(fields)
    .eq('project_id', projectId).eq('user_id', ownerId).eq('updated_at', prior.version).eq('reminders_enabled', true)
    .select('project_id')
  return !error && Array.isArray(data) && data.length === 1
}

/** Undo a claim whose email was not accepted, so a later tick may try again. */
export async function releaseOnboardingClaim(
  admin: ServiceRoleClient, projectId: string, ownerId: string, prior: StoredOnboardingState | null, claimedAt: string,
): Promise<void> {
  const back: StoredOnboardingState = prior
    ?? { stage: null, sentCount: 0, lastSentAt: null, lastAnyAt: null, enabled: true, version: null, sharedLastSentAt: null }
  await admin.from(STATE_TABLE)
    .update({
      onboarding_stage: back.stage,
      onboarding_sent_count: back.sentCount,
      onboarding_last_sent_at: back.lastSentAt,
      last_sent_at: back.sharedLastSentAt,
      updated_at: back.version ?? claimedAt,
    })
    .eq('project_id', projectId).eq('user_id', ownerId).eq('updated_at', claimedAt)
}
