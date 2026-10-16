/**
 * One-time repair: remove the empty subheadings from six published articles.
 *
 * WHY. Until PR #221 the generator could publish an <h3> with nothing under it
 * (./strip.ts). The generator is fixed; six articles already published still show
 * the empty heading on the merchant's own site. The owner approved (decision card,
 * 2026-10-16 22:53 UTC) an automatic one-time repair of exactly these six posts,
 * removing only the empty subheadings. REPAIR_ARTICLE_IDS is that approval's
 * scope: no other article is ever read or written here.
 *
 * WHAT ONE ARTICLE GOES THROUGH.
 *   1. Our stored content_html has no empty <h3>  -> done; nothing is read or written.
 *   2. MAX_ATTEMPTS attempts already recorded     -> gave up; nothing is read or written.
 *   3. An attempt is recorded BEFORE anything remote is touched (below), so a crash
 *      mid-way still counts and the article cannot loop forever.
 *   4. The project is read by its id AND the article's owner (the service role
 *      bypasses RLS), and the connection must belong to that same owner.
 *   5. The LIVE content is read from the site as it is now (never our copy: the
 *      owner may have edited the post there), only the empty <h3>s are cut out of
 *      it, and the result is written back to the same post. A live body that has
 *      none any more is not written at all. The write is read back and must show
 *      none, else it is not trusted.
 *   6. Only after the live post is clean, our stored copy gets the same cut
 *      (content_html, and content_markdown's matching `###` lines). Nothing else
 *      on the row is written: not the title, meta, images, taxonomy, status or
 *      any date. A failed live write leaves our copy as it was, so the next pass
 *      tries again, up to MAX_ATTEMPTS.
 *
 * TRANSPORTS (the ones the app already uses for that article's connection):
 *   WordPress, application password  wordpress_connections: getItemForEdit (raw
 *       content, context=edit) then updateItemFields with ONLY `content`, which
 *       sends nothing else (not status, slug, author, terms or featured image).
 *   WordPress, Go Top plugin only     NOT SUPPORTED. The plugin can read the raw
 *       content (/inspect) but has no route that edits a post body surgically: its
 *       /publish rewrites the title, excerpt, author and status with what it is
 *       sent and runs the body through wp_kses_post, and no /fix type removes a
 *       heading. Such an article is logged `plugin_only_unsupported` and, after
 *       MAX_ATTEMPTS, left for a manual fix.
 *   Shopify                           shopify_connections (loadShopifyConnection):
 *       the article's current `body` by its stored GID, then articleUpdate of that
 *       same article with ONLY `body` (updateShopifyArticleBodyOnly in
 *       lib/shopify/publish-article.ts, the one file that mutates Shopify articles),
 *       behind the billing guard and write_content like every other Shopify write.
 *
 * ATTEMPTS, WITHOUT A NEW COLUMN. Each attempt inserts one row into
 * generated_article_content_snapshots (reason ATTEMPT_REASON): the table that
 * already exists to keep a copy of an article's content before the app changes
 * it. The row is a real snapshot of our copy before the repair, and the attempts
 * are counted from those rows. It is written with restored_at set, so the draft
 * rollback route (which restores the latest un-restored snapshot of a DRAFT, and
 * these articles are published) never picks it. If the row cannot be written,
 * nothing is attempted.
 *
 * LOGS. One `[empty-h3-repair] article` line per article acted on, one
 * `[empty-h3-repair] pass complete` line per pass. Ids, counts and outcome codes
 * only: never a body, a heading's text or a provider's error message.
 */
import crypto from 'node:crypto'
import type { createAdminClient } from '@/lib/supabase/admin'
import { removeEmptyH3, removeEmptyMarkdownH3 } from './strip'

type Admin = ReturnType<typeof createAdminClient>

