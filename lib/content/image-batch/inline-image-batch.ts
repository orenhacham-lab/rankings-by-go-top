/**
 * THE IMAGE BATCH LANE — the article's body images at half price.
 *
 * WHAT IT BUYS. A Gemini Batch API request costs 50% of the interactive price
 * for the same model, with a turnaround target of 24 hours. Measured on 13
 * November 2026, the whole Google Cloud bill is the Gemini API, and once the
 * article writer moved to Gemini 3.8 Flash the images became the larger half of
 * it — about 410 images a month, of which the inline body images are the
 * majority.
 *
 * WHY THIS IS SAFE HERE, AND WHY IT IS THE INLINE IMAGES. The body images are
 * already asynchronous by design: `article_inline_images` holds a row per image
 * with its own prompt and status, and ./../inline-images-compose.ts builds the
 * <figure> on demand when the article is shown or published — the stored HTML
 * never contains the image. "Ordered now, arrived later" is therefore a state
 * this product already lives in, not one this lane invents: a row that is not
 * ready yet simply has no figure, exactly as when a live call fails. The hero
 * image is deliberately NOT batched: it is what a merchant sees first on opening
 * a fresh draft, and a draft without one looks broken.
 *
 * WHAT NEVER CHANGES. Only the queue's own generation may order a batch image,
 * because only it has days of slack before the article publishes
 * (`inlineImagesMayBatch`, set by the runner alone). A merchant pressing
 * "generate" or "regenerate" gets a live call, as before. Nothing in a request
 * ever waits for a job. A job that fails, expires or comes back empty leaves the
 * row 'failed' with a reason and the editor's regenerate button — the same place
 * a failed live call leaves it.
 *
 * THE SAME PICTURE IS ASKED FOR. The request is built from
 * inlineImageModelInput + buildImagePrompt, the very functions the live call
 * uses, so a batched image is the image the live call would have produced the
 * request for. The bytes come back through storeInlineImageBytes, so they are
 * normalized, named and stored identically too.
 *
 * THE GATE. A batch request costs money as surely as a live call, so the same
 * entitlement gate runs before anything is ordered.
 */

import { GoogleGenAI } from '@google/genai'
import type { createAdminClient } from '@/lib/supabase/admin'
import { buildImagePrompt, imageModelCandidates } from '@/lib/content/gemini-image'
import {
  readInlineImageRow, inlineImageModelInput, inlineImageGateDenial,
  markInlineImageFailed, storeInlineImageBytes,
} from '@/lib/content/inline-images'

type Admin = ReturnType<typeof createAdminClient>

/** The slice of @google/genai this lane uses, and the seam the QA injects. */
export interface ImageBatchClient {
  batches: {
    create(params: Record<string, unknown>): Promise<{ name?: string }>
    get(params: { name: string }): Promise<Record<string, unknown>>
    cancel(params: { name: string }): Promise<unknown>
  }
}

/**
 * A job still open after this long is written off and its images marked failed,
 * so the editor shows something a merchant can act on. Google expires a job
 * that has been pending or running "for more than 48 hours", and an expired job
 * has no results, so there is nothing to wait for past that.
 */
export const IMAGE_BATCH_JOB_MAX_AGE_MS = 50 * 60 * 60 * 1000

/** Jobs polled per collect pass. Each is one HTTP call; the cron runs every 15 minutes. */
export const MAX_IMAGE_JOBS_PER_PASS = 20

const nowIso = () => new Date().toISOString()

function client(): ImageBatchClient | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try { return new GoogleGenAI({ apiKey }) as unknown as ImageBatchClient } catch { return null }
}

/** The model a batch image is ordered from: the first of the live call's own candidates. */
export function batchImageModel(): string {
  const first = imageModelCandidates()[0]
  return first?.model ?? 'gemini-3.1-flash-image'
}

// -- submit -----------------------------------------------------------------

export interface SubmitImagesResult {
  /** The image rows actually ordered. The caller generates every other one live. */
  orderedIds: string[]
  jobName: string | null
  skipped: number
  reason?: string
}

/**
 * Order the given inline images as ONE batch job. Called at generation time,
 * where the prompts are known, and only by the queue's own path.
 *
 * Every row it orders is marked 'generating' — true, and what the editor
 * already shows as "not ready yet". A row it could not order is left for the
 * caller to generate live.
 */
