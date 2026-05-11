/**
 * Presentation-only cleanup + light markdown parsing of AI response text.
 *
 * Removes UI artifacts that leak through ScrapeLLM responses but should not
 * appear to end users. Does NOT modify stored raw_response — only affects
 * what's rendered.
 *
 * Artifacts handled:
 *   - □map□, □image□, ▢token▢, ⬜thing⬜  (box-wrapped placeholders)
 *   - [map], [image_card], [chart], [video]  (bracket placeholders)
 *   - ```artifact ... ```  (code-fenced UI artifacts)
 *   - 【1†source】, 【1†https://...】  (ChatGPT footnotes)
 *   - [1], [2], [[1]], [[2]]  (numeric citation markers)
 *   - ([domain][1]), ([Source][2])  (Perplexity-style inline citations)
 *   - ([1]), ([2])  (bare numeric inline citations)
 *   - zero-width spaces, BOM, direction-control chars
 *   - lone ``` fences and excessive blank lines
 */

const PLACEHOLDER_BOX_CHARS = '[□■▢▣⬜⬛]'
const PLACEHOLDER_TOKEN = '[a-z_][a-z0-9_\\-\\s]{0,40}'

const BOX_PLACEHOLDER_RE = new RegExp(
  `${PLACEHOLDER_BOX_CHARS}\\s*${PLACEHOLDER_TOKEN}\\s*${PLACEHOLDER_BOX_CHARS}`,
  'gi'
)

const ARTIFACT_FENCE_RE = /```(artifact|embed|widget|tool|ui|interactive)[\s\S]*?```/gi

const BRACKET_PLACEHOLDER_RE = /\[(map|image|image_card|chart|video|carousel|widget|embed|artifact|tool)\b[^\]]*\]/gi

const CITATION_FOOTNOTE_RE = /【\d+[††][^】]*】/g

// Numeric citation markers: [1], [2], [[1]], [[2]]
const NUMERIC_CITATION_RE = /\[{1,2}\d+\]{1,2}/g

// Perplexity-style inline: ([domain.com][1]) or ([Source Name][2])
const PERPLEXITY_INLINE_CITATION_RE = /\(\[[^\]]+\]\[\d+\]\)/g

// Bare parenthesized numeric: ([1])
const PAREN_NUMERIC_CITATION_RE = /\(\[\d+\]\)/g

const STANDALONE_BOX_RE = new RegExp(`\\s${PLACEHOLDER_BOX_CHARS}\\s`, 'g')

const ZERO_WIDTH_RE = /[​-‏‪-‮⁠﻿]/g

const TRIPLE_NEWLINE_RE = /\n{3,}/g

const TRAILING_WS_RE = /[ \t]+$/gm

// Lone triple-backtick fences
const LONE_TRIPLE_BACKTICK_RE = /^```\s*$/gm

/**
 * Clean a response text for display.
 */
export function cleanResponseText(text: string | null | undefined): string {
  if (!text) return ''
  let out = String(text)

  // Order matters: structural fences → placeholders → citations → whitespace
  out = out.replace(ARTIFACT_FENCE_RE, '')
  out = out.replace(BOX_PLACEHOLDER_RE, '')
  out = out.replace(BRACKET_PLACEHOLDER_RE, '')
  out = out.replace(CITATION_FOOTNOTE_RE, '')
  out = out.replace(PERPLEXITY_INLINE_CITATION_RE, '')
  out = out.replace(PAREN_NUMERIC_CITATION_RE, '')
  out = out.replace(NUMERIC_CITATION_RE, '')
  out = out.replace(STANDALONE_BOX_RE, ' ')
  out = out.replace(LONE_TRIPLE_BACKTICK_RE, '')
  out = out.replace(ZERO_WIDTH_RE, '')
  out = out.replace(TRAILING_WS_RE, '')

  // Collapse spaces left from removed citations
  out = out.replace(/ {2,}/g, ' ')
  // Clean up orphaned punctuation left after citation removal
  out = out.replace(/\s+([.,;:!?])/g, '$1')
  out = out.replace(TRIPLE_NEWLINE_RE, '\n\n')

  return out.trim()
}

export function toParagraphs(text: string | null | undefined): string[] {
  const cleaned = cleanResponseText(text)
  if (!cleaned) return []
  return cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}

/**
 * Parse text into typed blocks for rendering as proper markdown.
 *
 * Block types:
 *   - heading: # / ## / ###
 *   - bullet: - / * / •
 *   - numbered: 1. text
 *   - text: anything else
 */
export type Block =
  | { type: 'heading'; level: 1 | 2 | 3; text: string }
  | { type: 'bullet'; text: string }
  | { type: 'numbered'; index: number; text: string }
  | { type: 'text'; text: string }

export function parseBlocks(text: string | null | undefined): Block[] {
  const cleaned = cleanResponseText(text)
  if (!cleaned) return []

  const lines = cleaned.split(/\n/)
  const blocks: Block[] = []
  let buffer: string[] = []

  const flushText = () => {
    if (buffer.length === 0) return
    const joined = buffer.join('\n').trim()
    if (joined.length > 0) {
      blocks.push({ type: 'text', text: stripInlineMarkdown(joined) })
    }
    buffer = []
  }

  for (const raw of lines) {
    const line = raw.trim()
    if (!line) {
      flushText()
      continue
    }
    const h3 = line.match(/^###\s+(.+)$/)
    if (h3) {
      flushText()
      blocks.push({ type: 'heading', level: 3, text: stripInlineMarkdown(h3[1]) })
      continue
    }
    const h2 = line.match(/^##\s+(.+)$/)
    if (h2) {
      flushText()
      blocks.push({ type: 'heading', level: 2, text: stripInlineMarkdown(h2[1]) })
      continue
    }
    const h1 = line.match(/^#\s+(.+)$/)
    if (h1) {
      flushText()
      blocks.push({ type: 'heading', level: 1, text: stripInlineMarkdown(h1[1]) })
      continue
    }
    const bullet = line.match(/^[-*•]\s+(.+)$/)
    if (bullet) {
      flushText()
      blocks.push({ type: 'bullet', text: stripInlineMarkdown(bullet[1]) })
      continue
    }
    const num = line.match(/^(\d+)\.\s+(.+)$/)
    if (num) {
      flushText()
      blocks.push({ type: 'numbered', index: Number(num[1]), text: stripInlineMarkdown(num[2]) })
      continue
    }
    buffer.push(line)
  }
  flushText()

  return blocks
}

/**
 * Strip inline markdown (bold/italic/code) for plain rendering.
 */
function stripInlineMarkdown(text: string): string {
  return text
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    .replace(/\*(.+?)\*/g, '$1')
    .replace(/`([^`]+)`/g, '$1')
}
