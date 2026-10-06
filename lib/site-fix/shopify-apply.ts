/**
 * Writing one approved fix to a Shopify article or page, with the same rules as the WordPress
 * channels (./rest-apply.ts): the item must still hold what the preview read (`expected`), the
 * write is read back before it counts as applied, and the previous value is kept for undo. Undo
 * refuses when the item changed after the fix (except an FAQ block still there exactly as added).
 * Image alt text also covers an article's featured image: only its alt, never the image.
 */
import { setAlts } from '@/lib/site-health/wordpress-fix'
import { appendBlock, fixBrokenLink, removeBlock, sha256 } from './content'
import {
  demoteBodyH1s, fixMarker, shopFailure, shopifyFaqBlockHtml, type SeoKey, type ShopCreds, type ShopifyFixClient, type ShopItemRef,
} from './shopify-admin'
import type { FixErrorCode, FixPayload } from './types'

export type ShopUndo =
  | { kind: 'shop_meta'; ref: ShopItemRef; key: SeoKey; previous: string | null; value: string }
  | {
      kind: 'shop_body'; ref: ShopItemRef; previous: string; newSha: string; block: string | null
      /** An article's featured image alt we set: what it was, and what we wrote. */
      imageAlt?: { previous: string | null; value: string }
    }

export type ShopResult =
  | { ok: true; status: 'applied' | 'already'; undo: ShopUndo | null; previous: string | null }
  | { ok: false; code: FixErrorCode }

const metaKey = (type: FixPayload['type']): SeoKey | null =>
  type === 'seo_title' ? 'title_tag' : type === 'meta_description' ? 'description_tag' : null

export async function applyViaShopify(
  creds: ShopCreds, client: ShopifyFixClient,
  job: { id: string; ref: ShopItemRef; payload: FixPayload; expected: string | null },
): Promise<ShopResult> {
  const p = job.payload
  try {
    const item = await client.read(creds, job.ref)
    if (!item) return { ok: false, code: 'not_in_store' }

    const key = metaKey(p.type)
    if (key && (p.type === 'seo_title' || p.type === 'meta_description')) {
      const stored = key === 'title_tag' ? item.titleTag : item.descriptionTag
      if (job.expected !== null && (stored ?? '') !== job.expected) return { ok: false, code: 'changed_since_preview' }
      if (stored === p.value) return { ok: true, status: 'already', undo: null, previous: stored }
      await client.write(creds, job.ref, { meta: { key, value: p.value } })
      const check = await client.read(creds, job.ref)
      const now = check ? (key === 'title_tag' ? check.titleTag : check.descriptionTag) : null
      if (now !== p.value) return { ok: false, code: 'write_not_confirmed' }
      return { ok: true, status: 'applied', undo: { kind: 'shop_meta', ref: job.ref, key, previous: stored, value: p.value }, previous: stored }
    }

    if (job.expected !== null && sha256(item.body) !== job.expected) return { ok: false, code: 'changed_since_preview' }
    let next: string
    let block: string | null = null
    let imageAlt: { previous: string | null; value: string } | undefined
    if (p.type === 'faq_block') {
      block = shopifyFaqBlockHtml(job.id, p.heading, p.items)
      if (item.body.includes(fixMarker(job.id))) return { ok: true, status: 'already', undo: null, previous: null }
      next = appendBlock(item.body, block)
    } else if (p.type === 'broken_link') {
      const host = new URL(job.ref.url).hostname
      const fixed = fixBrokenLink(item.body, p.href, p.replacement, host)
      if (fixed.count === 0) return { ok: false, code: 'nothing_to_change' }
      next = fixed.html
    } else if (p.type === 'image_alt') {
      next = setAlts(item.body, p.images.map((i) => ({ src: i.src, after: i.alt })))
      // The featured image of an article: only its alt text, and only while it has none.
      const featured = item.image && !String(item.image.alt ?? '').trim() ? p.images.find((i) => i.src === item.image?.url) : undefined
      if (featured && item.image) imageAlt = { previous: item.image.alt, value: featured.alt }
      if (next === item.body && !imageAlt) return { ok: false, code: 'nothing_to_change' }
    } else if (p.type === 'h1_demote') {
      const d = demoteBodyH1s(item.body, p.headings)
      if (d.count === 0) return { ok: false, code: 'changed_since_preview' }
      next = d.html
    } else {
      return { ok: false, code: 'not_allowed' }
    }

    const bodyChanged = next !== item.body
    await client.write(creds, job.ref, { ...(bodyChanged ? { body: next } : {}), ...(imageAlt ? { imageAlt: imageAlt.value } : {}) })
    const check = await client.read(creds, job.ref)
    if (!check) return { ok: false, code: 'write_not_confirmed' }
    const landed = p.type === 'faq_block' ? check.body.includes(fixMarker(job.id)) : !bodyChanged || check.body !== item.body
    // The image itself must still be the same one: only its alt text was written.
    const imageLanded = !imageAlt || (check.image?.url === item.image?.url && check.image?.alt === imageAlt.value)
    if (!landed || !imageLanded) return { ok: false, code: 'write_not_confirmed' }
    return {
      ok: true, status: 'applied',
      undo: { kind: 'shop_body', ref: job.ref, previous: item.body, newSha: sha256(check.body), block, ...(imageAlt ? { imageAlt } : {}) },
      previous: item.body,
    }
  } catch (err) {
    return { ok: false, code: shopFailure(err) }
  }
}

export async function revertViaShopify(creds: ShopCreds, client: ShopifyFixClient, undo: ShopUndo): Promise<{ ok: true } | { ok: false; code: FixErrorCode }> {
  try {
    const item = await client.read(creds, undo.ref)
    if (!item) return { ok: false, code: 'not_in_store' }
    if (undo.kind === 'shop_meta') {
      const now = undo.key === 'title_tag' ? item.titleTag : item.descriptionTag
      // Changed in the store after the fix: left alone.
      if (now !== undo.value) return { ok: false, code: 'changed_since_preview' }
      if (undo.previous === null || undo.previous === '') await client.clearMeta(creds, undo.ref, undo.key)
      else await client.write(creds, undo.ref, { meta: { key: undo.key, value: undo.previous } })
      return { ok: true }
    }
    // The featured image's alt: put back only while it still holds what we wrote.
    const image = undo.imageAlt && item.image?.alt === undo.imageAlt.value ? { imageAlt: undo.imageAlt.previous ?? '' } : null
    if (undo.imageAlt && !image) return { ok: false, code: 'changed_since_preview' }
    let restore: string | null = null
    if (sha256(item.body) === undo.newSha) restore = undo.previous
    // Changed since, but our FAQ block is still there exactly as added: only the block comes out.
    else if (undo.block) restore = removeBlock(item.body, undo.block)
    if (restore === null) return { ok: false, code: 'changed_since_preview' }
    await client.write(creds, undo.ref, { ...(restore !== item.body ? { body: restore } : {}), ...(image ?? {}) })
    return { ok: true }
  } catch (err) {
    return { ok: false, code: shopFailure(err) }
  }
}

/** The undo record as stored in the job (server-only), or null when it is not a Shopify one. */
export function shopUndoOf(raw: unknown): ShopUndo | null {
  const u = raw as Partial<ShopUndo> | null
  if (!u || (u.kind !== 'shop_meta' && u.kind !== 'shop_body')) return null
  const ref = u.ref as ShopItemRef | undefined
  if (!ref || (ref.kind !== 'article' && ref.kind !== 'page') || typeof ref.gid !== 'string' || typeof ref.url !== 'string') return null
  return u as ShopUndo
}
