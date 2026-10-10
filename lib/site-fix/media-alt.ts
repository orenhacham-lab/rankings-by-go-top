/**
 * Alt text written on the image itself, in the WordPress Media Library, for images a page shows that
 * are not in its own text: the logo, an image in the menu or the footer, the featured image the theme
 * prints above the text. WordPress prints those with the alt text of their Media Library item, so the
 * item is where the fix goes, and one write fixes every page that shows the image.
 *
 * Through the GO TOP SEO Bridge plugin >= 3.1.0 when it is connected (its signed /media-alt route,
 * the alt text only; pluginMediaDeps), otherwise the application password the site already gave
 * (the REST API's own media route, alt_text only). Never the file, its title, caption or anything else.
 * The compare-before-write and the undo below are the same either way: `C` is what reaches the site
 * (the credentials, or the plugin link).
 * Only an item whose alt text is EMPTY gets one; an image the theme ships in its own folder (not in
 * the Media Library) is not ours to change and is never offered. Before the write the item must still
 * be empty (or already hold exactly the approved words); the previous value is kept for undo, and undo
 * refuses when someone changed the words since.
 */
import { altFromFileName, cutAtWord } from '@/lib/site-health/rules'
import type { WordPressCredentials } from '@/lib/wordpress/types'
import type { WpMediaItem } from '@/lib/wordpress/client'
import { pluginMediaGet, pluginMediaSearch, pluginMediaSetAlt, type PluginLink, type PluginMediaItem, type PluginPost } from './plugin-client'
import { MAX_MEDIA_ALT, type FixErrorCode } from './types'

export interface MediaDeps<C = WordPressCredentials> {
  searchMedia: (creds: C, name: string, by?: 'title' | 'slug') => Promise<WpMediaItem[]>
  getMedia: (creds: C, id: number) => Promise<WpMediaItem | null>
  setMediaAlt: (creds: C, id: number, alt: string) => Promise<WpMediaItem | null>
}

const fromPlugin = (m: PluginMediaItem): WpMediaItem => ({
  id: m.id, sourceUrl: String(m.source_url || ''), sizeUrls: Array.isArray(m.size_urls) ? m.size_urls.map(String) : [], alt: String(m.alt ?? ''), title: String(m.title ?? ''),
})

/**
 * The Media Library through the plugin's /media-alt (3.1.0). A refusal of a read is "not found"
 * (null / none); a refusal of a write is null, which the callers answer as write_not_confirmed.
 */
export function pluginMediaDeps(post?: PluginPost): MediaDeps<PluginLink> {
  return {
    searchMedia: async (link, name, by = 'title') => {
      const r = await pluginMediaSearch(link, name, by, post)
      return r.ok ? r.body.items.map(fromPlugin) : []
    },
    getMedia: async (link, id) => {
      const r = await pluginMediaGet(link, id, post)
      return r.ok ? fromPlugin(r.body.item) : null
    },
    setMediaAlt: async (link, id, alt) => {
      const r = await pluginMediaSetAlt(link, id, alt, post)
      return r.ok ? fromPlugin(r.body.item) : null
    },
  }
}


export type MediaAltItem = { src: string; media: number; after: string }
export type MediaUndo = { kind: 'media'; items: { media: number; previous: string; written: string }[] }

/** The file's own name: no folder, no size WordPress added (-300x200), no -scaled, no extension. */
export function mediaSearchTerm(src: string): string | null {
  let name = ''
  try { name = new URL(src).pathname.split('/').pop() ?? '' } catch { return null }
  try { name = decodeURIComponent(name) } catch { /* keep */ }
  // "photo.jpg.webp" (a WebP plugin's copy) is the same item as "photo.jpg".
  name = name.replace(/\.webp$/i, (m) => (/\.[a-z0-9]{2,4}\.webp$/i.test(name) ? '' : m))
  const base = name.replace(/\.[a-z0-9]{2,5}$/i, '').replace(/-(?:\d{2,5}x\d{2,5}|scaled|rotated|e\d{10,})$/i, '')
  return base.length >= 2 ? base.slice(0, 100) : null
}

/** The same file, wherever it is served from (a CDN host, a query string): compared by its path. */
export function sameFile(a: string, b: string): boolean {
  const key = (u: string) => {
    try {
      let p = new URL(u).pathname
      try { p = decodeURIComponent(p) } catch { /* keep */ }
      p = p.replace(/(\.[a-z0-9]{2,4})\.webp$/i, '$1')
      const at = p.indexOf('/wp-content/uploads/')
      return (at >= 0 ? p.slice(at) : p).toLowerCase()
    } catch {
      return ''
    }
  }
  const ka = key(a)
  return !!ka && ka === key(b)
}

