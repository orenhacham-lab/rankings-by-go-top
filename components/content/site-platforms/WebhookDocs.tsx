import { CodeXml } from 'lucide-react'
import { DELIVERY_HEADER, EVENT_HEADER, SIGNATURE_HEADER, TIMESTAMP_HEADER } from '@/lib/site-platforms/webhook-headers'
import type { DashboardDictionary } from '@/lib/i18n/dashboard/he'

/**
 * The developer notes for a custom-site webhook: a short collapsible, closed by
 * default. The example body is written from the same field names
 * lib/site-platforms/webhook.ts sends; the QA suite holds the two together.
 */
export const EXAMPLE_PAYLOAD = `{
  "event": "article.published",
  "delivery_id": "art_3f9c…",
  "sent_at": "2026-09-28T07:00:00.000Z",
  "article": {
    "id": "…",
    "title": "…",
    "slug": "…",
    "html": "<h2>…</h2><p>…</p>",
    "excerpt": "…",
    "image_url": "https://…",
    "meta": { "title": "…", "description": "…" }
  }
}`

export const EXAMPLE_VERIFY = `// Node.js
const crypto = require('crypto')
const expected = 'sha256=' + crypto
  .createHmac('sha256', process.env.GOTOP_WEBHOOK_SECRET)
  .update(req.headers['x-gotop-timestamp'] + '.' + rawBody)
  .digest('hex')
const given = String(req.headers['x-gotop-signature'] || '')
const ok = given.length === expected.length &&
  crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(given))`

export default function WebhookDocs({ t }: { t: DashboardDictionary['sitePlatforms']['webhook']['docs'] }) {
  return (
    <details className="group rounded-control border border-line bg-sunk/50 open:bg-surface">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-3 py-2 text-caption font-semibold text-ink hover:bg-sunk focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-action rounded-control">
        <CodeXml size={14} aria-hidden className="text-action" />
        <span className="min-w-0 flex-1">{t.toggle}</span>
        <span aria-hidden className="text-muted transition-transform duration-200 group-open:rotate-90 rtl:rotate-180 rtl:group-open:rotate-90">›</span>
      </summary>
      <div className="space-y-3 px-3 pb-3 pt-1 text-caption text-body animate-pop-in">
        <p>{t.intro}</p>
        <pre dir="ltr" className="overflow-x-auto rounded-control bg-contrast p-3 text-left font-mono text-[11px] leading-relaxed text-contrast-ink">{EXAMPLE_PAYLOAD}</pre>
        <p className="font-semibold text-ink">{t.headersTitle}</p>
        <ul className="list-disc space-y-1 ps-5">
          <li><code dir="ltr" className="font-mono">{SIGNATURE_HEADER}</code> — {t.signature}</li>
          <li><code dir="ltr" className="font-mono">{TIMESTAMP_HEADER}</code> — {t.timestamp}</li>
          <li><code dir="ltr" className="font-mono">{DELIVERY_HEADER}</code> — {t.delivery}</li>
          <li><code dir="ltr" className="font-mono">{EVENT_HEADER}</code> — {t.event}</li>
        </ul>
        <pre dir="ltr" className="overflow-x-auto rounded-control bg-contrast p-3 text-left font-mono text-[11px] leading-relaxed text-contrast-ink">{EXAMPLE_VERIFY}</pre>
        <p>{t.respond}</p>
      </div>
    </details>
  )
}
