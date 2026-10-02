/**
 * Wix Blog publisher. Server-side only.
 *
 * Endpoints (Wix REST, https://www.wixapis.com). dev.wix.com is not reachable
 * from the build environment, so they were confirmed against Wix's OWN published
 * SDK packages on the npm registry, which carry the REST paths they call:
 *   @wix/auto_sdk_blog_draft-posts@1.0.108  (build/cjs/index.js, meta.js)
 *     POST /blog/v3/draft-posts                 CreateDraftPost { draftPost, publish?, fieldsets? }
 *     POST /blog/v3/draft-posts/{draftPostId}/publish   PublishDraftPost
 *       ("For 3rd-party apps, `memberId` is a required field.")
 *   @wix/auto_sdk_blog_posts@1.0.188
 *     GET  /blog/v3/posts                       ListPosts (paging.limit)
 *   @wix/sdk@1.21.16  build/auth/ApiKeyAuthStrategy.js
 *     API-key auth = headers `Authorization: <api key>` and `wix-site-id: <site id>`.
 *   @wix/sdk-runtime@1.0.25  transformations/image.js
 *     a non-Wix image becomes `{ url }` in REST (draftPost.media.wixMedia.image).
 *
 * We create the draft with `publish: true`, so one request creates AND publishes.
 * The content goes in as Ricos rich content (htmlToRicos below): Wix has no
 * "HTML body" field on a post, and an HTML-embed node would hide the text from
 * search engines inside an iframe.
 */
import type { SitePublishArticle, SitePublishResult, SiteErrorCode } from './types'

export const WIX_API_BASE = 'https://www.wixapis.com'
export const WIX_LIST_POSTS_PATH = '/blog/v3/posts?paging.limit=1'
export const WIX_CREATE_DRAFT_PATH = '/blog/v3/draft-posts'
export const WIX_TIMEOUT_MS = 20_000

export type WixCreds = { siteId: string; apiKey: string }
export type FetchLike = (url: string, init: { method: string; headers: Record<string, string>; body?: string; signal?: AbortSignal; redirect?: 'manual' | 'error' }) =>
  Promise<{ status: number; text(): Promise<string> }>

function wixHeaders(c: WixCreds): Record<string, string> {
  return { Authorization: c.apiKey, 'wix-site-id': c.siteId, 'Content-Type': 'application/json', Accept: 'application/json' }
}

async function call(fetchImpl: FetchLike, path: string, init: { method: string; headers: Record<string, string>; body?: string }) {
  const ac = new AbortController()
  const timer = setTimeout(() => ac.abort(), WIX_TIMEOUT_MS)
  try {
    const res = await fetchImpl(`${WIX_API_BASE}${path}`, { ...init, signal: ac.signal, redirect: 'error' })
    const text = await res.text().catch(() => '')
    let json: unknown = null
    try { json = text ? JSON.parse(text) : null } catch { json = null }
    return { status: res.status, json }
  } catch {
    return { status: 0, json: null }
  } finally {
    clearTimeout(timer)
  }
}

function codeForStatus(status: number): { code: SiteErrorCode; retryable: boolean } {
  if (status === 401 || status === 403) return { code: 'wix_auth_failed', retryable: false }
  if (status === 404) return { code: 'wix_blog_missing', retryable: false }
  if (status === 0 || status === 429 || status >= 500) return { code: 'wix_unavailable', retryable: true }
  return { code: 'wix_rejected', retryable: false }
}

/**
 * "Test connection": ONE harmless read — list at most one post. Proves the key
 * and site id belong together and that the site has Wix Blog. When the blog
 * already has a post, its author becomes the author of ours (Wix requires a
 * member as the owner of a post created by an app).
 */
export async function testWixConnection(creds: WixCreds, fetchImpl: FetchLike = fetch as unknown as FetchLike):
  Promise<{ ok: true; memberId: string | null } | { ok: false; code: SiteErrorCode; retryable: boolean }> {
  const res = await call(fetchImpl, WIX_LIST_POSTS_PATH, { method: 'GET', headers: wixHeaders(creds) })
  if (res.status < 200 || res.status >= 300) return { ok: false, ...codeForStatus(res.status) }
  const posts = (res.json as { posts?: { memberId?: unknown }[] } | null)?.posts
  const memberId = Array.isArray(posts) && typeof posts[0]?.memberId === 'string' ? posts[0].memberId : null
  return { ok: true, memberId }
}

