/**
 * The model call behind the sentence repair (lib/blog/auto/sentence-repair.ts):
 * one short plain-text request, never the article. Kept out of the repair module
 * so the QA suites exercise the repair without Gemini.
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import { articleModel } from '@/lib/content/gemini-article'
import { languageNameInEnglish, normalizeContentLanguage } from '@/lib/content/language'
import type { RewriteBlock } from '@/lib/blog/auto/sentence-repair'

/** A rewrite is a few lines; it gets a fraction of the article's budget. */
export const REWRITE_TIMEOUT_MS = 25_000

export const geminiRewriteBlock: RewriteBlock = async ({ locale, block, sentence, rule }) => {
  const client = getGeminiClient()
  if (!client) return null
  const language = languageNameInEnglish(normalizeContentLanguage(locale))
  const prompt = [
    `Below is one paragraph of a ${language} blog article about SEO software, and one sentence in it that may not be published.`,
    `The sentence may not be published because it contains: ${rule}.`,
    'Rewrite the paragraph so it keeps its useful, true content and its order but no longer says that. If the sentence only made that claim, drop it and keep the rest.',
    'Do not add any new fact, number, promise or claim. Keep every product name as it is.',
    `Write ONLY the rewritten paragraph, in ${language}, as plain text: no quotes, no markdown, no HTML, no explanation.`,
    '',
    `PARAGRAPH: ${block}`,
    `SENTENCE THAT MAY NOT BE PUBLISHED: ${sentence}`,
  ].join('\n')
  const model = client.getGenerativeModel({
    model: articleModel().model,
    generationConfig: { temperature: 0.3 },
  })
  const result = await model.generateContent(prompt, { timeout: REWRITE_TIMEOUT_MS })
  const text = result.response.text().trim()
  // A paragraph several times longer than the one it replaces is not a rewrite.
  return text && text.length <= block.length * 2 + 80 ? text : null
}
