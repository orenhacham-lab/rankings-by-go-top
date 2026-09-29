/**
 * The READ-ONLY step before an approval: what the page holds now, what we propose, and the value
 * the write will compare against (`expected`: a page changed in between is refused).
 *
 * Where the page is read from depends on the channel the fix would take:
 *   plugin        the plugin's signed /inspect (the post's content and its stored SEO fields)
 *   app_password  the WordPress REST API (the content; SEO fields as the public page shows them)
 *   webhook, manual  the public page only (we will not write it ourselves; `expected` is null)
 *
 * Proposals are deterministic, from the page's own words (lib/site-health/rules.ts); no model is
 * called. The merchant edits them before approving. Failures are stable codes.
 */
import { domainKey, extractSiteSignals, fetchSiteHtml, normalizeCheckUrl } from '@/lib/free-check'
import { hostPinnedFetch } from '@/lib/seed-scan/site-access'
import { PAGE_MS } from '@/lib/site-health/scan'
import {
  cutAtWord, DESCRIPTION_MAX, DESCRIPTION_MIN, DESCRIPTION_TARGET, suggestAlt, suggestDescription, suggestTitle, textOf,
  TITLE_MAX, TITLE_MIN, TITLE_TARGET,
} from '@/lib/site-health/rules'
import type { FindingKind } from '@/lib/site-health/types'
import { imagesMissingAlt, previewFix, sha, wpFailure, type WpFixDeps } from '@/lib/site-health/wordpress-fix'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { brokenLinkWords } from './content'
import { pluginInspect, pluginSearch, type PluginItem, type PluginLink, type PluginPost } from './plugin-client'
import type { FaqItem, FixChannel, FixErrorCode, FixType } from './types'

export interface LivePage {
  title: string | null
  description: string | null
  h1: string | null
  canonical: string | null
  schemaTypes: string[]
  html: string
}

/** How the value will reach the page, for the sentence under the preview. */
export type Via = 'plugin_seo' | 'plugin_own' | 'seo_plugin' | 'wp_title' | 'content' | 'webhook' | 'manual'

type Limits = { min: number; max: number; target: number }
export type FixPreview =
  | { ok: true; type: 'seo_title' | 'meta_description'; before: string; after: string; expected: string | null; via: Via; limits: Limits; serp: { title: string; description: string } }
  | { ok: true; type: 'focus_keyphrase' | 'canonical'; before: string; after: string; expected: string | null; via: Via }
  | { ok: true; type: 'schema_jsonld'; before: string[]; schema: Record<string, unknown>; expected: string | null; via: Via }
  | { ok: true; type: 'image_alt'; images: { src: string; after: string }[]; expected: string | null; via: Via }
  | { ok: true; type: 'faq_block'; items: FaqItem[]; expected: string | null; via: Via }
  | { ok: true; type: 'broken_link'; pageUrl: string; href: string; words: string[]; expected: string | null; via: Via }
  | { ok: true; type: 'internal_link'; pageUrl: string; sourceTitle: string; target: string; anchor: string; sentence: string; expected: string | null; via: Via }
  | { ok: false; code: FixErrorCode }

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
const fail = (code: FixErrorCode): FixPreview => ({ ok: false, code })

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
      return { title: s.title, description: s.metaDescription, h1: s.h1[0] ?? null, canonical: s.canonical, schemaTypes: s.schemaTypes, html: got.html }
    } catch {
      return null
    } finally {
      clearTimeout(timer)
    }
  }
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
      return { ok: true, type: 'faq_block', items: [], expected: it.content_sha, via: 'content' }
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
      return { ok: true, type: req.type, before: p.before, after: p.after, expected: p.expected, via: p.via, limits: p.limits, serp: p.serp }
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
      if (req.type === 'faq_block') return { ok: true, type: 'faq_block', items: [], expected: sha(full.content), via: 'content' }
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
      return { ok: true, type: 'faq_block', items: [], expected: null, via }
    case 'internal_link':
      return fail('no_safe_place')
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
      const current = live?.title ?? src.title
      const after = suggestTitle({ kind: req.kind, current, h1: live?.h1 ?? src.title, siteName: ctx.siteName, path: new URL(req.url).pathname })
      return {
        ok: true, type: 'seo_title', before: live?.title ?? '', after, expected: expected('seo_title'), via: src.via, limits: TITLE_LIMITS,
        serp: { title: live?.title ?? src.title, description: live?.description ?? '' },
      }
    }
    case 'meta_description': {
      const before = live?.description ?? ''
      const after = suggestDescription(before, src.text || textOf(live?.html ?? '')) ?? ''
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
