/**
 * The deliberately small Markdown reader behind the Spanish legal pages.
 *
 * The Hebrew and English documents are hand-written JSX. The Spanish ones are
 * Markdown, because the legal thread authors and reviews them as text and its
 * own suite diffs them against the English page named in their front matter.
 * Rendering that text needs a parser, and a general one would be a dependency
 * and an HTML-injection surface we do not need: these files are repository
 * content, and they use six constructs. So this reads exactly those six and
 * throws on anything else, which is how a new construct is noticed at build
 * time rather than shown to a reader as literal asterisks.
 *
 * Supported: `#`/`##`/`###` headings, blank-line-separated paragraphs,
 * `-` bullet lists, `**strong**`, `*em*`, `[text](href)` links, and Markdown's
 * hard line break — a line ending in two spaces — which the contact blocks use
 * to put the company name, its number and its address on three lines.
 *
 * The read happens while the page renders, and every Spanish legal route is
 * `force-static`, so it happens during `next build` and the file is never
 * needed at runtime.
 */
import { readFileSync } from 'fs'
import { join } from 'path'

export type Inline =
  | { kind: 'text'; text: string }
  | { kind: 'break' }
  | { kind: 'strong'; children: Inline[] }
  | { kind: 'em'; children: Inline[] }
  | { kind: 'link'; href: string; children: Inline[] }

export type Block =
  | { kind: 'heading'; level: 1 | 2 | 3; children: Inline[] }
  | { kind: 'paragraph'; children: Inline[] }
  | { kind: 'list'; items: Inline[][] }

export type LegalFrontMatter = {
  title: string
  description: string
  locale: string
  /** The page this document was translated from, so the legal thread's own
   * coverage suite can diff the two. */
  source: string
  lastUpdated: string
}

export type LegalDocument = {
  frontMatter: LegalFrontMatter
  blocks: Block[]
}

/** The schemes a document may link to. Anything else — `javascript:` above
 * all — is a mistake worth failing the build over, even in our own content. */
const ALLOWED_LINK = /^(?:https:\/\/|mailto:|tel:|\/)/

/**
 * Parse one line of inline markup. Strong is matched before em, because `**`
 * would otherwise read as two `*`.
 */
export function parseInline(text: string): Inline[] {
  const out: Inline[] = []
  let rest = text
  const pattern = /(\*\*([^*]+)\*\*)|(\*([^*]+)\*)|(\[([^\]]+)\]\(([^)]+)\))/
  for (;;) {
    const m = pattern.exec(rest)
    if (!m) break
    if (m.index > 0) out.push({ kind: 'text', text: rest.slice(0, m.index) })
    if (m[1]) {
      out.push({ kind: 'strong', children: parseInline(m[2]) })
    } else if (m[3]) {
      out.push({ kind: 'em', children: parseInline(m[4]) })
    } else {
      const href = m[7].trim()
      if (!ALLOWED_LINK.test(href)) {
        throw new Error(`legal markdown: link scheme not allowed: ${href}`)
      }
      out.push({ kind: 'link', href, children: parseInline(m[6]) })
    }
    rest = rest.slice(m.index + m[0].length)
  }
  if (rest) out.push({ kind: 'text', text: rest })
  return out
}

function parseFrontMatter(raw: string, where: string): { frontMatter: LegalFrontMatter; body: string } {
  if (!raw.startsWith('---\n')) throw new Error(`legal markdown: ${where} has no front matter`)
  const end = raw.indexOf('\n---\n', 3)
  if (end === -1) throw new Error(`legal markdown: ${where} has an unterminated front matter`)
  const fields: Record<string, string> = {}
  for (const line of raw.slice(4, end).split('\n')) {
    if (!line.trim()) continue
    const colon = line.indexOf(':')
    if (colon === -1) throw new Error(`legal markdown: ${where} front-matter line without a colon: ${line}`)
    fields[line.slice(0, colon).trim()] = line.slice(colon + 1).trim()
  }
  for (const key of ['title', 'description', 'locale', 'source', 'lastUpdated']) {
    if (!fields[key]) throw new Error(`legal markdown: ${where} front matter is missing ${key}`)
  }
  return {
    frontMatter: {
      title: fields.title,
      description: fields.description,
      locale: fields.locale,
      source: fields.source,
      lastUpdated: fields.lastUpdated,
    },
    body: raw.slice(end + 5),
  }
}

