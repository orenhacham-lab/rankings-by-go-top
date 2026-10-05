/**
 * THE COOKIE/TRACKER CONSENT CONTRACT — one place, shared by the banner, the
 * tag loader, the consent log and the guards.
 *
 * WHY THIS EXISTS. Until this module the site loaded Google Tag Manager
 * (GTM-PC29G3NQ) unconditionally from the root layout <head>, on EVERY page,
 * before the visitor was asked anything, and the notice offered a single
 * "Accept" button over the sentence "continuing to use the site means you
 * agree". Under the ePrivacy Directive as read by the CJEU in Planet49
 * (C-673/17) and under GDPR Art. 4(11) + 7, neither of those is consent:
 * non-essential storage needs a PRIOR, affirmative, specific act, refusing has
 * to be as easy as agreeing, and consent has to be withdrawable at any time.
 *
 * THE CATEGORIES. Three, deliberately few, because a category the site cannot
 * honour separately is a promise it cannot keep:
 *
 *   necessary   sign-in, the language cookie, the trial/claim cookies, CSRF.
 *               No consent is asked: without them the service cannot be
 *               delivered (ePrivacy Art. 5(3) "strictly necessary" carve-out).
 *   analytics   measurement. Today: GTM's analytics tags.
 *   marketing   advertising and remarketing. Today: GTM's Google Ads / Meta tags.
 *
 * `necessary` is always true and can never be turned off — the toggle is shown
 * disabled rather than hidden, so the visitor can see what runs regardless.
 */

export const CONSENT_CATEGORIES = ['necessary', 'analytics', 'marketing'] as const

export type ConsentCategory = (typeof CONSENT_CATEGORIES)[number]

export type ConsentChoices = Record<ConsentCategory, boolean>

/**
 * How the decision was made. Stored with the record because Art. 7(1) asks the
 * controller to be able to demonstrate not just WHAT was consented to but that
 * the consent was freely given — which button was pressed is part of that.
 *
 *   accept_all / reject_all   the two equally prominent banner buttons
 *   custom                    saved from the preferences panel
 *   withdraw                  turned a previously granted category off
 *   gpc                       no button: the browser sent Global Privacy
 *                             Control, which US state law treats as a valid
 *                             opt-out signal, so nothing optional was loaded
 */
export const CONSENT_ACTIONS = ['accept_all', 'reject_all', 'custom', 'withdraw', 'gpc'] as const

export type ConsentAction = (typeof CONSENT_ACTIONS)[number]

/**
 * The languages a disclosure can be read in, and therefore the languages a
 * decision can be RECORDED against. Part of the proof: Art. 7(1) is about
 * showing what this visitor was actually shown, so a decision taken on a
 * Spanish page must not be filed as having been read in Hebrew.
 *
 * `es` is here before the Spanish site is public on purpose. The public site
 * already serves /es on preview, and the log's CHECK constraint lists exactly
 * these values — so a Spanish visitor's decision would otherwise either be
 * mislabelled or be rejected by the database and silently lost, which is the
 * one failure this table exists to prevent. Any new public language has to be
 * added here AND to the constraint in
 * supabase/migrations/20261003000000_consent_events.sql, in that order.
 *
 * `pt-BR` is at that first step and no further: the language exists in the code
 * so that a Brazilian visitor's decision is filed as Portuguese rather than as
 * Hebrew, but the log's CHECK still lists he/en/es, so the database would refuse
 * the row. Widening it is one additive line and belongs to the legal thread, not
 * here. Until it is applied, the Portuguese site stays off — which is what
 * lib/consent/__qa__/consent-locale-launch.qa.ts enforces, so the flag cannot be
 * turned on into silent data loss.
 */
export const CONSENT_LOCALES = ['he', 'en', 'es', 'pt-BR'] as const

export type ConsentLocale = (typeof CONSENT_LOCALES)[number]

/** Fail-safe, not fail-closed: an unknown language still records the decision, under the default. */
export function normalizeConsentLocale(value: unknown): ConsentLocale {
  return typeof value === 'string' && (CONSENT_LOCALES as readonly string[]).includes(value)
    ? (value as ConsentLocale)
    : 'he'
}

/**
 * The version of the cookie disclosure the visitor was shown. Bump it whenever
 * the categories change or a new vendor joins one of them: a record carries the
 * version it was given against, and a visitor whose stored version is older
 * than this is asked again instead of being counted as having agreed to
 * something they never read.
 */
export const CONSENT_POLICY_VERSION = '2026-10-03'

/** Nothing optional. The state a visitor is in before they decide, and after "reject all". */
export const CONSENT_DENIED: ConsentChoices = { necessary: true, analytics: false, marketing: false }

/** Everything. Only ever the result of a deliberate "accept all". */
export const CONSENT_GRANTED: ConsentChoices = { necessary: true, analytics: true, marketing: true }

export type ConsentRecord = {
  /** Schema version of this stored object, independent of the policy version. */
  v: 1
  /** Random per-decision id. Links a later withdrawal to the grant it revokes. */
  id: string
  /** The disclosure version the visitor decided against. */
  policy: string
  action: ConsentAction
  categories: ConsentChoices
  /** ISO 8601, UTC. When the visitor decided, by their clock. */
  at: string
}

export function isConsentCategory(value: unknown): value is ConsentCategory {
  return typeof value === 'string' && (CONSENT_CATEGORIES as readonly string[]).includes(value)
}

export function isConsentAction(value: unknown): value is ConsentAction {
  return typeof value === 'string' && (CONSENT_ACTIONS as readonly string[]).includes(value)
}

/**
 * Coerce anything (stored JSON, a request body) into choices, with `necessary`
 * forced on and every unknown or missing category DENIED. Fail-closed: a
 * malformed record must never be read as permission to track.
 */
export function normalizeChoices(value: unknown): ConsentChoices {
  const raw = (value ?? {}) as Record<string, unknown>
  return {
    necessary: true,
    analytics: raw.analytics === true,
    marketing: raw.marketing === true,
  }
}

/** The action a set of choices amounts to, when the visitor saved the panel. */
export function actionForChoices(choices: ConsentChoices, previous: ConsentChoices | null): ConsentAction {
  if (choices.analytics && choices.marketing) return 'accept_all'
  if (!choices.analytics && !choices.marketing) {
    // Turning something off that WAS on is a withdrawal, and is recorded as one:
    // the distinction is what lets us show, per visitor, that a grant ended.
    const had = previous ? previous.analytics || previous.marketing : false
    return had ? 'withdraw' : 'reject_all'
  }
  return 'custom'
}
