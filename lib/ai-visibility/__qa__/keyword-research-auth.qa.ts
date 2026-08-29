/**
 * Security fix — behavioral QA for authorizeAiQuestionGeneration(), the
 * gate installed in front of POST /api/keyword-research/generate-ai-questions
 * (previously had NO authentication or ownership check at all). Run:
 *   npx tsx lib/ai-visibility/__qa__/keyword-research-auth.qa.ts
 */
import type { createAdminClient } from '@/lib/supabase/admin'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { authorizeAiQuestionGeneration } from '../keyword-research-auth'

type Admin = ReturnType<typeof createAdminClient>

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

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
const realFetch = global.fetch
function withFetch<T>(impl: typeof fetch, fn: () => Promise<T>): Promise<T> {
  global.fetch = impl
  return fn().finally(() => { global.fetch = realFetch })
}

async function main() {
  console.log('Security fix — /api/keyword-research/generate-ai-questions authorization QA\n')

  console.log('1) unauthenticated request — cannot reach the gate/Gemini at all')
  {
    const admin = new FakeAdmin({ projects: [{ id: 'p1', user_id: 'u1' }] })
    const r = await authorizeAiQuestionGeneration(admin as unknown as Admin, null, 'p1')
    check('ok:false, status 401', !r.ok && r.status === 401)
  }

  console.log('\n2) authenticated, but the project belongs to a DIFFERENT user — forbidden')
  {
    const admin = new FakeAdmin({ projects: [{ id: 'p1', user_id: 'victim-user' }] })
    const r = await authorizeAiQuestionGeneration(admin as unknown as Admin, 'attacker-user', 'p1')
    check('ok:false, status 403 Forbidden', !r.ok && r.status === 403 && r.error === 'Forbidden')
  }

  console.log('\n3) authenticated, owns the project, but is Shopify-billing-required — cannot invoke Gemini')
  {
    const admin = new FakeAdmin({
      projects: [{ id: 'p1', user_id: 'shopify-user' }],
      shopify_connections: [{ id: 'c1', user_id: 'shopify-user', project_id: 'p1', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID, connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: null, shopify_current_period_end: null, shopify_billing_verified_at: null }],
      shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const r = await withFetch(fakePartnerFetch(() => ({ status: 200, body: noSubBody })), () =>
      authorizeAiQuestionGeneration(admin as unknown as Admin, 'shopify-user', 'p1'))
    check('ok:false, status 403, reason shopify_billing_required', !r.ok && r.status === 403 && r.error === 'Shopify billing required' && r.reason === 'shopify_billing_required')
  }

  console.log('\n4) eligible website-only user (no Shopify connection) — unaffected, normal use')
  {
    const admin = new FakeAdmin({ projects: [{ id: 'p1', user_id: 'website-user' }], shopify_connections: [] })
    const r = await authorizeAiQuestionGeneration(admin as unknown as Admin, 'website-user', 'p1')
    check('ok:true', r.ok === true)
  }

  console.log('\n5) Shopify-connected user WITH a verified active plan — normal use')
  {
    const admin = new FakeAdmin({
      projects: [{ id: 'p1', user_id: 'shopify-user-2' }],
      shopify_connections: [{ id: 'c2', user_id: 'shopify-user-2', project_id: 'p1', shop_domain: SHOP_DOMAIN, shop_gid: SHOP_GID, connection_status: 'connected', shopify_plan_handle: null, shopify_subscription_status: null, shopify_current_period_end: null, shopify_billing_verified_at: null }],
      shopify_billing_migrations: [], profiles: [], subscriptions: [],
    })
    const r = await withFetch(fakePartnerFetch(() => ({ status: 200, body: activeSubBody('premium') })), () =>
      authorizeAiQuestionGeneration(admin as unknown as Admin, 'shopify-user-2', 'p1'))
    check('ok:true', r.ok === true)
  }

  console.log('\n6) no other production caller of the underlying Gemini functions bypasses this route')
  {
    const { readFileSync, readdirSync, statSync } = await import('fs')
    const { join } = await import('path')
    const ROOT = join(__dirname, '..', '..', '..')
    const files: string[] = []
    const walk = (dir: string) => {
      for (const entry of readdirSync(join(ROOT, dir))) {
        if (['node_modules', '__qa__', '__tests__', '.next'].includes(entry)) continue
        const rel = join(dir, entry)
        const st = statSync(join(ROOT, rel))
        if (st.isDirectory()) walk(rel)
        else if (/\.(ts|tsx)$/.test(entry)) files.push(rel)
      }
    }
    walk('app')
    walk('lib')
    const callers = files.filter((f) => {
      const src = readFileSync(join(ROOT, f), 'utf8')
      return (/\bclassifyKeywordsWithGemini\s*\(/.test(src) || /\breviewAndRepairQuestions\s*\(/.test(src)) && f !== join('lib', 'ai-visibility', 'gemini-semantic-classifier.ts')
    })
    check('exactly one production caller (the fixed route)', callers.length === 1 && callers[0] === join('app', 'api', 'keyword-research', 'generate-ai-questions', 'route.ts'), callers.join(', '))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}
main()
