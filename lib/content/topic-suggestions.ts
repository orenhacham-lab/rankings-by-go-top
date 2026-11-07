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

const PT_BASE = (kw: string): string[] => [
  `Como escolher ${kw}?`,
  `${kw}: o que conferir antes de contratar`,
  `${kw}: guia completo para iniciantes`,
  `Quanto custa ${kw}?`,
  `Erros comuns ao escolher ${kw}`,
  `Melhor ${kw}: o que vale a pena comparar?`,
]

const FR_BASE = (kw: string): string[] => [
  `Comment choisir ${kw} ?`,
  `${kw} : que vérifier avant de vous décider`,
  `${kw} : le guide complet pour débuter`,
  `Combien coûte ${kw} ?`,
  `Les erreurs fréquentes au moment de choisir ${kw}`,
  `Meilleur ${kw} : qu'est-ce qu'il vaut la peine de comparer ?`,
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


const PT_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: comparação das opções mais populares`, `Qual é a diferença entre os tipos de ${kw}?`],
  commercial: (kw) => [`${kw} — como escolher bem e não se arrepender`, `No que prestar atenção ao contratar ${kw}?`],
  local: (kw) => [`${kw}: como escolher um fornecedor local de confiança`],
  transactional: (kw) => [`Quando vale a pena pedir ${kw} — e de quem?`],
  informational: (kw) => [`Tudo o que você precisa saber sobre ${kw}`],
}

const FR_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw} : la comparaison des options les plus courantes`, `Quelle est la différence entre les types de ${kw} ?`],
  commercial: (kw) => [`${kw} — comment bien choisir et ne pas le regretter`, `À quoi faire attention quand vous achetez ${kw} ?`],
  local: (kw) => [`${kw} : comment choisir un prestataire local de confiance`],
  transactional: (kw) => [`Quand faut-il commander ${kw} — et à qui ?`],
  informational: (kw) => [`Tout ce qu'il faut savoir sur ${kw}`],
}

const IT_BASE = (kw: string): string[] => [
  `Come scegliere ${kw}?`,
  `${kw}: che cosa verificare prima di decidere`,
  `${kw}: la guida completa per iniziare`,
  `Quanto costa ${kw}?`,
  `Gli errori più frequenti nella scelta di ${kw}`,
  `Il miglior ${kw}: che cosa vale la pena confrontare?`,
]

const IT_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: il confronto tra le opzioni più diffuse`, `Qual è la differenza tra i tipi di ${kw}?`],
  commercial: (kw) => [`${kw} — come scegliere bene senza pentirsene`, `A che cosa prestare attenzione nell’acquisto di ${kw}?`],
  local: (kw) => [`${kw}: come scegliere un fornitore locale affidabile`],
  transactional: (kw) => [`Quando conviene ordinare ${kw} — e da chi?`],
  informational: (kw) => [`Tutto quello che è utile sapere su ${kw}`],
}

// JAPANESE. No particle is inserted before the keyword beyond the one the
// sentence itself needs, and no space anywhere: a Japanese title that carried a
// space between the keyword and the next word would read as a typo.
const JA_BASE = (kw: string): string[] => [
  `${kw}の選び方`,
  `${kw}を決める前に確認しておきたいこと`,
  `${kw}の基本がわかる完全ガイド`,
  `${kw}の費用はいくらかかるのか`,
  `${kw}選びでよくある失敗`,
  `おすすめの${kw}：比較しておきたいポイント`,
]

const JA_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}：主な選択肢の比較`, `${kw}の種類ごとの違いとは`],
  commercial: (kw) => [`${kw} — 後悔しない選び方`, `${kw}を購入する際に注意したい点`],
  local: (kw) => [`${kw}：信頼できる地元の業者の選び方`],
  transactional: (kw) => [`${kw}はいつ、どこに依頼するのがよいのか`],
  informational: (kw) => [`${kw}について知っておきたいこと`],
}

