/**
 * Area E (round 2) — attempts reset at generated, deterministic blockers → paused
 * + immediate alert, terminal-catch alerts, and the media-failure classifier.
 *
 * Behavioral: classifyMediaFailure (the one branch with real logic) is unit-
 * tested against every meta shape. Source-contract: the paused-routing + alert
 * wiring across generate-item / publish-item / publish-item-shopify / alerts,
 * which are DB-coupled and can only be guaranteed on source.
 *
 * DEFECT (found 2026-08-16, live evidence): the Supabase storage-download
 * branch in wpCreatePost returned a WpCreateError with NO `detail` — the exact
 * shape classifyMediaFailure treats as 'deterministic' (assumed: source image
 * missing/invalid). But two unrelated projects (BUY BUY, Louiz Flowers) hit
 * this SAME branch the same day while five OTHER downloads succeeded within
 * the same few-minute window, and BUY BUY's retry succeeded on the IDENTICAL
 * storagePath with no regeneration — proving ordinary transient Storage noise,
 * not a missing object. Every occurrence was pausing on the FIRST attempt
 * instead of getting the bounded retry a transient failure deserves. Fixed by
 * setting `detail` on that branch, which routes it through classifyMediaFailure's
 * existing transient fallback — no change to the classifier itself.
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
  for (const reason of ['article_missing', 'no_shopify_connection', 'missing_write_content_scope']) {
    check(`Shopify blocker '${reason}' → blockShopifyItem (paused + alert)`, new RegExp(`blockShopifyItem\\(admin, item, '${reason}'`).test(shop))
  }
  check('blockShopifyItem finalizes paused + records blocked alert', /finalizeItem\(admin, item\.id, 'paused', reason\)/.test(shop) && /recordPublishBlockedAlert/.test(shop))

  // 5 — terminal catch alert in BOTH backends (retained context, deduped).
  check('WordPress terminal catch raises a final-failure alert', /catch \(e\)[\s\S]*recordPublishFinalFailureAlert\(admin, \{[\s\S]*ctx\.projectId/.test(wp))
  check('WordPress catch guards on retained ctx.projectId', /if \(ctx\.projectId\)/.test(wp))
  check('Shopify has a terminal try/catch (previously none) with an alert', /catch \(e\)[\s\S]*recordPublishFinalFailureAlert/.test(shop))

  console.log('SOURCE) storage-download failure now carries `detail` — no longer misclassified')
  const wpub = strip(read('../wordpress-publish.ts'))
  // The download-failure branch: `if (dl.error || !dl.data) { ... detail ... }`.
  // Isolate that block specifically (not the later uploadMedia-throw branch,
  // which already had detail) so this can't pass by matching the wrong site.
  const dlBlockMatch = wpub.match(/if \(dl\.error \|\| !dl\.data\) \{[\s\S]*?\n {6}\} else \{/)
  const dlBlock = dlBlockMatch ? dlBlockMatch[0] : ''
  check('the storage-download failure branch exists (regex still matches current source)', dlBlock.length > 0)
  check('…and now computes a non-empty `detail` from dl.error (or a clear fallback)',
    /const detail = dl\.error\?\.message \|\| '[^']+'/.test(dlBlock))
  check('…and passes it into the returned WpCreateError (not just `stage`)',
    /return \{ ok: false, kind: 'media_upload_failed', detail, stage: 'media_upload' \}/.test(dlBlock))
  // Behavioral tie-back: the exact shape this branch now produces (detail set,
  // no wpErrorMeta — Supabase errors carry no WordPress HTTP meta) is the shape
  // already proven transient at line ~38 above. No classifier change needed.
  check('…and that exact shape (detail, no wpErrorMeta) classifies transient',
    classifyMediaFailure(media({ detail: 'objects/xyz.jpg not found' })) === 'transient')

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
