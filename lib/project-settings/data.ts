/**
 * The settings screen's server side: what it reads about a project beyond the
 * project row (the business profile, the audiences, the state of the site
 * scan), and the writes it makes. Framework-free, so the whole contract runs
 * under test (lib/project-settings/__qa__); app/(dashboard)/settings/actions.ts
 * only wires the real session in.
 *
 * AS THE OWNER. Every read and write here goes through the signed-in owner's
 * own RLS-scoped client: RLS lets them read and write their project's profile
 * and audiences, and read (never write) its seed runs and steps
 * (supabase/migrations/20260927000000_project_seed_scan.sql). Every query ALSO
 * names the owner, `.eq('project_id', …)` and `.eq('user_id', …)`, and the
 * project itself is read that way first, so a request for someone else's
 * project is not_found before anything else happens. The one question asked
 * with the service role is whether the user is an administrator (isAdmin,
 * which fails closed), the same way the seed route decides it.
 *
 * THE SOURCE CONTRACT, shared with lib/seed-scan/settings.ts:
 *   - a profile field the owner saves becomes 'user', whatever its value (an
 *     emptied field included), and the scan never writes a 'user' field again;
 *   - a business field (business_name, country, language, city) the owner
 *     changes in the business card becomes 'user' the same way;
 *   - the audience list, once the owner saves it, is theirs as a whole
 *     (field_sources.audiences = 'user'): the scan keeps a list the owner
 *     shaped, a deletion or an emptied list included. A row keeps 'scan' until
 *     its own label is edited, so its chip stays true about where it came from;
 *   - before a project's FIRST scan starts from this screen, the business
 *     values it already holds become the owner's (prepareFirstScan): a first
 *     scan is a 'create', which may otherwise replace any value not marked
 *     'user', and on a project created by hand those values are the owner's.
 *
 * CONCURRENCY. The scan may write while the owner saves. The profile is written
 * with a compare-and-set on `updated_at`, the guard the scan uses too, so of
 * two writers the second re-reads: the scan then finds 'user' and keeps it, and
 * a save re-applies only the fields the owner sent.
 *
 * Nothing the database says reaches the screen: every failure is a stable code.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { RESCAN_COOLDOWN_MS } from '@/lib/seed-scan/http'
import { competitorDomainKey, MAX_AUDIENCES } from '@/lib/seed-scan/settings'
import { getLatestSeedRun } from '@/lib/seed-scan/store'
import {
  BUSINESS_FIELDS,
  EDITABLE_PROFILE_FIELDS,
  MAX_AUDIENCE_CHARS,
  MAX_DESCRIPTION_CHARS,
  MAX_NICHE_CHARS,
  type AudienceInput,
  type AudienceView,
  type BusinessField,
  type FieldSource,
  type ProfileValues,
  type ProfileView,
  type Readable,
  type RescanView,
  type SaveErrorCode,
  type SaveResult,
  type SettingsData,
} from './types'
import { isCommerceType } from './view'

// ── Dependencies ────────────────────────────────────────────────────────────

export type SettingsSession = {
  /** The signed-in user, or null. */
  userId: string | null
  /** Their own RLS-scoped client. Everything in this file reads and writes through it. */
  db: SupabaseClient
}

export type SettingsDeps = {
  session: () => Promise<SettingsSession>
  /** Whether the user is an administrator (lib/auth/admin-role.ts isAdminUser). */
  isAdmin: (userId: string) => Promise<boolean>
  env: Record<string, string | undefined>
  now: () => Date
}

export type OwnerScope = { projectId: string; userId: string }

export type LoadErrorCode = 'unauthorized' | 'not_found' | 'unavailable'
export type LoadResult = { ok: true; data: SettingsData } | { ok: false; code: LoadErrorCode }

// ── The owner and their project ─────────────────────────────────────────────

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const PROJECT_COLUMNS = 'id, user_id, business_name, country, language, city'

type OwnerProject = {
  id: string
  user_id: string
  business_name: string | null
  country: string | null
  language: string | null
  city: string | null
}

type Owner =
  | { ok: true; db: SupabaseClient; scope: OwnerScope; project: OwnerProject }
  | { ok: false; code: LoadErrorCode }

