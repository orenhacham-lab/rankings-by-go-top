/**
 * THE BATCH LANE — article first drafts at half price.
 *
 * WHAT IT BUYS. Google prices a Batch API request at 50% of the interactive
 * price for the same model, in exchange for a turnaround target of 24 hours
 * ("Batch jobs are designed to complete within a 24-hour turnaround time",
 * aistudio.google.com/docs/batch-api, read 13 Nov 2026). Measured the same day,
 * every shekel of the Google Cloud bill is the Gemini API, and about half of it
 * is this writer's output tokens. The article queue publishes on a cadence of
 * days and keeps a generated article ready AHEAD of the next slot, so for the
 * generate-ahead work those hours are slack the queue already has.
 *
 * WHAT IT NEVER TOUCHES. A merchant pressing "generate" waits on the answer, so
 * that path stays a live call — it never reads this table and never waits for a
 * job. Only the cron's generate-ahead is served from here, and only when a
 * draft is already sitting ready. There is no blocking, no polling inside a
 * request, and no new failure mode in the generation path: a miss, a stale
 * fingerprint, an expired job or any error in here means the next generation is
 * the live call it always was.
 *
 * THE THREE PASSES.
 *   submit  — order drafts for the topics the queue will reach next, as ONE job
 *             with inlined requests. Bounded per run.
 *   collect — poll the jobs in flight; store the text of the ones that finished.
 *   take    — the generator asks for a draft by its prompt fingerprint, and the
 *             row is consumed (once) if one matches.
 *
 * WHY THE PROMPT IS THE KEY. A draft ordered yesterday was written to
 * yesterday's brief. Topics get edited, depth re-classifies, an internal link
 * gets approved, the writing guidance changes. Matching on the topic would
 * publish an article written to a brief that no longer holds; matching on
 * sha256(model + prompt) — the fingerprint the generator computes for the call
 * it was about to make — can only ever serve a draft identical to the one the
 * live call would have produced the request for. A mismatch simply falls
 * through to the live call.
 *
 * COST OF A MISTAKE. Losing a draft costs one batch request, which is half the
 * price of the call that replaces it. That asymmetry is why every uncertain
 * case in here discards.
 */

import { GoogleGenAI } from '@google/genai'
import type { createAdminClient } from '@/lib/supabase/admin'
import { articlePromptFingerprint, buildPrompt, articleModel } from '@/lib/content/gemini-article'
import { buildBriefForTopic } from '@/lib/content/article-generation'
import { isArticleBatchEnabled } from './flag'

type Admin = ReturnType<typeof createAdminClient>

/** The switch lives in ./flag.ts (that file says why), re-exported here. */
export { isArticleBatchEnabled } from './flag'

const nowIso = () => new Date().toISOString()

/** The generation config the live call uses, repeated here so a batch request is the same request. */
const BATCH_GENERATION_CONFIG = { responseMimeType: 'application/json', temperature: 0.75 } as const

/**
 * The slice of @google/genai this lane uses. Narrow on purpose: it is also the
 * seam the QA injects, so every decision below runs for real against a job
 * whose state the test chooses.
 */
export interface BatchClient {
  batches: {
    create(params: Record<string, unknown>): Promise<{ name?: string }>
    get(params: { name: string }): Promise<Record<string, unknown>>
    cancel(params: { name: string }): Promise<unknown>
  }
}

function client(): BatchClient | null {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) return null
  try { return new GoogleGenAI({ apiKey }) as unknown as BatchClient } catch { return null }
}

/** The generator's reader lives in ./take-draft.ts (that file says why), re-exported here. */
export { takeBatchedDraft, READY_DRAFT_MAX_AGE_MS } from './take-draft'

/** Requests ordered per submit pass. One job, inlined — far under Google's 20MB inline limit. */
export const MAX_BATCH_REQUESTS_PER_RUN = Math.max(1, Number(process.env.ARTICLE_BATCH_MAX_PER_RUN) || 4)

/**
 * A job still open after this long is written off. Google expires a job that
 * has been pending or running "for more than 48 hours", and an expired job has
 * no results, so there is nothing to wait for past that.
 */
export const BATCH_JOB_MAX_AGE_MS = 50 * 60 * 60 * 1000

// -- submit -----------------------------------------------------------------

export interface BatchCandidate { topicId: string; projectId: string }

export interface SubmitResult { ordered: number; jobName: string | null; skipped: number; reason?: string }

