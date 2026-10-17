/**
 * What the project settings screen reads and writes, beyond the project row
 * itself: the business profile and the audiences the seeding scan fills
 * (supabase/migrations/20260927000000_project_seed_scan.sql), where every field
 * carries its source, and the state of the site scan behind them.
 *
 * THE SOURCE CONTRACT (shared with lib/seed-scan/settings.ts): a field the scan
 * filled is 'scan'; an owner's edit, or an AI suggestion the owner confirmed,
 * makes it 'user'; and the scan never overwrites a 'user' field.
 */
import type { CommerceType } from '@/lib/free-check'

export type FieldSource = 'scan' | 'user'
export type { CommerceType }

export const COMMERCE_TYPES: readonly CommerceType[] = ['product', 'service', 'content', 'other']

/** Profile fields the owner edits on the settings screen. `detected_platform` is the scan's alone. */
export const EDITABLE_PROFILE_FIELDS = ['description', 'commerce_type', 'niche', 'is_local'] as const
export type EditableProfileField = (typeof EDITABLE_PROFILE_FIELDS)[number]

/** Project columns the scan may fill, which the business-details card edits. */
export const BUSINESS_FIELDS = ['business_name', 'country', 'language', 'city'] as const
export type BusinessField = (typeof BUSINESS_FIELDS)[number]

/** The table limits (CHECK constraints), enforced before a write. */
export const MAX_DESCRIPTION_CHARS = 1_500
export const MAX_NICHE_CHARS = 120
export const MAX_AUDIENCE_CHARS = 300
export const MAX_BUSINESS_NAME_CHARS = 200

export type ProfileValues = {
  description: string | null
  commerce_type: CommerceType | null
  niche: string | null
  is_local: boolean | null
}

export type ProfileView = ProfileValues & {
  /** Read off the site by the scan; a hint for the connection card, never edited here. */
  detected_platform: string | null
  /** Every field's source, as stored: only 'scan' or 'user' values survive the read. */
  sources: Partial<Record<string, FieldSource>>
}

export type AudienceView = { id: string; label: string; source: FieldSource }

/** A table the screen needs, read or not. `unavailable` hides the sections that need it. */
export type Readable<T> = { state: 'ok'; value: T } | { state: 'unavailable' }

export type RescanView = {
  /** The project's latest seed run, or null when it was never scanned. */
  latest: {
    status: 'running' | 'done' | 'partial' | 'failed'
    stage: 'a' | 'b'
    /** Running with its worker's lease still held. A lapsed one is not "in progress". */
    live: boolean
    createdAt: string
    finishedAt: string | null
  } | null
  /** When the next scan may start (the route's 24-hour rule); null when it may start now. */
  availableAt: string | null
}

/** Everything the settings screen shows beyond the project row. */
export type SettingsData = {
  /** The seeding scan is on for this user: ENABLE_SEED_SCAN=true, or an administrator. */
  seedScan: boolean
  profile: Readable<ProfileView | null>
  audiences: Readable<AudienceView[]>
  /** Competitor domains the scan itself added (step a4). Empty when the scan is off or unreadable. */
  scanCompetitors: string[]
  /** Null when the scan is off for this user or its tables cannot be read. */
  rescan: RescanView | null
}

/** What each part of the screen may show, decided once from the data (see settingsVisibility). */
export type SettingsVisibility = {
  /** Row 2: description and commerce type. */
  profileCard: boolean
  /** Row 3: niche, local, audiences. */
  audienceCard: boolean
  /** "From the scan" chips, "detect again with AI", the rescan strip and the platform hint. */
  seedFeatures: boolean
}

// ── Save inputs ─────────────────────────────────────────────────────────────

export type AudienceInput = { id?: string; label: string }

export type SectionSaveInput = {
  /** Only the fields the owner changed, or confirmed from a suggestion. Each becomes 'user'. */
  profile?: Partial<ProfileValues>
  /** When present, the whole list as it should be, in order. */
  audiences?: AudienceInput[]
}

export const SAVE_ERROR_CODES = [
  'unauthorized',
  'not_found',
  'invalid_request',
  'too_many_audiences',
  'unavailable',
  'save_failed',
] as const
export type SaveErrorCode = (typeof SAVE_ERROR_CODES)[number]

export type SaveResult = { ok: true; data: SettingsData } | { ok: false; code: SaveErrorCode }

// ── "Detect again with AI" ─────────────────────────────────────────────────

/** The three sections whose fields the model produces. Competitors are found by search, not by the model. */
export const REDETECT_SECTIONS = ['business', 'profile', 'audience'] as const
export type RedetectSection = (typeof REDETECT_SECTIONS)[number]

export type BusinessSuggestion = Partial<{ business_name: string; country: string; language: string }>
export type ProfileSuggestion = Partial<{ description: string; commerce_type: CommerceType }>
export type AudienceSuggestion = Partial<{ niche: string; is_local: boolean; audiences: string[] }>

export type RedetectSuggestions = {
  business: BusinessSuggestion
  profile: ProfileSuggestion
  audience: AudienceSuggestion
}

/** Stable codes the redetect route answers with. The screen maps each to one message. */
export const REDETECT_ERROR_CODES = [
  'invalid_request',
  'unauthorized',
  'not_found',
  'entitlement_required',
  'entitlement_unavailable',
  'run_in_progress',
  'scan_required',
  'redetect_in_progress',
  'redetect_daily_cap',
  'model_unavailable',
  'model_failed',
  'unavailable',
  'internal',
] as const
export type RedetectErrorCode = (typeof REDETECT_ERROR_CODES)[number]

export type RedetectResponse =
  | { ok: true; section: 'business'; suggestions: BusinessSuggestion }
  | { ok: true; section: 'profile'; suggestions: ProfileSuggestion }
  | { ok: true; section: 'audience'; suggestions: AudienceSuggestion }
  | { ok: false; code: RedetectErrorCode; retryAfterSeconds?: number }
