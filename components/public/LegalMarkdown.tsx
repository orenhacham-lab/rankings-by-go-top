/**
 * Renders a parsed Spanish legal document into the same plain semantic markup
 * the hand-written Hebrew and English documents use (section, h2, p, ul,
 * strong, a), so `LEGAL_PROSE` styles all six the same way.
 *
 * Each `##` opens a section, the way the English pages wrap each heading in
 * one, so the spacing between sections matches rather than merely resembling.
 */
import Link from 'next/link'
import type { Block, Inline } from '@/lib/legal/markdown'

function renderInline(nodes: Inline[]): React.ReactNode {
  return nodes.map((node, i) => {
    switch (node.kind) {
      case 'text':
        return node.text
      case 'break':
        return <br key={i} />
      case 'strong':
        return <strong key={i}>{renderInline(node.children)}</strong>
      case 'em':
        return <em key={i}>{renderInline(node.children)}</em>
      case 'link':
        // A site-relative href goes through Link so it is a client navigation;
        // mailto, tel and external links are plain anchors.
        return node.href.startsWith('/')
          ? <Link key={i} href={node.href}>{renderInline(node.children)}</Link>
          : (
            <a
              key={i}
              href={node.href}
              {...(node.href.startsWith('https://') ? { target: '_blank', rel: 'noopener noreferrer' } : {})}
            >
              {renderInline(node.children)}
            </a>
          )
    }
  })
}

function renderBlock(block: Block, key: number): React.ReactNode {
  switch (block.kind) {
    case 'heading':
      // The page's own h1 is the document title, so a `#` in the body is an h2
      // like a `##`: the markup never skips a level.
      return block.level === 3
        ? <h3 key={key}>{renderInline(block.children)}</h3>
        : <h2 key={key}>{renderInline(block.children)}</h2>
    case 'paragraph':
      return <p key={key}>{renderInline(block.children)}</p>
    case 'list':
      return (
        <ul key={key}>
          {block.items.map((item, i) => <li key={i}>{renderInline(item)}</li>)}
        </ul>
      )
  }
}

export function LegalMarkdown({ blocks }: { blocks: Block[] }) {
  // Group the blocks into one <section> per top-level heading.
  const sections: Block[][] = []
  for (const block of blocks) {
    const opensSection = block.kind === 'heading' && block.level <= 2
    if (opensSection || sections.length === 0) sections.push([])
    sections[sections.length - 1].push(block)
  }

  return (
    <>
      {sections.map((section, i) => (
        // `LEGAL_PROSE` spaces the sections apart; this spaces the paragraphs
        // inside one, which the hand-written pages do with per-paragraph mt-3.
        <section key={i} className="space-y-3">
          {section.map((block, j) => renderBlock(block, j))}
        </section>
      ))}
    </>
  )
}
