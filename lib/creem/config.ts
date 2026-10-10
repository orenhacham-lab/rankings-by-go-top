/**
 * Creem's configuration and its OFF SWITCH, in one place.
 *
 * Creem is off by default and stays off until `CREEM_ENABLED` is exactly
 * 'true', the same kill-switch shape the rest of this repo uses
 * (SITE_FIX_AUTO_ENABLED, GSC_ACTIONS_ENABLED). Default-off matters more
 * than usual here: PayPal is the live path for every customer outside
 * Israel, and a half-configured Creem must never take a checkout away from
 * a provider that works.
 *
 * TEST AND LIVE ARE DIFFERENT UNIVERSES. Creem's own documentation is blunt
 * about it: the two environments are completely isolated, their keys are not
 * interchangeable, and using a key against the wrong base URL errors. The
 * mode is therefore a single explicit variable (`CREEM_MODE`), never guessed
 * from NODE_ENV or from a key prefix, because this repo's Vercel preview
 * shares production's database — "it's a preview, so it must be test" is
 * exactly the inference that would charge a real card from a preview deploy.
 * A missing or unrecognised mode resolves to 'test', so the failure is a
 * sandbox charge, never a real one.
 *
 * SECRETS ARE NEVER RETURNED TO A CALLER THAT ONLY NEEDS TO KNOW IF THEY
 * EXIST. `creemReadiness()` reports which pieces are missing by NAME so an
 * operator can see what to set, without the values passing through a log
 * line or a response body.
 *
 * PURE apart from reading process.env on each call, so a changed value takes
 * effect on the next request rather than needing a restart.
 */

export type CreemMode = 'test' | 'live'

export const CREEM_API_BASE: Record<CreemMode, string> = {
  test: 'https://test-api.creem.io',
  live: 'https://api.creem.io',
}

/** The off switch. Anything but the exact string 'true' means off. */
export function isCreemEnabled(): boolean {
  return process.env.CREEM_ENABLED === 'true'
}

/** 'live' ONLY when asked for by name; anything else is the sandbox. */
export function creemMode(): CreemMode {
  return process.env.CREEM_MODE?.trim().toLowerCase() === 'live' ? 'live' : 'test'
}

/** The base URL for the configured mode. */
export function creemApiBase(): string {
  return CREEM_API_BASE[creemMode()]
}

/** The API key, or null. Never logged, never returned to a browser. */
export function creemApiKey(): string | null {
  return process.env.CREEM_API_KEY?.trim() || null
}

/** The webhook signing secret, or null. */
export function creemWebhookSecret(): string | null {
  return process.env.CREEM_WEBHOOK_SECRET?.trim() || null
}

export interface CreemReadiness {
  enabled: boolean
  mode: CreemMode
  /** True only when the switch is on AND every secret below is present. */
  ready: boolean
  /** Env var NAMES that are missing — never their values. */
  missing: string[]
}

/**
 * Whether Creem can actually be called, and if not, what is missing. A
 * caller that gets `ready: false` must fall back to the provider that works
 * rather than failing the customer's checkout.
 */
export function creemReadiness(): CreemReadiness {
  const missing: string[] = []
  if (!creemApiKey()) missing.push('CREEM_API_KEY')
  if (!creemWebhookSecret()) missing.push('CREEM_WEBHOOK_SECRET')
  const enabled = isCreemEnabled()
  return { enabled, mode: creemMode(), ready: enabled && missing.length === 0, missing }
}

/**
 * Where Creem sends the payer back after paying.
 *
 * Built from OUR OWN canonical origin and a fixed path — never from a
 * request header, a query parameter, or anything else a caller supplies. A
 * checkout whose return URL came from the request would be a redirect an
 * attacker chooses (CLAUDE.md: never allow an external `next` URL), and it
 * would be a redirect the payer reaches immediately after entering card
 * details.
 *
 * The origin is overridable by env for the sandbox only, and only to another
 * absolute https URL; anything else falls back to the canonical origin.
 */
const CANONICAL_ORIGIN = 'https://www.gotopseo.com'

export function creemReturnOrigin(): string {
  const configured = process.env.CREEM_RETURN_ORIGIN?.trim()
  if (configured && /^https:\/\/[^/\s]+$/.test(configured)) return configured.replace(/\/+$/, '')
  return CANONICAL_ORIGIN
}

export const CREEM_SUCCESS_PATH = '/billing?checkout=creem'

export function creemSuccessUrl(): string {
  return `${creemReturnOrigin()}${CREEM_SUCCESS_PATH}`
}
