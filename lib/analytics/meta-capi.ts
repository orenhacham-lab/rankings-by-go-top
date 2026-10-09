/**
 * META CONVERSIONS API — the signup conversion, sent from the server.
 *
 * WHY THIS EXISTS. The Meta pixel ships inside Google Tag Manager, and
 * components/consent/GoogleTags.tsx loads GTM only once a visitor accepts
 * analytics or marketing. That gate is deliberate and stays. Its cost is
 * measurement: over 2026-10-03..09 the ad account recorded 61 link clicks on
 * the two signup campaigns and 7 measured landing-page views, so Meta's
 * optimisation had about one conversion a week to learn from. A server-side
 * signal does not depend on a tag loading in the browser.
 *
 * WHAT IT SENDS, AND WHAT IT DELIBERATELY DOES NOT.
 *   sends    one CompleteRegistration per account, with the email and the
 *            Supabase user id SHA-256 hashed (Meta's required normalisation:
 *            trimmed, lower-cased), the event time, and the page the signup
 *            finished on.
 *   never    the raw email, a name, a phone number, the visitor's IP address
 *            or user agent, and never the `_fbp` / `_fbc` cookies — nothing
 *            here reads a cookie at all. Those raise Meta's match rate; they
 *            are also the identifiers a visitor cannot hash away, so this file
 *            does without them.
 *
 * OFF UNTIL IT IS SWITCHED ON. With META_CAPI_PIXEL_ID or
 * META_CAPI_ACCESS_TOKEN unset, `sendSignupConversion` makes no request and
 * reports `not_configured`. So merging this changes nothing: the first event
 * leaves the server only once those two environment variables exist on Vercel,
 * which is the step to take after the privacy policy names Meta for this
 * purpose. META_CAPI_DISABLED=true is the kill switch once they do.
 *
 * SENT TWICE IS COUNTED ONCE. Both signup doors (the auth callback, and
 * /api/send-notification-email for email+password) fire on a 30-minute
 * freshness window, so one account can reach here more than once. The event id
 * is derived from the user id, and Meta deduplicates on it, so a repeat is
 * collapsed rather than inflating the count.
 *
 * BEST EFFORT. A failure is logged by name and swallowed: measurement never
 * breaks a signup.
 */
import { createHash } from 'crypto'

type Env = Record<string, string | undefined>

const GRAPH_VERSION = 'v21.0'
const TIMEOUT_MS = 3000

export type MetaCapiConfig = { pixelId: string; accessToken: string; testEventCode?: string }

export function metaCapiDisabled(env: Env = process.env): boolean {
  return (env.META_CAPI_DISABLED ?? '').trim().toLowerCase() === 'true'
}

/** The config, or null when the deployment has not been given the credentials. */
export function metaCapiConfig(env: Env = process.env): MetaCapiConfig | null {
  if (metaCapiDisabled(env)) return null
  const pixelId = (env.META_CAPI_PIXEL_ID ?? '').trim()
  const accessToken = (env.META_CAPI_ACCESS_TOKEN ?? '').trim()
  if (!pixelId || !accessToken) return null
  const testEventCode = (env.META_CAPI_TEST_EVENT_CODE ?? '').trim()
  return { pixelId, accessToken, ...(testEventCode ? { testEventCode } : {}) }
}

/** Meta's normalisation for an email, then SHA-256 hex. Returns null for a blank. */
export function hashedEmail(email: string | null | undefined): string | null {
  const normalized = (email ?? '').trim().toLowerCase()
  if (!normalized) return null
  return createHash('sha256').update(normalized).digest('hex')
}

/** The account id, hashed too: Meta gets a pseudonym, not our primary key. */
export function hashedExternalId(userId: string | null | undefined): string | null {
  const normalized = (userId ?? '').trim().toLowerCase()
  if (!normalized) return null
  return createHash('sha256').update(normalized).digest('hex')
}

/** One deterministic id per account, so a second send is deduplicated by Meta. */
export function signupEventId(userId: string): string {
  return `signup_${createHash('sha256').update(userId).digest('hex').slice(0, 32)}`
}

