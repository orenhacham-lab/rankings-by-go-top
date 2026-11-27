/**
 * The prompt used when the improver is unavailable: the user's own words plus the chosen
 * look, wrapped in the safety sentences every clip carries. Pure. Never blocks generation.
 */
import { CAMERA_PHRASE, GOALS, MOOD_PHRASE, STYLE_PHRASE, type PlanInput } from './presets'
import { MAX_PROMPT_CHARS } from './config'

/** Anything that would put prices, links or claims on screen. Shared with the model-output check. */
export const DENY = /https?:|www\.|@|\d{3,}|%|[$₪€£]|\b(sale|discount|guarantee|cure|best price)\b|מבצע|הנחה|שקל|מחיר/i

export const CLOSING = 'Smooth, natural motion. Photorealistic. No text, captions, logos or watermarks on screen.'

export function fallbackPrompt(i: PlanInput): string {
  const parts: string[] = []
  const cleaned = i.idea.replace(/\s+/g, ' ').trim()
  // Words about prices or offers would be drawn onto the video: the clip uses the goal instead.
  const idea = DENY.test(cleaned) ? '' : cleaned
  if (idea) parts.push(idea.endsWith('.') ? idea : `${idea}.`)
  else if (i.goal) parts.push(`A short marketing clip: ${GOALS[i.goal].definition}.`)
  else parts.push('A short, polished marketing clip of the subject.')
  if (i.photoCount > 0) parts.push('Keep the subject exactly as shown in the reference photos.')
  const look = [i.style && STYLE_PHRASE[i.style], i.mood && MOOD_PHRASE[i.mood]].filter(Boolean).join(', ')
  if (look) parts.push(`Look and mood: ${look}.`)
  if (i.camera) parts.push(`Camera: ${CAMERA_PHRASE[i.camera]}.`)
  parts.push('One continuous shot.')
  const tail = ` ${CLOSING}`
  const head = parts.join(' ')
  return head.length + tail.length <= MAX_PROMPT_CHARS ? head + tail : head.slice(0, MAX_PROMPT_CHARS - tail.length).trimEnd() + tail
}
