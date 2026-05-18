/**
 * Quota helpers for keyword checks and AI scans.
 *
 * Definitions:
 *   - "Keyword check" = checking one keyword in one engine (Google Organic OR
 *     Google Maps). A scan of 10 keywords across 2 engines = 20 checks.
 *   - "AI scan" = one ai_scan_runs row (one prompt × one engine in current
 *     implementation).
 *
 * Source of truth for counts:
 *   - Keyword checks → rows in `scan_results` (one row per check).
 *   - AI scans      → rows in `ai_scan_runs`.
 *
 * No DB schema change is required: we count from existing tables. This file
 * provides server-side helpers used by /api/scan and /api/ai-visibility/runs
 * and project/keyword/AI-prompt enforcement.
 */

import type { PlanLimits, PlanType } from '@/lib/subscription'

/** Start of the current calendar month (UTC), used as the period boundary. */
export function currentPeriodStart(): Date {
  const d = new Date()
  return new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1, 0, 0, 0, 0))
}

/**
 * Count keyword checks consumed by a single project in the current period.
 * Used for paid plans (per-project per-month enforcement).
 */
export async function countKeywordChecksThisPeriodForProject(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  const periodStart = currentPeriodStart().toISOString()
  const { data: scanRows, error: scanErr } = await supabase
    .from('scans')
    .select('id')
    .eq('project_id', projectId)
    .gte('created_at', periodStart)
  if (scanErr || !scanRows || scanRows.length === 0) return 0
  const ids = (scanRows as Array<{ id: string }>).map((s) => s.id)
  const { count } = await supabase
    .from('scan_results')
    .select('id', { count: 'exact', head: true })
    .in('scan_id', ids)
  return count ?? 0
}

/**
 * Count keyword checks consumed by ALL of a user's scans (lifetime).
 * Used for trial plans (trial budget is lifetime during the 7-day trial).
 */
export async function countKeywordChecksTrialLifetime(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  const { data: scanRows, error: scanErr } = await supabase
    .from('scans')
    .select('id')
    .eq('user_id', userId)
  if (scanErr || !scanRows || scanRows.length === 0) return 0
  const ids = (scanRows as Array<{ id: string }>).map((s) => s.id)
  const { count } = await supabase
    .from('scan_results')
    .select('id', { count: 'exact', head: true })
    .in('scan_id', ids)
  return count ?? 0
}

/**
 * Count AI scan runs in the current period for a single project (paid plans).
 */
export async function countAIScansThisPeriodForProject(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  const periodStart = currentPeriodStart().toISOString()
  const { count } = await supabase
    .from('ai_scan_runs')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .gte('created_at', periodStart)
  return count ?? 0
}

/**
 * Count AI scan runs lifetime across all the user's projects (trial plans).
 */
export async function countAIScansTrialLifetime(
  userId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  const { count } = await supabase
    .from('ai_scan_runs')
    .select('id', { count: 'exact', head: true })
    .eq('user_id', userId)
  return count ?? 0
}

/**
 * Count active tracking_targets for a project — used to estimate the number
 * of keyword checks an upcoming "scan all" will consume. Each active target
 * is one keyword × one engine = one keyword check.
 */
