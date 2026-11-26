/**
 * The AI first draft of a social post, from one of the project's articles or
 * from a topic the owner typed. It is ALWAYS a draft: it lands on the screen and
 * nothing is published until the owner reads it and approves (meta_posts cannot
 * be scheduled without approved_at).
 *
 * WHAT THE MODEL RECEIVES. The article's title and summary, or the topic, and
 * the language. Nothing about the Facebook Page or the Instagram account: not
 * its name, its id, its profile photo, its token, its followers (legal review
 * 2026-11-25, condition 6). A guard holds this by reading the prompt builder's
 * input type. Server-only; the generator is injected so a guard runs it offline.
 */
import { generateGbpDraft } from '@/lib/gbp/generate'
import { clampPostText, META_BODY_MAX, type MetaPostLanguage } from './validate'

export interface MetaDraftSource {
  language: MetaPostLanguage
  article?: { title: string; description: string | null } | null
  topic?: string | null
}

const LANGUAGE_NAME: Record<MetaPostLanguage, string> = {
  he: 'Hebrew', en: 'English', es: 'Spanish', 'pt-BR': 'Brazilian Portuguese', fr: 'French', it: 'Italian',
  ja: 'Japanese', de: 'German', nl: 'Dutch', pl: 'Polish', ko: 'Korean',
}

export function buildMetaDraftPrompt(src: MetaDraftSource): string {
  const lang = LANGUAGE_NAME[src.language] ?? 'English'
  const about = src.article
    ? `an article.\nArticle title: ${src.article.title}\n${src.article.description ? `Article summary: ${src.article.description}\n` : ''}`
    : `this topic: ${src.topic ?? ''}\n`
  return [
    `Write one social media post in ${lang} for a business's Facebook Page and Instagram account, about ${about}`,
    'Rules: plain text, no markdown. Between 300 and 900 characters. At most two emoji and at most three hashtags, at the end.',
    'Open with the most useful sentence for the reader. Be concrete and factual; do not invent prices, dates, discounts, statistics or claims.',
    'Never include a URL, a phone number or an email address in the text.',
    'Return JSON: {"summary": "<the post text>"}',
  ].join('\n')
}

export function cleanMetaDraft(raw: string): string {
  let text = raw
  try {
    const parsed = JSON.parse(raw) as { summary?: unknown }
    if (typeof parsed?.summary === 'string') text = parsed.summary
  } catch { /* plain text answer */ }
  text = text
    .replace(/\r/g, '').replace(/^#{1,6}\s+/gm, '').replace(/\*\*|__|`/g, '')
    .replace(/https?:\/\/\S+/g, '').replace(/[^\S\n]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim()
  return clampPostText(text, META_BODY_MAX)
}

export type MetaGenerate = (prompt: string) => Promise<string>
export const defaultMetaGenerate: MetaGenerate = (prompt) =>
  generateGbpDraft(prompt, { label: 'meta-post', answerBudget: 1800, temperature: 0.6 })

export async function draftMetaPost(src: MetaDraftSource, generate: MetaGenerate = defaultMetaGenerate): Promise<{ ok: true; body: string } | { ok: false }> {
  let raw: string
  try { raw = await generate(buildMetaDraftPrompt(src)) } catch { return { ok: false } }
  const body = cleanMetaDraft(raw)
  return body ? { ok: true, body } : { ok: false }
}
