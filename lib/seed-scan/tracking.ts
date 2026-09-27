/**
 * Tracking the keywords the merchant chose (POST { action: 'continue' }).
 *
 * THROUGH THE KEYWORDS TAB'S OWN PATH. The keywords are added by the very
 * server action the keywords tab submits in bulk mode,
 * createBulkTrackingTargetsAction (app/actions/tracking-targets.ts), with the
 * form the tab sends by default: Google search, the project's domain, the
 * project's location. Its session check, ownership check, entitlement read and
 * keyword-per-project limit therefore apply exactly as they do in the tab;
 * nothing here inserts into tracking_targets or counts a quota itself.
 *
 * The action throws on every refusal, with copy meant for the tab. Only the
 * error's class is read here (KeywordQuotaError for the per-project limit) and
 * the one message the action builds for an entitlement outage; anything else
 * is keywords_add_failed. No error text is returned or logged.
 *
 * Afterwards the new rows are read back (the service role, filtered by the
 * owner) so step b6 checks exactly those keywords and nothing else.
 */
import { buildEntitlementUnavailableError, KeywordQuotaError } from '@/lib/quota'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import { MAX_CONTINUE_KEYWORDS, type SeedScope, type SeedTrackingOutcome } from './types'

/** The keywords tab's bulk server action. */
export type BulkTrackingAction = (formData: FormData) => Promise<{ created: number; skipped: number }>

export type SeedTrackingResult = { outcome: SeedTrackingOutcome; targetIds: string[] }

const normalized = (k: string) => k.trim().toLowerCase()

function isQuotaRefusal(err: unknown): boolean {
  if (err instanceof KeywordQuotaError) return true
  // The same class loaded twice (another bundle) still carries its code.
  return !!err && typeof err === 'object' && (err as { code?: unknown }).code === 'QUOTA_KEYWORDS_PER_PROJECT'
}

/**
 * Add `keywords` to the project's tracking through the tab's action. Never
 * throws: every refusal is a code, and the caller carries on either way.
 */
export async function addSeedKeywords(
  admin: ServiceRoleClient,
  scope: SeedScope,
  input: { keywords: string[]; targetDomain: string | null },
  action: BulkTrackingAction,
): Promise<SeedTrackingResult> {
  const keywords: string[] = []
  for (const raw of input.keywords) {
    const k = raw.trim()
    if (k && !keywords.some((x) => normalized(x) === normalized(k))) keywords.push(k)
  }
  const chosen = keywords.slice(0, MAX_CONTINUE_KEYWORDS)
  const outcome = (added: number, code: SeedTrackingOutcome['code']): SeedTrackingOutcome => ({ requested: chosen.length, added, code })
  if (chosen.length === 0) return { outcome: outcome(0, 'no_keywords_selected'), targetIds: [] }

  // What is tracked already: the action skips those itself, and refuses a
  // batch in which nothing is new, so they are told apart here first.
  const existing = await admin.from('tracking_targets').select('keyword').eq('project_id', scope.projectId).eq('user_id', scope.userId)
  if (existing.error) return { outcome: outcome(0, 'keywords_add_failed'), targetIds: [] }
  const tracked = new Set(((existing.data as { keyword: string | null }[] | null) ?? []).map((r) => normalized(r.keyword ?? '')))
  const fresh = chosen.filter((k) => !tracked.has(normalized(k)))
  if (fresh.length === 0) return { outcome: outcome(0, 'keywords_already_tracked'), targetIds: [] }

  // The form the keywords tab submits in bulk mode, with its defaults.
  const form = new FormData()
  form.set('project_id', scope.projectId)
  form.set('keywords', fresh.join('\n'))
  form.set('engine_type', 'google_search')
  form.set('target_domain', input.targetDomain ?? '')
  form.set('preferred_landing_page', '')
  form.set('location_mode', 'project')
  form.set('notes', '')
  try {
    await action(form)
  } catch (err) {
    if (isQuotaRefusal(err)) return { outcome: outcome(0, 'keyword_quota_exceeded'), targetIds: [] }
    if (err instanceof Error && err.message === buildEntitlementUnavailableError().error) {
      return { outcome: outcome(0, 'keyword_entitlement_unavailable'), targetIds: [] }
    }
    return { outcome: outcome(0, 'keywords_add_failed'), targetIds: [] }
  }

  // The rows the action just created: what b6 checks.
  const added = await admin
    .from('tracking_targets')
    .select('id, keyword')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .in('keyword', fresh)
  const rows = added.error ? [] : ((added.data as { id: string; keyword: string }[] | null) ?? [])
  const targetIds = fresh
    .map((k) => rows.find((r) => typeof r.keyword === 'string' && normalized(r.keyword) === normalized(k))?.id)
    .filter((id): id is string => typeof id === 'string')
  return { outcome: outcome(targetIds.length || fresh.length, 'keywords_added'), targetIds }
}
