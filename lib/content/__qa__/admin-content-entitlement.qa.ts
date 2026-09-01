/**
 * Production bug — an administrator was refused content generation with
 * `billing_required`.
 *
 * ROOT CAUSE. lib/content/entitlement-guard.ts's
 * assertContentGenerationAllowedForUser() — the gate EVERY AI-generation
 * action funnels through (article body, featured/inline image, topic-title
 * suggestion, the recommendation engine, keyword research) — called
 * resolveShopifyGovernedEntitlement() directly with no administrator check,
 * even though lib/subscription.ts's getUserEntitlement() and hasAccess() both
 * let a verified admin through BEFORE any billing resolution, and
 * app/api/shopify/billing/start-intent keeps admins away from Shopify billing
 * entirely. An admin account that happened to carry a Shopify connection with
 * no verified plan therefore hit `shopify_billing_required` here while the
 * rest of the app treated the same account as fully entitled.
 *
 * FIX. The gate now resolves the administrator role first, through the single
 * shared lib/auth/admin-role.ts helper, which reads profiles.role with the
 * service-role client and can never be asserted by request input.
 *
 * Run: npx tsx lib/content/__qa__/admin-content-entitlement.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { isAdminUser } from '../../auth/admin-role'
import { assertContentGenerationAllowedForUser, assertContentGenerationAllowedForProject } from '../entitlement-guard'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const SHOP = 'admin-store.myshopify.com'

/** A connected Shopify row with NO verified plan — the exact production shape. */
/**
 * Shopify authority is now a DURABLE record, not an inference from a
 * connection row (lib/billing/governance.ts). These fixtures therefore declare
 * it explicitly — otherwise the account is website-governed and the Shopify
 * billing question never arises at all.
 */
const shopifyGoverned = (userId: string) => ({
  user_id: userId, signup_origin: 'shopify_app_store', billing_authority: 'shopify',
  authority_reason: 'shopify_app_store_install', authority_changed_at: null,
})

const unbilledConnection = (userId: string, over: Record<string, unknown> = {}) => ({
  id: `conn-${userId}`, user_id: userId, project_id: `proj-${userId}`, shop_domain: SHOP,
  connection_status: 'connected', archived_at: null, granted_scopes: ['read_products', 'read_content', 'write_content'],
  shopify_plan_handle: null, shopify_subscription_status: null,
  shopify_current_period_end: null, shopify_current_period_start: null,
  shopify_billing_verified_at: null, shop_gid: 'gid://shopify/Shop/1',
  updated_at: '2026-09-01T00:00:00Z', ...over,
})

