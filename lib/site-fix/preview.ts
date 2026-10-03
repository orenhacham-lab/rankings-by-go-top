/**
 * The READ-ONLY step before an approval: what the page holds now, what we propose, and the value
 * the write will compare against (`expected`: a page changed in between is refused).
 *
 * Where the page is read from depends on the channel the fix would take:
 *   plugin        the plugin's signed /inspect (the post's content and its stored SEO fields)
 *   app_password  the WordPress REST API (the content; SEO fields as the public page shows them)
 *   webhook, manual  the public page only (we will not write it ourselves; `expected` is null)
 *
 * Proposals come from the page's own words (lib/site-health/rules.ts) and, where those fall short,
 * from the model with the page as its only source (./suggest.ts). Each is checked before it is
 * shown: a title or description that fails its check is never offered (`no_valid_suggestion`), FAQ
 * answers are checked against the page, and a thin page says so (`thin_content`). The merchant edits
 * every proposal before approving. Failures are stable codes.
 *
 * Two 2.1.0 types:
 *   h1_demote  the plugin's own report of the content's headings, against the public page's
 *              headings (./h1.ts decides whether it is provably safe; the reason when it is not).
 *   llms_txt   built from the site's own pages (site_page_map, else the home page's links) and their
 *              own descriptions; refused when the site already answers /llms.txt. Offered to copy on
 *              sites without the plugin (`copyOnly`).
 */
import { domainKey, extractSiteSignals, fetchSiteHtml, fetchSiteText, normalizeCheckUrl } from '@/lib/free-check'
import { hostPinnedFetch } from '@/lib/seed-scan/site-access'
import { PAGE_MS } from '@/lib/site-health/scan'
import {
  cutAtWord, DESCRIPTION_MAX, DESCRIPTION_MIN, DESCRIPTION_TARGET, pathOf, suggestAlt, textOf, TITLE_MAX, TITLE_MIN,
  TITLE_TARGET,
} from '@/lib/site-health/rules'
import type { FindingKind } from '@/lib/site-health/types'
import { imagesMissingAlt, previewFix, sha, wpFailure, type WpFixDeps } from '@/lib/site-health/wordpress-fix'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { brokenLinkWords } from './content'
import { planH1Demotion } from './h1'
import { pluginInspect, pluginSearch, type PluginItem, type PluginLink, type PluginPost } from './plugin-client'
import { buildLlmsTxt, pageLanguage, suggestFaq, suggestMetaDescription, suggestSeoTitle, thinContent, type Generate, type LlmsPage } from './suggest'
import type { FaqItem, FixChannel, FixErrorCode, FixType, H1Ref } from './types'

export interface LivePage {
  title: string | null
  description: string | null
  h1: string | null
  canonical: string | null
  schemaTypes: string[]
  html: string
  /** Every main heading a visitor gets (h1_demote). */
  h1s?: string[]
  /** Same-site links of the page (llms.txt without a site map). */
  links?: string[]
}

/** A small text file of the site as a visitor gets it (llms.txt), or null when it cannot be read. */
export type TextReader = (url: string) => Promise<{ status: number; text: string } | null>

/** The site's own pages, for llms.txt: from the full-site mapping (site_page_map). */
export type SitePages = () => Promise<{ url: string; title: string | null; kind: string | null }[]>

/** How the value will reach the page, for the sentence under the preview. */
export type Via = 'plugin_seo' | 'plugin_own' | 'seo_plugin' | 'wp_title' | 'content' | 'webhook' | 'manual'

