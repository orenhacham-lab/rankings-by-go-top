/**
 * A WEB ADDRESS WRITTEN AS PLAIN TEXT BECOMES A REAL LINK.
 *
 * The blog's first automatic article (11 Oct 2026) ended on "תוכלו להירשם
 * ולהתחיל דרך הקישור הבא: https://www.gotopseo.com/signup?lang=he." — the
 * address as prose, nothing to click. A model writes one that way whatever the
 * prompt says, and a human writing in the admin editor does too, so this runs
 * on RENDER (components/public/articles/ArticleView.tsx) as well as on the
 * daily publish (lib/blog/auto/body-links.ts): every article already on the
 * blog is fixed by it, with no change to any stored row.
 *
 * No DOM: the body is sanitized HTML, so a tag is `<...>` and everything
 * between two tags is text. Only text is ever rewritten, never an attribute,
 * and never text inside an `<a>` (which would nest links) or inside a heading
 * or a code block, where a link is noise.
 *
 * Pure, idempotent, and the same helpers carry the other body-link passes.
 */

/** Tags whose text is left alone. */
const SKIP_INSIDE = new Set(['a', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'code', 'pre'])

/** Block tags a text run can belong to. */
const BLOCKS = ['p', 'li', 'td', 'th', 'blockquote', 'dd', 'dt']

/** Tags that never hold text and so never open a scope. */
const VOID_TAGS = new Set(['br', 'img', 'hr', 'col', 'source', 'input'])

export interface TextRun {
  /** The text itself. */
  text: string
  /** Index of this run in the token list. */
  token: number
  /** The open tags around it, outermost first. */
  stack: string[]
  /** Which paragraph of the body it sits in, 0-based; -1 outside one. */
  paragraph: number
}

export function tokenizeHtml(html: string): string[] {
  return html.split(/(<[^>]*>)/).filter((t) => t.length > 0)
}

/** Every text run of the html, with the tags open around it. */
export function textRuns(tokens: string[]): TextRun[] {
  const runs: TextRun[] = []
  const stack: string[] = []
  let paragraphs = -1
  tokens.forEach((token, index) => {
    if (token.startsWith('<')) {
      const name = token.replace(/^<\s*\/?\s*/, '').match(/^[a-z0-9]+/i)?.[0]?.toLowerCase()
      if (!name) return
      if (/^<\s*\//.test(token)) {
        const at = stack.lastIndexOf(name)
        if (at >= 0) stack.splice(at)
        return
      }
      if (/\/>$/.test(token) || VOID_TAGS.has(name)) return
      if (name === 'p') paragraphs += 1
      stack.push(name)
      return
    }
    runs.push({
      text: token,
      token: index,
      stack: [...stack],
      paragraph: stack.includes('p') ? paragraphs : -1,
    })
  })
  return runs
}

/** Can this run's text carry a link we add? */
export const isLinkableRun = (run: TextRun): boolean =>
  !run.stack.some((tag) => SKIP_INSIDE.has(tag))

/** The innermost block tag open around a run, if any. */
export const blockOfRun = (run: TextRun): string | null => {
  for (let i = run.stack.length - 1; i >= 0; i -= 1) {
    if (BLOCKS.includes(run.stack[i])) return run.stack[i]
  }
  return null
}

/** Our own host, for telling an internal address from a foreign one. */
export const OWN_HOSTS = ['gotopseo.com', 'www.gotopseo.com']

export function hostOfUrl(url: string): string | null {
  const host = url.match(/^https?:\/\/([^/?#]+)/i)?.[1]
  return host ? host.toLowerCase() : null
}

export const isOwnUrl = (url: string): boolean => {
  const host = hostOfUrl(url)
  return !!host && OWN_HOSTS.includes(host)
}

const BARE_URL = /https?:\/\/[^\s<>"'()[\]]+/g
/** A sentence's punctuation is not part of its address. */
const trimUrlTail = (url: string): string => url.replace(/[.,;:!?'"»״׳]+$/, '')

/**
 * Wrap every bare address in the text with an `<a>`. A foreign address keeps
 * `rel="nofollow noopener"` and opens in a new tab; our own addresses stay in
 * the tab.
 */
export function linkifyBareUrls(html: string): string {
  if (!html || !html.includes('://')) return html
  const tokens = tokenizeHtml(html)
  for (const run of textRuns(tokens)) {
    if (!isLinkableRun(run) || !run.text.includes('://')) continue
    tokens[run.token] = run.text.replace(BARE_URL, (match) => {
      const url = trimUrlTail(match)
      if (!url) return match
      const tail = match.slice(url.length)
      const attrs = isOwnUrl(url) ? '' : ' target="_blank" rel="nofollow noopener"'
      return `<a href="${url}"${attrs}>${url}</a>${tail}`
    })
  }
  return tokens.join('')
}