/** The six published articles the owner approved for this repair, and only those. */
export const REPAIR_ARTICLE_IDS: readonly string[] = [
  '3c27882a-a8ff-4666-abe1-36b38510b5c4', // WordPress, yaronplumber.co.il
  '39860d81-ec11-47b5-a9d2-a68f3d820854', // WordPress, matalon.co.il
  '599868b5-3cff-47e6-9e16-ba45818a86b6', // WordPress, louizflowers.co.il
  'f4fe8a2e-fe56-406c-b8b0-5d3e269f38f4', // WordPress, jup.co.il
  'd64dcd87-2480-4476-a528-c40479e1e36e', // Shopify, oligarch.co.il
  'fa8494f8-7d1e-49ec-8dcf-5fb9bfa9bcc7', // Shopify, afroditedecants.com
]
/** Articles attempted per pass (the cron runs every 15 minutes). */
export const BATCH_SIZE = 2
/** Attempts per article, after which it is left alone. */
export const MAX_ATTEMPTS = 3
export const ATTEMPT_REASON = 'empty_h3_repair_attempt'

export type RepairOutcome =
  | 'repaired' | 'live_already_clean'
  | 'owner_mismatch' | 'no_live_target' | 'no_connection' | 'connection_error'
  | 'connection_changed' | 'plugin_only_unsupported' | 'missing_write_scope' | 'not_entitled'
  | 'live_missing' | 'live_read_failed' | 'live_write_failed' | 'live_write_unverified'
  | 'stored_write_failed' | 'attempt_record_failed' | 'threw'

export interface RepairArticleRow {
  id: string
  user_id: string
  project_id: string
  status: string
  content_html: string | null
  content_markdown: string | null
  internal_links_json: unknown
  wp_post_id: number | null
  wp_post_url: string | null
  wp_connection_id: string | null
  shopify_article_id: string | null
}

/** The live post of one article, over the transport its connection uses. */
export interface LiveTransport {
  platform: 'wordpress' | 'shopify'
  via: 'app_password' | 'shopify_admin'
  /** The current live body; null when the post is gone. Throws when it cannot be read. */
  read(): Promise<string | null>
  /** Write the body back to the same post (only the body). Throws on failure. */
  write(content: string): Promise<void>
}

export type TransportRefusal = Extract<RepairOutcome,
  'no_live_target' | 'no_connection' | 'connection_error' | 'connection_changed' | 'owner_mismatch'
  | 'plugin_only_unsupported' | 'missing_write_scope' | 'not_entitled' | 'live_read_failed'>

export type ResolveTransport = (admin: Admin, article: RepairArticleRow, ownerId: string) => Promise<LiveTransport | { refused: TransportRefusal }>

export interface RepairPassSummary {
  candidates: number
  attempted: number
  done: number
  gaveUp: number
  notPublished: number
  outcomes: Partial<Record<RepairOutcome, number>>
}

const SELECT = 'id, user_id, project_id, status, content_html, content_markdown, internal_links_json, wp_post_id, wp_post_url, wp_connection_id, shopify_article_id'

function hostOf(url: string | null | undefined): string | null {
  try { return url ? new URL(url).host.toLowerCase().replace(/^www\./, '') : null } catch { return null }
}

