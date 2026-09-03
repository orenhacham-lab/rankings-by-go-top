/**
 * The ONE resolver for "which Shopify blog does this article publish to?".
 *
 * PRODUCTION INCIDENT. A store with EXACTLY ONE blog, a healthy connection, a
 * successful sync and a successfully generated article failed automatic
 * publishing with `no_shopify_blog` — because neither the article nor the
 * connection carried a blog id and nothing ever asked Shopify. The merchant was
 * then told to pick a default blog in a UI control that is not rendered on the
 * card they were looking at, so the queue was unrecoverable from the product.
 *
 * With one blog there is no choice to make: the resolver asks Shopify, uses it,
 * and persists it as the connection default so the question is never asked
 * again. With MORE than one it refuses rather than guessing — picking
 * arbitrarily would silently publish to the wrong blog, which is worse than
 * stopping. With none it says so distinctly.
 *
 * Shared by the publishing service and the automation queue's prerequisite
 * check so the two can never disagree about what "ready to publish" means.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import { getShopifyBlogs } from './client'
import { resolveTargetBlogId } from './article-payload'
import type { ShopifyCredentials } from './types'

type Admin = ReturnType<typeof createAdminClient>

export type BlogTargetReason =
  /** The store has no blog at all — the merchant must create one in Shopify. */
  | 'no_shopify_blog'
  /** Several blogs exist and none is selected — a choice only the merchant can make. */
  | 'missing_default_blog'
  /** The Blogs lookup itself failed. An outage, NOT a statement about the store. */
  | 'blog_lookup_failed'

export type BlogTargetResolution =
  | { ok: true; blogId: string; autoResolved: boolean }
  | { ok: false; reason: BlogTargetReason }

/** Only `no_shopify_blog` / `missing_default_blog` are deterministic and
 *  action-required; a failed lookup is transient and must stay retryable. */
export function isDeterministicBlogBlocker(reason: BlogTargetReason): boolean {
  return reason === 'no_shopify_blog' || reason === 'missing_default_blog'
}

export async function resolvePublishBlogTarget(
  admin: Admin,
  connection: { id: string; default_blog_id: string | null },
  creds: ShopifyCredentials,
  article: { shopify_blog_id: string | null },
  deps: { listBlogs?: typeof getShopifyBlogs } = {},
): Promise<BlogTargetResolution> {
  // Precedence (article override, then connection default) stays in the ONE
  // existing helper — this module adds the Shopify lookup, it does not restate
  // which stored id wins.
  const stored = resolveTargetBlogId(article.shopify_blog_id, connection.default_blog_id)
  if (stored) return { ok: true, blogId: stored, autoResolved: false }

  const listBlogs = deps.listBlogs ?? getShopifyBlogs
  let blogs: Awaited<ReturnType<typeof getShopifyBlogs>>
  try {
    blogs = await listBlogs(creds)
  } catch {
    // Never reported as "this store has no blog" — that would be a false
    // statement about the merchant's store, and it would block the item
    // permanently for what is a transient failure.
    return { ok: false, reason: 'blog_lookup_failed' }
  }

  if (blogs.length === 0) return { ok: false, reason: 'no_shopify_blog' }
  if (blogs.length > 1) return { ok: false, reason: 'missing_default_blog' }

  const blogId = blogs[0]!.id
  // Persist it as the connection default so this resolution happens once, not
  // on every publish. Best-effort: a failed write must not block a publish that
  // is otherwise ready — the id is returned either way.
  try {
    await admin.from('shopify_connections')
      .update({ default_blog_id: blogId, updated_at: new Date().toISOString() })
      .eq('id', connection.id)
  } catch { /* non-fatal */ }
  return { ok: true, blogId, autoResolved: true }
}
