/**
 * ONE bounded Gemini title-repair, shared by every recommendation source. Turns
 * a valid-but-weak title (brand-colon formula / generic cliché / stale framing /
 * mixed-form) into a natural, specific title WITHOUT changing the topic, keyword
 * or intent, and WITHOUT inventing claims. Returns null on any failure so the
 * caller discards the unrecoverable title (never fabricates content).
 */

import { getGeminiClient } from '@/lib/ai-visibility/gemini-semantic-classifier'
import type { TopicSuggestion } from './types'

export async function geminiRepairTitle(langLabel: string, year: number, c: TopicSuggestion): Promise<{ title: string; reason?: string } | null> {
  const client = getGeminiClient()
  if (!client) return null
  const modelName = process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite'
  const prompt = [
    `Rewrite this weak article title into a NATURAL, specific, editorial ${langLabel} title.`,
    `Keep the SAME topic, primary keyword and search intent. Do NOT change the subject, invent facts, add superlatives/rarity/limited-edition claims, use a "[Brand]: [angle]" colon formula, or any generic cliché ("טעויות נפוצות", "המדריך המלא", "סודות", "הטובים ביותר").`,
    `Vary the sentence structure; the brand may appear anywhere or only in the keyword. Prefer the natural Hebrew brand form when established. Current year is ${year} — keep it evergreen, never a past year.`,
    `Current title: "${c.title}"`,
    `Primary keyword: "${c.primaryKeyword}". Search intent: "${c.searchIntent || 'informational'}".`,
    `Return ONLY JSON: {"title":"…","reason":"one short ${langLabel} sentence"}.`,
  ].join('\n')
  try {
    const model = client.getGenerativeModel({ model: modelName, generationConfig: { responseMimeType: 'application/json', temperature: 0.6 } })
    const text = (await model.generateContent(prompt)).response.text()
    const m = text.match(/\{[\s\S]*\}/)
    if (!m) return null
    const o = JSON.parse(m[0]) as { title?: unknown; reason?: unknown }
    const title = typeof o.title === 'string' ? o.title.trim() : ''
    if (!title) return null
    return { title, reason: typeof o.reason === 'string' ? o.reason.trim() : undefined }
  } catch { return null }
}
