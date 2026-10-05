/**
 * The writing guidance's server side, as the signed-in owner: read and save it
 * from the settings card, and add one rule from an article's page.
 * Framework-free, so the whole contract runs under test (./__qa__);
 * app/(dashboard)/settings/writing-guidance-actions.ts only wires the real
 * session in.
 *
 * AS THE OWNER. Everything goes through the owner's own RLS-scoped client, and
 * every query ALSO names the owner (`.eq('user_id')`), after the project (or
 * the article, then its project) was read that way. Someone else's project or
 * article is not_found before anything else happens.
 *
 * NO COLUMN YET. While the migration is not applied, the card is read-only
 * (`editable: false`) and a save answers `unavailable`.
 *
 * Nothing the database says reaches the screen: failures are codes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { ARTICLE_STYLE_TABLE, isMissingRelation } from '@/lib/content/article-style/store'
import { parseGuidanceInput, parseRuleInput, toGuidanceRow, withRule, type GuidanceField, type WritingGuidance } from './guidance'
import { readProjectWritingGuidance, WRITING_GUIDANCE_COLUMN } from './store'

export type GuidanceSession = { userId: string | null; db: SupabaseClient }
export type GuidanceDeps = { session: () => Promise<GuidanceSession>; now?: () => Date }

export type GuidanceView = {
  guidance: WritingGuidance
  /** False while the column does not exist: the card shows nothing to edit and cannot save. */
  editable: boolean
}

