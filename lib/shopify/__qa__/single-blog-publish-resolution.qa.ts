/**
 * Shopify publishing target — the single-blog resolution incident.
 *
 * LIVE FACTS: a connected store, a successful sync reporting exactly ONE blog,
 * a successfully generated article — and automatic publishing failing with
 * `no_shopify_blog`, because neither the article nor the connection carried a
 * blog id and nothing ever asked Shopify. The merchant was then pointed at a
 * "choose a default blog" control that was not on the card they were looking at.
 *
 * Audited path: automation runner → publishShopifyPoolItem → prerequisite
 * resolution → publishArticleToShopify → Shopify Blogs → shopify_connections /
 * generated_articles → article_pool_items.last_error → AutomationSchedule label.
 *
 * SCOPE: sections marked SOURCE assert what the code does, not what React
 * renders or what an HTTP request returns. NOT browser-verified.
 *
 * Run: npx tsx lib/shopify/__qa__/single-blog-publish-resolution.qa.ts
 */
import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import { resolvePublishBlogTarget, isDeterministicBlogBlocker } from '../resolve-publish-blog'
import type { ShopifyCredentials } from '../types'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/(^|[^:])\/\/[^\n]*/g, '$1')

const CREDS = { shopDomain: 's.myshopify.com', accessToken: 'x', apiVersion: '2026-07' } as unknown as ShopifyCredentials
const CONN_ID = 'conn-1'
const BLOG_A = { id: 'gid://shopify/Blog/1', title: 'News', handle: 'news' }
const BLOG_B = { id: 'gid://shopify/Blog/2', title: 'Guides', handle: 'guides' }

const world = (defaultBlogId: string | null = null) => new FakeAdmin({
  shopify_connections: [{ id: CONN_ID, project_id: 'p1', default_blog_id: defaultBlogId, updated_at: '2026-09-01T00:00:00Z' }],
})
const conn = (admin: FakeAdmin) => (admin.tables.shopify_connections as Record<string, unknown>[])[0]!
const listing = (blogs: typeof BLOG_A[]) => { let calls = 0; return { calls: () => calls, fn: async () => { calls++; return blogs } } }

