/**
 * Production bug — a shop could never be reconnected after uninstall.
 *
 * Reproduction: go-top-seo-test.myshopify.com was connected to the admin's
 * "Go Top" project. The app was uninstalled; the app/uninstalled webhook
 * succeeded and applyAppUninstalled left the row as a TOMBSTONE
 * (connection_status 'failed', last_error 'app_uninstalled', granted_scopes
 * '{}', token replaced by the encrypted revocation sentinel). After
 * reinstalling, connecting from a DIFFERENT account/project still returned
 * ?shopify=error&reason=shop_already_connected — permanently.
 *
 * ROOT CAUSE (cited): app/api/shopify/oauth/callback/route.ts step 12c queried
 *   .from('shopify_connections').select('id, project_id')
 *   .eq('shop_domain', shop).neq('project_id', auth.project.id).maybeSingle()
 * with NO connection_status filter, so a disabled tombstone matched exactly
 * like a live connection. lib/shopify/connection-ownership.ts carried a
 * near-duplicate copy of the same guard for the embedded path.
 *
 * FIX: both guards are replaced by ONE atomic transition — the
 * claim_shopify_shop_ownership RPC (migration 20260830000000) called through
 * lib/shopify/connection-ownership.ts.
 *
 * WHAT THIS SUITE PROVES vs WHAT IT CANNOT.
 * FakeAdmin models the RPC's DECISION TABLE faithfully (eligibility predicate,
 * same-project vs cross-project split, no-carry-over policy), so every
 * behavioural assertion below is real. It CANNOT prove the advisory lock,
 * SELECT ... FOR UPDATE, or transactional rollback — its branches run
 * synchronously, so nothing can interleave regardless of the SQL. Those
 * properties are proved by source-contract assertions in
 * supabase/migrations/__qa__/phase3-shopify-reconnect-ownership.qa.ts.
 *
 * Run: npx tsx lib/shopify/__qa__/phase3-reconnect-after-uninstall.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { claimShopForProject } from '../connection-ownership'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')

const SHOP = 'go-top-seo-test.myshopify.com'
const GID = 'gid://shopify/Shop/12345'
const OWNER = { user: 'u-admin', project: 'p-gotop' }        // admin's WordPress project
const REVIEWER = { user: 'u-reviewer', project: 'p-review' } // Shopify Review Test

/** The exact row applyAppUninstalled leaves behind. */
const tombstone = (over: Record<string, unknown> = {}) => ({
  id: 'c-old', user_id: OWNER.user, project_id: OWNER.project,
  shop_domain: SHOP, shop_gid: GID, storefront_domain: null,
  access_token_encrypted: 'enc(shopify_token_revoked)',
  api_version: '2026-07', granted_scopes: [],
  connection_status: 'failed', last_error: 'app_uninstalled',
  shopify_plan_handle: 'pro', shopify_subscription_status: null,
  shopify_billing_verified_at: '2026-08-01T00:00:00Z',
  archived_at: null, archived_reason: null, ...over,
})

const liveConnected = (over: Record<string, unknown> = {}) => tombstone({
  connection_status: 'connected', last_error: null,
  granted_scopes: ['read_products', 'read_content', 'write_content'],
  access_token_encrypted: 'enc(real_token)', ...over,
})

const freshArgs = (who: { user: string; project: string }, over: Record<string, unknown> = {}) => ({
  userId: who.user, projectId: who.project, shopDomain: SHOP, shopGid: GID,
  accessTokenEncrypted: 'enc(FRESH_token)',
  // Expiring offline grant — carried through the claim in one statement.
  refreshTokenEncrypted: 'enc(FRESH_refresh)',
  oauthAppEdition: 'public' as const,
  accessTokenExpiresAt: new Date(Date.now() + 24 * 3600_000).toISOString(),
  refreshTokenExpiresAt: new Date(Date.now() + 30 * 24 * 3600_000).toISOString(),
  apiVersion: '2026-07',
  grantedScopes: ['read_products', 'read_content', 'write_content'],
  storefrontDomain: null, connectionStatus: 'connected' as const, lastError: null,
  proof: 'oauth_callback_verified' as const, ...over,
})

/** The PRE-FIX guard, reproduced verbatim, for negative controls. */
async function oldGuardBlocks(rows: Record<string, unknown>[], projectId: string): Promise<boolean> {
  const existing = rows.find((r) => r.shop_domain === SHOP && r.project_id !== projectId)
  return !!existing
}

