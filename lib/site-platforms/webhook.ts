/**
 * Custom site via webhook: what we send, how it is signed, and the adapter.
 *
 * Every delivery is one HTTPS POST of a JSON body. The receiver verifies it with
 * the per-connection secret it was shown once:
 *
 *   X-GoTop-Timestamp:  <unix seconds>
 *   X-GoTop-Signature:  sha256=<hex HMAC-SHA256(secret, "<timestamp>.<raw body>")>
 *   X-GoTop-Event:      article.published | test
 *   X-GoTop-Delivery:   <delivery id — the same for every retry of one article>
 *
 * Signing the timestamp with the body lets a receiver refuse replays (reject a
 * timestamp older than a few minutes). The delivery id is stable per article,
 * so a receiver that saw it already can answer 2xx without creating a second
 * post. A 2xx answer may carry JSON `{ "url": "https://…" }`; that address is
 * then shown as the article's live link.
 *
 * The in-app developer notes (components/content/site-platforms/WebhookDocs.tsx)
 * describe exactly this; the QA suite holds the two together.
 */
import crypto from 'crypto'
import { sendGuardedPost, type Resolver, type Transport } from './outbound'
import type { SitePublishArticle, SitePublishResult, SiteErrorCode } from './types'
import { buildStructuredData, type JsonLd } from '@/lib/content/structured-data'

import { SIGNATURE_HEADER, TIMESTAMP_HEADER, EVENT_HEADER, DELIVERY_HEADER } from './webhook-headers'
export { SIGNATURE_HEADER, TIMESTAMP_HEADER, EVENT_HEADER, DELIVERY_HEADER }

export type WebhookEvent = 'article.published' | 'test'

/**
 * The payload's version. 1 had no structured_data; 2 adds `article.structured_data`
 * (additive: every version-1 field is unchanged, so a version-1 receiver keeps working).
 */
export const WEBHOOK_PAYLOAD_VERSION = 2

export type WebhookPayload = {
  payload_version: number
  event: WebhookEvent
  delivery_id: string
  sent_at: string
  article: {
    id: string
    title: string
    slug: string
    html: string
    excerpt: string | null
    image_url: string | null
    meta: { title: string | null; description: string | null }
    /**
     * JSON-LD objects for the article's page (BlogPosting, then FAQPage when the
     * article has FAQ pairs), from lib/content/structured-data.ts. The page URL
     * is the receiver's to add (it decides where the article lives). Each object
     * is plain JSON; a receiver that prints it inside a script element must
     * escape it (e.g. JSON.stringify(x).replace(/</g, '\\u003c')).
     */
    structured_data: JsonLd[]
  }
}

/** HMAC-SHA256 over "<timestamp>.<body>", hex. The receiver computes the same and compares in constant time. */
export function signWebhookBody(secret: string, timestamp: string, body: string): string {
  return crypto.createHmac('sha256', secret).update(`${timestamp}.${body}`, 'utf8').digest('hex')
}

/** Receiver-side check, exported for the docs example and the QA suite. */
export function verifyWebhookSignature(secret: string, timestamp: string, body: string, header: string): boolean {
  const m = /^sha256=([0-9a-f]{64})$/.exec(String(header ?? ''))
  if (!m) return false
  const expected = Buffer.from(signWebhookBody(secret, timestamp, body), 'hex')
  const given = Buffer.from(m[1], 'hex')
  return expected.length === given.length && crypto.timingSafeEqual(expected, given)
}

/** A stable delivery id per article: a retry of the same article carries the same id. */
export function deliveryIdFor(articleId: string): string {
  return `art_${crypto.createHash('sha256').update(`gotop-article:${articleId}`).digest('hex').slice(0, 32)}`
}

const httpsImage = (u: string | null | undefined): string | null => (u && /^https:\/\//i.test(u) && u.length <= 2048 ? u : null)

export function buildArticlePayload(article: SitePublishArticle, event: WebhookEvent, now: Date): WebhookPayload {
  const ctx = article.schema_context ?? null
  const structured = buildStructuredData({
    headline: String(article.title ?? ''),
    description: article.meta_description || article.excerpt || null,
    imageUrl: httpsImage(article.featured_image_url),
    datePublished: article.published_at ?? now.toISOString(),
    dateModified: article.updated_at ?? now.toISOString(),
    language: ctx?.language ?? null,
    publisher: ctx ? { name: ctx.publisherName, url: ctx.publisherUrl } : null,
    faq: Array.isArray(article.faq_json) ? article.faq_json : [],
  })
  return {
    payload_version: WEBHOOK_PAYLOAD_VERSION,
    event,
    delivery_id: event === 'test' ? `test_${crypto.randomBytes(12).toString('hex')}` : deliveryIdFor(article.id),
    sent_at: now.toISOString(),
    article: {
      id: article.id,
      title: String(article.title ?? ''),
      slug: String(article.slug ?? ''),
      html: String(article.content_html ?? ''),
      excerpt: article.excerpt ?? null,
      image_url: httpsImage(article.featured_image_url),
      meta: { title: article.meta_title ?? null, description: article.meta_description ?? null },
      structured_data: structured,
    },
  }
}

/** The body of a "send test" delivery: clearly marked, nothing a receiver should publish. */
export function buildTestPayload(now: Date): WebhookPayload {
  return buildArticlePayload({
    id: 'test',
    title: 'Test delivery from GoTop SEO',
    slug: 'gotop-test-delivery',
    excerpt: 'This is a test event. Do not publish it.',
    meta_title: 'Test delivery',
    meta_description: 'A signed test event to confirm your endpoint.',
    content_html: '<p>This is a test event. Do not publish it.</p>',
    featured_image_url: null,
  }, 'test', now)
}

export type WebhookDeps = { resolver?: Resolver; transport?: Transport; now?: () => Date }

/** Serialize, sign and send one payload. */
export async function deliverWebhook(endpointUrl: string, secret: string, payload: WebhookPayload, deps: WebhookDeps = {}) {
  const body = JSON.stringify(payload)
  const timestamp = String(Math.floor((deps.now?.() ?? new Date()).getTime() / 1000))
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    'User-Agent': 'GoTopSEO-Webhook/1.0',
    [EVENT_HEADER]: payload.event,
    [DELIVERY_HEADER]: payload.delivery_id,
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: `sha256=${signWebhookBody(secret, timestamp, body)}`,
  }
  return sendGuardedPost(endpointUrl, headers, body, deps)
}

/** The live URL a receiver may return, accepted only as a plain https address. */
export function readReturnedUrl(body: string): string | null {
  try {
    const j = JSON.parse(body) as { url?: unknown }
    return typeof j.url === 'string' ? httpsImage(j.url) : null
  } catch {
    return null
  }
}

/** The publisher adapter for a webhook connection. */
export async function publishViaWebhook(
  conn: { endpointUrl: string; secret: string },
  article: SitePublishArticle,
  deps: WebhookDeps = {},
): Promise<SitePublishResult> {
  if (!article.title || !article.content_html) return { ok: false, code: 'article_empty', retryable: false }
  const payload = buildArticlePayload(article, 'article.published', deps.now?.() ?? new Date())
  const sent = await deliverWebhook(conn.endpointUrl, conn.secret, payload, deps)
  if (!sent.ok) return { ok: false, code: sent.code as SiteErrorCode, retryable: sent.retryable }
  return { ok: true, postId: payload.delivery_id, url: readReturnedUrl(sent.body) }
}