export type GuidanceErrorCode = 'unauthorized' | 'not_found' | 'invalid_request' | 'unavailable' | 'save_failed'
export type LoadGuidanceResult = { ok: true; data: GuidanceView } | { ok: false; code: GuidanceErrorCode }
export type SaveGuidanceResult = LoadGuidanceResult | { ok: false; code: 'invalid_guidance'; invalid: GuidanceField[] }
export type AddRuleResult =
  | { ok: true; projectId: string; duplicate: boolean; count: number }
  | { ok: false; code: GuidanceErrorCode | 'invalid_rule' | 'rules_full' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Owner = { ok: true; db: SupabaseClient; userId: string; projectId: string } | { ok: false; code: GuidanceErrorCode }

async function session(deps: GuidanceDeps): Promise<{ ok: true; s: GuidanceSession & { userId: string } } | { ok: false; code: GuidanceErrorCode }> {
  let s: GuidanceSession
  try {
    s = await deps.session()
  } catch {
    return { ok: false, code: 'unavailable' }
  }
  if (!s.userId) return { ok: false, code: 'unauthorized' }
  return { ok: true, s: s as GuidanceSession & { userId: string } }
}

async function projectOwner(db: SupabaseClient, userId: string, projectId: unknown): Promise<Owner> {
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return { ok: false, code: 'not_found' }
  const { data, error } = await db.from('projects').select('id, user_id').eq('id', projectId).eq('user_id', userId).maybeSingle()
  if (error) return { ok: false, code: 'unavailable' }
  const row = data as { id: string; user_id: string } | null
  if (!row || row.user_id !== userId) return { ok: false, code: 'not_found' }
  return { ok: true, db, userId, projectId: row.id }
}

async function owner(deps: GuidanceDeps, projectId: unknown): Promise<Owner> {
  const s = await session(deps)
  if (!s.ok) return s
  return projectOwner(s.s.db, s.s.userId, projectId)
}

async function readView(o: Extract<Owner, { ok: true }>): Promise<LoadGuidanceResult> {
  const read = await readProjectWritingGuidance(o.db, o.projectId, o.userId)
  if (read.state === 'error') return { ok: false, code: 'unavailable' }
  if (read.state === 'missing_column') return { ok: true, data: { guidance: read.guidance, editable: false } }
  // No row yet: whether the column exists decides if the card can save (a first save creates the row).
  if (read.state === 'default') return { ok: true, data: { guidance: read.guidance, editable: await columnExists(o) } }
  return { ok: true, data: { guidance: read.guidance, editable: true } }
}

async function columnExists(o: Extract<Owner, { ok: true }>): Promise<boolean> {
  try {
    const { error } = await o.db.from(ARTICLE_STYLE_TABLE).select(`project_id, ${WRITING_GUIDANCE_COLUMN}`).eq('project_id', o.projectId).eq('user_id', o.userId).limit(1)
    return !error
  } catch {
    return false
  }
}

/**
 * Write the whole guidance. The upsert names only this column, so it never
 * touches the design or the call to action (a first save creates the row with
 * the design defaults, which are today's behaviour).
 */
async function write(o: Extract<Owner, { ok: true }>, g: WritingGuidance): Promise<{ ok: true } | { ok: false; code: GuidanceErrorCode }> {
  const { error } = await o.db
    .from(ARTICLE_STYLE_TABLE)
    .upsert({ project_id: o.projectId, user_id: o.userId, [WRITING_GUIDANCE_COLUMN]: toGuidanceRow(g), updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
  if (error) return { ok: false, code: isMissingRelation(error) ? 'unavailable' : 'save_failed' }
  return { ok: true }
}

export async function loadWritingGuidance(deps: GuidanceDeps, projectId: unknown): Promise<LoadGuidanceResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  return readView(o)
}

/** The settings card's save: instructions, exclusions and the (edited) list of rules, all at once. */
export async function saveWritingGuidance(deps: GuidanceDeps, projectId: unknown, input: unknown): Promise<SaveGuidanceResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  const parsed = parseGuidanceInput(input)
  if (!parsed.ok) return parsed.invalid.length ? { ok: false, code: 'invalid_guidance', invalid: parsed.invalid } : { ok: false, code: 'invalid_request' }
  // Rules keep the time and article they came with; a rule typed in the card is stamped now.
  const current = await readProjectWritingGuidance(o.db, o.projectId, o.userId)
  if (current.state === 'error') return { ok: false, code: 'unavailable' }
  const known = new Map(current.guidance.rules.map((r) => [r.text, r]))
  const now = (deps.now ?? (() => new Date()))().toISOString()
  const rules = parsed.guidance.rules.map((r) => known.get(r.text) ?? { ...r, at: now, articleId: null })
  const w = await write(o, { ...parsed.guidance, rules })
  if (!w.ok) return w
  return readView(o)
}

/**
 * A note the owner left on one article, kept as a rule for the project's next
 * articles. The article is read with the owner's own client and must be theirs;
 * its project gets the rule.
 */
export async function addRuleFromArticle(deps: GuidanceDeps, articleId: unknown, text: unknown): Promise<AddRuleResult> {
  const s = await session(deps)
  if (!s.ok) return s
  if (typeof articleId !== 'string' || !UUID.test(articleId)) return { ok: false, code: 'not_found' }
  const rule = parseRuleInput(text, articleId, (deps.now ?? (() => new Date()))())
  if (!rule) return { ok: false, code: 'invalid_rule' }
  const { data, error } = await s.s.db
    .from('generated_articles')
    .select('id, user_id, project_id')
    .eq('id', articleId)
    .eq('user_id', s.s.userId)
    .maybeSingle()
  if (error) return { ok: false, code: 'unavailable' }
  const article = data as { id: string; user_id: string; project_id: string | null } | null
  if (!article || article.user_id !== s.s.userId || !article.project_id) return { ok: false, code: 'not_found' }
  const o = await projectOwner(s.s.db, s.s.userId, article.project_id)
  if (!o.ok) return o
  const current = await readProjectWritingGuidance(o.db, o.projectId, o.userId)
  if (current.state === 'error' || current.state === 'missing_column') return { ok: false, code: 'unavailable' }
  const next = withRule(current.guidance, rule)
  if (!next.ok) return next
  if (!next.duplicate) {
    const w = await write(o, next.guidance)
    if (!w.ok) return w
  }
  return { ok: true, projectId: o.projectId, duplicate: next.duplicate, count: next.guidance.rules.length }
}
