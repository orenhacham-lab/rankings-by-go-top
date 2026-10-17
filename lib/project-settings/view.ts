/**
 * Pure decisions the settings screen makes from its data: which sections and
 * which scan features it shows, how a wait reads, which message an API answer
 * becomes, and which AI suggestions are worth confirming. No I/O, safe in the
 * browser, and exercised directly by lib/project-settings/__qa__.
 */
import type { Locale } from '@/lib/i18n/locales'
import {
  COMMERCE_TYPES,
  MAX_AUDIENCE_CHARS,
  REDETECT_ERROR_CODES,
  type AudienceSuggestion,
  type AudienceView,
  type BusinessSuggestion,
  type CommerceType,
  type ProfileSuggestion,
  type ProfileValues,
  type RedetectErrorCode,
  type SettingsData,
  type SettingsVisibility,
} from './types'

// ── What the screen shows ───────────────────────────────────────────────────

/**
 * One decision for the whole screen.
 *
 *   - Row 2 needs project_profiles; row 3 needs it and project_audiences. A
 *     table that cannot be read (Production before its migration) hides the
 *     section that needs it, and nothing else.
 *   - Everything that exists only because of the scan (the "from the scan"
 *     chips, "detect again with AI", the rescan strip, the platform hint)
 *     needs the scan to be on for this user AND all of its tables readable.
 *     With the scan off the manual sections still work.
 *   - No data at all (still loading, or the load failed) is the screen as it
 *     was before any of this: the business card and the connections.
 */
export function settingsVisibility(data: SettingsData | null): SettingsVisibility {
  const profileCard = data?.profile.state === 'ok'
  const audienceCard = profileCard && data?.audiences.state === 'ok'
  const seedFeatures = !!data && data.seedScan && audienceCard && data.rescan !== null
  return { profileCard, audienceCard, seedFeatures }
}

// ── Copy ────────────────────────────────────────────────────────────────────

/** A copy string with its `{name}` tokens replaced; a token with no value stays as written. */
export function fill(template: string, vars: Record<string, string | number>): string {
  return template.replace(/\{(\w+)\}/g, (token, key: string) => (key in vars ? String(vars[key]) : token))
}

function displayName(code: string, type: 'region' | 'language', locale: Locale): string {
  try {
    return new Intl.DisplayNames([locale === 'he' ? 'he' : 'en'], { type }).of(code) ?? code
  } catch {
    return code
  }
}

/** "IL" as "ישראל" / "Israel"; the code itself when the platform does not know it. */
export const regionName = (code: string, locale: Locale) => displayName(code.toUpperCase(), 'region', locale)
/** "he" as "עברית" / "Hebrew"; the code itself when the platform does not know it. */
export const languageName = (code: string, locale: Locale) => displayName(code.toLowerCase(), 'language', locale)

/**
 * A select's options with the current value kept. The business card offers a
 * few countries and languages, but the scan (and an older form) can store any
 * ISO code; a select without that value shows its first option instead, and
 * saving would silently replace the stored market with it.
 */
export function withCurrentOption(
  options: { value: string; label: string }[],
  current: string | null | undefined,
  label: (code: string) => string,
): { value: string; label: string }[] {
  if (!current || options.some((o) => o.value === current)) return options
  return [...options, { value: current, label: label(current) }]
}

// ── Time ────────────────────────────────────────────────────────────────────

const HOUR_S = 3_600

/**
 * "in 5 hours" / "בעוד 5 שעות", rounded up so the wait is never understated.
 * Written out rather than Intl.RelativeTimeFormat: Node's Hebrew data renders
 * one hour as "בעוד שעה (1)", which is not how anyone writes it.
 */
