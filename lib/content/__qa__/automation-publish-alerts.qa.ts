/**
 * Area E (round 2) — attempts reset at generated, deterministic blockers → paused
 * + immediate alert, terminal-catch alerts, and the media-failure classifier.
 *
 * Behavioral: classifyMediaFailure (the one branch with real logic) is unit-
 * tested against every meta shape. Source-contract: the paused-routing + alert
 * wiring across generate-item / publish-item / publish-item-shopify / alerts,
 * which are DB-coupled and can only be guaranteed on source.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { classifyMediaFailure } from '../automation/publish-item'
import type { WpCreateError } from '../wordpress-publish'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')
const media = (over: Partial<WpCreateError> = {}): WpCreateError => ({ ok: false, kind: 'media_upload_failed', ...over })

function main() {
  console.log('BEHAVIOR) classifyMediaFailure — deterministic (pause) vs transient (retry)')
  // No detail + no meta = Supabase storage source object missing/undownloadable.
  check('no detail + no meta → deterministic (missing source image)', classifyMediaFailure(media()) === 'deterministic')
  // Structured HTTP meta: 4xx (except 429) + WP REST codes are deterministic.
  check('HTTP 400 → deterministic', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 400 } })) === 'deterministic')
  check('HTTP 401 → deterministic', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 401 } })) === 'deterministic')
  check('HTTP 403 → deterministic', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 403 } })) === 'deterministic')
  check('HTTP 415 (unsupported media) → deterministic', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 415 } })) === 'deterministic')
  check('WP REST code, status 400 → deterministic', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 400, wpCode: 'rest_upload_unknown_error' } })) === 'deterministic')
  // Transient: timeout / 429 / 5xx / unstructured throw.
  check('timeout → transient', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { timeout: true } })) === 'transient')
  check('HTTP 429 → transient', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 429 } })) === 'transient')
  check('HTTP 500 → transient', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 500 } })) === 'transient')
  check('HTTP 503 → transient', classifyMediaFailure(media({ detail: 'x', wpErrorMeta: { status: 503 } })) === 'transient')
  check('detail present, no HTTP meta (network throw) → transient', classifyMediaFailure(media({ detail: 'Media upload failed.' })) === 'transient')

  console.log('SOURCE) attempts reset + paused blockers + alerts wired truthfully')
  const gen = strip(read('../automation/generate-item.ts'))
  const wp = strip(read('../automation/publish-item.ts'))
  const shop = strip(read('../automation/publish-item-shopify.ts'))
  const alerts = strip(read('../automation/alerts.ts'))

  // 1 — generated transition resets the shared attempt counter to 0.
  check('generate-item resets attempts:0 at the generated transition',
    /status:\s*'generated',\s*attempts:\s*0/.test(gen))

  // 2 — alerts layer exposes the blocked kind with its own dedupe key, no CHECK.
  check("alerts exports recordPublishBlockedAlert", /export async function recordPublishBlockedAlert/.test(alerts))
  check("blocked alert uses kind 'publish_blocked'", /'publish_blocked'/.test(alerts))
  check('blocked alert has its own dedupe suffix', /:publish_blocked/.test(alerts))
  check('final-failure alert kind retained', /'publish_failed_final'/.test(alerts))

  // 3 — every deterministic publish blocker routes to paused + a blocked alert.
  for (const reason of ['platform_conflict', 'no_active_publishing_platform', 'article_missing', 'duplicate_topic_published', 'no_wordpress_connection', 'wordpress_media_upload_failed']) {
    check(`WordPress blocker '${reason}' → blockItem(...paused + alert)`, new RegExp(`blockItem\\(admin, itemId, [^\\n]*${reason}`).test(wp) || new RegExp(`blockItem\\(admin, itemId, \\w+, ctx\\)`).test(wp) && wp.includes(reason))
  }
  check('WordPress publish quality-gate failure → blockItem (paused)', /publish_quality_gate_failed/.test(wp) && /blockItem\(admin, itemId, reason, ctx\)/.test(wp))
  check('blockItem finalizes to paused + records blocked alert', /finalizeItem\(admin, itemId, 'paused', reason\)/.test(wp) && /recordPublishBlockedAlert/.test(wp))
  // media only pauses when deterministic; transient stays a retryable failure.
  check("media pause is gated on classifyMediaFailure === 'deterministic'", /classifyMediaFailure\(created\)\s*===\s*'deterministic'/.test(wp))
  check('transient media failure stays retryable (failed) + final-failure alert', /finalizeItem\(admin, itemId, 'failed', mediaReason\)/.test(wp) && /alertOnFinalFailure\(mediaReason\)/.test(wp))

  // 4 — Shopify blockers route to paused + alert (local blockShopifyItem).
  for (const reason of ['article_missing', 'missing_write_content_scope']) {
    check(`Shopify blocker '${reason}' → blockShopifyItem (paused + alert)`, new RegExp(`blockShopifyItem\\(admin, item, '${reason}'`).test(shop))
  }
  // A CONNECTION failure no longer hard-codes 'no_shopify_connection': the queue
  // forwards loadShopifyConnection's own reason, so a merchant whose store IS
  // connected but whose credential needs reauthorization is told that, instead
  // of being told they have no store. The reason is still routed to the same
  // paused + alert path.
  check('Shopify connection failure → blockShopifyItem with the REAL reason (not a hard-coded one)',
    /blockShopifyItem\(admin, item, loaded\.reason, articleTitle\)/.test(shop)
    && !/blockShopifyItem\(admin, item, 'no_shopify_connection'/.test(shop))
  check('blockShopifyItem finalizes paused + records blocked alert', /finalizeItem\(admin, item\.id, 'paused', reason\)/.test(shop) && /recordPublishBlockedAlert/.test(shop))

  // 5 — terminal catch alert in BOTH backends (retained context, deduped).
  check('WordPress terminal catch raises a final-failure alert', /catch \(e\)[\s\S]*recordPublishFinalFailureAlert\(admin, \{[\s\S]*ctx\.projectId/.test(wp))
  check('WordPress catch guards on retained ctx.projectId', /if \(ctx\.projectId\)/.test(wp))
  check('Shopify has a terminal try/catch (previously none) with an alert', /catch \(e\)[\s\S]*recordPublishFinalFailureAlert/.test(shop))

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
