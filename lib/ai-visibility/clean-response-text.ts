/**
 * Presentation-only cleanup of AI response text.
 *
 * Removes UI artifacts that leak through ScrapeLLM responses (especially
 * ChatGPT) but should not appear to end users. Does NOT modify stored
 * raw_response — only affects what's rendered.
 *
 * Examples of artifacts handled:
 *   - □map□, □image□, □search□  (Unicode WHITE SQUARE U+25A1 wrapping a token)
 *   - ▢token▢, ■token■, □token□  (other box characters used as placeholders)
 *   - [map], [image_card], [chart]   (bracket-wrapped UI placeholders)
 *   - ```artifact ... ``` code blocks
 *   - lone ``` markers
 *   - 【1†source】 inline citation footnotes
 *   - zero-width spaces, BOM, line/paragraph separators
 *   - excessive blank lines (more than 2 in a row)
 *
 * Preserved: normal text, URLs, Hebrew/RTL content, citation numbers
 * outside of footnote brackets.
 */

const PLACEHOLDER_BOX_CHARS = '[□■▢▣⬜⬛]' // □ ■ ▢ ▣ ⬜ ⬛
const PLACEHOLDER_TOKEN = '[a-z_][a-z0-9_\\-\\s]{0,40}'

// Match the box-wrapped placeholder pattern: □map□ or □ map □ or even nested whitespace
const BOX_PLACEHOLDER_RE = new RegExp(
  `${PLACEHOLDER_BOX_CHARS}\\s*${PLACEHOLDER_TOKEN}\\s*${PLACEHOLDER_BOX_CHARS}`,
  'gi'
)

// Match an artifact ``` code fence with language tag artifact/embed/widget
const ARTIFACT_FENCE_RE = /```(artifact|embed|widget|tool|ui|interactive)[\s\S]*?```/gi

// Bracket placeholders for UI elements: [map], [image_card], [chart], [video], [carousel]
const BRACKET_PLACEHOLDER_RE = /\[(map|image|image_card|chart|video|carousel|widget|embed|artifact|tool)\b[^\]]*\]/gi

// ChatGPT citation footnotes: 【1†source】 or 【1†https://...】
const CITATION_FOOTNOTE_RE = /【\d+[††][^】]*】/g

// Standalone box characters used as placeholders, surrounded by whitespace
const STANDALONE_BOX_RE = new RegExp(`\\s${PLACEHOLDER_BOX_CHARS}\\s`, 'g')

// Zero-width and direction-control characters that confuse renderers
const ZERO_WIDTH_RE = /[​-‏‪-‮⁠﻿]/g

// Three-or-more consecutive newlines collapse to two
const TRIPLE_NEWLINE_RE = /\n{3,}/g

// Trailing whitespace on each line
const TRAILING_WS_RE = /[ \t]+$/gm

/**
 * Clean a response text for display.
 * Returns empty string for null/undefined input.
 */
export function cleanResponseText(text: string | null | undefined): string {
  if (!text) return ''

  let out = String(text)

  // Order matters: fences before brackets before single placeholders.
  out = out.replace(ARTIFACT_FENCE_RE, '')
  out = out.replace(BOX_PLACEHOLDER_RE, '')
  out = out.replace(BRACKET_PLACEHOLDER_RE, '')
  out = out.replace(CITATION_FOOTNOTE_RE, '')
  out = out.replace(STANDALONE_BOX_RE, ' ')
  out = out.replace(ZERO_WIDTH_RE, '')
  out = out.replace(TRAILING_WS_RE, '')
  out = out.replace(TRIPLE_NEWLINE_RE, '\n\n')

  return out.trim()
}

/**
 * Split cleaned text into paragraphs for rendering.
 * Useful when you want each paragraph in its own <p>.
 */
export function toParagraphs(text: string | null | undefined): string[] {
  const cleaned = cleanResponseText(text)
  if (!cleaned) return []
  return cleaned
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0)
}