export function formatWait(seconds: number, locale: Locale): string {
  const s = Number.isFinite(seconds) && seconds > 0 ? seconds : 60
  if (s < HOUR_S) {
    const m = Math.max(1, Math.ceil(s / 60))
    if (locale === 'he') return m === 1 ? 'בעוד דקה' : m === 2 ? 'בעוד שתי דקות' : `בעוד ${m} דקות`
    return m === 1 ? 'in 1 minute' : `in ${m} minutes`
  }
  const h = Math.ceil(s / HOUR_S)
  if (locale === 'he') return h === 1 ? 'בעוד שעה' : h === 2 ? 'בעוד שעתיים' : `בעוד ${h} שעות`
  return h === 1 ? 'in 1 hour' : `in ${h} hours`
}

/** "3 hours ago" / "לפני 3 שעות"; a date once it is more than a week old. */
export function formatAgo(iso: string, now: Date, locale: Locale): string {
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t)) return ''
  const s = Math.max(0, Math.floor((now.getTime() - t) / 1000))
  const he = locale === 'he'
  if (s < 60) return he ? 'לפני רגע' : 'just now'
  const m = Math.floor(s / 60)
  if (m < 60) return he ? (m === 1 ? 'לפני דקה' : m === 2 ? 'לפני שתי דקות' : `לפני ${m} דקות`) : m === 1 ? '1 minute ago' : `${m} minutes ago`
  const h = Math.floor(m / 60)
  if (h < 24) return he ? (h === 1 ? 'לפני שעה' : h === 2 ? 'לפני שעתיים' : `לפני ${h} שעות`) : h === 1 ? '1 hour ago' : `${h} hours ago`
  const d = Math.floor(h / 24)
  if (d <= 7) return he ? (d === 1 ? 'אתמול' : d === 2 ? 'לפני יומיים' : `לפני ${d} ימים`) : d === 1 ? 'yesterday' : `${d} days ago`
  return new Intl.DateTimeFormat(he ? 'he-IL' : 'en-US', { dateStyle: 'medium' }).format(new Date(t))
}

/** Seconds from `now` until `iso`, at least 1; null when `iso` is not in the future. */
export function secondsUntil(iso: string | null | undefined, now: Date): number | null {
  if (!iso) return null
  const t = new Date(iso).getTime()
  if (!Number.isFinite(t) || t <= now.getTime()) return null
  return Math.max(1, Math.ceil((t - now.getTime()) / 1000))
}

/** A Retry-After header (seconds) or the body's retryAfterSeconds; null when neither is a positive number. */
export function retryAfterFrom(header: string | null, body: unknown): number | null {
  const fromHeader = Number(header)
  if (Number.isFinite(fromHeader) && fromHeader > 0) return Math.ceil(fromHeader)
  const fromBody = (body as { retryAfterSeconds?: unknown } | null)?.retryAfterSeconds
  return typeof fromBody === 'number' && Number.isFinite(fromBody) && fromBody > 0 ? Math.ceil(fromBody) : null
}

// ── The rescan answer, as one message ───────────────────────────────────────

/**
 * Every answer POST /api/projects/[id]/seed can give a rescan, as ONE notice
 * with at most one action. Codes are the route's (lib/seed-scan/http.ts); an
 * unknown code, a network failure or a 5xx all read as "could not start".
 */
export type RescanNotice =
  | { kind: 'started' }
  | { kind: 'in_progress' }
  | { kind: 'too_soon'; wait: number }
  | { kind: 'user_cap'; wait: number }
  | { kind: 'global_cap'; wait: number }
  | { kind: 'entitlement' }
  | { kind: 'entitlement_unavailable' }
  | { kind: 'signed_out' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }
  // Not answers of the route: what the screen saw while it followed the run.
  | { kind: 'finished' }
  | { kind: 'slow' }

/** The action a notice offers, if any. Never more than one. */
export type NoticeAction = 'retry' | 'plans' | 'refresh' | 'rescan' | null

