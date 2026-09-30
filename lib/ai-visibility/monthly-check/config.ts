/**
 * THE AUTOMATIC MONTHLY AI CHECK: every number it runs on, in one place.
 *
 * The owner approved it on 2026-09-29 (decision "אוטומטי חודשי", UX review
 * section B): once per usage period, a few of the project's most valuable
 * tracked questions are checked on ChatGPT, Gemini and Google AI Mode, so the
 * trend on the AI tab is real without the customer picking engines.
 *
 * WHAT IT NEVER CHANGES. The plan's AI-check allowance (X, lib/plans/catalog.ts)
 * and the "up to X" promise stay as they are. An automatic check is reserved
 * through the same reserve_usage('ai_check') call and the same usage period as a
 * manual one, so it is counted exactly like one. It is never extra, and it never
 * takes the last KEEP_LAST_CHECKS checks of the period, which stay for the
 * customer.
 *
 * WHY ONE CONSTANT. The per-plan question counts are product copy as much as
 * code (the pricing page and the AI tab describe them). They live only in
 * MONTHLY_AI_CHECK, pinned by lib/ai-visibility/__qa__/monthly-check.qa.ts, and
 * the runtime cap `maxShareOfAllowance` keeps them inside the allowance even if
 * an allowance ever changes: the questions shrink, the allowance never grows.
 *
 * Pure and client-safe: no database, no request, no secret.
 */
import type { PlanCode } from '@/lib/plans/catalog'
import { engineSupportsCountry } from '../providers/scrapellm'

export const MONTHLY_AI_CHECK = {
  /** Tracked questions checked automatically per project per period (each on every monthly engine). Trial: none. */
  questionsPerPlan: { regular: 1, advanced: 2, premium: 2, large_agency: 3 } as Readonly<Record<PlanCode, number>>,
  /** Questions × engines may never take more than this share of the plan's X. */
  maxShareOfAllowance: 0.3,
  /** The last checks of the period are never used by the automatic check. */
  keepLastChecks: 2,
  /** The check is due this many days after the usage period starts. */
  startAfterDays: 3,
  /** The cron keeps trying (a retry, a batch cut short) for this many days after it is due. */
  windowDays: 10,
  /** A question on an engine checked (manually or automatically) this recently is not checked again. */
  recentPairDays: 21,
  /** No sign-in to the account for this long: the month is skipped, to save cost. */
  inactiveAfterDays: 30,
} as const

/** The fewest and the most questions a plan checks automatically (the AI tab's administrator view names the range). */
export function monthlyQuestionRange(): { min: number; max: number } {
  const counts = Object.values(MONTHLY_AI_CHECK.questionsPerPlan).filter((n) => n > 0)
  return counts.length ? { min: Math.min(...counts), max: Math.max(...counts) } : { min: 0, max: 0 }
}

/** The engines of the monthly check, in the order they are run. */
export const MONTHLY_CORE_ENGINES = ['chatgpt', 'gemini', 'google_ai_mode'] as const
/** Takes the place of a core engine the project's country does not support (JP, TW). */
export const MONTHLY_SUBSTITUTE_ENGINE = 'perplexity'

const DAY_MS = 86_400_000
/** The hour (UTC) of the 06:00 schedule cron (vercel.json) that runs the check. */
export const CRON_HOUR_UTC = 6

/**
 * The engines for a project's country: the three core engines, each one the
 * country does not support replaced by Perplexity, without repeats.
 */
export function monthlyEngines(country: string | null | undefined): string[] {
  const out: string[] = []
  for (const engine of MONTHLY_CORE_ENGINES) {
    const use = engineSupportsCountry(engine, country) ? engine : MONTHLY_SUBSTITUTE_ENGINE
    if (!out.includes(use) && engineSupportsCountry(use, country)) out.push(use)
  }
  return out
}

/**
 * How many questions a plan checks automatically, capped so questions × engines
 * stays within maxShareOfAllowance of the allowance. 0 for a plan without an
 * automatic check (trial, or anything not in the table).
 */
export function monthlyQuestionCount(plan: string, allowance: number, engineCount: number): number {
  const configured = (MONTHLY_AI_CHECK.questionsPerPlan as Record<string, number>)[plan] ?? 0
  if (configured <= 0 || engineCount <= 0 || !(allowance > 0)) return 0
  const cap = Math.floor((allowance * MONTHLY_AI_CHECK.maxShareOfAllowance) / engineCount)
  return Math.max(0, Math.min(configured, cap))
}

/** The idempotency-key prefix of every automatic reservation in usage_reservations. */
export const SCHEDULED_KEY_PREFIX = 'scheduled:'

/**
 * ONE KEY PER PROJECT, PERIOD, QUESTION AND ENGINE. reserve_usage takes an
 * advisory lock on it and returns the existing row for a repeat, so a retry, a
 * second cron invocation or a "run now" beside the cron can never reserve (and
 * so never dispatch) the same check twice in one period.
 * The period is its start in epoch ms: an ISO string would put ':' inside a key
 * that is read back by splitting on ':'.
 */
export function scheduledKey(projectId: string, periodStart: Date, promptId: string, engine: string): string {
  return `${SCHEDULED_KEY_PREFIX}${projectId}:${periodStart.getTime()}:${promptId}:${engine}`
}

export function parseScheduledKey(key: string | null | undefined): { projectId: string; periodStartMs: number; promptId: string; engine: string } | null {
  if (typeof key !== 'string' || !key.startsWith(SCHEDULED_KEY_PREFIX)) return null
  const parts = key.slice(SCHEDULED_KEY_PREFIX.length).split(':')
  if (parts.length !== 4) return null
  const periodStartMs = Number(parts[1])
  if (!parts[0] || !parts[2] || !parts[3] || !Number.isFinite(periodStartMs)) return null
  return { projectId: parts[0], periodStartMs, promptId: parts[2], engine: parts[3] }
}

/** When a period's check is due. */
export function monthlyDueAt(periodStart: Date): Date {
  return new Date(periodStart.getTime() + MONTHLY_AI_CHECK.startAfterDays * DAY_MS)
}

/** The first run of the 06:00 UTC cron at or after `at`. */
export function cronTickAtOrAfter(at: Date): Date {
  const d = new Date(Date.UTC(at.getUTCFullYear(), at.getUTCMonth(), at.getUTCDate(), CRON_HOUR_UTC, 0, 0, 0))
  return d.getTime() >= at.getTime() ? d : new Date(d.getTime() + DAY_MS)
}

export const MONTHLY_DAY_MS = DAY_MS
