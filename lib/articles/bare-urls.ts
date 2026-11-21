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

/**
 * THE FOREIGN HOSTS THAT KEEP THEIR LINK EXACTLY AS IT WAS WRITTEN.
 *
 * The generic rule gives every outbound link `rel="nofollow"`, which is right
 * by default: a link we did not mean to endorse should not pass ranking
 * strength out of the site. Two hosts are Oren's standing exceptions, decided
 * on 21 Nov 2026:
 *
 *   kroyzer.co.il  the link in `articles/google-seo-benefits` on the anchor
 *                  "קידום אורגני". It stays, and it stays dofollow.
 *   gotop.co.il    GO TOP, the marketing agency. The articles no longer name
 *                  it as their PUBLISHER — that is what cost the product its
 *                  entity (lib/seo/organization.ts) — but a link to it in an
 *                  article's body is a different thing, and it is kept whole.
 *
 * Only the `rel` is exempt. The address itself is still checked: an exempt
 * host that cannot exist is still not published as a link.
 */
export const NOFOLLOW_EXEMPT_HOSTS = ['kroyzer.co.il', 'gotop.co.il']

export function isNofollowExempt(url: string): boolean {
  const host = hostOfUrl(url)
  if (!host) return false
  const bare = host.replace(/:\d+$/, '').toLowerCase()
  return NOFOLLOW_EXEMPT_HOSTS.some((h) => bare === h || bare.endsWith(`.${h}`))
}

export function hostOfUrl(url: string): string | null {
  const host = url.match(/^https?:\/\/([^/?#]+)/i)?.[1]
  return host ? host.toLowerCase() : null
}

export const isOwnUrl = (url: string): boolean => {
  const host = hostOfUrl(url)
  return !!host && OWN_HOSTS.includes(host)
}

/**
 * ONLY ASCII CHARACTERS A URL CAN ACTUALLY CONTAIN (RFC 3986), and the address
 * must then hold a host that could exist. Both halves were learnt from pages
 * that are live.
 *
 * `[^\s<>"'()[\]]+` matched everything that is not a space, which in a language
 * written WITHOUT SPACES means the rest of the sentence. The Japanese article
 * `seo-settings-guide-japan` (31 Oct 2026) explains that an address beginning
 * `http://` is a weak signal, and the whole explanation — 54 Japanese
 * characters of it — became the href of one link. Restricting the match to the
 * ASCII characters an address is allowed to contain stops it at the first
 * Japanese character, and leaves a percent-encoded Hebrew address (`%D7%A7…`)
 * untouched, because percent-encoding is ASCII.
 *
 * The Dutch article `what-is-google-search-console-dutch-guide` (7 Nov 2026)
 * shows the other half. It tells the reader that a site has four versions —
 * "(http://, https://, http://www. en https://www.)" — and all four became
 * live links to nowhere. Each of those is a scheme with no host, or a host with
 * no dot, so `HOSTLIKE` below refuses them and the text is left as text.
 */
const BARE_URL = /https?:\/\/[A-Za-z0-9\-._~:/?#@!$&*+,;=%]+/g

/**
 * A host that could be a real one: dot-separated labels and a letters-only
 * public suffix of at least two characters. Deliberately strict — the cost of
 * not linking an address is that the reader copies it, and the cost of linking
 * a non-address is a broken link on a published page.
 */
const HOSTLIKE = /^(?=.{4,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,24}$/i

/**
 * HOSTS THAT MEAN "YOUR OWN SITE HERE".
 *
 * Reserved for documentation by RFC 2606 / RFC 6761, plus the placeholders the
 * writer reaches for in each language — measured, not imagined: `example.com`
 * is a live link in the Japanese article `google-search-engine-registration-guide`
 * (9 Nov 2026), `www.seusite.com.br` in the Brazilian `webmaster-tools-google-guide`
 * (9 Nov 2026) and `yourwebsite.com` twice in the English `google-webmaster-tools-guide`
 * (24 Oct 2026). A reader who clicks one of those learns that we publish pages
 * nobody checked, and an engine reading the page sees an outbound link to a
 * domain that answers nothing.
 *
 * Only the HOST is judged, so the words around it stay exactly as written: the
 * sentence still says `https://example.com/sitemap.xml`, it is simply not a
 * link any more.
 */
const PLACEHOLDER_LABELS = [
  // RFC 2606 / 6761 reserved names.
  'example', 'test', 'invalid', 'localhost',
  // English.
  'yourwebsite', 'your-website', 'yoursite', 'your-site', 'yourdomain', 'your-domain',
  'mywebsite', 'my-website', 'mysite', 'my-site', 'mydomain', 'my-domain', 'domain', 'website',
  // Portuguese (Brazil) and Spanish.
  'seusite', 'seu-site', 'seudominio', 'seu-dominio', 'tusitio', 'tu-sitio', 'tudominio', 'tu-dominio',
  // French.
  'votresite', 'votre-site', 'votredomaine', 'votre-domaine', 'monsite', 'mon-site',
  // Italian.
  'ilmiosito', 'il-mio-sito', 'miosito', 'mio-sito', 'tuosito', 'tuo-sito',
  // German.
  'ihrewebsite', 'ihre-website', 'ihreseite', 'ihre-seite', 'deinewebsite', 'deine-website', 'meinewebsite', 'meine-website',
  // Dutch.
  'mijnwebsite', 'mijn-website', 'mijnsite', 'mijn-site', 'uwwebsite', 'uw-website', 'jouwwebsite', 'jouw-website',
  // Polish.
  'twojastrona', 'twoja-strona', 'twojadomena', 'twoja-domena', 'mojastrona', 'moja-strona',
]

/** Suffixes reserved for documentation and testing (RFC 6761). */
const PLACEHOLDER_SUFFIXES = ['.example', '.test', '.invalid', '.localhost']

/** Is this host a stand-in for the reader's own site rather than a real one? */
export function isPlaceholderHost(host: string | null): boolean {
  if (!host) return false
  const h = host.toLowerCase().replace(/^www\./, '').replace(/:\d+$/, '')
  if (PLACEHOLDER_SUFFIXES.some((s) => h === s.slice(1) || h.endsWith(s))) return true
  const label = h.split('.')[0]
  return PLACEHOLDER_LABELS.includes(label)
}

/** An address worth turning into a link: a real scheme and a host that could exist. */
export function isLinkableUrl(url: string): boolean {
  const host = hostOfUrl(url)
  if (!host) return false
  if (!HOSTLIKE.test(host.replace(/:\d+$/, ''))) return false
  return !isPlaceholderHost(host)
}

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
      if (!url || !isLinkableUrl(url)) return match
      const tail = match.slice(url.length)
      const attrs = isOwnUrl(url) ? '' : ' target="_blank" rel="nofollow noopener"'
      return `<a href="${url}"${attrs}>${url}</a>${tail}`
    })
  }
  return tokens.join('')
}

// ── repairing the links a published article already carries ─────────────────

/**
 * THE ONE SHOPIFY ADDRESS, AND IT IS LOWER CASE.
 *
 * The App Store listing lives at `/go-top-seo`. The Italian
 * `search-engine-optimization-guide` and the German `searchconsole-anleitung-unternehmen`
 * both carry `apps.shopify.com/Go-Top-SEO`, written the way the product's NAME
 * is written, and both lost the `rel="nofollow"` the rule requires. The brief
 * asks the model for the right address and the truth gate reads the model's
 * text, so neither sees an address that a later pass wrote.
 */
export const SHOPIFY_LISTING_URL = 'https://apps.shopify.com/go-top-seo'

const HREF_RE = /\shref\s*=\s*"([^"]*)"/i
const REL_RE = /\srel\s*=\s*"([^"]*)"/i

