/**
 * Phase 4F.2 — PURE helpers for Shopify Blog Article publishing (no network/DB).
 * Split out so payload building, image-URL stability, userError parsing, and the
 * create-vs-update decision are unit-testable without a live store.
 */

export interface ShopifyArticleInputArgs {
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

/** Deterministic safe author when the article has no configured author name. */
export const DEFAULT_SHOPIFY_AUTHOR = 'Go Top'

/** Trimmed configured author, or the safe fallback. Never empty. */
export function resolveAuthorName(name: string | null | undefined): string {
  return (name || '').trim() || DEFAULT_SHOPIFY_AUTHOR
}

/**
 * Build the Shopify ArticleCreateInput / ArticleUpdateInput object, including
 * ONLY the fields that are set (Shopify rejects unknown/empty inputs
 * inconsistently). Image is included only when the URL is stable.
 *
 * `forCreate` controls the REQUIRED author field:
 *   - create → author is ALWAYS a valid AuthorInput ({ name } — configured name
 *     or the "Go Top" fallback), never null/empty (ArticleCreateInput.author is
 *     required and non-null).
 *   - update → author is included ONLY when an explicit non-empty name is given
 *     (an intentional author change); otherwise omitted so the remote author is
 *     preserved. Never overwrites with the fallback on a normal update.
 */
export function buildArticleInput(args: ShopifyArticleInputArgs, forCreate = true): Record<string, unknown> {
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
  // Author — required on create (with fallback); explicit-only on update.
  const explicitAuthor = (args.authorName || '').trim()
  if (forCreate) input.author = { name: explicitAuthor || DEFAULT_SHOPIFY_AUTHOR }
  else if (explicitAuthor) input.author = { name: explicitAuthor }
  if (args.published && args.publishDate && /^\d{4}-\d{2}-\d{2}/.test(args.publishDate)) input.publishDate = args.publishDate
  if (args.imageUrl && isStableImageUrl(args.imageUrl)) {
    input.image = { url: args.imageUrl, altText: (args.imageAlt || '').trim() || undefined }
  }
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
