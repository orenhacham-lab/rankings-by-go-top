/**
 * One call to the video model (Interactions API) and the parsing of its answer.
 * Server-only. The fetch is injected so the QA suite never touches the network.
 *
 * The API key is read by the caller from GEMINI_API_KEY and passed in; this file
 * never logs a request body (it holds the customer's photos) or the key.
 */
import {
  ASPECT_RATIOS, MAX_PROMPT_CHARS, MAX_REFERENCE_IMAGES, RESOLUTION, VIDEO_ENDPOINT, VIDEO_MODEL, type AspectRatio,
} from './config'
import { actualCostUsd, isValidSeconds } from './cost'

export interface RefImage { data: string; mimeType: 'image/jpeg' | 'image/png' | 'image/webp' }
export interface VideoRequest { prompt: string; seconds: number; aspect: AspectRatio; images?: RefImage[]; editVideo?: { data: string } }
export type BuildResult = { ok: true; body: Record<string, unknown> } | { ok: false; error: string }

export function buildRequest(r: VideoRequest): BuildResult {
  const prompt = (r.prompt ?? '').trim()
  if (!prompt || prompt.length > MAX_PROMPT_CHARS) return { ok: false, error: 'invalid_prompt' }
  if (!isValidSeconds(r.seconds)) return { ok: false, error: 'invalid_seconds' }
  if (!(ASPECT_RATIOS as readonly string[]).includes(r.aspect)) return { ok: false, error: 'invalid_aspect' }
  const images = r.images ?? []
  if (images.length > MAX_REFERENCE_IMAGES) return { ok: false, error: 'too_many_images' }
  const input: Record<string, unknown>[] = []
  if (r.editVideo) input.push({ type: 'video', data: r.editVideo.data, mime_type: 'video/mp4' })
  for (const im of images) input.push({ type: 'image', data: im.data, mime_type: im.mimeType })
  input.push({ type: 'text', text: prompt })
  return {
    ok: true,
    body: {
      model: VIDEO_MODEL,
      input,
      // Fixed here, never from the request: this is the cost ceiling.
      response_format: { type: 'video', aspect_ratio: r.aspect, resolution: RESOLUTION, duration: `${r.seconds}s` },
    },
  }
}

export interface VideoResult { videoBase64: string; costUsd: number; videoTokens: number }
export type CallResult = { ok: true; result: VideoResult } | { ok: false; error: 'provider_failed' | 'no_video' }

type Fetch = (url: string, init: { method: string; headers: Record<string, string>; body: string }) => Promise<{ ok: boolean; json: () => Promise<unknown> }>

/** The merchant never sees a raw provider error: every failure maps to one of two codes. */
export async function callVideoModel(apiKey: string, body: Record<string, unknown>, doFetch: Fetch): Promise<CallResult> {
  let json: Record<string, unknown>
  try {
    const res = await doFetch(VIDEO_ENDPOINT, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify(body),
    })
    if (!res.ok) return { ok: false, error: 'provider_failed' }
    json = (await res.json()) as Record<string, unknown>
  } catch {
    return { ok: false, error: 'provider_failed' }
  }
  const steps = Array.isArray(json.steps) ? (json.steps as Record<string, unknown>[]) : []
  let videoBase64 = ''
  for (const s of steps) {
    if (s.type !== 'model_output' || !Array.isArray(s.content)) continue
    for (const c of s.content as Record<string, unknown>[]) {
      if (c.type === 'video' && typeof c.data === 'string') videoBase64 = c.data
    }
  }
  if (!videoBase64) return { ok: false, error: 'no_video' }
  const u = (json.usage ?? {}) as Record<string, unknown>
  const videoTokens = Number(u.total_output_tokens ?? 0)
  return {
    ok: true,
    result: {
      videoBase64,
      videoTokens,
      costUsd: actualCostUsd({ videoTokens, thoughtTokens: Number(u.total_thought_tokens ?? 0), inputTokens: Number(u.total_input_tokens ?? 0) }),
    },
  }
}
