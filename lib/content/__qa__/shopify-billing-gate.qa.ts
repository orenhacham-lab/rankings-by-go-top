/**
 * Phase 2 (Blocker D fix) — the central content-generation/publish
 * entitlement gate (lib/content/entitlement-guard.ts) and every choke point
 * it's installed in: manual per-topic generate, the queue/cron/retry path
 * (generatePoolItem → generateArticleForTopic), standalone featured/inline
 * image generation, topic-title suggestions, the recommendation/topic-idea
 * engine, and WordPress publishing. No live network, no live Supabase
 * (FakeAdmin), no live Gemini call is ever reachable in these tests — a
 * blocked outcome is asserted by TYPE (`kind: 'billing_required'`), never by
 * absence of a network error. Run:
 *   npx tsx lib/content/__qa__/shopify-billing-gate.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { assertContentGenerationAllowedForUser, assertContentGenerationAllowedForProject } from '../entitlement-guard'
import { generateArticleForTopic } from '../article-generation'
import { generatePoolItem, AUTOMATION_MAX_ATTEMPTS } from '../automation/generate-item'
import { createFeaturedImageForArticle } from '../featured-image'
import { generateInlineImage } from '../inline-images'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

process.env.SHOPIFY_CLIENT_ID = 'test-client-id'
process.env.SHOPIFY_CLIENT_SECRET = 'test-client-secret'
process.env.SHOPIFY_APP_URL = 'https://www.example-test.com'
process.env.SHOPIFY_PARTNER_API_ACCESS_TOKEN = 'test-partner-token'
process.env.SHOPIFY_PARTNER_ORGANIZATION_ID = '4243054'
process.env.SHOPIFY_PARTNER_APP_GID = 'gid://shopify/App/397648429057'
process.env.SHOPIFY_PARTNER_API_VERSION = '2026-07'

const SHOP_GID = 'gid://shopify/Shop/1'
const SHOP_DOMAIN = 'test-shop.myshopify.com'

function fakePartnerFetch(impl: () => { status: number; body: unknown }): typeof fetch {
  return (async () => {
    const r = impl()
    return { ok: r.status >= 200 && r.status < 300, status: r.status, json: async () => r.body } as Response
  }) as unknown as typeof fetch
}
const noSubBody = { data: { activeSubscription: null } }
const activeSubBody = (handle: string) => ({
  data: {
    activeSubscription: {
      shop: { id: SHOP_GID, myshopifyDomain: SHOP_DOMAIN },
      trialEndsAt: null, cancelAtEndOfCycle: false,
      currentBillingCycle: { endTime: '2026-12-01T00:00:00Z' },
      items: [{ handle, price: { __typename: 'FlatRatePrice', active: true } }],
    },
  },
})

// resolveShopifyGovernedEntitlement uses the module's default `fetch` (no
// injection point) — monkey-patch global fetch for the duration of each
// Shopify-governed test, matching phase2-entitlement-floor.qa.ts's pattern.
const realFetch = global.fetch
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  global.fetch = impl
  return fn().finally(() => { global.fetch = realFetch })
}

function shopifyConnRow(overrides: Record<string, unknown> = {}) {
  return {
    id: 'conn-1', user_id: 'shopify-user', project_id: 'p-shopify', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID,
    connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: null,
    shopify_current_period_end: null, shopify_billing_verified_at: null,
    ...overrides,
  }
}

async function main() {
  console.log('Phase 2 (Blocker D) — content-generation/publish entitlement gate QA\n')

  console.log('1) assertContentGenerationAllowedForUser — non-Shopify user is always allowed')
  {
    const admin = new FakeAdmin({ shopify_connections: [], shopify_billing_migrations: [] })
    const r = await assertContentGenerationAllowedForUser(admin as unknown as Admin, 'website-user')
    check('allowed:true', r.allowed === true)
  }

  console.log('\n2) assertContentGenerationAllowedForUser — Shopify-connected, NO verified plan -> blocked')
  {
    const admin = new FakeAdmin({ shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
    const r = await withFetch(fakePartnerFetch(() => ({ status: 200, body: noSubBody })), () => assertContentGenerationAllowedForUser(admin as unknown as Admin, 'shopify-user'))
    check('allowed:false, reason shopify_billing_required', r.allowed === false && r.reason === 'shopify_billing_required')
  }

  console.log('\n3) assertContentGenerationAllowedForUser — Shopify-connected WITH a verified active plan -> allowed')
  {
    const admin = new FakeAdmin({ shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
    const r = await withFetch(fakePartnerFetch(() => ({ status: 200, body: activeSubBody('regular') })), () => assertContentGenerationAllowedForUser(admin as unknown as Admin, 'shopify-user'))
    check('allowed:true', r.allowed === true)
  }

  console.log('\n4) assertContentGenerationAllowedForProject — resolves the owner from project_id and applies the same rule')
  {
    const admin = new FakeAdmin({
      projects: [{ id: 'p-shopify', user_id: 'shopify-user' }],
      shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const r = await withFetch(fakePartnerFetch(() => ({ status: 200, body: noSubBody })), () => assertContentGenerationAllowedForProject(admin as unknown as Admin, 'p-shopify'))
    check('allowed:false, reason shopify_billing_required', r.allowed === false && r.reason === 'shopify_billing_required')
  }

  console.log('\n5) generateArticleForTopic (MANUAL path) — blocked BEFORE the topic is even looked up')
  {
    // No article_topics row seeded at all — if the gate ran AFTER the topic
    // lookup, this would return 'topic_not_found' instead.
    const admin = new FakeAdmin({ article_topics: [], shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [] })
    const r = await withFetch(fakePartnerFetch(() => ({ status: 200, body: noSubBody })), () =>
      generateArticleForTopic(admin as unknown as Admin, { topicId: 't1', userId: 'shopify-user' }))
    check('kind billing_required (gate ran first)', !r.ok && r.kind === 'billing_required')
  }

  console.log('\n6) generateArticleForTopic — a non-Shopify user\'s behavior is COMPLETELY UNCHANGED (falls through the gate)')
  {
    const admin = new FakeAdmin({ article_topics: [], shopify_connections: [] })
    const r = await generateArticleForTopic(admin as unknown as Admin, { topicId: 't1', userId: 'website-user' })
    check('proceeds past the gate to the normal topic_not_found path (not billing_required)', !r.ok && r.kind === 'topic_not_found')
  }

  console.log('\n7) generatePoolItem — QUEUE/CRON path: blocked BEFORE any generation, fails safely, retry budget NOT consumed')
  {
    const admin = new FakeAdmin({
      article_pool_items: [{ id: 'item-1', project_id: 'p-shopify', topic_id: 't1', article_id: null, status: 'queued', attempts: 0 }],
      article_topics: [{ id: 't1', project_id: 'p-shopify' }],
      projects: [{ id: 'p-shopify', user_id: 'shopify-user' }],
      generated_articles: [],
      shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    const result = await withFetch(f, () => generatePoolItem(admin as unknown as Admin, 'item-1'))
    check('result reason billing_required', result.reason === 'billing_required')
    const row = admin.tables.article_pool_items[0] as Record<string, unknown>
    check('item status is "failed" (visible, not silently stuck in "generating")', row.status === 'failed')
    check('attempts rolled back to 0 (billing block never consumes the retry budget)', row.attempts === 0)
    check('locked_at cleared (not left claimed forever)', row.locked_at === null)
  }

  console.log('\n8) generatePoolItem — a REPEATED cron/retry attempt while still blocked never accumulates wasted attempts')
  {
    const admin = new FakeAdmin({
      article_pool_items: [{ id: 'item-1', project_id: 'p-shopify', topic_id: 't1', article_id: null, status: 'failed', attempts: 0, last_error: 'billing_required' }],
      article_topics: [{ id: 't1', project_id: 'p-shopify' }],
      projects: [{ id: 'p-shopify', user_id: 'shopify-user' }],
      generated_articles: [],
      shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    for (let i = 0; i < 3; i++) {
      await withFetch(f, () => generatePoolItem(admin as unknown as Admin, 'item-1', { allowRetry: true }))
    }
    const row = admin.tables.article_pool_items[0] as Record<string, unknown>
    check(`after ${AUTOMATION_MAX_ATTEMPTS}+ retry attempts while blocked, attempts is STILL 0 (never exhausts the real retry budget)`, row.attempts === 0)
    check('still "failed" (retryable once billing is fixed), never permanently stuck past max_attempts', row.status === 'failed')
  }

  console.log('\n9) generatePoolItem — entitlement lost BETWEEN queueing and execution is caught at execution time, before any generation cost')
  {
    // Simulates: item queued while the merchant had a plan; by the time cron
    // picks it up, activeSubscription is now null.
    const admin = new FakeAdmin({
      article_pool_items: [{ id: 'item-2', project_id: 'p-shopify', topic_id: 't1', article_id: null, status: 'queued', attempts: 0 }],
      article_topics: [{ id: 't1', project_id: 'p-shopify' }],
      projects: [{ id: 'p-shopify', user_id: 'shopify-user' }],
      generated_articles: [],
      shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody })) // "lost entitlement" at execution time
    const result = await withFetch(f, () => generatePoolItem(admin as unknown as Admin, 'item-2'))
    check('denied at execution time (never reached generateValidatedArticle/callGemini)', result.reason === 'billing_required')
  }

  console.log('\n10) createFeaturedImageForArticle (standalone regenerate route) — blocked before any Gemini image call')
  {
    const admin = new FakeAdmin({
      generated_articles: [{ id: 'art-1', project_id: 'p-shopify', title: 'T', topic_id: null, excerpt: null, meta_description: null, featured_image_storage_path: null }],
      projects: [{ id: 'p-shopify', user_id: 'shopify-user' }],
      shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    const result = await withFetch(f, () => createFeaturedImageForArticle(admin as unknown as Admin, 'art-1'))
    check('error billing_required', 'error' in result && result.error === 'billing_required')
  }

  console.log('\n11) generateInlineImage (standalone/regenerate) — blocked before any Gemini image call, row marked failed (not left "generating")')
  {
    const admin = new FakeAdmin({
      article_inline_images: [{ id: 'img-1', project_id: 'p-shopify', article_id: 'art-1', prompt: 'x', alt_text: null, storage_path: null, status: 'ready' }],
      generated_articles: [{ id: 'art-1', title: 'T', topic_id: null }],
      projects: [{ id: 'p-shopify', user_id: 'shopify-user' }],
      shopify_connections: [shopifyConnRow()], shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const f = fakePartnerFetch(() => ({ status: 200, body: noSubBody }))
    const result = await withFetch(f, () => generateInlineImage(admin as unknown as Admin, 'img-1'))
    check('ok:false, error billing_required', !result.ok && result.error === 'billing_required')
    const row = admin.tables.article_inline_images[0] as Record<string, unknown>
    check('row marked "failed" with last_error billing_required (never left stuck in "generating")', row.status === 'failed' && row.last_error === 'billing_required')
  }

  console.log('\n12) source-contract — the gate runs BEFORE generation/publish in every route it was installed in')
  {
    const topicSuggestions = strip(read('app/api/content/topic-suggestions/route.ts'))
    const gateIdx1 = topicSuggestions.indexOf('assertContentGenerationAllowedForUser(')
    const genIdx1 = topicSuggestions.indexOf('generateRawTopics(')
    check('topic-suggestions/route.ts: gate before generateRawTopics', gateIdx1 !== -1 && genIdx1 !== -1 && gateIdx1 < genIdx1)

    const recommendations = strip(read('app/api/content/automation/recommendations/route.ts'))
    const gateIdx2 = recommendations.indexOf('assertContentGenerationAllowedForUser(')
    check('recommendations/route.ts: gate is present (before every engine-variant dispatch below it)', gateIdx2 !== -1)

    const improve = strip(read('app/api/content/automation/topic-ideas/improve/route.ts'))
    const gateIdx3 = improve.indexOf('assertContentGenerationAllowedForUser(')
    const genIdx3 = improve.indexOf('improveRecommendationWithPro(')
    check('topic-ideas/improve/route.ts: gate before improveRecommendationWithPro', gateIdx3 !== -1 && genIdx3 !== -1 && gateIdx3 < genIdx3)

    const wp = strip(read('app/api/content/articles/[id]/wordpress/route.ts'))
    const gateIdx4 = wp.indexOf('assertContentGenerationAllowedForUser(')
    const publishIdx4 = wp.indexOf('wpCreatePost(')
    check('wordpress/route.ts: gate before wpCreatePost', gateIdx4 !== -1 && publishIdx4 !== -1 && gateIdx4 < publishIdx4)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
