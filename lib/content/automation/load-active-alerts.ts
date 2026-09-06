/**
 * The ONE loader behind both alert readers.
 *
 * `/api/content/automation/alerts` uses the service-role client (it is already
 * inside authContentProject) and `/api/content/overview` uses the caller's own
 * RLS-scoped session client. Different clients, deliberately — but they must
 * reach the SAME decision, so the queries and the selector live here instead of
 * being written twice. Only the minimal Supabase surface is required, so either
 * client satisfies it.
 *
 * Failures are typed, never swallowed into an empty list: a missing migration is
 * the one case where "no alerts" would be a lie, and it was already handled that
 * way by the automation endpoint. Both endpoints now share that behaviour too.
 */

import { selectActiveAlerts, type ActiveAlert, type AlertRow, type PublicationFact } from './alert-read-model'

const ALERT_COLUMNS = 'id, pool_item_id, article_id, topic_id, kind, channel, title, error, attempts, status, created_at, updated_at'
const ARTICLE_COLUMNS = 'id, status, published_at, shopify_status, shopify_published_at, wp_post_id'

interface MinimalQuery {
  select: (cols: string) => MinimalQuery
  eq: (col: string, val: unknown) => MinimalQuery
  order?: (col: string, opts?: { ascending?: boolean }) => MinimalQuery
  limit?: (n: number) => MinimalQuery
  then: (res: (v: { data: unknown; error: unknown }) => unknown, rej?: (e: unknown) => unknown) => unknown
}
export interface MinimalClient { from: (table: string) => MinimalQuery }

export type LoadAlertsResult =
  | { ok: true; alerts: ActiveAlert[] }
  | { ok: false; reason: 'migration_required' | 'unavailable' }

/**
 * Is this failure "the migration has not been applied"?
 *
 * Two DIFFERENT shapes, and only the first was handled before:
 *   - `42P01` undefined_table — the alerts table itself is missing;
 *   - `42703` undefined_column — the table exists but `channel` does not, which
 *     is exactly the state between deploying this code and running the
 *     migration. PostgREST also answers a stale schema cache with `PGRST204`
 *     ("Could not find the 'channel' column ... in the schema cache") and
 *     `PGRST202`, which are the same operator problem wearing a different code.
 *
 * Treating a missing COLUMN as a generic outage would tell an operator the
 * service is flaky when the fix is one migration. Everything else stays
 * `unavailable` on purpose — a real outage must not be misreported as a
 * migration, or nobody would look for the actual fault.
 */
export function isMissingSchemaError(error: unknown): boolean {
  const e = (error ?? {}) as { code?: string; message?: string; details?: string }
  const code = String(e.code ?? '')
  if (code === '42P01' || code === '42703' || code === 'PGRST204' || code === 'PGRST202') return true
  // Some PostgREST versions report the schema-cache miss with a message only.
  const text = `${e.message ?? ''} ${e.details ?? ''}`.toLowerCase()
  if (/schema cache/.test(text)) return true
  // Postgres phrases it as `column <table>.<col> does not exist` — the qualified
  // name contains a dot, so the two halves are tested independently rather than
  // with one span that a dot would break.
  return /does not exist/.test(text) && /\b(column|relation|table)\b/.test(text)
}

type ArticleRow = {
  id: string
  /** The article's own publish state. Written by whichever channel published it. */
  status: string | null
  published_at: string | null
  /** Shopify's OWN state — 'draft' | 'published' | 'remote_missing' | null. */
  shopify_status: string | null
  /** Shopify's OWN publication timestamp. Null for a draft export. */
  shopify_published_at: string | null
  wp_post_id: number | null
}

/** A timestamp that actually parses. A null or unparseable one proves nothing. */
function validTimestamp(v: string | null): string | null {
  if (!v) return null
  return Number.isFinite(Date.parse(v)) ? v : null
}

