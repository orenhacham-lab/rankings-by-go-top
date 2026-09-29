/**
 * The one model question of a placement: in this article, is there a paragraph
 * where one of these member pages genuinely helps the reader, and which words
 * already in that sentence would name it naturally?
 *
 * The model only chooses. Everything it answers is checked here against what it
 * was shown (the paragraph exists, the page was offered, the anchor's words are
 * really in that paragraph, the fit is at or above the threshold, the businesses
 * are complementary), and anything that does not hold means "no placement":
 * skip rather than force. The prompt asks for anchors that name the business or
 * describe the page in the sentence's own words, and says exact-keyword anchors
 * are the exception; anchor.ts classifies what comes back and rules.ts keeps
 * exact-match anchors rare per target.
 *
 * `ask` is the existing JSON model helper (lib/content/recommendations/model.ts,
 * the same Gemini client and key as the rest of the app), injected so the QA
 * suite runs without a provider.
 */
import { LINK_NETWORK_RULES } from './rules'
import { validAnchor, type BodyParagraph } from './anchor'

export interface CandidatePage { url: string; title: string }
export interface CandidateTarget {
  projectId: string
  businessName: string | null
  domain: string
  category: string
  description: string | null
  pages: CandidatePage[]
}
export interface SourceContext {
  businessName: string | null
  domain: string
  category: string
  language: string
  articleTitle: string
}

export interface Choice {
  paragraph: BodyParagraph
  target: CandidateTarget
  page: CandidatePage
  anchor: string
  relevance: number
}

export type AskJson = (prompt: string, schema: Record<string, unknown>) => Promise<string | null>

export const MAX_PARAGRAPHS_SHOWN = 20
export const MAX_TARGETS_SHOWN = 5
export const MAX_PAGES_PER_TARGET = 5

export const CHOICE_SCHEMA: Record<string, unknown> = {
  type: 'OBJECT',
  properties: {
    place: { type: 'BOOLEAN' },
    paragraph: { type: 'INTEGER' },
    page: { type: 'STRING' },
    anchor: { type: 'STRING' },
    relevance: { type: 'INTEGER' },
    complementary: { type: 'BOOLEAN' },
  },
  required: ['place', 'relevance', 'complementary'],
}

const clip = (s: string, n: number) => (s.length > n ? `${s.slice(0, n - 1)}…` : s)

export function buildChoicePrompt(source: SourceContext, paragraphs: BodyParagraph[], targets: CandidateTarget[]): string {
  const paras = paragraphs.slice(0, MAX_PARAGRAPHS_SHOWN).map((p) => `[P${p.index}] ${clip(p.text, 700)}`).join('\n')
  const tgs = targets.slice(0, MAX_TARGETS_SHOWN).map((t, ti) => {
    const pages = t.pages.slice(0, MAX_PAGES_PER_TARGET).map((p, pi) => `    [T${ti + 1}P${pi + 1}] ${clip(p.title, 140)} — ${p.url}`).join('\n')
    return `  T${ti + 1}: ${t.businessName ?? t.domain} (${t.domain}), category: ${clip(t.category, 80)}${t.description ? `. ${clip(t.description, 240)}` : ''}\n${pages}`
  }).join('\n')
  return [
    'You place at most ONE editorial link in an article, only where it genuinely helps the reader.',
    `The article is on ${source.domain} (${source.businessName ?? source.domain}, category: ${source.category}). Title: "${clip(source.articleTitle, 160)}". Language: ${source.language}.`,
    'Paragraphs you may use (the number in brackets is the paragraph id):',
    paras,
    'Pages of other businesses you may link to:',
    tgs,
    'Rules:',
    '- The target business must be COMPLEMENTARY to the article\'s business: it serves the same readers with something different. Never the same line of business, never a competitor. If in doubt, complementary=false.',
    '- The page must be relevant to that exact paragraph, not just to the article\'s general topic.',
    '- The anchor is 2 to 8 words copied EXACTLY, letter for letter, from that paragraph. Do not rewrite the sentence and do not invent words.',
    '- Prefer anchors that name the business or describe what the page offers in the sentence\'s own words. Avoid anchors that are exactly the page\'s main keyword or title; use one only if nothing else reads naturally.',
    '- Never "click here", "here", "this site" or similar.',
    `- relevance: 0-100, how much the page helps a reader of that paragraph. Below ${LINK_NETWORK_RULES.minRelevance} means no link.`,
    '- If nothing fits well, answer {"place": false, "relevance": 0, "complementary": false}. Skipping is always acceptable.',
    'Answer JSON: {"place": boolean, "paragraph": number, "page": "T1P1", "anchor": string, "relevance": number, "complementary": boolean}.',
  ].join('\n')
}

export type ChoiceSkip = 'model_declined' | 'invalid_answer' | 'not_complementary' | 'low_relevance' | 'unknown_paragraph' | 'unknown_page' | 'anchor_invalid' | 'anchor_not_in_paragraph'

/** Check the model's answer against what it was shown. Pure. */
export function readChoice(raw: string | null, paragraphs: BodyParagraph[], targets: CandidateTarget[]): { ok: true; choice: Choice } | { ok: false; skip: ChoiceSkip } {
  let v: Record<string, unknown>
  try {
    const parsed = raw ? JSON.parse(raw) : null
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return { ok: false, skip: 'invalid_answer' }
    v = parsed as Record<string, unknown>
  } catch {
    return { ok: false, skip: 'invalid_answer' }
  }
  if (v.place !== true) return { ok: false, skip: 'model_declined' }
  if (v.complementary !== true) return { ok: false, skip: 'not_complementary' }
  const relevance = typeof v.relevance === 'number' && Number.isFinite(v.relevance) ? Math.round(v.relevance) : -1
  if (relevance < LINK_NETWORK_RULES.minRelevance || relevance > 100) return { ok: false, skip: 'low_relevance' }
  const paragraph = paragraphs.slice(0, MAX_PARAGRAPHS_SHOWN).find((p) => p.index === v.paragraph)
  if (!paragraph) return { ok: false, skip: 'unknown_paragraph' }
  const m = typeof v.page === 'string' ? /^T(\d+)P(\d+)$/.exec(v.page.trim()) : null
  const target = m ? targets.slice(0, MAX_TARGETS_SHOWN)[Number(m[1]) - 1] : undefined
  const page = target && m ? target.pages.slice(0, MAX_PAGES_PER_TARGET)[Number(m[2]) - 1] : undefined
  if (!target || !page) return { ok: false, skip: 'unknown_page' }
  const anchor = typeof v.anchor === 'string' ? v.anchor.trim() : ''
  if (!validAnchor(anchor)) return { ok: false, skip: 'anchor_invalid' }
  if (!paragraph.text.toLowerCase().includes(anchor.toLowerCase())) return { ok: false, skip: 'anchor_not_in_paragraph' }
  return { ok: true, choice: { paragraph, target, page, anchor, relevance } }
}
