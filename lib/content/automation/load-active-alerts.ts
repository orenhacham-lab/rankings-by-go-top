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
const ARTICLE_COLUMNS = 'id, status, published_at, shopify_article_id, shopify_published_at, wp_post_id'

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

type ArticleRow = {
  id: string
  status: string | null
  published_at: string | null
  shopify_article_id: string | null
  shopify_published_at: string | null
  wp_post_id: number | null
}

/**
 * Successful publications, per channel, derived from the article rows.
 *
 * The channel is read from the identifier the publish path persists — a Shopify
 * article gid, a WordPress post id — because that identifier only exists once
 * the remote object was actually created. `status` alone would not say WHERE.
 * Shopify carries its own published timestamp; WordPress uses the article's.
 */
export function publicationFactsFrom(articles: ArticleRow[]): PublicationFact[] {
  const facts: PublicationFact[] = []
  for (const a of articles) {
    if (a.shopify_article_id) {
      facts.push({ articleId: a.id, channel: 'shopify', publishedAt: a.shopify_published_at ?? a.published_at })
    }
    if (a.wp_post_id != null) {
      facts.push({ articleId: a.id, channel: 'wordpress', publishedAt: a.published_at })
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
      // store is missing would hide a real final failure behind a healthy-looking
      // empty list, so it stays a typed configuration error.
      if ((error as { code?: string }).code === '42P01') return { ok: false, reason: 'migration_required' }
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
