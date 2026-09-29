/**
 * Reading a project's article design on the server: for generation (the hero
 * and the inline images) and for publishing (the design of the body).
 *
 * These callers hold the service-role client, which bypasses RLS, so every
 * read names the owner: `.eq('project_id', …).eq('user_id', <the project's
 * owner>)`, the owner being read off the project row itself.
 *
 * NEVER FAILS A CALLER. No table yet (the migration is not applied), no row,
 * or any read error: the answer is DEFAULT_ARTICLE_STYLE, which is today's
 * behaviour. `state` says which, for logs and tests.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { DEFAULT_ARTICLE_STYLE, toArticleStyle, type ArticleStyle } from './types'
import { DEFAULT_ARTICLE_CTA, toArticleCta, type ArticleCta } from './cta'
import { sameAsList } from './profiles'

export const ARTICLE_STYLE_TABLE = 'project_article_styles'
export const ARTICLE_STYLE_COLUMNS = 'project_id, user_id, brand_colors, design, image_style, hero_ratio, inline_images, own_images_only, official_profiles, updated_at'

export type StyleRead = { state: 'saved' | 'default' | 'missing_table' | 'error'; style: ArticleStyle }

/** Postgres "no such table/column", or PostgREST's "not in the schema cache". */
export function isMissingRelation(error: { code?: string; message?: string } | null | undefined): boolean {
  if (!error) return false
  return error.code === '42P01' || error.code === 'PGRST205' || error.code === '42703' || /does not exist|schema cache/i.test(error.message ?? '')
}

const defaults = (): ArticleStyle => ({ ...DEFAULT_ARTICLE_STYLE, brandColors: [] })

/** The project's style, read for its owner. */
export async function readProjectArticleStyle(db: SupabaseClient, projectId: string, ownerId: string): Promise<StyleRead> {
  try {
    const { data, error } = await db
      .from(ARTICLE_STYLE_TABLE)
      .select(ARTICLE_STYLE_COLUMNS)
      .eq('project_id', projectId)
      .eq('user_id', ownerId)
      .maybeSingle()
    if (error) return { state: isMissingRelation(error) ? 'missing_table' : 'error', style: defaults() }
    const row = data as Record<string, unknown> | null
    if (!row || row.project_id !== projectId || row.user_id !== ownerId) return { state: 'default', style: defaults() }
    return { state: 'saved', style: toArticleStyle(row) }
  } catch {
    return { state: 'error', style: defaults() }
  }
}

/**
 * The column that holds the project's call to action
 * (supabase/migrations/20260929120000_project_article_cta.sql). Read on its
 * own, never inside ARTICLE_STYLE_COLUMNS: until that migration is applied the
 * column does not exist, and the design settings must go on reading as before.
 */
export const ARTICLE_CTA_COLUMN = 'article_cta'

export type CtaRead = { state: 'saved' | 'default' | 'missing_column' | 'error'; cta: ArticleCta }

/** The project's call to action, read for its owner. Off on any failure (today's behaviour). */
export async function readProjectArticleCta(db: SupabaseClient, projectId: string, ownerId: string): Promise<CtaRead> {
  const off = (): ArticleCta => ({ ...DEFAULT_ARTICLE_CTA })
  try {
    const { data, error } = await db
      .from(ARTICLE_STYLE_TABLE)
      .select(`project_id, user_id, ${ARTICLE_CTA_COLUMN}`)
      .eq('project_id', projectId)
      .eq('user_id', ownerId)
      .maybeSingle()
    if (error) return { state: isMissingRelation(error) ? 'missing_column' : 'error', cta: off() }
    const row = data as Record<string, unknown> | null
    if (!row || row.project_id !== projectId || row.user_id !== ownerId || !row[ARTICLE_CTA_COLUMN]) return { state: 'default', cta: off() }
    return { state: 'saved', cta: toArticleCta(row[ARTICLE_CTA_COLUMN]) }
  } catch {
    return { state: 'error', cta: off() }
  }
}

/** The style of the project an article belongs to: the article names the project, the project names its owner. */
export async function readArticleStyleForArticle(admin: SupabaseClient, articleId: string): Promise<StyleRead & { projectId: string | null }> {
  try {
    const { data } = await admin.from('generated_articles').select('project_id').eq('id', articleId).maybeSingle()
    const row = data as { project_id?: string | null } | null
    if (!row?.project_id) return { state: 'default', style: defaults(), projectId: null }
    // The settings row belongs to the project's owner, whoever generated the article.
    const owner = await projectOwner(admin, row.project_id)
    if (!owner) return { state: 'default', style: defaults(), projectId: row.project_id }
    return { ...(await readProjectArticleStyle(admin, row.project_id, owner)), projectId: row.project_id }
  } catch {
    return { state: 'error', style: defaults(), projectId: null }
  }
}

/** The call to action of the project an article belongs to (its owner's row). Off on any failure. */
export async function readArticleCtaForArticle(admin: SupabaseClient, projectId: string | null): Promise<ArticleCta> {
  if (!projectId) return { ...DEFAULT_ARTICLE_CTA }
  const owner = await projectOwner(admin, projectId)
  if (!owner) return { ...DEFAULT_ARTICLE_CTA }
  return (await readProjectArticleCta(admin, projectId, owner)).cta
}

export async function projectOwner(admin: SupabaseClient, projectId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('projects').select('user_id').eq('id', projectId).maybeSingle()
    return (data as { user_id?: string | null } | null)?.user_id ?? null
  } catch {
    return null
  }
}

/**
 * The business's official profiles as a sameAs list, for the structured data of
 * the project's articles. Read for the project's owner; [] on any failure, so
 * the markup is simply without sameAs, as before.
 */
export async function readProjectSameAs(admin: SupabaseClient, projectId: string): Promise<string[]> {
  try {
    const owner = await projectOwner(admin, projectId)
    if (!owner) return []
    const { data, error } = await admin
      .from(ARTICLE_STYLE_TABLE)
      .select('project_id, user_id, official_profiles')
      .eq('project_id', projectId)
      .eq('user_id', owner)
      .maybeSingle()
    const row = data as { project_id?: string; user_id?: string; official_profiles?: unknown } | null
    if (error || !row || row.project_id !== projectId || row.user_id !== owner) return []
    return sameAsList(row.official_profiles as Record<string, string>)
  } catch {
    return []
  }
}
