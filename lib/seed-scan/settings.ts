/**
 * What the scan may write into a project's settings, and what it may not.
 *
 * THE CONTRACT with the settings screen, as the migration states it on
 * project_profiles.field_sources: the pipeline fills only fields that are
 * empty or marked 'scan' (and marks what it wrote 'scan'); an edit by the
 * owner marks the field 'user'. So the scan never overwrites a value it did
 * not write: not the owner's, and not one the project already had before it
 * was ever scanned (a project's country, language and business name drive its
 * live rank checks) — on the first scan as on every rescan. Concretely:
 *
 *   project_profiles  description, commerce_type, niche, is_local,
 *                     detected_platform — written when the field is empty or
 *                     marked 'scan' and the scan has a value for it; then
 *                     marked 'scan'.
 *   project_audiences if ANY audience came from the owner, or the owner saved
 *                     the list (field_sources.audiences = 'user'), all are left
 *                     alone; otherwise the scan's own rows are replaced by up to
 *                     five new ones. An empty answer replaces nothing.
 *   projects          business_name, country, language, city — the same rule
 *                     as the profile, column by column. Nothing else on the
 *                     project is touched.
 *
 * A PLACEHOLDER is not a value anyone chose: the create route puts IL and he
 * into a project created without a country or language. The flow that sets
 * one marks it 'scan' right away with markScanOwnedFields, and the first scan
 * then replaces it like any field of its own.
 *   ai_visibility_competitors
 *                     validated competitors are ADDED, as the competitors route
 *                     adds them, within its three-active cap. Existing rows —
 *                     active or removed by the owner — are never modified,
 *                     re-added or deleted.
 *
 * CONCURRENCY. The owner can edit settings while a scan runs. The profile is
 * written with a compare-and-set on `updated_at`, and the project columns with
 * a compare-and-set on the values that were read, so an edit that lands between
 * our read and our write wins: our write matches no row, we re-read, and the
 * field is now 'user' or no longer empty.
 *
 * All of this runs with the service-role client (the pipeline also runs from a
 * cron, with no browser session), so every query names the owner explicitly.
 */
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { SeedFieldSource } from '@/lib/supabase/types'
import type { SeedBusiness, SeedScope } from './types'

/** The project columns a2 may fill, and the shape of the row it reads. */
export type SeedProject = {
  id: string
  user_id: string
  target_domain: string
  business_name: string | null
  country: string | null
  language: string | null
  city: string | null
}

export const PROJECT_COLUMNS = 'id, user_id, target_domain, business_name, country, language, city'

const PROFILE_FIELDS = ['description', 'commerce_type', 'niche', 'is_local', 'detected_platform'] as const
type ProfileField = (typeof PROFILE_FIELDS)[number]
const PROJECT_FIELDS = ['business_name', 'country', 'language', 'city'] as const
type ProjectField = (typeof PROJECT_FIELDS)[number]
/** A project column the scan may fill (and a creation flow may hand to it). */
export type SeedProjectField = ProjectField

/** Mirrors MAX_ACTIVE_COMPETITORS in app/api/projects/[id]/ai-visibility/competitors/route.ts. */
export const MAX_ACTIVE_COMPETITORS = 3
export const MAX_AUDIENCES = 5

type ProfileRow = {
  project_id: string
  user_id: string
  description: string | null
  commerce_type: string | null
  niche: string | null
  is_local: boolean | null
  detected_platform: string | null
  field_sources: Record<string, SeedFieldSource> | null
  updated_at: string
}

export type SettingsReport = {
  profile: { written: ProfileField[]; keptUser: ProfileField[]; keptValue: ProfileField[] }
  project: { written: ProjectField[]; keptUser: ProjectField[]; keptValue: ProjectField[] }
  audiences: 'replaced' | 'kept_user' | 'none'
}

export type ApplyResult = { ok: true; report: SettingsReport; project: SeedProject } | { ok: false }

const isEmpty = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** The contract's rule for one field: the owner's stays; a value the scan did not write stays; else the scan's. */
function ruling(source: SeedFieldSource | undefined, current: unknown): 'keptUser' | 'keptValue' | 'fill' {
  if (source === 'user') return 'keptUser'
  if (source !== 'scan' && !isEmpty(current)) return 'keptValue'
  return 'fill'
}

