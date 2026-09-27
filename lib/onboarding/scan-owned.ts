/**
 * A project created from one URL leaves the scan its settings to fill.
 *
 * The new-project flow asks the merchant for the site's address and nothing
 * else, and /api/projects/create fills the columns it was not given with
 * placeholders: business_name and city empty, country 'IL', language 'he'. The
 * pipeline fills a project column only when it is empty or marked "scan" in
 * project_profiles.field_sources, so those placeholders are marked "scan" here,
 * before the first run starts, and stage A replaces them with what it reads off
 * the site. A field the owner has marked "user" is never touched, and a column
 * that no longer holds the placeholder (the merchant typed something) is not
 * claimed for the scan.
 *
 * ─── W4 LOCAL STAND-IN ────────────────────────────────────────────────────
 * `markScanOwnedFields(admin, scope, fields)` is being added to
 * lib/seed-scan/settings.ts on the pipeline branch. Until it reaches this
 * branch, the function below implements the same contract here; the one call
 * site is markUrlProjectPlaceholders, called only by the start route
 * (lib/onboarding/start.ts). When the pipeline helper lands, this local
 * implementation is replaced by an import of it.
 * ──────────────────────────────────────────────────────────────────────────
 *
 * Runs with the service role, every query filtered by the project AND its
 * owner. The profile write is a compare-and-set on updated_at, like the
 * pipeline's own (lib/seed-scan/settings.ts), so an owner's edit that lands in
 * between wins.
 */
import type { SeedFieldSource } from '@/lib/supabase/types'
import type { ServiceRoleClient } from '@/lib/supabase/admin'
import type { SeedScope } from '@/lib/seed-scan/types'

/** The project columns /api/projects/create fills with a placeholder when the merchant typed only the address. */
export const URL_PROJECT_PLACEHOLDERS = {
  business_name: null,
  country: 'IL',
  language: 'he',
  city: null,
} as const
export type PlaceholderField = keyof typeof URL_PROJECT_PLACEHOLDERS

export type PlaceholderProject = { business_name: string | null; country: string | null; language: string | null; city: string | null }

const isBlank = (v: unknown) => v === null || v === undefined || (typeof v === 'string' && v.trim() === '')

/** The columns that still hold exactly what the create path wrote for a project given only its address. */
export function placeholderFields(project: PlaceholderProject): PlaceholderField[] {
  return (Object.keys(URL_PROJECT_PLACEHOLDERS) as PlaceholderField[]).filter((f) => {
    const placeholder = URL_PROJECT_PLACEHOLDERS[f]
    return placeholder === null ? isBlank(project[f]) : project[f] === placeholder
  })
}

/**
 * W4 LOCAL STAND-IN for lib/seed-scan/settings.ts markScanOwnedFields (see the
 * header). Marks each field "scan" unless the owner marked it "user". True once
 * the marks are stored.
 */
export async function markScanOwnedFields(
  admin: ServiceRoleClient,
  scope: SeedScope,
  fields: readonly string[],
  now: Date = new Date(),
): Promise<boolean> {
  if (fields.length === 0) return true
  const nowIso = now.toISOString()
  for (let attempt = 0; attempt < 3; attempt++) {
    const read = await admin
      .from('project_profiles')
      .select('project_id, field_sources, updated_at')
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .maybeSingle()
    if (read.error) return false
    const profile = read.data as { field_sources: Record<string, SeedFieldSource> | null; updated_at: string } | null
    const sources: Record<string, SeedFieldSource> = { ...(profile?.field_sources ?? {}) }
    let changed = false
    for (const f of fields) {
      if (sources[f] === 'user' || sources[f] === 'scan') continue
      sources[f] = 'scan'
      changed = true
    }
    if (!changed) return true

    if (!profile) {
      const { error } = await admin.from('project_profiles').insert({
        project_id: scope.projectId,
        user_id: scope.userId,
        field_sources: sources,
        created_at: nowIso,
        updated_at: nowIso,
      })
      if (!error) return true
      // 23505: the row appeared a moment ago (the owner, or a scan). Re-read and merge.
      if ((error as { code?: string }).code === '23505') continue
      return false
    }
    const { data, error } = await admin
      .from('project_profiles')
      .update({ field_sources: sources, updated_at: nowIso })
      .eq('project_id', scope.projectId)
      .eq('user_id', scope.userId)
      .eq('updated_at', profile.updated_at)
      .select('project_id')
    if (error) return false
    if (((data as unknown[] | null)?.length ?? 0) === 1) return true
    // Zero rows: the profile changed since it was read. Re-read, so a field just marked "user" stays theirs.
  }
  return false
}

/**
 * THE CALL SITE. The placeholders of a project the new-project flow just
 * created from its address, marked "scan" before its first run.
 */
export function markUrlProjectPlaceholders(
  admin: ServiceRoleClient,
  scope: SeedScope,
  project: PlaceholderProject,
  now: Date,
): Promise<boolean> {
  return markScanOwnedFields(admin, scope, placeholderFields(project), now)
}
