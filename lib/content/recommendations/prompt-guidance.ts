/**
 * Shared recommendation PROMPT guidance + structured-output contract.
 *
 * Prompt-only quality lever: every route injects the same instruction block so a
 * strong Gemini model produces natural Hebrew, grounded, diverse topic ideas — and
 * returns them in one strict JSON schema. NOTHING here rewrites or post-processes
 * the model output; it only shapes the request. Concise on purpose so the rules
 * stay salient.
 */

/** The reasoning + quality instructions shared by all recommendation prompts. */
export function recommendationGuidance(langLabel: string, year: number, count: number): string {
  const he = /hebrew/i.test(langLabel)
  return [
    `Produce ${count} DISTINCT, specific article topics. Return ALL text in ${langLabel}.`,
    ``,
    `NATURAL LANGUAGE (critical):`,
    he
      ? `- Write fluent, native Hebrew. NEVER invent, shorten, abbreviate or corrupt a Hebrew word. Keep real words intact, e.g. דוגמיות (samples), רכישה (purchase), מאמר (article), בשמים (perfumes), קנייה, מבצע. Never output a corrupted form such as "דגים" for "דוגמיות", "שוקינג" for "רכישה/קנייה", or "ממואיר" for "מאמר".`
      : `- Write fluent, natural ${langLabel}. Never corrupt or abbreviate words.`,
    `- Preserve every product and brand name EXACTLY as supplied in the input. Do not invent a new transliteration; use the supplied Hebrew form when given, and the English form only where the name naturally requires it.`,
    `- All reasons and evidence summaries must be in ${langLabel}.`,
    ``,
    `ENTITY AWARENESS: classify each source as product | brand | collection/category | existing article | informational page | keyword opportunity, then choose a fitting topic type. Do NOT apply the same formula to every entity. Do NOT output "[brand]: generic title", "[brand] — טעויות נפוצות וטיפים", a broad brand article for a brand NOT present in the supplied corpus, or a product comparison unless BOTH products appear in the input.`,
    ``,
    `DIVERSITY: balance the set across brands, products, categories, comparisons, commercial guides, informational gaps, use-cases and audiences that the corpus actually supports. Avoid many slight variations of one brand, many identical search intents, and repeated title structures (especially "brand + colon"). A genuinely distinct second topic for the same brand is fine.`,
    ``,
    `EXISTING CONTENT: never propose a paraphrase of an existing article. Compare core question, intended answer, entity, search intent, audience and structure — a new topic needs a clearly different angle. E.g. given existing "המסע של וניל ממדגסקר לבקבוק הבושם שלך", "המסע של ניחוחות וניל והשפעתם על עולם הבישום" is NOT distinct, but "השוואה בין סוגי וניל בבישום" or "כיצד מפיקים תמצית וניל לבשמים" can be, when supported.`,
    ``,
    `GROUNDING: use ONLY facts and entities supplied in the input. Do NOT invent products for children, safety, limited editions, rarity, popularity, trends, historical impact, iconic status, seasonal suitability, longevity, ingredients, EDP/EDT variants, gender positioning, or comparisons unless the supplied corpus/keyword data supports them. Do NOT propose a topic merely because it could attract a new audience, the brand is generally popular, it is a common industry topic, or it sounds commercially useful. If there is no concrete supplied evidence, omit the idea.`,
    ``,
    `BRAND PRECISION: never match brands by one shared generic word (e.g. "Acqua di Parma" is NOT "Profumum Roma" just because a product contains "Acqua"). Keep "Tom Ford"/"טום פורד", "Borouj", "Ex Nihilo" exactly as supplied. Use only the exact entity data in the prompt.`,
    ``,
    `EDITORIAL QUALITY: do not let clichés become repeated templates — "המדריך המלא", "כל מה שצריך לדעת", "גלו את הסודות", "המסע אל", "הטרנד החם ביותר", "הטובים ביותר", "הבחירה המושלמת". Prefer a specific user question, a concrete comparison, clear selection criteria, or a specific content gap.`,
    ``,
    `YEAR & FRESHNESS: the current year is ${year}. Do NOT use ${year - 2} or any past year as a "current" recommendation year; prefer evergreen titles; use ${year} only when genuinely time-sensitive. Keep legitimate historical years intact (e.g. שנות ה-90, בין 2000 ל-2010, הושק בשנת 1985).`,
    ``,
    `REASONS & EVIDENCE: each reason must cite the REAL supplied evidence, in ${langLabel}. Good: "באתר קיימת קטגוריית טום פורד ומספר מוצרים של המותג, אך אין מאמר השוואתי ייעודי." NEVER expose internal labels: no "cluster 8", "popular brands", "multiple brands", "new audience", internal seed names, sourceContext, internal IDs or raw GIDs. If no concrete evidence exists, do not return the idea.`,
  ].join('\n')
}

