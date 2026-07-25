/**
 * Offline unit tests for Shopify shop-scoped cleanup (app/uninstalled + shop/redact +
 * manual-disconnect pointer clearing). Uses a capturing fake Supabase admin — no network,
 * no DB. Run: npx tsx lib/shopify/__qa__/shop-cleanup.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { applyAppUninstalled, applyShopRedact, clearShopifyArticlePointers, SHOPIFY_REVOCATION_SENTINEL } from '../shop-cleanup'
import { decryptCredential } from '../../security/credentials-crypto'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}

// A valid 32-byte AES key so encryptCredential/decryptCredential work in-process.
process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = 'a'.repeat(64)

interface Call { table: string; op: string; patch?: Record<string, unknown> | null; filters: Record<string, unknown> }
type Result = { data?: unknown; error?: unknown }

function fakeAdmin(script: Record<string, Result> = {}) {
  const calls: Call[] = []
  function from(table: string) {
    const st: Call = { table, op: 'select', patch: null, filters: {} }
    const api = {
      select(cols?: string) { st.op = 'select'; void cols; return api },
      update(patch: Record<string, unknown>) { st.op = 'update'; st.patch = patch; return api },
      delete() { st.op = 'delete'; return api },
      eq(col: string, val: unknown) { st.filters[col] = val; return api },
      in(col: string, vals: unknown) { st.filters[col] = vals; return api },
      maybeSingle() { return api },
      then(resolve: (v: Result) => unknown, reject?: (e: unknown) => unknown) {
        calls.push({ table: st.table, op: st.op, patch: st.patch, filters: { ...st.filters } })
        const key = `${st.table}:${st.op}`
        const res: Result = script[key] ?? { data: null, error: null }
        return Promise.resolve(res).then(resolve, reject)
      },
    }
    return api
  }
  return { admin: { from } as never, calls }
}

async function main() {
  console.log('Shopify shop-cleanup — offline unit')

  // ── clearShopifyArticlePointers ──
  {
    const { admin, calls } = fakeAdmin()
    const r = await clearShopifyArticlePointers(admin, [])
    check('clear: empty project list is a safe no-op (never calls .in())', r.ok === true && calls.length === 0)
  }
  {
    const { admin, calls } = fakeAdmin()
    const r = await clearShopifyArticlePointers(admin, ['p1', 'p2'])
    const c = calls.find((x) => x.table === 'generated_articles' && x.op === 'update')!
    check('clear: updates generated_articles with the 9 pointer fields + tags=[]', r.ok === true
      && !!c && (c.patch as Record<string, unknown>).shopify_article_id === null
      && Array.isArray((c.patch as Record<string, unknown>).shopify_tags)
      && ((c.patch as Record<string, unknown>).shopify_tags as unknown[]).length === 0
      && (c.patch as Record<string, unknown>).shopify_blog_id === null
      && (c.patch as Record<string, unknown>).shopify_status === null, JSON.stringify(c?.patch))
    check('clear: never touches article content (no title/content_html/wp_* in patch)', (() => {
      const p = (c.patch ?? {}) as Record<string, unknown>
      return !('title' in p) && !('content_html' in p) && !('excerpt' in p) && !('meta_description' in p) && !('slug' in p) && !Object.keys(p).some((k) => k.startsWith('wp_'))
    })())
    check('clear: scoped by .in(project_id, ids)', (c.filters.project_id as string[]).join(',') === 'p1,p2')
  }
  {
    const { admin } = fakeAdmin({ 'generated_articles:update': { error: { message: 'boom' } } })
    const r = await clearShopifyArticlePointers(admin, ['p1'])
    check('clear: DB error → ok:false (surfaces non-2xx)', r.ok === false && r.error === 'article_pointer_clear_failed')
  }

  // ── applyAppUninstalled ──
  {
    const { admin, calls } = fakeAdmin()
    const r = await applyAppUninstalled(admin, 'acme.myshopify.com')
    const c = calls.find((x) => x.table === 'shopify_connections' && x.op === 'update')!
    const patch = (c?.patch ?? {}) as Record<string, unknown>
    check('uninstall: ok', r.ok === true)
    check('uninstall: writes a VALID-format sentinel (not empty), decrypts to the marker', typeof patch.access_token_encrypted === 'string'
      && (patch.access_token_encrypted as string).length > 0
      && decryptCredential(patch.access_token_encrypted as string) === SHOPIFY_REVOCATION_SENTINEL)
    check('uninstall: status=failed, scopes=[], default_blog cleared, last_error set', patch.connection_status === 'failed'
      && Array.isArray(patch.granted_scopes) && (patch.granted_scopes as unknown[]).length === 0
      && patch.default_blog_id === null && patch.last_error === 'app_uninstalled')
    check('uninstall: scoped by shop_domain', c.filters.shop_domain === 'acme.myshopify.com')
  }
  {
    const { admin } = fakeAdmin({ 'shopify_connections:update': { error: { message: 'db' } } })
    const r = await applyAppUninstalled(admin, 'acme.myshopify.com')
    check('uninstall: DB error → ok:false', r.ok === false && r.error === 'connection_update_failed')
  }
  {
    // Crypto unavailable → fail closed (never acknowledge while a usable token could remain).
    const prev = process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY
    delete process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY
    const { admin, calls } = fakeAdmin()
    const r = await applyAppUninstalled(admin, 'acme.myshopify.com')
    check('uninstall: crypto unavailable → ok:false and NO connection write', r.ok === false && r.error === 'crypto_unavailable'
      && !calls.some((x) => x.table === 'shopify_connections' && x.op === 'update'))
    process.env.CONTENT_CREDENTIALS_ENCRYPTION_KEY = prev
  }

  // ── applyShopRedact ──
  {
    const { admin, calls } = fakeAdmin({ 'shopify_connections:select': { data: [{ project_id: 'p1' }, { project_id: 'p2' }], error: null } })
    const r = await applyShopRedact(admin, 'acme.myshopify.com')
    check('redact: ok', r.ok === true)
    const order = calls.map((c) => `${c.table}:${c.op}`)
    check('redact: exact order — resolve → clear pointers → delete states → delete connection LAST', JSON.stringify(order) === JSON.stringify([
      'shopify_connections:select',
      'generated_articles:update',
      'shopify_oauth_states:delete',
      'shopify_connections:delete',
    ]), order.join(' | '))
    check('redact: article pointer clear scoped to the resolved project ids', (() => {
      const c = calls.find((x) => x.table === 'generated_articles' && x.op === 'update')!
      return (c.filters.project_id as string[]).join(',') === 'p1,p2'
    })())
    check('redact: state + connection deletes scoped by shop_domain', (() => {
      const s = calls.find((x) => x.table === 'shopify_oauth_states' && x.op === 'delete')!
      const d = calls.find((x) => x.table === 'shopify_connections' && x.op === 'delete')!
      return s.filters.shop_domain === 'acme.myshopify.com' && d.filters.shop_domain === 'acme.myshopify.com'
    })())
    check('redact: never touches projects/users/GSC/WordPress tables', !calls.some((c) => ['projects', 'users', 'gsc_connections', 'wordpress_connections'].includes(c.table)))
  }
  {
    // Already-redacted shop: 0 projects resolved → no .in() update, deletes affect 0 rows → ok (200).
    const { admin, calls } = fakeAdmin({ 'shopify_connections:select': { data: [], error: null } })
    const r = await applyShopRedact(admin, 'gone.myshopify.com')
    check('redact: already-redacted (0 projects) → ok, no generated_articles update', r.ok === true
      && !calls.some((c) => c.table === 'generated_articles'))
  }
  {
    // Failure at the FIRST step (lookup) → ok:false, and NOTHING deleted afterwards.
    const { admin, calls } = fakeAdmin({ 'shopify_connections:select': { data: null, error: { message: 'x' } } })
    const r = await applyShopRedact(admin, 'acme.myshopify.com')
    check('redact: lookup failure → ok:false and no deletes', r.ok === false && r.error === 'connection_lookup_failed'
      && !calls.some((c) => c.op === 'delete'))
  }
  {
    // Failure at the article-clear step → connection NOT deleted (deletion is last + gated).
    const { admin, calls } = fakeAdmin({
      'shopify_connections:select': { data: [{ project_id: 'p1' }], error: null },
      'generated_articles:update': { error: { message: 'x' } },
    })
    const r = await applyShopRedact(admin, 'acme.myshopify.com')
    check('redact: article-clear failure → ok:false and connection NOT deleted', r.ok === false && r.error === 'article_pointer_clear_failed'
      && !calls.some((c) => c.table === 'shopify_connections' && c.op === 'delete'))
  }
  {
    // Failure at the connection-delete step → ok:false.
    const { admin } = fakeAdmin({
      'shopify_connections:select': { data: [{ project_id: 'p1' }], error: null },
      'shopify_connections:delete': { error: { message: 'x' } },
    })
    const r = await applyShopRedact(admin, 'acme.myshopify.com')
    check('redact: connection-delete failure → ok:false', r.ok === false && r.error === 'connection_delete_failed')
  }
  {
    // Failure DELETING oauth states → ok:false AND the connection delete is NOT attempted.
    const { admin, calls } = fakeAdmin({
      'shopify_connections:select': { data: [{ project_id: 'p1' }], error: null },
      'shopify_oauth_states:delete': { error: { message: 'x' } },
    })
    const r = await applyShopRedact(admin, 'acme.myshopify.com')
    check('redact: oauth-state delete failure → ok:false and connection NOT deleted', r.ok === false && r.error === 'oauth_state_delete_failed'
      && !calls.some((c) => c.table === 'shopify_connections' && c.op === 'delete'))
  }

  // ── Manual-disconnect ordering source contract (app/api/shopify/connection/route.ts) ──
  {
    const src = readFileSync(join(__dirname, '..', '..', '..', 'app', 'api', 'shopify', 'connection', 'route.ts'), 'utf8')
    const clearIdx = src.indexOf('clearShopifyArticlePointers(auth.admin')
    const deleteIdx = src.indexOf("from('shopify_connections').delete()")
    check('disconnect: clearShopifyArticlePointers runs BEFORE the connection delete', clearIdx !== -1 && deleteIdx !== -1 && clearIdx < deleteIdx)
    check('disconnect: a pointer-cleanup failure returns BEFORE the connection delete', (() => {
      const guardIdx = src.indexOf('if (!cleared.ok)')
      return guardIdx !== -1 && guardIdx < deleteIdx && /if \(!cleared\.ok\) \{[\s\S]{0,160}return Response\.json/.test(src)
    })())
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exit(1)
}
main()
