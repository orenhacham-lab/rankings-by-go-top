/**
 * The article's structured data (JSON-LD: BlogPosting, and FAQPage when the
 * article has complete FAQ pairs) on a WordPress site, through the GO TOP Bridge
 * plugin (wave 8).
 *
 * Before this, a WordPress article went out without any schema: only the
 * webhook payload carried structured_data. The plugin already stores one JSON-LD
 * value per post (post meta _gotop_schema_jsonld, written by its /fix route with
 * type "schema_jsonld") and prints it in the page's <head>, escaped
 * (wordpress-plugin/gotop-seo-bridge/includes/output.php). This step hands it the
 * article's own markup right after the post is published, with no plugin change:
 *
 *   - built by the same pure builder as the Schema tab and the webhook
 *     (lib/content/structured-data.ts buildStructuredData), from the article's
 *     own fields; nothing invented;
 *   - checked by the same whitelist the site-health schema fix uses
 *     (lib/site-fix/whitelist.ts validSchema): only the schema types we write,
 *     no markup characters, size and depth bounds; the plugin checks it again;
 *   - sent with a job id derived from the article and the markup itself, so a
 *     republish of an unchanged article is the plugin's "already", and a
 *     changed one replaces it (the plugin keeps the previous value for undo).
 *
 * ONLY when the plugin is connected. WordPress without the plugin: nothing is
 * injected into the post content (a script in post_content is stripped by
 * WordPress and is not ours to put there); the outcome says `no_plugin`.
 * Shopify and Wix: never called (standing decision: no schema there).
 *
 * YOAST OR RANK MATH ON THE SITE: they already print the page's article markup
 * in their own graph, so ours would be a second, possibly contradicting one
 * (another author, other dates). Then only the FAQPage is sent, which they do
 * not make for our articles; with no FAQ, nothing is sent (`seo_plugin_article`).
 * The site is asked at publish time (its REST namespaces); when it does not
 * answer, what the Bridge plugin last reported (site_fix_plugin_links.seo_plugin).
 * Neither known: the full markup, since a duplicate does no harm and a missing
 * article markup on a plain site would.
 *
 * NEVER FAILS A PUBLISH: every outcome is a code, logged once; nothing a site
 * says is shown to anyone. The service role bypasses RLS, so every read names
 * the project and its owner.
 */
import crypto from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { loadSchemaContext } from '@/lib/content/article-visibility'
import { buildStructuredData, type JsonLd, type StructuredDataFaq } from '@/lib/content/structured-data'
import { pluginFix, type PluginLink, type PluginPost } from '@/lib/site-fix/plugin-client'
import { readPluginLink } from '@/lib/site-fix/store'
import { LIMITS, validSchema } from '@/lib/site-fix/whitelist'
import type { SeoPlugin } from '@/lib/content/wordpress-taxonomy'

type Admin = ReturnType<typeof createAdminClient>

export type ArticleSchemaOutcome =
  | 'applied' | 'already'
  | 'no_plugin' | 'plugin_not_connected' | 'not_published' | 'no_url' | 'no_article' | 'no_markup' | 'too_large'
  | 'seo_plugin_article'
  | 'plugin_refused' | 'error'

/** The SEO plugins that print their own article markup (lib/content/wordpress-taxonomy.ts SeoPlugin). */
const ARTICLE_MARKUP_PLUGINS: ReadonlySet<string> = new Set(['yoast', 'rankmath'])

export interface ArticleSchemaDeps {
  decrypt: (s: string) => string
  /** The site's SEO plugin, asked only once the Bridge plugin is known to be connected. */
  detectSeoPlugin?: () => Promise<SeoPlugin>
  post?: PluginPost
  now?: () => Date
}

/** Every string value without "<" or ">" (the plugin refuses them; they are never needed in this markup). */
function scrub(node: unknown): unknown {
  if (typeof node === 'string') return node.replace(/[<>]/g, ' ').replace(/\s+/g, ' ').trim()
  if (Array.isArray(node)) return node.map(scrub)
  if (node && typeof node === 'object') return Object.fromEntries(Object.entries(node as Record<string, unknown>).map(([k, v]) => [k, scrub(v)]))
  return node
}

/**
 * The blocks as ONE JSON-LD value (an @graph), the shape the plugin stores per
 * post. FAQ pairs are dropped from the end while the whole is over the size the
 * plugin accepts; null when nothing valid remains.
 */