/** The Media Library item a page's image is, or null (a theme file, another site's, not found). */
export async function findMediaFor<C>(creds: C, src: string, deps: Pick<MediaDeps<C>, 'searchMedia'>): Promise<WpMediaItem | null> {
  const term = mediaSearchTerm(src)
  if (!term) return null
  const match = (list: WpMediaItem[]) => list.find((m) => sameFile(m.sourceUrl, src) || m.sizeUrls.some((u) => sameFile(u, src))) ?? null
  // By title first (an upload is titled with its file name), then by slug (kept when the title is renamed).
  return match(await deps.searchMedia(creds, term, 'title')) ?? match(await deps.searchMedia(creds, term, 'slug'))
}

/**
 * The words offered for one item (the merchant can change them before approving): the words of its
 * file name or of its title when they are words; a logo is the business's name; else the page title.
 */
export function suggestMediaAlt(item: Pick<WpMediaItem, 'sourceUrl' | 'title'>, ctx: { pageTitle: string; siteName: string | null }): string {
  const isLogo = /logo|לוגו/i.test(`${item.sourceUrl} ${item.title}`)
  if (isLogo && ctx.siteName) return cutAtWord(ctx.siteName, 120)
  return altFromFileName(item.sourceUrl, ctx.pageTitle) ?? altFromFileName(`https://x.invalid/${item.title}.jpg`, ctx.pageTitle) ?? cutAtWord(ctx.pageTitle, 120)
}

/** The page's images without alt text that are Media Library items with no alt text yet, each once. */
export async function previewMediaAlt<C>(
  creds: C,
  srcs: readonly string[],
  ctx: { pageTitle: string; siteName: string | null },
  deps: MediaDeps<C>,
): Promise<MediaAltItem[]> {
  const out: MediaAltItem[] = []
  const seen = new Set<number>()
  for (const src of [...new Set(srcs.filter(Boolean))].slice(0, MAX_MEDIA_ALT * 3)) {
    if (out.length >= MAX_MEDIA_ALT) break
    const m = await findMediaFor(creds, src, deps)
    if (!m || seen.has(m.id) || m.alt.trim() !== '') continue
    seen.add(m.id)
    out.push({ src, media: m.id, after: suggestMediaAlt(m, ctx) })
  }
  return out
}

type Result = { ok: true; status: 'applied' | 'already'; undo: MediaUndo | null } | { ok: false; code: FixErrorCode }

/** Write the approved words: every item checked first, then written, then read back. */
export async function applyMediaAlt<C>(creds: C, items: readonly { media: number; alt: string }[], deps: MediaDeps<C>): Promise<Result> {
  const now = await Promise.all(items.map((i) => deps.getMedia(creds, i.media)))
  if (now.some((m) => !m)) return { ok: false, code: 'not_in_wordpress' }
  // Someone wrote other words since the preview: theirs stay.
  if (now.some((m, n) => m!.alt.trim() !== '' && m!.alt !== items[n].alt)) return { ok: false, code: 'changed_since_preview' }
  const todo = items.filter((_, n) => now[n]!.alt !== items[n].alt)
  if (todo.length === 0) return { ok: true, status: 'already', undo: null }
  for (const i of todo) {
    const after = await deps.setMediaAlt(creds, i.media, i.alt)
    if (!after || after.alt !== i.alt) return { ok: false, code: 'write_not_confirmed' }
  }
  return {
    ok: true, status: 'applied',
    undo: { kind: 'media', items: todo.map((i) => ({ media: i.media, previous: now[items.indexOf(i)]!.alt, written: i.alt })) },
  }
}

/** Put the previous words back, only where the item still holds what we wrote. */
export async function revertMediaAlt<C>(creds: C, undo: MediaUndo, deps: MediaDeps<C>): Promise<{ ok: true } | { ok: false; code: FixErrorCode }> {
  const now = await Promise.all(undo.items.map((i) => deps.getMedia(creds, i.media)))
  if (now.some((m, n) => !m || m.alt !== undo.items[n].written)) return { ok: false, code: 'changed_since_preview' }
  for (const i of undo.items) {
    const after = await deps.setMediaAlt(creds, i.media, i.previous)
    if (!after || after.alt !== i.previous) return { ok: false, code: 'write_not_confirmed' }
  }
  return { ok: true }
}
