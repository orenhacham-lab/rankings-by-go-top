/**
 * The content changes the application-password channel makes through the WordPress REST API, for
 * sites without the plugin. The SAME markup as the plugin's includes/content.php (a QA parity check
 * runs both on the same input), so a page fixed either way looks the same and undoes the same way.
 * Nothing here removes a word the merchant wrote.
 */
import { createHash } from 'crypto'
import type { FaqItem } from './types'

export const sha256 = (s: string) => createHash('sha256').update(s, 'utf8').digest('hex')

const esc = (s: string) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#039;')

/** The FAQ block for one job, in block-editor markup (identical to gotop_seo_bridge_faq_block). */
export function faqBlockHtml(jobId: string, heading: string, items: readonly FaqItem[]): string {
  const cls = `gotop-faq gotop-fix-${jobId.replace(/[^0-9a-f]/g, '').slice(0, 12)}`
  let html = `<!-- wp:group {"className":"${cls}"} -->\n`
  html += `<div class="wp-block-group ${cls}"><!-- wp:heading -->\n`
  html += `<h2 class="wp-block-heading">${esc(heading)}</h2>\n`
  html += '<!-- /wp:heading -->'
  for (const item of items) {
    html += '\n\n<!-- wp:heading {"level":3} -->\n'
    html += `<h3 class="wp-block-heading">${esc(item.q)}</h3>\n`
    html += '<!-- /wp:heading -->\n\n'
    html += `<!-- wp:paragraph -->\n<p>${esc(item.a)}</p>\n<!-- /wp:paragraph -->`
  }
  html += '</div>\n<!-- /wp:group -->'
  return html
}

export const appendBlock = (content: string, block: string) => `${content.replace(/[ \t\n\r\0\x0B]+$/, '')}\n\n${block}`

/** Remove exactly one copy of a block we added; null when it is not there exactly once. */
export function removeBlock(content: string, block: string): string | null {
  const at = content.indexOf(block)
  if (at < 0 || content.indexOf(block, at + 1) >= 0) return null
  return content.slice(0, at).replace(/[ \t\n\r\0\x0B]+$/, '') + content.slice(at + block.length)
}

function attr(tag: string, name: string): string | null {
  const m = tag.match(new RegExp(`\\s${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s>]+))`, 'i'))
  if (!m) return null
  return m[4] || m[3] || m[2] || ''
}

const decode = (s: string) => s.replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#0?39;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>')

/** Same link: the exact address, or the same path on this site written without a host. */
export function sameLink(written: string, href: string, homeHost: string): boolean {
  const w = decode(String(written ?? '')).trim()
  if (!w) return false
  const norm = (u: string) => u.replace(/#.*$/, '').replace(/\/+$/, '')
  if (norm(w) === norm(href)) return true
  if (w.startsWith('/') && !w.startsWith('//')) {
    try {
      const u = new URL(href)
      if (u.hostname.toLowerCase().replace(/^www\./, '') !== homeHost.toLowerCase().replace(/^www\./, '')) return false
      return norm(w) === norm(`${u.pathname}${u.search}`)
    } catch {
      return false
    }
  }
  return false
}

/** Point every link to `href` at `replacement`, or remove the link and keep its words. */
export function fixBrokenLink(content: string, href: string, replacement: string | null, homeHost: string): { html: string; count: number } {
  let count = 0
  const html = content.replace(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi, (whole, attrs: string, inner: string) => {
    const written = attr(` ${attrs}`, 'href')
    if (written === null || !sameLink(written, href, homeHost)) return whole
    count++
    if (replacement === null) return inner
    const next = ` ${attrs}`.replace(/\shref\s*=\s*("[^"]*"|'[^']*'|[^\s>]+)/i, ` href="${esc(replacement)}"`)
    return `<a${next.replace(/[ \t\n\r\0\x0B]+$/, '')}>${inner}</a>`
  })
  return { html, count }
}

/** Whether the content links to `target` (either spelling). */
export function linksTo(content: string, target: string, homeHost: string): boolean {
  for (const m of content.matchAll(/<a\b([^>]*)>/gi)) {
    const written = attr(` ${m[1]}`, 'href')
    if (written !== null && sameLink(written, target, homeHost)) return true
  }
  return false
}

/** The dead link as the page shows it: its words, for the preview. */
export function brokenLinkWords(content: string, href: string, homeHost: string): string[] {
  const out: string[] = []
  for (const m of content.matchAll(/<a\b([^>]*)>([\s\S]*?)<\/a>/gi)) {
    const written = attr(` ${m[1]}`, 'href')
    if (written !== null && sameLink(written, href, homeHost)) out.push(decode(m[2].replace(/<[^>]+>/g, '')).replace(/\s+/g, ' ').trim())
  }
  return out
}
