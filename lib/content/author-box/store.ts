/**
 * The author box at publish time: is it on for the project, does the site's
 * theme already have one, and what does it say. Called by applyArticleDesign
 * (lib/content/article-style/publish.ts), the one place every publisher
 * (WordPress over the plugin or the application password, a Shopify store, a
 * custom site's webhook) composes the body it sends. Wix gets no box.
 *
 * SERVICE ROLE. The caller holds the service-role client, which bypasses RLS,
 * so every read and write of a project's rows names the project AND its owner
 * (read off the project row): project_article_styles and project_profiles by
 * `.eq('project_id').eq('user_id', owner)`, site_page_map the same; the
 * project's published articles by `.eq('project_id')`, and a page address is
 * only fetched when its host is the project's own site.
 *
 * THE THEME TEST is cached on the project's settings row
 * (theme_author_box, theme_author_box_checked_at): a clear answer is kept
 * THEME_CHECK_TTL_MS (14 days), an unreadable page UNKNOWN_TTL_MS (1 day), so
 * a site is not fetched for every article. The page is fetched through the
 * free check's guarded fetcher (normalizeCheckUrl + fetchSiteHtml: public
 * hosts only, every redirect re-admitted, size and time capped).
 *
 * FAILS SAFE: no column yet (the migration is not applied), the setting off,
 * any read error, no published page, a page that could not be read or was cut
 * off: no box. Never fails a publish.
 */
import type { SupabaseClient } from '@supabase/supabase-js'
import { normalizeCheckUrl } from '@/lib/free-check/url-guard'
import { fetchSiteHtml } from '@/lib/free-check/site-fetch'
import { ARTICLE_STYLE_TABLE, isMissingRelation } from '@/lib/content/article-style/store'
import { articleLanguage } from '@/lib/content/article-style/labels'
import { authorBoxContent, authorBoxLanguage, themeHasAuthorBox, type AuthorBoxContent } from './box'

export const AUTHOR_BOX_COLUMN = 'author_box'
export const THEME_BOX_COLUMN = 'theme_author_box'
export const THEME_CHECKED_COLUMN = 'theme_author_box_checked_at'

export const THEME_CHECK_TTL_MS = 14 * 24 * 60 * 60 * 1000
export const UNKNOWN_TTL_MS = 24 * 60 * 60 * 1000

export type AuthorBoxPlatform = 'wordpress' | 'webhook' | 'shopify'

export type AuthorBoxSetting = {
  state: 'saved' | 'default' | 'missing_column' | 'error'
  enabled: boolean
  /** The cached theme test: true has a box, false has none, null unknown. */
  themeHasBox: boolean | null
  checkedAt: string | null
}

/** The project's author-box setting and cached theme test, read for its owner. Off on any failure. */
export async function readAuthorBoxSetting(db: SupabaseClient, projectId: string, ownerId: string): Promise<AuthorBoxSetting> {
  const off = (state: AuthorBoxSetting['state']): AuthorBoxSetting => ({ state, enabled: false, themeHasBox: null, checkedAt: null })
  try {
    const { data, error } = await db
      .from(ARTICLE_STYLE_TABLE)
      .select(`project_id, user_id, ${AUTHOR_BOX_COLUMN}, ${THEME_BOX_COLUMN}, ${THEME_CHECKED_COLUMN}`)
      .eq('project_id', projectId)
      .eq('user_id', ownerId)
      .maybeSingle()
    if (error) return off(isMissingRelation(error) ? 'missing_column' : 'error')
    const row = data as Record<string, unknown> | null
    if (!row || row.project_id !== projectId || row.user_id !== ownerId) return off('default')
    const detected = row[THEME_BOX_COLUMN]
    const at = row[THEME_CHECKED_COLUMN]
    return {
      state: 'saved',
      // NULL or anything that is not exactly true is off.
      enabled: row[AUTHOR_BOX_COLUMN] === true,
      themeHasBox: typeof detected === 'boolean' ? detected : null,
      checkedAt: typeof at === 'string' && !Number.isNaN(Date.parse(at)) ? at : null,
    }
  } catch {
    return off('error')
  }
}

export type ThemeAnswer = 'has_box' | 'no_box' | 'unknown'

/** A cached answer that is still fresh, or null when the site should be read again. */
export function cachedThemeAnswer(s: Pick<AuthorBoxSetting, 'themeHasBox' | 'checkedAt'>, now: Date): ThemeAnswer | null {
  if (!s.checkedAt) return null
  const age = now.getTime() - Date.parse(s.checkedAt)
  if (age < 0) return null
  if (s.themeHasBox === true && age < THEME_CHECK_TTL_MS) return 'has_box'
  if (s.themeHasBox === false && age < THEME_CHECK_TTL_MS) return 'no_box'
  if (s.themeHasBox === null && age < UNKNOWN_TTL_MS) return 'unknown'
  return null
}

