/**
 * Phase 4F.2 — PURE helpers for Shopify Blog Article publishing (no network/DB).
 * Split out so payload building, image-URL stability, userError parsing, and the
 * create-vs-update decision are unit-testable without a live store.
 */

/**
 * Shopify's 2026-07 Admin schema treats the two mutations differently, and the
 * payload must too:
 *
 *   ArticleCreateInput.author: AuthorInput!  — REQUIRED, non-null.
 *   ArticleUpdateInput.author: AuthorInput   — optional; sending one OVERWRITES
 *                                              whatever author the article has.
 *
 * So `mode` is not cosmetic and is not optional: it decides whether the author
 * is mandatory or must be left alone.
 */
export type ShopifyArticleInputMode = 'create' | 'update'

/**
 * The author sent when a create has no real one to use.
 *
 * PRODUCTION INCIDENT. `author` was only added when a name was non-empty, and
 * the automation queue calls the publisher with `authorName: null` while the
 * manual route resolves null whenever projects.business_name is NULL — so the
 * create payload simply omitted a REQUIRED field and Shopify rejected it with
 * "Variable $article of type ArticleCreateInput! was provided invalid value for
 * author (Expected value to not be null)". A deliberate, stable product name is
 * used rather than a store or article-derived string: it is identical across
 * every store and every retry, so it can never leak one merchant's data into
 * another's storefront and never changes an article's byline between attempts.
 */
export const SHOPIFY_DEFAULT_ARTICLE_AUTHOR = 'Go Top SEO'

/**
 * The author name for a CREATE. Never returns an empty string — that is the
 * whole point: `{ name: '' }` is as invalid to Shopify as a missing author.
 * PURE.
 */
export function resolveCreateAuthorName(authorName: string | null | undefined): string {
  return (authorName || '').trim() || SHOPIFY_DEFAULT_ARTICLE_AUTHOR
}

export interface ShopifyArticleInputArgs {
  /** Which mutation this payload is for. Required — see ShopifyArticleInputMode. */
  mode: ShopifyArticleInputMode
  blogId: string
  title: string
  handle?: string | null
  bodyHtml: string
  summary?: string | null
  tags?: string[]
  authorName?: string | null
  /** true → published, false → draft. */
  published: boolean
  /** ISO datetime for a future/explicit publish date (optional). */
  publishDate?: string | null
  /** Featured image (must be a stable public https URL) + alt text. */
  imageUrl?: string | null
  imageAlt?: string | null
  /** The article's own search-engine listing, as the generator wrote it. */
  metaTitle?: string | null
  metaDescription?: string | null
  /**
   * What the merchant's article ALREADY has in `global.title_tag` /
   * `global.description_tag`, as the reconcile read found it. Update mode only,
   * and a value here means ours is NOT sent for that field.
   */
  existingSeoTitle?: string | null
  existingSeoDescription?: string | null
}

/**
 * The two metafields Shopify documents as a resource's search engine listing.
 * An Article has no `seo` field — `SEOInput` exists for Product and Collection
 * only — so the listing is these metafields, in the `global` namespace, typed
 * `single_line_text_field`:
 * https://shopify.dev/docs/apps/build/marketing/optimize-storefront-seo
 *
 * Same namespace, keys and type as `lib/site-fix/shopify-admin.ts` reads and
 * writes for pages and products, so the two halves of the product agree about
 * where a merchant's SEO title lives.
 */
export const SEO_METAFIELD_NAMESPACE = 'global'
export const SEO_TITLE_METAFIELD_KEY = 'title_tag'
export const SEO_DESCRIPTION_METAFIELD_KEY = 'description_tag'
export const SEO_METAFIELD_TYPE = 'single_line_text_field'

/** A metafield write, or null when there is nothing to write for that field. */
function seoMetafield(key: string, value: string | null | undefined): Record<string, string> | null {
  const v = (value || '').trim()
  if (!v) return null
  return { namespace: SEO_METAFIELD_NAMESPACE, key, type: SEO_METAFIELD_TYPE, value: v }
}

/**
 * The `metafields` entries that carry the article's SEO title and meta
 * description — the gap this closes: every article ever published to a Shopify
 * blog from here went up with NO search-engine listing of its own, so Shopify
 * fell back to the article title and the first words of the body, while the
 * same article published to WordPress got both fields written and verified.
 *
 * TWO RULES, and they are the whole function:
 *
 *   CREATE  — send what we have. There is nothing of the merchant's to protect:
 *             the article does not exist yet.
 *   UPDATE  — send a field ONLY where the merchant's stored value is empty. A
 *             title somebody typed into Shopify's "Edit website SEO" panel is
 *             theirs, and a re-export must not quietly replace it. This is the
 *             same rule the WordPress backfill states as "NEVER REPLACE A VALUE
 *             THAT IS ALREADY THERE" (lib/content/seo-backfill.ts).
 *
 * PURE.
 */
export function buildSeoMetafields(args: Pick<ShopifyArticleInputArgs,
  'mode' | 'metaTitle' | 'metaDescription' | 'existingSeoTitle' | 'existingSeoDescription'>,
): Record<string, string>[] {
  const keepTitle = args.mode === 'update' && !!(args.existingSeoTitle || '').trim()
  const keepDescription = args.mode === 'update' && !!(args.existingSeoDescription || '').trim()
  const out = [
    keepTitle ? null : seoMetafield(SEO_TITLE_METAFIELD_KEY, args.metaTitle),
    keepDescription ? null : seoMetafield(SEO_DESCRIPTION_METAFIELD_KEY, args.metaDescription),
  ]
  return out.filter((m): m is Record<string, string> => m !== null)
}