/**
 * Successful publications, per channel — the ONLY evidence that may suppress a
 * failure alert. The bar is deliberately high, because the cost of being wrong
 * is hiding a real unresolved failure from a merchant.
 *
 * A REMOTE ID IS NOT A PUBLICATION. An earlier revision read
 * `shopify_article_id` as proof of a Shopify publication and fell back to the
 * generic `published_at` for its timestamp. Both are wrong against this schema:
 *
 *   - a Shopify DRAFT export writes `shopify_article_id` with
 *     `shopify_status: 'draft'` and a null `shopify_published_at`, and
 *     deliberately leaves `status`/`published_at` alone (see
 *     lib/shopify/publish-article.ts — "a draft export deliberately leaves them
 *     ALONE rather than downgrading them"). So an article published to WordPress
 *     and later draft-exported to Shopify carried a Shopify id AND a generic
 *     `published_at` from WordPress — and would have been read as a Shopify
 *     publication that never happened, silencing a genuine Shopify failure;
 *   - the manual WordPress route writes `wp_post_id` for a DRAFT export too, and
 *     only sets `status: 'published'` when the caller asked to publish.
 *
 * SHOPIFY is fully self-describing: it owns both a status and a timestamp, so
 * the fact requires `shopify_status === 'published'` AND a parseable
 * `shopify_published_at`. There is NO fallback to the generic column.
 *
 * WORDPRESS has no channel-specific published timestamp — it writes the generic
 * `status`/`published_at`, the same pair Shopify writes on a real publish. So a
 * WordPress fact requires a post id, a generic published state, a parseable
 * `published_at`, AND that Shopify is not also claiming to be published, since
 * in that case the generic pair is not attributable to WordPress. When both
 * channels genuinely published the same article the WordPress fact is withheld:
 * that can only leave an alert VISIBLE, never hide one, which is the safe
 * direction for an ambiguity the schema cannot resolve.
 */
export function publicationFactsFrom(articles: ArticleRow[]): PublicationFact[] {
  const facts: PublicationFact[] = []
  for (const a of articles) {
    const shopifyPublished = a.shopify_status === 'published'
    const shopifyAt = validTimestamp(a.shopify_published_at)
    if (shopifyPublished && shopifyAt) {
      facts.push({ articleId: a.id, channel: 'shopify', publishedAt: shopifyAt })
    }
    const genericAt = validTimestamp(a.published_at)
    if (a.wp_post_id != null && a.status === 'published' && genericAt && !shopifyPublished) {
      facts.push({ articleId: a.id, channel: 'wordpress', publishedAt: genericAt })
    }
  }
  return facts
}

export async function loadActiveAlerts(client: MinimalClient, projectId: string): Promise<LoadAlertsResult> {
  try {
    let q = client.from('content_automation_alerts').select(ALERT_COLUMNS).eq('project_id', projectId).eq('status', 'open')
    if (q.order) q = q.order('created_at', { ascending: false })
    if (q.limit) q = q.limit(50)
    const { data, error } = await (q as unknown as Promise<{ data: unknown; error: unknown }>)
    if (error) {
      // The migration is a REQUIRED dependency. Reporting "no alerts" when the
      // store — or the column this query selects — is missing would hide a real
      // final failure behind a healthy-looking empty list, so it stays a typed
      // configuration error the operator can act on.
      if (isMissingSchemaError(error)) return { ok: false, reason: 'migration_required' }
      console.error('[content-alerts] list failed', { message: (error as { message?: string }).message })
      return { ok: false, reason: 'unavailable' }
    }
    const rows = (data ?? []) as AlertRow[]
    if (rows.length === 0) return { ok: true, alerts: [] }

    // Publication evidence for supersession. A read failure here must not turn
    // into a claim that nothing published — it degrades to "no evidence", which
    // keeps alerts visible rather than hiding them.
    let articles: ArticleRow[] = []
    try {
      const { data: artData, error: artError } = await (client
        .from('generated_articles').select(ARTICLE_COLUMNS).eq('project_id', projectId) as unknown as Promise<{ data: unknown; error: unknown }>)
      if (!artError) articles = (artData ?? []) as ArticleRow[]
    } catch { /* no evidence — alerts stay visible */ }

    return { ok: true, alerts: selectActiveAlerts(rows, publicationFactsFrom(articles)) }
  } catch (e) {
    console.error('[content-alerts] list threw', { message: e instanceof Error ? e.message : String(e) })
    return { ok: false, reason: 'unavailable' }
  }
}
