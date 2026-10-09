/**
 * When a setup email may go out, and which one. Pure: the clock, the project's facts and the
 * stored state come in, one decision comes out, so every rule runs under test.
 *
 * THE TWO STAGES, in this order:
 *   connect  the project has no site connection at all. Nothing we write can reach a site,
 *            so this is the one thing that matters.
 *   publish  connected, but nothing has ever been published from this project.
 * A project that is connected and has published is past both, and gets nothing.
 *
 * THE RULES:
 *   - `connect` from 3 days after the project was created; `publish` from 7 days;
 *   - a second email for the same stage 7 days after the first, and that is the last one:
 *     at most 2 per stage, so at most 4 setup emails in a project's life;
 *   - never more than one email of ANY kind per project in 72 hours (the approval reminder
 *     shares the same counter: lib/onboarding-emails/state.ts writes `last_sent_at` too);
 *   - only at 09:00 Asia/Jerusalem, Sunday to Thursday (lib/reminders/cadence.ts' window);
 *   - nothing once the stage is done, nothing for an owner who turned emails off, and
 *     nothing for one who stopped the setup emails alone from the link inside one.
 * Reaching a stage resets the count, so a project that connects and then never publishes
 * gets the `publish` emails on their own schedule.
 */
import { MIN_GAP_MS } from '@/lib/reminders/cadence'

export const CONNECT_AFTER_MS = 3 * 86_400_000
export const PUBLISH_AFTER_MS = 7 * 86_400_000
export const REPEAT_AFTER_MS = 7 * 86_400_000
export const MAX_PER_STAGE = 2

export type Stage = 'connect' | 'publish'

export interface ProjectFacts {
  /** When the project was created (ISO). */
  createdAt: string
  /** A site connection of any kind exists (WordPress, another platform, or Shopify). */
  connected: boolean
  /** Something has been published from this project at least once. */
  published: boolean
}

export interface OnboardingState {
  stage: Stage | null
  sentCount: number
  /** When the last SETUP email went out. */
  lastSentAt: string | null
  /** When the last email of any kind went out for this project. */
  lastAnyAt: string | null
  enabled: boolean
  /** The owner stopped the SETUP emails alone, from the link in one of them. */
  optedOut: boolean
}

export type OnboardingDecision =
  | { send: true; stage: Stage; sentCount: number }
  | { send: false; reason: 'disabled' | 'nothing_to_do' | 'too_soon' | 'stage_done' | 'min_gap' }

/** The stage a project is at, or null when it is past both. */
export function stageOf(facts: Pick<ProjectFacts, 'connected' | 'published'>): Stage | null {
  if (!facts.connected) return 'connect'
  if (!facts.published) return 'publish'
  return null
}

const ms = (iso: string | null): number => {
  const t = iso ? Date.parse(iso) : NaN
  return Number.isFinite(t) ? t : NaN
}

export function decideOnboardingEmail(input: { now: Date; facts: ProjectFacts; state: OnboardingState | null }): OnboardingDecision {
  const { now, facts } = input
  const state = input.state ?? { stage: null, sentCount: 0, lastSentAt: null, lastAnyAt: null, enabled: true, optedOut: false }
  if (!state.enabled || state.optedOut) return { send: false, reason: 'disabled' }

  const stage = stageOf(facts)
  if (!stage) return { send: false, reason: 'nothing_to_do' }

  const t = now.getTime()
  const lastAny = ms(state.lastAnyAt)
  if (Number.isFinite(lastAny) && t - lastAny < MIN_GAP_MS) return { send: false, reason: 'min_gap' }

  const sent = state.stage === stage ? state.sentCount : 0
  if (sent >= MAX_PER_STAGE) return { send: false, reason: 'stage_done' }

  const created = ms(facts.createdAt)
  const ripe = stage === 'connect' ? CONNECT_AFTER_MS : PUBLISH_AFTER_MS
  if (!Number.isFinite(created) || t - created < ripe) return { send: false, reason: 'too_soon' }

  if (sent === 0) return { send: true, stage, sentCount: 1 }
  const last = ms(state.lastSentAt)
  return Number.isFinite(last) && t - last >= REPEAT_AFTER_MS
    ? { send: true, stage, sentCount: sent + 1 }
    : { send: false, reason: 'too_soon' }
}