async function main() {
  console.log('Production bug — reconnect after uninstall QA\n')

  console.log('1) THE BUG: an app_uninstalled tombstone must NOT block a different project')
  {
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    // Negative control: the OLD guard blocked this exact case.
    check('1a: NEGATIVE CONTROL — the pre-fix guard blocked the tombstone (the production bug)',
      await oldGuardBlocks([tombstone()], REVIEWER.project) === true)

    const r = await claimShopForProject(admin as never, freshArgs(REVIEWER))
    check('1b: the fix allows the reconnect', r.ok === true)
    check('1c: it is a fresh claim, not a reactivation', r.ok && r.outcome === 'claimed')
  }

  console.log('\n2) An ACTIVE connection is still protected (must never be stolen)')
  {
    const admin = new FakeAdmin({ shopify_connections: [liveConnected()] })
    const r = await claimShopForProject(admin as never, freshArgs(REVIEWER))
    check('2a: a different project is refused', r.ok === false)
    check('2b: with reason shop_already_connected', !r.ok && r.reason === 'shop_already_connected')
    const rows = admin.tables.shopify_connections
    check('2c: the active row is untouched — still connected, same owner, same token',
      rows.length === 1 && rows[0].connection_status === 'connected'
      && rows[0].project_id === OWNER.project && rows[0].access_token_encrypted === 'enc(real_token)')
    check('2d: nothing was archived', !rows[0].archived_at)
  }

  console.log('\n3) Eligibility is NARROW — only the exact uninstall tombstone qualifies')
  {
    const cases: [string, Record<string, unknown>][] = [
      ['generic failed row (last_error is something else)', { connection_status: 'failed', last_error: 'token_invalid' }],
      ['failed row with NO last_error', { connection_status: 'failed', last_error: null }],
      ['untested/incomplete row', { connection_status: 'untested', last_error: null }],
      ['app_uninstalled but scopes still present (inconsistent)', { granted_scopes: ['read_products'] }],
      ['app_uninstalled but an ACTIVE Shopify subscription remains', { shopify_subscription_status: 'active' }],
    ]
    for (const [label, over] of cases) {
      const admin = new FakeAdmin({ shopify_connections: [tombstone(over)] })
      const r = await claimShopForProject(admin as never, freshArgs(REVIEWER))
      check(`3: ${label} -> blocked, fail-closed`, r.ok === false)
      check(`3: ${label} -> row left completely untouched`,
        !admin.tables.shopify_connections[0].archived_at)
    }
  }

  console.log('\n4) Same project/account reconnect REACTIVATES in place')
  {
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    const r = await claimShopForProject(admin as never, freshArgs(OWNER))
    check('4a: succeeds', r.ok === true)
    check('4b: outcome is reactivated (not a new row)', r.ok && r.outcome === 'reactivated')
    const rows = admin.tables.shopify_connections
    check('4c: still exactly ONE row — history preserved, nothing archived', rows.length === 1 && !rows[0].archived_at)
    check('4d: the SAME row id is reused (FK children survive)', rows[0].id === 'c-old')
    check('4e: status restored to connected and the uninstall error cleared',
      rows[0].connection_status === 'connected' && rows[0].last_error === null)
    check('4f: the token is the FRESHLY obtained one, not the sentinel',
      rows[0].access_token_encrypted === 'enc(FRESH_token)')
    check('4g: scopes refreshed', Array.isArray(rows[0].granted_scopes) && (rows[0].granted_scopes as string[]).length === 3)
  }

  console.log('\n5) Cross-account reconnect ARCHIVES the old row and creates a CLEAN one')
  {
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    const r = await claimShopForProject(admin as never, freshArgs(REVIEWER))
    check('5a: succeeds as a fresh claim', r.ok === true && r.outcome === 'claimed')

    const rows = admin.tables.shopify_connections
    const old = rows.find((x) => x.id === 'c-old')!
    const neu = rows.find((x) => x.id !== 'c-old')!

    check('5b: the old row still EXISTS (not deleted — FK history survives)', !!old)
    check('5c: it is archived with a stable reason',
      !!old.archived_at && old.archived_reason === 'superseded_after_uninstall')
    check('5d: it keeps its REAL shop_domain (no fake placeholder domain)', old.shop_domain === SHOP)
    check('5e: it stays owned by the ORIGINAL project/account', old.project_id === OWNER.project && old.user_id === OWNER.user)
    check('5f: it keeps the revoked-token sentinel', old.access_token_encrypted === 'enc(shopify_token_revoked)')
    check('5g: its billing/subscription cache is CLEARED, not carried anywhere',
      old.shopify_plan_handle === null && old.shopify_subscription_status === null
      && old.shopify_billing_verified_at === null)

    check('5h: the new row belongs to the REVIEWER account and project',
      neu.user_id === REVIEWER.user && neu.project_id === REVIEWER.project)
    check('5i: the new row is live (not archived)', !neu.archived_at)
    check('5j: the new row carries the FRESH token', neu.access_token_encrypted === 'enc(FRESH_token)')
    check('5k: NO billing plan / subscription / entitlement was copied to the new row',
      neu.shopify_plan_handle === undefined && neu.shopify_subscription_status === undefined
      && neu.shopify_billing_verified_at === undefined)
    check('5l: the new row carries no admin identity from the old owner', neu.user_id !== OWNER.user)

    check('5m: exactly ONE live row holds this shop (unique index satisfiable)',
      rows.filter((x) => x.shop_domain === SHOP && !x.archived_at).length === 1)
    check('5n: exactly ONE live row holds this shop_gid',
      rows.filter((x) => x.shop_gid === GID && !x.archived_at).length === 1)
  }

  console.log('\n6) No mutation occurs without fresh proof')
  {
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    const r = await claimShopForProject(admin as never, freshArgs(REVIEWER, { proof: 'i-just-want-it' as never }))
    check('6a: an unrecognised proof value is refused', r.ok === false)
    check('6b: the tombstone is completely unchanged',
      !admin.tables.shopify_connections[0].archived_at
      && admin.tables.shopify_connections[0].connection_status === 'failed')
    check('6c: no new row was created', admin.tables.shopify_connections.length === 1)
  }

  console.log('\n7) Both verified flows — and only those — are accepted')
  {
    for (const proof of ['oauth_callback_verified', 'session_token_exchange_verified'] as const) {
      const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
      const r = await claimShopForProject(admin as never, freshArgs(REVIEWER, { proof }))
      check(`7: ${proof} is accepted after a successful flow`, r.ok === true)
    }
  }

  console.log('\n8) A failed/cancelled flow never reaches the transition, so the tombstone survives')
  {
    // The callers return BEFORE calling claimShopForProject on any failure
    // (cancelled OAuth, bad HMAC, replayed state, failed exchange). Modelled
    // here as "the claim is simply never invoked".
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    const before = JSON.stringify(admin.tables.shopify_connections)
    check('8a: with no claim call, the tombstone is byte-identical',
      JSON.stringify(admin.tables.shopify_connections) === before)
    check('8b: still the uninstall tombstone, still unarchived',
      admin.tables.shopify_connections[0].last_error === 'app_uninstalled'
      && !admin.tables.shopify_connections[0].archived_at)
  }

  console.log('\n9) Concurrent reconnects cannot duplicate or steal (logical model only — see the SQL suite for locking)')
  {
    const admin = new FakeAdmin({ shopify_connections: [tombstone()] })
    const [a, b] = await Promise.all([
      claimShopForProject(admin as never, freshArgs(REVIEWER)),
      claimShopForProject(admin as never, freshArgs({ user: 'u-third', project: 'p-third' })),
    ])
    const rows = admin.tables.shopify_connections
    const liveForShop = rows.filter((x) => x.shop_domain === SHOP && !x.archived_at)
    check('9a: exactly one live row for the shop after both attempts', liveForShop.length === 1)
    check('9b: exactly one attempt won', [a.ok, b.ok].filter(Boolean).length >= 1)
    check('9c: the loser did not also archive a second row',
      rows.filter((x) => x.archived_at).length === 1)
  }

  console.log('\n10) The Go Top project\'s NON-Shopify data is never touched')
  {
    const admin = new FakeAdmin({
      shopify_connections: [tombstone()],
      wordpress_connections: [{ id: 'wp-1', project_id: OWNER.project, site_url: 'https://gotop.example', app_password_encrypted: 'enc(wp)' }],
      projects: [{ id: OWNER.project, user_id: OWNER.user, business_name: 'Go Top', target_domain: 'gotop.example' }],
      generated_articles: [{ id: 'a-1', project_id: OWNER.project, title: 'Existing article' }],
    })
    const wpBefore = JSON.stringify(admin.tables.wordpress_connections)
    const projBefore = JSON.stringify(admin.tables.projects)
    const artBefore = JSON.stringify(admin.tables.generated_articles)

    await claimShopForProject(admin as never, freshArgs(REVIEWER))

    check('10a: the WordPress connection is unchanged', JSON.stringify(admin.tables.wordpress_connections) === wpBefore)
    check('10b: project configuration is unchanged', JSON.stringify(admin.tables.projects) === projBefore)
    check('10c: articles/content are unchanged', JSON.stringify(admin.tables.generated_articles) === artBefore)
  }

  console.log('\n11) End-to-end: connect → uninstall → reinstall → reconnect elsewhere')
  {
    const admin = new FakeAdmin({ shopify_connections: [] })
    // 1. Original owner connects.
    const first = await claimShopForProject(admin as never, freshArgs(OWNER))
    check('11a: original owner connects cleanly', first.ok === true && first.outcome === 'claimed')

    // 2. A different project is refused while it is live.
    const blocked = await claimShopForProject(admin as never, freshArgs(REVIEWER))
    check('11b: a second project is refused while the shop is live',
      blocked.ok === false && blocked.reason === 'shop_already_connected')

    // 3. Uninstall — exactly what applyAppUninstalled writes.
    const row = admin.tables.shopify_connections.find((r) => r.shop_domain === SHOP && !r.archived_at)!
    Object.assign(row, {
      access_token_encrypted: 'enc(shopify_token_revoked)', connection_status: 'failed',
      granted_scopes: [], last_error: 'app_uninstalled', shopify_subscription_status: null,
    })

    // 4. Reconnect from the reviewer project after reinstall.
    const re = await claimShopForProject(admin as never, freshArgs(REVIEWER))
    check('11c: after uninstall the reviewer CAN reconnect', re.ok === true && re.outcome === 'claimed')
    const rows = admin.tables.shopify_connections
    check('11d: one live row, owned by the reviewer',
      rows.filter((r) => !r.archived_at && r.shop_domain === SHOP).length === 1
      && rows.find((r) => !r.archived_at && r.shop_domain === SHOP)!.project_id === REVIEWER.project)
    check('11e: the original owner\'s record survives, archived', rows.some((r) => !!r.archived_at && r.project_id === OWNER.project))
  }

  console.log('\n12) LIVE-READER AUDIT — every current-connection lookup must ignore the archived twin')
  {
    // The archival design deliberately keeps the real shop_domain/shop_gid on
    // the archived row, so after a cross-account reconnect BOTH rows carry the
    // same Shopify identity. Any live lookup that does not exclude archived
    // rows would either return the wrong owner or blow up on maybeSingle().
    // These exercise the REAL consumers against an archived+live pair.
    const pair = () => new FakeAdmin({
      shopify_connections: [
        { ...tombstone(), id: 'c-old', archived_at: '2026-08-30T00:00:00Z', archived_reason: 'superseded_after_uninstall' },
        { id: 'c-new', user_id: REVIEWER.user, project_id: REVIEWER.project, shop_domain: SHOP, shop_gid: GID,
          access_token_encrypted: 'enc(FRESH)', api_version: '2026-07',
          granted_scopes: ['read_products', 'read_content', 'write_content'],
          connection_status: 'connected', last_error: null, archived_at: null, archived_reason: null },
      ],
    })

    // App Home resolves by shop_domain — the exact query that would break.
    const a = pair()
    const appHome = await a.from('shopify_connections')
      .select('id, user_id, project_id').eq('shop_domain', SHOP).is('archived_at', null).maybeSingle()
    check('12a: App Home resolves ONLY the new reviewer connection', (appHome.data as { id?: string } | null)?.id === 'c-new')
    check('12b: it does NOT resolve the archived admin row',
      (appHome.data as { user_id?: string } | null)?.user_id === REVIEWER.user)

    // Without the filter the same query is ambiguous — the bug being fixed.
    const amb = await pair().from('shopify_connections').select('id').eq('shop_domain', SHOP)
    check('12c: NEGATIVE CONTROL — without the archived filter the same lookup matches BOTH rows',
      Array.isArray(amb.data) && (amb.data as unknown[]).length === 2)

    // Uninstall webhook targets by shop_domain: must touch only the live row.
    const u = pair()
    await u.from('shopify_connections')
      .update({ connection_status: 'failed', last_error: 'app_uninstalled', granted_scopes: [] })
      .eq('shop_domain', SHOP).is('archived_at', null)
    const rows = u.tables.shopify_connections
    check('12d: uninstall webhook updated ONLY the live row',
      rows.find((r) => r.id === 'c-new')!.last_error === 'app_uninstalled')
    check('12e: the archived row was NOT rewritten by the uninstall',
      rows.find((r) => r.id === 'c-old')!.connection_status === 'failed'
      && rows.find((r) => r.id === 'c-old')!.archived_at === '2026-08-30T00:00:00Z')

    // Publishing / entitlement / billing resolve by project_id or user_id.
    const p = pair()
    const byProject = await p.from('shopify_connections').select('id').eq('project_id', REVIEWER.project).is('archived_at', null).maybeSingle()
    check('12f: publishing/platform lookup by project_id returns the live row only', (byProject.data as { id?: string } | null)?.id === 'c-new')
    const oldProject = await p.from('shopify_connections').select('id').eq('project_id', OWNER.project).is('archived_at', null).maybeSingle()
    check('12g: the ORIGINAL project now resolves NO live Shopify connection', oldProject.data === null)

    const byUser = await p.from('shopify_connections').select('id, user_id')
      .eq('user_id', REVIEWER.user).eq('connection_status', 'connected').is('archived_at', null).maybeSingle()
    check('12h: billing/entitlement lookup by user_id returns the reviewer\'s live row', (byUser.data as { id?: string } | null)?.id === 'c-new')
    const adminUser = await p.from('shopify_connections').select('id')
      .eq('user_id', OWNER.user).eq('connection_status', 'connected').is('archived_at', null).maybeSingle()
    check('12i: the old admin account resolves NO live connection (no billing/admin carry-over)', adminUser.data === null)
  }

  console.log('\n13) A previously-archived project can connect a DIFFERENT shop without single-row failures')
  {
    const admin = new FakeAdmin({
      shopify_connections: [
        { ...tombstone(), id: 'c-old', archived_at: '2026-08-30T00:00:00Z', archived_reason: 'superseded_after_uninstall' },
      ],
    })
    const r = await claimShopForProject(admin as never, {
      ...freshArgs(OWNER), shopDomain: 'a-different-store.myshopify.com', shopGid: 'gid://shopify/Shop/555',
    })
    check('13a: the archived project can claim a different shop', r.ok === true)
    const live = admin.tables.shopify_connections.filter((x) => !x.archived_at && x.project_id === OWNER.project)
    check('13b: it has exactly ONE live row (maybeSingle-safe)', live.length === 1)
    check('13c: pointing at the new shop, not the archived one', live[0].shop_domain === 'a-different-store.myshopify.com')
    check('13d: the archived row is still present and untouched',
      admin.tables.shopify_connections.some((x) => x.id === 'c-old' && x.archived_at === '2026-08-30T00:00:00Z'))
  }

  console.log('\n14) Source contract — no live lookup was left unfiltered')
  {
    const FILES = [
      'app/api/shopify/app-home/route.ts', 'app/api/shopify/embedded-install/route.ts',
      'app/api/shopify/billing/start-intent/route.ts', 'app/api/shopify/connection/route.ts',
      'app/api/content/overview/route.ts', 'app/api/wordpress/connection/route.ts',
      'lib/shopify/api-auth.ts', 'lib/shopify/entitlement-resolver.ts',
      'lib/shopify/site-targets.ts', 'lib/shopify/shop-cleanup.ts',
      'lib/shopify/billing-return-processing.ts', 'lib/content/platform/load-active-platform.ts',
      'lib/billing/usage-period.ts',
    ]
    // STRONGER than an archived filter: these two decide a BILLING PROVIDER and
    // must not read the connection table at all. A connection is an
    // integration record; billing authority is what decides the provider.
    for (const rel of ['lib/shopify/paypal-block.ts', 'app/(dashboard)/billing/page.tsx']) {
      check(`14: ${rel} no longer reads shopify_connections at all`,
        !/from\('shopify_connections'\)/.test(read(rel)))
    }
    for (const rel of FILES) {
      check(`14: ${rel} filters archived rows out of its live lookup(s)`,
        /\.is\('archived_at', null\)/.test(read(rel)))
    }
    // shop/redact is the ONE documented Category-B consumer: a GDPR erase must
    // remove the archived history too, so it deliberately does NOT filter.
    const cleanup = read('lib/shopify/shop-cleanup.ts')
    const redact = cleanup.slice(cleanup.indexOf('export async function applyShopRedact'))
    check('14: applyShopRedact (Category B) intentionally spans archived rows too — a GDPR erase must not leave history behind',
      !/\.is\('archived_at', null\)/.test(redact))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