export type SignupConversionInput = {
  userId: string
  email: string | null | undefined
  /** The page the signup finished on. Internal URLs only; anything else is dropped. */
  sourceUrl?: string | null
  createdAt?: string | null
}

export type MetaCapiEvent = {
  event_name: 'CompleteRegistration'
  event_time: number
  event_id: string
  action_source: 'website'
  event_source_url?: string
  user_data: { em?: string[]; external_id?: string[] }
}

/** When the event happened: the account's own creation time, else now. */
function eventTime(createdAt: string | null | undefined, now: number): number {
  const parsed = Date.parse(createdAt ?? '')
  // Meta rejects events older than 7 days and anything in the future.
  if (!Number.isFinite(parsed) || parsed > now || now - parsed > 7 * 24 * 60 * 60 * 1000) {
    return Math.floor(now / 1000)
  }
  return Math.floor(parsed / 1000)
}

export function buildSignupEvent(input: SignupConversionInput, now = Date.now()): MetaCapiEvent {
  const em = hashedEmail(input.email)
  const externalId = hashedExternalId(input.userId)
  const event: MetaCapiEvent = {
    event_name: 'CompleteRegistration',
    event_time: eventTime(input.createdAt, now),
    event_id: signupEventId(input.userId),
    action_source: 'website',
    user_data: {
      ...(em ? { em: [em] } : {}),
      ...(externalId ? { external_id: [externalId] } : {}),
    },
  }
  const url = safeSourceUrl(input.sourceUrl)
  if (url) event.event_source_url = url
  return event
}

/** Only an https page of ours is worth sending, and a URL carries query data. */
function safeSourceUrl(raw: string | null | undefined): string | null {
  if (!raw) return null
  try {
    const url = new URL(raw)
    if (url.protocol !== 'https:') return null
    return `${url.origin}${url.pathname}`
  } catch {
    return null
  }
}

export type SignupConversionResult =
  | { sent: true }
  | { sent: false; reason: 'not_configured' | 'no_identifier' | 'send_failed' }

export type CapiFetch = typeof fetch

/**
 * Send the conversion. Never throws.
 *
 * `deps.fetch` and `deps.now` exist for the QA suite; production passes neither.
 */
export async function sendSignupConversion(
  input: SignupConversionInput,
  deps: { env?: Env; fetch?: CapiFetch; now?: () => number } = {},
): Promise<SignupConversionResult> {
  const config = metaCapiConfig(deps.env ?? process.env)
  if (!config) return { sent: false, reason: 'not_configured' }

  const event = buildSignupEvent(input, deps.now ? deps.now() : Date.now())
  // With neither identifier Meta cannot match the person, and we would be
  // sending a bare page URL for nothing.
  if (!event.user_data.em && !event.user_data.external_id) return { sent: false, reason: 'no_identifier' }

  const body = JSON.stringify({
    data: [event],
    ...(config.testEventCode ? { test_event_code: config.testEventCode } : {}),
  })
  const doFetch = deps.fetch ?? fetch
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
  try {
    const response = await doFetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${encodeURIComponent(config.pixelId)}/events?access_token=${encodeURIComponent(config.accessToken)}`,
      { method: 'POST', headers: { 'content-type': 'application/json' }, body, signal: controller.signal },
    )
    if (!response.ok) {
      // Status only: a Graph error body can quote back what we sent.
      console.error('[meta-capi] signup conversion rejected:', response.status)
      return { sent: false, reason: 'send_failed' }
    }
    return { sent: true }
  } catch (error) {
    console.error('[meta-capi] signup conversion failed:', error instanceof Error ? error.name : 'unknown')
    return { sent: false, reason: 'send_failed' }
  } finally {
    clearTimeout(timer)
  }
}

/** The call sites' one-liner: fire and forget, never let it affect the signup. */
export async function reportSignupConversion(input: SignupConversionInput): Promise<void> {
  try {
    await sendSignupConversion(input)
  } catch {
    /* sendSignupConversion already swallows; this is belt and braces */
  }
}