const bareHost = (h: string) => h.toLowerCase().replace(/\.$/, '').replace(/^www\./, '')
const domainHost = (d: unknown) => bareHost(String(d ?? '').trim().replace(/^https?:\/\//i, '').replace(/[/?#].*$/, ''))

/** The address may be fetched for the project: http(s), on the project's own site (a Shopify store also on its myshopify.com host). */
export function isProjectPage(url: unknown, domain: unknown, platform: AuthorBoxPlatform): boolean {
  if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return false
  let u: URL
  try { u = new URL(url) } catch { return false }
  const h = bareHost(u.hostname)
  const site = domainHost(domain)
  if (site && h === site) return true
  return platform === 'shopify' && h.endsWith('.myshopify.com')
}

const URL_COLUMN: Record<AuthorBoxPlatform, string> = { wordpress: 'wp_post_url', shopify: 'shopify_article_url', webhook: 'site_post_url' }

/**
 * One already-published post page of the project's site: this article's own
 * address when it has one, else the most recently published article's.
 */
export async function findPublishedPage(admin: SupabaseClient, projectId: string, articleId: string, domain: string | null, platform: AuthorBoxPlatform): Promise<string | null> {
  const col = URL_COLUMN[platform]
  try {
    const { data } = await admin
      .from('generated_articles')
      .select(`id, project_id, ${col}, published_at`)
      .eq('project_id', projectId)
      .not(col, 'is', null)
      .order('published_at', { ascending: false })
      .limit(20)
    const rows = ((data ?? []) as unknown as Record<string, unknown>[]).filter((r) => r.project_id === projectId && isProjectPage(r[col], domain, platform))
    const own = rows.find((r) => r.id === articleId)
    const pick = own ?? rows[0]
    return pick ? String(pick[col]) : null
  } catch {
    return null
  }
}

export type ThemeDeps = {
  fetchHtml?: typeof fetchSiteHtml
  now?: () => Date
}

/** Read the page and test it. A page that was cut off and showed no box is not a clear "no". */
export async function testThemePage(url: string, fetchHtml: typeof fetchSiteHtml = fetchSiteHtml): Promise<ThemeAnswer> {
  try {
    const u = normalizeCheckUrl(url)
    if (!u.ok) return 'unknown'
    const page = await fetchHtml(u.url)
    if (!page.ok) return 'unknown'
    if (themeHasAuthorBox(page.html)) return 'has_box'
    return page.truncated ? 'unknown' : 'no_box'
  } catch {
    return 'unknown'
  }
}

async function storeThemeAnswer(admin: SupabaseClient, projectId: string, ownerId: string, answer: ThemeAnswer, now: Date): Promise<void> {
  try {
    await admin
      .from(ARTICLE_STYLE_TABLE)
      .update({ [THEME_BOX_COLUMN]: answer === 'has_box' ? true : answer === 'no_box' ? false : null, [THEME_CHECKED_COLUMN]: now.toISOString() })
      .eq('project_id', projectId)
      .eq('user_id', ownerId)
  } catch {
    // The cache is a convenience: the next publish reads the site again.
  }
}

async function readAboutUrl(admin: SupabaseClient, projectId: string, ownerId: string, domain: string | null): Promise<string | null> {
  try {
    const { data, error } = await admin.from('site_page_map').select('project_id, user_id, entries').eq('project_id', projectId).eq('user_id', ownerId).maybeSingle()
    const row = data as { project_id?: string; user_id?: string; entries?: unknown } | null
    if (error || !row || row.project_id !== projectId || row.user_id !== ownerId) return null
    return findAboutUrl(Array.isArray(row.entries) ? (row.entries as { u?: unknown }[]) : null, domain)
  } catch {
    return null
  }
}

const ABOUT_PATH = /(^|\/)(about|about-us|aboutus|about_us|who-we-are|אודות|עלינו|אודותינו|sobre|sobre-nosotros|quienes-somos|nosotros|sobre-nos|quem-somos)(\/|$)/i

/** The site's about page among the mapped pages, the shortest path first; null when none is known. Pure. */
export function findAboutUrl(entries: readonly { u?: unknown }[] | null | undefined, domain?: string | null): string | null {
  const site = domainHost(domain)
  let best: string | null = null
  for (const e of entries ?? []) {
    if (!e || typeof e.u !== 'string') continue
    let url: URL
    try { url = new URL(e.u) } catch { continue }
    if (url.protocol !== 'https:' && url.protocol !== 'http:') continue
    if (site && bareHost(url.hostname) !== site) continue
    let path: string
    try { path = decodeURIComponent(url.pathname) } catch { path = url.pathname }
    if (!ABOUT_PATH.test(path)) continue
    if (best === null || path.length < new URL(best).pathname.length) best = `https://${url.host}${url.pathname}`
  }
  return best
}

type ProjectFacts = { owner: string; name: string | null; domain: string | null; language: string | null }

async function readProject(admin: SupabaseClient, projectId: string): Promise<ProjectFacts | null> {
  try {
    const { data } = await admin.from('projects').select('id, user_id, name, business_name, target_domain, language').eq('id', projectId).maybeSingle()
    const p = data as { id?: string; user_id?: string | null; name?: string | null; business_name?: string | null; target_domain?: string | null; language?: string | null } | null
    if (!p || p.id !== projectId || !p.user_id) return null
    return { owner: p.user_id, name: (p.business_name || p.name || null), domain: p.target_domain ?? null, language: p.language ?? null }
  } catch {
    return null
  }
}

async function readDescription(admin: SupabaseClient, projectId: string, ownerId: string): Promise<string | null> {
  try {
    const { data, error } = await admin.from('project_profiles').select('project_id, user_id, description').eq('project_id', projectId).eq('user_id', ownerId).maybeSingle()
    const row = data as { project_id?: string; user_id?: string; description?: unknown } | null
    if (error || !row || row.project_id !== projectId || row.user_id !== ownerId) return null
    return typeof row.description === 'string' && row.description.trim() ? row.description : null
  } catch {
    return null
  }
}

async function readTopicLanguage(admin: SupabaseClient, articleId: string, projectId: string): Promise<string | null> {
  try {
    const { data } = await admin.from('generated_articles').select('id, project_id, topic_id').eq('id', articleId).eq('project_id', projectId).maybeSingle()
    const topicId = (data as { topic_id?: string | null } | null)?.topic_id
    if (!topicId) return null
    const { data: t } = await admin.from('content_topics').select('id, project_id, language').eq('id', topicId).eq('project_id', projectId).maybeSingle()
    return (t as { language?: string | null } | null)?.language ?? null
  } catch {
    return null
  }
}

export type AuthorBoxDecision =
  | { add: true; content: AuthorBoxContent }
  | { add: false; reason: 'off' | 'no_project' | 'theme_has_box' | 'theme_unknown' | 'no_name' | 'error' }

export type AuthorBoxRequest = {
  articleId: string
  projectId: string
  platform: AuthorBoxPlatform
  html: string
  /** The name the post is published under on the site, asked only when a box will be added. */
  authorName?: () => Promise<string | null>
}

/** Whether to add the box to this article, and what it says. */
export async function decideAuthorBox(admin: SupabaseClient, req: AuthorBoxRequest, deps: ThemeDeps = {}): Promise<AuthorBoxDecision> {
  try {
    const project = await readProject(admin, req.projectId)
    if (!project) return { add: false, reason: 'no_project' }
    const setting = await readAuthorBoxSetting(admin, req.projectId, project.owner)
    if (!setting.enabled) return { add: false, reason: 'off' }

    const now = (deps.now ?? (() => new Date()))()
    let answer = cachedThemeAnswer(setting, now)
    if (answer === null) {
      const page = await findPublishedPage(admin, req.projectId, req.articleId, project.domain, req.platform)
      // Nothing published yet: nothing to read, and nothing worth caching.
      if (!page) return { add: false, reason: 'theme_unknown' }
      answer = await testThemePage(page, deps.fetchHtml)
      await storeThemeAnswer(admin, req.projectId, project.owner, answer, now)
    }
    if (answer === 'has_box') return { add: false, reason: 'theme_has_box' }
    if (answer !== 'no_box') return { add: false, reason: 'theme_unknown' }

    let authorName: string | null = null
    try { authorName = req.authorName ? await req.authorName() : null } catch { authorName = null }
    const [description, aboutUrl, topicLanguage] = await Promise.all([
      readDescription(admin, req.projectId, project.owner),
      readAboutUrl(admin, req.projectId, project.owner, project.domain),
      readTopicLanguage(admin, req.articleId, req.projectId),
    ])
    const language = authorBoxLanguage(topicLanguage) ?? authorBoxLanguage(project.language) ?? articleLanguage(req.html)
    const content = authorBoxContent({ language, authorName, businessName: project.name, description, domain: project.domain, aboutUrl })
    return content ? { add: true, content } : { add: false, reason: 'no_name' }
  } catch {
    return { add: false, reason: 'error' }
  }
}