/** The transports the app already uses for an article's connection (see the file comment). */
export const liveTransport: ResolveTransport = async (admin, article, ownerId) => {
  if (article.shopify_article_id) {
    const { loadShopifyConnection } = await import('@/lib/shopify/api-auth')
    const { hasWriteContent } = await import('@/lib/shopify/constants')
    const { checkShopifyPublishEntitlement } = await import('@/lib/shopify/billing-guard')
    const { shopifyGetArticleBody } = await import('@/lib/shopify/client')
    const { updateShopifyArticleBodyOnly } = await import('@/lib/shopify/publish-article')
    const loaded = await loadShopifyConnection(admin, article.project_id)
    if ('error' in loaded) return { refused: loaded.status === 404 ? 'no_connection' : 'connection_error' }
    if (loaded.connection.user_id !== ownerId) return { refused: 'owner_mismatch' }
    if (!hasWriteContent(loaded.connection.granted_scopes)) return { refused: 'missing_write_scope' }
    const entitled = await checkShopifyPublishEntitlement(admin, loaded.connection)
    if (!entitled.ok) return { refused: 'not_entitled' }
    const gid = article.shopify_article_id
    const creds = loaded.creds
    return {
      platform: 'shopify', via: 'shopify_admin',
      read: async () => (await shopifyGetArticleBody(creds, gid))?.body ?? null,
      write: async (content) => {
        // The billing guard and write_content are checked again there, right before the write.
        const res = await updateShopifyArticleBodyOnly(admin, loaded.connection, creds, gid, content)
        if (!res.ok) throw new Error(res.reason)
      },
    }
  }
  const postId = typeof article.wp_post_id === 'number' && article.wp_post_id > 0 ? article.wp_post_id : null
  if (!postId) return { refused: 'no_live_target' }
  const { loadWordPressCredentials } = await import('@/lib/content/api-auth')
  const loaded = await loadWordPressCredentials(admin, article.project_id)
  if (!('error' in loaded)) {
    if ((loaded.connection as { user_id?: string | null }).user_id !== ownerId) return { refused: 'owner_mismatch' }
    // The post id is only meaningful on the site it was published to.
    if (article.wp_connection_id && article.wp_connection_id !== loaded.connection.id) return { refused: 'connection_changed' }
    const postHost = hostOf(article.wp_post_url)
    if (postHost && hostOf(loaded.connection.site_url) !== postHost) return { refused: 'connection_changed' }
    const { getItemForEdit, updateItemFields } = await import('@/lib/wordpress/client')
    const creds = loaded.creds
    return {
      platform: 'wordpress', via: 'app_password',
      read: async () => {
        const item = await getItemForEdit(creds, '/posts', postId)
        return item.content
      },
      write: async (content) => { await updateItemFields(creds, '/posts', postId, { content }) },
    }
  }
  const { loadPublishPlugin } = await import('@/lib/content/wordpress-plugin-publish')
  if (await loadPublishPlugin(admin, article.project_id, { ownerId })) return { refused: 'plugin_only_unsupported' }
  return { refused: loaded.status === 404 ? 'no_connection' : 'connection_error' }
}

async function attemptsSoFar(admin: Admin, articleId: string): Promise<number | null> {
  const { data, error } = await admin
    .from('generated_article_content_snapshots')
    .select('id')
    .eq('generated_article_id', articleId)
    .eq('reason', ATTEMPT_REASON)
  if (error) return null
  return Array.isArray(data) ? data.length : 0
}

async function recordAttempt(admin: Admin, a: RepairArticleRow, now: Date): Promise<boolean> {
  const html = a.content_html ?? ''
  const { error } = await admin.from('generated_article_content_snapshots').insert({
    user_id: a.user_id,
    project_id: a.project_id,
    generated_article_id: a.id,
    reason: ATTEMPT_REASON,
    content_html_before: a.content_html,
    content_markdown_before: a.content_markdown,
    internal_links_json_before: a.internal_links_json ?? null,
    article_status_before: a.status,
    checksum_before: crypto.createHash('sha256').update(html).digest('hex'),
    // Never a rollback candidate (the draft rollback restores the latest UN-restored one).
    restored_at: now.toISOString(),
  })
  return !error
}

/** One article, already a candidate with its attempt recorded. Never throws. */
async function repairOne(
  admin: Admin, a: RepairArticleRow, resolve: ResolveTransport,
): Promise<{ outcome: RepairOutcome; platform?: string; via?: string; liveRemoved?: number; storedRemoved?: number }> {
  const { data: proj, error: projErr } = await admin
    .from('projects').select('id, user_id').eq('id', a.project_id).eq('user_id', a.user_id).maybeSingle()
  if (projErr || !proj) return { outcome: 'owner_mismatch' }

  let t: LiveTransport | { refused: TransportRefusal }
  try { t = await resolve(admin, a, a.user_id) } catch { return { outcome: 'connection_error' } }
  if ('refused' in t) return { outcome: t.refused }
  const where = { platform: t.platform, via: t.via }

  let live: string | null
  try { live = await t.read() } catch { return { outcome: 'live_read_failed', ...where } }
  if (live === null) return { outcome: 'live_missing', ...where }

  const liveCut = removeEmptyH3(live)
  if (liveCut.removed > 0) {
    try { await t.write(liveCut.html) } catch { return { outcome: 'live_write_failed', ...where, liveRemoved: 0 } }
    let after: string | null
    try { after = await t.read() } catch { return { outcome: 'live_write_unverified', ...where } }
    if (after === null || removeEmptyH3(after).removed > 0) return { outcome: 'live_write_unverified', ...where }
  }

  // The live post is clean: now our copy, the same cut, nothing else on the row.
  const storedCut = removeEmptyH3(a.content_html)
  const md = removeEmptyMarkdownH3(a.content_markdown, storedCut.texts)
  const patch: Record<string, unknown> = { content_html: storedCut.html }
  if (md.removed > 0) patch.content_markdown = md.markdown
  const { error } = await admin.from('generated_articles').update(patch)
    .eq('id', a.id).eq('project_id', a.project_id).eq('user_id', a.user_id)
  if (error) return { outcome: 'stored_write_failed', ...where, liveRemoved: liveCut.removed }
  return { outcome: liveCut.removed > 0 ? 'repaired' : 'live_already_clean', ...where, liveRemoved: liveCut.removed, storedRemoved: storedCut.removed }
}

