/**
 * THE HERO IMAGE AT HALF PRICE — ordered on the body images' own job, and never
 * allowed to delay a publish.
 *
 * WHY THE HERO, WHEN THE LANE DELIBERATELY LEFT IT OUT. The lane shipped on 14
 * November 2026 with the hero excluded on the grounds that "a draft without one
 * looks broken". Two measurements since say the trade was priced wrong:
 *
 *   * The bill, 14-16 November 2026: image output ₪45.36 interactive against
 *     ₪3.15 batched, at exactly half the unit price. Because a healthy pool's
 *     body images already batch, the hero is now the single largest block still
 *     paying full price — about half of every interactive image.
 *   * The turnaround, 14-15 November 2026: every batched image came back in
 *     193-901 seconds. The "broken draft" window is minutes, in a draft that
 *     will not be published for at least twelve hours.
 *
 * WHAT MAKES IT SAFE. Three rules, and the third is the one that matters.
 *
 *   1. ONLY THE QUEUE ORDERS. A merchant pressing "generate" or "regenerate"
 *      gets a live call, exactly as before. Only the runner's own generate-ahead
 *      may order, and only through the body images' rule
 *      (./may-batch.ts): not due, next publish known and at least 12 hours away.
 *   2. ONE JOB. The hero rides the same batch job as the article's body images,
 *      so it costs no extra request and is collected by the same pass.
 *   3. PUBLISHING NEVER WAITS. ensureHeroBeforePublish runs before an article
 *      goes out on any platform: an article whose hero was ordered and has not
 *      arrived gets a live call there and then. The worst case is therefore the
 *      price paid today; the ordinary case is half of it. Nothing can publish
 *      without a hero that would have had one.
 *
 * WHAT A FAILURE LOOKS LIKE. A job that fails, expires or comes back without an
 * image leaves the request row 'failed' and the article simply without a hero —
 * the same state a failed live call leaves it in, with the editor's regenerate
 * button. Nothing is retried in the background and nothing is ever stored twice:
 * the collect pass claims each request before storing it.
 */

import { GoogleGenAI } from '@google/genai'
import type { createAdminClient } from '@/lib/supabase/admin'
import { buildImagePrompt } from '@/lib/content/gemini-image'
import { prepareHeroImage, createFeaturedImageForArticle } from '@/lib/content/featured-image'
import { batchImageModel, type ImageBatchClient } from '@/lib/content/image-batch/inline-image-batch'

type Admin = ReturnType<typeof createAdminClient>

const nowIso = () => new Date().toISOString()

function client(): ImageBatchClient | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try { return new GoogleGenAI({ apiKey }) as unknown as ImageBatchClient } catch { return null }
}

export interface SubmitHeroResult {
  ordered: boolean
  jobName: string | null
  reason?: string
}

/**
 * Order ONE article's hero from the Batch API. Called at generation time, where
 * the concept and style are known, and only by the queue's own path.
 *
 * Returns ordered:false for every reason there is — no key, the gate said no,
 * Google refused the job, the bookkeeping failed — and the caller then makes
 * the live call, so an article is never left without a hero because a batch
 * order did not work.
 */