/** Signed in, and the project is theirs: read through their own client AND filtered by owner. */
async function owner(deps: SettingsDeps, projectId: unknown): Promise<Owner> {
  let session: SettingsSession
  try {
    session = await deps.session()
  } catch {
    return { ok: false, code: 'unavailable' }
  }
  if (!session.userId) return { ok: false, code: 'unauthorized' }
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return { ok: false, code: 'not_found' }
  const { data, error } = await session.db
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', projectId)
    .eq('user_id', session.userId)
    .maybeSingle()
  if (error) return { ok: false, code: 'unavailable' }
  const project = data as OwnerProject | null
  if (!project || project.user_id !== session.userId) return { ok: false, code: 'not_found' }
  return { ok: true, db: session.db, scope: { projectId: project.id, userId: session.userId }, project }
}

/** The seed scan is on for this user: ENABLE_SEED_SCAN=true, or an administrator. Fails closed. */
async function seedScanOn(deps: SettingsDeps, userId: string): Promise<boolean> {
  if (deps.env.ENABLE_SEED_SCAN === 'true') return true
  try {
    return (await deps.isAdmin(userId)) === true
  } catch {
    return false
  }
}

// ── Reads ───────────────────────────────────────────────────────────────────

const PROFILE_COLUMNS = 'project_id, user_id, description, commerce_type, niche, is_local, detected_platform, field_sources, updated_at'

type ProfileRow = {
  project_id: string
  user_id: string
  description: string | null
  commerce_type: string | null
  niche: string | null
  is_local: boolean | null
  detected_platform: string | null
  field_sources: unknown
  updated_at: string
}

/** Only 'scan' and 'user' survive the read, whatever else the column might ever hold. */
export function cleanSources(v: unknown): Partial<Record<string, FieldSource>> {
  const out: Partial<Record<string, FieldSource>> = {}
  if (!v || typeof v !== 'object' || Array.isArray(v)) return out
  for (const [k, s] of Object.entries(v as Record<string, unknown>)) {
    if (s === 'scan' || s === 'user') out[k] = s
  }
  return out
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v : null)

export function toProfileView(row: ProfileRow): ProfileView {
  return {
    description: text(row.description),
    commerce_type: isCommerceType(row.commerce_type) ? row.commerce_type : null,
    niche: text(row.niche),
    is_local: typeof row.is_local === 'boolean' ? row.is_local : null,
    detected_platform: text(row.detected_platform),
    sources: cleanSources(row.field_sources),
  }
}

async function readProfileRow(db: SupabaseClient, scope: OwnerScope): Promise<ProfileRow | null | 'error'> {
  const { data, error } = await db
    .from('project_profiles')
    .select(PROFILE_COLUMNS)
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error) return 'error'
  return (data as ProfileRow | null) ?? null
}

/** The profile, or `unavailable` when its table cannot be read (the sections that need it then hide). */
export async function readProfile(db: SupabaseClient, scope: OwnerScope): Promise<Readable<ProfileView | null>> {
  const row = await readProfileRow(db, scope)
  if (row === 'error') return { state: 'unavailable' }
  return { state: 'ok', value: row ? toProfileView(row) : null }
}

type AudienceRow = { id: string; label: string; source: string; position: number | null; created_at: string | null }

const byPosition = (a: AudienceRow, b: AudienceRow) =>
  (a.position ?? 0) - (b.position ?? 0) || String(a.created_at ?? '').localeCompare(String(b.created_at ?? '')) || a.id.localeCompare(b.id)