// ── HTML → Ricos ──────────────────────────────────────────────────────────────
// The article HTML the pipeline writes is simple and well formed: headings,
// paragraphs, lists, links, emphasis, images, blockquotes, and sometimes a
// table. Those map onto Ricos nodes directly; anything else (a table, a script
// the sanitizer already removed upstream) becomes an HTML node so no content is
// silently dropped.

type RicosNode = Record<string, unknown> & { type: string; id: string; nodes: RicosNode[] }
type Decoration = Record<string, unknown>
type Token = { kind: 'open' | 'close' | 'self'; tag: string; attrs: string } | { kind: 'text'; text: string }

const ENTITIES: Record<string, string> = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' }
function decode(s: string): string {
  return s.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (m, e: string) => {
    if (e[0] === '#') {
      const n = e[1] === 'x' || e[1] === 'X' ? parseInt(e.slice(2), 16) : parseInt(e.slice(1), 10)
      return Number.isFinite(n) && n > 0 && n < 0x110000 ? String.fromCodePoint(n) : m
    }
    return ENTITIES[e.toLowerCase()] ?? m
  })
}
function attr(attrs: string, name: string): string | null {
  const m = new RegExp(`\\b${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i').exec(attrs)
  return m ? decode(m[2] ?? m[3] ?? m[4] ?? '') : null
}
const VOID = new Set(['br', 'img', 'hr', 'meta', 'link', 'input', 'source', 'wbr'])

function tokenize(html: string): Token[] {
  const out: Token[] = []
  const re = /<!--[\s\S]*?-->|<\/?([a-zA-Z][a-zA-Z0-9]*)([^>]*)>|[^<]+|</g
  let m: RegExpExecArray | null
  while ((m = re.exec(html))) {
    const s = m[0]
    if (s.startsWith('<!--')) continue
    if (m[1]) {
      const tag = m[1].toLowerCase()
      if (s.startsWith('</')) out.push({ kind: 'close', tag, attrs: '' })
      else out.push({ kind: VOID.has(tag) || /\/\s*>$/.test(s) ? 'self' : 'open', tag, attrs: m[2] ?? '' })
    } else {
      out.push({ kind: 'text', text: s })
    }
  }
  return out
}

let idSeq = 0
function nid(): string { idSeq += 1; return `n${idSeq.toString(36)}` }
function node(type: string, extra: Record<string, unknown> = {}, nodes: RicosNode[] = []): RicosNode {
  return { type, id: nid(), nodes, ...extra }
}
function textNode(text: string, decorations: Decoration[]): RicosNode {
  return { type: 'TEXT', id: '', nodes: [], textData: { text, decorations } }
}
function safeHref(href: string | null): string | null {
  if (!href) return null
  return /^https?:\/\//i.test(href) || href.startsWith('/') || href.startsWith('#') ? href : null
}

/** Inline content (text with bold/italic/link) of a block, until its closing tag. */
function readInline(tokens: Token[], start: number, closeTag: string): { nodes: RicosNode[]; next: number } {
  const nodes: RicosNode[] = []
  const stack: { tag: string; deco: Decoration }[] = []
  let i = start
  for (; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.kind === 'close' && t.tag === closeTag && !stack.some((s) => s.tag === closeTag)) return { nodes, next: i + 1 }
    if (t.kind === 'text') {
      const text = decode(t.text)
      if (text) nodes.push(textNode(text, stack.map((s) => s.deco)))
    } else if (t.kind === 'self' && t.tag === 'br') {
      nodes.push(textNode('\n', stack.map((s) => s.deco)))
    } else if (t.kind === 'open') {
      if (t.tag === 'strong' || t.tag === 'b') stack.push({ tag: t.tag, deco: { type: 'BOLD', fontWeightValue: 700 } })
      else if (t.tag === 'em' || t.tag === 'i') stack.push({ tag: t.tag, deco: { type: 'ITALIC', italicData: true } })
      else if (t.tag === 'u') stack.push({ tag: t.tag, deco: { type: 'UNDERLINE', underlineData: true } })
      else if (t.tag === 'a') {
        const href = safeHref(attr(t.attrs, 'href'))
        stack.push({ tag: 'a', deco: href ? { type: 'LINK', linkData: { link: { url: href, target: href.startsWith('http') ? 'BLANK' : 'SELF' } } } : {} })
      } else stack.push({ tag: t.tag, deco: {} })
    } else if (t.kind === 'close') {
      const at = stack.map((s) => s.tag).lastIndexOf(t.tag)
      if (at >= 0) stack.splice(at, 1)
    }
  }
  return { nodes, next: i }
}
const cleanDecos = (nodes: RicosNode[]) => {
  for (const n of nodes) {
    const td = n.textData as { decorations: Decoration[] } | undefined
    if (td) td.decorations = td.decorations.filter((d) => typeof d.type === 'string')
  }
  return nodes
}
function paragraph(nodes: RicosNode[]): RicosNode {
  return node('PARAGRAPH', { paragraphData: {} }, cleanDecos(nodes))
}

/** The raw HTML of an element we do not map (e.g. a table), until its matching close. */
function captureRaw(tokens: Token[], start: number, tag: string): { html: string; next: number } {
  let depth = 0
  let html = ''
  let i = start
  for (; i < tokens.length; i++) {
    const t = tokens[i]
    if (t.kind === 'text') html += t.text
    else if (t.kind === 'self') html += `<${t.tag}${t.attrs}>`
    else if (t.kind === 'open') { if (t.tag === tag) depth++; html += `<${t.tag}${t.attrs}>` }
    else { html += `</${t.tag}>`; if (t.tag === tag && --depth === 0) return { html, next: i + 1 } }
  }
  return { html, next: i }
}

function readList(tokens: Token[], start: number, tag: 'ul' | 'ol'): { node: RicosNode; next: number } {
  const items: RicosNode[] = []
  let i = start
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.kind === 'close' && t.tag === tag) { i++; break }
    if (t.kind === 'open' && t.tag === 'li') {
      const inner = readInline(tokens, i + 1, 'li')
      items.push(node('LIST_ITEM', {}, [paragraph(inner.nodes)]))
      i = inner.next
      continue
    }
    i++
  }
  return { node: node(tag === 'ul' ? 'BULLETED_LIST' : 'ORDERED_LIST', tag === 'ul' ? { bulletedListData: {} } : { orderedListData: {} }, items), next: i }
}

function imageNode(src: string, alt: string | null): RicosNode {
  return node('IMAGE', { imageData: { image: { src: { url: src } }, altText: alt ?? undefined, containerData: { width: { size: 'CONTENT' }, alignment: 'CENTER' } } })
}

/** Convert article HTML into a Ricos document (`draftPost.richContent`). Pure. */
export function htmlToRicos(html: string): { nodes: RicosNode[] } {
  idSeq = 0
  const tokens = tokenize(String(html ?? ''))
  const nodes: RicosNode[] = []
  let loose: RicosNode[] = []
  const flush = () => { if (loose.some((n) => String((n.textData as { text?: string })?.text ?? '').trim())) nodes.push(paragraph(loose)); loose = [] }
  let i = 0
  while (i < tokens.length) {
    const t = tokens[i]
    if (t.kind === 'open' && /^h[1-6]$/.test(t.tag)) {
      flush()
      const inner = readInline(tokens, i + 1, t.tag)
      nodes.push(node('HEADING', { headingData: { level: Number(t.tag[1]) } }, cleanDecos(inner.nodes)))
      i = inner.next
    } else if (t.kind === 'open' && t.tag === 'p') {
      flush()
      const inner = readInline(tokens, i + 1, 'p')
      if (inner.nodes.length) nodes.push(paragraph(inner.nodes))
      i = inner.next
    } else if (t.kind === 'open' && (t.tag === 'ul' || t.tag === 'ol')) {
      flush()
      const list = readList(tokens, i + 1, t.tag)
      nodes.push(list.node)
      i = list.next
    } else if (t.kind === 'open' && t.tag === 'blockquote') {
      flush()
      const inner = readInline(tokens, i + 1, 'blockquote')
      nodes.push(node('BLOCKQUOTE', { blockquoteData: {} }, [paragraph(inner.nodes)]))
      i = inner.next
    } else if ((t.kind === 'self' || t.kind === 'open') && t.tag === 'img') {
      flush()
      const src = attr(t.attrs, 'src')
      if (src && /^https:\/\//i.test(src)) nodes.push(imageNode(src, attr(t.attrs, 'alt')))
      i++
    } else if (t.kind === 'self' && t.tag === 'hr') {
      flush()
      nodes.push(node('DIVIDER', { dividerData: {} }))
      i++
    } else if (t.kind === 'open' && (t.tag === 'table' || t.tag === 'iframe' || t.tag === 'pre')) {
      flush()
      const raw = captureRaw(tokens, i, t.tag)
      nodes.push(node('HTML', { htmlData: { html: raw.html, source: 'HTML', containerData: { width: { size: 'CONTENT' } } } }))
      i = raw.next
    } else if (t.kind === 'open' && ['div', 'section', 'article', 'figure', 'figcaption', 'header', 'footer', 'main', 'span'].includes(t.tag)) {
      // Containers are transparent: their children are read as blocks.
      if (t.tag === 'span') {
        const inner = readInline(tokens, i + 1, 'span')
        loose.push(...inner.nodes)
        i = inner.next
      } else i++
    } else if (t.kind === 'close') {
      i++
    } else if (t.kind === 'text') {
      const text = decode(t.text)
      if (text.trim()) loose.push(textNode(text, []))
      i++
    } else if (t.kind === 'open' && ['strong', 'b', 'em', 'i', 'a', 'u'].includes(t.tag)) {
      const inner = readInline(tokens, i, '__never__')
      loose.push(...inner.nodes)
      i = inner.next
    } else {
      i++
    }
  }
  flush()
  return { nodes }
}

/** The request body we send to CreateDraftPost. Exported for the QA suite. */
export function buildWixDraftRequest(article: SitePublishArticle, memberId: string | null) {
  const image = article.featured_image_url && /^https:\/\//i.test(article.featured_image_url) ? article.featured_image_url : null
  const tags: { type: string; children?: string; props?: Record<string, string> }[] = []
  if (article.meta_title) tags.push({ type: 'title', children: article.meta_title })
  if (article.meta_description) tags.push({ type: 'meta', props: { name: 'description', content: article.meta_description } })
  const draftPost: Record<string, unknown> = {
    title: String(article.title ?? '').slice(0, 200),
    richContent: htmlToRicos(article.content_html ?? ''),
  }
  if (article.excerpt) draftPost.excerpt = article.excerpt.slice(0, 500)
  if (article.slug) draftPost.seoSlug = article.slug.slice(0, 100)
  if (memberId) draftPost.memberId = memberId
  if (image) draftPost.media = { wixMedia: { image: { url: image } }, displayed: true, custom: true }
  if (tags.length) draftPost.seoData = { tags }
  return { draftPost, publish: true, fieldsets: ['URL'] }
}

function postUrl(u: unknown): string | null {
  if (typeof u === 'string') return /^https:\/\//i.test(u) ? u : null
  const o = u as { base?: unknown; path?: unknown } | null
  if (o && typeof o.base === 'string' && typeof o.path === 'string') {
    const full = /^https?:\/\//i.test(o.base) ? `${o.base}${o.path}` : `https://${o.base}${o.path}`
    return full.replace(/^http:\/\//i, 'https://').slice(0, 2048)
  }
  return null
}

/** The publisher adapter: create the post and publish it, in one request. */
export async function publishToWix(
  creds: WixCreds & { memberId: string | null },
  article: SitePublishArticle,
  fetchImpl: FetchLike = fetch as unknown as FetchLike,
): Promise<SitePublishResult> {
  if (!article.title || !article.content_html) return { ok: false, code: 'article_empty', retryable: false }
  const body = buildWixDraftRequest(article, creds.memberId)
  const res = await call(fetchImpl, WIX_CREATE_DRAFT_PATH, { method: 'POST', headers: wixHeaders(creds), body: JSON.stringify(body) })
  if (res.status < 200 || res.status >= 300) {
    // Wix requires an owner member for an app-created post. Without one (a blog
    // with no posts yet, so "test connection" could not read an author) a 400
    // is that — the merchant is told to publish one post in Wix first.
    if (res.status === 400 && !creds.memberId) return { ok: false, code: 'wix_no_author', retryable: false }
    return { ok: false, ...codeForStatus(res.status) }
  }
  const draft = (res.json as { draftPost?: { id?: unknown; url?: unknown } } | null)?.draftPost
  if (!draft || typeof draft.id !== 'string') return { ok: false, code: 'wix_unavailable', retryable: true }
  return { ok: true, postId: draft.id, url: postUrl(draft.url) }
}
