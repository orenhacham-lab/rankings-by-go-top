/**
 * Phase 2 (Shopify App Pricing) — source-contract tests. These assert
 * properties about the SOURCE CODE itself (not runtime behavior) that are
 * exactly the kind of invariant a future edit could silently break: "there
 * is no direct Shopify publish path that bypasses the guard," "no billing
 * webhook / appSubscriptionCreate was ever introduced," "the reviewer
 * account is never special-cased." Run:
 *   npx tsx lib/shopify/__qa__/phase2-source-contracts.qa.ts
 */
import { readFileSync, readdirSync, statSync } from 'fs'
import { join } from 'path'
import { isSupportedShopifyPlanHandle } from '../constants'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

/** Recursively list every .ts/.tsx file under a repo-relative dir, excluding __qa__/__tests__/node_modules. */
function listSourceFiles(relDir: string): string[] {
  const abs = join(ROOT, relDir)
  const out: string[] = []
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (entry === 'node_modules' || entry === '__qa__' || entry === '__tests__' || entry === '.next') continue
      const full = join(dir, entry)
      const st = statSync(full)
      if (st.isDirectory()) walk(full)
      else if (/\.(ts|tsx)$/.test(entry)) out.push(full)
    }
  }
  walk(abs)
  return out
}

async function main() {
  console.log('Phase 2 — Shopify App Pricing source-contract QA\n')

  console.log('1) publishArticleToShopify is the ONLY caller of shopifyArticleCreate/shopifyArticleUpdate')
  {
    const files = [...listSourceFiles('app'), ...listSourceFiles('lib')]
    const callers: string[] = []
    for (const f of files) {
      const rel = f.slice(ROOT.length + 1)
      if (rel === 'lib/shopify/client.ts') continue // the definitions themselves
      const src = strip(read(rel))
      if (/\bshopifyArticleCreate\s*\(/.test(src) || /\bshopifyArticleUpdate\s*\(/.test(src)) callers.push(rel)
    }
    check('exactly one caller: lib/shopify/publish-article.ts (no other direct publish path exists)',
      callers.length === 1 && callers[0] === 'lib/shopify/publish-article.ts', `found: ${callers.join(', ')}`)
  }

  console.log('\n2) the central billing guard runs FIRST inside publishArticleToShopify — before write_content, before any mutation')
  {
    const src = strip(read('lib/shopify/publish-article.ts'))
    const guardIdx = src.indexOf('checkShopifyPublishEntitlement(admin, connection)')
    const writeContentIdx = src.indexOf('hasWriteContent(connection.granted_scopes)')
    const createIdx = src.indexOf('shopifyArticleCreate(')
    const updateIdx = src.indexOf('shopifyArticleUpdate(')
    check('guard call is present', guardIdx !== -1)
    check('guard runs before the write_content scope check', guardIdx !== -1 && writeContentIdx !== -1 && guardIdx < writeContentIdx)
    check('guard runs before the create mutation', guardIdx !== -1 && createIdx !== -1 && guardIdx < createIdx)
    check('guard runs before the update mutation', guardIdx !== -1 && updateIdx !== -1 && guardIdx < updateIdx)
    check('a denial returns ok:false without reaching either mutation',
      /if \(!entitlement\.ok\) \{[\s\S]{0,300}return \{ ok: false, reason: 'billing_not_entitled'/.test(src))
  }

  console.log('\n3) appSubscriptionCreate is never used anywhere in the codebase (Partner API activeSubscription is read-only)')
  {
    const files = [...listSourceFiles('app'), ...listSourceFiles('lib')]
    const hits = files.filter((f) => /appSubscriptionCreate/.test(strip(read(f.slice(ROOT.length + 1)))))
    check('zero references outside comments explaining that it is deliberately never used', hits.length === 0, hits.join(', '))
  }

  console.log('\n4) no Shopify App Subscription billing webhook topic was ever subscribed')
  {
    const webhooksRoute = read('app/api/shopify/webhooks/route.ts')
    check('no APP_SUBSCRIPTIONS_* topic handling in the webhooks route',
      !/APP_SUBSCRIPTIONS_(UPDATE|CREATE)/.test(webhooksRoute) && !/app_subscriptions\/(update|create)/.test(webhooksRoute))
  }

  console.log('\n5) SHOPIFY_PARTNER_API_ACCESS_TOKEN is read ONLY in lib/shopify/partner-client.ts (never client-exposed, never re-read elsewhere)')
  {
    const files = [...listSourceFiles('app'), ...listSourceFiles('lib')]
    const referencers = files
      .map((f) => f.slice(ROOT.length + 1))
      .filter((rel) => /SHOPIFY_PARTNER_API_ACCESS_TOKEN/.test(read(rel)))
    check('exactly one source file references the token env var', referencers.length === 1 && referencers[0] === 'lib/shopify/partner-client.ts', referencers.join(', '))
  }

  console.log('\n6) the required Shopify plan handles are exact — obsolete free-plan / shopify-test are never valid entitlement')
  {
    check('regular/advanced/premium/large-agency are supported',
      isSupportedShopifyPlanHandle('regular') && isSupportedShopifyPlanHandle('advanced') && isSupportedShopifyPlanHandle('premium') && isSupportedShopifyPlanHandle('large-agency'))
    check('the obsolete public "free-plan" is NOT supported', !isSupportedShopifyPlanHandle('free-plan'))
    check('the obsolete private "shopify-test" is NOT supported', !isSupportedShopifyPlanHandle('shopify-test'))
    check('an arbitrary/unknown handle is NOT supported', !isSupportedShopifyPlanHandle('enterprise-custom'))
  }

  console.log('\n7) no reviewer-account exception was hardcoded anywhere in the source tree')
  {
    // Swept dynamically (not a manually maintained list) so it can never
    // silently miss a new Phase 2 file.
    // Comments legitimately explain THIS check's own rationale by naming the
    // reviewer account (e.g. "closes the shopify@gotop.co.il bypass gap") —
    // strip comments first so that prose doesn't false-positive as a
    // hardcoded exception in executable code.
    const files = [...listSourceFiles('app'), ...listSourceFiles('lib')]
    const hits = files.filter((f) => /shopify@gotop\.co\.il/i.test(strip(read(f.slice(ROOT.length + 1)))))
    check('zero hardcoded references to the reviewer email in executable code anywhere in app/ or lib/', hits.length === 0, hits.join(', '))
  }

  console.log('\n8) the shop_domain unique index has NO status-scoped WHERE clause — one canonical owner regardless of connection_status')
  {
    const migration = read('supabase/migrations/20260828_add_shopify_app_pricing.sql')
    check('shopify_connections_shop_domain_unique index exists and is unconditional (no WHERE)',
      /CREATE UNIQUE INDEX IF NOT EXISTS shopify_connections_shop_domain_unique\s*\n\s*ON public\.shopify_connections \(shop_domain\);/.test(migration))
    check('preflight RAISE EXCEPTION precedes the shop_domain unique index (never silently overwrites a conflict)',
      /RAISE EXCEPTION[\s\S]{0,500}shopify_connections_shop_domain_unique/.test(migration))
    check('no executable UPDATE/DELETE/MERGE statement anywhere in the migration',
      !/\bUPDATE\s+\S+\s+SET\b/i.test(migration) && !/\bDELETE\s+FROM\b/i.test(migration) && !/\bMERGE\s+INTO\b/i.test(migration))
  }

  console.log('\n9) the OAuth callback rejects a shop already claimed by a DIFFERENT project BEFORE writing the connection')
  {
    const src = strip(read('app/api/shopify/oauth/callback/route.ts'))
    const domainCheckIdx = src.indexOf("shop_already_connected")
    const upsertIdx = src.indexOf(".from('shopify_connections').upsert(")
    check('a shop_already_connected rejection path exists', domainCheckIdx !== -1)
    check('the ownership pre-check runs before the upsert write', domainCheckIdx !== -1 && upsertIdx !== -1 && domainCheckIdx < upsertIdx)
    check('a race-condition (unique-violation code 23505) is also mapped to the same clear reason, never a raw DB error',
      /code === '23505'[\s\S]{0,40}shop_already_connected/.test(src))
  }

  console.log('\n10) the embedded connector-home API route trusts ONLY the verified session token for shop identity — never a query param')
  {
    const src = strip(read('app/api/shopify/app-home/route.ts'))
    check('verifies the Authorization bearer session token', /verifyShopifySessionToken\(token\)/.test(src))
    check('the shop domain used for every DB lookup comes from the VERIFIED token result, not request.url/searchParams', /verified\.shopDomain/.test(src) && !/searchParams\.get\(.shop.\)/.test(src))
  }

  console.log('\n11) PayPal checkout (activate) is blocked server-side for an actively connected Shopify merchant, independent of the client')
  {
    const src = strip(read('app/api/paypal/activate/route.ts'))
    const blockIdx = src.indexOf('isShopifyBillingRequiredForUser(admin, user.id)')
    const verifyIdx = src.indexOf('verifyPayPalActivation(')
    check('the Shopify-connection block check exists', blockIdx !== -1)
    check('it runs before PayPal verification/any entitlement write', blockIdx !== -1 && verifyIdx !== -1 && blockIdx < verifyIdx)
    check('the decision never references UTM/referrer/signup-source', !/utm_|referrer|signup.?source/i.test(src))
  }

  console.log('\n12) the billing-return processing loads the connection ONLY via the intent\'s own connection_id — never by the shop query param')
  {
    const src = strip(read('lib/shopify/billing-return-processing.ts'))
    check('the connection lookup is keyed by intent.connection_id', /\.eq\('id', intent\.connection_id\)/.test(src))
    check('`shop` is read only as args.suppliedShopRaw and never used in a .eq()/.from() lookup', !/\.eq\([^)]*suppliedShop/.test(src))
    const consumeIdx = src.indexOf('consumeBillingIntent(')
    const cacheIdx = src.indexOf('recordShopifyBillingCache(')
    const migrateIdx = src.indexOf('confirmShopifyActiveAndAdvance(')
    check('the intent is consumed BEFORE any cache write', consumeIdx !== -1 && cacheIdx !== -1 && consumeIdx < cacheIdx)
    check('the intent is consumed BEFORE the migration is ever advanced', consumeIdx !== -1 && migrateIdx !== -1 && consumeIdx < migrateIdx)
  }

  console.log('\n13) Blocker C (resolved) — only the gid://shopify/App/... Partner app-ID GID namespace is accepted; gid://partners/App/... is no longer accepted anywhere in production source')
  {
    const src = strip(read('lib/shopify/partner-client.ts'))
    check('PARTNER_APP_GID_PATTERN matches ONLY the gid://shopify/App/... namespace', /PARTNER_APP_GID_PATTERN = \/\^gid:\\\/\\\/shopify\\\/App\\\/\\d\+\$\//.test(src))
    check('the pattern no longer accepts gid://partners/App/...', !/\(partners\|shopify\)/.test(src))

    const files = [...listSourceFiles('app'), ...listSourceFiles('lib')]
    const stillAccepting = files
      .map((f) => f.slice(ROOT.length + 1))
      .filter((rel) => {
        // Excludes the confirmation comment in partner-client.ts itself, which
        // documents the REJECTED namespace, not accepts it.
        if (rel === 'lib/shopify/partner-client.ts') return false
        return /gid:\/\/partners\/App\//.test(strip(read(rel)))
      })
    check('no other production file references the rejected gid://partners/App/... namespace', stillAccepting.length === 0, stillAccepting.join(', '))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
