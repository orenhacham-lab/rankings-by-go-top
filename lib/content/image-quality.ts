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

/**
 * WHY THE QUESTION ASKS FOR A DESCRIPTION FIRST.
 *
 * MEASURED, 20 November 2026. The backfill's first two passes reviewed 24
 * published covers and called every one of them clean — including the two Oren
 * had reported by name:
 *
 *   * `google-positie-checker` (nl): the laptop's screen faces the camera while
 *     the woman behind it types on its keyboard, so she is looking at the back
 *     of her own screen;
 *   * `keyword-research-tools-guide` (he): one subject with two right hands, and
 *     a screen covered in lettering that looks like Hebrew and spells nothing.
 *
 * Both are plainly visible. The reviewer was answering three yes/no questions in
 * one shot, on the cheapest model there is, with a closing line telling it to
 * answer true only for what it can actually see — which is a push towards
 * `false` on every question and, on a model that is not really looking, towards
 * `false` on all of them.
 *
 * So it now names what it sees BEFORE it judges: every hand, and how each device
 * is turned. A model that has just written "her right hand is on the trackpad,
 * her other right hand holds a pen" does not then answer false to the duplicated
 * hand question. The description is thrown away — the parser reads the JSON —
 * and it is read on the model named by IMAGE_REVIEW_MODEL, a step up from the
 * text classifier's, because this is the one job in the product that is purely
 * about seeing.
 */
const QUESTION = [
  'You are the last check on one image before it is published on a company blog. AI image models make the same three mistakes over and over, and they are easy to miss at a glance, so look deliberately.',
  'FIRST, in one short line each, write what you actually see:',
  'HANDS: every hand in the image, whose it is, and whether it is a left or a right hand.',
  'DEVICES: every laptop, phone or monitor, which way its SCREEN faces, and which way its KEYBOARD faces.',
  'LETTERING: every word or label you can make out, copied exactly as it is written.',
  'THEN answer the three questions as JSON on the last line, with no code fence:',
  '{"duplicated_subject":true|false,"impossible_device":true|false,"garbled_text":true|false}',
  'duplicated_subject: does any person appear twice, or does one person have two left hands, two right hands, an extra hand, arm or head?',
  'impossible_device: is any device drawn impossibly — a laptop whose screen and keyboard both face the viewer, a screen facing away from the person using it, a mirrored or reversed device, a hand passing through an object?',
  'garbled_text: does any lettering look like words but spell nonsense, in any language — including text that imitates Hebrew, Japanese or Korean without being readable?',
  'Judge only what is legible: a blurred shape in the background with no readable lettering is not garbled text. But lettering you CAN read and that does not spell a real word IS.',
].join('\n')

/**
 * THE MODEL THAT LOOKS, and why it is a LIST and not a name.
 *
 * MEASURED TWICE, both in Production, both a 404.
 *
 *   1. On GEMINI_CLASSIFIER_MODEL (`gemini-2.5-flash-lite`), the text
 *      classifier's cheapest, the reviewer called 24 published covers clean,
 *      two of them reported by name. It was not looking.
 *   2. Pinning `gemini-2.5-flash` instead answered, for every one of the first
 *      12 covers: "This model models/gemini-2.5-flash is no longer available to
 *      new users." Twelve reviews that never ran.
 *
 * A pinned model id is a guess about someone else's catalogue, and this project
 * has been bitten by it before (lib/content/recommendations/model-availability.ts,
 * lib/content/gemini-image.ts). So the call walks an ordered list and moves on
 * when a model says it is not there, exactly as the image generator does.
 *
 * The lite model is deliberately NOT on the list. A reviewer that cannot see is
 * worse than no reviewer, because this one WRITES A VERDICT: a wrong "clean" row
 * closes the article for ever, while no answer at all leaves it for a later pass.
 */
const IMAGE_REVIEW_FALLBACKS = ['gemini-3.8-flash', 'gemini-3.1-flash']

/** Ordered, de-duplicated list of review models to try (env first, then fallbacks). */
export function imageReviewModelCandidates(env: NodeJS.ProcessEnv = process.env): string[] {
  const out: string[] = []
  for (const m of [env.IMAGE_REVIEW_MODEL, ...IMAGE_REVIEW_FALLBACKS]) {
    const name = (m || '').trim()
    if (name && !out.includes(name)) out.push(name)
  }
  return out
}

/** True when the error means "this model is not here" → try the next one. */
export function isModelUnavailable(message: string): boolean {
  const m = (message || '').toLowerCase()
  return m.includes('404') || m.includes('not found') || m.includes('no longer available')
    || m.includes('is not available') || m.includes('not supported') || m.includes('unsupported')
}

/**
 * The reviewer's version, bumped whenever the question or the model changes.
 * The backfill stores it beside the image it reviewed, so sharpening the
 * reviewer makes every cover be looked at again instead of staying on a verdict
 * an older, blinder reviewer gave (lib/blog/auto/cover-repair.ts).
 */
export const REVIEWER_VERSION = 'v2-2026-11-20'

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
  const candidates = imageReviewModelCandidates()
  let last: unknown
  for (const name of candidates) {
    try {
      const model = client.getGenerativeModel({ model: name })
      const res = await model.generateContent(
        [QUESTION, { inlineData: { data: bytes.toString('base64'), mimeType } }],
        { timeout: GEMINI_REQUEST_TIMEOUT_MS },
      )
      return res.response.text() || ''
    } catch (err) {
      last = err
      const message = err instanceof Error ? err.message : String(err)
      // A model that is not offered to this key is the next model's turn. Any
      // other failure (a timeout, a refusal, a network error) is this review's
      // answer and must not be retried down the list at full price.
      if (!isModelUnavailable(message)) throw err
      console.warn('[image-quality] model not available, trying the next', { model: name })
    }
  }
  throw last instanceof Error ? last : new Error('no_review_model_available')
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
