/**
 * The scheduled Shopify publish path hardcoded `authorName: null`, which
 * Shopify's ArticleCreateInput rejects (author is required, non-null) —
 * `shopify_exact_failure — ... author (Expected value to not be null)`. The
 * manual publish route resolved the project's business_name instead — but
 * ALSO fell through to a literal null when business_name was blank, the same
 * latent gap one call site over. Both paths now resolve business_name first,
 * falling back to a cleaned shop domain, so NEITHER can ever send null.
 * No network, no DB. Run: npx tsx lib/shopify/__qa__/never-null-author.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { authorNameFromShopDomain } from '../article-payload'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

function main() {
  console.log('Scheduled Shopify publish — non-null author\n')

  // ── A) authorNameFromShopDomain — pure fallback behavior ────────────────────
  console.log('A) authorNameFromShopDomain')
  {
    check('A1. strips the .myshopify.com suffix', authorNameFromShopDomain('my-shop.myshopify.com') === 'my-shop')
    check('A2. strips an https:// prefix too', authorNameFromShopDomain('https://my-shop.myshopify.com') === 'my-shop')
    check('A3. strips a trailing slash', authorNameFromShopDomain('https://my-shop.myshopify.com/') === 'my-shop')
    check('A4. a plain host with no suffix is left as-is', authorNameFromShopDomain('my-shop.example.com') === 'my-shop.example.com')
    check('A5. never returns null/undefined for a real domain', typeof authorNameFromShopDomain('acme.myshopify.com') === 'string')
    check('A6. whitespace is trimmed', authorNameFromShopDomain('  acme.myshopify.com  ') === 'acme')
  }

  // ── B) the scheduled path no longer hardcodes null ──────────────────────────
  console.log('\nB) publish-item-shopify.ts resolves a real author')
  {
    const src = read('lib/content/automation/publish-item-shopify.ts')
    check('B1. the old hardcoded null is GONE', !/authorName:\s*null/.test(src))
    check('B2. it loads the project\'s business_name', /\.from\('projects'\)\.select\('business_name'\)\.eq\('id',\s*item\.project_id\)/.test(src))
    check('B3. it falls back to authorNameFromShopDomain (never null)', /authorNameFromShopDomain\(loaded\.connection\.shop_domain\)/.test(src))
    check('B4. the resolved variable (shorthand `authorName`) is what gets passed to publishArticleToShopify, not a literal',
      /publishArticleToShopify\(admin, loaded\.connection, loaded\.creds, article, \{ published: true, authorName \}\)/.test(src))
    check('B5. the helper is imported from the pure payload module', /import \{ authorNameFromShopDomain \} from '@\/lib\/shopify\/article-payload'/.test(src))
  }

  // ── C) exhaustive: no OTHER call site can pass a null/empty author ──────────
  console.log('\nC) publishArticleToShopify has exactly the two known callers')
  {
    // Grep the whole tree the same way the investigation did — if a third
    // caller appears (e.g. a future bulk-republish script), this fails loudly
    // instead of silently missing it.
    const { execSync } = require('child_process') as typeof import('child_process')
    const grepOut = execSync(
      `grep -rn "publishArticleToShopify(" --include="*.ts" --include="*.tsx" lib app 2>/dev/null | grep -v __qa__ | grep -v "export async function publishArticleToShopify"`,
      { cwd: ROOT, encoding: 'utf8' },
    )
    const callSites = grepOut.trim().split('\n').filter(Boolean)
    check('C1. exactly two call sites exist (manual route + scheduled path)', callSites.length === 2, `found ${callSites.length}: ${callSites.join(' | ')}`)
    check('C2. one is the manual publish route', callSites.some((l) => l.includes('app/api/content/articles/[id]/shopify/route.ts')))
    check('C3. the other is the scheduled path this fix touches', callSites.some((l) => l.includes('lib/content/automation/publish-item-shopify.ts')))
  }

  // ── D) the manual route's OWN latent gap — now closed too ───────────────────
  // Same underlying dependency, one call site over: a business_name-less
  // project could still hit the null-author Shopify error via the MANUAL
  // route. Fixed in the same commit as the scheduled path.
  console.log('\nD) the manual route also never sends null now')
  {
    const manualSrc = read('app/api/content/articles/[id]/shopify/route.ts')
    check('D1. the old "authorName: string | null = null" literal-null default is GONE',
      !/authorName:\s*string\s*\|\s*null\s*=\s*null/.test(manualSrc))
    check('D2. the old "bn ? String(bn) : null" fallthrough-to-null is GONE',
      !/authorName = bn \? String\(bn\) : null/.test(manualSrc))
    check('D3. it now defaults to the SAME domain-derived fallback before the business_name lookup',
      /let authorName: string = authorNameFromShopDomain\(loaded\.connection\.shop_domain\)/.test(manualSrc))
    check('D4. business_name (when present) still overrides the fallback',
      /if \(bn\) authorName = bn/.test(manualSrc))
    check('D5. the helper is imported here too', /import \{ authorNameFromShopDomain \} from '@\/lib\/shopify\/article-payload'/.test(manualSrc))
  }

  // ── E) the known UX gap on a maxed-out retry — LOGGED, not fixed ────────────
  // Clicking "פרסם עכשיו" on an item that already exhausted AUTOMATION_MAX_ATTEMPTS
  // silently no-ops (noop:'max_attempts', no `reason`), and the UI falls back to
  // displaying the bare word "failed" — indistinguishable from a genuine second
  // failure. Out of scope for this fix; pinned here so it isn't lost.
  console.log('\nE) the max_attempts noop UX gap is documented in both publish paths')
  {
    const shopifySrc = read('lib/content/automation/publish-item-shopify.ts')
    const wpSrc = read('lib/content/automation/publish-item.ts')
    check('E1. logged in the Shopify path', /KNOWN UX GAP/.test(shopifySrc))
    check('E2. logged in the WordPress path', /KNOWN UX GAP/.test(wpSrc))
    check('E3. the noop itself is UNCHANGED (still carries no `reason` field) — confirms this is observation, not a fix',
      /return \{ itemId: item\.id, status: item\.status, articleId, noop: 'max_attempts' \}/.test(shopifySrc)
      && /return \{ itemId, status: item\.status, articleId: article\.id, noop: 'max_attempts' \}/.test(wpSrc))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
