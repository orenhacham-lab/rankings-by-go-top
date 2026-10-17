/**
 * The AI first draft of a reply to one review. It is ALWAYS a draft: it lands
 * in the reply box and is sent only after the merchant reads it and presses
 * send, the same rule as the post composer (lib/gbp/draft.ts).
 *
 * The reply answers in the LANGUAGE THE CUSTOMER WROTE IN, because the reply is
 * published under their review where other customers read it; a review with no
 * text falls back to the project's language.
 *
 * The draft never invents a fact: not a discount, not a refund, not a promise
 * to call, not a claim about what happened. A one-star review gets an
 * acknowledgement and an invitation to continue in private, never an argument.
 *
 * THE REVIEWER'S NAME IS NEVER SENT TO THE MODEL (legal review 2026-10-12,
 * patches/legal-gbp-reviews-answers-2026-10-12.md). The draft path speaks to
 * the Gemini Developer API with an API key, whose free tier may use prompt
 * content, and a review's free text can itself carry special-category data. The
 * model does not need the name to word a reply, so the prompt says "the
 * customer" and the owner adds the name before sending if they want it. Nothing
 * identifying a third party enters the AI path at all.
 * Server-only. The generator is injected so a guard runs it without a network.
 */
import { generateGbpDraft } from './generate'
import { clampReply, GBP_REPLY_MAX } from './review-validate'
import type { Generate } from './draft'

/** Well under the cap: a reply a person actually reads is short. */
export const GBP_REPLY_DRAFT_TARGET = 450

export interface ReviewDraftSource {
  businessName: string | null
  /** The project's language, used only when the review has no text. */
  language: 'he' | 'en'
  review: {
    stars: number | null
    comment: string | null
  }
}

const LANGUAGE_NAME: Record<ReviewDraftSource['language'], string> = { he: 'Hebrew', en: 'English' }

export function buildReplyPrompt(src: ReviewDraftSource): string {
  const stars = src.review.stars
  const text = (src.review.comment ?? '').trim()
  const tone = stars === null
    ? 'The rating is unknown; stay neutral and warm.'
    : stars >= 4
      ? 'This is a happy customer. Thank them specifically for what they mentioned and invite them back.'
      : stars === 3
        ? 'This customer is lukewarm. Thank them, take the point seriously, and say the business wants to do better.'
        : 'This customer is unhappy. Acknowledge their experience without arguing and without admitting a fact you were not told, apologise for the experience, and invite them to continue in private so it can be put right.'

  return [
    `Write the business's public reply to one Google review${src.businessName ? ` for the business "${src.businessName}"` : ''}.`,
    text
      ? `Reply in THE SAME LANGUAGE the review is written in.\nThe review${stars !== null ? ` (${stars} of 5 stars)` : ''}:\n"""\n${text}\n"""`
      : `The review has ${stars !== null ? `${stars} of 5 stars and ` : ''}no text, so there is nothing to answer point by point. Reply in ${LANGUAGE_NAME[src.language]}.`,
    tone,
    `Rules: plain text only, no markdown, no hashtags, at most one emoji. At most ${GBP_REPLY_DRAFT_TARGET} characters, two to four sentences.`,
    'You were not told the customer\'s name. Address them as a customer, and never invent, guess or take a name out of the review text.',
    'Never invent a fact: no discount, no refund, no voucher, no promise that someone will call, no claim about what happened, no detail the review did not give.',
    'Do not ask the customer to change or remove their review, and do not mention this reply was written with help.',
    'Return JSON: {"comment": "<the reply text>"}',
  ].join('\n')
}

/** Clean model output into something the reply box can show as-is. */
export function cleanReplyDraft(raw: string): string {
  let text = raw
  try {
    const parsed = JSON.parse(raw) as { comment?: unknown }
    if (typeof parsed?.comment === 'string') text = parsed.comment
  } catch { /* plain text answer */ }
  text = text
    .replace(/\r/g, '')
    .replace(/^#+\s*/gm, '')
    .replace(/\*\*|__|`/g, '')
    .replace(/[^\S\n]+/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
  return clampReply(text, GBP_REPLY_MAX)
}

export async function draftReviewReply(src: ReviewDraftSource, generate: Generate = defaultReplyGenerate): Promise<{ ok: true; comment: string } | { ok: false }> {
  let raw: string
  try { raw = await generate(buildReplyPrompt(src)) } catch { return { ok: false } }
  const comment = cleanReplyDraft(raw)
  if (!comment) return { ok: false }
  return { ok: true, comment }
}

export const defaultReplyGenerate: Generate = (prompt) =>
  generateGbpDraft(prompt, { label: 'review-reply', answerBudget: 600, temperature: 0.5 })