// DUTCH. u-form, common nouns in LOWER CASE (the opposite of the German block
// below, and the thing a translator gets wrong first), and the colon-subtitle
// shape a Dutch SEO headline actually uses ("Zoekwoord: waar het op aankomt").
const NL_BASE = (kw: string): string[] => [
  `Hoe kiest u ${kw} goed?`,
  `${kw}: wat u voor uw beslissing moet nagaan`,
  `${kw}: de complete gids om te beginnen`,
  `Wat kost ${kw}?`,
  `De meest gemaakte fouten bij het kiezen van ${kw}`,
  `Beste ${kw}: wat is de moeite waard om te vergelijken?`,
]

const NL_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: de vergelijking van de gangbare opties`, `Waarin verschillen de soorten ${kw}?`],
  commercial: (kw) => [`${kw} — goed kiezen en er geen spijt van krijgen`, `Waar moet u op letten bij de aankoop van ${kw}?`],
  local: (kw) => [`${kw}: zo vindt u een betrouwbare aanbieder in de buurt`],
  transactional: (kw) => [`Wanneer moet u ${kw} bestellen — en bij wie?`],
  informational: (kw) => [`Alles wat u over ${kw} moet weten`],
}

// GERMAN. Sie-form, nouns capitalized, and the colon-subtitle shape a German
// SEO headline actually uses ("Keyword: worauf es ankommt").
const DE_BASE = (kw: string): string[] => [
  `Wie wählt man ${kw} richtig aus?`,
  `${kw}: Was Sie vor der Entscheidung prüfen sollten`,
  `${kw}: der komplette Leitfaden für den Einstieg`,
  `Was kostet ${kw}?`,
  `Die häufigsten Fehler bei der Auswahl von ${kw}`,
  `Beste ${kw}: Was lohnt sich zu vergleichen?`,
]

const DE_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: der Vergleich der gängigen Optionen`, `Worin unterscheiden sich die Arten von ${kw}?`],
  commercial: (kw) => [`${kw} — richtig wählen und es nicht bereuen`, `Worauf sollten Sie beim Kauf von ${kw} achten?`],
  local: (kw) => [`${kw}: So finden Sie einen verlässlichen Anbieter vor Ort`],
  transactional: (kw) => [`Wann sollten Sie ${kw} bestellen — und bei wem?`],
  informational: (kw) => [`Alles, was Sie über ${kw} wissen sollten`],
}

// POLISH. Every frame keeps the keyword in the NOMINATIVE in front of a colon,
// because the keyword arrives undeclined and Polish would need it in the
// genitive or the locative inside a sentence ("wybór <kw>", "o <kw>"). The
// colon-subtitle shape is what a Polish SEO headline uses anyway, so this is
// the natural form and not a workaround that reads like one.
const PL_BASE = (kw: string): string[] => [
  `${kw}: jak wybrać dobrze?`,
  `${kw}: co sprawdzić przed decyzją`,
  `${kw}: kompletny przewodnik na start`,
  `${kw}: ile to kosztuje?`,
  `${kw}: najczęstsze błędy przy wyborze`,
  `${kw}: co warto porównać?`,
]

const PL_INTENT: Partial<Record<SuggestionIntent, (kw: string) => string[]>> = {
  comparison: (kw) => [`${kw}: porównanie popularnych opcji`, `${kw}: czym różnią się rodzaje?`],
  commercial: (kw) => [`${kw}: wybrać dobrze i nie żałować`, `${kw}: na co zwrócić uwagę przy zakupie?`],
  local: (kw) => [`${kw}: jak znaleźć rzetelnego wykonawcę w okolicy`],
  transactional: (kw) => [`${kw}: kiedy zamówić i u kogo?`],
  informational: (kw) => [`${kw}: wszystko, co warto wiedzieć`],
}

const BASE: Record<SuggestionLanguage, (kw: string) => string[]> = { he: HE_BASE, en: EN_BASE, es: ES_BASE, 'pt-BR': PT_BASE, fr: FR_BASE, it: IT_BASE, ja: JA_BASE, de: DE_BASE, nl: NL_BASE, pl: PL_BASE }
const INTENT: Record<SuggestionLanguage, Partial<Record<SuggestionIntent, (kw: string) => string[]>>> =
  { he: HE_INTENT, en: EN_INTENT, es: ES_INTENT, 'pt-BR': PT_INTENT, fr: FR_INTENT, it: IT_INTENT, ja: JA_INTENT, de: DE_INTENT, nl: NL_INTENT, pl: PL_INTENT }

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
