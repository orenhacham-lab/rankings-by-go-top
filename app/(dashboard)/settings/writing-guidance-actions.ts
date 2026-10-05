'use server'

/**
 * The writing guidance's server actions: the settings card's read and save,
 * and the article page's "keep this for the next articles". The contract
 * (ownership, validation, the read-only mode while the column is missing)
 * lives in lib/content/writing-guidance/data.ts and runs under test there;
 * this file only wires the real session in. Every action answers a stable
 * code and never throws.
 */
import {
  addRuleFromArticle,
  loadWritingGuidance,
  saveWritingGuidance,
  type AddRuleResult,
  type GuidanceDeps,
  type LoadGuidanceResult,
  type SaveGuidanceResult,
} from '@/lib/content/writing-guidance/data'
import { createClient } from '@/lib/supabase/server'

function liveDeps(): GuidanceDeps {
  return {
    session: async () => {
      const db = await createClient()
      const { data, error } = await db.auth.getUser()
      return { userId: !error && data?.user ? data.user.id : null, db }
    },
  }
}

const errorName = (err: unknown) => (err instanceof Error ? err.name : typeof err)

export async function loadWritingGuidanceAction(projectId: string): Promise<LoadGuidanceResult> {
  try {
    return await loadWritingGuidance(liveDeps(), projectId)
  } catch (err) {
    console.error('[writing-guidance] load failed', { error: errorName(err) })
    return { ok: false, code: 'unavailable' }
  }
}

export async function saveWritingGuidanceAction(projectId: string, input: unknown): Promise<SaveGuidanceResult> {
  try {
    return await saveWritingGuidance(liveDeps(), projectId, input)
  } catch (err) {
    console.error('[writing-guidance] save failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}

export async function addWritingRuleAction(articleId: string, text: string): Promise<AddRuleResult> {
  try {
    return await addRuleFromArticle(liveDeps(), articleId, text)
  } catch (err) {
    console.error('[writing-guidance] add rule failed', { error: errorName(err) })
    return { ok: false, code: 'save_failed' }
  }
}
