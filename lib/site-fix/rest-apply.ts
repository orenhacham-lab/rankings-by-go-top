/**
 * The application-password channel (WordPress REST, no plugin). Also, whatever writes the pages, alt
 * text on Media Library items (./media-alt.ts). The four fixes the existing engine
 * already writes (title, description, alt text, internal link) go through it unchanged
 * (lib/site-health/wordpress-fix.ts applyFix, with its compare-and-set and its undo request). The
 * two new content fixes, an FAQ block and a broken link, are written here with the same rules:
 * the page must still hold what the preview read, the previous content is kept for undo, and undo
 * refuses when the page changed after the fix (except an FAQ block still there exactly as added).
 */
import { applyFix, wpFailure, type ApplyRequest, type WpFixDeps } from '@/lib/site-health/wordpress-fix'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import { appendBlock, faqBlockHtml, fixBrokenLink, removeBlock, sha256 } from './content'
import { applyMediaAlt, revertMediaAlt, type MediaUndo } from './media-alt'
import type { FixErrorCode, FixPayload } from './types'
import { isMediaAlt } from './whitelist'

export type RestUndo =
  | { kind: 'request'; request: ApplyRequest }
  | { kind: 'content'; pageUrl: string; previous: string; newSha: string; block: string | null }
  /** Alt text on Media Library items (./media-alt.ts): each item's words before. */
  | MediaUndo

export type RestResult = { ok: true; status: 'applied' | 'already'; undo: RestUndo | null } | { ok: false; code: FixErrorCode }

const mapLegacy = (code: string): FixErrorCode => {
  if (code === 'needs_bridge' || code === 'needs_seo_plugin') return 'needs_plugin'
  if (code === 'wordpress_unreachable') return 'plugin_unreachable'
  const known: string[] = ['not_in_wordpress', 'changed_since_preview', 'no_safe_place', 'value_invalid', 'write_not_confirmed', 'wordpress_permission']
  return known.includes(code) ? (code as FixErrorCode) : 'plugin_rejected'
}

export async function applyViaRest(
  creds: WordPressCredentials,
  job: { id: string; pageUrl: string; payload: FixPayload; expected: string | null; via: string | null },
  wp: WpFixDeps,
): Promise<RestResult> {
  const p = job.payload
  // Alt text on Media Library items: the REST media route, alt_text only (./media-alt.ts).
  if (isMediaAlt(p) && p.type === 'image_alt') {
    if (!wp.media) return { ok: false, code: 'no_channel' }
    try {
      const r = await applyMediaAlt(creds, p.images.map((i) => ({ media: i.media as number, alt: i.alt })), wp.media)
      return r.ok ? { ok: true, status: r.status, undo: r.undo } : r
    } catch (err) {
      return { ok: false, code: mapLegacy(wpFailure(err)) }
    }
  }
  const expected = job.expected ?? ''
  let legacy: ApplyRequest | null = null
  if (p.type === 'seo_title' || p.type === 'meta_description') {
    const via = job.via === 'wp_title' ? 'wp_title' : 'seo_plugin'
    legacy = { field: p.type === 'seo_title' ? 'title' : 'description', url: job.pageUrl, via, after: p.value, expected }
  } else if (p.type === 'image_alt') {
    legacy = { field: 'alt', url: job.pageUrl, images: p.images.map((i) => ({ src: i.src, after: i.alt })), expected }
  } else if (p.type === 'internal_link') {
    legacy = { field: 'link', url: p.target, sourceUrl: job.pageUrl, anchor: p.anchor, expected, mode: 'add' }
  }
  if (legacy) {
    const r = await applyFix(creds, legacy, wp)
    if (!r.ok) return { ok: false, code: mapLegacy(r.code) }
    return { ok: true, status: r.status, undo: r.undo ? { kind: 'request', request: r.undo } : null }
  }
  if (p.type !== 'faq_block' && p.type !== 'broken_link') return { ok: false, code: 'needs_plugin' }

  try {
    const item = await wp.findItemByUrl(creds, job.pageUrl)
    if (!item) return { ok: false, code: 'not_in_wordpress' }
    const full = await wp.getItemForEdit(creds, item.endpoint, item.id)
    if (job.expected !== null && sha256(full.content) !== job.expected) return { ok: false, code: 'changed_since_preview' }
    let next: string
    let block: string | null = null
    if (p.type === 'faq_block') {
      block = faqBlockHtml(job.id, p.heading, p.items)
      if (full.content.includes(block)) return { ok: true, status: 'already', undo: null }
      next = appendBlock(full.content, block)
    } else {
      const host = new URL(creds.siteUrl).hostname
      const fixed = fixBrokenLink(full.content, p.href, p.replacement, host)
      if (fixed.count === 0) return { ok: false, code: 'nothing_to_change' }
      next = fixed.html
    }
    await wp.updateItemFields(creds, item.endpoint, item.id, { content: next })
    const check = await wp.getItemForEdit(creds, item.endpoint, item.id)
    const marker = `gotop-fix-${job.id.replace(/[^0-9a-f]/g, '').slice(0, 12)}`
    const landed = p.type === 'faq_block' ? check.content.includes(marker) : check.content !== full.content
    if (!landed) return { ok: false, code: 'write_not_confirmed' }
    return { ok: true, status: 'applied', undo: { kind: 'content', pageUrl: job.pageUrl, previous: full.content, newSha: sha256(check.content), block } }
  } catch (err) {
    return { ok: false, code: mapLegacy(wpFailure(err)) }
  }
}

export async function revertViaRest(creds: WordPressCredentials, undo: RestUndo, wp: WpFixDeps): Promise<{ ok: true } | { ok: false; code: FixErrorCode }> {
  if (undo.kind === 'request') {
    const r = await applyFix(creds, undo.request, wp)
    return r.ok ? { ok: true } : { ok: false, code: mapLegacy(r.code) }
  }
  if (undo.kind === 'media') {
    if (!wp.media) return { ok: false, code: 'no_channel' }
    try { return await revertMediaAlt(creds, undo, wp.media) } catch (err) { return { ok: false, code: mapLegacy(wpFailure(err)) } }
  }
  try {
    const item = await wp.findItemByUrl(creds, undo.pageUrl)
    if (!item) return { ok: false, code: 'not_in_wordpress' }
    const full = await wp.getItemForEdit(creds, item.endpoint, item.id)
    let restore: string | null = null
    if (sha256(full.content) === undo.newSha) restore = undo.previous
    else if (undo.block) restore = removeBlock(full.content, undo.block)
    if (restore === null) return { ok: false, code: 'changed_since_preview' }
    await wp.updateItemFields(creds, item.endpoint, item.id, { content: restore })
    return { ok: true }
  } catch (err) {
    return { ok: false, code: mapLegacy(wpFailure(err)) }
  }
}
