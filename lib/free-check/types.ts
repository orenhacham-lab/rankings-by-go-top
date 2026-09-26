/** Shared shape of a free-site-check result, from the API to the UI. */
import type { Locale } from '@/lib/i18n/locales'

export type FindingSeverity = 'blocker' | 'warning' | 'info'

export type FreeCheckFinding = {
  /** Stable id — the UI keys and the QA suites assert on this, not on copy. */
  id: string
  severity: FindingSeverity
  title: string
  detail: string
  /** Measured evidence for the claim, e.g. "12 of 48 images". Never a raw error. */
  evidence?: string
}

export type GeoSignal = { id: string; ok: boolean; title: string; detail: string }

export type FreeCheckBusiness = {
  summary: string
  audiences: string[]
  /** Short niche label, e.g. "בשמים יוקרתיים אונליין". */
  niche: string | null
  /** Detected CMS/platform when the page gives it away, else null. */
  platform: string | null
}

export type FreeCheckResult = {
  url: string
  domain: string
  scannedAt: string
  locale: Locale
  /** null when the model was unavailable or capped — the check still returns. */
  business: FreeCheckBusiness | null
  keywords: string[]
  articles: string[]
  competitors: string[]
  /** How many more competitors the account opens. */
  lockedCompetitors: number
  findings: FreeCheckFinding[]
  /** How many findings stay behind signup. */
  lockedFindings: number
  geo: { passed: number; total: number; signals: GeoSignal[] }
  counters: { keywords: number; fixes: number; geoPassed: number; geoTotal: number; articles: number }
  /** True when this run spent a model call (false on a cache hit or a cap). */
  aiUsed: boolean
  cached: boolean
}

export type FreeCheckErrorCode =
  | 'invalid_url'
  | 'blocked_url'
  | 'unreachable'
  | 'not_html'
  | 'rate_limited'
  | 'daily_cap'
  | 'internal'

export type FreeCheckResponse = { ok: true; result: FreeCheckResult } | { ok: false; code: FreeCheckErrorCode }
