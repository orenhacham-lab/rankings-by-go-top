/**
 * Reading what article generation needs to know about the business: the
 * owner's writing guidance (./guidance.ts) and the business context (its
 * description and, for a local business, its city).
 *
 * The caller holds the service-role client, which bypasses RLS, so every read
 * names the owner, read off the project row itself (`.eq('user_id', owner)`).
 *
 * NEVER FAILS A GENERATION. No column yet (the migration is not applied), no
 * row, or any read error: no guidance and no context, which is exactly the
 * prompt as it was before.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ARTICLE_STYLE_TABLE, isMissingRelation, projectOwner } from '@/lib/content/article-style/store'
import { toWritingGuidance, type BusinessContext, type WritingGuidance } from './guidance'

/** Read on its own, never inside the design columns: until the migration is applied it does not exist. */
export const WRITING_GUIDANCE_COLUMN = 'writing_guidance'

export type GuidanceRead = { state: 'saved' | 'default' | 'missing_column' | 'error'; guidance: WritingGuidance }

const none = (): WritingGuidance => ({ instructions: '', exclusions: [], rules: [] })

/** The project's guidance, read for its owner (any client: the owner's RLS one or the service role). */
export async function readProjectWritingGuidance(db: SupabaseClient, projectId: string, ownerId: string): Promise<GuidanceRead> {
  try {
    const { data, error } = await db
      .from(ARTICLE_STYLE_TABLE)
      .select(`project_id, user_id, ${WRITING_GUIDANCE_COLUMN}`)
      .eq('project_id', projectId)
      .eq('user_id', ownerId)
      .maybeSingle()
    if (error) return { state: isMissingRelation(error) ? 'missing_column' : 'error', guidance: none() }
    const row = data as Record<string, unknown> | null
    if (!row || row.project_id !== projectId || row.user_id !== ownerId) return { state: 'default', guidance: none() }
    return { state: 'saved', guidance: toWritingGuidance(row[WRITING_GUIDANCE_COLUMN]) }
  } catch {
    return { state: 'error', guidance: none() }
  }
}

export type GenerationContext = { guidance: WritingGuidance; business: BusinessContext }

/**
 * Everything generation reads about the business, for the project's owner.
 * `city` is the project's own city, used only when the settings mark the
 * business as local (project_profiles.is_local = true).
 */
export async function readGenerationContext(admin: SupabaseClient, projectId: string, city: string | null): Promise<GenerationContext> {
  const empty: GenerationContext = { guidance: none(), business: { description: null, city: null } }
  const owner = await projectOwner(admin, projectId)
  if (!owner) return empty
  const [guidance, profile] = await Promise.all([
    readProjectWritingGuidance(admin, projectId, owner),
    readProfile(admin, projectId, owner),
  ])
  return {
    guidance: guidance.guidance,
    business: { description: profile.description, city: profile.isLocal === true && city?.trim() ? city.trim() : null },
  }
}

async function readProfile(admin: SupabaseClient, projectId: string, owner: string): Promise<{ description: string | null; isLocal: boolean | null }> {
  try {
    const { data, error } = await admin
      .from('project_profiles')
      .select('project_id, user_id, description, is_local')
      .eq('project_id', projectId)
      .eq('user_id', owner)
      .maybeSingle()
    const row = data as { project_id?: string; user_id?: string; description?: unknown; is_local?: unknown } | null
    if (error || !row || row.project_id !== projectId || row.user_id !== owner) return { description: null, isLocal: null }
    return {
      description: typeof row.description === 'string' && row.description.trim() ? row.description : null,
      isLocal: typeof row.is_local === 'boolean' ? row.is_local : null,
    }
  } catch {
    return { description: null, isLocal: null }
  }
}