/** Parse a whole document. Kept separate from the file read so the QA suite
 * can hand it a string. */
export function parseLegalMarkdown(raw: string, where = 'document'): LegalDocument {
  const { frontMatter, body } = parseFrontMatter(raw, where)
  const blocks: Block[] = []
  let paragraph: string[] = []
  let items: string[] = []

  // A line ending in two spaces is a hard break; every other newline inside a
  // paragraph is just a wrap, and joins with a space.
  const BREAK = '\u0000br\u0000'
  const flushParagraph = () => {
    if (paragraph.length === 0) return
    const joined = paragraph.join(' ')
    const children: Inline[] = []
    joined.split(BREAK).forEach((part, i) => {
      if (i > 0) children.push({ kind: 'break' })
      // The marker swallowed the newline; the join put a space in its place.
      children.push(...parseInline(i > 0 ? part.replace(/^ /, '') : part))
    })
    blocks.push({ kind: 'paragraph', children })
    paragraph = []
  }
  const flushList = () => {
    if (items.length === 0) return
    blocks.push({ kind: 'list', items: items.map((i) => parseInline(i)) })
    items = []
  }

  for (const line of body.split('\n')) {
    const trimmed = line.trim()
    if (!trimmed) {
      flushParagraph()
      flushList()
      continue
    }
    const heading = /^(#{1,3})\s+(.*)$/.exec(trimmed)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({
        kind: 'heading',
        level: heading[1].length as 1 | 2 | 3,
        children: parseInline(heading[2]),
      })
      continue
    }
    if (trimmed.startsWith('- ')) {
      flushParagraph()
      items.push(trimmed.slice(2))
      continue
    }
    if (/^(?:#{4,}|>|\||\d+\.\s|```)/.test(trimmed)) {
      throw new Error(`legal markdown: ${where} uses a construct this reader does not render: ${trimmed.slice(0, 40)}`)
    }
    flushList()
    paragraph.push(/\s\s$/.test(line) ? `${trimmed}${BREAK}` : trimmed)
  }
  flushParagraph()
  flushList()

  // Some documents end with their own "Última actualización" line. The page
  // renders that date as a footnote, from the front matter, so all four look
  // the same — which would print it twice. Drop the body's copy here rather
  // than editing the legal thread's text.
  const last = blocks[blocks.length - 1]
  if (last && last.kind === 'paragraph') {
    const text = last.children.map((n) => (n.kind === 'text' ? n.text : '')).join('')
    const SAYS_THE_DATE = /^\s*(?:(?:Última|Ultima)\s+actualización|Esta\s+página\s+se\s+actualizó\s+por\s+última\s+vez)/i
    if (SAYS_THE_DATE.test(text)) blocks.pop()
  }
  return { frontMatter, blocks }
}

export type LegalSlug = 'terms' | 'privacy' | 'refund-policy' | 'accessibility'

export const LEGAL_SLUGS: readonly LegalSlug[] = ['terms', 'privacy', 'refund-policy', 'accessibility']

/**
 * Read one Spanish legal document from the repository.
 *
 * Parsed once per process. The pages render per request (they have to, or the
 * document would declare the wrong <html lang>), and the file cannot change
 * under a running server: it is shipped, not uploaded. So the read and the
 * parse happen on the first request a server instance serves and never again,
 * which is what keeps a per-request render as cheap as a prerendered one.
 */
const cache = new Map<LegalSlug, LegalDocument>()

export function readLegalDocument(slug: LegalSlug): LegalDocument {
  const cached = cache.get(slug)
  if (cached) return cached
  const path = join(process.cwd(), 'content', 'legal', 'es', `${slug}.md`)
  const doc = parseLegalMarkdown(readFileSync(path, 'utf8'), `content/legal/es/${slug}.md`)
  cache.set(slug, doc)
  return doc
}