export async function readAudiences(db: SupabaseClient, scope: OwnerScope): Promise<Readable<AudienceView[]>> {
  const { data, error } = await db
    .from('project_audiences')
    .select('id, label, source, position, created_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .order('position', { ascending: true })
  if (error) return { state: 'unavailable' }
  const rows = ((data as AudienceRow[] | null) ?? []).filter((r) => typeof r.id === 'string' && typeof r.label === 'string')
  return {
    state: 'ok',
    value: [...rows].sort(byPosition).map((r) => ({ id: r.id, label: r.label, source: r.source === 'scan' ? 'scan' : 'user' })),
  }
}

/**
 * The project's latest run, and when the next one may start: the seed route's
 * rule (lib/seed-scan/http.ts checkSeedCaps), a run that read the site (done
 * or partial) holds the next one back for 24 hours from its start. Null when
 * the runs cannot be read, which hides everything that depends on the scan.
 */
export async function readRescan(db: SupabaseClient, scope: OwnerScope, now: Date): Promise<RescanView | null> {
  const latest = await getLatestSeedRun(db, scope)
  if (latest === 'error') return null
  const recent = await db
    .from('project_seed_runs')
    .select('created_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .in('status', ['done', 'partial'])
    .gt('created_at', new Date(now.getTime() - RESCAN_COOLDOWN_MS).toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
  if (recent.error) return null
  const newest = ((recent.data as { created_at: string }[] | null) ?? [])
    .map((r) => new Date(r.created_at).getTime())
    .filter((t) => Number.isFinite(t))
    .sort((a, b) => b - a)[0]
  const opensAt = newest === undefined ? null : newest + RESCAN_COOLDOWN_MS
  return {
    latest: latest
      ? {
          status: latest.status,
          stage: latest.stage,
          live: latest.status === 'running' && !!latest.lease_expires_at && new Date(latest.lease_expires_at).getTime() > now.getTime(),
          createdAt: latest.created_at,
          finishedAt: latest.finished_at,
        }
      : null,
    availableAt: opensAt !== null && opensAt > now.getTime() ? new Date(opensAt).toISOString() : null,
  }
}

/** Competitor domains the scan itself added (a4's `added.inserted`), across the project's runs. */
export async function readScanCompetitors(db: SupabaseClient, scope: OwnerScope): Promise<string[]> {
  const { data, error } = await db
    .from('project_seed_steps')
    .select('detail')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('step', 'a4')
    .limit(50)
  if (error) return []
  const out = new Set<string>()
  for (const row of (data as { detail: unknown }[] | null) ?? []) {
    const added = (row.detail as { added?: { inserted?: unknown } } | null)?.added?.inserted
    if (!Array.isArray(added)) continue
    for (const d of added) {
      const key = typeof d === 'string' ? competitorDomainKey(d) : null
      if (key) out.add(key)
    }
  }
  return [...out]
}

async function readSettingsData(deps: SettingsDeps, o: Extract<Owner, { ok: true }>): Promise<SettingsData> {
  const now = deps.now()
  const seedScan = await seedScanOn(deps, o.scope.userId)
  const [profile, audiences] = await Promise.all([readProfile(o.db, o.scope), readAudiences(o.db, o.scope)])
  if (!seedScan) return { seedScan, profile, audiences, scanCompetitors: [], rescan: null }
  const [rescan, scanCompetitors] = await Promise.all([readRescan(o.db, o.scope, now), readScanCompetitors(o.db, o.scope)])
  return { seedScan, profile, audiences, scanCompetitors, rescan }
}

/** Everything the settings screen shows beyond the project row. */
export async function loadSettings(deps: SettingsDeps, projectId: unknown): Promise<LoadResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  return { ok: true, data: await readSettingsData(deps, o) }
}

// ── What a save may carry ───────────────────────────────────────────────────

const isPlainObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === 'object' && !Array.isArray(v)
const CONTROL_CHARS = /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g

/**
 * A text field as it is stored: control characters out, spaces collapsed, and
 * empty as null. `undefined` means the value is not acceptable at all (not a
 * string or null, or longer than the column allows): the request is refused,
 * never silently cut.
 */
function cleanField(raw: unknown, max: number, multiline: boolean): string | null | undefined {
  if (raw === null) return null
  if (typeof raw !== 'string') return undefined
  const s = multiline
    ? raw.replace(/\r\n?/g, '\n').replace(CONTROL_CHARS, '').replace(/[ \t]+/g, ' ').replace(/ *\n */g, '\n').replace(/\n{3,}/g, '\n\n').trim()
    : raw.replace(CONTROL_CHARS, '').replace(/\s+/g, ' ').trim()
  if (s.length > max) return undefined
  return s || null
}

/** Only the editable profile fields, each valid; null when anything else is sent. */
export function readProfilePatch(v: unknown): Partial<ProfileValues> | null {
  if (v === undefined) return {}
  if (!isPlainObject(v)) return null
  const out: Partial<ProfileValues> = {}
  for (const [key, raw] of Object.entries(v)) {
    if (!(EDITABLE_PROFILE_FIELDS as readonly string[]).includes(key)) return null
    if (key === 'description' || key === 'niche') {
      const value = cleanField(raw, key === 'description' ? MAX_DESCRIPTION_CHARS : MAX_NICHE_CHARS, key === 'description')
      if (value === undefined) return null
      out[key] = value
    } else if (key === 'commerce_type') {
      if (raw !== null && !isCommerceType(raw)) return null
      out.commerce_type = raw
    } else {
      if (raw !== null && typeof raw !== 'boolean') return null
      out.is_local = raw as boolean | null
    }
  }
  return out
}

const AUDIENCE_ID = /^[A-Za-z0-9_-]{1,64}$/

/** The audience list as the owner wants it, in order. 'too_many' past MAX_AUDIENCES; null when malformed. */
export function readAudienceList(v: unknown): AudienceInput[] | 'too_many' | null {
  if (!Array.isArray(v) || v.length > 20) return null
  const out: AudienceInput[] = []
  for (const item of v) {
    if (!isPlainObject(item)) return null
    if (Object.keys(item).some((k) => k !== 'id' && k !== 'label')) return null
    const label = cleanField(item.label, MAX_AUDIENCE_CHARS, false)
    if (!label) return null
    const id = item.id
    if (id !== undefined && (typeof id !== 'string' || !AUDIENCE_ID.test(id))) return null
    // The same audience twice is kept once, first place wins, as the scan cleans its own.
    if (out.some((o) => o.label.toLowerCase() === label.toLowerCase())) continue
    out.push(id === undefined ? { label } : { id, label })
  }
  return out.length > MAX_AUDIENCES ? 'too_many' : out
}

type SaveInput = { profile: Partial<ProfileValues>; audiences?: AudienceInput[] }

function readSaveInput(v: unknown): SaveInput | 'too_many' | null {
  if (!isPlainObject(v)) return null
  if (Object.keys(v).some((k) => k !== 'profile' && k !== 'audiences')) return null
  const profile = readProfilePatch(v.profile)
  if (!profile) return null
  if (v.audiences === undefined) return { profile }
  const audiences = readAudienceList(v.audiences)
  if (audiences === null || audiences === 'too_many') return audiences
  return { profile, audiences }
}

// ── Writes ──────────────────────────────────────────────────────────────────

/**
 * Write `patch` into the profile and mark `marks` in its field_sources, as the
 * owner. Compare-and-set on `updated_at`, re-read on a lost race (the scan
 * wrote in between), at most three times. A missing row is created; 23505
 * means the scan created it a moment ago, so it is re-read and merged.
 */
async function writeProfile(
  db: SupabaseClient,
  scope: OwnerScope,
  patch: Partial<ProfileValues>,
  marks: Record<string, FieldSource>,
  now: Date,
): Promise<'ok' | 'error'> {
  const nowIso = now.toISOString()
  for (let attempt = 0; attempt < 3; attempt++) {
    const row = await readProfileRow(db, scope)
    if (row === 'error') return 'error'
    const sources = { ...cleanSources(row?.field_sources), ...marks }
    if (!row) {
      const { error } = await db.from('project_profiles').insert({
        project_id: scope.projectId,
        user_id: scope.userId,
        ...patch,
        field_sources: sources,
        created_at: nowIso,
        updated_at: nowIso,
      })
      if (!error) return 'ok'
      if (error.code === '23505') continue
      return 'error'
    }
    const { data, error } = await db
      .from('project_profiles')
      .update({ ...patch, field_sources: sources, updated_at: nowIso })
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .eq('updated_at', row.updated_at)
      .select('project_id')
    if (error) return 'error'
    if (((data as unknown[] | null)?.length ?? 0) > 0) return 'ok'
  }
  return 'error'
}

/**
 * Make the stored list the owner's list: rows they kept stay (a moved row gets
 * its new position; an edited one its new label and 'user'), new ones are
 * added as 'user', and the rest are removed. Rows are matched by id, and only
 * rows of this project and owner are ever touched.
 */
async function reconcileAudiences(db: SupabaseClient, scope: OwnerScope, list: AudienceInput[], now: Date): Promise<'ok' | 'error'> {
  const current = await db
    .from('project_audiences')
    .select('id, label, source, position')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
  if (current.error) return 'error'
  const rows = (current.data as { id: string; label: string; source: string; position: number | null }[] | null) ?? []
  const byId = new Map(rows.map((r) => [r.id, r]))
  const kept = new Set<string>()
  const nowIso = now.toISOString()

  for (const [position, item] of list.entries()) {
    const row = item.id ? byId.get(item.id) : undefined
    const edited = !row || row.label !== item.label
    if (row && !kept.has(row.id)) {
      kept.add(row.id)
      if (!edited && row.position === position) continue
      const { data, error } = await db
        .from('project_audiences')
        .update(edited ? { label: item.label, source: 'user', position } : { position })
        .eq('id', row.id)
        .eq('project_id', scope.projectId)
        .eq('user_id', scope.userId)
        .select('id')
      if (error) return 'error'
      if (((data as unknown[] | null)?.length ?? 0) > 0) continue
      // Gone since it was read (a scan replaced its own rows): the owner's list still stands.
    }
    const { error } = await db.from('project_audiences').insert({
      project_id: scope.projectId,
      user_id: scope.userId,
      position,
      label: item.label,
      source: row && !edited && row.source === 'scan' ? 'scan' : 'user',
      created_at: nowIso,
    })
    if (error) return 'error'
  }

  const removed = rows.filter((r) => !kept.has(r.id)).map((r) => r.id)
  if (removed.length > 0) {
    const { error } = await db
      .from('project_audiences')
      .delete()
      .in('id', removed)
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
    if (error) return 'error'
  }
  return 'ok'
}

/**
 * Save one card: the profile fields the owner changed (or confirmed from a
 * suggestion), each becoming 'user', and, when sent, the whole audience list.
 * The profile is written first because it carries the marks, the list's
 * included, so a scan running in between already treats the list as theirs.
 */
export async function saveSection(deps: SettingsDeps, projectId: unknown, input: unknown): Promise<SaveResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return { ok: false, code: o.code }
  const parsed = readSaveInput(input)
  if (parsed === 'too_many') return { ok: false, code: 'too_many_audiences' }
  if (!parsed) return { ok: false, code: 'invalid_request' }

  const marks: Record<string, FieldSource> = {}
  for (const key of Object.keys(parsed.profile)) marks[key] = 'user'
  if (parsed.audiences) marks.audiences = 'user'
  const now = deps.now()
  if (Object.keys(marks).length > 0 && (await writeProfile(o.db, o.scope, parsed.profile, marks, now)) === 'error') {
    return { ok: false, code: 'save_failed' }
  }
  if (parsed.audiences && (await reconcileAudiences(o.db, o.scope, parsed.audiences, now)) === 'error') {
    return { ok: false, code: 'save_failed' }
  }
  return { ok: true, data: await readSettingsData(deps, o) }
}

function readBusinessFields(v: unknown): BusinessField[] | null {
  if (!Array.isArray(v) || v.length === 0 || v.length > BUSINESS_FIELDS.length) return null
  const out: BusinessField[] = []
  for (const f of v) {
    if (!(BUSINESS_FIELDS as readonly unknown[]).includes(f)) return null
    if (!out.includes(f as BusinessField)) out.push(f as BusinessField)
  }
  return out
}

/**
 * The business card saved: the fields the owner changed become 'user', so a
 * later scan never writes them again (the columns themselves were saved by the
 * card's own action, app/actions/projects.ts updateProjectAction).
 */
export async function markBusinessFieldsAsUser(deps: SettingsDeps, projectId: unknown, fields: unknown): Promise<SaveResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return { ok: false, code: o.code }
  const list = readBusinessFields(fields)
  if (!list) return { ok: false, code: 'invalid_request' }
  const marks = Object.fromEntries(list.map((f) => [f, 'user' as const]))
  if ((await writeProfile(o.db, o.scope, {}, marks, deps.now())) === 'error') return { ok: false, code: 'save_failed' }
  return { ok: true, data: await readSettingsData(deps, o) }
}