/** One pass: at most BATCH_SIZE articles. Throws only when the article list cannot be read. */
export async function runEmptyH3RepairPass(
  admin: Admin,
  deps: { resolve?: ResolveTransport; now?: () => Date; ids?: readonly string[] } = {},
): Promise<RepairPassSummary> {
  const resolve = deps.resolve ?? liveTransport
  const now = deps.now ?? (() => new Date())
  const ids = [...(deps.ids ?? REPAIR_ARTICLE_IDS)]
  const summary: RepairPassSummary = { candidates: 0, attempted: 0, done: 0, gaveUp: 0, notPublished: 0, outcomes: {} }

  const { data, error } = await admin.from('generated_articles').select(SELECT).in('id', ids)
  if (error) throw new Error('articles_unreadable')
  const rows = ((data ?? []) as RepairArticleRow[]).slice().sort((x, y) => x.id.localeCompare(y.id))

  for (const a of rows) {
    if (removeEmptyH3(a.content_html).removed === 0) { summary.done++; continue }
    // Only a published article: the approval is about the live posts.
    if (a.status !== 'published') { summary.notPublished++; continue }
    summary.candidates++
    if (summary.attempted >= BATCH_SIZE) continue
    const before = await attemptsSoFar(admin, a.id)
    if (before === null) { tally(summary, a, 'attempt_record_failed', {}); continue }
    if (before >= MAX_ATTEMPTS) { summary.gaveUp++; continue }
    summary.attempted++
    if (!(await recordAttempt(admin, a, now()))) { tally(summary, a, 'attempt_record_failed', { attempt: before + 1 }); continue }
    let r: Awaited<ReturnType<typeof repairOne>>
    try { r = await repairOne(admin, a, resolve) } catch { r = { outcome: 'threw' } }
    tally(summary, a, r.outcome, { attempt: before + 1, platform: r.platform, via: r.via, liveRemoved: r.liveRemoved, storedRemoved: r.storedRemoved })
  }
  return summary
}

function tally(summary: RepairPassSummary, a: RepairArticleRow, outcome: RepairOutcome, extra: Record<string, unknown>): void {
  summary.outcomes[outcome] = (summary.outcomes[outcome] ?? 0) + 1
  console.log('[empty-h3-repair] article', { articleId: a.id, outcome, ...extra })
}

export type IsolatedRepairOutcome = ({ status: 'ran' } & RepairPassSummary) | { status: 'not_production' | 'error' }

/**
 * The pass as the 15-minute cron calls it: Production only (Preview shares the
 * Production database and must not edit merchants' sites on its own schedule),
 * its own try/catch, never throws or rejects, so it cannot change, delay or fail
 * the automation run.
 */
export async function runIsolatedEmptyH3Repair(
  run: () => Promise<RepairPassSummary> = async () => {
    const { createAdminClient } = await import('@/lib/supabase/admin')
    return runEmptyH3RepairPass(createAdminClient())
  },
  opts: { env?: Record<string, string | undefined> } = {},
): Promise<IsolatedRepairOutcome> {
  try {
    const env = opts.env ?? process.env
    if (env.VERCEL_ENV !== 'production') return { status: 'not_production' }
    const summary = await run()
    console.log('[empty-h3-repair] pass complete', summary)
    return { status: 'ran', ...summary }
  } catch {
    console.error('[empty-h3-repair] pass failed', { reason: 'threw' })
    return { status: 'error' }
  }
}
