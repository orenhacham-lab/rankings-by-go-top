/**
 * "Fix it for me" on a WordPress site, through the application-password
 * connection the merchant already made. Nothing else can write: no Shopify, no
 * Wix, no new permission.
 *
 * TWO STEPS, ALWAYS:
 *   preview  READ-ONLY. Finds the post or page behind the address, reads what is
 *            there now, and proposes a new value (deterministic, from the page's
 *            own words; the merchant may edit it). Returns the value it read, as
 *            `expected`, for the apply to check against.
 *   apply    Only with `approved: true` (the preview's approve button) and the
 *            `expected` the preview returned. It reads the page AGAIN and writes
 *            only when the page still holds that value (compare-and-set): a page
 *            edited in between is refused with changed_since_preview. When the
 *            page already holds the approved value, nothing is written and the
 *            answer is `already` (idempotent: a double click writes once).
 *            Every applied fix answers with its UNDO: the same request with the
 *            previous value, which the screen offers as a button.
 *
 * What is written, exactly:
 *   title        the SEO plugin's title (Yoast / Rank Math, through core REST or
 *                the GO TOP SEO bridge) when both are there; otherwise the post's
 *                own title — the preview says which.
 *   description  the SEO plugin's description only. WordPress itself has none, so
 *                without a plugin (or the bridge) it is a step-by-step card.
 *   alt          the alt attribute of the images in the post's OWN content that
 *                have none. Theme images (logo, header) are not in the content and
 *                stay a card.
 *   link         one link to a page nothing links to, from a post that already
 *                mentions it, placed by the internal-link engine's natural-only
 *                rule (lib/content/internal-link-insertion.ts): an existing phrase
 *                is wrapped, no text is added.
 *
 * Failures are stable codes (SiteHealthErrorCode); nothing WordPress said is
 * passed on. Framework-free and dependency-injected, so the contract runs under
 * test (lib/site-health/__qa__/site-health-routes.qa.ts).
 */
import { createHash } from 'crypto'
import { applyNaturalAnchor, findNaturalAnchorPlacement, pluginLinkLanding } from '@/lib/content/internal-link-insertion'
import { isUrlAlreadyLinked } from '@/lib/content/internal-links'
import { WordPressClientError } from '@/lib/wordpress/client'
import type * as WpClient from '@/lib/wordpress/client'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import {
  cleanAlt, cleanText, DESCRIPTION_MAX, DESCRIPTION_MIN, DESCRIPTION_TARGET, suggestAlt, suggestDescription, suggestTitle,
  textOf, TITLE_MAX, TITLE_MIN, TITLE_TARGET, withoutSuffix,
} from './rules'
import type { FindingKind, SiteHealthErrorCode } from './types'

export interface WpFixDeps {
  findItemByUrl: typeof WpClient.findItemByUrl
  getItemForEdit: typeof WpClient.getItemForEdit
  updateItemFields: typeof WpClient.updateItemFields
  searchItems: typeof WpClient.searchItems
  detectSeoCapabilities: typeof WpClient.detectSeoCapabilities
  writeVerifiedSeoMeta: typeof WpClient.writeVerifiedSeoMeta
  /** The public page as a visitor gets it (the scan's safe fetch): its <title>, description and first h1. */
  readLivePage: (url: string) => Promise<{ title: string | null; description: string | null; h1: string | null } | null>
  /**
   * Set when the Go Top plugin writes the link (lib/site-fix/preview.ts): the plugin places it with
   * its own matcher, so a sentence is offered only where that matcher lands on the same words
   * (pluginLinkLanding), and never in a post a page builder renders from its own data.
   */
  pluginLink?: { rendersFromBuilder: (id: number) => boolean }
}

export const sha = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

type Fail = { ok: false; code: SiteHealthErrorCode }
const fail = (code: SiteHealthErrorCode): Fail => ({ ok: false, code })

/** A WordPress error as one of OUR codes. Never its message. */
export function wpFailure(err: unknown): SiteHealthErrorCode {
  if (err instanceof WordPressClientError) {
    const status = Number(err.meta.status ?? 0)
    if (status === 401 || status === 403 || /authentication failed|permission/i.test(err.message)) return 'wordpress_permission'
  }
  return 'wordpress_unreachable'
}

