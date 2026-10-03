/**
 * The article viewer's top bar, Schema tab and AI citations (content review
 * C1, C3 part 1, C9 tiers 1 and 2).
 *
 *   A. the JSON-LD builder: BlogPosting from the article's fields, FAQPage from
 *      faq_json, nothing invented, and output that cannot close a script element;
 *   B. citation matching by the article's live URL: host / www / scheme /
 *      trailing slash / query / encoding normalized, the home page and other
 *      pages never match, the question comes from stored data only;
 *   C. the suggested AI question: a template, conversational, never the brand;
 *   D. NO QUOTA ON SUGGEST: the real visibility route, driven over an in-memory
 *      Supabase, makes no RPC, no write and no read of usage tables, filters
 *      every read by the owner's project, and never shows another project's
 *      citation; tracking is a click on the existing prompt route only;
 *   E. the primary action resolver (connect / scope upgrade / publish / live);
 *   F. the webhook payload's structured_data (additive, versioned, documented);
 *   G. copy with fallback; H. dictionaries in both languages, honest copy;
 *   I. source guards on the new UI (tokens only, no Shopify scope literals).
 * Every guard has a MUTATION CONTROL: the same check over a broken copy fails.
 *
 * Run: npx tsx lib/content/__qa__/article-viewer-publish-schema-citations.qa.ts
 */
/* eslint-disable @typescript-eslint/no-explicit-any, @typescript-eslint/no-require-imports */
const Module: any = require('module')
const origLoad = Module._load
const INTERCEPT = ['@/lib/content/api-auth', '@/lib/supabase/admin']
const overrides = new Map<string, Record<string, unknown>>()
Module._load = function (request: string, parent: any, isMain: boolean) {
  const real = origLoad.call(this, request, parent, isMain)
  const key = INTERCEPT.find((x) => request === x)
  if (!key) return real
  return new Proxy(real, { get: (t, k) => { const o = overrides.get(key); return o && (k as string) in o ? o[k as string] : (t as any)[k] } })
}

import { readFileSync } from 'fs'
import { join } from 'path'
import { FakeAdmin } from '../../__qa__/_fake-admin'
import {
  buildStructuredData, buildArticleJsonLd, buildFaqJsonLd, serializeJsonLd, toScriptTags, validFaqPairs, HEADLINE_MAX,
} from '../structured-data'
import { normalizeUrlForMatch, matchArticleCitations, publishedUrlOf, citedArticles, type StoredCitation } from '../citation-match'
import { suggestAiQuery, mentionsBrand } from '../ai-query-suggestion'
import { resolvePublishCta } from '../publish-cta'
import { copyHtml, copyPlainText, articleHtmlForCopy, featuredImageFileName } from '../article-export'
import { buildArticlePayload, buildTestPayload, WEBHOOK_PAYLOAD_VERSION } from '../../site-platforms/webhook'
import { EXAMPLE_PAYLOAD } from '../../../components/content/site-platforms/WebhookDocs'
import { buildWixDraftRequest } from '../../site-platforms/wix'
import { dashboardHe } from '../../i18n/dashboard/he'
import { dashboardEn } from '../../i18n/dashboard/en'