async function main() {
  console.log('Admin entitlement during content generation — QA\n')

  console.log('1) An ADMIN is allowed through, whatever the Shopify state')
  {
    const cases: [string, Record<string, unknown>[]][] = [
      ['no Shopify connection at all', []],
      ['a CONNECTED Shopify row with no verified plan', [unbilledConnection('admin-1')]],
      ['a FAILED Shopify connection', [unbilledConnection('admin-1', { connection_status: 'failed', last_error: 'invalid_token' })]],
      ['an app_uninstalled tombstone', [unbilledConnection('admin-1', { connection_status: 'failed', last_error: 'app_uninstalled', granted_scopes: [] })]],
      ['an ARCHIVED connection', [unbilledConnection('admin-1', { archived_at: '2026-08-01T00:00:00Z' })]],
    ]
    for (const [label, connections] of cases) {
      const admin = new FakeAdmin({
        profiles: [{ id: 'admin-1', role: 'admin' }],
        billing_governance: [shopifyGoverned('admin-1')],
        shopify_connections: connections,
        shopify_billing_migrations: [],
      })
      const r = await assertContentGenerationAllowedForUser(admin as never, 'admin-1')
      check(`1: admin with ${label} → allowed`, r.allowed === true)
    }
  }

  console.log('\n2) NEGATIVE CONTROL — the pre-fix gate denied exactly these cases')
  {
    // The pre-fix implementation, reproduced verbatim: no role check at all.
    const { resolveShopifyGovernedEntitlement } = await import('../../shopify/entitlement-resolver')
    const preFix = async (adminClient: unknown, userId: string) => {
      const r = await resolveShopifyGovernedEntitlement(adminClient as never, userId)
      const governed = r.kind === 'governed' ? r.entitlement : null
      return governed && governed.planCode === null ? { allowed: false } : { allowed: true }
    }
    const admin = new FakeAdmin({
      profiles: [{ id: 'admin-1', role: 'admin' }],
      billing_governance: [shopifyGoverned('admin-1')],
      shopify_connections: [unbilledConnection('admin-1')],
      shopify_billing_migrations: [],
    })
    const before = await preFix(admin, 'admin-1')
    check('2a: pre-fix, the admin was DENIED (the production bug)', before.allowed === false)
    const after = await assertContentGenerationAllowedForUser(admin as never, 'admin-1')
    check('2b: post-fix, the same admin is allowed', after.allowed === true)
  }

  console.log('\n3) A NON-admin cannot obtain the bypass')
  {
    for (const [label, role] of [
      ['role "user"', 'user'],
      ['role "editor"', 'editor'],
      ['role "Admin" (wrong case)', 'Admin'],
      ['role "admin " (trailing space)', 'admin '],
      ['no role value', null],
    ] as [string, string | null][]) {
      const admin = new FakeAdmin({
        profiles: [{ id: 'u-1', role }],
        billing_governance: [shopifyGoverned('u-1')],
        shopify_connections: [unbilledConnection('u-1')],
        shopify_billing_migrations: [],
      })
      const r = await assertContentGenerationAllowedForUser(admin as never, 'u-1')
      check(`3: ${label} → still denied (shopify_billing_required)`,
        r.allowed === false && r.reason === 'shopify_billing_required')
    }
    const noProfile = new FakeAdmin({
      profiles: [], billing_governance: [shopifyGoverned('ghost')],
      shopify_connections: [unbilledConnection('ghost')], shopify_billing_migrations: [],
    })
    const r = await assertContentGenerationAllowedForUser(noProfile as never, 'ghost')
    check('3f: a user with NO profile row is not an admin (fails closed)', r.allowed === false)
    check('3g: isAdminUser itself fails closed on a missing profile',
      await isAdminUser(noProfile as never, 'ghost') === false)
    check('3h: and on an empty user id', await isAdminUser(noProfile as never, '') === false)
  }

  console.log('\n4) A non-Shopify user is unaffected (behaviour preserved)')
  {
    const admin = new FakeAdmin({ profiles: [{ id: 'web-1', role: 'user' }], shopify_connections: [], shopify_billing_migrations: [] })
    const r = await assertContentGenerationAllowedForUser(admin as never, 'web-1')
    check('4a: website-only user with no Shopify row → allowed, exactly as before', r.allowed === true)
  }

  console.log('\n5) The project-scoped entry point inherits the same rule')
  {
    const admin = new FakeAdmin({
      profiles: [{ id: 'admin-1', role: 'admin' }],
      billing_governance: [shopifyGoverned('admin-1')],
      projects: [{ id: 'p-1', user_id: 'admin-1' }],
      shopify_connections: [unbilledConnection('admin-1')],
      shopify_billing_migrations: [],
    })
    const r = await assertContentGenerationAllowedForProject(admin as never, 'p-1')
    check('5a: assertContentGenerationAllowedForProject resolves the owner and allows the admin', r.allowed === true)

    const nonAdmin = new FakeAdmin({
      profiles: [{ id: 'u-1', role: 'user' }],
      billing_governance: [shopifyGoverned('u-1')],
      projects: [{ id: 'p-2', user_id: 'u-1' }],
      shopify_connections: [unbilledConnection('u-1')],
      shopify_billing_migrations: [],
    })
    const r2 = await assertContentGenerationAllowedForProject(nonAdmin as never, 'p-2')
    check('5b: a non-admin owner is still denied through the same entry point', r2.allowed === false)
  }

  console.log('\n6) Source contracts — one shared role check, never client input')
  {
    const guard = strip(read('lib/content/entitlement-guard.ts'))
    const helper = strip(read('lib/auth/admin-role.ts'))
    const adminIdx = guard.indexOf('await isAdminUser(admin, userId)')
    const governedIdx = guard.indexOf('resolveShopifyGovernedEntitlement(admin, userId)')
    check('6a: the gate imports the SHARED role helper',
      /import \{ isAdminUser \} from '@\/lib\/auth\/admin-role'/.test(guard))
    check('6b: the admin check runs BEFORE Shopify governance is resolved',
      adminIdx !== -1 && governedIdx !== -1 && adminIdx < governedIdx)
    check('6c: the role comes from profiles.role via the service-role client',
      /from\('profiles'\)\.select\('role'\)/.test(helper))
    check('6d: it is compared against one exact constant, no case folding',
      /=== ADMIN_ROLE/.test(helper) && /ADMIN_ROLE = 'admin'/.test(helper))
    check('6e: the helper reads NOTHING from a request',
      !/request|headers|searchParams|body|cookie/i.test(helper))
    check('6f: no route can pass an is-admin claim into the gate',
      !/isAdmin\s*[:?]/.test(guard) && !/opts\.\w*admin/i.test(guard))
    const startIntent = strip(read('app/api/shopify/billing/start-intent/route.ts'))
    check('6g: the billing route reuses the same helper rather than a 2nd copy',
      /import \{ isAdminUser \} from '@\/lib\/auth\/admin-role'/.test(startIntent)
      && !/profile as \{ role\?: string \}/.test(startIntent))
    check('6h: app-home still resolves admins through that same export',
      /import \{ isAdminUser \}/.test(strip(read('app/api/shopify/app-home/route.ts'))))
  }

  console.log('\n7) PRESERVED — every generation entry point still passes through this gate')
  {
    const callers = [
      'lib/content/article-generation.ts',
      'lib/content/featured-image.ts',
      'lib/content/inline-images.ts',
      'app/api/content/automation/recommendations/route.ts',
      'app/api/content/automation/topic-ideas/improve/route.ts',
      'app/api/content/topic-suggestions/route.ts',
      'app/api/content/articles/[id]/wordpress/route.ts',
      'lib/ai-visibility/keyword-research-auth.ts',
    ]
    for (const rel of callers) {
      const src = strip(read(rel))
      check(`7: ${rel} still calls the shared gate`,
        /assertContentGenerationAllowedFor(User|Project)\(/.test(src))
    }
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
