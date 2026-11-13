/**
 * The generator's side of the batch lane: hand over a draft that was ordered
 * earlier, if one matches the prompt about to be sent.
 *
 * SEPARATE FILE ON PURPOSE. ./article-batch.ts builds briefs through
 * lib/content/article-generation.ts, and that module needs this reader — a
 * cycle if both lived in one file. This half imports nothing but two types.
 *
 * It never throws. A miss, a stale draft, a lost race or a failed read all
 * return null, and the generation makes the live call it always would have.
 */

import type { createAdminClient } from '@/lib/supabase/admin'
import type { GeminiUsage } from '@/lib/content/gemini-article'

type Admin = ReturnType<typeof createAdminClient>

const nowIso = () => new Date().toISOString()

/**
 * A ready draft older than this is discarded unused. The fingerprint already
 * guarantees the brief has not changed; this guards the thing a fingerprint
 * cannot see — a draft whose facts have simply gone stale on the shelf.
 */
export const READY_DRAFT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Returns a batched first draft for this exact prompt and consumes the row, or
 * null.
 */
export async function takeBatchedDraft(
  admin: Admin,
  fingerprint: string,
  now: () => Date = () => new Date(),
): Promise<{ text: string; usage: GeminiUsage | null } | null> {
  try {
    const { data } = await admin
      .from('article_batch_drafts')
      .select('id, model, response_text, input_tokens, output_tokens, ready_at')
      .eq('prompt_fingerprint', fingerprint)
      .eq('status', 'ready')
      .order('ready_at', { ascending: false })
      .limit(1)
    const row = (Array.isArray(data) ? data[0] : null) as {
      id: string; model: string; response_text: string | null
      input_tokens: number | null; output_tokens: number | null; ready_at: string | null
    } | undefined
    if (!row || !row.response_text) return null

    const readyMs = row.ready_at ? Date.parse(row.ready_at) : NaN
    const stale = Number.isFinite(readyMs) && now().getTime() - readyMs > READY_DRAFT_MAX_AGE_MS

    // Claim BEFORE returning, and only if this call is the one that flipped the
    // row. Two concurrent generations of the same topic must not both be served
    // the same draft: the second gets null and makes its live call.
    const { data: claimed } = await admin
      .from('article_batch_drafts')
      .update({
        status: stale ? 'expired' : 'consumed',
        response_text: null,
        consumed_at: nowIso(),
        last_error: stale ? 'ready_draft_too_old' : null,
        updated_at: nowIso(),
      })
      .eq('id', row.id)
      .eq('status', 'ready')
      .select('id')
    if (!Array.isArray(claimed) || claimed.length === 0) return null
    if (stale) return null

    const usage: GeminiUsage | null = row.input_tokens === null && row.output_tokens === null
      ? null
      : { model: row.model, inputTokens: row.input_tokens ?? 0, outputTokens: row.output_tokens ?? 0 }
    return { text: row.response_text, usage }
  } catch (e) {
    console.warn('[article-batch] take failed', { message: e instanceof Error ? e.message : String(e) })
    return null
  }
}