/**
 * The topics worth ordering a draft for, and the reason the lane pays off at all.
 *
 * The runner keeps ONE article generated ahead of each pool's next slot
 * (DESIRED_READY_AHEAD in lib/content/automation/runner.ts). So in a healthy
 * pool — article A generated and waiting, B and C queued — B is not generated
 * on the next run, or the next hundred: it waits until A publishes, which on a
 * cadence of days is days away. B is therefore exactly the draft to order in
 * advance, and the 24-hour turnaround lands well inside that wait. When A
 * publishes and the runner generates B, the draft is already on the shelf.
 *
 * A pool with NOTHING generated is deliberately left out: that pool is the one
 * at risk of publishing late, and the live call in the same run is what keeps
 * it on time. Ordering a draft for it would spend money on a request the live
 * call beats to the article.
 */
export async function selectBatchCandidates(admin: Admin, limit: number): Promise<BatchCandidate[]> {
  const { data: pools } = await admin
    .from('article_pools')
    .select('id, project_id, is_active')
    .eq('is_active', true)
    .limit(200)
  const poolRows = (Array.isArray(pools) ? pools : []) as { id: string; project_id: string }[]
  if (poolRows.length === 0) return []

  const out: BatchCandidate[] = []
  for (const pool of poolRows) {
    if (out.length >= limit) break
    const { data: items } = await admin
      .from('article_pool_items')
      .select('id, topic_id, status, position')
      .eq('pool_id', pool.id)
      .in('status', ['queued', 'generated'])
      .order('position', { ascending: true })
      .limit(50)
    const rows = (Array.isArray(items) ? items : []) as { id: string; topic_id: string | null; status: string }[]
    // Only a pool with a buffer: something already generated and waiting.
    if (!rows.some((r) => r.status === 'generated')) continue
    const next = rows.find((r) => r.status === 'queued' && r.topic_id)
    if (!next?.topic_id) continue

    // Never order a second draft for a topic that already has one in flight or ready.
    const { data: open } = await admin
      .from('article_batch_drafts')
      .select('id')
      .eq('topic_id', next.topic_id)
      .in('status', ['submitted', 'ready'])
      .limit(1)
    if (Array.isArray(open) && open.length > 0) continue

    out.push({ topicId: next.topic_id, projectId: pool.project_id })
  }
  return out
}

/**
 * Order drafts for the given topics as one batch job. The brief comes from the
 * generator's own builder, so the prompt — and therefore the fingerprint — is
 * the one the generation will compute for itself.
 */
export async function submitArticleBatch(
  admin: Admin,
  candidates: BatchCandidate[],
  deps: { client?: BatchClient | null } = {},
): Promise<SubmitResult> {
  if (candidates.length === 0) return { ordered: 0, jobName: null, skipped: 0, reason: 'no_candidates' }
  const ai = deps.client === undefined ? client() : deps.client
  if (!ai) return { ordered: 0, jobName: null, skipped: candidates.length, reason: 'missing_gemini_api_key' }

  const { model } = articleModel()
  const prepared: { topicId: string; projectId: string; prompt: string; fingerprint: string }[] = []
  let skipped = 0
  for (const c of candidates) {
    const built = await buildBriefForTopic(admin, c.topicId).catch(() => null)
    if (!built || !built.ok) { skipped++; continue }
    // The FIRST-attempt prompt: no repair failures, exactly as attempt 0 builds it.
    const prompt = buildPrompt(built.brief, {})
    prepared.push({ topicId: c.topicId, projectId: c.projectId, prompt, fingerprint: articlePromptFingerprint(prompt, model) })
  }
  if (prepared.length === 0) return { ordered: 0, jobName: null, skipped, reason: 'no_briefs' }

  let jobName: string | null = null
  try {
    const job = await ai.batches.create({
      model,
      src: {
        inlinedRequests: prepared.map((p, i) => ({
          contents: [{ role: 'user', parts: [{ text: p.prompt }] }],
          config: { ...BATCH_GENERATION_CONFIG },
          metadata: { key: String(i) },
        })),
      },
      config: { displayName: `articles-${Date.now().toString(36)}` },
    })
    jobName = job.name ?? null
  } catch (e) {
    console.error('[article-batch] submit failed', { message: e instanceof Error ? e.message : String(e), model, requests: prepared.length })
    return { ordered: 0, jobName: null, skipped: skipped + prepared.length, reason: 'batch_create_failed' }
  }
  if (!jobName) return { ordered: 0, jobName: null, skipped: skipped + prepared.length, reason: 'batch_no_job_name' }

  // One row per request. The key is the request's INDEX in the job: Google
  // returns inlined responses "in the same order as the input requests", and
  // carries the metadata back, so index and key agree either way.
  const rows = prepared.map((p, i) => ({
    job_name: jobName as string,
    request_key: String(i),
    model,
    prompt_fingerprint: p.fingerprint,
    project_id: p.projectId,
    topic_id: p.topicId,
    status: 'submitted',
    submitted_at: nowIso(),
    updated_at: nowIso(),
  }))
  const { error } = await admin.from('article_batch_drafts').insert(rows)
  if (error) {
    // The job is running and will be billed; without rows we can never use it.
    // Cancel it rather than pay for drafts nothing can claim.
    console.error('[article-batch] bookkeeping insert failed, cancelling job', { jobName, message: error.message })
    try { await ai.batches.cancel({ name: jobName }) } catch { /* best effort */ }
    return { ordered: 0, jobName, skipped: skipped + prepared.length, reason: 'insert_failed' }
  }
  console.log('[article-batch] submitted', { jobName, model, requests: rows.length, skipped })
  return { ordered: rows.length, jobName, skipped }
}

