/**
 * WordPress SEO-meta publishing — verified write/read contract + truthful status.
 *
 * Proves: the detected-plugin-only key selection (Yoast + Rank Math, no regression); a 2xx
 * that does NOT verify is NEVER a success (written_not_verifiable); the companion-bridge
 * capability + typed seo_bridge_required; per-field verification; and the wiring — automation
 * now loads + sends the focus keyword through the ONE shared service and persists the outcome,
 * update-in-place retries against the same wp_post_id, and the companion plugin writes only the
 * SEO allowlist under edit_post permission.
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { seoMetaKeys, verifySeoMeta, verifySeoMetaPerField, hasSeoBridgeNamespace, classifySeoStatus } from '../wordpress-taxonomy'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const read = (p: string) => readFileSync(join(__dirname, p), 'utf8')
const SEO = { metaTitle: 'Best running shoes', metaDescription: 'A guide to choosing running shoes.', focusKeyword: 'running shoes' }

async function main() {
  console.log('KEYS) detected-plugin-only exact keys (Yoast + Rank Math)')
  {
    const y = seoMetaKeys('yoast', SEO)
    check('A. Yoast writes _yoast_wpseo_title/metadesc/focuskw (incl. focus keyword)',
      y._yoast_wpseo_title === SEO.metaTitle && y._yoast_wpseo_metadesc === SEO.metaDescription && y._yoast_wpseo_focuskw === SEO.focusKeyword && !('rank_math_title' in y))
    const r = seoMetaKeys('rankmath', SEO)
    check('H. Rank Math writes rank_math_title/description/focus_keyword (no regression)',
      r.rank_math_title === SEO.metaTitle && r.rank_math_description === SEO.metaDescription && r.rank_math_focus_keyword === SEO.focusKeyword && !('_yoast_wpseo_title' in r))
    check('I. SEO meta keys never include the excerpt (excerpt stays separate)',
      !('excerpt' in seoMetaKeys('yoast', SEO)) && !('excerpt' in seoMetaKeys('rankmath', SEO)))
    check('no plugin / empty → no keys', Object.keys(seoMetaKeys('none', SEO)).length === 0 && Object.keys(seoMetaKeys('yoast', { metaTitle: null, metaDescription: null, focusKeyword: null })).length === 0)
  }

  console.log('VERIFY) a 2xx is NOT proof — only an exact read-back is')
  {
    const written = seoMetaKeys('yoast', SEO)
    check('A(verify). exact read-back → verified', verifySeoMeta(written, { _yoast_wpseo_title: SEO.metaTitle, _yoast_wpseo_metadesc: SEO.metaDescription, _yoast_wpseo_focuskw: SEO.focusKeyword }) === 'verified')
    check('B. core returned 2xx but protected meta absent on read-back → written_not_verifiable', verifySeoMeta(written, {}) === 'written_not_verifiable' && verifySeoMeta(written, null) === 'written_not_verifiable')
    check('B. a mismatched read-back → written_not_verifiable', verifySeoMeta(written, { _yoast_wpseo_title: SEO.metaTitle, _yoast_wpseo_metadesc: 'something else', _yoast_wpseo_focuskw: SEO.focusKeyword }) === 'written_not_verifiable')
    const perField = verifySeoMetaPerField(written, { _yoast_wpseo_title: SEO.metaTitle, _yoast_wpseo_metadesc: '', _yoast_wpseo_focuskw: SEO.focusKeyword })
    check('per-field verification reports present/verified per key (no values)', perField.find((f) => f.key === '_yoast_wpseo_title')?.verified === true && perField.find((f) => f.key === '_yoast_wpseo_metadesc')?.verified === false)
  }

  console.log('TRUTHFUL) status classification — success ONLY when verified')
  {
    check('verified → success', classifySeoStatus('verified').success === true)
    check('written_not_verifiable → NOT success (warning)', classifySeoStatus('written_not_verifiable').success === false && classifySeoStatus('written_not_verifiable').severity === 'warning')
    check('seo_bridge_required → NOT success (setup)', classifySeoStatus('seo_bridge_required').success === false && classifySeoStatus('seo_bridge_required').severity === 'setup')
    check('permission_error → NOT success (error)', classifySeoStatus('permission_error').success === false && classifySeoStatus('permission_error').severity === 'error')
    check('plugin_unavailable → NOT success (setup)', classifySeoStatus('plugin_unavailable').success === false)
    check('bridge capability detected from gotop/v1 namespace', hasSeoBridgeNamespace(['wp/v2', 'yoast/v1', 'gotop/v1']) === true && hasSeoBridgeNamespace(['wp/v2', 'yoast/v1']) === false)
  }

  console.log('GUARD) shared service, focus keyword, bridge fallback, persistence, idempotency')
  {
    const client = read('../../../lib/wordpress/client.ts')
    check('writeVerifiedSeoMeta: core write+verify → bridge (if present) → else seo_bridge_required (never fake success)',
      /coreStatus === 'verified'/.test(client) && /writeSeoViaBridge\(/.test(client) && /'seo_bridge_required'/.test(client) && /gotop\/v1\/seo-meta/.test(client))
    const shared = read('../recommendations/../seo-publish.ts')
    check('ONE shared SEO service loads the focus keyword + persists the outcome',
      /loadFocusKeyword\(/.test(shared) && /writeVerifiedSeoMeta\(/.test(shared) && /persistSeoOutcome\(/.test(shared) && /seo_status: seo\.status/.test(shared))
    const auto = read('../automation/publish-item.ts')
    check('E. automated publishing sends the focus keyword via the shared service (no longer omitted/swallowed)',
      /publishArticleSeo\(admin, loaded\.creds, created\.wpPostId/.test(auto) && /topicId: article\.topic_id/.test(auto) && !/updatePostSeoMeta\(/.test(auto))
    const manual = read('../../../app/api/content/articles/[id]/wordpress/route.ts')
    check('F. manual + automated use the SAME shared service (publishArticleSeo)',
      /publishArticleSeo\(auth\.admin, loaded\.creds, created\.wpPostId/.test(manual))
    check('G. update-in-place / retry targets the SAME wp_post_id (idempotent — created.wpPostId; never a new post to retry SEO)',
      /publishArticleSeo\([^)]*created\.wpPostId/.test(manual) && /publishArticleSeo\([^)]*created\.wpPostId/.test(auto))
    const plugin = read('../../../wordpress-plugin/gotop-seo-bridge/gotop-seo-bridge.php')
    check('companion plugin: edit_post permission + SEO allowlist only + read-back verification (no arbitrary meta)',
      /current_user_can\('edit_post', \$post_id\)/.test(plugin) && /_yoast_wpseo_focuskw/.test(plugin) && /rank_math_focus_keyword/.test(plugin) && /in_array\(\$key, \$allowed, true\)/.test(plugin) && /get_post_meta\(\$post_id, \$key, true\)/.test(plugin))
    const hub = read('../../../components/content/ContentHub.tsx')
    check('ContentHub row + batch surface an SEO warning when the post succeeded but SEO did not',
      /seoStatus !== 'verified' && seoStatus !== 'plugin_unavailable'/.test(hub) && /seoUnverified/.test(hub) && /t\.rowWp\.seoBridgeRequired/.test(hub))
    const he = read('../../../lib/i18n/dashboard/he.ts'); const en = read('../../../lib/i18n/dashboard/en.ts')
    check('SEO warning messages localized (he + en)', /seoBridgeRequired:/.test(he) && /seoNotVerified:/.test(he) && /seoBridgeRequired:/.test(en) && /seoNotVerified:/.test(en))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
