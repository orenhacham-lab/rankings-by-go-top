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
import { AUTHOR_BOX_COLUMN, AUTHOR_IMAGE_COLUMN, AUTHOR_NAME_COLUMN, AUTHOR_URL_COLUMN, readAuthorBoxOverrides, readAuthorBoxSetting } from '@/lib/content/author-box/store'
import { AUTHOR_BOX_IMAGE_CHOICES, cleanAuthorBoxName, normalizeAuthorBoxUrl, type AuthorBoxImageChoice } from '@/lib/content/author-box/box'
import { AUTHOR_PHOTO_MEDIA_COLUMN, AUTHOR_PHOTO_PATH_COLUMN, readAuthorPhoto, removeAuthorPhotoObject, type PhotoStorage } from '@/lib/content/author-box/photo'

export type GuidanceSession = { userId: string | null; db: SupabaseClient }
export type GuidanceDeps = {
  session: () => Promise<GuidanceSession>
  now?: () => Date
  /**
   * The service-role client's storage, for removing the owner's uploaded author
   * photo when a save sets the image back to 'none' or 'site_icon'
   * (lib/content/author-box/photo.ts). Without it such a save is refused while a photo exists.
   */
  storage?: () => PhotoStorage
}

export type GuidanceView = {
  guidance: WritingGuidance
  /** False while the column does not exist: the card shows nothing to edit and cannot save. */
  editable: boolean
  /**
   * The author box (lib/content/author-box): added to published articles only
   * when the site's theme has none. Off by default; its own column
   * (project_article_styles.author_box), so its switch is disabled while that
   * column does not exist, without taking the guidance down with it.
   */
  authorBox: boolean
  authorBoxEditable: boolean
  /**
   * The owner's own name, link and image for the box ('' / 'none' = the
   * resolver's choice: lib/content/author-box/box.ts). Their own columns
   * (author_box_name, author_box_url, author_box_image), so the fields are
   * disabled while those do not exist, and the box works as before.
   */
  authorBoxName: string
  authorBoxUrl: string
  authorBoxImage: AuthorBoxImageChoice
  authorBoxOverridesEditable: boolean
  /** An uploaded author photo is stored (lib/content/author-box/photo.ts). */
  authorBoxPhoto: boolean
  /** Its columns exist (20261017120000_project_author_photo.sql); false = 'upload' is not offered. */
  authorBoxPhotoEditable: boolean
}