// -- collect ----------------------------------------------------------------

export interface CollectResult { jobsChecked: number; ready: number; failed: number; stillRunning: number }

/** One inlined response of a finished job. */
interface InlinedEntry {
  metadata?: { key?: string }
  response?: { text?: unknown; candidates?: { content?: { parts?: { text?: string }[] } }[]; usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }
  error?: { message?: unknown; code?: unknown }
}

const TERMINAL_FAILED = new Set(['JOB_STATE_FAILED', 'JOB_STATE_CANCELLED', 'JOB_STATE_EXPIRED'])

/** Text of a response, from whichever shape the SDK hands back. */
function responseText(response: unknown): string {
  if (!response || typeof response !== 'object') return ''
  const r = response as { text?: unknown; candidates?: { content?: { parts?: { text?: string }[] } }[] }
  if (typeof r.text === 'string') return r.text
  const parts = r.candidates?.[0]?.content?.parts
  return Array.isArray(parts) ? parts.map((p) => p?.text ?? '').join('') : ''
}

/** Poll the jobs in flight and store what finished. Never throws. */
export async function collectArticleBatches(
  admin: Admin,
  now: () => Date = () => new Date(),
  deps: { client?: BatchClient | null } = {},
): Promise<CollectResult> {
  const result: CollectResult = { jobsChecked: 0, ready: 0, failed: 0, stillRunning: 0 }
  const ai = deps.client === undefined ? client() : deps.client
  if (!ai) return result

  const { data } = await admin
    .from('article_batch_drafts')
    .select('id, job_name, request_key, submitted_at')
    .eq('status', 'submitted')
    .order('submitted_at', { ascending: true })
    .limit(200)
  const rows = (Array.isArray(data) ? data : []) as { id: string; job_name: string; request_key: string; submitted_at: string }[]
  if (rows.length === 0) return result

  const byJob = new Map<string, typeof rows>()
  for (const r of rows) byJob.set(r.job_name, [...(byJob.get(r.job_name) ?? []), r])

  for (const [jobName, jobRows] of byJob) {
    result.jobsChecked++
    const oldestMs = Math.min(...jobRows.map((r) => Date.parse(r.submitted_at)).filter(Number.isFinite))
    let job: Record<string, unknown> | null = null
    try {
      job = await ai.batches.get({ name: jobName })
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e)
      // A job we cannot read and that is past Google's own 48-hour expiry is gone.
      if (Number.isFinite(oldestMs) && now().getTime() - oldestMs > BATCH_JOB_MAX_AGE_MS) {
        await admin.from('article_batch_drafts').update({ status: 'expired', last_error: 'job_unreadable', updated_at: nowIso() }).eq('job_name', jobName).eq('status', 'submitted')
        result.failed += jobRows.length
      } else {
        result.stillRunning += jobRows.length
      }
      console.warn('[article-batch] job read failed', { jobName, message })
      continue
    }

    const state = String(job?.state ?? '')
    if (TERMINAL_FAILED.has(state)) {
      await admin.from('article_batch_drafts').update({ status: state === 'JOB_STATE_EXPIRED' ? 'expired' : 'failed', last_error: state, updated_at: nowIso() }).eq('job_name', jobName).eq('status', 'submitted')
      result.failed += jobRows.length
      console.warn('[article-batch] job ended without results', { jobName, state })
      continue
    }
    if (state !== 'JOB_STATE_SUCCEEDED') {
      if (Number.isFinite(oldestMs) && now().getTime() - oldestMs > BATCH_JOB_MAX_AGE_MS) {
        await admin.from('article_batch_drafts').update({ status: 'expired', last_error: `stuck_in_${state || 'unknown'}`, updated_at: nowIso() }).eq('job_name', jobName).eq('status', 'submitted')
        result.failed += jobRows.length
      } else {
        result.stillRunning += jobRows.length
      }
      continue
    }

    const dest = (job?.dest ?? null) as { inlinedResponses?: InlinedEntry[] } | null
    const inlined = dest?.inlinedResponses ?? []
    if (inlined.length === 0) {
      // Succeeded with no inlined responses means the output went somewhere we
      // did not ask for. Nothing to claim; do not keep polling it.
      await admin.from('article_batch_drafts').update({ status: 'failed', last_error: 'succeeded_without_inlined_responses', updated_at: nowIso() }).eq('job_name', jobName).eq('status', 'submitted')
      result.failed += jobRows.length
      continue
    }

    for (const row of jobRows) {
      const index = Number(row.request_key)
      const byKey = inlined.find((r) => r?.metadata?.key === row.request_key)
      const entry = byKey ?? (Number.isFinite(index) ? inlined[index] : undefined)
      if (!entry) {
        await admin.from('article_batch_drafts').update({ status: 'failed', last_error: 'response_missing', updated_at: nowIso() }).eq('id', row.id).eq('status', 'submitted')
        result.failed++
        continue
      }
      if (entry.error || !entry.response) {
        const message = entry.error ? String(entry.error.message ?? entry.error.code ?? 'request_error') : 'empty_response'
        await admin.from('article_batch_drafts').update({ status: 'failed', last_error: message.slice(0, 300), updated_at: nowIso() }).eq('id', row.id).eq('status', 'submitted')
        result.failed++
        continue
      }
      const text = responseText(entry.response)
      if (!text.trim()) {
        await admin.from('article_batch_drafts').update({ status: 'failed', last_error: 'empty_text', updated_at: nowIso() }).eq('id', row.id).eq('status', 'submitted')
        result.failed++
        continue
      }
      const um = (entry.response as { usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number } }).usageMetadata
      const { error } = await admin.from('article_batch_drafts').update({
        status: 'ready',
        response_text: text,
        input_tokens: um?.promptTokenCount ?? null,
        output_tokens: um?.candidatesTokenCount ?? null,
        ready_at: nowIso(),
        last_error: null,
        updated_at: nowIso(),
      }).eq('id', row.id).eq('status', 'submitted')
      if (error) { result.failed++; continue }
      result.ready++
    }
    console.log('[article-batch] collected', { jobName, state, ready: result.ready, failed: result.failed })
  }
  return result
}