export async function submitInlineImageBatch(
  admin: Admin,
  imageIds: string[],
  deps: { client?: ImageBatchClient | null; now?: () => Date } = {},
): Promise<SubmitImagesResult> {
  if (imageIds.length === 0) return { orderedIds: [], jobName: null, skipped: 0, reason: 'nothing_to_order' }
  const ai = deps.client === undefined ? client() : deps.client
  if (!ai) return { orderedIds: [], jobName: null, skipped: imageIds.length, reason: 'missing_gemini_api_key' }
  const nowFn = deps.now ?? (() => new Date())
  const model = batchImageModel()

  const prepared: { row: Awaited<ReturnType<typeof readInlineImageRow>> & object; prompt: string }[] = []
  let skipped = 0
  for (const imageId of imageIds) {
    const row = await readInlineImageRow(admin, imageId)
    if (!row) { skipped++; continue }
    // The same gate, at the same point, as the live call.
    const denial = await inlineImageGateDenial(admin, row.project_id, nowFn)
    if (denial) { await markInlineImageFailed(admin, imageId, denial.code); skipped++; continue }
    const input = await inlineImageModelInput(admin, row)
    prepared.push({ row, prompt: buildImagePrompt(input) })
  }
  if (prepared.length === 0) return { orderedIds: [], jobName: null, skipped, reason: 'no_rows' }

  let jobName: string | null = null
  try {
    const job = await ai.batches.create({
      model,
      src: {
        inlinedRequests: prepared.map((p, i) => ({
          contents: [{ role: 'user', parts: [{ text: p.prompt }] }],
          // TEXT is listed with IMAGE because the image models answer with both;
          // asking for IMAGE alone is refused. The aspect ratio and size are the
          // live call's own (16:9, 2K) — the body never uses a square image.
          config: {
            responseModalities: ['TEXT', 'IMAGE'],
            imageConfig: { aspectRatio: '16:9', imageSize: '2K' },
          },
          metadata: { key: String(i) },
        })),
      },
      config: { displayName: `inline-images-${Date.now().toString(36)}` },
    })
    jobName = job.name ?? null
  } catch (e) {
    console.error('[image-batch] submit failed', { message: e instanceof Error ? e.message : String(e), model, requests: prepared.length })
    return { orderedIds: [], jobName: null, skipped: skipped + prepared.length, reason: 'batch_create_failed' }
  }
  if (!jobName) return { orderedIds: [], jobName: null, skipped: skipped + prepared.length, reason: 'batch_no_job_name' }

  const rows = prepared.map((p, i) => ({
    job_name: jobName as string,
    request_key: String(i),
    model,
    inline_image_id: p.row.id,
    project_id: p.row.project_id,
    article_id: p.row.article_id,
    status: 'submitted',
    submitted_at: nowIso(),
    updated_at: nowIso(),
  }))
  const { error } = await admin.from('inline_image_batch_requests').insert(rows)
  if (error) {
    // The job is running and will be billed; without these rows nothing can
    // ever claim its images. Cancel it rather than pay for pictures no article
    // can use, and leave the rows for a live call.
    console.error('[image-batch] bookkeeping insert failed, cancelling job', { jobName, message: error.message })
    try { await ai.batches.cancel({ name: jobName }) } catch { /* best effort */ }
    return { orderedIds: [], jobName, skipped: skipped + prepared.length, reason: 'insert_failed' }
  }

  await admin.from('article_inline_images')
    .update({ status: 'generating', last_error: null, updated_at: nowIso() })
    .in('id', prepared.map((p) => p.row.id))
  console.log('[image-batch] submitted', { jobName, model, requests: rows.length, skipped })
  return { orderedIds: prepared.map((p) => p.row.id), jobName, skipped }
}

// -- collect ----------------------------------------------------------------

export interface CollectImagesResult {
  jobsChecked: number
  stored: number
  failed: number
  stillRunning: number
}

const TERMINAL_FAILED = new Set(['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'])

interface InlinedImageEntry {
  metadata?: { key?: string }
  response?: { candidates?: { content?: { parts?: { text?: string; inlineData?: { data?: string; mimeType?: string } }[] } }[] }
  error?: { message?: unknown; code?: unknown }
}

/** The first image part of a reply, if it carried one. */
function imagePart(entry: InlinedImageEntry): { data: string; mimeType: string } | null {
  const parts = entry.response?.candidates?.[0]?.content?.parts ?? []
  for (const p of parts) {
    if (p?.inlineData?.data) return { data: p.inlineData.data, mimeType: p.inlineData.mimeType || 'image/jpeg' }
  }
  return null
}

/**
 * Write off every request of a job, and mark its images failed so the editor
 * shows a merchant something they can act on instead of a row that never moves.
 */
async function writeOffJob(admin: Admin, jobName: string, reason: string, rows: { id: string; inline_image_id: string }[]): Promise<void> {
  await admin.from('inline_image_batch_requests')
    .update({ status: reason === 'JOB_STATE_EXPIRED' ? 'expired' : 'failed', last_error: reason.slice(0, 300), collected_at: nowIso(), updated_at: nowIso() })
    .eq('job_name', jobName).eq('status', 'submitted')
  for (const r of rows) await markInlineImageFailed(admin, r.inline_image_id, `image_batch_${reason.toLowerCase()}`)
}