export function rescanNotice(status: number, code: unknown, retryAfter: number | null): RescanNotice {
  if (status === 202) return { kind: 'started' }
  const wait = retryAfter ?? 3_600
  switch (code) {
    case 'run_in_progress':
      return { kind: 'in_progress' }
    case 'rescan_too_soon':
      return { kind: 'too_soon', wait }
    case 'user_daily_cap':
      return { kind: 'user_cap', wait }
    case 'global_daily_cap':
      return { kind: 'global_cap', wait }
    case 'entitlement_required':
      return { kind: 'entitlement' }
    case 'entitlement_unavailable':
      return { kind: 'entitlement_unavailable' }
    case 'unauthorized':
      return { kind: 'signed_out' }
    case 'not_found':
      return { kind: 'unavailable' }
    default:
      return { kind: 'failed' }
  }
}

export function rescanNoticeAction(notice: RescanNotice): NoticeAction {
  switch (notice.kind) {
    case 'entitlement':
      return 'plans'
    case 'entitlement_unavailable':
    case 'failed':
      return 'retry'
    case 'signed_out':
      return 'refresh'
    default:
      return null
  }
}

// ── The redetect answer, as one message ────────────────────────────────────

export type RedetectNotice =
  | { kind: 'scan_required' }
  | { kind: 'run_in_progress' }
  | { kind: 'in_progress' }
  | { kind: 'daily_cap'; wait: number }
  | { kind: 'entitlement' }
  | { kind: 'signed_out' }
  | { kind: 'unavailable' }
  | { kind: 'failed' }

export function knownRedetectCode(code: unknown): RedetectErrorCode | null {
  return (REDETECT_ERROR_CODES as readonly unknown[]).includes(code) ? (code as RedetectErrorCode) : null
}

export function redetectNotice(code: RedetectErrorCode | null, retryAfter: number | null): RedetectNotice {
  switch (code) {
    case 'scan_required':
      return { kind: 'scan_required' }
    case 'run_in_progress':
      return { kind: 'run_in_progress' }
    case 'redetect_in_progress':
      return { kind: 'in_progress' }
    case 'redetect_daily_cap':
      return { kind: 'daily_cap', wait: retryAfter ?? 3_600 }
    case 'entitlement_required':
      return { kind: 'entitlement' }
    case 'unauthorized':
      return { kind: 'signed_out' }
    case 'not_found':
      return { kind: 'unavailable' }
    default:
      return { kind: 'failed' }
  }
}

export function redetectNoticeAction(notice: RedetectNotice): NoticeAction {
  switch (notice.kind) {
    case 'scan_required':
      return 'rescan'
    case 'entitlement':
      return 'plans'
    case 'signed_out':
      return 'refresh'
    default:
      return null
  }
}

// ── Suggestions worth confirming ────────────────────────────────────────────

export type SuggestionItem<K extends string = string> = {
  key: K
  suggested: string | boolean
  current: string | boolean | null
}

const sameText = (a: string | null | undefined, b: string | null | undefined) =>
  (a ?? '').replace(/\s+/g, ' ').trim().toLowerCase() === (b ?? '').replace(/\s+/g, ' ').trim().toLowerCase()

/** The suggested business fields that differ from the project's own values. */
export function businessSuggestionItems(
  project: { business_name: string | null; country: string | null; language: string | null },
  s: BusinessSuggestion,
): SuggestionItem<'business_name' | 'country' | 'language'>[] {
  const out: SuggestionItem<'business_name' | 'country' | 'language'>[] = []
  if (s.business_name && !sameText(s.business_name, project.business_name)) out.push({ key: 'business_name', suggested: s.business_name, current: project.business_name })
  if (s.country && s.country.toUpperCase() !== (project.country ?? '').toUpperCase()) out.push({ key: 'country', suggested: s.country, current: project.country })
  if (s.language && s.language.toLowerCase() !== (project.language ?? '').toLowerCase()) out.push({ key: 'language', suggested: s.language, current: project.language })
  return out
}