export interface TextLimits { min: number; max: number; target: number }
const TITLE_LIMITS: TextLimits = { min: TITLE_MIN, max: TITLE_MAX, target: TITLE_TARGET }
const DESCRIPTION_LIMITS: TextLimits = { min: DESCRIPTION_MIN, max: DESCRIPTION_MAX, target: DESCRIPTION_TARGET }

export type TextPreview = {
  ok: true; field: 'title' | 'description'; via: 'seo_plugin' | 'wp_title'
  before: string; after: string; expected: string; limits: TextLimits
  /** What the page shows Google now, for the search-result mock of the preview. */
  serp: { title: string; description: string }
}
export type AltPreview = { ok: true; field: 'alt'; images: { src: string; after: string }[]; expected: string }
export type LinkPreview = {
  ok: true; field: 'link'; sourceUrl: string; sourceTitle: string; targetUrl: string; anchor: string
  sentenceBefore: string; sentenceAfter: string; expected: string
}
export type Preview = TextPreview | AltPreview | LinkPreview | Fail

export type ApplyRequest =
  | { field: 'title' | 'description'; url: string; via: 'seo_plugin' | 'wp_title'; after: string; expected: string }
  | { field: 'alt'; url: string; images: { src: string; after: string }[]; expected: string }
  | { field: 'link'; url: string; sourceUrl: string; anchor: string; expected: string; mode?: 'add' | 'remove' }

export type ApplyResult =
  | { ok: true; status: 'applied' | 'already'; undo: ApplyRequest | null }
  | Fail

// ── Images in raw content ────────────────────────────────────────────────────

const IMG = /<img\b[^>]*>/gi
function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  return m ? (m[2] ?? m[3] ?? m[4] ?? '') : null
}

/** The images of the content with no alt text (none, or blank), by src, first occurrence each. */
export function imagesMissingAlt(content: string): { src: string }[] {
  const out: { src: string }[] = []
  const seen = new Set<string>()
  for (const tag of content.match(IMG) ?? []) {
    const src = attr(tag, 'src')
    const alt = attr(tag, 'alt')
    if (!src || seen.has(src)) continue
    if (alt === null || alt.trim() === '') { seen.add(src); out.push({ src }) }
  }
  return out
}

const escAttr = (s: string) => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

/** Set alt="…" on every <img> whose src is one of `images` (replacing a blank alt or adding one). */
export function setAlts(content: string, images: readonly { src: string; after: string }[]): string {
  const bySrc = new Map(images.map((i) => [i.src, i.after]))
  return content.replace(IMG, (tag) => {
    const src = attr(tag, 'src')
    if (!src || !bySrc.has(src)) return tag
    const value = escAttr(bySrc.get(src) ?? '')
    if (attr(tag, 'alt') !== null) return tag.replace(/\salt\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` alt="${value}"`)
    return tag.replace(/^<img\b/i, `<img alt="${value}"`)
  })
}

function currentAlts(content: string, srcs: readonly string[]): Map<string, string> {
  const out = new Map<string, string>()
  for (const tag of content.match(IMG) ?? []) {
    const src = attr(tag, 'src')
    if (src && srcs.includes(src) && !out.has(src)) out.set(src, attr(tag, 'alt') ?? '')
  }
  return out
}

/** Remove the one link the fix added: <a href="target" rel="noopener">anchor</a> → anchor. */
export function removeAddedLink(content: string, targetUrl: string, anchor: string): string | null {
  const re = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi
  let m: RegExpExecArray | null
  while ((m = re.exec(content)) !== null) {
    const href = attr(` ${m[1]}`, 'href')
    if (href && isUrlAlreadyLinked(`<a href="${href}">x</a>`, targetUrl) && m[2] === anchor && /rel\s*=\s*"noopener"/i.test(m[1])) {
      return content.slice(0, m.index) + anchor + content.slice(m.index + m[0].length)
    }
  }
  return null
}

// ── Preview ──────────────────────────────────────────────────────────────────

