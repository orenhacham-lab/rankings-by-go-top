/**
 * Where the content scan (./wordpress-content-scan.ts) reads a WordPress site from. Server-side only.
 *
 *   app_password  the WordPress REST API with the stored application password, exactly as before
 *   plugin        GO TOP SEO Bridge 3.1.0's signed read routes (includes/read.php): /content (published,
 *                 not password-protected posts and pages, with the SEO plugin's focus keyphrase),
 *                 /content-item (one item's displayed HTML), /terms (categories with their address)
 *
 * Products and product categories come from the store's PUBLIC WooCommerce Store API either way
 * (discoverStoreEntities; the application password is only a second try there).
 *
 * pickReadSource prefers the plugin when it is >= 3.1.0 (lib/site-fix/plugin-capabilities.ts), so a
 * site connected by the plugin alone is scanned; without it the application password, as before.
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import type { WordPressCredentials, WordPressContentItem, WordPressListOptions } from '@/lib/wordpress/types'
import {
  discoverStoreEntities, getCategories, getItemContentHtml, getPages, getPosts, getTags, getTaxonomyTerms,
  WordPressClientError, type StoreDiscoveryResult, type WpContentEndpoint,
} from '@/lib/wordpress/client'
import {
  pluginContent, pluginContentItem, pluginTerms,
  type PluginAnswer, type PluginContentItem, type PluginLink, type PluginPost,
} from '@/lib/site-fix/plugin-client'
import { loadPluginFor, type ConnectedPluginDeps } from '@/lib/site-fix/plugin-capabilities'
import { loadWordPressCredentials } from '@/lib/content/api-auth'

type Admin = ReturnType<typeof createAdminClient>

export interface WordPressReadSource {
  via: 'app_password' | 'plugin'
  siteUrl: string
  getPosts(o: WordPressListOptions): Promise<WordPressContentItem[]>
  getPages(o: WordPressListOptions): Promise<WordPressContentItem[]>
  getItemContentHtml(endpoint: WpContentEndpoint, id: number): Promise<string>
  getCategories(): Promise<{ id: number; name: string }[]>
  getTags(): Promise<{ id: number; name: string }[]>
  /** `product_cat` (WooCommerce) or `categories` (the blog's), with each term's address. */
  getTaxonomyTerms(base: 'product_cat' | 'categories'): Promise<{ name: string; link: string; count: number }[]>
  discoverStoreEntities(): Promise<StoreDiscoveryResult>
}

export function credsReadSource(creds: WordPressCredentials): WordPressReadSource {
  return {
    via: 'app_password',
    siteUrl: creds.siteUrl,
    getPosts: (o) => getPosts(creds, o),
    getPages: (o) => getPages(creds, o),
    getItemContentHtml: (endpoint, id) => getItemContentHtml(creds, endpoint, id),
    getCategories: () => getCategories(creds),
    getTags: () => getTags(creds),
    getTaxonomyTerms: (base) => getTaxonomyTerms(creds, base),
    discoverStoreEntities: () => discoverStoreEntities(creds),
  }
}

/** A refusal as the error the scan already understands ("too large" is skipped per item). Our own words only. */
function thrown(answer: Extract<PluginAnswer<unknown>, { ok: false }>): never {
  throw new WordPressClientError(answer.pluginCode === 'too_large' ? 'plugin content too large' : `plugin ${answer.pluginCode ?? answer.code}`)
}

function toItem(i: PluginContentItem): WordPressContentItem {
  const iso = (v: string | null) => (v && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}$/.test(v) ? `${v.replace(' ', 'T')}Z` : null)
  return {
    id: i.id, type: i.type, link: String(i.link || ''), slug: String(i.slug || ''), title: String(i.title || ''),
    excerpt: '', contentHtml: '', status: 'publish', date: iso(i.date), modified: iso(i.modified), categories: [], tags: [],
    seoFocusKeyword: i.focus_keyword ? String(i.focus_keyword) : null,
    seoKeywordSource: i.focus_keyword && (i.focus_source === 'yoast_focus_keyword' || i.focus_source === 'rankmath_focus_keyword') ? i.focus_source : null,
  }
}

export function pluginReadSource(link: PluginLink, post?: PluginPost): WordPressReadSource {
  const list = (type: 'post' | 'page') => async (o: WordPressListOptions) => {
    const r = await pluginContent(link, { type, page: o.page ?? 1, perPage: Math.min(Math.max(o.perPage ?? 25, 1), 50), modifiedAfter: o.modifiedAfter }, post)
    if (!r.ok) thrown(r)
    return r.body.items.map(toItem)
  }
  const terms = async (taxonomy: 'category' | 'post_tag' | 'product_cat') => {
    const r = await pluginTerms(link, taxonomy, post)
    if (!r.ok) thrown(r)
    return r.body.items
  }
  return {
    via: 'plugin',
    siteUrl: link.siteUrl,
    getPosts: list('post'),
    getPages: list('page'),
    getItemContentHtml: async (endpoint, id) => {
      const type = endpoint === '/pages' ? 'page' : endpoint === '/posts' ? 'post' : null
      if (!type) throw new WordPressClientError('plugin reads posts and pages only')
      const r = await pluginContentItem(link, type, id, post)
      if (!r.ok) thrown(r)
      return String(r.body.content ?? '')
    },
    getCategories: async () => (await terms('category')).map((t) => ({ id: t.id, name: t.name })),
    getTags: async () => (await terms('post_tag')).map((t) => ({ id: t.id, name: t.name })),
    getTaxonomyTerms: async (base) => {
      try {
        const rows = await terms(base === 'product_cat' ? 'product_cat' : 'category')
        return rows
          .map((t) => ({ name: String(t.name ?? '').trim(), link: String(t.link ?? '').trim(), count: typeof t.count === 'number' ? t.count : 0 }))
          .filter((t) => t.name && /^https?:\/\//i.test(t.link))
          .sort((a, b) => b.count - a.count)
          .slice(0, 100)
      } catch {
        return [] // like the application-password read: no WooCommerce, or unreadable, is "no terms"
      }
    },
    discoverStoreEntities: () => discoverStoreEntities({ siteUrl: link.siteUrl }),
  }
}

export type PickedReadSource =
  | { ok: true; source: WordPressReadSource; connectionId: string | null }
  | { ok: false; reason: 'not_connected' | 'decrypt_failed' }

/**
 * The plugin (>= 3.1.0, read by project AND owner) when it is connected, else the application
 * password exactly as loadWordPressCredentials answers it.
 */
export async function pickReadSource(
  admin: Admin, projectId: string, opts: { ownerId?: string | null } & ConnectedPluginDeps = {},
): Promise<PickedReadSource> {
  const [plugin, loaded] = await Promise.all([loadPluginFor(admin, projectId, 'content', opts), loadWordPressCredentials(admin, projectId)])
  if (plugin) return { ok: true, source: pluginReadSource(plugin.link, opts.post), connectionId: 'error' in loaded ? null : loaded.connection.id }
  if ('error' in loaded) return { ok: false, reason: loaded.status === 404 ? 'not_connected' : 'decrypt_failed' }
  return { ok: true, source: credsReadSource(loaded.creds), connectionId: loaded.connection.id }
}