/** The canonical form of an outbound href, or null when it needs no change. */
function canonicalHref(href: string): string | null {
  if (!/^https?:\/\/apps\.shopify\.com\//i.test(href)) return null
  return href === SHOPIFY_LISTING_URL ? null : SHOPIFY_LISTING_URL
}

/** `rel` with nofollow and noopener present, order kept, nothing else dropped. */
export function withNofollow(rel: string | null): string {
  const parts = (rel ?? '').split(/\s+/).filter(Boolean)
  for (const needed of ['nofollow', 'noopener']) {
    if (!parts.some((p) => p.toLowerCase() === needed)) parts.push(needed)
  }
  return parts.join(' ')
}

/**
 * EVERY LINK IN A BODY WE ALREADY PUBLISHED, RE-ASKED.
 *
 * Runs on RENDER as well as on the daily publish, so it repairs the pages that
 * are live without touching a stored row — the same property that let the bare
 * URL pass fix old articles. It only ever removes a link or corrects an
 * attribute; it never writes a sentence, never drops a word, and never changes
 * whether an article can be published. Three things it does:
 *
 *   1. A link whose address cannot be real — a scheme with no host
 *      (`http://www`), a sentence that is not an address, a documentation
 *      placeholder (`example.com`) — is UNWRAPPED. The words stay exactly as
 *      the article wrote them; only the anchor goes.
 *   2. A link to somebody else's site is given `rel="nofollow noopener"`.
 *      Without it, every outbound link we generate hands our own authority to
 *      whoever it points at, and the Shopify rule the truth gate enforces was
 *      quietly not holding on the live page.
 *   3. The Shopify listing address is normalised to the one real listing.
 *
 * Pure and idempotent.
 */
export function repairBodyLinks(html: string): string {
  if (!html || !html.includes('<a')) return html
  const tokens = tokenizeHtml(html)
  let unwrapDepth = 0
  for (let i = 0; i < tokens.length; i += 1) {
    const token = tokens[i]
    if (!token.startsWith('<')) continue
    if (/^<\s*\/\s*a\s*>$/i.test(token)) {
      if (unwrapDepth > 0) { tokens[i] = ''; unwrapDepth -= 1 }
      continue
    }
    if (!/^<\s*a\b/i.test(token)) continue
    const href = token.match(HREF_RE)?.[1]
    // An anchor with no href at all, or a page-internal one, is left alone.
    if (!href || !/^https?:\/\//i.test(href)) continue
    if (!isLinkableUrl(href)) { tokens[i] = ''; unwrapDepth += 1; continue }
    let next = token
    const canonical = canonicalHref(href)
    if (canonical) next = next.replace(HREF_RE, ` href="${canonical}"`)
    if (!isOwnUrl(canonical ?? href) && !isNofollowExempt(canonical ?? href)) {
      const rel = next.match(REL_RE)?.[1] ?? null
      const fixed = withNofollow(rel)
      next = rel === null
        ? next.replace(/^<\s*a\b/i, `<a rel="${fixed}"`)
        : next.replace(REL_RE, ` rel="${fixed}"`)
    }
    tokens[i] = next
  }
  return tokens.join('')
}
