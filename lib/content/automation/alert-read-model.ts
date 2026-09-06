/**
 * THE read model for content-automation alerts — one decision, shared by every
 * reader. PURE: no Supabase, no React, no Next.
 *
 * THREE DEFECTS THIS REPLACES
 *
 * 1. TWO READERS, TWO ANSWERS. `/api/content/overview` returned no alerts field
 *    at all while `/api/content/automation/alerts` returned every open row. The
 *    Content Hub and the automation panel therefore disagreed about whether the
 *    same project had a problem, and neither was wrong about the data it read —
 *    there simply was no shared notion of an ACTIVE alert. There is now, and
 *    both endpoints call it.
 *
 * 2. A CONSTANT PRETENDING TO BE A FACT. Every final-failure alert rendered
 *    under "WordPress publish failed", a hard-coded string, including Shopify
 *    failures on projects with no WordPress connection. The row now carries its
 *    channel and the heading is derived from it. A legacy row without one gets a
 *    NEUTRAL heading: the correct answer to "which platform?" when the record
 *    does not say is "publishing", not a coin flip between two wrong answers.
 *
 * 3. RAW PROVIDER TEXT ON SCREEN. The stored error is `code: raw provider
 *    detail` and the renderer printed `label — raw detail`, so a Shopify GraphQL
 *    userError reached the merchant verbatim. This model exposes the CODE only.
 *    The full string stays in the row for server logs and protected diagnostics;
 *    it never crosses a public API boundary.
 *
 * SUPERSESSION — why a stale failure disappears without touching Production data.
 * An alert describes an attempt, not a state. Once the same article has
 * published successfully AFTER that attempt was last recorded, the failure is
 * history and rendering it as an open problem is simply untrue. So an open alert
 * is suppressed when a later successful publication of ITS article exists on a
 * compatible channel. Compatible means: the same channel, or — for a legacy row
 * with no channel — any channel, because an unknown channel cannot be used to
 * argue the publication was unrelated. Nothing else is suppressed: a different
 * article's failure, an article that never published, and a publication that
 * predates the failure all leave the alert open.
 */

export type AlertChannel = 'shopify' | 'wordpress'

/** The heading the merchant sees. Never a raw platform guess. */
export type AlertHeading =
  | 'publish_failed_shopify'
  | 'publish_failed_wordpress'
  | 'publish_failed_generic'
  | 'publish_blocked'

/** A stored alert row, as both readers select it. */
export interface AlertRow {
  id: string
  pool_item_id: string | null
  article_id: string | null
  topic_id: string | null
  kind: string | null
  channel: string | null
  title: string | null
  /** May contain `code: raw provider detail`. NEVER forwarded as-is. */
  error: string | null
  attempts: number | null
  status: string | null
  created_at: string | null
  updated_at: string | null
}

/** A successful publication, as evidence that a failure has been superseded. */
export interface PublicationFact {
  articleId: string
  channel: AlertChannel
  publishedAt: string | null
}

/** What a reader returns. Contains no raw provider text and no secrets. */
export interface ActiveAlert {
  id: string
  kind: string
  channel: AlertChannel | null
  heading: AlertHeading
  /** The typed reason CODE only — the caller localizes it. Never raw prose. */
  reasonCode: string | null
  title: string | null
  articleId: string | null
  poolItemId: string | null
  attempts: number
  createdAt: string | null
}

export function normalizeAlertChannel(v: unknown): AlertChannel | null {
  return v === 'shopify' || v === 'wordpress' ? v : null
}

/**
 * The reason CODE, with any provider detail removed.
 *
 * Stored errors are written as `code` or `code: detail` (publish-item-shopify
 * builds exactly that shape). Everything from the first `:` on is provider text
 * — a GraphQL userError, an HTTP body, a stack fragment — and is dropped here
 * rather than at the renderer, so no caller can reintroduce it by accident.
 * A value with no code shape at all yields null and the caller shows generic
 * prose; it is never echoed.
 */
export function alertReasonCode(error: string | null | undefined): string | null {
  if (!error) return null
  const head = error.split(':')[0].trim()
  // A reason code is a snake_case identifier. Anything else is prose that
  // happened to land in this column, and prose is not shown.
  return /^[a-z][a-z0-9_]{2,80}$/.test(head) ? head : null
}

function headingFor(kind: string | null, channel: AlertChannel | null): AlertHeading {
  if (kind === 'publish_blocked') return 'publish_blocked'
  if (channel === 'shopify') return 'publish_failed_shopify'
  if (channel === 'wordpress') return 'publish_failed_wordpress'
  return 'publish_failed_generic'
}

/** Later than the alert's last update? Missing timestamps are never "later". */
function supersedes(pub: PublicationFact, alertUpdatedAt: string | null): boolean {
  if (!pub.publishedAt || !alertUpdatedAt) return false
  const p = Date.parse(pub.publishedAt)
  const a = Date.parse(alertUpdatedAt)
  return Number.isFinite(p) && Number.isFinite(a) && p > a
}

export function isSuperseded(row: AlertRow, publications: PublicationFact[]): boolean {
  if (!row.article_id) return false
  const channel = normalizeAlertChannel(row.channel)
  return publications.some((pub) =>
    pub.articleId === row.article_id
    // A known channel only yields to its OWN platform; an unknown one yields to
    // any, since nothing in the record says the publication was unrelated.
    && (channel === null || pub.channel === channel)
    && supersedes(pub, row.updated_at))
}

/**
 * THE decision. Open alerts, minus those a later successful publication has
 * superseded, in the order given. Both API readers return exactly this.
 */
export function selectActiveAlerts(rows: AlertRow[], publications: PublicationFact[] = []): ActiveAlert[] {
  const out: ActiveAlert[] = []
  for (const row of rows) {
    if (row.status !== 'open') continue
    if (isSuperseded(row, publications)) continue
    const channel = normalizeAlertChannel(row.channel)
    const kind = row.kind ?? 'publish_failed_final'
    out.push({
      id: row.id,
      kind,
      channel,
      heading: headingFor(kind, channel),
      reasonCode: alertReasonCode(row.error),
      title: row.title,
      articleId: row.article_id,
      poolItemId: row.pool_item_id,
      attempts: row.attempts ?? 0,
      createdAt: row.created_at,
    })
  }
  return out
}