/** The primary language subtag of `lang`, as the project's language column holds it ('he', 'en'). */
export function projectLanguageFrom(lang: string | null): string | null {
  const primary = (lang ?? '').trim().toLowerCase().split(/[-_]/)[0]
  return /^[a-z]{2}$/.test(primary) ? primary : null
}

/** The profile columns a business fills, normalized as they are stored. Exported for the settings screen's suggestions. */
export function profileValues(business: SeedBusiness): Record<ProfileField, string | boolean | null> {
  return {
    description: business.description.trim().slice(0, 1_500) || null,
    commerce_type: business.commerceType,
    niche: business.niche?.trim().slice(0, 120) || null,
    is_local: business.isLocal,
    detected_platform: business.platform?.trim().slice(0, 40) || null,
  }
}

/** The project columns a business fills, normalized as they are stored. Exported for the settings screen's suggestions. */
export function projectValues(business: SeedBusiness): Record<ProjectField, string | null> {
  const country = (business.country ?? '').trim().toUpperCase()
  return {
    business_name: business.companyName?.trim().slice(0, 200) || null,
    country: /^[A-Z]{2}$/.test(country) ? country : null,
    language: projectLanguageFrom(business.language),
    // The engine states an address only as one joined line, so a city is never
    // guessed out of it; this stays null until the engine exposes a locality.
    city: null,
  }
}

async function readProfile(admin: ServiceRoleClient, scope: SeedScope): Promise<ProfileRow | null | 'error'> {
  const { data, error } = await admin
    .from('project_profiles')
    .select('project_id, user_id, description, commerce_type, niche, is_local, detected_platform, field_sources, updated_at')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error) return 'error'
  return (data as ProfileRow | null) ?? null
}

export async function readSeedProject(admin: ServiceRoleClient, scope: SeedScope): Promise<SeedProject | null | 'error'> {
  const { data, error } = await admin
    .from('projects')
    .select(PROJECT_COLUMNS)
    .eq('id', scope.projectId)
    .eq('user_id', scope.userId)
    .maybeSingle()
  if (error) return 'error'
  return (data as SeedProject | null) ?? null
}

/**
 * Write the project columns the rules allow, one column at a time, each
 * guarded by the value that was read. Returns the columns actually confirmed
 * (written, or already equal) and the project as it now is.
 */
async function applyProjectColumns(
  admin: ServiceRoleClient,
  scope: SeedScope,
  project: SeedProject,
  wanted: Partial<Record<ProjectField, string>>,
): Promise<{ confirmed: ProjectField[]; project: SeedProject } | 'error'> {
  const confirmed: ProjectField[] = []
  let current = project
  for (const f of Object.keys(wanted) as ProjectField[]) {
    const value = wanted[f] as string
    if (current[f] === value) {
      confirmed.push(f)
      continue
    }
    const base = admin.from('projects').update({ [f]: value }).eq('id', scope.projectId).eq('user_id', scope.userId)
    const guarded = current[f] === null ? base.is(f, null) : base.eq(f, current[f])
    const { data, error } = await guarded.select(PROJECT_COLUMNS)
    if (error) return 'error'
    const updated = (data as SeedProject[] | null)?.[0]
    // Zero rows: the owner changed this column since it was read. Their value
    // stands, and it is not marked as the scan's.
    if (!updated) continue
    confirmed.push(f)
    current = updated
  }
  return { confirmed, project: current }
}

/**
 * Apply a2's understanding of the business to the project's settings.
 * `project` is the row as the runner read it; the returned project carries any
 * column this wrote, so a4 searches in the market that was just detected.
 */
