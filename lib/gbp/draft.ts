/**
 * The AI first draft of a post, from one of the project's articles or from a
 * topic the merchant typed. It is ALWAYS a draft: it lands in the composer and
 * is published only after the merchant reads it and presses publish (Google
 * rejects "auto-generated" posts, research.md).
 *
 * The result is cleaned before it reaches the screen: at most 1,500
 * characters, no phone number (Google refuses those), no markdown.
 * Server-only. The generator is injected so a guard runs it without a network.
 */
import { getRecoGenAiClient } from '@/lib/content/recommendations/genai-client'
import { RECOMMENDATION_MODEL_PRIMARY } from '@/lib/content/recommendations/model'
import { resolveModelConfig } from '@/lib/content/recommendations/model-config'
import { clampPostText, containsPhoneNumber, GBP_SUMMARY_MAX } from './validate'

export interface DraftSource {
  businessName: string | null
  language: 'he' | 'en'
  article?: { title: string; description: string | null; url: string | null } | null
  topic?: string | null
}

/** The target is below Google's 1,500 so the merchant has room to add a line. */
export const GBP_DRAFT_TARGET = 900

export function buildDraftPrompt(src: DraftSource): string {
  const lang = src.language === 'he' ? 'Hebrew' : 'English'
  const about = src.article
    ? `an article on the business's website.\nArticle title: ${src.article.title}\n${src.article.description ? `Article summary: ${src.article.description}\n` : ''}`
    : `this topic: ${src.topic ?? ''}\n`
  return [
    `Write one Google Business Profile "update" post in ${lang} for ${src.businessName ? `the business "${src.businessName}"` : 'a local business'}, about ${about}`,
    `Rules: plain text only, no markdown, no hashtags, at most one emoji. Between 400 and ${GBP_DRAFT_TARGET} characters.`,
    'Open with the most useful sentence for a nearby customer. Speak to the reader. Be concrete and factual; do not invent prices, dates, discounts or claims.',
    'Never include a phone number, an email address or a URL in the text (the post has its own button).',
    'Return JSON: {"summary": "<the post text>"}',
  ].join('\n')
}

/** Clean model output into something the composer can show as-is. */
export function cleanDraft(raw: string): string {
  let text = raw
  try {
    const parsed = JSON.parse(raw) as { summary?: unknown }
    if (typeof parsed?.summary === 'string') text = parsed.summary
  } catch { /* plain text answer */ }
  text = text
    .replace(/\r/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/https?:\/\/\S+/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  // Drop any line that still carries a phone number rather than send a post Google will refuse.
  if (containsPhoneNumber(text)) text = text.split('\n').filter((l) => !containsPhoneNumber(l)).join('\n').trim()
  return clampPostText(text, GBP_SUMMARY_MAX)
}

export type Generate = (prompt: string) => Promise<string>

export const defaultGenerate: Generate = async (prompt) => {
  const client = getRecoGenAiClient()
  if (!client) throw new Error('draft_unavailable')
  const mc = resolveModelConfig(RECOMMENDATION_MODEL_PRIMARY, 900)
  const resp = await client.models.generateContent({
    model: RECOMMENDATION_MODEL_PRIMARY,
    contents: prompt,
    config: {
      responseMimeType: 'application/json',
      temperature: 0.6,
      maxOutputTokens: mc.maxOutputTokens,
      thinkingConfig: { thinkingBudget: mc.thinkingBudget },
      abortSignal: AbortSignal.timeout(30_000),
    },
  })
  return typeof resp.text === 'string' ? resp.text : ''
}

export async function draftPost(src: DraftSource, generate: Generate = defaultGenerate): Promise<{ ok: true; summary: string } | { ok: false }> {
  let raw: string
  try { raw = await generate(buildDraftPrompt(src)) } catch { return { ok: false } }
  const summary = cleanDraft(raw)
  if (!summary) return { ok: false }
  return { ok: true, summary }
}