export async function previewFix(
  creds: WordPressCredentials,
  req: { field: 'title' | 'description' | 'alt' | 'link'; url: string; kind: FindingKind; siteName: string | null; keyword?: string },
  deps: WpFixDeps,
): Promise<Preview> {
  try {
    if (req.field === 'link') return await previewLink(creds, req, deps)
    const item = await deps.findItemByUrl(creds, req.url)
    if (!item) return fail('not_in_wordpress')
    const full = await deps.getItemForEdit(creds, item.endpoint, item.id)

    if (req.field === 'alt') {
      const missing = imagesMissingAlt(full.content)
      if (missing.length === 0) return fail('nothing_to_fix')
      const images = missing.slice(0, 20).map((i) => ({ src: i.src, after: suggestAlt(i.src, full.title) }))
      return { ok: true, field: 'alt', images, expected: sha(full.content) }
    }

    const caps = await deps.detectSeoCapabilities(creds)
    const plugin = caps.plugin === 'yoast' || caps.plugin === 'rankmath'
    if (req.field === 'description' && !plugin) return fail('needs_seo_plugin')
    if (req.field === 'description' && !caps.hasBridge) return fail('needs_bridge')
    const via: TextPreview['via'] = req.field === 'title' && !(plugin && caps.hasBridge) ? 'wp_title' : 'seo_plugin'

    const live = await deps.readLivePage(req.url)
    if (req.field === 'title') {
      const before = via === 'wp_title' ? full.title : (live?.title ?? '')
      const after = suggestTitle({ kind: req.kind, current: live?.title ?? full.title, h1: live?.h1 ?? full.title, siteName: req.siteName, path: new URL(req.url).pathname })
      const serp = { title: live?.title ?? full.title, description: live?.description ?? '' }
      return { ok: true, field: 'title', via, before, after, expected: before, limits: TITLE_LIMITS, serp }
    }
    const before = live?.description ?? ''
    const after = suggestDescription(before, textOf(full.content)) ?? ''
    const serp = { title: live?.title ?? full.title, description: before }
    return { ok: true, field: 'description', via, before, after, expected: before, limits: DESCRIPTION_LIMITS, serp }
  } catch (err) {
    return fail(wpFailure(err))
  }
}

/** At most this many other posts and pages are read to find a sentence that already has the words. */
export const LINK_MAX_CANDIDATES = 10

/** The words of an address's last segment ("/japan-travel-guide/" → "japan travel guide"). */
function slugWords(url: string): string {
  try {
    let last = new URL(url).pathname.split('/').filter(Boolean).pop() ?? ''
    try { last = decodeURIComponent(last) } catch { /* keep */ }
    return last.replace(/[-_]+/g, ' ').replace(/\s+/g, ' ').trim()
  } catch {
    return ''
  }
}

/** A page title without the site's name ("Blog | Shop" → "Blog"); the whole title when nothing is left. */
function titleCore(title: string): string {
  const t = String(title).replace(/\s+/g, ' ').trim()
  const head = t.split(/\s(?:[|–—·»-]|::)\s/u)[0].trim()
  return (head.match(/\p{L}/gu) ?? []).length >= 3 ? head : withoutSuffix(t)
}

/**
 * The words a link to the forgotten page may be made of, in order: the page's main keyword, its title
 * without the site's name, the words of its address. Each is the page's own words (never a synonym),
 * at least 3 letters and at most 80 characters (the plugin's own limit).
 */
export function linkPhrases(keyword: string | null | undefined, title: string | null | undefined, url: string): string[] {
  const out: string[] = []
  for (const raw of [keyword, title ? titleCore(title) : '', slugWords(url)]) {
    const v = String(raw ?? '').replace(/\s+/g, ' ').trim()
    if ((v.match(/\p{L}/gu) ?? []).length < 3 || v.length > 80 || /[<>]/.test(v)) continue
    if (!out.some((x) => x.toLocaleLowerCase() === v.toLocaleLowerCase())) out.push(v)
  }
  return out
}

