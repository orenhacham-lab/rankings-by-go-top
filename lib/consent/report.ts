'use client'

/**
 * SENDING A DECISION TO THE CONSENT LOG — fire-and-forget, never blocking.
 *
 * GDPR Art. 7(1) puts the burden of PROOF on us: if a visitor or a regulator
 * asks, we have to be able to show what this person was shown and what they
 * chose. localStorage is the visitor's copy and they can clear it, so the proof
 * lives server-side too (app/api/consent/route.ts).
 *
 * It must never get in the visitor's way: the banner closes and the choice
 * applies the moment the button is pressed, and this call happens after, with
 * `keepalive` so a decision made just before a navigation still arrives. A
 * failure is swallowed — a visitor is not shown an error because our audit
 * trail had a bad minute, and a refusal is still honoured locally.
 */
import type { ConsentLocale, ConsentRecord } from './categories'

export function reportConsent(record: ConsentRecord, locale: ConsentLocale): void {
  const body = JSON.stringify({
    consentId: record.id,
    policyVersion: record.policy,
    action: record.action,
    categories: record.categories,
    decidedAt: record.at,
    locale,
    path: typeof window !== 'undefined' ? window.location.pathname.slice(0, 300) : null,
  })
  try {
    void fetch('/api/consent', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body,
      keepalive: true,
      cache: 'no-store',
    }).catch(() => { /* the visitor's choice is already applied */ })
  } catch { /* fetch unavailable */ }
}