export async function applyBusinessToSettings(
  admin: ServiceRoleClient,
  scope: SeedScope,
  input: { project: SeedProject; business: SeedBusiness; audiences: string[]; now: Date },
): Promise<ApplyResult> {
  // The project must be the one the scope names, as read for its owner.
  if (input.project.id !== scope.projectId || input.project.user_id !== scope.userId) return { ok: false }
  const nowIso = input.now.toISOString()
  const scanProfile = profileValues(input.business)
  const scanProject = projectValues(input.business)
  let project = input.project

  for (let attempt = 0; attempt < 3; attempt++) {
    const profile = await readProfile(admin, scope)
    if (profile === 'error') return { ok: false }
    const sources: Record<string, SeedFieldSource> = { ...(profile?.field_sources ?? {}) }

    // Project columns first, so their 'scan' marks below are only for values
    // that actually landed.
    const report: SettingsReport = {
      profile: { written: [], keptUser: [], keptValue: [] },
      project: { written: [], keptUser: [], keptValue: [] },
      audiences: 'none',
    }
    const wanted: Partial<Record<ProjectField, string>> = {}
    for (const f of PROJECT_FIELDS) {
      const value = scanProject[f]
      if (value === null) continue
      const rule = ruling(sources[f], project[f])
      if (rule !== 'fill') { report.project[rule].push(f); continue }
      wanted[f] = value
    }
    const columns = await applyProjectColumns(admin, scope, project, wanted)
    if (columns === 'error') return { ok: false }
    project = columns.project
    for (const f of columns.confirmed) sources[f] = 'scan'
    report.project.written = columns.confirmed

    const profilePatch: Record<string, unknown> = {}
    for (const f of PROFILE_FIELDS) {
      const value = scanProfile[f]
      if (value === null) continue
      const rule = ruling(sources[f], profile?.[f])
      if (rule !== 'fill') { report.profile[rule].push(f); continue }
      profilePatch[f] = value
      sources[f] = 'scan'
      report.profile.written.push(f)
    }

    if (!profile) {
      const { error } = await admin.from('project_profiles').insert({
        project_id: scope.projectId,
        user_id: scope.userId,
        ...profilePatch,
        field_sources: sources,
        scanned_at: nowIso,
        created_at: nowIso,
        updated_at: nowIso,
      })
      // 23505: the owner created the row a moment ago. Re-read and merge.
      if (error) { if (error.code === '23505') continue; return { ok: false } }
    } else {
      const { data, error } = await admin
        .from('project_profiles')
        .update({ ...profilePatch, field_sources: sources, scanned_at: nowIso, updated_at: nowIso })
        .eq('project_id', scope.projectId)
        .eq('user_id', scope.userId)
        .eq('updated_at', profile.updated_at)
        .select('project_id')
      if (error) return { ok: false }
      // Zero rows: the owner saved settings since we read them. Re-read, so a
      // field they just marked 'user' is respected.
      if (((data as unknown[] | null)?.length ?? 0) === 0) continue
    }

    // The owner saved the audience list on the settings screen
    // (lib/project-settings/data.ts marks it 'audiences': 'user'): the list is
    // theirs as a whole, a deletion or an emptied list included, so it is kept.
    const audiences = sources.audiences === 'user' ? 'kept_user' : await replaceScanAudiences(admin, scope, input.audiences, nowIso)
    if (audiences === 'error') return { ok: false }
    report.audiences = audiences
    return { ok: true, report, project }
  }
  return { ok: false }
}

/**
 * Hand project columns a creation flow filled with a placeholder to the scan:
 * mark them 'scan' in field_sources, so the first scan replaces them (the rule
 * above fills a field marked 'scan'). The create route calls it for the
 * country and language it defaults. A field that already has a source keeps
 * it: one marked 'user' stays the owner's. true when every field asked for now
 * has a source; false when the project is not the scope's or the write failed
 * (the placeholder then simply stays, as an unmarked value would).
 */
export async function markScanOwnedFields(
  admin: ServiceRoleClient,
  scope: SeedScope,
  fields: readonly SeedProjectField[],
  now: Date = new Date(),
): Promise<boolean> {
  const asked = PROJECT_FIELDS.filter((f) => fields.includes(f))
  if (asked.length === 0) return true
  // The project must be the scope's own, as read for its owner.
  const project = await readSeedProject(admin, scope)
  if (project === 'error' || !project) return false
  const nowIso = now.toISOString()

  for (let attempt = 0; attempt < 3; attempt++) {
    const profile = await readProfile(admin, scope)
    if (profile === 'error') return false
    const sources: Record<string, SeedFieldSource> = { ...(profile?.field_sources ?? {}) }
    const unmarked = asked.filter((f) => sources[f] === undefined)
    if (unmarked.length === 0) return true
    for (const f of unmarked) sources[f] = 'scan'

    if (!profile) {
      const { error } = await admin.from('project_profiles').insert({
        project_id: scope.projectId,
        user_id: scope.userId,
        field_sources: sources,
        created_at: nowIso,
        updated_at: nowIso,
      })
      // 23505: a profile appeared since the read. Re-read and merge.
      if (error) { if (error.code === '23505') continue; return false }
      return true
    }
    const { data, error } = await admin
      .from('project_profiles')
      .update({ field_sources: sources, updated_at: nowIso })
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .eq('updated_at', profile.updated_at)
      .select('project_id')
    if (error) return false
    // Zero rows: the profile changed since the read. Re-read, so a field just
    // marked 'user' keeps that mark.
    if (((data as unknown[] | null)?.length ?? 0) === 0) continue
    return true
  }
  return false
}

