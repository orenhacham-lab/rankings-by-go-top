/**
 * The "article design" card's server side: read, save, and read the site's own
 * colours, as the signed-in owner. Framework-free, so the whole contract runs
 * under test (./__qa__); app/(dashboard)/settings/article-style-actions.ts only
 * wires the real session in.
 *
 * AS THE OWNER. The settings row is read and written through the owner's own
 * RLS-scoped client, and every query ALSO names the owner (`.eq('user_id')`),
 * after the project itself was read that way. A request for someone else's
 * project is not_found before anything else happens. The service role is used
 * for one thing: which platform the project publishes to (connections are
 * server-only tables), after ownership was proven.
 *
 * NO TABLE YET. While the migration is not applied, the card is read-only:
 * `editable: false` with the defaults (today's behaviour), and a save answers
 * `unavailable`.
 *
 * Nothing the database or a site says reaches the screen: failures are codes.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { sampleSiteColors, type SampledColor } from './colors'
import { cleanProfiles, detectProfilesFromHtml, parseProfilesInput, type OfficialProfiles, type ProfileNetwork } from './profiles'
import { ARTICLE_CTA_COLUMN, ARTICLE_STYLE_COLUMNS, ARTICLE_STYLE_TABLE, isMissingRelation, readProjectArticleCta } from './store'
import { DEFAULT_ARTICLE_CTA, findContactUrl, parseArticleCtaInput, toCtaRow, type ArticleCta, type CtaField } from './cta'
import {
  DEFAULT_ARTICLE_STYLE,
  parseArticleStyleInput,
  toArticleStyle,
  toRow,
  type ArticleStyle,
  type DesignPlatform,
} from './types'

export type ArticleStyleSession = { userId: string | null; db: SupabaseClient }

export type ArticleStyleDeps = {
  session: () => Promise<ArticleStyleSession>
  /** The project's publishing platform, read with the service role after the ownership check. */
  platform: (projectId: string) => Promise<DesignPlatform>
  /** The home page's HTML, fetched with the SSRF-guarded site fetcher; null when it cannot be read. */
  fetchHome: (domain: string) => Promise<string | null>
}

export type ArticleStyleView = {
  style: ArticleStyle
  /** False while the table does not exist: the card shows the defaults and cannot save. */
  editable: boolean
  /** True once the owner saved the card; until then the defaults are today's behaviour. */
  saved: boolean
  platform: DesignPlatform
  domain: string | null
  /** The business's official profiles (structured-data sameAs). */
  profiles: OfficialProfiles
  /** The project's call to action at the end of its articles (off until the owner turns it on). */
  cta: ArticleCta
  /** True once the owner saved a call to action (on or off); until then the card offers a suggestion. */
  ctaSaved: boolean
  /** False while its column does not exist yet (the migration is not applied): the section is read-only. */
  ctaEditable: boolean
  /** The site's contact page when the full-site mapping found one: the suggested button goes there. */
  contactUrl?: string | null
}

export type ArticleStyleErrorCode = 'unauthorized' | 'not_found' | 'invalid_request' | 'unavailable' | 'save_failed'
export type LoadStyleResult = { ok: true; data: ArticleStyleView } | { ok: false; code: ArticleStyleErrorCode }
export type SaveStyleResult = LoadStyleResult | { ok: false; code: 'invalid_cta'; invalid: CtaField[] }
export type SaveProfilesResult = LoadStyleResult | { ok: false; code: 'invalid_profiles'; invalid: ProfileNetwork[] }
/** What the home page says about the business: its colours and the profiles it links to. */
export type SiteSignalsResult =
  | { ok: true; colors: SampledColor[]; profiles: OfficialProfiles }
  | { ok: false; code: ArticleStyleErrorCode | 'site_unreachable' }

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i

type Owner = { ok: true; db: SupabaseClient; userId: string; projectId: string; domain: string | null } | { ok: false; code: ArticleStyleErrorCode }

async function owner(deps: ArticleStyleDeps, projectId: unknown): Promise<Owner> {
  let session: ArticleStyleSession
  try {
    session = await deps.session()
  } catch {
    return { ok: false, code: 'unavailable' }
  }
  if (!session.userId) return { ok: false, code: 'unauthorized' }
  if (typeof projectId !== 'string' || !UUID.test(projectId)) return { ok: false, code: 'not_found' }
  const { data, error } = await session.db
    .from('projects')
    .select('id, user_id, target_domain')
    .eq('id', projectId)
    .eq('user_id', session.userId)
    .maybeSingle()
  if (error) return { ok: false, code: 'unavailable' }
  const row = data as { id: string; user_id: string; target_domain: string | null } | null
  if (!row || row.user_id !== session.userId) return { ok: false, code: 'not_found' }
  return { ok: true, db: session.db, userId: session.userId, projectId: row.id, domain: row.target_domain ?? null }
}

async function platformOf(deps: ArticleStyleDeps, projectId: string): Promise<DesignPlatform> {
  try {
    return await deps.platform(projectId)
  } catch {
    return 'none'
  }
}