async function previewLink(
  creds: WordPressCredentials,
  req: { url: string; keyword?: string },
  deps: WpFixDeps,
): Promise<Preview> {
  // `url` is the page nobody links to; the link goes INTO it, from another post or page.
  const target = req.url
  let targetTitle = ''
  try {
    const own = await deps.findItemByUrl(creds, target)
    if (own) targetTitle = (await deps.getItemForEdit(creds, own.endpoint, own.id)).title
  } catch { /* the keyword alone, then */ }
  const phrases = linkPhrases(req.keyword, targetTitle, target)
  if (phrases.length === 0) return fail('no_safe_place')
  // The plugin searches every post type at once; the REST API asks posts and pages apart.
  const endpoints: `/${string}`[] = deps.pluginLink ? ['/posts'] : ['/posts', '/pages']
  const tried = new Set<string>()
  for (const phrase of phrases) {
    for (const endpoint of endpoints) {
      if (tried.size >= LINK_MAX_CANDIDATES) break
      const hits = await deps.searchItems(creds, endpoint, phrase, LINK_MAX_CANDIDATES)
      for (const hit of hits) {
        if (tried.size >= LINK_MAX_CANDIDATES) break
        if (sameUrl(hit.link, target) || tried.has(hit.link)) continue
        tried.add(hit.link)
        const src = await deps.findItemByUrl(creds, hit.link)
        if (!src) continue
        // A page builder shows its own data, not this content: a link written here would not show.
        if (deps.pluginLink?.rendersFromBuilder(src.id)) continue
        const full = await deps.getItemForEdit(creds, src.endpoint, src.id)
        if (isUrlAlreadyLinked(full.content, target)) continue
        for (const words of phrases) {
          const placed = findNaturalAnchorPlacement(full.content, words)
          const applied = applyNaturalAnchor(full.content, words, target)
          if (!placed.found || !applied.ok || !applied.html || !applied.anchorText || placed.index === undefined) continue
          // The plugin writes the link with its own matcher: offered only where it lands on the same words.
          if (deps.pluginLink && pluginLinkLanding(full.content, applied.anchorText) !== placed.index) continue
          // The shared preview marks a cut with "…" even after a full stop: keep the stop only.
          const sentence = (placed.sentence ?? '').replace(/([.!?])…$/u, '$1')
          return {
            ok: true, field: 'link', sourceUrl: src.link || hit.link, sourceTitle: hit.title, targetUrl: target,
            anchor: applied.anchorText, sentenceBefore: sentence, sentenceAfter: sentence, expected: sha(full.content),
          }
        }
      }
    }
  }
  return fail('no_safe_place')
}

function sameUrl(a: string, b: string): boolean {
  const k = (u: string) => { try { const x = new URL(u); return `${x.hostname.replace(/^www\./, '')}${x.pathname.replace(/\/+$/, '')}` } catch { return u } }
  return k(a) === k(b)
}

// ── Apply (and undo, which is an apply of the previous value) ────────────────