type Limits = { min: number; max: number; target: number }
export type FixPreview =
  | { ok: true; type: 'seo_title' | 'meta_description'; before: string; after: string; expected: string | null; via: Via; limits: Limits; serp: { title: string; description: string } }
  | { ok: true; type: 'focus_keyphrase' | 'canonical'; before: string; after: string; expected: string | null; via: Via }
  | { ok: true; type: 'schema_jsonld'; before: string[]; schema: Record<string, unknown>; expected: string | null; via: Via }
  | { ok: true; type: 'image_alt'; images: { src: string; after: string }[]; expected: string | null; via: Via }
  | { ok: true; type: 'faq_block'; items: FaqItem[]; heading: string; notice: 'thin_content' | 'no_valid_suggestion' | null; expected: string | null; via: Via }
  | { ok: true; type: 'h1_demote'; headings: H1Ref[]; keep: string; keepFrom: 'theme' | 'content'; expected: string | null; via: Via }
  | { ok: true; type: 'llms_txt'; text: string; pages: number; fileUrl: string; copyOnly: boolean; expected: string | null; via: Via }
  | { ok: true; type: 'broken_link'; pageUrl: string; href: string; words: string[]; expected: string | null; via: Via }
  | { ok: true; type: 'internal_link'; pageUrl: string; sourceTitle: string; target: string; anchor: string; sentence: string; expected: string | null; via: Via }
  | { ok: false; code: FixErrorCode; reason?: string }

export interface PreviewContext {
  channel: FixChannel
  creds: WordPressCredentials | null
  link: PluginLink | null
  siteName: string | null
}

export interface PreviewDeps {
  wp: WpFixDeps
  readLive: (url: string) => Promise<LivePage | null>
  pluginPost?: PluginPost
  /** The model, for titles, descriptions and FAQ the page's own words cannot give (./suggest.ts). */
  generate?: Generate
  /** llms.txt: the site's own companion file and its mapped pages. */
  readText?: TextReader
  sitePages?: SitePages
}

export interface PreviewRequest {
  type: FixType
  /** The finding's page: the page itself, or for broken_link the dead address and for internal_link the page that gets the link. */
  url: string
  kind: FindingKind
  /** broken_link: the page the dead link is on. */
  from?: string
  /** internal_link: the words to look for. */
  keyword?: string
}

const TITLE_LIMITS: Limits = { min: TITLE_MIN, max: TITLE_MAX, target: TITLE_TARGET }
const DESCRIPTION_LIMITS: Limits = { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX, target: DESCRIPTION_TARGET }
const fail = (code: FixErrorCode, reason?: string): FixPreview => (reason ? { ok: false, code, reason } : { ok: false, code })

