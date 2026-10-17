/**
 * Template-based article-topic suggestions (Phase 2A UX).
 *
 * Produces natural-sounding SEO/GEO topic ideas from a keyword. Intentionally
 * simple and deterministic — NO AI provider. The signature is shaped so a
 * future AI-backed generator can replace the body without changing callers.
 */

import type { ContentLanguage } from './language'

/** Alias kept for the existing importers; the content language is one type. */
export type SuggestionLanguage = ContentLanguage
export type SuggestionIntent =
  | 'informational'
  | 'commercial'
  | 'local'
  | 'comparison'
  | 'transactional'
  | 'other'

/** Base templates that read naturally for most keywords. */
const HE_BASE = (kw: string): string[] => [
  `איך לבחור ${kw}?`,
  `${kw}: מה חשוב לבדוק לפני שקונים?`,
  `${kw} מומלץ — איך יודעים מה לבחור?`,
  `כמה עולה ${kw}?`,
  `טעויות נפוצות בבחירת ${kw}`,
  `${kw}: מדריך מלא למתחילים`,
]

const EN_BASE = (kw: string): string[] => [
  `How to choose ${kw}?`,
  `What should you know before choosing ${kw}?`,
  `${kw}: a complete beginner's guide`,
  `How much does ${kw} cost?`,
  `Common mistakes when choosing ${kw}`,
  `Best ${kw}: what should you compare?`,
]

const ES_BASE = (kw: string): string[] => [
  `¿Cómo elegir ${kw}?`,
  `${kw}: qué revisar antes de comprar`,
  `${kw}: guía completa para principiantes`,
  `¿Cuánto cuesta ${kw}?`,
  `Errores comunes al elegir ${kw}`,
  `Mejor ${kw}: ¿qué conviene comparar?`,
]

/** A couple of intent-flavoured extras so the list feels tailored. */
const HE_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: השוואה בין האפשרויות הפופולריות`, `מה ההבדל בין סוגי ${kw}?`],
  commercial: (kw) => [`${kw} — איך בוחרים נכון ולא מתחרטים?`, `על מה כדאי לשים דגש כשקונים ${kw}?`],
  local: (kw) => [`${kw}: איך בוחרים ספק מקומי אמין?`],
  transactional: (kw) => [`מתי כדאי להזמין ${kw} — וממי?`],
  informational: (kw) => [`כל מה שחשוב לדעת על ${kw}`],
}

const EN_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: comparing the popular options`, `What's the difference between types of ${kw}?`],
  commercial: (kw) => [`${kw} — how to choose the right one`, `What to look for when buying ${kw}`],
  local: (kw) => [`${kw}: how to pick a trustworthy local provider`],
  transactional: (kw) => [`When (and where) should you order ${kw}?`],
  informational: (kw) => [`Everything you need to know about ${kw}`],
}

const ES_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: comparación de las opciones más populares`, `¿Qué diferencia hay entre los tipos de ${kw}?`],
  commercial: (kw) => [`${kw} — cómo elegir bien y no arrepentirse`, `¿En qué fijarse al comprar ${kw}?`],
  local: (kw) => [`${kw}: cómo elegir un proveedor local de confianza`],
  transactional: (kw) => [`¿Cuándo conviene pedir ${kw} — y a quién?`],
  informational: (kw) => [`Todo lo que hay que saber sobre ${kw}`],
}

const BASE: Record<SuggestionLanguage, (kw: string) => string[]> = { he: HE_BASE, en: EN_BASE, es: ES_BASE }
const INTENT: Record<SuggestionLanguage, Partial<Record<SuggestionIntent, (kw: string) => string[]>>> =
  { he: HE_INTENT, en: EN_INTENT, es: ES_INTENT }

/**
 * Return up to `max` distinct, natural topic suggestions for a keyword.
 * Returns [] for an empty keyword.
 */
export function suggestTopics(
  keyword: string,
  language: SuggestionLanguage,
  intent: SuggestionIntent = 'commercial',
  max = 8
): string[] {
  const kw = keyword.trim()
  if (!kw) return []

  const base = BASE[language](kw)
  const intentExtra = INTENT[language][intent]?.(kw) ?? []

  // Intent-flavoured topics first so the list feels tailored, then the base set.
  const seen = new Set<string>()
  const out: string[] = []
  for (const topic of [...intentExtra, ...base]) {
    const key = topic.trim().toLowerCase()
    if (!key || seen.has(key)) continue
    seen.add(key)
    out.push(topic)
    if (out.length >= max) break
  }
  return out
}
