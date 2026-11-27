/**
 * POST /api/video-studio/generate, with its collaborators injected so the QA suite
 * runs it against fakes (no network, no money).
 *
 * Order matters, and it is what makes "no overage" true:
 *   1. 404 unless the flag is on; 2. authenticate and prove the caller owns the project;
 *   3. validate; 4. daily ceilings (per user, and for the whole product);
 *   5. take the credits atomically; 6. only then call the model;
 *   7. a failed clip refunds the credits. Every failure is a stable code, never provider text.
 */
import { randomUUID } from 'crypto'
import type { ContentAuthResult } from '@/lib/content/api-auth'
import { ASPECT_RATIOS, MAX_CLIPS_PER_USER_PER_DAY, MAX_GLOBAL_COST_USD_PER_DAY, MAX_IMAGES_BASE64_CHARS, MAX_REFERENCE_IMAGES, isVideoStudioEnabled, type AspectRatio } from './config'
import { creditsFor, estimateCostUsd, isValidSeconds } from './cost'
import { buildRequest, type CallResult, type RefImage } from './generate'

export interface VideoDeps {
  auth: (projectId: string | null) => Promise<ContentAuthResult>
  /** Jobs this user started since 00:00 UTC, and what the whole product spent since then. */
  usageToday: (userId: string) => Promise<{ userJobs: number; globalCostUsd: number }>
  startJob: (j: { id: string; userId: string; projectId: string; seconds: number; credits: number }) => Promise<boolean>
  spend: (userId: string, credits: number, jobId: string) => Promise<boolean>
  refund: (userId: string, credits: number, jobId: string, costUsd: number) => Promise<void>
  callModel: (body: Record<string, unknown>) => Promise<CallResult>
  store: (projectId: string, jobId: string, mp4: Buffer) => Promise<{ path: string; url: string } | null>
  finishJob: (jobId: string, patch: { status: 'done' | 'failed'; costUsd: number; path?: string }) => Promise<void>
  purgeExpired: () => Promise<void>
}

type Code = 'invalid_request' | 'unauthorized' | 'forbidden' | 'not_found' | 'insufficient_credits' | 'daily_limit' | 'provider_failed' | 'no_video' | 'unexpected' | 'invalid_prompt' | 'invalid_seconds' | 'invalid_aspect' | 'too_many_images' | 'images_too_large'
const fail = (error: Code, status: number, extra: Record<string, unknown> = {}) => Response.json({ ok: false, error, ...extra }, { status })
const MIME = new Set(['image/jpeg', 'image/png', 'image/webp'])
const B64 = /^[A-Za-z0-9+/]+=*$/

export async function handleGenerate(req: Request, deps: VideoDeps): Promise<Response> {
  if (!isVideoStudioEnabled()) return Response.json({ error: 'Not found' }, { status: 404 })
  let body: Record<string, unknown>
  try { body = (await req.json()) as Record<string, unknown> } catch { return fail('invalid_request', 400) }
  if (!body || typeof body !== 'object') return fail('invalid_request', 400)

  const projectId = typeof body.projectId === 'string' ? body.projectId : null
  const auth = await deps.auth(projectId)
  if ('error' in auth) return fail(auth.status === 401 ? 'unauthorized' : auth.status === 403 ? 'forbidden' : auth.status === 404 ? 'not_found' : 'invalid_request', auth.status)

  const seconds = body.seconds
  if (!isValidSeconds(seconds)) return fail('invalid_seconds', 400)
  const aspect = body.aspect
  if (typeof aspect !== 'string' || !(ASPECT_RATIOS as readonly string[]).includes(aspect)) return fail('invalid_aspect', 400)
  const rawImages = Array.isArray(body.images) ? body.images : []
  if (rawImages.length > MAX_REFERENCE_IMAGES) return fail('too_many_images', 400)
  const images: RefImage[] = []
  let total = 0
  for (const im of rawImages as Record<string, unknown>[]) {
    if (!im || typeof im.data !== 'string' || typeof im.mimeType !== 'string' || !MIME.has(im.mimeType) || !B64.test(im.data)) return fail('invalid_request', 400)
    total += im.data.length
    images.push({ data: im.data, mimeType: im.mimeType as RefImage['mimeType'] })
  }
  if (total > MAX_IMAGES_BASE64_CHARS) return fail('images_too_large', 413)
  const built = buildRequest({ prompt: typeof body.prompt === 'string' ? body.prompt : '', seconds, aspect: aspect as AspectRatio, images })
  if (!built.ok) return fail(built.error as Code, 400)

  const userId = auth.user.id
  try {
    await deps.purgeExpired().catch(() => undefined)
    const usage = await deps.usageToday(userId)
    if (usage.userJobs >= MAX_CLIPS_PER_USER_PER_DAY) return fail('daily_limit', 429)
    // The whole product has a ceiling too, so a bug or abuse cannot burn the account.
    if (usage.globalCostUsd + estimateCostUsd(seconds) > MAX_GLOBAL_COST_USD_PER_DAY) return fail('daily_limit', 429)

    const jobId = randomUUID()
    const credits = creditsFor(seconds)
    if (!(await deps.startJob({ id: jobId, userId, projectId: auth.project.id, seconds, credits }))) return fail('unexpected', 500)
    if (!(await deps.spend(userId, credits, jobId))) {
      await deps.finishJob(jobId, { status: 'failed', costUsd: 0 })
      return fail('insufficient_credits', 402)
    }
    const res = await deps.callModel(built.body)
    if (!res.ok) {
      await deps.refund(userId, credits, jobId, 0)
      await deps.finishJob(jobId, { status: 'failed', costUsd: 0 })
      return fail(res.error, 502)
    }
    const stored = await deps.store(auth.project.id, jobId, Buffer.from(res.result.videoBase64, 'base64'))
    if (!stored) {
      // The model was paid for but the customer got nothing: refund the credits, keep the true cost in the ledger.
      await deps.refund(userId, credits, jobId, res.result.costUsd)
      await deps.finishJob(jobId, { status: 'failed', costUsd: res.result.costUsd })
      return fail('unexpected', 500)
    }
    await deps.finishJob(jobId, { status: 'done', costUsd: res.result.costUsd, path: stored.path })
    return Response.json({ ok: true, jobId, url: stored.url, credits, seconds })
  } catch {
    return fail('unexpected', 500)
  }
}