export async function submitHeroImageBatch(
  admin: Admin,
  articleId: string,
  deps: { client?: ImageBatchClient | null; now?: () => Date } = {},
): Promise<SubmitHeroResult> {
  const ai = deps.client === undefined ? client() : deps.client
  if (!ai) return { ordered: false, jobName: null, reason: 'missing_gemini_api_key' }
  const nowFn = deps.now ?? (() => new Date())

  // The same preparation, and so the same entitlement gate, as the live call.
  const prepared = await prepareHeroImage(admin, articleId, nowFn)
  if ('error' in prepared) return { ordered: false, jobName: null, reason: prepared.error }

  const model = batchImageModel()
  const prompt = buildImagePrompt(prepared.request)

  let jobName: string | null = null
  try {
    const job = await ai.batches.create({
      model,
      src: {
        inlinedRequests: [{
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          // TEXT is listed with IMAGE because the image models answer with both;
          // asking for IMAGE alone is refused. The shape and size are the live
          // call's own — a square hero is a project setting, so it is read here
          // rather than assumed.
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: prepared.heroRatio === '1:1' ? '1:1' : '16:9', imageSize: '2K' },
          },
          metadata: { key: 'hero' },
        }],
      },
      config: { displayName: `hero-image-${Date.now().toString(36)}` },
    })
    jobName = job.name ?? null
  } catch (e) {
    console.error('[hero-batch] submit failed', { message: e instanceof Error ? e.message : String(e), model, articleId })
    return { ordered: false, jobName: null, reason: 'batch_create_failed' }
  }
  if (!jobName) return { ordered: false, jobName: null, reason: 'batch_no_job_name' }

  const { error } = await admin.from('inline_image_batch_requests').insert([{
    job_name: jobName,
    request_key: 'hero',
    target: 'hero',
    model,
    inline_image_id: null,
    project_id: prepared.projectId,
    article_id: articleId,
    concept: prepared.concept,
    aspect_ratio: prepared.heroRatio,
    status: 'submitted',
    submitted_at: nowIso(),
    updated_at: nowIso(),
  }])
  if (error) {
    // The job is running and will be billed; without this row nothing can ever
    // claim its image. Cancel it rather than pay for a picture no article can
    // use, and let the caller make the live call.
    console.error('[hero-batch] bookkeeping insert failed, cancelling job', { jobName, message: error.message })
    try { await ai.batches.cancel({ name: jobName }) } catch { /* best effort */ }
    return { ordered: false, jobName, reason: 'insert_failed' }
  }

  console.log('[hero-batch] submitted', { jobName, model, articleId })
  return { ordered: true, jobName }
}

/**
 * THE RULE THAT MAKES THE LANE SAFE: publishing never waits for a batch.
 *
 * Called before an article goes out, on every platform. An article that has a
 * hero, or never ordered one, is left exactly as it is — this is one indexed
 * read on the ordinary path. An article whose ordered hero has not arrived gets
 * it with a live call now, and its open request is closed so the reply, if it
 * ever lands, is dropped instead of overwriting the picture that published.
 *
 * Never throws: a hero is a nice-to-have at publish time, and an error here
 * must not stop an article from being published.
 */
export async function ensureHeroBeforePublish(
  admin: Admin,
  articleId: string,
  deps: { createHero?: typeof createFeaturedImageForArticle } = {},
): Promise<{ status: 'present' | 'not_ordered' | 'filled_live' | 'failed' }> {
  try {
    const { data } = await admin
      .from('generated_articles')
      .select('id, featured_image_url')
      .eq('id', articleId)
      .maybeSingle()
    const article = data as { featured_image_url: string | null } | null
    if (!article) return { status: 'not_ordered' }
    if (article.featured_image_url) return { status: 'present' }

    const { data: openRows } = await admin
      .from('inline_image_batch_requests')
      .select('id')
      .eq('article_id', articleId)
      .eq('target', 'hero')
      .eq('status', 'submitted')
      .limit(1)
    const open = (Array.isArray(openRows) ? openRows : []) as { id: string }[]
    // No hero and none ordered is the state this product already lives in: the
    // live call failed, or the project asked for no images. Not this lane's
    // business, and never a reason to spend on an image nobody asked for.
    if (open.length === 0) return { status: 'not_ordered' }

    // Close the request FIRST. If the live call and a collect pass were to race,
    // the loser would upload a second file and leave the first orphaned in the
    // bucket; claiming the row decides the winner before any bytes are written.
    const { data: claimed } = await admin
      .from('inline_image_batch_requests')
      .update({ status: 'failed', last_error: 'superseded_by_live_call_at_publish', updated_at: nowIso() })
      .eq('id', open[0].id).eq('status', 'submitted').select('id')
    if (!Array.isArray(claimed) || claimed.length === 0) {
      // A collect pass claimed it between the two statements, so the picture is
      // either stored already or failed on its own terms. Either way, not ours.
      return { status: 'present' }
    }

    const made = await (deps.createHero ?? createFeaturedImageForArticle)(admin, articleId)
    if ('error' in made) {
      console.warn('[hero-batch] publish-time live hero failed', { articleId, reason: made.error })
      return { status: 'failed' }
    }
    console.log('[hero-batch] hero filled live before publish', { articleId })
    return { status: 'filled_live' }
  } catch (e) {
    console.warn('[hero-batch] publish-time check threw', { articleId, message: e instanceof Error ? e.message : String(e) })
    return { status: 'failed' }
  }
}