/**
 * True when a URL is a STABLE, publicly-fetchable https image URL safe to publish
 * to Shopify. Rejects non-https and signed/expiring URLs (presigned tokens),
 * which would 404 for shoppers after the signature expires.
 */
export function isStableImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== 'string') return false
  const u = url.trim()
  if (!/^https:\/\//i.test(u)) return false
  const lower = u.toLowerCase()
  // Presigned / expiring markers (Supabase signed, S3/GCS presigned, generic).
  const signed = ['token=', 'x-amz-signature', 'x-amz-credential', 'expires=', 'signature=', 'x-goog-signature', '/object/sign/']
  if (signed.some((m) => lower.includes(m))) return false
  return true
}

/**
 * Build the Shopify ArticleCreateInput / ArticleUpdateInput object, including
 * ONLY the fields that are actually set (Shopify rejects unknown/empty inputs
 * inconsistently). `blogId` is included for create; callers may omit it on
 * update. Image is included only when the URL is stable.
 *
 * THE AUTHOR INVARIANT LIVES HERE, at the final payload-construction boundary,
 * not in a caller. Every Shopify article mutation in this codebase goes through
 * this one function (publishArticleToShopify is the only caller of
 * shopifyArticleCreate/shopifyArticleUpdate, and it builds its payload here), so
 * enforcing it at this point is what makes an invalid ArticleCreateInput
 * unconstructible — by today's callers and by any future one.
 */
export function buildArticleInput(args: ShopifyArticleInputArgs): Record<string, unknown> {
  const input: Record<string, unknown> = {
    blogId: args.blogId,
    title: String(args.title || '').trim(),
    body: String(args.bodyHtml || ''),
    isPublished: !!args.published,
  }
  const handle = (args.handle || '').trim()
  if (handle) input.handle = handle
  const summary = (args.summary || '').trim()
  if (summary) input.summary = summary
  // Trim + dedupe (case-insensitively) so a re-publish never duplicates tags.
  const seenTag = new Set<string>()
  const tags: string[] = []
  for (const raw of args.tags || []) {
    const s = String(raw).trim()
    if (!s || seenTag.has(s.toLowerCase())) continue
    seenTag.add(s.toLowerCase())
    tags.push(s)
  }
  if (tags.length) input.tags = tags
  // CREATE: author is REQUIRED by the schema, so it is always present and always
  // non-empty. UPDATE: only send one when the caller supplied a real name —
  // sending a fallback here would silently overwrite an author a merchant set in
  // Shopify with our default.
  const explicitAuthor = (args.authorName || '').trim()
  if (args.mode === 'create') input.author = { name: resolveCreateAuthorName(explicitAuthor) }
  else if (explicitAuthor) input.author = { name: explicitAuthor }
  if (args.published && args.publishDate && /^\d{4}-\d{2}-\d{2}/.test(args.publishDate)) input.publishDate = args.publishDate
  if (args.imageUrl && isStableImageUrl(args.imageUrl)) {
    input.image = { url: args.imageUrl, altText: (args.imageAlt || '').trim() || undefined }
  }
  // The search-engine listing. Omitted entirely when there is nothing to write,
  // because an empty `metafields: []` is one more field for Shopify to reject.
  const metafields = buildSeoMetafields(args)
  if (metafields.length) input.metafields = metafields
  return input
}

export interface ShopifyUserError { field: string | null; message: string; code: string | null }

/** Normalize a GraphQL userErrors[] payload into a clean list. */
export function parseUserErrors(userErrors: unknown): ShopifyUserError[] {
  if (!Array.isArray(userErrors)) return []
  return userErrors.map((e) => {
    const o = (e || {}) as { field?: unknown; message?: unknown; code?: unknown }
    const field = Array.isArray(o.field) ? o.field.join('.') : (typeof o.field === 'string' ? o.field : null)
    return { field, message: String(o.message ?? '').trim(), code: typeof o.code === 'string' ? o.code : null }
  }).filter((e) => e.message || e.code)
}

/** A one-line summary of userErrors for last_error / diagnostics. */
export function summarizeUserErrors(errs: ShopifyUserError[]): string {
  return errs.map((e) => `${e.field ? `${e.field}: ` : ''}${e.message}${e.code ? ` (${e.code})` : ''}`).join(' | ').slice(0, 500)
}

/**
 * Idempotency decision: with a stored Shopify article id we UPDATE that exact
 * article; without one we CREATE. Never guesses by title. `remoteExists` (from a
 * reconcile read) lets the caller downgrade an update to a remote-missing state.
 */
export function decideArticleAction(storedArticleId: string | null | undefined): 'create' | 'update' {
  return storedArticleId && String(storedArticleId).trim() ? 'update' : 'create'
}

/**
 * Resolve the target Blog GID: the article-level selection ALWAYS overrides the
 * project/connection default. Returns null when neither is set (→ no_shopify_blog).
 * PURE — the caller persists the resolved id on the article so retries are
 * deterministic and a later default change never moves a published article.
 */
export function resolveTargetBlogId(articleBlogId: string | null | undefined, defaultBlogId: string | null | undefined): string | null {
  const a = (articleBlogId || '').trim()
  if (a) return a
  const d = (defaultBlogId || '').trim()
  return d || null
}
