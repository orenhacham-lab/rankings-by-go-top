/**
 * PREVIEW-ONLY diagnostic domain fingerprints for the cross-project contamination
 * incident. OBSERVATION ONLY — these flags NEVER modify output, reject candidates,
 * affect ranking, or enter a Gemini prompt. They classify a piece of text
 * (a prompt section, a response, a bundle) by which business domain its vocabulary
 * belongs to, so a trace can show WHERE foreign-domain content entered a run.
 *
 * Multi-signal by design (section K): a domain is flagged only when ≥2 DISTINCT
 * domain terms appear, so one incidental overlapping word never trips it.
 */

import { createHash } from 'crypto'

export type Domain = 'perfume' | 'lighting' | 'pet' | 'freelancer'

/** Distinct, lowercased signal terms per domain (Hebrew + English). Not exhaustive
 *  — enough to fingerprint a batch. Never fed to any model. */
const DOMAIN_VOCAB: Record<Domain, string[]> = {
  perfume: ['בושם', 'בשמים', 'בשמי', 'ניחוח', 'ניחוחות', 'בישום', 'אוד', 'oud', 'edp', 'edt', 'וניל', 'מוסק', 'musk', 'לבונה', 'frankincense', 'amouage', 'creed', 'sandalwood', 'perfume', 'fragrance', 'maceration', 'מקרציה', 'שכבות בושם', 'acqua di parma', 'ex nihilo', 'guerlain', 'nishane', 'xerjoff'],
  lighting: ['תאורה', 'מנורה', 'מנורות', 'נורה', 'נורות', 'גוף תאורה', 'גופי תאורה', 'לד', 'קלווין', 'kelvin', 'lumen', 'לומן', 'cri', 'ip', 'lighting', 'luminaire', 'ceiling light', 'צמוד תקרה', 'שנדליר', 'chandelier'],
  pet: ['כלב', 'כלבים', 'חתול', 'חתולים', 'dog', 'cat', 'pet', 'רצועה', 'קולר', 'מזון לכלבים', 'chew', 'עצם', 'kennel', 'מלונה', 'וטרינר'],
  freelancer: ['פרילנסר', 'freelancer', 'מתכנת', 'פיתוח תוכנה', 'software', 'developer', 'seo', 'ux', 'שיווק דיגיטלי', 'digital marketing', 'קידום אתרים', 'נגישות', 'accessibility', 'wordpress', 'shopify', 'woocommerce', 'core web vitals', 'עצמאי', 'משווק'],
}

/** Count of DISTINCT domain terms present in the text. */
function domainHits(text: string, domain: Domain): number {
  const hay = (text || '').toLowerCase()
  let n = 0
  for (const term of DOMAIN_VOCAB[domain]) if (hay.includes(term.toLowerCase())) n++
  return n
}

export interface DomainFlags { perfume: boolean; lighting: boolean; pet: boolean; freelancer: boolean }

/** Multi-signal domain flags for a piece of text (≥2 distinct terms → flagged). */
export function domainFlags(text: string): DomainFlags {
  return {
    perfume: domainHits(text, 'perfume') >= 2,
    lighting: domainHits(text, 'lighting') >= 2,
    pet: domainHits(text, 'pet') >= 2,
    freelancer: domainHits(text, 'freelancer') >= 2,
  }
}

/** The domains flagged for a text, as a compact list (diagnostics). */
export function flaggedDomains(text: string): Domain[] {
  const f = domainFlags(text)
  return (Object.keys(f) as Domain[]).filter((d) => f[d])
}

/** True when the text mixes ≥2 incompatible business domains (contamination). */
export function isCrossDomain(text: string): boolean {
  return flaggedDomains(text).length >= 2
}

/** Deterministic short fingerprint of normalized text — for correlating prompt/
 *  response sections across a run WITHOUT exposing raw content. */
export function fingerprint(text: string): string {
  const norm = (text || '').replace(/\s+/g, ' ').trim().toLowerCase()
  return createHash('sha256').update(norm).digest('hex').slice(0, 16)
}