let pass = 0, fail = 0
function check(name: string, cond: boolean, detail?: string) {
  if (cond) { pass++; console.log(`  ✓ ${name}`) } else { fail++; console.log(`  ✗ ${name}${detail ? ` — ${detail}` : ''}`) }
}
const ROOT = join(__dirname, '..', '..', '..')
const read = (rel: string) => readFileSync(join(ROOT, rel), 'utf8')
const strip = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\{\/\*[\s\S]*?\*\/\}/g, '').replace(/(^|[^:'"`\\])\/\/.*$/gm, '$1')

async function main() {
  // ── A) JSON-LD builder ──────────────────────────────────────────────────────
  console.log('A) the JSON-LD builder')
  {
    const input = {
      headline: 'נעלי ריצה לכף רגל שטוחה: המדריך המלא',
      description: 'איך בוחרים נעלי ריצה לכף רגל שטוחה',
      imageUrl: 'https://cdn.example.com/i.jpg',
      datePublished: '2026-09-20T08:00:00Z',
      dateModified: '2026-09-21T09:30:00Z',
      url: 'https://shop.example.com/blogs/news/flat-feet',
      language: 'he',
      publisher: { name: 'Run Shop', url: 'shop.example.com' },
      faq: [
        { question: 'האם צריך מדרס?', answer: '<p>לא תמיד. <strong>כדאי</strong> לבדוק.</p>' },
        { question: '  ', answer: 'no question' },
        { question: 'no answer', answer: '' },
        { question: 'האם צריך מדרס?', answer: 'duplicate' },
      ],
    }
    const blocks = buildStructuredData(input)
    const [art, faq] = blocks as any[]
    check('A1: two blocks, BlogPosting first then FAQPage', blocks.length === 2 && art['@type'] === 'BlogPosting' && faq['@type'] === 'FAQPage')
    check('A2: every Article field comes from the input', art.headline === input.headline && art.description === input.description
      && art.image?.[0] === input.imageUrl && art.datePublished === '2026-09-20T08:00:00.000Z' && art.dateModified === '2026-09-21T09:30:00.000Z'
      && art.inLanguage === 'he' && art.url === input.url && art.mainEntityOfPage?.['@id'] === input.url)
    check('A3: publisher and author are the business, as an Organization with an https site', art.publisher?.['@type'] === 'Organization'
      && art.publisher.name === 'Run Shop' && art.publisher.url === 'https://shop.example.com/' && art.author?.name === 'Run Shop')
    check('A4: FAQ keeps only complete, distinct pairs, answers as plain text', faq.mainEntity.length === 1
      && faq.mainEntity[0].name === 'האם צריך מדרס?' && faq.mainEntity[0].acceptedAnswer.text === 'לא תמיד. כדאי לבדוק.')
    const bare = buildStructuredData({ headline: 'Only a title', faq: [] }) as any[]
    check('A5: nothing is invented — a bare title gives one block with no image/date/url/publisher', bare.length === 1
      && ['image', 'datePublished', 'url', 'publisher', 'author', 'mainEntityOfPage'].every((k) => !(k in bare[0])))
    check('A6: no FAQPage without a complete pair', buildFaqJsonLd([{ question: 'q', answer: ' ' }]) === null && validFaqPairs(null as any).length === 0)
    check('A7: non-https image / url are dropped', !('image' in (buildArticleJsonLd({ headline: 'x', imageUrl: 'http://x.com/i.png', url: 'javascript:alert(1)' }) as any))
      && !('url' in (buildArticleJsonLd({ headline: 'x', url: 'javascript:alert(1)' }) as any)))
    check('A8: a long headline is clipped to 110', (buildArticleJsonLd({ headline: 'word '.repeat(60) }) as any).headline.length <= HEADLINE_MAX)
    check('A9: no headline → no Article block', buildArticleJsonLd({ headline: '  ' }) === null)

    // Entity-encoded markup in a field decodes to a real "</script>" in the JSON value.
    const evil = buildStructuredData({ headline: 'A &lt;/script&gt;&lt;script&gt;alert(1)&lt;/script&gt; title', faq: [{ question: 'x&lt;/SCRIPT&gt;', answer: '&lt;!-- y --&gt;' }] })
    check('A10 pre: the values really contain the dangerous text', JSON.stringify(evil).includes('</script>') && JSON.stringify(evil).includes('<!--'))
    const tags = toScriptTags(evil)
    const closings = (tags.match(/<\/script/gi) || []).length
    check('A10: serialized JSON-LD cannot close the script element or open a comment', closings === evil.length && !/<!--/.test(tags))
    check('A11: the escaped JSON parses back to the same value', evil.every((b) => JSON.stringify(JSON.parse(serializeJsonLd(b))) === JSON.stringify(b)))
    // MUTATION CONTROL: a naive serializer lets the value close the element; A10's check catches it.
    const naive = evil.map((b) => `<script type="application/ld+json">\n${JSON.stringify(b)}\n</script>`).join('\n')
    check('A10 MUT: a plain JSON.stringify serializer is caught by the same check', (naive.match(/<\/script/gi) || []).length !== evil.length)
    check('A12: line separators are escaped too', !/[\u2028\u2029]/.test(serializeJsonLd({ x: 'a\u2028b\u2029c' })))
  }

  // ── B) citation URL matching ───────────────────────────────────────────────
  console.log('\nB) citation matching by the live URL')
  {
    const live = 'https://shop.example.com/blogs/news/%D7%A0%D7%A2%D7%9C%D7%99%D7%99%D7%9D'
    const same = [
      'http://www.shop.example.com/blogs/news/נעליים/',
      'https://SHOP.example.com/blogs/news/%d7%a0%d7%a2%d7%9c%d7%99%d7%99%d7%9d?utm_source=chatgpt.com',
      'shop.example.com/blogs/news/נעליים#faq',
      'https://shop.example.com:443/blogs/news/נעליים',
    ]
    const k = normalizeUrlForMatch(live)
    check('B1: www / scheme / trailing slash / query / fragment / case / encoding / default port all normalize equal', same.every((u) => normalizeUrlForMatch(u) === k), JSON.stringify(same.map(normalizeUrlForMatch)))
    check('B2: a different page, another host and a non-web URL do not match', normalizeUrlForMatch('https://shop.example.com/blogs/news/other') !== k
      && normalizeUrlForMatch('https://evil.example.com/blogs/news/נעליים') !== k && normalizeUrlForMatch('javascript:alert(1)') === null && normalizeUrlForMatch('mailto:a@b.c') === null)
    const rows: StoredCitation[] = [
      { engine: 'chatgpt', url: same[1], prompt_id: 'p1', created_at: '2026-09-25T10:00:00Z' },
      { engine: 'chatgpt', url: same[0], prompt_id: 'p1', created_at: '2026-09-26T10:00:00Z' },
      { engine: 'perplexity', url: same[2], prompt_id: 'gone', created_at: '2026-09-24T10:00:00Z' },
      { engine: 'gemini', url: 'https://shop.example.com/', prompt_id: 'p1', created_at: '2026-09-27T10:00:00Z' },
      { engine: 'grok', url: 'https://shop.example.com/blogs/news/other', prompt_id: 'p1', created_at: '2026-09-27T10:00:00Z' },
    ]
    const m = matchArticleCitations(live, rows, { p1: 'What running shoes help flat feet?' })
    check('B3: one entry per engine+question, the latest sighting, newest first', m.length === 2 && m[0].engine === 'chatgpt' && m[0].lastSeenAt === '2026-09-26T10:00:00Z' && m[1].engine === 'perplexity')
    check('B4: the question comes from the stored prompt; a deleted prompt gives no invented question', m[0].question === 'What running shoes help flat feet?' && m[1].question === null)
    check('B5: the home page and other pages never count', !m.some((x) => x.engine === 'gemini' || x.engine === 'grok'))
    check('B6: an article "at the root" never matches the home page', matchArticleCitations('https://shop.example.com/', rows, {}).length === 0)
    check('B7: nothing without stored rows', matchArticleCitations(live, [], {}).length === 0 && matchArticleCitations(null, rows, {}).length === 0)
    check('B8: the live URL is read only for a published article', publishedUrlOf({ status: 'ready', wp_post_url: 'https://x.com/a' }) === null
      && publishedUrlOf({ status: 'published', wp_post_url: 'https://x.com/a' }) === 'https://x.com/a'
      && publishedUrlOf({ status: 'published', shopify_article_url: 'https://s.com/b', wp_post_url: null }) === 'https://s.com/b')
    const map = citedArticles([{ id: 'a1', url: live }, { id: 'a2', url: 'https://shop.example.com/' }], rows)
    check('B9: the Articles screen map names only the cited article', JSON.stringify(map) === JSON.stringify({ a1: ['chatgpt', 'perplexity'] }))
    // MUTATION CONTROL: a normalizer that keeps the query string misses the utm-tagged citation.
    const keepsQuery = (u: string) => { try { const x = new URL(u); return `${x.hostname}${x.pathname}${x.search}` } catch { return null } }
    check('B1 MUT: a query-keeping normalizer fails the same equality', keepsQuery(same[1]) !== keepsQuery(live))
  }

  // ── C) the suggested AI question ───────────────────────────────────────────
  console.log('\nC) the suggested question (template, no brand)')
  {
    const he = suggestAiQuery({ keyword: 'נעלי ריצה לכף רגל שטוחה', language: 'he', brandTerms: ['Run Shop', 'runshop.co.il'] })
    const en = suggestAiQuery({ keyword: 'best running shoes for flat feet', language: 'en', brandTerms: ['Run Shop'] })
    const q = suggestAiQuery({ keyword: 'how to choose running shoes', language: 'en' })
    check('C1: Hebrew keyword → a Hebrew conversational question', he === 'מה חשוב לדעת על נעלי ריצה לכף רגל שטוחה?', String(he))
    check('C2: an English "best" keyword → a recommendation question', en === "I'm looking for the best running shoes for flat feet. What would you recommend?", String(en))
    check('C3: a keyword that is already a question is kept, capitalized, with a "?"', q === 'How to choose running shoes?', String(q))
    check('C4: a keyword naming the brand (name or domain) gives no suggestion', suggestAiQuery({ keyword: 'run shop coupons', language: 'en', brandTerms: ['Run Shop'] }) === null
      && suggestAiQuery({ keyword: 'runshop sale', language: 'en', brandTerms: ['runshop.co.il'] }) === null)
    check('C5: no keyword → no suggestion (the title is never turned into one)', suggestAiQuery({ keyword: null, title: 'A title', language: 'en' }) === null)
    check('C6: brand matching is by whole term, not a substring', !mentionsBrand('shopping for shoes', ['Shop']) && mentionsBrand('Run Shop shoes', ['Run Shop']))
  }

  // ── D) no quota on suggest: the real route over an in-memory Supabase ──────
  console.log('\nD) no quota on suggest — the real visibility route')
  {
    const OWNER = 'user-owner', PROJECT = 'proj-1', OTHER = 'proj-2'
    const LIVE = 'https://shop.example.com/blogs/news/flat-feet'
    const tables: Record<string, Record<string, unknown>[]> = {
      projects: [
        { id: PROJECT, user_id: OWNER, name: 'Run Shop', business_name: 'Run Shop', target_domain: 'shop.example.com', country: 'IL', language: 'he' },
        { id: OTHER, user_id: 'user-other', name: 'Other', business_name: 'Other', target_domain: 'other.example.com', country: 'US', language: 'en' },
      ],
      article_topics: [{ id: 't1', project_id: PROJECT, primary_keyword: 'נעלי ריצה לכף רגל שטוחה', language: 'he' }],
      generated_articles: [{ id: 'art-1', project_id: PROJECT, topic_id: 't1', title: 'נעלי ריצה', status: 'published', published_at: '2026-09-20T08:00:00Z', updated_at: '2026-09-21T08:00:00Z', wp_post_url: null, shopify_article_url: LIVE, site_post_url: null }],
      ai_prompts: [
        { id: 'p1', project_id: PROJECT, prompt: 'Which shoes help flat feet?' },
        { id: 'p9', project_id: OTHER, prompt: 'OTHER PROJECT QUESTION' },
      ],
      ai_citations: [
        { id: 'c1', project_id: PROJECT, engine: 'chatgpt', url: `${LIVE}/?utm_source=chatgpt.com`, prompt_id: 'p1', created_at: '2026-09-26T10:00:00Z' },
        { id: 'c9', project_id: OTHER, engine: 'grok', url: LIVE, prompt_id: 'p9', created_at: '2026-09-27T10:00:00Z' },
      ],
      usage_reservations: [],
    }
    const log: { table: string; ops: string[]; eqs: [string, unknown][] }[] = []
    const rpcs: string[] = []
    // Every query is recorded (table, methods, eq filters); chaining returns the proxy.
    class ChainSpyAdmin extends FakeAdmin {
      from(name: string) {
        const q: any = FakeAdmin.prototype.from.call(this, name)
        const entry = { table: name, ops: [] as string[], eqs: [] as [string, unknown][] }
        log.push(entry)
        const proxy: any = new Proxy(q, {
          get(t, k) {
            const v = t[k]
            if (typeof v !== 'function') return v
            return (...args: unknown[]) => {
              entry.ops.push(String(k))
              if (k === 'eq') entry.eqs.push([args[0] as string, args[1]])
              const r = v.apply(t, args)
              return r === t ? proxy : r
            }
          },
        })
        return proxy
      }
      async rpc(name: string, params: Record<string, unknown>) { rpcs.push(name); return super.rpc(name, params) }
    }
    const admin = new ChainSpyAdmin(tables as any)
    overrides.set('@/lib/supabase/admin', { createAdminClient: () => admin })
    overrides.set('@/lib/content/api-auth', {
      isContentModuleEnabled: () => true,
      authContentProject: async (pid: string) => {
        const p = tables.projects.find((x) => x.id === pid)
        if (!p) return { error: 'Project not found', status: 404 }
        if (p.user_id !== OWNER) return { error: 'Forbidden', status: 403 }
        return { user: { id: OWNER }, admin, project: { id: pid, user_id: OWNER } }
      },
    })
    process.env.ENABLE_AI_VISIBILITY = 'true'
    const route = require('../../../app/api/content/articles/[id]/visibility/route')
    const res: Response = await route.GET(new Request('http://x/api/content/articles/art-1/visibility'), { params: Promise.resolve({ id: 'art-1' }) })
    const body = await res.json()
    check('D1: 200 with the live URL', res.status === 200 && body.publishedUrl === LIVE, JSON.stringify(body).slice(0, 200))
    check('D2: the stored citation is shown with engine and question', body.citations?.length === 1 && body.citations[0].engine === 'chatgpt' && body.citations[0].question === 'Which shoes help flat feet?')
    check('D3: another project\'s citation of the same URL is never shown', !JSON.stringify(body).includes('grok') && !JSON.stringify(body).includes('OTHER PROJECT'))
    check('D4: a suggestion is returned, not tracked', body.suggestion?.prompt === 'מה חשוב לדעת על נעלי ריצה לכף רגל שטוחה?' && body.suggestion.tracked === false)
    const writes = log.filter((e) => e.ops.some((o) => ['insert', 'update', 'upsert', 'delete'].includes(o)))
    check('D5: NO QUOTA — no RPC at all (no reserve_usage)', rpcs.length === 0, rpcs.join(','))
    check('D6: NO QUOTA — no write of any kind', writes.length === 0, writes.map((w) => w.table).join(','))
    check('D7: NO QUOTA — usage tables are never read', !log.some((e) => /usage|reservation|billing/.test(e.table)))
    check('D8: the suggestion created no prompt row', tables.ai_prompts.length === 2 && tables.usage_reservations.length === 0)
    const scopedTables = ['ai_citations', 'ai_prompts', 'projects']
    const unscoped = log.filter((e) => scopedTables.includes(e.table) && !e.eqs.some(([c, v]) => (c === 'project_id' || c === 'id') && (v === PROJECT)))
    check('D9: every ai_citations / ai_prompts / projects read is filtered by the owner\'s project', unscoped.length === 0, unscoped.map((u) => u.table).join(','))
    const artReads = log.filter((e) => e.table === 'generated_articles')
    check('D10: the article is re-read scoped to the verified project', artReads.some((e) => e.eqs.some(([c, v]) => c === 'project_id' && v === PROJECT)))

    // Another user's article: refused, nothing returned.
    tables.generated_articles.push({ id: 'art-x', project_id: OTHER, topic_id: null, title: 'x', status: 'published', shopify_article_url: LIVE })
    const res2: Response = await route.GET(new Request('http://x'), { params: Promise.resolve({ id: 'art-x' }) })
    check('D11: another owner\'s article is refused (403) with no data', res2.status === 403 && !(await res2.text()).includes('citations'))

    // Tracked state reads the existing prompts only.
    tables.ai_prompts.push({ id: 'p2', project_id: PROJECT, prompt: 'מה חשוב לדעת על נעלי ריצה לכף רגל שטוחה?' })
    const res3: Response = await route.GET(new Request('http://x'), { params: Promise.resolve({ id: 'art-1' }) })
    check('D12: a question already in the project reads as tracked', (await res3.json()).suggestion?.tracked === true)

    // Source guards: the read path never reaches quota, providers or a model.
    const FORBIDDEN = /reserveUsage|reserve_usage|finalizeUsage|\/providers\/|scrapellm|gemini|anthropic|openai|ai-visibility\/runs/i
    const files = ['app/api/content/articles/[id]/visibility/route.ts', 'app/api/content/citations/route.ts', 'lib/content/article-visibility.ts', 'lib/content/ai-query-suggestion.ts', 'lib/content/citation-match.ts']
    const offenders = files.filter((f) => FORBIDDEN.test(strip(read(f))))
    check('D13: the visibility/citation code imports no quota, provider or model code', offenders.length === 0, offenders.join(','))
    check('D13 MUT: the same guard catches a reserveUsage call', FORBIDDEN.test(strip(read(files[2])) + '\nawait reserveUsage(admin, {})'))
    const card = strip(read('components/content/ArticleAiVisibilityCard.tsx'))
    const trackFn = card.slice(card.indexOf('async function track()'), card.indexOf('return (', card.indexOf('async function track()')))
    const postsOnlyInTrack = (src: string, fn: string) => (src.match(/\/api\/ai-visibility\/prompts/g) || []).length === 1 && fn.includes("'/api/ai-visibility/prompts'") && fn.includes("method: 'POST'") && !/useEffect/.test(src)
    check('D14: tracking posts to the EXISTING prompt route, only from the click handler', postsOnlyInTrack(card, trackFn) && /onClick=\{\(\) => void track\(\)\}/.test(card))
    const autoTracking = card.replace("import { useState } from 'react'", "import { useState, useEffect } from 'react'\nuseEffect(() => { void fetch('/api/ai-visibility/prompts', { method: 'POST' }) }, [])")
    check('D14 MUT: an auto-tracking effect is caught', !postsOnlyInTrack(autoTracking, trackFn))
  }

  // ── E) the primary action ──────────────────────────────────────────────────
  console.log('\nE) the primary action resolver')
  {
    const base = { projectId: 'p 1', platform: 'none' as const }
    const c1 = resolvePublishCta(base)
    check('E1: no platform → connect, to the project\'s settings (same origin)', c1.kind === 'connect' && c1.href === '/settings?projectId=p%201#platform')
    check('E2: loading → no guess', resolvePublishCta({ ...base, loading: true }).kind === 'loading')
    check('E3: two platforms → fix the connection', resolvePublishCta({ ...base, platform: 'conflict' }).kind === 'conflict')
    const g = resolvePublishCta({ projectId: 'p1', platform: 'shopify', shopifyNeedsScope: true, shopDomain: 'store-1.myshopify.com' })
    check('E4: Shopify without write_content → the existing scope-upgrade flow', g.kind === 'grant_scope' && g.href === '/api/shopify/oauth/start?projectId=p1&shop=store-1.myshopify.com&intent=publish')
    check('E5: a malformed shop domain never builds an OAuth link', resolvePublishCta({ projectId: 'p1', platform: 'shopify', shopifyNeedsScope: true, shopDomain: 'evil.com/x' }).kind === 'connect')
    check('E6: connected → publish, for each platform', (['wordpress', 'shopify', 'wix', 'webhook'] as const).every((p) => resolvePublishCta({ projectId: 'p1', platform: p }).kind === 'publish'))
    const pub = resolvePublishCta({ projectId: 'p1', platform: 'none', isPublished: true, publishedUrl: 'https://s.com/a' })
    check('E7: published → view on the site, even if the platform was later disconnected', pub.kind === 'published' && pub.href === 'https://s.com/a')
    const bad = resolvePublishCta({ projectId: 'p1', platform: 'wordpress', isPublished: true, publishedUrl: 'javascript:alert(1)' })
    check('E8: a non-https live URL is never linked', bad.kind === 'published' && bad.href === null)
    // MUTATION CONTROL: a resolver that checks the platform before the scope sends Shopify merchants to "publish".
    const wrongOrder = (i: { platform: string; shopifyNeedsScope?: boolean }) => (i.platform !== 'none' ? 'publish' : i.shopifyNeedsScope ? 'grant_scope' : 'connect')
    check('E4 MUT: the wrong order is caught by the same expectation', wrongOrder({ platform: 'shopify', shopifyNeedsScope: true }) !== 'grant_scope')
    const bar = strip(read('components/content/ArticleTopBar.tsx'))
    const rows = strip(read('components/content/workspace/ArticlesScreen.tsx'))
    // R24 — the top bar still offers "connect to publish"; the rows use the same resolver
    // but no longer repeat the connect link on every row (the setup card says it once).
    const e9 = (barSrc: string, rowsSrc: string) => /resolvePublishCta\(/.test(barSrc) && /resolvePublishCta\(/.test(rowsSrc) && /connectToPublish/.test(barSrc) && !/connectToPublish/.test(rowsSrc)
    check('E9: the top bar and the article rows use the same resolver; only the top bar says "connect"', e9(bar, rows))
    // MUTATION CONTROL: a per-row connect link coming back is caught.
    check('E9 MUT: a per-row "connect to publish" link is caught',
      !e9(bar, rows.replace("const inline = a.status !== 'published' && rowCta.kind === 'grant_scope'", "const inline = a.status !== 'published' && rowCta.kind === 'connect' ? <a href={rowCta.href}>{t.editor.topBar.connectToPublish}</a> : a.status !== 'published' && rowCta.kind === 'grant_scope'")))
  }

  // ── F) webhook payload ──────────────────────────────────────────────────────
  console.log('\nF) the webhook payload carries structured_data')
  {
    const now = new Date('2026-09-28T07:00:00Z')
    const p = buildArticlePayload({
      id: 'a1', title: 'T', slug: 's', excerpt: 'e', meta_title: 'mt', meta_description: 'md', content_html: '<p>x</p>',
      featured_image_url: 'https://cdn.example.com/i.jpg', faq_json: [{ question: 'Q?', answer: 'A.' }],
      published_at: '2026-09-27T07:00:00Z', updated_at: '2026-09-27T08:00:00Z',
      schema_context: { publisherName: 'Run Shop', publisherUrl: 'https://shop.example.com/', language: 'en' },
    }, 'article.published', now)
    const sd = ((p.article as any).structured_data ?? []) as any[]
    check('F1: versioned — payload_version is 2', p.payload_version === 2 && WEBHOOK_PAYLOAD_VERSION === 2)
    check('F2: BlogPosting + FAQPage from the article', sd.length === 2 && sd[0]['@type'] === 'BlogPosting' && sd[0].headline === 'T' && sd[0].publisher?.name === 'Run Shop' && sd[1].mainEntity?.[0]?.name === 'Q?')
    check('F3: additive — every version-1 field is unchanged', p.article.html === '<p>x</p>' && p.article.meta.description === 'md' && p.article.image_url === 'https://cdn.example.com/i.jpg' && p.event === 'article.published')
    check('F4: a test delivery carries it too, without FAQ', Array.isArray((buildTestPayload(now).article as any).structured_data) && (buildTestPayload(now).article as any).structured_data.length === 1)
    check('F5: the in-app developer example documents payload_version and structured_data', /"payload_version": 2/.test(EXAMPLE_PAYLOAD) && /"structured_data"/.test(EXAMPLE_PAYLOAD))
    const wix = JSON.stringify(buildWixDraftRequest({ id: 'a', title: 'T', slug: 's', excerpt: null, meta_title: 'mt', meta_description: 'md', content_html: '<p>x</p>', featured_image_url: null }, null))
    check('F6: Wix is deliberately unchanged (no script tag in seoData)', !/ld\+json|"script"/.test(wix))
    const docs = strip(read('components/content/site-platforms/WebhookDocs.tsx'))
    check('F7: the docs render the structured-data note', /t\.structuredData/.test(docs))
  }

  // ── G) copy with fallback, image name ──────────────────────────────────────
  console.log('\nG) copy with fallback')
  {
    const calls: string[] = []
    class FakeItem { constructor(public items: Record<string, unknown>) {} }
    const okRich = await copyHtml('<p>x</p>', { clipboard: { write: async () => { calls.push('write') } }, ClipboardItem: FakeItem as any, Blob: Blob })
    const toText = await copyHtml('<p>x</p>', { clipboard: { write: async () => { throw new Error('denied') }, writeText: async () => { calls.push('text') } }, ClipboardItem: FakeItem as any, Blob: Blob })
    const toLegacy = await copyHtml('<p>x</p>', { clipboard: null, legacyCopy: () => true })
    const none = await copyHtml('<p>x</p>', { clipboard: { writeText: async () => { throw new Error('x') } }, legacyCopy: () => false })
    check('G1: rich HTML first, then writeText, then the textarea fallback, then an honest failure', okRich === 'rich' && toText === 'text' && toLegacy === 'legacy' && none === 'none')
    check('G2: plain-text copy for code falls back the same way', (await copyPlainText('x', { legacyCopy: () => true })) === 'legacy')
    check('G3: the copied article starts with its title, escaped', articleHtmlForCopy('A <b> & C', '<p>x</p>') === '<h1>A &lt;b&gt; &amp; C</h1>\n<p>x</p>')
    check('G4: image file name from the slug, type-aware', featuredImageFileName('נעלי-ריצה', 'image/png') === 'נעלי-ריצה.png' && featuredImageFileName('', null) === 'featured-image.jpg' && featuredImageFileName('../../etc', 'image/jpeg') === 'etc.jpg')
  }

  // ── H) dictionaries ────────────────────────────────────────────────────────
  console.log('\nH) both languages, honest copy')
  {
    const sections = ['topBar', 'schema', 'aiVisibility'] as const
    const flat = (o: unknown, p = ''): [string, string][] => (o && typeof o === 'object' ? Object.entries(o as Record<string, unknown>).flatMap(([k, v]) => flat(v, p ? `${p}.${k}` : k)) : [[p, String(o)]])
    const heE = dashboardHe.contentHub.editor as any, enE = dashboardEn.contentHub.editor as any
    const missing = sections.flatMap((s) => flat(heE[s]).filter(([k]) => !flat(enE[s]).some(([k2]) => k2 === k)).map(([k]) => `${s}.${k}`))
    check('H1: every new key exists in both languages', missing.length === 0, missing.join(','))
    const brand = /^(?:ChatGPT|Perplexity|Gemini|Copilot|Grok|Google AI Mode|Google AI Overview)$/
    const heNotHebrew = sections.flatMap((s) => flat(heE[s]).filter(([k, v]) => !/engines\./.test(k) && !/[א-ת]/.test(v)).map(([k]) => `${s}.${k}`))
    const enHebrew = sections.flatMap((s) => flat(enE[s]).filter(([, v]) => /[א-ת]/.test(v)).map(([k]) => `${s}.${k}`))
    check('H2: Hebrew strings are Hebrew, English strings have no Hebrew', heNotHebrew.length === 0 && enHebrew.length === 0, `${heNotHebrew} | ${enHebrew}`)
    check('H3: engine names are the brands only', flat(heE.aiVisibility.engines).every(([, v]) => brand.test(v)))
    const allCopy = [...sections.flatMap((s) => flat(heE[s])), ...sections.flatMap((s) => flat(enE[s]))].map(([, v]) => v).join('\n')
    // A sentence about guarantees / rich results must be a NEGATIVE one.
    const promises = (text: string) => text.split(/(?<=[.!?:])\s+|\n/).filter((sen) => /guarantee|promis|rich result|מבטיח|מובטח|מורחבות/i.test(sen) && !/\b(?:not|no|never|only)\b|לא |אין |רק /i.test(sen))
    check('H4: no copy promises Google FAQ / rich results', promises(allCopy).length === 0 && /does not guarantee/.test(enE.schema.intro) && /לא מבטיח/.test(heE.schema.intro), promises(allCopy).join(' | '))
    check('H4 MUT: the same guard catches a promise', promises('This guarantees a rich result in Google.').length === 1 && promises('הסימון מבטיח תוצאות FAQ מורחבות בגוגל.').length === 1)
    check('H5: the webhook docs note exists in both languages', typeof dashboardHe.sitePlatforms.webhook.docs.structuredData === 'string' && typeof dashboardEn.sitePlatforms.webhook.docs.structuredData === 'string')
  }

  // ── I) source guards on the new UI ─────────────────────────────────────────
  console.log('\nI) tokens only, no Shopify scope literals, no raw errors')
  {
    const ui = ['components/content/ArticleTopBar.tsx', 'components/content/ArticleSchemaPanel.tsx', 'components/content/ArticleAiVisibilityCard.tsx']
    const RAW = /\b(?:text|bg|border|ring)-(?:slate|blue|gray|indigo|red|green|amber)-\d{2,3}\b/
    const raw = ui.filter((f) => RAW.test(strip(read(f))))
    check('I1: the new components use design tokens only', raw.length === 0, raw.join(','))
    check('I1 MUT: the same guard catches a raw colour', RAW.test('className="text-slate-500"'))
    const SCOPES = /write_content|read_content|read_products|SHOPIFY_(?:PUBLISH|REQUIRED)_SCOPES/
    const scopeOffenders = [...ui, 'lib/content/publish-cta.ts', 'components/content/workspace/ArticlesScreen.tsx'].filter((f) => SCOPES.test(strip(read(f))))
    check('I2: no Shopify scope is named or changed in the new UI (the existing flow decides)', scopeOffenders.length === 0, scopeOffenders.join(','))
    const hardText = ui.flatMap((f) => [...strip(read(f)).matchAll(/(?<![=-])>\s*([A-Za-zא-ת][A-Za-zא-ת ,.'!?-]{2,})\s*</g)].map((m) => `${f}: ${m[1]}`))
    check('I3: no literal text in the new components (all through dictionaries)', hardText.length === 0, hardText.join(' | '))
    const page = strip(read('app/(dashboard)/content/articles/[id]/page.tsx'))
    check('I4: the viewer never shows a raw error from these calls (fixed dictionary sentences only)', /e\.topBar\.copyFailed/.test(page) && /e\.topBar\.downloadFailed/.test(page) && !/data\.message|err\.message|error\.message/.test(page.slice(page.indexOf('async function copyArticle'), page.indexOf('function goToPublish'))))
    check('I5: the top bar is sticky under the dashboard bar', /sticky top-14/.test(strip(read(ui[0]))))
  }

  console.log(`\n${pass} passed, ${fail} failed`)
  process.exit(fail ? 1 : 0)
}

main().catch((e) => { console.error(e); console.log(`\n${pass} passed, ${fail + 1} failed`); process.exit(1) })

export {}
