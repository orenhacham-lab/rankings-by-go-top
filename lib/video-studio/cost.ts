/**
 * What a clip costs us and what it costs the customer. Pure, no I/O.
 *
 * COST: measured 27.11.2026 on three real clips (5 s, 720p): 28,960 video output
 * tokens each, billed at $12 per 1M tokens, plus under 1,000 thinking tokens at
 * $9 per 1M. That is 5,792 tokens per second of 720p video, about $0.07 a second,
 * the same as Google's published price.
 *
 * PRICE: prepaid credits, 1 credit = 1 shekel (about $0.30 abroad). A clip of up
 * to 6 s is 5 credits, and every further second is 1 credit. An edit of an existing
 * clip is priced as a new clip, because that is what it costs us. The floor is
 * three times our cost at every duration (checked by the QA suite).
 */
import { MAX_SECONDS, MIN_SECONDS } from './config'

export const TOKENS_PER_SECOND_720P = 5792
export const VIDEO_USD_PER_MILLION_TOKENS = 12
/** Thinking tokens are small; a fixed allowance keeps the estimate on the safe side. */
export const THINKING_ALLOWANCE_USD = 0.01
export const USD_PER_CREDIT = 0.3
export const BASE_CREDITS = 5
export const BASE_SECONDS = 6

export function isValidSeconds(s: unknown): s is number {
  return typeof s === 'number' && Number.isInteger(s) && s >= MIN_SECONDS && s <= MAX_SECONDS
}

/** Our estimated cost of a clip, in USD. */
export function estimateCostUsd(seconds: number): number {
  if (!isValidSeconds(seconds)) throw new Error('invalid_seconds')
  return (seconds * TOKENS_PER_SECOND_720P * VIDEO_USD_PER_MILLION_TOKENS) / 1e6 + THINKING_ALLOWANCE_USD
}

/** Our real cost from the usage block Google returns. */
export function actualCostUsd(usage: { videoTokens: number; thoughtTokens: number; inputTokens: number }): number {
  return (usage.videoTokens * 12 + usage.thoughtTokens * 9 + usage.inputTokens * 1.5) / 1e6
}

/** What the customer pays, in credits. */
export function creditsFor(seconds: number): number {
  if (!isValidSeconds(seconds)) throw new Error('invalid_seconds')
  return BASE_CREDITS + Math.max(0, seconds - BASE_SECONDS)
}
