/**
 * Custom sites (webhook): an approved fix is SENT to the site's developer, who applies it. We do not
 * write anything ourselves; the job is marked "sent" when their endpoint answers 2xx.
 *
 * Same endpoint, secret and signature as article deliveries (lib/site-platforms/webhook.ts:
 * X-GoTop-Signature = sha256=HMAC(secret, "<timestamp>.<body>"), X-GoTop-Timestamp, X-GoTop-Event,
 * X-GoTop-Delivery), and the same guarded transport (https only, public hosts only, no redirects).
 * Two new events, with their own version field so the article payload is untouched:
 *
 *   site_fix.approved   apply `fix.value` to `fix.page_url`
 *   site_fix.reverted   the merchant pressed undo: put `fix.previous` back
 *
 * A receiver that does not know these events should answer 2xx and ignore them (an article
 * receiver keys on `X-GoTop-Event: article.published`). The in-app developer notes
 * (components/content/site-platforms/WebhookDocs.tsx, EXAMPLE_FIX_PAYLOAD) show this exact shape.
 */
import crypto from 'crypto'
import { sendGuardedPost, type Resolver, type Transport } from '@/lib/site-platforms/outbound'
import { signWebhookBody } from '@/lib/site-platforms/webhook'
import { DELIVERY_HEADER, EVENT_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@/lib/site-platforms/webhook-headers'
import type { FixType } from './types'

/** 1: the first fix payload. Additive changes keep the number; a breaking change bumps it. */
export const FIX_PAYLOAD_VERSION = 1

export type FixEvent = 'site_fix.approved' | 'site_fix.reverted'

export interface FixWebhookPayload {
  fix_payload_version: number
  event: FixEvent
  delivery_id: string
  sent_at: string
  fix: {
    id: string
    type: FixType
    page_url: string
    /** The approved value(s): the same shape the Go Top plugin receives (see the developer notes). */
    value: Record<string, unknown>
    /** What the page held when the merchant approved, when we could read it (display text). */
    previous: string | null
    approved_at: string
  }
}

/** Stable per job and event: a retry of the same delivery carries the same id. */
export function fixDeliveryId(jobId: string, event: FixEvent): string {
  return `fix_${crypto.createHash('sha256').update(`gotop-fix:${jobId}:${event}`).digest('hex').slice(0, 32)}`
}

export function buildFixPayload(
  job: { id: string; type: FixType; pageUrl: string; value: Record<string, unknown>; previous: string | null; approvedAt: string },
  event: FixEvent,
  now: Date,
): FixWebhookPayload {
  return {
    fix_payload_version: FIX_PAYLOAD_VERSION,
    event,
    delivery_id: fixDeliveryId(job.id, event),
    sent_at: now.toISOString(),
    fix: { id: job.id, type: job.type, page_url: job.pageUrl, value: job.value, previous: job.previous, approved_at: job.approvedAt },
  }
}

export type FixWebhookDeps = { resolver?: Resolver; transport?: Transport; now?: () => Date }

export async function sendFixWebhook(
  conn: { endpointUrl: string; secret: string },
  payload: FixWebhookPayload,
  deps: FixWebhookDeps = {},
): Promise<{ ok: true } | { ok: false; retryable: boolean }> {
  const body = JSON.stringify(payload)
  const timestamp = String(Math.floor((deps.now?.() ?? new Date()).getTime() / 1000))
  const sent = await sendGuardedPost(conn.endpointUrl, {
    'Content-Type': 'application/json',
    'User-Agent': 'GoTopSEO-Webhook/1.0',
    [EVENT_HEADER]: payload.event,
    [DELIVERY_HEADER]: payload.delivery_id,
    [TIMESTAMP_HEADER]: timestamp,
    [SIGNATURE_HEADER]: `sha256=${signWebhookBody(conn.secret, timestamp, body)}`,
  }, body, deps)
  return sent.ok ? { ok: true } : { ok: false, retryable: sent.retryable }
}