async function readView(deps: ArticleStyleDeps, o: Extract<Owner, { ok: true }>): Promise<LoadStyleResult> {
  const { data, error } = await o.db
    .from(ARTICLE_STYLE_TABLE)
    .select(ARTICLE_STYLE_COLUMNS)
    .eq('project_id', o.projectId)
    .eq('user_id', o.userId)
    .maybeSingle()
  const platform = await platformOf(deps, o.projectId)
  const off = { cta: { ...DEFAULT_ARTICLE_CTA }, ctaSaved: false, ctaEditable: false, contactUrl: null }
  if (error) {
    if (!isMissingRelation(error)) return { ok: false, code: 'unavailable' }
    return { ok: true, data: { style: { ...DEFAULT_ARTICLE_STYLE, brandColors: [] }, editable: false, saved: false, platform, domain: o.domain, profiles: {}, ...off } }
  }
  const row = data as Record<string, unknown> | null
  const saved = !!row && row.project_id === o.projectId && row.user_id === o.userId
  // Read on its own, so a missing column never takes the design settings down with it.
  const ctaRead = saved ? await readProjectArticleCta(o.db, o.projectId, o.userId) : null
  const cta = ctaRead
    ? { cta: ctaRead.cta, ctaSaved: ctaRead.state === 'saved', ctaEditable: ctaRead.state === 'saved' || ctaRead.state === 'default' }
    : { cta: { ...DEFAULT_ARTICLE_CTA }, ctaSaved: false, ctaEditable: await ctaColumnExists(o) }
  const contactUrl = cta.ctaSaved ? null : await readContactUrl(o)
  return {
    ok: true,
    data: { style: toArticleStyle(saved ? row : null), editable: true, saved, platform, domain: o.domain, profiles: cleanProfiles(saved ? row?.official_profiles : null), ...cta, contactUrl },
  }
}

/**
 * The contact page among the pages the full-site mapping found (site_page_map, read with the owner's own
 * RLS client and named by project AND owner). Only needed for the suggestion, so only read before the
 * owner saved a call to action. Any failure, or a table that does not exist yet, is "not known".
 */
async function readContactUrl(o: Extract<Owner, { ok: true }>): Promise<string | null> {
  try {
    const { data, error } = await o.db.from('site_page_map').select('entries').eq('project_id', o.projectId).eq('user_id', o.userId).maybeSingle()
    if (error || !data) return null
    const entries = (data as { entries?: unknown }).entries
    return findContactUrl(Array.isArray(entries) ? entries as { u?: unknown }[] : null, o.domain)
  } catch {
    return null
  }
}

/** With no row yet, whether the call-to-action column exists (the owner's own RLS read; no row is fine). */
async function ctaColumnExists(o: Extract<Owner, { ok: true }>): Promise<boolean> {
  try {
    const { error } = await o.db.from(ARTICLE_STYLE_TABLE).select(`project_id, ${ARTICLE_CTA_COLUMN}`).eq('project_id', o.projectId).eq('user_id', o.userId).limit(1)
    return !error
  } catch {
    return false
  }
}

export async function loadArticleStyle(deps: ArticleStyleDeps, projectId: unknown): Promise<LoadStyleResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  return readView(deps, o)
}

export async function saveArticleStyle(deps: ArticleStyleDeps, projectId: unknown, input: unknown): Promise<SaveStyleResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  const style = parseArticleStyleInput(input)
  if (!style) return { ok: false, code: 'invalid_request' }
  // The call to action rides along only when the card sends it (its column exists); one upsert, so
  // the design and the call to action are saved together or not at all.
  const rawCta = (input as { cta?: unknown }).cta
  let ctaRow: Record<string, unknown> | null = null
  if (rawCta !== undefined) {
    const parsed = parseArticleCtaInput(rawCta)
    if (!parsed.ok) return parsed.invalid.length ? { ok: false, code: 'invalid_cta', invalid: parsed.invalid } : { ok: false, code: 'invalid_request' }
    ctaRow = toCtaRow(parsed.cta)
  }
  const { error } = await o.db
    .from(ARTICLE_STYLE_TABLE)
    .upsert({
      project_id: o.projectId, user_id: o.userId, ...toRow(style),
      ...(ctaRow ? { [ARTICLE_CTA_COLUMN]: ctaRow } : {}),
      updated_at: new Date().toISOString(),
    }, { onConflict: 'project_id' })
  if (error) return { ok: false, code: isMissingRelation(error) ? 'unavailable' : 'save_failed' }
  return readView(deps, o)
}

/**
 * Save the official profiles alone. The upsert names only that column, so it
 * never touches the design settings (and a first save creates the row with
 * the design defaults, which are today's behaviour).
 */
export async function saveOfficialProfiles(deps: ArticleStyleDeps, projectId: unknown, input: unknown): Promise<SaveProfilesResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  const parsed = parseProfilesInput(input)
  if (!parsed.ok) return parsed.invalid.length ? { ok: false, code: 'invalid_profiles', invalid: parsed.invalid } : { ok: false, code: 'invalid_request' }
  const { error } = await o.db
    .from(ARTICLE_STYLE_TABLE)
    .upsert({ project_id: o.projectId, user_id: o.userId, official_profiles: parsed.profiles, updated_at: new Date().toISOString() }, { onConflict: 'project_id' })
  if (error) return { ok: false, code: isMissingRelation(error) ? 'unavailable' : 'save_failed' }
  return readView(deps, o)
}

/**
 * The colours the project's home page declares and the profiles it links to.
 * Read live (one guarded fetch of the home page); nothing is saved: the owner
 * picks what to keep.
 */
export async function readSiteSignals(deps: ArticleStyleDeps, projectId: unknown): Promise<SiteSignalsResult> {
  const o = await owner(deps, projectId)
  if (!o.ok) return o
  const domain = (o.domain ?? '').trim()
  if (!domain) return { ok: false, code: 'site_unreachable' }
  let html: string | null = null
  try {
    html = await deps.fetchHome(domain)
  } catch {
    html = null
  }
  if (!html) return { ok: false, code: 'site_unreachable' }
  return { ok: true, colors: sampleSiteColors(html), profiles: detectProfilesFromHtml(html) }
}
