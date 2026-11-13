'use server'

/**
 * "Keep this for the next articles", the one guidance action the article page
 * uses. It is a file of its own so that page does not import the settings
 * card's actions, one of which uploads and re-encodes the author photo and so
 * reaches sharp. The contract lives in lib/content/writing-guidance/data.ts.
 */
import { addRuleFromArticle, type AddRuleResult } from '@/lib/content/writing-guidance/data'
import { errorName, liveDeps } from './guidance-live-deps'

export async function addWritingRuleAction(articleId: string, text: string): Promise<AddRuleResult> {
  try {
    return await addRuleFromArticle(liveDeps(), articleId, text)
  } catch (err) {
    console.error('[writing-guidance] add rule failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}