async function main() {
  console.log('Shopify single-blog publish resolution\n')

  console.log('1) EXACTLY ONE blog and no saved ids — resolved automatically and persisted')
  {
    const admin = world(null)
    const l = listing([BLOG_A])
    const r = await resolvePublishBlogTarget(admin as never, conn(admin) as never, CREDS, { shopify_blog_id: null }, { listBlogs: l.fn as never })
    check('1a: it resolves', r.ok === true)
    check('1b: to the store’s only blog', r.ok === true && r.blogId === BLOG_A.id)
    check('1c: reported as auto-resolved', r.ok === true && r.autoResolved === true)
    check('1d: and PERSISTED as the connection default, so it is asked once',
      conn(admin).default_blog_id === BLOG_A.id)
    check('1e: Shopify was asked exactly once', l.calls() === 1)
    // A second call now short-circuits on the saved default.
    const l2 = listing([BLOG_A])
    const r2 = await resolvePublishBlogTarget(admin as never, conn(admin) as never, CREDS, { shopify_blog_id: null }, { listBlogs: l2.fn as never })
    check('1f: the next publish uses the saved default without asking again',
      r2.ok === true && r2.blogId === BLOG_A.id && r2.autoResolved === false && l2.calls() === 0)
  }

  console.log('\n2) ZERO blogs — a distinct, deterministic blocker')
  {
    const admin = world(null)
    const l = listing([])
    const r = await resolvePublishBlogTarget(admin as never, conn(admin) as never, CREDS, { shopify_blog_id: null }, { listBlogs: l.fn as never })
    check('2a: no_shopify_blog', r.ok === false && r.reason === 'no_shopify_blog')
    check('2b: nothing is persisted', conn(admin).default_blog_id === null)
    check('2c: it is deterministic (action required)', isDeterministicBlogBlocker('no_shopify_blog'))
  }

  console.log('\n3) MULTIPLE blogs and no default — never chosen arbitrarily')
  {
    const admin = world(null)
    const l = listing([BLOG_A, BLOG_B])
    const r = await resolvePublishBlogTarget(admin as never, conn(admin) as never, CREDS, { shopify_blog_id: null }, { listBlogs: l.fn as never })
    check('3a: missing_default_blog — DISTINCT from no_shopify_blog',
      r.ok === false && r.reason === 'missing_default_blog')
    check('3b: no blog is picked', r.ok === false)
    check('3c: and none is persisted', conn(admin).default_blog_id === null)
    check('3d: it is deterministic (action required)', isDeterministicBlogBlocker('missing_default_blog'))
  }

  console.log('\n4) A SAVED default publishes; an ARTICLE override wins over it')
  {
    const admin = world(BLOG_B.id)
    const l = listing([BLOG_A, BLOG_B])
    const r = await resolvePublishBlogTarget(admin as never, conn(admin) as never, CREDS, { shopify_blog_id: null }, { listBlogs: l.fn as never })
    check('4a: the saved default is used', r.ok === true && r.blogId === BLOG_B.id)
    check('4b: without asking Shopify at all', l.calls() === 0)
    const l2 = listing([BLOG_A, BLOG_B])
    const r2 = await resolvePublishBlogTarget(admin as never, conn(admin) as never, CREDS, { shopify_blog_id: BLOG_A.id }, { listBlogs: l2.fn as never })
    check('4c: an article-level blog OVERRIDES the connection default',
      r2.ok === true && r2.blogId === BLOG_A.id && r2.autoResolved === false)
    check('4d: and also asks nothing', l2.calls() === 0)
  }

  console.log('\n5) A failed Blogs lookup is TRANSIENT — never "your store has no blog"')
  {
    const admin = world(null)
    const r = await resolvePublishBlogTarget(admin as never, conn(admin) as never, CREDS, { shopify_blog_id: null },
      { listBlogs: (async () => { throw new Error('network') }) as never })
    check('5a: blog_lookup_failed', r.ok === false && r.reason === 'blog_lookup_failed')
    check('5b: NOT no_shopify_blog', !(r.ok === false && r.reason === 'no_shopify_blog'))
    check('5c: NOT a deterministic blocker — it stays retryable', !isDeterministicBlogBlocker('blog_lookup_failed'))
    check('5d: nothing persisted', conn(admin).default_blog_id === null)
  }

  console.log('\n6) SOURCE — the queue resolves this BEFORE claiming an attempt')
  {
    const q = strip(read('lib/content/automation/publish-item-shopify.ts'))
    const resolveIdx = q.indexOf('const blogTarget = await resolvePublishBlogTarget(')
    const claimIdx = q.indexOf("attempts: (item.attempts ?? 0) + 1")
    check('6a: the resolution happens before the atomic claim',
      resolveIdx !== -1 && claimIdx !== -1 && resolveIdx < claimIdx)
    check('6b: a deterministic blocker pauses the item with an alert',
      /if \(!blogTarget\.ok && isDeterministicBlogBlocker\(blogTarget\.reason\)\) \{[\s\S]{0,200}blockShopifyItem\(admin, item, blogTarget\.reason, articleTitle\)/.test(q))
    check('6c: blockShopifyItem does NOT touch attempts',
      /await finalizeItem\(admin, item\.id, 'paused', reason\)/.test(q)
      && !/finalizeItem\([^)]*attempts/.test(q))
    check('6d: and it raises the blocked alert immediately',
      /recordPublishBlockedAlert\(admin, \{/.test(q))
    check('6e: a transient lookup failure is NOT blocked — it falls through to the retry-bounded path',
      /isDeterministicBlogBlocker\(blogTarget\.reason\)/.test(q))
    check('6f: the stale NOTE claiming the blog is not checked here is gone',
      !/the target blog is NOT checked here/.test(read('lib/content/automation/publish-item-shopify.ts')))
  }

  console.log('\n7) SOURCE — the retry republishes the SAME article, with no generation')
  {
    const q = strip(read('lib/content/automation/publish-item-shopify.ts'))
    check('7a: the publish path uses the item’s existing article_id',
      /const articleId = item\.article_id as string/.test(q))
    check('7b: it never calls article generation',
      !/generateArticleForTopic|generateValidatedArticle/.test(q))
    check('7c: nor reserves usage or consumes a credit',
      !/reserveUsage|finalizeArticleGeneration|releaseUsageReservation/.test(q))
    check('7d: nor calls Gemini in any form', !/gemini|Gemini/.test(q))
    check('7e: the blocked path returns before any publish call',
      q.indexOf('blockShopifyItem(admin, item, blogTarget.reason') < q.indexOf('await publishArticleToShopify('))
  }

  console.log('\n8) SOURCE — the service uses the SAME resolver, and reports the new reasons')
  {
    const p = strip(read('lib/shopify/publish-article.ts'))
    check('8a: it calls the shared resolver', /const target = await resolvePublishBlogTarget\(admin, connection, creds, article\)/.test(p))
    check('8b: and returns its reason verbatim', /if \(!target\.ok\) return \{ ok: false, reason: target\.reason/.test(p))
    check('8c: the new reasons are in the public union',
      /\| 'missing_default_blog'/.test(p) && /\| 'blog_lookup_failed'/.test(p))
    check('8d: the resolved blog is still persisted on the article',
      /update\(\{ shopify_blog_id: blogId, updated_at: nowIso\(\) \}\)/.test(p))
    check('8e: ONE resolver — the service does not list blogs itself',
      (read('lib/shopify/publish-article.ts').match(/getShopifyBlogs/g) ?? []).length === 0)
    check('8f: and the stored-id precedence is NOT restated — it reuses resolveTargetBlogId',
      /const stored = resolveTargetBlogId\(article\.shopify_blog_id, connection\.default_blog_id\)/
        .test(strip(read('lib/shopify/resolve-publish-blog.ts'))))
  }

  console.log('\n9) The persisted queue reasons resolve to localized prose (HE + EN)')
  {
    const genErrorsBlock = (src: string): string => {
      const start = src.indexOf('genErrors: {')
      let depth = 0
      for (let k = start + 'genErrors: '.length; k < src.length; k++) {
        if (src[k] === '{') depth++
        else if (src[k] === '}') { depth--; if (depth === 0) return src.slice(start, k) }
      }
      return ''
    }
    // blockShopifyItem persists the BARE code; the publish path persists it
    // prefixed with `shopify_`. Both shapes can reach the queue UI.
    const PERSISTED = [
      'no_shopify_blog', 'shopify_no_shopify_blog',
      'missing_default_blog', 'shopify_missing_default_blog',
      'blog_lookup_failed', 'shopify_blog_lookup_failed',
      'missing_write_content_scope', 'shopify_missing_write_content_scope',
      'no_shopify_connection',
    ] as const
    for (const lang of ['en', 'he'] as const) {
      const block = genErrorsBlock(read(`lib/i18n/dashboard/${lang}.ts`))
      check(`9: '${lang}' genErrors block located by brace depth`, block.length > 0)
      const dict: Record<string, string> = {}
      for (const m of block.matchAll(/^\s{6,}([a-z0-9_]+): '((?:[^'\\]|\\.)*)'/gm)) dict[m[1]!] = m[2]!
      const reasonLabel = (code: string): string => {
        const idx = code.indexOf(':')
        const base = (idx >= 0 ? code.slice(0, idx) : code).trim()
        const tail = idx >= 0 ? code.slice(idx + 1).trim() : ''
        const label = dict[base] ?? base
        return tail ? `${label} — ${tail}` : label
      }
      for (const code of PERSISTED) {
        const label = reasonLabel(code)
        check(`9: '${lang}' '${code}' resolves to prose, not the raw code`,
          label !== code && !/^[a-z0-9_]+$/.test(label), label)
      }
      check(`9: '${lang}' NEGATIVE CONTROL — an unknown code still falls back`,
        reasonLabel('totally_unknown') === 'totally_unknown')
      check(`9: '${lang}' the two blog blockers have DIFFERENT messages`,
        dict.no_shopify_blog !== dict.missing_default_blog
        && !!dict.no_shopify_blog && !!dict.missing_default_blog)
    }
    const en = read('lib/i18n/dashboard/en.ts')
    check('9a: "no blogs" tells the merchant to create one in Shopify',
      /no_shopify_blog: 'Your Shopify store has no blog yet\. Create a blog in Shopify/.test(en))
    check('9b: "several blogs" asks them to choose, and does not claim none exists',
      /missing_default_blog: 'Your store has several blogs\. Choose which one/.test(en))
  }

  console.log('\n10) SOURCE — the destination control is shared, and neither card hides it')
  {
    // This section used to assert the destination markup INSIDE
    // ShopifyConnectionPanel. It now lives in ShopifyDestinationSection, which
    // both Shopify cards render — the panel had the markup and the hub's card
    // (the one a connected merchant actually sees) did not, and that divergence
    // is the defect. The behavioral journey for all of this is in
    // lib/shopify/__qa__/publish-destination-journey.qa.ts.
    const dest = strip(read('components/content/ShopifyDestinationSection.tsx'))
    const panel = strip(read('components/content/ShopifyConnectionPanel.tsx'))
    const card = strip(read('components/content/ContentHubPlatformCard.tsx'))
    check('10a: the blogs fetch is not gated on the publish scope',
      !/if \(!canPublish\)/.test(dest) && /fetch\(`\/api\/shopify\/blogs/.test(dest))
    check('10b: nor is the section itself — canPublish never short-circuits a render',
      !/if \(!canPublish\) return null/.test(dest))
    check('10c: a missing scope is STATED instead of hiding everything',
      /!canPublish && \(/.test(dest) && /t\.defaultBlogNeedsScope/.test(dest))
    check('10d: with one blog the merchant is told it was selected automatically',
      /t\.defaultBlogAuto/.test(dest))
    check('10e: with several blogs a selector and a Save action are rendered',
      /<option value="">\{t\.defaultBlogSelect\}<\/option>/.test(dest) && /t\.defaultBlogSave/.test(dest))
    check('10f: with zero blogs a truthful message is shown', /t\.defaultBlogNone/.test(dest))
    check('10g: BOTH Shopify cards render the SAME component — no second copy to drift',
      panel.includes('<ShopifyDestinationSection') && card.includes('<ShopifyDestinationSection'))
    for (const lang of ['en', 'he'] as const) {
      const src = read(`lib/i18n/dashboard/${lang}.ts`)
      check(`10h: '${lang}' the destination labels exist`,
        /defaultBlogNeedsScope: '/.test(src) && /defaultBlogAuto: '/.test(src)
        && /defaultBlogLoadError: '/.test(src) && /defaultBlogRetry: '/.test(src))
    }
    check('10i: SCOPE — a source contract on components; no browser was run', true)
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  if (fail > 0) process.exitCode = 1
}

main()
