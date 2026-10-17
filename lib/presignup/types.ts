/**
 * The research before sign-up: shapes shared by the anonymous run, its API and
 * the free-check screen.
 *
 * A visitor types their site's address on the free check. With the research
 * on (lib/onboarding/availability.ts presignupResearchOn) the whole of the
 * seed scan's stage A runs for them: the site read, the business understood
 * by one model call, every finding and the AI-readiness checks, competitors
 * checked against real searches. They watch its four steps, then see nearly
 * all of the research summary. What stays locked is the rest of the
 * competitors, the rest of the keywords (and every keyword's search volume,
 * which only stage B measures), and tracking. "Open the full research, free"
 * is the sign-up itself, carrying the free check's one-time claim token; the
 * first project is then seeded from this very run, with no second scan.
 *
 * Everything that crosses the API is a stable code or a value we produced.
 * Provider text never reaches a response, a stored row or a log line.
 */
import type { SeedStepStatus, SeedSummary } from '@/lib/seed-scan/types'

export type ResearchStep = 'a1' | 'a2' | 'a3' | 'a4'

/** One step as the visitor's screen sees it. */
export type ResearchStepView = {
  step: ResearchStep
  status: SeedStepStatus
  errorCode: string | null
  itemCount: number | null
}

/**
 * The research as the visitor may see it before sign-up. `summary` is the
 * run's snapshot with the locked parts CUT OUT, not hidden: the competitors
 * and keywords beyond the preview are not in it, only counted in `locked`.
 */
export type ResearchView = {
  summary: SeedSummary
  steps: ResearchStepView[]
  locked: { competitors: number; keywords: number }
}

/** Stable codes the research API answers with. The screen maps each to copy. */
export const RESEARCH_ERROR_CODES = [
  'not_found',
  'invalid_url',
  'blocked_url',
  'unreachable',
  'not_html',
  'forbidden',
  'rate_limited',
  'daily_cap',
  'unavailable',
  'internal',
] as const
export type ResearchErrorCode = (typeof RESEARCH_ERROR_CODES)[number]

/**
 * One line of the research's answer (newline-delimited JSON). A step line
 * each time a step starts or ends, then exactly one `result` or `error`.
 * `claimToken` rides the sign-up link and nothing else.
 */
export type ResearchEvent =
  | { type: 'step'; step: ResearchStepView }
  | { type: 'result'; view: ResearchView; claimToken: string | null }
  | { type: 'error'; code: ResearchErrorCode }

/** A refusal before the research starts, as a plain JSON answer. */
export type ResearchRefusal = { ok: false; code: ResearchErrorCode }

/** Stable codes of "email me the report". */
export const REPORT_REQUEST_CODES = ['saved', 'not_found', 'invalid_request', 'consent_required', 'invalid_email', 'invalid_claim', 'rate_limited', 'unavailable', 'internal'] as const
export type ReportRequestCode = (typeof REPORT_REQUEST_CODES)[number]
export type ReportRequestResponse = { ok: true; code: 'saved' } | { ok: false; code: Exclude<ReportRequestCode, 'saved'> }
