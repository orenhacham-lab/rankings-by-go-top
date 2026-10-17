/**
 * "Copy article" and "download the featured image" — value without a connected
 * site: the owner pastes the article into any editor and uploads the image.
 *
 * Copy writes the article twice, as HTML (a visual editor pastes it formatted)
 * and as the HTML source in plain text (a code/HTML editor pastes the markup).
 * When the async clipboard is unavailable (an http origin, an old browser, a
 * denied permission) it falls back to writeText, then to a hidden textarea and
 * execCommand('copy'). Each step is tried only when the previous one failed.
 *
 * The browser objects are passed in, so the fallback order is unit-tested
 * without a browser.
 */

export type CopyMethod = 'rich' | 'text' | 'legacy' | 'none'

export interface ClipboardEnv {
  clipboard?: {
    write?: (items: unknown[]) => Promise<void>
    writeText?: (s: string) => Promise<void>
  } | null
  ClipboardItem?: (new (items: Record<string, Blob>) => unknown) | null
  Blob?: typeof Blob | null
  legacyCopy?: ((text: string) => boolean) | null
}

/** The article as one HTML document fragment: title, then the body. */
export function articleHtmlForCopy(title: string, bodyHtml: string): string {
  const esc = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const t = String(title ?? '').trim()
  return `${t ? `<h1>${esc(t)}</h1>\n` : ''}${String(bodyHtml ?? '').trim()}`
}

export async function copyHtml(html: string, env: ClipboardEnv): Promise<CopyMethod> {
  const cb = env.clipboard
  if (cb?.write && env.ClipboardItem && env.Blob) {
    try {
      const item = new env.ClipboardItem({
        'text/html': new env.Blob([html], { type: 'text/html' }),
        'text/plain': new env.Blob([html], { type: 'text/plain' }),
      })
      await cb.write([item])
      return 'rich'
    } catch { /* fall through */ }
  }
  if (cb?.writeText) {
    try { await cb.writeText(html); return 'text' } catch { /* fall through */ }
  }
  try { if (env.legacyCopy?.(html)) return 'legacy' } catch { /* fall through */ }
  return 'none'
}

/** Plain text (code): writeText, then the hidden-textarea fallback. */
export async function copyPlainText(text: string, env: ClipboardEnv): Promise<CopyMethod> {
  if (env.clipboard?.writeText) {
    try { await env.clipboard.writeText(text); return 'text' } catch { /* fall through */ }
  }
  try { if (env.legacyCopy?.(text)) return 'legacy' } catch { /* fall through */ }
  return 'none'
}

/** The real browser environment (undefined pieces are simply skipped). */
export function browserClipboardEnv(): ClipboardEnv {
  if (typeof window === 'undefined') return {}
  const nav = typeof navigator !== 'undefined' ? navigator : undefined
  return {
    clipboard: nav?.clipboard ? {
      write: typeof nav.clipboard.write === 'function' ? (items: unknown[]) => nav.clipboard.write(items as ClipboardItem[]) : undefined,
      writeText: typeof nav.clipboard.writeText === 'function' ? (s: string) => nav.clipboard.writeText(s) : undefined,
    } : null,
    ClipboardItem: typeof ClipboardItem === 'function' ? (ClipboardItem as unknown as new (items: Record<string, Blob>) => unknown) : null,
    Blob: typeof Blob === 'function' ? Blob : null,
    legacyCopy: domLegacyCopy,
  }
}

/** The browser's hidden-textarea copy, for environments without the async clipboard. */
export function domLegacyCopy(text: string): boolean {
  if (typeof document === 'undefined') return false
  const ta = document.createElement('textarea')
  ta.value = text
  ta.setAttribute('readonly', '')
  ta.style.position = 'fixed'
  ta.style.top = '-1000px'
  ta.style.opacity = '0'
  document.body.appendChild(ta)
  ta.select()
  let ok = false
  try { ok = document.execCommand('copy') } catch { ok = false }
  document.body.removeChild(ta)
  return ok
}

/** A file name for the featured image, from the slug (ASCII-safe; Hebrew slugs keep their letters). */
export function featuredImageFileName(slug: string | null | undefined, contentType?: string | null): string {
  const base = String(slug ?? '').trim().toLowerCase()
    .replace(/[^\p{L}\p{N}-]+/gu, '-').replace(/-+/g, '-').replace(/^-|-$/g, '').slice(0, 80) || 'featured-image'
  const ext = /png/i.test(contentType ?? '') ? 'png' : /webp/i.test(contentType ?? '') ? 'webp' : 'jpg'
  return `${base}.${ext}`
}