const hasValue = (v: unknown) => typeof v === 'string' && v.trim() !== ''

/**
 * Before the FIRST scan of a project starts from this screen. That run is a
 * 'create', which writes every business field not marked 'user', even one that
 * holds a value (lib/seed-scan/settings.ts); on a project the owner set up by
 * hand, those values are theirs, and a scan must not replace a market the
 * keyword tracking already runs in. So every business field with a value and
 * no mark becomes 'user' first. A project that has been scanned before needs
 * nothing: its next run is a 'rescan', which only fills empty fields.
 *
 * `ok: true` means the scan may start. Anything else means it must not.
 */
export async function prepareFirstScan(deps: SettingsDeps, projectId: unknown): Promise<{ ok: true } | { ok: false; code: SaveErrorCode }> {
  const o = await owner(deps, projectId)
  if (!o.ok) return { ok: false, code: o.code }
  const runs = await o.db
    .from('project_seed_runs')
    .select('id')
    .eq('project_id', o.scope.projectId)
    .eq('user_id', o.scope.userId)
    .limit(1)
  if (runs.error) return { ok: false, code: 'unavailable' }
  if (((runs.data as unknown[] | null)?.length ?? 0) > 0) return { ok: true }

  const row = await readProfileRow(o.db, o.scope)
  if (row === 'error') return { ok: false, code: 'unavailable' }
  const sources = cleanSources(row?.field_sources)
  const fields = BUSINESS_FIELDS.filter((f) => !sources[f] && hasValue(o.project[f]))
  if (fields.length === 0) return { ok: true }
  const marks = Object.fromEntries(fields.map((f) => [f, 'user' as const]))
  if ((await writeProfile(o.db, o.scope, {}, marks, deps.now())) === 'error') return { ok: false, code: 'save_failed' }
  return { ok: true }
}