/** Poll the image jobs in flight, store what finished. Never throws. */
export async function collectInlineImageBatches(
  admin: Admin,
  deps: {
    client?: ImageBatchClient | null
    now?: () => Date
    /** The storer, injectable so the QA can watch the bytes without a bucket. */
    store?: typeof storeInlineImageBytes
  } = {},
): Promise<CollectImagesResult> {
  const result: CollectImagesResult = { jobsChecked: 0, stored: 0, failed: 0, stillRunning: 0 }
  const ai = deps.client === undefined ? client() : deps.client
  if (!ai) return result
  const now = deps.now ?? (() => new Date())

  const { data } = await admin
    .from('inline_image_batch_requests')
    .select('id, job_name, request_key, inline_image_id, submitted_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true })
    .limit(200)
  const rows = (Array.isArray(data) ? data : []) as { id: string; job_name: string; request_key: string; inline_image_id: string; submitted_at: string }[]
  if (rows.length === 0) return result

  const byJob = new Map<string, typeof rows>()
  for (const r of rows) byJob.set(r.job_name, [...(byJob.get(r.job_name) ?? []), r])

  let jobsLeft = MAX_IMAGE_JOBS_PER_PASS
  for (const [jobName, jobRows] of byJob) {
    if (jobsLeft-- <= 0) { result.stillRunning += jobRows.length; continue }
    result.jobsChecked++
    const oldestMs = Math.min(...jobRows.map((r) => Date.parse(r.submitted_at)).filter(Number.isFinite))
    const tooOld = Number.isFinite(oldestMs) && now().getTime() - oldestMs > IMAGE_BATCH_JOB_MAX_AGE_MS

    let job: Record<string, unknown> | null = null
    try {
      job = await ai.batches.get({ name: jobName })
    } catch (e) {
      console.warn('[image-batch] job read failed', { jobName, message: e instanceof Error ? e.message : String(e) })
      if (tooOld) { await writeOffJob(admin, jobName, 'job_unreadable', jobRows); result.failed += jobRows.length }
      else result.stillRunning += jobRows.length
      continue
    }

    const state = String(job?.state ?? '')
    if (TERMINAL_FAILED.has(state)) {
      await writeOffJob(admin, jobName, state, jobRows)
      result.failed += jobRows.length
      continue
    }
    if (state !== 'JOB_STATE_SUCCEEDED') {
      if (tooOld) { await writeOffJob(admin, jobName, `stuck_in_${state || 'unknown'}`, jobRows); result.failed += jobRows.length }
      else result.stillRunning += jobRows.length
      continue
    }

    const dest = (job?.dest ?? null) as { inlinedResponses?: InlinedImageEntry[] } | null
    const inlined = dest?.inlinedResponses ?? []
    if (inlined.length === 0) {
      await writeOffJob(admin, jobName, 'succeeded_without_inlined_responses', jobRows)
      result.failed += jobRows.length
      continue
    }

    for (const r of jobRows) {
      // Claim the request first: a second, overlapping pass must not store the
      // same picture twice (which would upload two files and leave one orphan).
      const { data: claimed } = await admin.from('inline_image_batch_requests')
        .update({ status: 'collected', collected_at: nowIso(), updated_at: nowIso() })
        .eq('id', r.id).eq('status', 'submitted').select('id')
      if (!Array.isArray(claimed) || claimed.length === 0) continue

      const index = Number(r.request_key)
      const entry = inlined.find((e) => e?.metadata?.key === r.request_key)
        ?? (Number.isFinite(index) ? inlined[index] : undefined)
      const fail = async (reason: string) => {
        await admin.from('inline_image_batch_requests').update({ status: 'failed', last_error: reason.slice(0, 300), updated_at: nowIso() }).eq('id', r.id)
        await markInlineImageFailed(admin, r.inline_image_id, reason)
        result.failed++
      }
      if (!entry) { await fail('image_batch_response_missing'); continue }
      if (entry.error) { await fail(`image_batch_${String(entry.error.message ?? entry.error.code ?? 'request_error')}`); continue }
      const img = imagePart(entry)
      if (!img) { await fail('image_batch_no_image_returned'); continue }

      const row = await readInlineImageRow(admin, r.inline_image_id)
      if (!row) {
        // The article (or the image) was deleted while the job ran. Nothing to
        // finish and nothing wrong: drop the reply.
        await admin.from('inline_image_batch_requests').update({ last_error: 'image_row_gone', updated_at: nowIso() }).eq('id', r.id)
        continue
      }
      const stored = await (deps.store ?? storeInlineImageBytes)(admin, row, { data: Buffer.from(img.data, 'base64'), mimeType: img.mimeType })
      if (stored.ok) result.stored++
      else { await admin.from('inline_image_batch_requests').update({ last_error: stored.error.slice(0, 300), updated_at: nowIso() }).eq('id', r.id); result.failed++ }
    }
    console.log('[image-batch] collected', { jobName, state, stored: result.stored, failed: result.failed })
  }
  return result
}

/** The pass the cron runs: collect only. Ordering happens at generation time. */
export async function runInlineImageBatchPass(
  admin: Admin,
  opts: { client?: ImageBatchClient | null; now?: () => Date; store?: typeof storeInlineImageBytes } = {},
): Promise<CollectImagesResult> {
  const out = await collectInlineImageBatches(admin, opts)
  if (out.jobsChecked > 0) {
    console.log('[image-batch] pass complete', { jobsChecked: out.jobsChecked, stored: out.stored, failed: out.failed, stillRunning: out.stillRunning })
  }
  return out
}
