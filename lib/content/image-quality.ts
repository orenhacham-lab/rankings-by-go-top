/**
 * LOOKING AT THE IMAGE BEFORE IT IS PUBLISHED.
 *
 * On 17 November 2026 Oren named two faults in images already on the blog, and
 * both were there to be seen:
 *
 *   - the Dutch cover (`google-positie-checker`, 17 Nov) shows a laptop whose
 *     screen AND keyboard both face the camera while the woman sits behind it
 *     typing — she is looking at the back of her own screen;
 *   - the Hebrew cover (`keyword-research-tools-guide`, 17 Nov) gives its one
 *     subject two right hands.
 *
 * And a third nobody had reported: every cover examined that week carried
 * nonsense lettering on the laptop screen ("Search tirtking", "Test mpoet",
 * fake Hebrew), on a page whose whole subject is being trustworthy.
 *
 * WHY MORE PROMPT WORDS WOULD NOT HAVE HELPED. `buildImagePrompt` has instructed
 * "Absolutely NO text, letters, numbers, captions, labels, badges, watermarks,
 * UI" and "Avoid distorted hands/faces" since long before any of these. The
 * image model simply loses that instruction to the concept it is given, which
 * for this blog is almost always a screen full of a dashboard. A rule the
 * generator ignores is not a guard; the only guard is looking at what came back.
 *
 * So the bytes go to the cheap classifier model — the one already configured as
 * GEMINI_CLASSIFIER_MODEL, no new lane and no new key — with a closed question
 * per fault and a JSON answer.
 *
 * IT NEVER BLOCKS. A review that cannot run, times out, or answers something
 * unparsable returns `ok`, because an unavailable opinion about an image must
 * never be the reason an article does not publish. The caller decides what to do
 * with a defect; this module only answers.
 */

import { getGeminiClient, GEMINI_REQUEST_TIMEOUT_MS } from '@/lib/ai-visibility/gemini-semantic-classifier'

/** The faults worth one regeneration. Each one was seen on a published image. */
export const IMAGE_DEFECTS = [
  /** More than one of the same person, or a person with extra/duplicated limbs. */
  'duplicated_subject',
  /** A device assembled impossibly: a screen and its keyboard facing the same way,
   *  a mirrored laptop, a hand passing through an object. */
  'impossible_device',
  /** Lettering that is meant to read as words and does not. */
  'garbled_text',
] as const
export type ImageDefect = (typeof IMAGE_DEFECTS)[number]

export interface ImageReview {
  ok: boolean
  defects: ImageDefect[]
  /** Why the review did not run, when it did not. `ok` is true in that case. */
  skipped?: string
}

const QUESTION = [
  'You are checking one image before it is published on a company blog. Look at it and answer three closed questions.',
  '1. duplicated_subject: does any person appear twice, or does one person have a duplicated or extra hand, arm or head?',
  '2. impossible_device: is any device drawn impossibly — a laptop whose screen and keyboard both face the viewer, a mirrored or reversed device, a screen facing away from the person using it, a hand passing through an object?',
  '3. garbled_text: does any lettering in the image (on a screen, a page, a notebook) look like words but spell nonsense in any language?',
  'Answer with JSON only, no prose and no code fence: {"duplicated_subject":true|false,"impossible_device":true|false,"garbled_text":true|false}',
  'Answer true only for what you can actually see. Blurred background shapes with no legible lettering are not garbled text.',
].join('\n')

export interface ReviewDeps {
  /** The model call, injectable so the decision logic is testable without a key. */
  ask?: (bytes: Buffer, mimeType: string) => Promise<string>
}

/** Parse the model's answer. Anything unexpected means "no opinion", never a defect. */
export function parseImageReview(raw: string): ImageReview {
  const text = (raw || '').trim().replace(/^```(?:json)?\s*|\s*```$/g, '')
  const at = text.indexOf('{')
  if (at < 0) return { ok: true, defects: [], skipped: 'unparsable_answer' }
  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(at, text.lastIndexOf('}') + 1))
  } catch {
    return { ok: true, defects: [], skipped: 'unparsable_answer' }
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: true, defects: [], skipped: 'unparsable_answer' }
  }
  const row = parsed as Record<string, unknown>
  // A key the model left out is not a defect; only an explicit `true` is.
  const defects = IMAGE_DEFECTS.filter((d) => row[d] === true)
  return { ok: defects.length === 0, defects: [...defects] }
}

/** The one sentence a regeneration is given, naming only what was seen. */
export function retryGuidanceFor(defects: readonly ImageDefect[]): string {
  const asks: string[] = []
  if (defects.includes('duplicated_subject')) {
    asks.push('show exactly ONE person, with exactly two hands, both fully visible and correctly attached')
  }
  if (defects.includes('impossible_device')) {
    asks.push('draw every device the way it really sits: a laptop seen from behind or beside the person using it, its screen facing THEM and its keyboard under their hands, never a screen and a keyboard both facing the viewer')
  }
  if (defects.includes('garbled_text')) {
    asks.push('put NO lettering anywhere — a screen shows only soft, out-of-focus colour blocks and chart shapes with no words, numbers or labels of any kind')
  }
  if (asks.length === 0) return ''
  return `The previous attempt at this image was rejected. Fix exactly this and change nothing else: ${asks.join('; ')}.`
}

async function askGemini(bytes: Buffer, mimeType: string): Promise<string> {
  const client = getGeminiClient()
  if (!client) throw new Error('no_gemini_client')
  const model = client.getGenerativeModel({
    model: process.env.GEMINI_CLASSIFIER_MODEL || 'gemini-2.5-flash-lite',
  })
  const res = await model.generateContent(
    [QUESTION, { inlineData: { data: bytes.toString('base64'), mimeType } }],
    { timeout: GEMINI_REQUEST_TIMEOUT_MS },
  )
  return res.response.text() || ''
}

/**
 * Look at one generated image. Never throws, never blocks: every failure path
 * answers `ok` with a `skipped` reason.
 */
export async function reviewGeneratedImage(
  bytes: Buffer, mimeType = 'image/jpeg', deps: ReviewDeps = {},
): Promise<ImageReview> {
  if (!bytes || bytes.length === 0) return { ok: true, defects: [], skipped: 'no_bytes' }
  try {
    const raw = await (deps.ask ?? askGemini)(bytes, mimeType)
    return parseImageReview(raw)
  } catch (err) {
    console.warn('[image-quality] review did not run', {
      message: err instanceof Error ? err.message : String(err),
    })
    return { ok: true, defects: [], skipped: 'review_failed' }
  }
}
