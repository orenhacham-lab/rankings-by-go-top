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

const none = (): WritingGuidance => ({ mentionBusiness: true, instructions: '', exclusions: [], rules: [] })

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

export type GenerationContext = {
  guidance: WritingGuidance
  business: BusinessContext
  /**
   * A Shopify store (a live store connection on this project). All that is left
   * of the distinction is the CITY, which a store's articles leave out: they are
   * not written to place a business in a town. The owner's own guidance, the
   * business DESCRIPTION (since 2026-10-17) and the business NAME (since
   * 2026-10-18, Oren: "כן שיופיע גם בחנות שופיפיי במאמר") all apply to a store
   * exactly as they do to any other project.
   */
  shopify: boolean
}

/**
 * Whether the project is a Shopify store's: a live (not archived) store
 * connection on THIS project. FAILS CLOSED: a read error counts as Shopify, so
 * a Shopify store's articles are never changed by a read that did not answer.
 *
 * Who bills the account is deliberately not part of it. Until 11 October 2026
 * an account Shopify bills counted as Shopify for every project it owns, and
 * one account with two stores and twenty-one WordPress sites had the business
 * name, description and city left out of every article on all of them. The
 * article goes to the site the project is connected to; that is what decides.
 */
export async function isShopifyProject(admin: SupabaseClient, projectId: string): Promise<boolean> {
  try {
    const conn = await admin.from('shopify_connections').select('project_id').eq('project_id', projectId).is('archived_at', null).limit(1)
    if (conn.error) return true
    return (conn.data ?? []).length > 0
  } catch {
    return true
  }
}

/**
 * Everything generation reads about the business, for the project's owner.
 * `city` is the project's own city, used only when the settings mark the
 * business as local (project_profiles.is_local = true) and never for a Shopify
 * store, whose articles are not written to place a business in a town. The
 * description does reach a store's articles (see GenerationContext.shopify); a
 * read that FAILED still gives neither, so a store is never changed by an
 * unanswered read.
 */
export async function readGenerationContext(admin: SupabaseClient, projectId: string, city: string | null): Promise<GenerationContext> {
  const empty: GenerationContext = { guidance: none(), business: { description: null, city: null }, shopify: true }
  const owner = await projectOwner(admin, projectId)
  if (!owner) return empty
  const [guidance, profile, shopify] = await Promise.all([
    readProjectWritingGuidance(admin, projectId, owner),
    readProfile(admin, projectId, owner),
    isShopifyProject(admin, projectId),
  ])
  if (shopify) return { guidance: guidance.guidance, business: { description: profile.description, city: null }, shopify: true }
  return {
    guidance: guidance.guidance,
    business: { description: profile.description, city: profile.isLocal === true && city?.trim() ? city.trim() : null },
    shopify: false,
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