export function wordpressSchemaGraph(blocks: JsonLd[]): JsonLd | null {
  const nodes = blocks.map((b) => {
    const rest: JsonLd = { ...b }
    delete rest['@context']
    return scrub(rest) as JsonLd
  })
  if (!nodes.length) return null
  for (;;) {
    const graph: JsonLd = { '@context': 'https://schema.org', '@graph': nodes }
    if (JSON.stringify(graph).length <= LIMITS.schemaChars && validSchema(graph)) return graph
    const faq = nodes.find((n) => n['@type'] === 'FAQPage')
    const entities = faq && Array.isArray(faq.mainEntity) ? (faq.mainEntity as unknown[]) : null
    if (!entities || entities.length === 0) return null
    entities.pop()
    if (entities.length === 0) nodes.splice(nodes.indexOf(faq!), 1)
    if (!nodes.length) return null
  }
}

/** A stable job id (UUID-shaped, as the plugin requires) for this article and this exact markup. */
export function schemaJobId(articleId: string, graph: JsonLd): string {
  const h = crypto.createHash('sha256').update(`article-schema:${articleId}:${JSON.stringify(graph)}`).digest('hex')
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-4${h.slice(13, 16)}-8${h.slice(17, 20)}-${h.slice(20, 32)}`
}

interface ArticleRow {
  id: string
  project_id: string | null
  topic_id: string | null
  title: string | null
  meta_description: string | null
  excerpt: string | null
  featured_image_url: string | null
  faq_json: StructuredDataFaq[] | null
  published_at: string | null
  updated_at: string | null
}

/**
 * Write the article's JSON-LD to its just-published WordPress post through the
 * plugin. `postUrl` is the post's public link as WordPress answered it.
 */
export async function publishArticleSchemaToWordPress(
  admin: Admin,
  input: { articleId: string | null | undefined; postUrl: string | null | undefined; status: string },
  deps: ArticleSchemaDeps,
): Promise<ArticleSchemaOutcome> {
  try {
    if (input.status !== 'publish') return 'not_published'
    if (!input.articleId) return 'no_article'
    const postUrl = String(input.postUrl ?? '').trim()
    if (!/^https?:\/\//i.test(postUrl)) return 'no_url'

    const { data: art } = await admin.from('generated_articles')
      .select('id, project_id, topic_id, title, meta_description, excerpt, featured_image_url, faq_json, published_at, updated_at')
      .eq('id', input.articleId).maybeSingle()
    const article = art as ArticleRow | null
    if (!article?.project_id) return 'no_article'
    const { data: proj } = await admin.from('projects').select('id, user_id').eq('id', article.project_id).maybeSingle()
    const ownerId = (proj as { user_id?: string | null } | null)?.user_id
    if (!ownerId) return 'no_article'
    const scope = { projectId: article.project_id, userId: ownerId }

    const row = await readPluginLink(admin, scope).catch(() => null)
    if (!row) return 'no_plugin'
    if (row.status !== 'connected') return 'plugin_not_connected'
    let link: PluginLink
    try {
      link = { siteUrl: row.site_url, keyId: row.key_id, secret: deps.decrypt(row.secret_encrypted) }
    } catch {
      return 'plugin_not_connected'
    }

    const now = (deps.now ?? (() => new Date()))()
    const ctx = await loadSchemaContext(admin, article.project_id, article.topic_id)
    const blocks = buildStructuredData({
      headline: String(article.title ?? ''),
      description: article.meta_description || article.excerpt || null,
      imageUrl: article.featured_image_url,
      datePublished: article.published_at ?? now.toISOString(),
      dateModified: article.updated_at ?? article.published_at ?? now.toISOString(),
      url: postUrl,
      language: ctx.language,
      publisher: { name: ctx.publisherName, url: ctx.publisherUrl, sameAs: ctx.sameAs },
      faq: Array.isArray(article.faq_json) ? article.faq_json : [],
    })
    if (!blocks.length) return 'no_markup'
    // The site asked now; when it does not answer, what the Bridge plugin last reported.
    const live: SeoPlugin = deps.detectSeoPlugin ? await deps.detectSeoPlugin().catch(() => 'unknown' as const) : 'unknown'
    const seoPlugin: string = live === 'unknown' || live === 'permission_error' ? (row.seo_plugin ?? 'unknown') : live
    const sent = ARTICLE_MARKUP_PLUGINS.has(seoPlugin) ? blocks.filter((b) => b['@type'] === 'FAQPage') : blocks
    if (!sent.length) return 'seo_plugin_article'
    const graph = wordpressSchemaGraph(sent)
    if (!graph) return 'too_large'

    const answer = await pluginFix(link, { jobId: schemaJobId(article.id, graph), type: 'schema_jsonld', url: postUrl, value: { schema: graph }, expected: null }, deps.post)
    if (answer.ok) return answer.body.status === 'already' ? 'already' : 'applied'
    return answer.connectionLost ? 'plugin_not_connected' : 'plugin_refused'
  } catch {
    return 'error'
  }
}