export type GuidanceErrorCode = 'unauthorized' | 'not_found' | 'invalid_request' | 'unavailable' | 'save_failed'
export type LoadGuidanceResult = { ok: true; data: GuidanceView } | { ok: false; code: GuidanceErrorCode }
export type SaveGuidanceResult = LoadGuidanceResult | { ok: false; code: 'invalid_guidance'; invalid: GuidanceField[] } | { ok: false; code: 'invalid_author_link' }
export type AddRuleResult =
  | { ok: true; projectId: string; duplicate: boolean; count: number }
  | { ok: false; code: GuidanceErrorCode | 'invalid_rule' | 'rules_full' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Owner = { ok: true; db: SupabaseClient; userId: string; projectId: string } | { ok: false; code: GuidanceErrorCode }

async function session(deps: Pick<GuidanceDeps, 'session'>): Promise<{ ok: true; s: GuidanceSession & { userId: string } } | { ok: false; code: GuidanceErrorCode }> {
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

/** The signed-in owner's own project (RLS client, and the owner named), or a code. Shared with the author-box preview. */
export async function owner(deps: Pick<GuidanceDeps, 'session'>, projectId: unknown): Promise<Owner> {
  const s = await session(deps)
  if (!s.ok) return s
  return projectOwner(s.s.db, s.s.userId, projectId)
}

async function readView(o: Extract<Owner, { ok: true }>): Promise<LoadGuidanceResult> {
  const read = await readProjectWritingGuidance(o.db, o.projectId, o.userId)
  if (read.state === 'error') return { ok: false, code: 'unavailable' }
  const box = publicBox(await readAuthorBox(o))
  if (read.state === 'missing_column') return { ok: true, data: { guidance: read.guidance, editable: false, ...box } }
  // No row yet: whether the column exists decides if the card can save (a first save creates the row).
  if (read.state === 'default') return { ok: true, data: { guidance: read.guidance, editable: await columnExists(o, WRITING_GUIDANCE_COLUMN), ...box } }
  return { ok: true, data: { guidance: read.guidance, editable: true, ...box } }
}

type AuthorBoxView = Pick<GuidanceView, 'authorBox' | 'authorBoxEditable' | 'authorBoxName' | 'authorBoxUrl' | 'authorBoxImage' | 'authorBoxOverridesEditable' | 'authorBoxPhoto' | 'authorBoxPhotoEditable'> & { photoPath: string | null }

/** The author-box switch, name, link and image: off / empty, and not editable, while their columns are missing or unreadable. */
async function readAuthorBox(o: Extract<Owner, { ok: true }>): Promise<AuthorBoxView> {
  const [s, v, ph] = await Promise.all([readAuthorBoxSetting(o.db, o.projectId, o.userId), readAuthorBoxOverrides(o.db, o.projectId, o.userId), readAuthorPhoto(o.db, o.projectId, o.userId)])
  const sw = s.state === 'saved' ? { authorBox: s.enabled, authorBoxEditable: true }
    : s.state === 'default' ? { authorBox: false, authorBoxEditable: await columnExists(o, AUTHOR_BOX_COLUMN) }
      : { authorBox: false, authorBoxEditable: false }
  const editable = v.state === 'saved' ? true
    : v.state === 'default' ? await columnExists(o, `${AUTHOR_NAME_COLUMN}, ${AUTHOR_URL_COLUMN}, ${AUTHOR_IMAGE_COLUMN}`)
      : false
  const photoEditable = editable && (ph.state === 'saved' ? true : ph.state === 'default' ? await columnExists(o, `${AUTHOR_PHOTO_PATH_COLUMN}, ${AUTHOR_PHOTO_MEDIA_COLUMN}`) : false)
  // While the photo's columns are missing, an 'upload' read off the row cannot exist (the CHECK refuses it); shown as none.
  const image = v.image === 'upload' && !photoEditable ? 'none' : v.image
  return {
    ...sw, authorBoxName: v.name, authorBoxUrl: v.url, authorBoxImage: image, authorBoxOverridesEditable: editable,
    authorBoxPhoto: !!ph.path, authorBoxPhotoEditable: photoEditable, photoPath: ph.path,
  }
}

const publicBox = ({ photoPath: _p, ...view }: AuthorBoxView): Omit<AuthorBoxView, 'photoPath'> => { void _p; return view }

type AuthorBoxWrite = { authorBox?: boolean; name?: string | null; url?: string | null; image?: AuthorBoxImageChoice; clearPhoto?: boolean }

/**
 * The card's author-box fields, checked: the name cleaned exactly as a name is
 * (cleanAuthorBoxName), '' = none; the link http(s) only (normalizeAuthorBoxUrl),
 * '' = none, anything else refused; the image one of the known choices.
 */
export function parseAuthorBoxInput(input: Record<string, unknown>): { ok: true; value: Omit<AuthorBoxWrite, 'authorBox'> } | { ok: false; code: 'invalid_request' | 'invalid_author_link' } {
  const value: Omit<AuthorBoxWrite, 'authorBox'> = {}
  const { authorBoxName: name, authorBoxUrl: url, authorBoxImage: image } = input
  if (name !== undefined) {
    if (typeof name !== 'string') return { ok: false, code: 'invalid_request' }
    value.name = cleanAuthorBoxName(name) || null
  }
  if (url !== undefined) {
    if (typeof url !== 'string') return { ok: false, code: 'invalid_request' }
    if (!url.trim()) value.url = null
    else {
      const ok = normalizeAuthorBoxUrl(url)
      if (!ok) return { ok: false, code: 'invalid_author_link' }
      value.url = ok
    }
  }
  if (image !== undefined) {
    if (!(AUTHOR_BOX_IMAGE_CHOICES as readonly unknown[]).includes(image)) return { ok: false, code: 'invalid_request' }
    value.image = image as AuthorBoxImageChoice
  }
  return { ok: true, value }
}

async function columnExists(o: Extract<Owner, { ok: true }>, column: string): Promise<boolean> {
  try {
    const { error } = await o.db.from(ARTICLE_STYLE_TABLE).select(`project_id, ${column}`).eq('project_id', o.projectId).eq('user_id', o.userId).limit(1)
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
async function write(o: Extract<Owner, { ok: true }>, g: WritingGuidance, box: AuthorBoxWrite = {}): Promise<{ ok: true } | { ok: false; code: GuidanceErrorCode }> {
  const { error } = await o.db
    .from(ARTICLE_STYLE_TABLE)
    .upsert({
      project_id: o.projectId,
      user_id: o.userId,
      [WRITING_GUIDANCE_COLUMN]: toGuidanceRow(g),
      // Only when the card sent it and its column exists (see saveWritingGuidance).
      ...(typeof box.authorBox === 'boolean' ? { [AUTHOR_BOX_COLUMN]: box.authorBox } : {}),
      // The same rule for the owner's own name, link and image (their own columns).
      ...(box.name !== undefined ? { [AUTHOR_NAME_COLUMN]: box.name } : {}),
      ...(box.url !== undefined ? { [AUTHOR_URL_COLUMN]: box.url } : {}),
      ...(box.image !== undefined ? { [AUTHOR_IMAGE_COLUMN]: box.image } : {}),
      // The photo's object was removed first (saveWritingGuidance); its pointer and site copy go with it.
      ...(box.clearPhoto ? { [AUTHOR_PHOTO_PATH_COLUMN]: null, [AUTHOR_PHOTO_MEDIA_COLUMN]: null } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' })
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
  const rawBox = (input as Record<string, unknown>).authorBox
  if (rawBox !== undefined && typeof rawBox !== 'boolean') return { ok: false, code: 'invalid_request' }
  const parsedBox = parseAuthorBoxInput(input as Record<string, unknown>)
  if (!parsedBox.ok) return parsedBox
  // A switch, name, link or image whose column does not exist yet is not written (the guidance still saves).
  const boxView = await readAuthorBox(o)
  const authorBox = typeof rawBox === 'boolean' && boxView.authorBoxEditable ? rawBox : undefined
  const overrides: AuthorBoxWrite = boxView.authorBoxOverridesEditable ? { ...parsedBox.value } : {}
  if (overrides.image === 'upload' && (!boxView.authorBoxPhotoEditable || !boxView.photoPath)) {
    // 'upload' is set by the upload itself (lib/content/author-box/photo.ts); never without a stored photo.
    return { ok: false, code: 'invalid_request' }
  }
  if (overrides.image !== undefined && overrides.image !== 'upload' && boxView.photoPath) {
    // Back to none or the site icon: the stored photo is REMOVED from storage, not only unlinked.
    if (!deps.storage) return { ok: false, code: 'unavailable' }
    if (!(await removeAuthorPhotoObject(deps.storage(), o.projectId, boxView.photoPath))) return { ok: false, code: 'save_failed' }
    overrides.clearPhoto = true
  }
  // Rules keep the time and article they came with; a rule typed in the card is stamped now.
  const current = await readProjectWritingGuidance(o.db, o.projectId, o.userId)
  if (current.state === 'error') return { ok: false, code: 'unavailable' }
  const known = new Map(current.guidance.rules.map((r) => [r.text, r]))
  const now = (deps.now ?? (() => new Date()))().toISOString()
  const rules = parsed.guidance.rules.map((r) => known.get(r.text) ?? { ...r, at: now, articleId: null })
  const w = await write(o, { ...parsed.guidance, rules }, { authorBox, ...overrides })
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