export async function applyFix(creds: WordPressCredentials, req: ApplyRequest, deps: WpFixDeps): Promise<ApplyResult> {
  try {
    if (req.field === 'link') return await applyLink(creds, req, deps)
    const item = await deps.findItemByUrl(creds, req.url)
    if (!item) return fail('not_in_wordpress')
    const full = await deps.getItemForEdit(creds, item.endpoint, item.id)

    if (req.field === 'alt') {
      const images = req.images.map((i) => ({ src: String(i.src), after: cleanAlt(i.after) })).filter((i) => i.src).slice(0, 20)
      if (images.length === 0) return fail('value_invalid')
      const now = currentAlts(full.content, images.map((i) => i.src))
      if (images.every((i) => (now.get(i.src) ?? null) === i.after)) return { ok: true, status: 'already', undo: null }
      if (sha(full.content) !== req.expected) return fail('changed_since_preview')
      const next = setAlts(full.content, images)
      await deps.updateItemFields(creds, item.endpoint, item.id, { content: next })
      const check = await deps.getItemForEdit(creds, item.endpoint, item.id)
      const after = currentAlts(check.content, images.map((i) => i.src))
      if (!images.every((i) => (after.get(i.src) ?? null) === i.after)) return fail('write_not_confirmed')
      return {
        ok: true, status: 'applied',
        undo: { field: 'alt', url: req.url, images: images.map((i) => ({ src: i.src, after: now.get(i.src) ?? '' })), expected: sha(check.content) },
      }
    }

    const limits = req.field === 'title' ? TITLE_LIMITS : DESCRIPTION_LIMITS
    const value = cleanText(req.after, limits.max + 60)
    if (!value) return fail('value_invalid')

    if (req.via === 'wp_title') {
      if (req.field !== 'title') return fail('value_invalid')
      if (full.title === value) return { ok: true, status: 'already', undo: null }
      if (full.title !== req.expected) return fail('changed_since_preview')
      await deps.updateItemFields(creds, item.endpoint, item.id, { title: value })
      const check = await deps.getItemForEdit(creds, item.endpoint, item.id)
      if (check.title !== value) return fail('write_not_confirmed')
      return { ok: true, status: 'applied', undo: { field: 'title', url: req.url, via: 'wp_title', after: full.title, expected: value } }
    }

    // SEO plugin: the page a visitor gets is what we compare with. It may be served
    // from a cache, so it may still show the approved value's predecessor; a page
    // showing NEITHER is someone else's edit, and is refused.
    const live = await deps.readLivePage(req.url)
    const now = String((req.field === 'title' ? live?.title : live?.description) ?? '')
    if (now !== req.expected && now !== value) return fail('changed_since_preview')
    const written = await deps.writeVerifiedSeoMeta(
      creds, item.id,
      req.field === 'title' ? { metaTitle: value } : { metaDescription: value },
      undefined, item.endpoint,
    )
    if (written.status === 'seo_bridge_required') return fail('needs_bridge')
    if (written.status === 'plugin_unavailable') return fail('needs_seo_plugin')
    if (written.status === 'permission_error') return fail('wordpress_permission')
    if (written.status !== 'verified') return fail('write_not_confirmed')
    return {
      ok: true, status: now === value ? 'already' : 'applied',
      undo: now === value ? null : { field: req.field, url: req.url, via: 'seo_plugin', after: req.expected, expected: value },
    }
  } catch (err) {
    return fail(wpFailure(err))
  }
}

async function applyLink(creds: WordPressCredentials, req: Extract<ApplyRequest, { field: 'link' }>, deps: WpFixDeps): Promise<ApplyResult> {
  const src = await deps.findItemByUrl(creds, req.sourceUrl)
  if (!src) return fail('not_in_wordpress')
  const full = await deps.getItemForEdit(creds, src.endpoint, src.id)
  const anchor = String(req.anchor ?? '').trim()
  if (!anchor) return fail('value_invalid')
  if (req.mode === 'remove') {
    if (!isUrlAlreadyLinked(full.content, req.url)) return { ok: true, status: 'already', undo: null }
    if (sha(full.content) !== req.expected) return fail('changed_since_preview')
    const next = removeAddedLink(full.content, req.url, anchor)
    if (next === null) return fail('changed_since_preview')
    await deps.updateItemFields(creds, src.endpoint, src.id, { content: next })
    const check = await deps.getItemForEdit(creds, src.endpoint, src.id)
    if (isUrlAlreadyLinked(check.content, req.url)) return fail('write_not_confirmed')
    return { ok: true, status: 'applied', undo: null }
  }
  if (isUrlAlreadyLinked(full.content, req.url)) return { ok: true, status: 'already', undo: null }
  if (sha(full.content) !== req.expected) return fail('changed_since_preview')
  const applied = applyNaturalAnchor(full.content, anchor, req.url)
  if (!applied.ok || !applied.html) return fail('no_safe_place')
  await deps.updateItemFields(creds, src.endpoint, src.id, { content: applied.html })
  const check = await deps.getItemForEdit(creds, src.endpoint, src.id)
  if (!isUrlAlreadyLinked(check.content, req.url)) return fail('write_not_confirmed')
  return {
    ok: true, status: 'applied',
    undo: { field: 'link', url: req.url, sourceUrl: req.sourceUrl, anchor: applied.anchorText ?? anchor, expected: sha(check.content), mode: 'remove' },
  }
}