// -- the pass the cron runs -------------------------------------------------

export interface BatchPassResult { enabled: boolean; collected?: CollectResult; submitted?: SubmitResult }

/**
 * Collect first, then submit. In that order on purpose: a draft that finished
 * becomes usable by THIS run's generation, and the submit pass can see that the
 * topic it was about to order is already served.
 */
export async function runArticleBatchPass(
  admin: Admin,
  opts: { env?: NodeJS.ProcessEnv; now?: () => Date; client?: BatchClient | null } = {},
): Promise<BatchPassResult> {
  const env = opts.env ?? process.env
  if (!isArticleBatchEnabled(env)) return { enabled: false }
  const now = opts.now ?? (() => new Date())
  const deps = 'client' in opts ? { client: opts.client } : {}
  const collected = await collectArticleBatches(admin, now, deps)
  const candidates = await selectBatchCandidates(admin, MAX_BATCH_REQUESTS_PER_RUN)
  const submitted = await submitArticleBatch(admin, candidates, deps)
  console.log('[article-batch] pass complete', {
    jobsChecked: collected.jobsChecked, ready: collected.ready, failed: collected.failed,
    stillRunning: collected.stillRunning, ordered: submitted.ordered, skipped: submitted.skipped,
  })
  return { enabled: true, collected, submitted }
}