export async function countActiveTargets(
  projectId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<number> {
  const { count } = await supabase
    .from('tracking_targets')
    .select('id', { count: 'exact', head: true })
    .eq('project_id', projectId)
    .eq('is_active', true)
  return count ?? 0
}

/**
 * Check if a tracking target has already been scanned (has any scan_results rows).
 * Used for Trial plan per-target enforcement (one scan per target lifetime).
 */
export async function hasTrialTargetAlreadyBeenScanned(
  targetId: string,
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  const { count } = await supabase
    .from('scan_results')
    .select('id', { count: 'exact', head: true })
    .eq('tracking_target_id', targetId)
  return (count ?? 0) > 0
}

/**
 * Check if any of the given tracking targets have already been scanned.
 * Used for Trial plan Scan All enforcement.
 */
export async function areAnyTrialTargetsAlreadyScanned(
  targetIds: string[],
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  supabase: any
): Promise<boolean> {
  if (targetIds.length === 0) return false
  const { count } = await supabase
    .from('scan_results')
    .select('id', { count: 'exact', head: true })
    .in('tracking_target_id', targetIds)
  return (count ?? 0) > 0
}

// =============================================================================
// Bilingual error builders. We always include `code` + `limit` + `plan` so the
// client can re-render in either language if needed.
// =============================================================================

export type QuotaCode =
  | 'QUOTA_PROJECTS'
  | 'QUOTA_KEYWORDS_PER_PROJECT'
  | 'QUOTA_KEYWORD_CHECKS'
  | 'QUOTA_AI_SCANS'
  | 'QUOTA_TRIAL_TARGET_ALREADY_SCANNED'

export type QuotaErrorPayload = {
  error: string
  errorEn: string
  code: QuotaCode
  limit: number
  plan: PlanType
  planLabel: string
  planLabelEn: string
}

const EN_PLAN_LABEL: Record<PlanType, string> = {
  trial: 'Trial',
  regular: 'Regular',
  advanced: 'Advanced',
  premium: 'Premium',
}

export function buildQuotaError(
  code: QuotaCode,
  plan: PlanType,
  limits: PlanLimits,
  limit: number
): QuotaErrorPayload {
  const planLabel = limits.label
  const planLabelEn = EN_PLAN_LABEL[plan]

  let error = ''
  let errorEn = ''

  switch (code) {
    case 'QUOTA_PROJECTS':
      error = `הגעת למגבלת ${limit} פרויקטים בתוכנית ${planLabel}. שדרג את המנוי להוספת פרויקטים נוספים.`
      errorEn = `You have reached the limit of ${limit} projects on the ${planLabelEn} plan. Upgrade your plan to add more projects.`
      break
    case 'QUOTA_KEYWORDS_PER_PROJECT':
      error = `הגעת למגבלת ${limit} מילות מפתח לפרויקט בתוכנית ${planLabel}. שדרג את המנוי כדי להוסיף מילות מפתח נוספות.`
      errorEn = `You have reached the limit of ${limit} keywords per project on the ${planLabelEn} plan. Upgrade your plan to add more keywords.`
      break
    case 'QUOTA_KEYWORD_CHECKS':
      error = `הגעת למגבלת ${limit} בדיקות מילות מפתח בתוכנית ${planLabel}. שדרג את המנוי כדי להמשיך לבצע סריקות מיקומים.`
      errorEn = `You have reached the limit of ${limit} keyword checks on the ${planLabelEn} plan. Upgrade your plan to continue running ranking scans.`
      break
    case 'QUOTA_AI_SCANS':
      error = `הגעת למגבלת ${limit} סריקות AI בתוכנית ${planLabel}. שדרג את המנוי כדי להמשיך לבצע סריקות AI.`
      errorEn = `You have reached the limit of ${limit} AI scans on the ${planLabelEn} plan. Upgrade your plan to continue running AI scans.`
      break
  }

  return { error, errorEn, code, limit, plan, planLabel, planLabelEn }
}

/**
 * Build error payload for Trial plan per-target re-scan prevention.
 */
export function buildTrialTargetAlreadyScannedError(
  isScanAll: boolean,
  plan: PlanType,
  limits: PlanLimits
): QuotaErrorPayload {
  const planLabel = limits.label
  const planLabelEn = EN_PLAN_LABEL[plan]

  let error = ''
  let errorEn = ''

  if (isScanAll) {
    error = 'חלק ממילות המפתח כבר נסרקו בתוכנית ניסיון. שדרג את המנוי כדי לבצע בדיקות חוזרות.'
    errorEn = 'Some keywords have already been checked on the trial plan. Upgrade your plan to run repeated checks.'
  } else {
    error = 'כבר ביצעת בדיקת מיקום עבור מילת מפתח זו בתוכנית ניסיון. שדרג את המנוי כדי לבצע בדיקות חוזרות.'
    errorEn = 'You have already run a ranking check for this keyword on the trial plan. Upgrade your plan to run repeated checks.'
  }

  return {
    error,
    errorEn,
    code: 'QUOTA_TRIAL_TARGET_ALREADY_SCANNED',
    limit: 1,
    plan,
    planLabel,
    planLabelEn,
  }
}