/** The suggested description and commerce type that differ from what is saved. */
export function profileSuggestionItems(current: Pick<ProfileValues, 'description' | 'commerce_type'>, s: ProfileSuggestion): SuggestionItem<'description' | 'commerce_type'>[] {
  const out: SuggestionItem<'description' | 'commerce_type'>[] = []
  if (s.description && !sameText(s.description, current.description)) out.push({ key: 'description', suggested: s.description, current: current.description })
  if (s.commerce_type && isCommerceType(s.commerce_type) && s.commerce_type !== current.commerce_type) {
    out.push({ key: 'commerce_type', suggested: s.commerce_type, current: current.commerce_type })
  }
  return out
}

/** The suggested niche and "local" that differ from what is saved. */
export function audienceSuggestionItems(current: Pick<ProfileValues, 'niche' | 'is_local'>, s: AudienceSuggestion): SuggestionItem<'niche' | 'is_local'>[] {
  const out: SuggestionItem<'niche' | 'is_local'>[] = []
  if (s.niche && !sameText(s.niche, current.niche)) out.push({ key: 'niche', suggested: s.niche, current: current.niche })
  if (typeof s.is_local === 'boolean' && s.is_local !== current.is_local) out.push({ key: 'is_local', suggested: s.is_local, current: current.is_local })
  return out
}

/** Suggested audiences the list does not have yet (case and spacing ignored). */
export function newAudienceSuggestions(existing: Pick<AudienceView, 'label'>[], suggested: string[] | undefined): string[] {
  const out: string[] = []
  for (const raw of suggested ?? []) {
    const label = raw.replace(/\s+/g, ' ').trim().slice(0, MAX_AUDIENCE_CHARS)
    if (!label) continue
    if (existing.some((a) => sameText(a.label, label)) || out.some((o) => sameText(o, label))) continue
    out.push(label)
  }
  return out
}

export function isCommerceType(v: unknown): v is CommerceType {
  return (COMMERCE_TYPES as readonly unknown[]).includes(v)
}

// ── The detected platform, as a hint on the connection card ────────────────

export type PlatformHint = { name: string; connect: 'wordpress' | 'shopify' | 'wix' | null }

/**
 * What the scan read off the site, as the connection card's hint. WooCommerce
 * runs on WordPress, so it points at the WordPress connection; Wix has its own
 * connection too. Anything else is named honestly with no connection to suggest.
 */
export function platformHint(detected: string | null | undefined): PlatformHint | null {
  const name = (detected ?? '').replace(/\s+/g, ' ').trim().slice(0, 40)
  if (!name) return null
  const key = name.toLowerCase()
  if (key === 'wordpress' || key === 'woocommerce') return { name, connect: 'wordpress' }
  if (key === 'shopify') return { name, connect: 'shopify' }
  if (key === 'wix') return { name, connect: 'wix' }
  return { name, connect: null }
}

// ── Competitors ─────────────────────────────────────────────────────────────

/**
 * A typed competitor address as the competitors route stores a domain:
 * lower-case, no scheme, no www, no path. Null when it is not a domain.
 */
export function competitorDomainInput(raw: string): string | null {
  const d = raw
    .trim()
    .toLowerCase()
    .replace(/^[a-z][a-z0-9+.-]*:\/\//, '')
    .replace(/^www\./, '')
    .replace(/[/?#].*$/, '')
    .replace(/\.$/, '')
  if (d.length > 253 || !/^[a-z0-9-]+(\.[a-z0-9-]+)+$/.test(d)) return null
  if (d.split('.').some((label) => !label || label.length > 63 || label.startsWith('-') || label.endsWith('-'))) return null
  return d
}

/** How the settings screen matches a competitor row to a domain: its domain, else its name. */
export function competitorKey(row: { name?: string | null; domain?: string | null }): string | null {
  const pick = (v: string | null | undefined) => (v ? competitorDomainInput(v) : null)
  return pick(row.domain) ?? pick(row.name)
}