/** Trimmed, de-duplicated labels the audiences table accepts (1-300 characters). */
export function cleanAudienceLabels(labels: string[]): string[] {
  const out: string[] = []
  for (const raw of labels) {
    const label = raw.replace(/\s+/g, ' ').trim().slice(0, 300)
    if (label && !out.some((x) => x.toLowerCase() === label.toLowerCase())) out.push(label)
    if (out.length >= MAX_AUDIENCES) break
  }
  return out
}

async function replaceScanAudiences(
  admin: ServiceRoleClient,
  scope: SeedScope,
  labels: string[],
  nowIso: string,
): Promise<SettingsReport['audiences'] | 'error'> {
  const existing = await admin
    .from('project_audiences')
    .select('id, source')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
  if (existing.error) return 'error'
  const rows = (existing.data as { id: string; source: string }[] | null) ?? []
  if (rows.some((r) => r.source === 'user')) return 'kept_user'

  const clean = cleanAudienceLabels(labels)
  if (clean.length === 0) return 'none'

  const removed = await admin
    .from('project_audiences')
    .delete()
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
    .eq('source', 'scan')
  if (removed.error) return 'error'
  const inserted = await admin.from('project_audiences').insert(
    clean.map((label, position) => ({
      project_id: scope.projectId,
      user_id: scope.userId,
      position,
      label,
      source: 'scan',
      created_at: nowIso,
    })),
  )
  if (inserted.error) return 'error'
  return 'replaced'
}

// ── Competitors (a4) ────────────────────────────────────────────────────────

/** How the competitors route stores a domain: lower-case, no scheme, no www, no trailing slash. */
export function competitorDomainKey(raw: string | null | undefined): string | null {
  const trimmed = (raw ?? '').trim().toLowerCase()
  if (!trimmed) return null
  const host = trimmed.replace(/^https?:\/\//, '').replace(/^www\./, '')
  // Cut at the first '/' by index: a `/\/.*$/` backtracks quadratically on a
  // run of slashes followed by a line separator.
  const slash = host.indexOf('/')
  return (slash >= 0 ? host.slice(0, slash) : host) || null
}

export type CompetitorInsertReport = { inserted: string[]; alreadyListed: string[]; overCap: string[] }

/**
 * Add validated competitors the project does not list yet, within the
 * three-active cap. A domain already present — including one the owner removed
 * (is_active = false) — is never added again.
 */
export async function addValidatedCompetitors(
  admin: ServiceRoleClient,
  scope: SeedScope,
  domains: string[],
  now: Date,
): Promise<CompetitorInsertReport | 'error'> {
  const existing = await admin
    .from('ai_visibility_competitors')
    .select('id, name, domain, is_active')
    .eq('project_id', scope.projectId)
    .eq('user_id', scope.userId)
  if (existing.error) return 'error'
  const rows = (existing.data as { name: string | null; domain: string | null; is_active: boolean }[] | null) ?? []
  const known = new Set<string>()
  for (const r of rows) {
    const d = competitorDomainKey(r.domain)
    if (d) known.add(d)
    const n = competitorDomainKey(r.name)
    if (n) known.add(n)
  }
  let room = Math.max(0, MAX_ACTIVE_COMPETITORS - rows.filter((r) => r.is_active).length)

  const report: CompetitorInsertReport = { inserted: [], alreadyListed: [], overCap: [] }
  const toInsert: string[] = []
  for (const raw of domains) {
    const domain = competitorDomainKey(raw)
    if (!domain) continue
    if (known.has(domain)) { report.alreadyListed.push(domain); continue }
    if (room <= 0) { report.overCap.push(domain); continue }
    toInsert.push(domain)
    known.add(domain)
    room--
  }
  if (toInsert.length === 0) return report

  const nowIso = now.toISOString()
  const { error } = await admin.from('ai_visibility_competitors').insert(
    toInsert.map((domain) => ({
      user_id: scope.userId,
      project_id: scope.projectId,
      name: domain,
      domain,
      aliases: [],
      is_active: true,
      created_at: nowIso,
      updated_at: nowIso,
    })),
  )
  if (error) return 'error'
  report.inserted = toInsert
  return report
}
