'use client'

/**
 * WHERE THE VISITOR'S DECISION LIVES IN THE BROWSER, and how it is read back.
 *
 * localStorage, under one key, holding one ConsentRecord. Three rules the rest
 * of the app depends on:
 *
 *  - Every read and write is wrapped: in a private window, with site data
 *    blocked, or inside an embedded webview, the accessor THROWS. A throw must
 *    read as "no decision yet" (so the visitor is asked) and never as consent.
 *  - A record written against an older CONSENT_POLICY_VERSION, or with an
 *    unknown schema version, is treated as no decision. The visitor is asked
 *    again rather than counted as agreeing to a disclosure they never saw.
 *  - The legacy key `cookie-consent-accepted` from the accept-only banner is
 *    deliberately NOT migrated into a grant. That click was made under a notice
 *    that said continued browsing was agreement and offered no way to refuse,
 *    so it is not valid consent under GDPR Art. 4(11) and cannot be carried
 *    forward. It is removed on first load and the visitor is asked properly.
 */
import {
  CONSENT_DENIED,
  CONSENT_POLICY_VERSION,
  normalizeChoices,
  type ConsentAction,
  type ConsentChoices,
  type ConsentRecord,
} from './categories'

export const CONSENT_STORAGE_KEY = 'gotop-consent'
export const LEGACY_CONSENT_KEY = 'cookie-consent-accepted'

/** Fired on `window` after every save, so every mount re-reads one source. */
export const CONSENT_CHANGED_EVENT = 'gotop:consent-changed'

/**
 * Global Privacy Control. A browser or extension setting the visitor turned on
 * to mean "do not sell or share my personal information" — the signal the
 * California CPPA regulations and several other US state laws require a
 * business to honour, and which the EDPB treats as a valid objection. When it
 * is on we do not even show the banner as a chance to opt in: nothing optional
 * loads, and the refusal is recorded with action `gpc`.
 */
export function globalPrivacyControl(): boolean {
  if (typeof navigator === 'undefined') return false
  return (navigator as Navigator & { globalPrivacyControl?: boolean }).globalPrivacyControl === true
}

export function readConsent(): ConsentRecord | null {
  if (typeof window === 'undefined') return null
  let raw: string | null = null
  try {
    raw = window.localStorage.getItem(CONSENT_STORAGE_KEY)
  } catch {
    return null // storage blocked: no decision on record, so ask
  }
  if (!raw) return null
  try {
    const parsed = JSON.parse(raw) as Partial<ConsentRecord>
    if (parsed?.v !== 1) return null
    if (parsed.policy !== CONSENT_POLICY_VERSION) return null
    if (typeof parsed.id !== 'string' || typeof parsed.at !== 'string') return null
    return {
      v: 1,
      id: parsed.id,
      policy: parsed.policy,
      action: (parsed.action ?? 'custom') as ConsentAction,
      categories: normalizeChoices(parsed.categories),
      at: parsed.at,
    }
  } catch {
    return null // unreadable: ask again rather than guess
  }
}

/** The choices in force right now. Denied whenever there is no valid record. */
export function currentChoices(): ConsentChoices {
  return readConsent()?.categories ?? CONSENT_DENIED
}

function newId(): string {
  try {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID()
  } catch { /* fall through to the arithmetic id below */ }
  return `c-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`
}

/**
 * Persist a decision and announce it. Returns the record even when storage
 * refused the write, because the caller still has to apply it to this page view
 * and still has to log it — a visitor with storage blocked gets their choice
 * honoured for the session, and is asked again on the next visit.
 */
export function writeConsent(action: ConsentAction, choices: ConsentChoices): ConsentRecord {
  const record: ConsentRecord = {
    v: 1,
    id: readConsent()?.id ?? newId(),
    policy: CONSENT_POLICY_VERSION,
    action,
    categories: normalizeChoices(choices),
    at: new Date().toISOString(),
  }
  try {
    window.localStorage.setItem(CONSENT_STORAGE_KEY, JSON.stringify(record))
    window.localStorage.removeItem(LEGACY_CONSENT_KEY)
  } catch { /* storage blocked: honoured for this session only */ }
  try {
    window.dispatchEvent(new CustomEvent(CONSENT_CHANGED_EVENT, { detail: record }))
  } catch { /* no CustomEvent: the mount that saved has already re-rendered */ }
  return record
}

/** Drop the stale accept-only flag so it can never be mistaken for a decision. */
export function clearLegacyConsent(): void {
  try {
    window.localStorage.removeItem(LEGACY_CONSENT_KEY)
  } catch { /* nothing to clear */ }
}