/** The public page as a visitor gets it: pinned to the project's host, capped, never following off-site. */
export function liveReader(base: typeof fetch = fetch): (url: string) => Promise<LivePage | null> {
  return async (raw) => {
    const u = normalizeCheckUrl(raw)
    if (!u.ok) return null
    const clock = new AbortController()
    const timer = setTimeout(() => clock.abort(), PAGE_MS)
    try {
      const fetchImpl = hostPinnedFetch({ siteKey: domainKey(u.url), base, deadline: clock.signal, trace: [], offHost: { hit: false } })
      const got = await fetchSiteHtml(u.url, { fetchImpl })
      if (!got.ok) return null
      const s = extractSiteSignals(got.html, got.url, { robotsTxt: null, llmsTxt: false })
      return {
        title: s.title, description: s.metaDescription, h1: s.h1[0] ?? null, canonical: s.canonical, schemaTypes: s.schemaTypes, html: got.html,
        h1s: s.h1, links: s.internalLinkUrls,
      }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

/** A companion text file (llms.txt) through the same pinned, capped path. */
export function liveTextReader(base: typeof fetch = fetch): TextReader {
  return async (raw) => {
    const u = normalizeCheckUrl(raw)
    if (!u.ok) return null
    const clock = new AbortController()
    const timer = setTimeout(() => clock.abort(), PAGE_MS)
    try {
      const fetchImpl = hostPinnedFetch({ siteKey: domainKey(u.url), base, deadline: clock.signal, trace: [], offHost: { hit: false } })
      const got = await fetchSiteText(u.url, { fetchImpl })
      return got.ok ? { status: got.status, text: got.text } : null
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
}

/** A real llms.txt answer: 200, some text, and not an HTML page (a site that answers every address with its home page). */
export function isRealLlmsTxt(r: { status: number; text: string } | null): boolean {
  if (!r || r.status !== 200) return false
  const t = r.text.trim()
  return t.length > 0 && !/^<(?:!doctype|html|head|body)\b/i.test(t)
}

/** The page's own address as its canonical: no query, no fragment. */
export function canonicalFor(url: string): string {
  try { const u = new URL(url); u.search = ''; u.hash = ''; return u.toString() } catch { return url }
}

/** A JSON-LD object from the page's own facts: who the business is, and what this page is. */
export function schemaFor(page: { url: string; title: string; description: string | null; kind: 'home' | 'article' | 'page' }, site: { name: string | null; url: string }): Record<string, unknown> {
  const org = { '@type': 'Organization', name: site.name || new URL(site.url).hostname.replace(/^www\./, ''), url: site.url }
  if (page.kind === 'home') {
    return { '@context': 'https://schema.org', '@graph': [org, { '@type': 'WebSite', name: org.name, url: site.url }] }
  }
  if (page.kind === 'article') {
    return {
      '@context': 'https://schema.org', '@type': 'Article', headline: cutAtWord(page.title, 110), url: page.url,
      ...(page.description ? { description: page.description } : {}), publisher: org,
    }
  }
  return {
    '@context': 'https://schema.org', '@type': 'WebPage', name: cutAtWord(page.title, 110), url: page.url,
    ...(page.description ? { description: page.description } : {}), publisher: org,
  }
}

/** The images of an HTML text without alt text, by a linear scan (no backtracking on broken markup). */
export function htmlImagesMissingAlt(html: string, max = 20): string[] {
  const out: string[] = []
  const lower = html.toLowerCase()
  let at = lower.indexOf('<img')
  while (at >= 0 && out.length < max) {
    const end = lower.indexOf('>', at)
    if (end < 0) break
    const tag = html.slice(at, end + 1)
    const src = tag.match(/\ssrc\s*=\s*("([^"]*)"|'([^']*)')/i)
    const alt = tag.match(/\salt\s*=\s*("([^"]*)"|'([^']*)')/i)
    const s = src ? (src[2] ?? src[3] ?? '') : ''
    if (s && !s.startsWith('data:') && (!alt || !(alt[2] ?? alt[3] ?? '').trim()) && !out.includes(s)) out.push(s)
    at = lower.indexOf('<img', end)
  }
  return out
}

const plainTitle = (s: string | null | undefined) => String(s ?? '').replace(/\s+/g, ' ').trim()

/** A plugin-backed WordPress reader, so the existing link and alt previews run on plugin sites too. */
function pluginWp(link: PluginLink, base: WpFixDeps, post?: PluginPost): WpFixDeps & { item: (url: string) => Promise<PluginItem | FixErrorCode> } {
  const byUrl = new Map<string, PluginItem>()
  const byId = new Map<number, PluginItem>()
  const item = async (url: string): Promise<PluginItem | FixErrorCode> => {
    const hit = byUrl.get(url)
    if (hit) return hit
    const r = await pluginInspect(link, url, post)
    if (!r.ok) return r.code
    byUrl.set(url, r.body.item)
    byId.set(r.body.item.post_id, r.body.item)
    return r.body.item
  }
  return {
    ...base,
    item,
    findItemByUrl: async (_c, url) => {
      const it = await item(url)
      if (typeof it === 'string') return null
      return { endpoint: it.post_type === 'page' ? '/pages' : '/posts', id: it.post_id, link: it.link }
    },
    getItemForEdit: async (_c, _e, id) => {
      const it = byId.get(id)
      if (!it) throw new Error('not inspected')
      return { endpoint: it.post_type === 'page' ? '/pages' : '/posts', id: it.post_id, title: it.title, content: it.content, link: it.link }
    },
    searchItems: async (_c, _e, term) => {
      const r = await pluginSearch(link, term, post)
      return r.ok ? r.body.items.map((i) => ({ id: i.post_id, link: i.link, title: i.title })) : []
    },
  }
}

const CHANNEL_VIA: Record<'webhook' | 'manual', Via> = { webhook: 'webhook', manual: 'manual' }

export async function previewFixJob(req: PreviewRequest, ctx: PreviewContext, deps: PreviewDeps): Promise<FixPreview> {
  try {
    if (req.type === 'llms_txt') return await previewLlms(req, ctx, deps)
    if (ctx.channel === 'plugin' && ctx.link) return await previewViaPlugin(req, ctx, ctx.link, deps)
    if (ctx.channel === 'app_password' && ctx.creds) return await previewViaRest(req, ctx, ctx.creds, deps)
    if (ctx.channel === 'webhook' || ctx.channel === 'manual') return await previewPublic(req, ctx, CHANNEL_VIA[ctx.channel], deps)
    return fail('no_channel')
  } catch (err) {
    const code = wpFailure(err)
    return fail(code === 'wordpress_permission' ? 'wordpress_permission' : 'plugin_unreachable')
  }
}

function kindOf(req: PreviewRequest, siteUrl: string, postType?: string): 'home' | 'article' | 'page' {
  try { if (new URL(req.url).pathname.replace(/\/+$/, '') === '' || canonicalFor(req.url) === canonicalFor(siteUrl)) return 'home' } catch { /* keep */ }
  return postType === 'post' ? 'article' : 'page'
}

async function previewViaPlugin(req: PreviewRequest, ctx: PreviewContext, link: PluginLink, deps: PreviewDeps): Promise<FixPreview> {
  const wp = pluginWp(link, deps.wp, deps.pluginPost)
  const creds = { siteUrl: link.siteUrl, username: '', applicationPassword: '' }

  if (req.type === 'internal_link') {
    const p = await previewFix(creds, { field: 'link', url: req.url, kind: req.kind, siteName: ctx.siteName, keyword: req.keyword }, wp)
    if (!p.ok) return fail(p.code === 'no_safe_place' ? 'no_safe_place' : p.code === 'not_in_wordpress' ? 'not_in_wordpress' : 'plugin_unreachable')
    if (p.field !== 'link') return fail('invalid_request')
    return { ok: true, type: 'internal_link', pageUrl: p.sourceUrl, sourceTitle: p.sourceTitle, target: p.targetUrl, anchor: p.anchor, sentence: p.sentenceBefore, expected: p.expected, via: 'content' }
  }

  const pageUrl = req.type === 'broken_link' ? String(req.from ?? '') : req.url
  const it = await wp.item(pageUrl)
  if (typeof it === 'string') return fail(it)
  const seoVia: Via = it.seo_plugin === 'none' ? 'plugin_own' : 'plugin_seo'

  switch (req.type) {
    case 'image_alt': {
      const missing = imagesMissingAlt(it.content)
      if (missing.length === 0) return fail('nothing_to_fix')
      return { ok: true, type: 'image_alt', images: missing.slice(0, 20).map((i) => ({ src: i.src, after: suggestAlt(i.src, it.title) })), expected: it.content_sha, via: 'content' }
    }
    case 'broken_link': {
      const words = brokenLinkWords(it.content, req.url, new URL(link.siteUrl).hostname)
      if (words.length === 0) return fail('nothing_to_fix')
      return { ok: true, type: 'broken_link', pageUrl, href: req.url, words, expected: it.content_sha, via: 'content' }
    }
    case 'faq_block':
      return await previewFaq(await faqSourceText(textOf(it.content), req.url, deps), it.title, it.content_sha, 'content', deps)
    case 'h1_demote': {
      if (!Object.prototype.hasOwnProperty.call(it, 'h1')) return fail('needs_update')
      const live = await deps.readLive(req.url)
      if (!live) return fail('plugin_unreachable')
      const plan = planH1Demotion({ contentH1: it.h1 ?? null, liveH1: live.h1s ?? (live.h1 ? [live.h1] : []), builder: !!it.builder })
      if (!plan.ok) return plan.reason === 'nothing' ? fail('nothing_to_fix') : fail('h1_not_safe', plan.reason)
      return { ok: true, type: 'h1_demote', headings: plan.demote, keep: plan.keep, keepFrom: plan.keepFrom, expected: it.content_sha, via: 'content' }
    }
    default:
      return previewMeta(req, ctx, deps, {
        stored: {
          seo_title: it.seo.title, meta_description: it.seo.description, canonical: it.seo.canonical, focus_keyphrase: it.seo.focus, schema_jsonld: it.seo.schema,
        },
        title: it.title, text: textOf(it.content), postType: it.post_type, via: seoVia, siteUrl: link.siteUrl,
      })
  }
}

async function previewViaRest(req: PreviewRequest, ctx: PreviewContext, creds: WordPressCredentials, deps: PreviewDeps): Promise<FixPreview> {
  const legacy = (field: 'title' | 'description' | 'alt' | 'link', url: string) =>
    previewFix(creds, { field, url, kind: req.kind, siteName: ctx.siteName, keyword: req.keyword }, deps.wp)
  const mapCode = (code: string): FixErrorCode =>
    code === 'needs_bridge' || code === 'needs_seo_plugin' ? 'needs_plugin'
      : (['not_in_wordpress', 'nothing_to_fix', 'no_safe_place', 'wordpress_permission'] as string[]).includes(code) ? code as FixErrorCode
        : 'plugin_unreachable'

  switch (req.type) {
    case 'seo_title':
    case 'meta_description': {
      const p = await legacy(req.type === 'seo_title' ? 'title' : 'description', req.url)
      if (!p.ok) return fail(mapCode(p.code))
      if (p.field !== 'title' && p.field !== 'description') return fail('invalid_request')
      // The page's own words and, where they fall short, the model: only a suggestion that passes its check is offered.
      const item = await deps.wp.findItemByUrl(creds, req.url)
      const full = item ? await deps.wp.getItemForEdit(creds, item.endpoint, item.id) : null
      const live = await deps.readLive(req.url)
      const after = await checkedSuggestion(req, ctx, deps, {
        currentTitle: live?.title ?? '', currentDescription: live?.description ?? '', h1: live?.h1 ?? full?.title ?? '',
        title: full?.title ?? live?.title ?? '', text: textOf(full?.content ?? live?.html ?? ''), focus: null,
      })
      if (!after) return fail('no_valid_suggestion')
      return { ok: true, type: req.type, before: p.before, after, expected: p.expected, via: p.via, limits: p.limits, serp: p.serp }
    }
    case 'image_alt': {
      const p = await legacy('alt', req.url)
      if (!p.ok) return fail(mapCode(p.code))
      if (p.field !== 'alt') return fail('invalid_request')
      return { ok: true, type: 'image_alt', images: p.images, expected: p.expected, via: 'content' }
    }
    case 'internal_link': {
      const p = await legacy('link', req.url)
      if (!p.ok) return fail(mapCode(p.code))
      if (p.field !== 'link') return fail('invalid_request')
      return { ok: true, type: 'internal_link', pageUrl: p.sourceUrl, sourceTitle: p.sourceTitle, target: p.targetUrl, anchor: p.anchor, sentence: p.sentenceBefore, expected: p.expected, via: 'content' }
    }
    case 'broken_link':
    case 'faq_block': {
      const pageUrl = req.type === 'broken_link' ? String(req.from ?? '') : req.url
      const item = await deps.wp.findItemByUrl(creds, pageUrl)
      if (!item) return fail('not_in_wordpress')
      const full = await deps.wp.getItemForEdit(creds, item.endpoint, item.id)
      if (req.type === 'faq_block') return await previewFaq(await faqSourceText(textOf(full.content), pageUrl, deps), full.title, sha(full.content), 'content', deps)
      const words = brokenLinkWords(full.content, req.url, new URL(creds.siteUrl).hostname)
      if (words.length === 0) return fail('nothing_to_fix')
      return { ok: true, type: 'broken_link', pageUrl, href: req.url, words, expected: sha(full.content), via: 'content' }
    }
    default:
      // Canonical, focus keyphrase and schema have no field in WordPress itself: the plugin writes them.
      return fail('needs_plugin')
  }
}

async function previewPublic(req: PreviewRequest, ctx: PreviewContext, via: Via, deps: PreviewDeps): Promise<FixPreview> {
  const pageUrl = req.type === 'broken_link' ? String(req.from ?? '') : req.url
  const live = await deps.readLive(pageUrl)
  if (!live) return fail('plugin_unreachable')
  switch (req.type) {
    case 'image_alt': {
      const srcs = htmlImagesMissingAlt(live.html)
      if (srcs.length === 0) return fail('nothing_to_fix')
      return { ok: true, type: 'image_alt', images: srcs.map((src) => ({ src, after: suggestAlt(src, plainTitle(live.h1 ?? live.title)) })), expected: null, via }
    }
    case 'broken_link': {
      const words = brokenLinkWords(live.html, req.url, new URL(pageUrl).hostname)
      return { ok: true, type: 'broken_link', pageUrl, href: req.url, words, expected: null, via }
    }
    case 'faq_block':
      return await previewFaq(mainTextOf(live.html), plainTitle(live.h1 ?? live.title), null, via, deps)
    case 'internal_link':
    case 'h1_demote':
      return fail(req.type === 'h1_demote' ? 'needs_plugin' : 'no_safe_place')
    default:
      return previewMeta(req, ctx, deps, {
        stored: null, title: plainTitle(live.h1 ?? live.title), text: '', postType: undefined, via, siteUrl: pageUrl, live,
      })
  }
}

async function previewMeta(
  req: PreviewRequest, ctx: PreviewContext, deps: PreviewDeps,
  src: { stored: Record<'seo_title' | 'meta_description' | 'canonical' | 'focus_keyphrase' | 'schema_jsonld', string> | null; title: string; text: string; postType?: string; via: Via; siteUrl: string; live?: LivePage | null },
): Promise<FixPreview> {
  const live = src.live !== undefined ? src.live : await deps.readLive(req.url)
  const expected = (key: keyof NonNullable<typeof src.stored>) => (src.stored ? src.stored[key] ?? '' : null)
  const siteRoot = (() => { try { return new URL(src.siteUrl).origin } catch { return src.siteUrl } })()
  switch (req.type) {
    case 'seo_title': {
      const after = await checkedSuggestion(req, ctx, deps, {
        currentTitle: live?.title ?? '', currentDescription: live?.description ?? '', h1: live?.h1 ?? src.title, title: src.title,
        text: src.text || mainTextOf(live?.html ?? ''), focus: src.stored?.focus_keyphrase ?? null,
      })
      if (!after) return fail('no_valid_suggestion')
      return {
        ok: true, type: 'seo_title', before: live?.title ?? '', after, expected: expected('seo_title'), via: src.via, limits: TITLE_LIMITS,
        serp: { title: live?.title ?? src.title, description: live?.description ?? '' },
      }
    }
    case 'meta_description': {
      const before = live?.description ?? ''
      const after = await checkedSuggestion(req, ctx, deps, {
        currentTitle: live?.title ?? '', currentDescription: before, h1: live?.h1 ?? src.title, title: live?.title ?? src.title,
        text: src.text || mainTextOf(live?.html ?? ''), focus: null,
      })
      if (!after) return fail('no_valid_suggestion')
      return {
        ok: true, type: 'meta_description', before, after, expected: expected('meta_description'), via: src.via, limits: DESCRIPTION_LIMITS,
        serp: { title: live?.title ?? src.title, description: before },
      }
    }
    case 'canonical':
      return { ok: true, type: 'canonical', before: live?.canonical ?? '', after: canonicalFor(req.url), expected: expected('canonical'), via: src.via }
    case 'focus_keyphrase': {
      const base = plainTitle(live?.h1 ?? src.title)
      const words = base.split(' ').slice(0, 4).join(' ')
      return { ok: true, type: 'focus_keyphrase', before: src.stored?.focus_keyphrase ?? '', after: cutAtWord(words, 60), expected: expected('focus_keyphrase'), via: src.via }
    }
    case 'schema_jsonld': {
      const kind = kindOf(req, siteRoot, src.postType)
      const schema = schemaFor(
        { url: canonicalFor(req.url), title: plainTitle(live?.h1 ?? live?.title ?? src.title), description: live?.description ?? null, kind },
        { name: ctx.siteName, url: `${siteRoot}/` },
      )
      return { ok: true, type: 'schema_jsonld', before: live?.schemaTypes ?? [], schema, expected: expected('schema_jsonld'), via: src.via }
    }
    default:
      return fail('invalid_request')
  }
}

/** The visible text of a page's main region when it marks one (<main>, else <article>), else of the whole page. */
export function mainTextOf(html: string): string {
  for (const tag of ['main', 'article']) {
    const at = html.search(new RegExp(`<${tag}\\b`, 'i'))
    const end = html.search(new RegExp(`</${tag}>`, 'i'))
    if (at >= 0 && end > at) return textOf(html.slice(at, end))
  }
  return textOf(html.replace(/<(header|footer|aside)\b[\s\S]*?<\/\1>/gi, ' '))
}

/**
 * A title or description that passes its check (lib/site-health/rules.ts), from the page's own
 * words or the model; null when none does (then no automatic fix is offered).
 */
async function checkedSuggestion(
  req: PreviewRequest, ctx: PreviewContext, deps: PreviewDeps,
  page: { currentTitle: string; currentDescription: string; h1: string; title: string; text: string; focus: string | null },
): Promise<string | null> {
  if (req.type === 'seo_title') {
    const h1 = plainTitle(page.h1)
    // The page's main keyword: the SEO plugin's focus keyphrase, else its main heading when that is short enough to fit.
    const keyword = plainTitle(page.focus) || (h1 && h1.length <= 40 ? h1 : null)
    return suggestSeoTitle({
      kind: req.kind, current: page.currentTitle, h1, siteName: ctx.siteName, keyword, path: pathOf(req.url), text: page.text.slice(0, 1500),
      description: page.currentDescription || null,
    }, deps.generate)
  }
  return suggestMetaDescription({ current: page.currentDescription, text: page.text, title: page.title }, deps.generate)
}

/**
 * The text an FAQ is written from. A page built with a page builder keeps little or none of its
 * words in the post content, so the content alone read "too little text" on a full page (wave 9).
 * Then the page as visitors read it (its main part) is used instead, when it says more.
 */
export async function faqSourceText(contentText: string, url: string, deps: Pick<PreviewDeps, 'readLive'>): Promise<string> {
  if (!thinContent(contentText)) return contentText
  const live = await deps.readLive(url).catch(() => null)
  const shown = live ? mainTextOf(live.html) : ''
  return shown.length > contentText.length ? shown : contentText
}

async function previewFaq(text: string, title: string, expected: string | null, via: Via, deps: PreviewDeps): Promise<FixPreview> {
  const s = await suggestFaq({ text, title }, deps.generate)
  if (s.ok) return { ok: true, type: 'faq_block', items: s.items, heading: s.heading, notice: null, expected, via }
  return { ok: true, type: 'faq_block', items: [], heading: s.heading, notice: s.code, expected, via }
}

/** llms.txt pages: the mapped pages first, the home page's links otherwise. At most 16 are read. */
const LLMS_READ = 16
const LLMS_BUDGET_MS = 25_000

function groupOf(kind: string | null, url: string): LlmsPage['group'] | null {
  const k = String(kind ?? '').toLowerCase()
  if (k === 'product') return 'product'
  if (k === 'category' || k === 'collection' || k === 'product_cat') return 'category'
  if (k === 'article' || k === 'post') return 'article'
  if (k === 'page' || k === 'other' || !k) {
    try { if (new URL(url).pathname.replace(/\/+$/, '') === '') return null } catch { return null }
    return 'page'
  }
  return 'page'
}

async function previewLlms(req: PreviewRequest, ctx: PreviewContext, deps: PreviewDeps): Promise<FixPreview> {
  let origin: string
  try { origin = new URL(req.url).origin } catch { return fail('invalid_request') }
  const fileUrl = `${origin}/llms.txt`
  if (deps.readText && isRealLlmsTxt(await deps.readText(fileUrl))) return fail('llms_exists')
  const home = await deps.readLive(`${origin}/`)
  if (!home) return fail('plugin_unreachable')
  const mapped = deps.sitePages ? await deps.sitePages().catch(() => []) : []
  const seen = new Set<string>()
  const picks: { url: string; title: string | null; group: LlmsPage['group'] }[] = []
  const per: Record<LlmsPage['group'], number> = { page: 0, category: 0, product: 0, article: 0 }
  const cap: Record<LlmsPage['group'], number> = { page: 6, category: 3, product: 3, article: 4 }
  const add = (url: string, title: string | null, kind: string | null) => {
    let u: URL
    try { u = new URL(url) } catch { return }
    if (u.origin !== origin || u.search || /\.(xml|jpg|jpeg|png|gif|webp|pdf|zip)$/i.test(u.pathname)) return
    const key = u.pathname.replace(/\/+$/, '') || '/'
    const group = groupOf(kind, u.toString())
    if (!group || seen.has(key) || per[group] >= cap[group] || picks.length >= LLMS_READ) return
    seen.add(key)
    per[group]++
    picks.push({ url: u.toString(), title, group })
  }
  for (const m of mapped) add(m.url, m.title, m.kind)
  if (picks.length < 4) for (const l of home.links ?? []) add(l, null, null)

  const started = Date.now()
  const pages: LlmsPage[] = []
  let next = 0
  await Promise.all(Array.from({ length: 4 }, async () => {
    while (next < picks.length && Date.now() - started < LLMS_BUDGET_MS) {
      const p = picks[next++]
      const live = await deps.readLive(p.url).catch(() => null)
      const title = plainTitle(live?.h1 ?? live?.title ?? p.title)
      if (!live || !title) continue
      pages.push({ url: p.url, title, summary: live.description, group: p.group })
    }
  }))
  // The order the site's own list gave, not the order the reads finished in.
  pages.sort((a, b) => picks.findIndex((p) => p.url === a.url) - picks.findIndex((p) => p.url === b.url))
  const language = pageLanguage(`${home.title ?? ''} ${home.description ?? ''} ${pages.map((p) => p.title).join(' ')}`)
  const name = plainTitle(ctx.siteName) || plainTitle(home.title?.split(/\s[|–—-]\s/)[0]) || new URL(origin).hostname.replace(/^www\./, '')
  const text = buildLlmsTxt({ name, description: home.description, language }, pages)
  if (!text) return fail('thin_content')
  const copyOnly = !(ctx.channel === 'plugin' && ctx.link)
  return { ok: true, type: 'llms_txt', text, pages: pages.length, fileUrl, copyOnly, expected: null, via: copyOnly ? 'manual' : 'plugin_own' }
}