/** A compact structured record of one already-pending suggestion (no DB ids). */
export interface PendingTopic {
  title: string
  primaryKeyword: string
  intent?: string
  secondaryKeywords?: string[]
  sourceEntityName?: string
}

/**
 * The ALREADY-PENDING context block + the mandatory Gemini duplicate self-check.
 * Sends each pending suggestion as {title, primaryKeyword, intent,
 * secondaryKeywords, sourceEntityName?} so the model can recognise a semantic
 * duplicate (synonyms / Hebrew↔English / restructured title) — the correction
 * happens INSIDE generation, not by post-hoc deletion. Empty when nothing is
 * pending. Bounded by `cap` (most-recent-first ordering is the caller's job).
 */
export function pendingTopicsBlock(pending: PendingTopic[], cap = 60): string {
  if (!pending || pending.length === 0) return ''
  const items = pending.slice(0, cap).map((p) => ({
    title: p.title,
    primaryKeyword: p.primaryKeyword,
    intent: p.intent || 'informational',
    secondaryKeywords: (p.secondaryKeywords || []).slice(0, 6),
    ...(p.sourceEntityName ? { sourceEntityName: p.sourceEntityName } : {}),
  }))
  return [
    `ALREADY-PENDING topics for this project — do NOT propose any of these again, and do NOT propose a paraphrase, synonym, translated or restructured version of them:`,
    JSON.stringify(items),
    `DUPLICATE SELF-CHECK (mandatory): before returning EACH idea, compare it against every existing and pending topic above. Treat two topics as duplicates when they would answer substantially the SAME user question — even when the wording differs, synonyms are used, Hebrew and English terms are mixed, or the title structure changes. These are the SAME topic and must NOT be duplicated: "שכבות בושם" / "שילוב בשמים" / "perfume layering"; "מה זה בושם נישה" / "מדריך למתחילים בבשמי נישה"; "איך לגרום לבושם להחזיק מעמד" / "שיפור עמידות הבושם"; "ריכוזי בושם" / "EDP מול EDT"; "בושם לעבודה" / "בושם למשרד"; two general guides explaining Oud (or Sandalwood).`,
    `A candidate is DISTINCT only when its core question, expected answer, search intent AND planned content sections are materially different — a rephrasing is NOT distinct. But do NOT over-block genuine depth: a materially different follow-up (e.g. "השוואה בין אוד טבעי לאקורד אוד סינתטי" vs a general Oud guide, or how a niche house develops a scent vs "מה זה בושם נישה") is allowed WHEN the supplied corpus supports it.`,
    `Internally decide which existing/pending topic each idea was compared against, but NEVER put that note — or any pending-context data — into the user-facing "reason" or "evidenceSummary".`,
  ].join('\n')
}

/** The strict JSON output contract appended to every recommendation prompt. */
export function structuredOutputContract(langLabel: string, count: number): string {
  return [
    `Return ONLY valid JSON — no markdown, no code fences, no commentary outside the JSON.`,
    `Shape: {"topics":[{`,
    `  "title": string (non-empty, natural ${langLabel}),`,
    `  "primaryKeyword": string (non-empty),`,
    `  "intent": "informational"|"commercial"|"comparison"|"transactional"|"local"|"other",`,
    `  "secondaryKeywords": string[],`,
    `  "reason": string (non-empty, ${langLabel}, cites supplied evidence),`,
    `  "sourceEntityName": string (the exact supplied entity this topic is about, or ""),`,
    `  "sourceEntityType": "product"|"brand"|"category"|"article"|"page"|"keyword"|"",`,
    `  "evidenceSummary": string (${langLabel}, one sentence referencing the supplied input)`,
    `}]}.`,
    `Return ${count} topics when the supplied corpus supports it; if it genuinely cannot support that many distinct grounded topics, return fewer — never invent filler.`,
  ].join('\n')
}
